# pi-memory — Design

A pi extension that gives the agent **persistent, file-based memory** across sessions, with a global (user) scope and a project scope stored **in the repository**. Written in TypeScript against pi's `ExtensionAPI`.

Grounded in `docs/research/` (all cited facts verified against primary sources; see research README for provenance).

## 1. Goals

- The agent accumulates durable learnings (corrections, build commands, decisions, preferences) across sessions without the user writing anything.
- Memory is plain markdown: transparent, user-editable, diffable — the token-level memory form the literature identifies as dominant and most practical (research 01).
- Respect pi conventions exactly: global scope under `~/.pi/agent/`, project scope under `.pi/`, project honored only when trusted, project complements/overrides global (research 02).
- Bounded, predictable token cost per session.
- Coexist with — never replace or write to — the user-authored `AGENTS.md` channel.

**Non-goals (v1):** vector/embedding search, automatic LLM summary-merging (documented semantic-drift failure mode — research 01), automatic decay, cross-machine sync, MCP server.

## 2. Storage layout

Two scopes, mirroring pi's settings scoping (global `~/.pi/agent/settings.json` vs project `.pi/settings.json`):

```
~/.pi/agent/memory/            # GLOBAL: this user, all projects, machine-local
├── MEMORY.md                  # index — injected every session (capped)
├── <topic>.md                 # detail files — read on demand
└── archive/                   # stale content moved here, never deleted

<repo>/.pi/memory/             # PROJECT: in-repo, committed, shared with the team
├── MEMORY.md
├── <topic>.md
└── archive/
```

Design choices and rationale:

- **Index + topic files** (Claude Code auto-memory pattern, research 03): `MEMORY.md` is a concise index loaded at session start; topic files hold detail and are read on demand with pi's built-in `read` tool. This bounds injected tokens while leaving total memory unbounded.
- **Project memory is in-repo** (user decision). Consequences we accept and document: memory is shared via version control with the team, appears in diffs/PRs, and must be written with that audience in mind. The injected preamble tells the agent this. Users who want it private can gitignore `.pi/memory/`.
- **Archive over delete** (research 01: aggressive pruning erases rare-but-essential knowledge): stale content moves to `archive/`, which is never injected.
- Directories are created **lazily on first write**, never at startup — running pi in a random directory must not litter it with `.pi/memory/`.
- **Memory entry format** inside `MEMORY.md`: one bullet per fact under `##` topic headers; a fact that outgrows a bullet moves to a topic file and leaves a one-line pointer (`- [Build quirks](build.md) — sccache breaks -Werror`). No frontmatter or schema in v1 — discrete, explicit units are the point; structure stays human-first.

## 3. Read path: injection

Hook: **`before_agent_start`** (fires per user prompt; system-prompt changes chain across extensions — research 04).

```ts
pi.on("before_agent_start", async (event, ctx) => {
  const block = buildMemoryBlock(ctx); // global index + project index (if trusted), capped
  if (!block) return;
  return { systemPrompt: event.systemPrompt + "\n\n" + block };
});
```

- **Order:** preamble → global index → project index. More specific scope last, matching pi's project-overrides-global semantics and Claude Code's load order (research 02, 03).
- **Caps:** per scope, first **200 lines or 8 KiB** of `MEMORY.md`, whichever is hit first (Claude Code uses 200 lines / 25 KB for one scope; Codex caps all instruction files at 32 KiB — research 03). Content beyond the cap is not injected; `/memory` warns when a file exceeds it.
- **Trust:** the project index is read only when `ctx.isProjectTrusted()` returns true (research 04). Untrusted directory ⇒ global memory only, and the preamble omits the project section entirely.
- Files are re-read on each `before_agent_start` with an mtime cache, so user edits take effect on the next prompt without `/reload`. The block is byte-stable when files haven't changed — deterministic content keeps the prompt cache-friendly (the Aider lesson, research 03).
- Injecting via `systemPrompt` rather than a session message keeps memory out of the message log and means it survives compaction automatically (it is re-appended every turn; compare Claude Code re-injecting CLAUDE.md after `/compact` — research 03).

### Injected block (sketch)

```markdown
## Persistent memory

You have file-based persistent memory, separate from AGENTS.md (which is user-authored — never write memory there).

- Global memory (this user, all projects): ~/.pi/agent/memory/
- Project memory (committed to the repo, shared with the team): .pi/memory/

Each scope has a MEMORY.md index (shown below) plus topic files you can read with `read` when relevant.

When you learn something durable — a correction from the user, a build/test command, a
non-obvious constraint, a decision and its rationale — save it by editing the appropriate
MEMORY.md or topic file with `edit`/`write`. Rules:
- Check the index first: update an existing entry rather than adding a duplicate.
- Delete entries that turn out to be wrong; move merely-stale content to archive/.
- Keep MEMORY.md a concise index (one line per fact); put detail in topic files.
- Project memory is read by your teammates: factual, professional, no secrets.
- Don't save what the repo already records (code, git history, AGENTS.md).

### Global MEMORY.md
<contents…>

### Project MEMORY.md  (.pi/memory/MEMORY.md)
<contents…>
```

## 4. Write path: built-in file tools, not a custom tool

The agent writes memory with pi's built-in `edit`/`write` tools, steered by the preamble above. No custom `memory` tool in v1.

