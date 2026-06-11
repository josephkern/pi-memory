# pi-memory

Persistent, file-based memory for the [pi](https://pi.dev) coding agent. The agent accumulates durable learnings (corrections, build commands, decisions, preferences) across sessions in plain markdown you can read, edit, and diff.

Design rationale and research: [docs/design.md](docs/design.md), [docs/research/](docs/research/).

## How it works

Two scopes, mirroring pi's own global/project convention:

```
~/.pi/agent/memory/      # global: this user, all projects (machine-local)
<repo>/.pi/memory/       # project: committed to the repo, shared with the team
├── MEMORY.md            # concise index — injected into every session (capped)
├── <topic>.md           # detail files — the agent reads them on demand
└── archive/             # stale content is moved here, never injected
```

On every prompt, the extension appends a memory block to the system prompt: a short usage preamble plus each scope's `MEMORY.md`, capped at **200 lines / 8 KiB per scope**. The agent saves and updates memories by editing these files with pi's built-in `edit`/`write` tools — every change is visible in the tool log and (for project scope) in version control.

Project memory is only read in **trusted** projects, and the extension never creates directories on its own — files appear the first time the agent saves something.

## Install

```bash
pi install git:github.com/<you>/pi-memory        # global
pi install -l git:github.com/<you>/pi-memory     # project-local (.pi/settings.json)
```

Or for development:

```bash
pi -e ./src/index.ts
```

## Usage

There is nothing to set up. Tell pi things like "remember that we use pnpm here" — or just work; the agent saves what seems durable.

- `/memory` — show both scopes: files, sizes, what's injected vs. capped, trust state.
- `/memory off` / `/memory on` — toggle injection for the current session.
- `pi --no-memory` — start with injection disabled.

Memory files are plain markdown: edit or delete them in your editor any time.

## Configuration

Optional `config.json` in either memory directory (project overrides global, like pi settings):

```json
{
  "enabled": true,
  "maxInjectLines": 200,
  "maxInjectBytes": 8192
}
```

## Development

```bash
npm install
npm run typecheck
npm test
```
