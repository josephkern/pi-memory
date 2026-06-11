# Research: Persistent Memory Extension for pi

Goal: gather verified facts sufficient to design a **pi.dev extension for persistent agent memory, in TypeScript**, respecting pi's directory-layout and global-vs-project scoping conventions. Research phase only — no design doc or code yet.

Conducted 2026-06-11 via a multi-agent deep-research workflow (5 search angles, 18 sources, 90 extracted claims, top 25 adversarially verified with 3-vote panels) plus direct primary-source verification of claims the workflow couldn't finish (it hit a session rate limit during verification/synthesis).

## Documents

| File | Contents |
|---|---|
| [01-agent-memory-survey.md](01-agent-memory-survey.md) | The seed paper (arXiv 2512.13564) — taxonomy, write-strategy pitfalls, decay mechanisms |
| [02-pi-extension-api.md](02-pi-extension-api.md) | pi's extension API, lifecycle events, persistence primitives, directory/scoping conventions |
| [03-prior-art.md](03-prior-art.md) | Claude Code's two-tier memory design, Codex/Cursor/Aider conventions, MemGPT/Mem0 lessons |
| [04-pi-api-details.md](04-pi-api-details.md) | Gap-fill from full pi-mono docs: exact API signatures, compaction internals, packaging, skills |

## Synthesis — what the research supports

1. **File-based (token-level) markdown memory is the right form.** It's the dominant, best-studied approach in the literature, transparent and user-editable, and the only form an extension can implement anyway. (01)
2. **pi gives us all the hooks we need:** `before_agent_start` (inject memory into the system prompt at session start), `context` (per-LLM-call adjustment), `session_before_compact` (write memories before lossy compaction), `session_shutdown` (final flush), `pi.registerTool` (explicit `remember`/`recall` tools), `pi.registerCommand` (a `/memory` command). (02)
3. **Cross-session storage is our responsibility.** pi's built-in persistence (`pi.appendEntry`, tool-result `details`) is session-JSONL-scoped only. (02)
4. **Scoping convention to follow:** global = `~/.pi/agent/...`, project = `.pi/...`, project overrides global, project resources trust-gated. Two viable homes for project memory: in-repo `.pi/memory/` (shareable with team, but commits agent output to the repo) vs. per-project directory under `~/.pi/agent/` keyed by project path, like pi's own `sessions/` and like Claude Code's `~/.claude/projects/<project>/memory/` (machine-local, no repo pollution). **This is the main open design decision.** (02, 03)
5. **Architecture pattern with the strongest precedent** (Claude Code auto memory): small always-injected `MEMORY.md` index (bounded, e.g. 200 lines / 25KB) + topic files read on demand; agent-written memory kept strictly separate from user-authored AGENTS.md. (03)
6. **Write strategy:** append discrete facts with dedup; avoid continuously LLM-rewriting one merged summary (documented semantic-drift failure mode of early MemGPT/Mem0). If pruning, archive rather than delete. (01)
7. **Token budget context:** pi reserves 16,384 tokens for responses and keeps 20,000 recent tokens through compaction by default — injected memory must stay small relative to these. (02)

## Resolution of open questions (2026-06-11, after gap-fill)

- **Project memory location:** decided by the user — **in-repo `.pi/memory/`** (team-shareable, follows pi's `.pi/` convention, trust-gated).
- **`ExtensionAPI` signatures:** documented in `04-pi-api-details.md` from the full pi-mono docs.
- **Skills:** pi implements the agentskills.io standard; skills are static on-demand capability docs, not a writable store — not the right vehicle for memory (04).
- **Packaging:** ship as a pi package (`pi` manifest in `package.json`, `pi-package` keyword); installable via `pi install git:`/`npm:`, project-local with `-l` (04).
- **Recall:** always-injected capped index + on-demand topic files (the model reads them with built-in `read`); no separate search tool needed in v1.
- **Prior art gaps:** Codex, Cursor, Aider official docs now covered in `03-prior-art.md`.

See `../design.md` for the resulting design.

## Verification caveat

The workflow's synthesis step and ~15 verifier agents failed on a session rate limit ("resets 10pm UTC"). Four pi-API claims it marked "killed" were killed by abstention, not refutation — all four were subsequently confirmed by direct fetch of [pi-mono docs/extensions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) and are labeled **[doc-confirmed]** in 02.