Rationale:
- Project memory lives in the repo and global memory at a stable absolute path — built-in tools already handle both, with diff rendering, parallel-write safety (`withFileMutationQueue` inside built-ins), and full visibility in the tool log.
- This is the proven Claude Code approach (research 03): the agent maintains its own markdown with standard file tools.
- A structured tool adds schema, rendering, session-resume compatibility (`prepareArguments`) and truncation obligations (research 04) for no v1 benefit. Reconsidered in v2 if steering proves unreliable.

**Append-discrete-facts, not summary-merging:** the preamble never asks the model to rewrite the whole index from scratch — incremental LLM re-summarization is the documented drift failure of early MemGPT/Mem0 (research 01). Edits are local: add a bullet, fix a bullet, move a section to archive.

## 5. User surface: `/memory` command

`pi.registerCommand("memory", …)` — works in TUI and RPC (guard dialogs with `ctx.hasUI`):

- `/memory` — show both scopes: file list, per-file size, injected vs capped bytes, trust state, and absolute paths (so the user can open them).
- `/memory off | on` — toggle injection for the current session (in-memory flag; nothing written).
- Also `pi.registerFlag("no-memory", { type: "boolean", default: false })` to start with injection disabled.

Everything else is file management the user can do in their editor — by design.

## 6. Lifecycle & edge cases

| Concern | Handling |
|---|---|
| Session fork / `/resume` / `/new` / `/reload` | Extension is stateless between prompts (files re-read each `before_agent_start`); nothing to reconstruct in `session_start`. No `pi.appendEntry` state — session-scoped persistence is the wrong layer for cross-session memory (research 02). |
| Compaction | No interception in v1. Memory survives compaction because it's re-appended to the system prompt every turn. `session_before_compact` observation is a v2 write-trigger (see roadmap). |
| Untrusted project | Project scope fully inert: not read, not mentioned in the preamble, never created. |
| `print` / `rpc` / `json` modes | Injection works identically (no UI dependency); `/memory` degrades gracefully via `ctx.hasUI`. |
| Missing/empty files | No global and no project memory ⇒ inject only the preamble (so the agent knows it *can* save); both caps configurable. |
| Oversized index | Hard-capped at injection; `/memory` shows a warning; preamble instructs the agent to keep the index concise. |
| Concurrent pi sessions | Built-in file tools serialize per-file mutations within a session; cross-session races are accepted (plain files, last-writer-wins, git resolves project-scope conflicts). |

## 7. Configuration

Optional `config.json` in each memory directory, project keys overriding global (mirroring pi settings merge semantics):

```json
{
  "maxInjectLines": 200,
  "maxInjectBytes": 8192,
  "enabled": true
}
```

No reliance on pi's `settings.json` (extensions have no documented API for reading arbitrary settings keys).

## 8. Repository & packaging

Shipped as a **pi package** (research 04):

```
pi-memory/
├── package.json
├── src/
│   ├── index.ts        # default-export factory: wires events, command, flag
│   ├── storage.ts      # scope resolution, lazy dirs, capped reads, mtime cache
│   ├── inject.ts       # preamble + block assembly
│   └── command.ts      # /memory
├── docs/
│   ├── design.md
│   └── research/
└── test/
```

`package.json` essentials:

```json
{
  "name": "pi-memory",
  "keywords": ["pi-package"],
  "pi": { "extensions": ["./src/index.ts"] },
  "peerDependencies": { "@earendil-works/pi-coding-agent": "*" }
}
```

- Bundled pi modules (`@earendil-works/pi-coding-agent`, `typebox`, …) go in `peerDependencies` with `"*"` and are not bundled (research 04). v1 needs no other runtime deps (Node built-ins only; extensions run via jiti, no build step).
- Install: `pi install git:github.com/<user>/pi-memory` (global) or `… -l` (project, team-shared via `.pi/settings.json`). Development: `pi -e ./src/index.ts`; iterate with `/reload` once placed in an extensions dir.

## 9. Testing

- Unit: storage (caps, mtime cache, lazy creation, trust gating) and block assembly are pure functions over a small fs interface — test with temp dirs.
- Integration: `pi -p "what do you remember about this project?"` in a fixture repo with seeded `.pi/memory/`; assert recall. Seed a correction, assert a `MEMORY.md` edit lands.
- Manual: `pi -e ./src/index.ts`, then `/memory`, save/recall round-trip, untrusted-dir behavior.

## 10. Roadmap (post-v1)

1. **Compaction-time capture:** observe `session_before_compact` (observation is free — returning nothing keeps default compaction, research 04) and mine `preparation.messagesToSummarize` via `serializeConversation()` with a cheap model to propose memory entries; deliver proposals as a `nextTurn` message for the agent to accept/edit.
2. **`MEMORY.local.md`:** gitignored personal project-scope notes (the `CLAUDE.local.md` / `.aider.conf.yml` niche).
3. **Decay metadata:** per-entry last-confirmed dates; `/memory stale` listing — frequency/time-informed *suggestions*, never automatic deletion (research 01).
4. **Structured `memory` tool** if preamble-steered file edits prove unreliable in practice.
5. **Cross-harness import:** read-only ingestion of `~/.claude/projects/<project>/memory/` for users migrating from Claude Code.
