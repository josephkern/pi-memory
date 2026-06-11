# pi API Details (gap-fill, read directly from pi-mono docs 2026-06-11)

Full primary sources fetched from `badlogic/pi-mono` `packages/coding-agent/docs/`: `extensions.md` (2,656 lines), `skills.md`, `packages.md`, `compaction.md`, `session-format.md`. This file records only what `02-pi-extension-api.md` didn't already cover and the design doc needs.

## Extension runtime facts

- Extensions are loaded via **jiti** — TypeScript runs without a compile step. Node.js built-ins (`node:fs`, `node:path`) are available; npm deps work if a `package.json` sits next to the extension (or in a parent dir) with `node_modules/` installed.
- Bundled imports available to extensions: `@earendil-works/pi-coding-agent` (types, helpers), `typebox` (tool schemas), `@earendil-works/pi-ai` (`StringEnum` — required instead of `Type.Union` of literals for Google API compatibility), `@earendil-works/pi-tui` (custom rendering). If a distributed package imports these, they go in `peerDependencies` with `"*"` and must not be bundled.
- Extensions in auto-discovered locations (`~/.pi/agent/extensions/`, `.pi/extensions/`) can be hot-reloaded with `/reload`. `pi -e ./path.ts` is for quick tests.
- Extension reload/session lifecycle: on `/new`, `/resume`, fork, and `/reload`, pi emits `session_shutdown`, tears the extension instance down, reloads, then emits `session_start` with the appropriate reason. In-memory state must be reestablished in `session_start`.

## `before_agent_start` (memory injection point)

```ts
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt, event.images
  // event.systemPrompt — chained across extensions
  // event.systemPromptOptions — structured prompt inputs:
  //   .contextFiles (loaded AGENTS.md files), .skills, .selectedTools,
  //   .customPrompt, .appendSystemPrompt, .promptGuidelines, .cwd
  return {
    message: { customType: "my-ext", content: "...", display: true }, // persistent message, sent to LLM
    systemPrompt: event.systemPrompt + "\n\n...",                      // per-turn system prompt change
  };
});
```

Notes: fires **per user prompt** (not once per session). `systemPromptOptions.contextFiles` lets the extension see which AGENTS.md files are already loaded (dedup opportunity). The system-prompt change is per-turn and chained; the `message` form is persisted in the session.

## Tool registration details

- `registerTool` accepts `promptSnippet` (one-line entry in the system prompt's "Available tools") and `promptGuidelines` (bullets appended to the Guidelines section while the tool is active — each bullet must name the tool explicitly).
- `execute(toolCallId, params, signal, onUpdate, ctx)` returns `{ content, details }`; **throw** to signal errors; `details` is persisted in the session and used for state reconstruction.
- Tools that mutate files must wrap the whole read-modify-write in `withFileMutationQueue(absolutePath, fn)` — tool calls run in parallel by default and unqueued writes can be lost.
- Tools **must truncate output**: built-in limit 50KB / 2000 lines; helpers `truncateHead`/`truncateTail`, `DEFAULT_MAX_BYTES`, `DEFAULT_MAX_LINES` are exported.
- `prepareArguments(args)` (optional) runs before validation — compatibility shim for resuming old sessions after a schema change.

## Commands, context, misc API

- `registerCommand(name, { description, handler(args, ctx), getArgumentCompletions })`. Command handlers get `ExtensionCommandContext` (adds `waitForIdle()`, `newSession()`, `fork()`, `switchSession()`, `reload()`, `getSystemPromptOptions()`).
- `ctx.isProjectTrusted()` — gate for honoring project-local configuration.
- `ctx.cwd`, `ctx.hasUI`, `ctx.mode` (`"tui" | "rpc" | "json" | "print"`), `ctx.ui.notify/confirm/select/input`, `ctx.ui.setStatus/setWidget`.
- `ctx.getContextUsage()` → current token usage; `ctx.compact({ customInstructions, onComplete, onError })` triggers compaction.
- `pi.appendEntry(customType, data)` → `CustomEntry` in session JSONL (`type: "custom"`, not in LLM context). `pi.sendMessage({customType, content, display}, {deliverAs})` → `CustomMessageEntry` (**is** in LLM context).
- `pi.exec(cmd, args, opts)`, `pi.events` (inter-extension bus), `pi.registerShortcut`, `pi.registerFlag(name, {type, default})` + `pi.getFlag()`.

## Compaction internals (from compaction.md)

- Trigger: `contextTokens > contextWindow - reserveTokens` (default 16,384); cut point keeps ~`keepRecentTokens` (default 20,000) of recent messages, cutting at turn boundaries.
- `session_before_compact` event payload: `preparation.messagesToSummarize`, `.turnPrefixMessages`, `.previousSummary`, `.fileOps`, `.tokensBefore`, `.firstKeptEntryId`, `.settings`, plus `branchEntries` and `signal`.
- Helpers `convertToLlm()` + `serializeConversation()` turn `AgentMessage[]` into `[User]: ... / [Assistant]: ... / [Tool result]: ...` text for custom summarization (tool results truncated to 2,000 chars).
- Default summary format is structured markdown (Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context + read/modified file lists) — a memory extractor hooked on `session_before_compact` can mine `messagesToSummarize` *without* replacing the default summary by returning nothing (handler return only customizes/cancels; observation is free). `session_compact` fires after, with the saved entry.

## Skills (from skills.md) — adjacent mechanism, not a memory store

- Skills follow the agentskills.io standard: directory with `SKILL.md` (frontmatter `name`, `description`), loaded on demand — only name+description always in context (progressive disclosure).
- Locations: global `~/.pi/agent/skills/`, `~/.agents/skills/`; project `.pi/skills/`, `.agents/skills/` (trust-gated); packages; settings `skills` array; `--skill` flag.
- Relevance: a memory extension could *optionally* ship a companion skill describing memory-usage policy, but skills are static capability docs, not a writable store. Also note `resources_discover` lets extensions contribute skill/prompt/theme paths — **not** extension or arbitrary context paths.

## Packaging (from packages.md)

- A pi package is an npm/git repo with a `pi` manifest in `package.json` (`"pi": { "extensions": ["./src/index.ts"] }`) or conventional dirs (`extensions/`, `skills/`, `prompts/`, `themes/`). Add keyword `"pi-package"` for the pi.dev gallery; optional `image`/`video` preview fields.
- Install: `pi install npm:pkg` / `git:github.com/user/repo@ref` / local path; `-l` writes to `.pi/settings.json` (team-shared; pi auto-installs missing project packages on startup after trust). `pi remove`, `pi list`, `pi update`.
- Same package in global + project settings: **project entry wins** (identity: npm name / git URL sans ref / resolved path).

## Session entry types relevant to memory (from session-format.md)

- `CustomEntry` (`appendCustomEntry`) — extension state, not in context.
- `CustomMessageEntry` (`appendCustomMessageEntry` / `sendMessage`) — extension message, **in** context, with `display` flag.
- `CompactionEntry` / `BranchSummaryEntry` — carry `details` (default `{readFiles, modifiedFiles}`), extension-customizable.
- `SessionManager.list(cwd)` / `listAll()` enumerate session files.
