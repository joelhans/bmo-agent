# bmo-agent

bmo is a fast, pragmatic, self‑improving coding agent you run locally. It chats in your terminal, can read and modify files in your current project, run shell commands when needed, and even add small “tools” to extend itself on the fly.

<p align="center">
  <img src="https://media1.giphy.com/media/v1.Y2lkPTZjMDliOTUyMjZueWViZ3FrNmN4ZnNyN2Zhc2JjdjVqcDl5eWZmd25waHRmbnRiYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/AMqCTHuCMFpM4/giphy.gif" alt="bmo vibes" />
</p>

## Features
- Streaming terminal chat powered by OpenAI’s Chat Completions API
- Operates in your current working directory (reads/writes files, runs commands)
- Dynamic tool system with hot‑reload (agent can add and use new tools)
- Session logging to a local data dir
- Works from source or as a compact compiled CLI binary

## Requirements
- Node.js 18+ (runtime)
- pnpm (package manager)
- For building the CLI: Bun (for `bun build`)
- An OpenAI API key

## Quick start
1) Install dependencies

   pnpm install

2) Provide an API key (one of):
- Export it in your shell: `export OPENAI_API_KEY=sk-...`
- Or use the built‑in key helper (stores it locally): `bmo key add <your-openai-key>`

3) Run from source

   pnpm start

Type messages and press Enter. Type `exit` to quit.

## Installation

### Run from source
- Install deps: `pnpm install`
- Start: `pnpm start` (or `pnpm run start:watch` while editing)

### Install the compiled CLI
This builds a single `bmo` binary and installs tools alongside it.

- Build and install:

  pnpm run install-cli

- This will place:
  - Binary: `~/.local/bin/bmo`
  - Tools dir: `~/.local/bin/bmo-tools/`

Ensure `~/.local/bin` is on your PATH. On macOS, the installer attempts an ad‑hoc `codesign` automatically if available.

## Configuration

### API keys
bmo uses OpenAI’s API via the `OPENAI_API_KEY` env var. You can:
- Set `OPENAI_API_KEY` in your shell
- Or run: `bmo key add <key>` to save it at `~/.local/share/bmo/config.json`

Tip: You can also proxy via a custom base URL by setting `NGROKAI` (overrides OpenAI `baseURL`).

### Data directory and logs
- Default data dir: `~/.local/share/bmo/`
- Session logs are written there and the path is printed on startup
- Override with `BMO_DATA_DIR=/absolute/path`

### Notes inlining (developer guidance)
At startup, bmo inlines a short guide (“AGENTS”) to steer its behavior. Control this with:
- `BMO_NOTES_FILE=/absolute/path/to/BMO_AGENTS.md` — preferred explicit file
- `BMO_INLINE_NOTES=1` — try to auto‑inline defaults
- `BMO_DISABLE_NOTES=1` — disable notes entirely

From source, the repo’s AGENTS.md is used. Installed binaries ship a `BMO_AGENTS.md` next to tools.

## Usage
- Start a session: `bmo` (binary) or `pnpm start` (source)
- Quit: type `exit`

What it can do (built‑in tools):
- Files: list/read/write/move, get file stats
- System: run shell commands, emit progress notes
- Git (limited): create commits if explicitly requested (your project), or autonomously only when improving its own bmo tools

Safety notes:
- bmo can run commands and edit files in your current directory
- It avoids destructive shell commands unless explicitly allowed by its internal safeguards
- Prefer running it inside a Git workspace so you can review diffs

## Self‑improvement loop (how bmo extends itself)
When bmo needs a capability it doesn’t have yet, it builds the smallest possible tool and hot‑loads it—without leaving your terminal.

Golden Path steps:
1) Discover: check existing tools (list `bmo://tools/`) and avoid duplicating functionality
2) Scaffold: write `bmo://tools/<name>.mjs` with three exports: `schema`, `execute`, `details`
3) Hot‑reload: call `reload_tools` to load the new tool
4) Verify: run the tool once with a minimal input and check it returns ok:true
5) Continue: use it to finish the task
6) Commit policy: automatic commits only for bmo’s own files; never auto‑commit your project unless you ask

See tools/BMO_AGENTS.md for the template, conventions, and common pitfalls.

## Persisting self‑improvements (BMO_SOURCE)
When running the installed binary, tools live under `BMO_HOME/bmo-tools/`. To keep your added/edited tools in a source repo (so they survive reinstalls and can be versioned), set BMO_SOURCE.

How it works:
- Writes to `bmo://tools/...` always go to the active tools dir
- If `BMO_SOURCE` is set, writes are mirrored to `<BMO_SOURCE>/tools/` as well
- Default: if `~/src/bmo-agent` exists, it is used as BMO_SOURCE automatically

Set it explicitly:
- Bash/zsh (add to your shell profile):
  export BMO_SOURCE="$HOME/src/bmo-agent"
  # or any absolute path to a clone of this repo
- Fish:
  set -x BMO_SOURCE "$HOME/src/bmo-agent"

Commit behavior with BMO_SOURCE:
- Self‑improvement commits should be created only for bmo’s own files and in the BMO_SOURCE repo
- bmo will not create commits in your non‑bmo projects unless you explicitly request it

## Project layout
- index.mjs — core runtime (prompt building, tool loader, REPL, logging)
- tools/ — source tools used when running from the repo
  - tools/lib.mjs — shared helpers (path resolving, reload callback, mirroring)
  - tools/*.mjs — one tool per file
  - tools/BMO_AGENTS.md — Golden Path bundled with binaries
- dist/ — compiled binaries (after build)
- CAPTAINS_LOG.md — running notes/changelog

## Build and develop
- Start in watch mode: `pnpm run start:watch`
- Build binary only: `pnpm run build:cli` (requires Bun)
- Install binary and tools: `pnpm run install-cli`

Environment variables (advanced):
- BMO_HOME — runtime home (auto‑detected)
- BMO_SOURCE — absolute path to a bmo-agent source repo for persisting tool changes
- BMO_DATA_DIR — override data dir for logs/config
- BMO_NOTES_FILE, BMO_INLINE_NOTES, BMO_DISABLE_NOTES — notes inlining
- NGROKAI — custom `baseURL` for OpenAI client

## Troubleshooting
- Error: Missing OPENAI_API_KEY
  - Set `OPENAI_API_KEY` or run `bmo key add <key>` and try again
- `bmo: command not found`
  - Ensure `~/.local/bin` is on your PATH, or use `pnpm start` from source
- macOS gatekeeper blocks the binary
  - The installer runs an ad‑hoc `codesign` when available. If needed: `codesign --force --sign - ~/.local/bin/bmo` or allow the binary in System Settings

## License
No license specified yet.
