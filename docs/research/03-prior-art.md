# Prior Art: Persistent Memory in Coding Agents & CLIs

> Status: the Claude Code section is grounded in the official docs ([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory), fetched 2026-06-11). The MemGPT/Mem0 characterizations are from the verified survey (see `01-agent-memory-survey.md`). Items in "Unverified leads" were surfaced by the research workflow but **not** adversarially verified — treat as pointers, not facts.

## Claude Code (most directly comparable design)

Claude Code splits persistence into **two complementary systems**, both loaded at session start:

| | CLAUDE.md files | Auto memory |
|---|---|---|
| Who writes it | The user | The agent |
| Contents | Instructions and rules | Learnings and patterns |
| Scope | Project / user / org | Per repository (shared across worktrees) |
| Loaded | Every session, in full | Every session — **first 200 lines or 25KB of the index only** |

### Instruction files (user-authored)

- Scopes & precedence (load order broadest → most specific): managed policy (`/etc/claude-code/CLAUDE.md` on Linux) → user (`~/.claude/CLAUDE.md`) → project (`./CLAUDE.md` or `./.claude/CLAUDE.md`) → local (`./CLAUDE.local.md`, gitignored).
- Discovery walks **up** the directory tree from cwd, concatenating (root-most first, so closest-to-cwd instructions are read last); subdirectory CLAUDE.md files load lazily when files there are read.
- `@path/to/file` import syntax, max depth 4; `.claude/rules/*.md` for modular rules, optionally path-scoped via `paths:` frontmatter globs (load only when matching files are touched).
- Guidance: target under 200 lines per file; specific, verifiable instructions; conflicting rules get picked arbitrarily.

### Auto memory (agent-authored) — the closest analog to this project

- Storage: `~/.claude/projects/<project>/memory/`, where `<project>` is derived from the git repo (all worktrees share one directory; outside git, project root path is used). Machine-local; configurable via `autoMemoryDirectory` setting (trust-gated when set at project scope).
- Layout: a `MEMORY.md` **index** plus topic files (`debugging.md`, `api-conventions.md`, ...).
- Loading: only the first 200 lines / 25KB of `MEMORY.md` is injected at session start. **Topic files are not loaded at startup** — the agent reads them on demand with normal file tools.
- The agent decides what's worth saving; everything is plain markdown the user can audit/edit (`/memory` command). Toggle: `autoMemoryEnabled` setting or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- Compaction note: project-root CLAUDE.md is re-read from disk and re-injected after compaction.

**Key design moves worth copying:**
1. Hard separation of user-authored instructions vs agent-authored memory.
2. Tiny always-loaded index + on-demand topic files = bounded token cost with unbounded total memory.
3. Memory lives in the *user's* global dir keyed by project — project memory without polluting the repo, no commit/gitignore questions, trust handled by location.
4. Plain markdown → transparent, auditable, user-editable (matches the survey's token-level-memory advantages).

## MemGPT / Mem0 / Letta (verified via the survey)

- Early MemGPT and Mem0 merged new information into existing summaries using bare LLM summarization, which "often result[ed] in inconsistency or semantic drift" — the central failure mode to avoid (see `01-agent-memory-survey.md` §2).
- MemGPT's time-based forgetting: evict earliest messages on context overflow. MemOS: LRU with archiving. These are the named decay options.

## Codex CLI (official docs, fetched 2026-06-11)

Source: [developers.openai.com/codex/guides/agents-md](https://developers.openai.com/codex/guides/agents-md) via [openai/codex docs/agents_md.md](https://github.com/openai/codex/blob/main/docs/agents_md.md).

- Instruction chain, built once per session: global `~/.codex/AGENTS.override.md` (else `~/.codex/AGENTS.md`) → then from git root **down** to cwd, at each level taking `AGENTS.override.md`, else `AGENTS.md`, else configurable fallback filenames. One file per directory level; files concatenate root-downward so closer files override earlier guidance.
- Size cap: 32 KiB total by default (`project_doc_max_bytes` in `config.toml`). Empty files skipped.
- No agent-written auto-memory in the core product — persistent context is user-authored instruction files only.

## Cursor (official docs, fetched 2026-06-11)

Source: [cursor.com/docs/context/rules](https://cursor.com/docs/context/rules).

- **Project rules:** `.cursor/rules/*.mdc`, version-controlled, with four application modes driven by frontmatter (`alwaysApply`, `description`, `globs`): always / agent-decides-by-description / file-glob-matched / manual `@`-mention. The glob-scoped mode is the same idea as Claude Code's path-scoped rules.
- **User rules:** global, set in Cursor Settings, apply across all projects.
- **AGENTS.md:** supported at project root and in subdirectories (applied when working with files in that directory).
- **Team rules** (Team/Enterprise): precedence "Team Rules → Project Rules → User Rules".
- Cursor's auto-generated "Memories" feature is **not** present in the current rules docs; treat it as unverified/possibly deprecated.

## Aider (official docs, fetched 2026-06-11)

Source: [aider.chat/docs/usage/conventions.html](https://aider.chat/docs/usage/conventions.html).

- Conventions are a user-authored markdown file (e.g. `CONVENTIONS.md`) loaded read-only: `aider --read CONVENTIONS.md` or `/read CONVENTIONS.md` — "marked as read-only, and cached if prompt caching is enabled."
- Persisted per project via `.aider.conf.yml`: `read: CONVENTIONS.md` (or a list).
- No agent-written memory; the notable idea is **loading memory read-only so it stays prompt-cache-friendly**.

## Cross-tool summary

Every major coding agent has converged on **plain markdown instruction files with global → project → subdirectory concatenation**. Only Claude Code ships agent-written auto-memory, and its design (capped always-loaded index + on-demand topic files, stored outside the repo) is the most directly applicable precedent. Codex's 32 KiB hard cap and Aider's read-only/cache-friendly loading are the practical token-budget lessons.

## Unverified leads (not load-bearing)

- mem0/Codex integration blogs: https://mem0.ai/blog/how-memory-works-in-codex-cli, https://codex.danielvaughan.com/2026/05/01/codex-cli-memories-persistent-context-session-memory-ecosystem/
- **Mem0 vs Letta comparison** — https://vectorize.io/articles/mem0-vs-letta (vendor blog).
- **Memory benchmarks for coding agents** — https://www.developersdigest.tech/blog/agent-memory-benchmarks-not-enough and https://medium.com/@mrsandelin/the-first-controlled-benchmark-of-ai-memory-in-coding-agents-8e0bb776d39e (blogs; benchmark claims unverified).
- **agentmemory** — https://github.com/rohitg00/agentmemory (a memory library/MCP server; API and maturity unchecked).
