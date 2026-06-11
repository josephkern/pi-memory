# pi (pi.dev / badlogic/pi-mono) — Extension API and Directory Conventions

> Status: claims marked **[verified]** passed adversarial verification (2-0/3-0 votes) in the research workflow; claims marked **[doc-confirmed]** were independently confirmed by direct fetch of the cited primary doc on 2026-06-11. No claims here are unverified.

Primary sources:
- [packages/coding-agent/README.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [packages/coding-agent/docs/extensions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [packages/coding-agent/docs/settings.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/settings.md)
- [packages/coding-agent/examples/extensions/README.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/README.md)

## Extension shape

**[verified]** A pi extension is a TypeScript module whose **default export is a factory function receiving an `ExtensionAPI` object**, imported from `@earendil-works/pi-coding-agent`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", /* ... */ });
  pi.registerCommand("stats", { /* ... */ });
  pi.on("tool_call", async (event, ctx) => { /* ... */ });
}
```

**[doc-confirmed]** The factory "can be synchronous or asynchronous. If the factory returns a Promise, pi awaits it before continuing startup. That means async initialization completes before `session_start`, before `resources_discover`, and before provider registrations."

**[verified]** Extension capabilities explicitly include: custom tools, slash commands, keyboard shortcuts, event handlers, UI components, custom compaction/summarization, permission gates, sub-agents, and replacing built-in tools.

## Lifecycle events

**[doc-confirmed]** Full event list from `docs/extensions.md`:

`project_trust`, `session_start`, `resources_discover`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, `session_shutdown`, `before_agent_start`, `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `context`, `before_provider_request`, `after_provider_response`, `model_select`, `thinking_level_select`, `tool_call`, `tool_result`, `user_bash`, `input`.

Events most relevant to a memory extension:

| Event | What it allows |
|---|---|
| `session_start` | Reasons: `"startup"`, `"reload"`, `"new"`, `"resume"`, `"fork"`. Load/reconstruct memory state. **[doc-confirmed]** |
| `before_agent_start` | Receives `event.systemPrompt` (chainable across extensions); return `{ systemPrompt: event.systemPrompt + "..." }` to append memory/instructions. **[doc-confirmed]** |
| `context` | "Fired before each LLM call. Modify messages non-destructively" by returning `{ messages: filtered }` — per-call memory injection point. **[doc-confirmed]** |
| `session_before_compact` / `session_compact` | Extensions can `return { cancel: true }` or supply custom summaries via the `compaction` property — natural **memory-write point** before lossy compaction. **[doc-confirmed]** |
| `tool_call` / `tool_result` | `tool_call` handlers can `return { block: true, reason: "..." }`; observe activity to learn facts worth remembering. **[doc-confirmed]** |
| `session_shutdown` | End-of-session memory flush. **[doc-confirmed]** |

**[verified]** Compaction is exercised in shipped examples: `custom-compaction.ts` (fully custom compaction summarizing the conversation) and `trigger-compact.ts` (programmatically triggers compaction past 100k tokens, adds `/trigger-compact` command).

## State persistence primitives

**[doc-confirmed]** `pi.appendEntry()` exists: "Persist extension state (does NOT participate in LLM context)" — e.g. `pi.appendEntry("my-state", { count: 42 })`. Recovery: iterate session entries on `session_start` and reconstruct from `entry.data`.

**[verified]** The documented pattern for tool-driven state is to put it in the tool result's `details` field (persisted in the session JSONL, fork-safe) and rebuild on `session_start` via `ctx.sessionManager.getBranch()`.

**Key consequence:** both mechanisms are **session-scoped** (they live in the session JSONL). Cross-session persistent memory needs its own storage on disk — that's the gap this extension fills.

**[verified]** Sessions auto-save as JSONL to `~/.pi/agent/sessions/`, organized by working directory, with `id`/`parentId` tree structure enabling branching. Built-in compaction is lossy in context but the full history remains in the JSONL file.

**[verified]** `pi.sendMessage()` injects custom messages without triggering the LLM; `pi.sendUserMessage()` sends real user messages.

## Directory layout & scoping (the conventions to respect)

### Settings — exactly two scopes

**[verified]**

| File | Scope |
|---|---|
| `~/.pi/agent/settings.json` | Global (all projects) |
| `.pi/settings.json` | Project — **overrides global; nested objects are merged, not replaced** |

### Resource discovery

**[verified / doc-confirmed]**

| Resource | Global | Project |
|---|---|---|
| Extensions (auto-discovery) | `~/.pi/agent/extensions/*.ts`, `~/.pi/agent/extensions/*/index.ts` | `.pi/extensions/*.ts`, `.pi/extensions/*/index.ts` |
| Packages (npm) | `~/.pi/agent/npm/` | `.pi/npm/` (via `pi install -l`) |
| Packages (git) | `~/.pi/agent/git/` | `.pi/git/` (via `pi install -l`) |

- **[verified]** Settings `Resources` arrays: `extensions`, `skills`, `prompts`, `themes`, `packages`. Paths in `~/.pi/agent/settings.json` resolve relative to `~/.pi/agent`; paths in `.pi/settings.json` resolve relative to `.pi`. Absolute paths and `~` work. Arrays support globs, `!pattern` exclusions, `+path` force-include, `-path` force-exclude.
- **[verified]** Install with `pi install npm:<pkg>` / `pi install git:<url>`; without a `pi` manifest in `package.json`, pi auto-discovers conventional directories (`extensions/`, `skills/`, `prompts/`, `themes/`).
- **[verified]** One-off loading: `pi --extension path/to/ext.ts`.

### Trust model

**[verified / doc-confirmed]** Project-local `.pi/` resources are gated behind a trust prompt recorded in `~/.pi/agent/trust.json`: "Trusting a project allows pi to load `.pi/settings.json` and `.pi` resources, install missing project packages, and execute project extensions." Project-local extensions "load only after the project is trusted."

### Existing persistent-instruction mechanism (must coexist with it)

**[verified]** pi already loads `AGENTS.md` (or `CLAUDE.md`) at startup from:
1. `~/.pi/agent/AGENTS.md` (global)
2. Parent directories, walking up from cwd
3. Current directory

All matching files are **concatenated**. Disable with `--no-context-files`.

### Compaction settings (token-budget context)

**[verified]**

| Setting | Default | Meaning |
|---|---|---|
| `compaction.enabled` | `true` | Auto-compaction on/off |
| `compaction.reserveTokens` | `16384` | Tokens reserved for LLM response |
| `compaction.keepRecentTokens` | `20000` | Recent tokens kept unsummarized |

## Design-relevant takeaways

1. **Scoping pattern to mirror:** global `~/.pi/agent/<thing>` vs project `.pi/<thing>`, project overrides/extends global, project side gated by trust. A memory extension should store global (user) memory under `~/.pi/agent/` and project memory under `.pi/` (or a per-project directory under `~/.pi/agent/` keyed by project path, like sessions — design decision to make).
2. **Injection points:** `before_agent_start` for session-start memory injection into the system prompt; `context` for per-call adjustment.
3. **Write points:** `session_before_compact` (capture before lossy compaction), `session_shutdown`, and/or an explicit `remember` tool registered via `pi.registerTool`.
4. **Cross-session storage is on us:** `appendEntry`/`details` are session-JSONL-scoped only.
5. **Don't collide with AGENTS.md:** that channel is user-authored instructions; memory should be a separate, agent-written store (the same split Claude Code makes — see `03-prior-art.md`).
