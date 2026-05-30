<div align="center">

# ttc

**Like BrowserUse, but for the terminal.**

ttc lets agents interact with programs that expect a human at the keyboard — REPLs, debuggers, TUI apps, and anything else bash can't reach.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![npm](https://img.shields.io/npm/v/tui-tool-call.svg)](https://www.npmjs.com/package/tui-tool-call)

</div>

## What is ttc?

AI agents can run shell commands and call APIs — but they can't interact with programs that expect a human at the keyboard. The moment a REPL waits for input, a debugger hits a breakpoint, or a TUI app renders a menu, agents are stuck.

ttc fills that gap. Spawn any program in a PTY, read its screen as plain text, send keystrokes — all from the command line. Built for the cases where bash isn't enough: live debugging sessions with gigabytes of in-memory state, interactive REPLs, full-screen TUI apps.

### Use cases

- **Scientific computing & large in-memory state** — When your variables are arrays with millions of elements that took an hour to compute, you can't dump them to a log file. Drop an agent into a live Python interpreter or pdb session to debug, inspect, and optimize without losing the running process.
- **Debugger sessions** — Drive GDB, PDB, or any interactive debugger. Set breakpoints, step through code, inspect variables — all from an agent, without restarting the process.
- **REPL sessions** — Run code in Python, Node, or any interactive interpreter, inspect the output, and keep going. No more one-shot scripts when you need an interactive session.
- **TUI applications** — Navigate vim, lazygit, htop, fzf, and other full-screen programs that were never designed to be scripted.

Perfect for **Claude Code**, **Cursor**, **Codex**, **Gemini CLI**, **OpenCode** and other AI coding agents.

### Why not tmux?

tmux is great for humans — but it was never designed for agents.

`tmux send-keys` has no way to signal when a program is done responding. Agents are stuck guessing: `sleep 2` and hope, or poll `capture-pane` in a loop.

ttc observes every PTY render event directly. `done` blocks until the screen stabilizes — no sleep, no polling.

## Features

- **🖥️ Full VT Rendering** — PTY output is processed by a headless xterm emulator. ANSI escape sequences and screen clearing all work correctly. Output is always clean plain text.
- **⏱️ Smart Wait** — `done` blocks until the screen has been stable (100ms debounce, 3s timeout).
- **👀 Human observer** — `ttc watch` opens a local web dashboard (read-only, PTY stream + xterm.js). **Agents must not run this.**
- **📸 Screen Model** — `now` to read, `type`/`press` to act, `done` to confirm, repeat.

## Installation

```bash
npm install -g tui-tool-call
```

**From source:**

```bash
git clone https://github.com/onesuper/tui-tool-call.git
cd tui-tool-call
npm install
npm run build
npm link
```

## OpenAI Codex Plugin

**Note:** You must install the CLI (see Installation section above) before using the plugin — the plugin only provides skill definitions, the CLI provides the actual PTY functionality.

This repo includes a Codex plugin bundle at `plugins/ttc` and a local repo marketplace at `.agents/plugins/marketplace.json`.

### Install from this repo

#### Step 1: Open this repository in Codex

Start Codex with this repository as the working directory, or restart Codex if it was already open while you cloned or updated the repo.

#### Step 2: Open the plugin directory

```
codex
/plugins
```

#### Step 3: Install the plugin

Choose the `ttc local plugins` marketplace, open `ttc`, and select `Install plugin`.

#### Step 4: Start a new thread

Ask Codex to use `ttc`, or explicitly invoke the installed plugin/skill from the prompt.

## Claude Code Plugin

**Note:** You must install the CLI (see Installation section above) before using the plugin — the plugin only provides skill definitions, the CLI provides the actual PTY functionality.

### Install from self-hosted marketplace

#### Step 1: Add the marketplace

```
/plugin marketplace add onesuper/tui-tool-call
```

#### Step 2: Install the plugin

```
/plugin install ttc@ttc
```

#### Step 3: Reload plugins

```
/reload-plugins
```

**More agents coming soon...**

## How It Works

ttc sits directly on the PTY event stream — every byte the program outputs flows through a headless terminal emulator in real time.

This is what makes `done` possible:

```
program outputs → PTY → xterm emulator → render event
                                        → debounce timer resets on each change
                                        → 100ms of silence → screen prints ✓
```

Behind the scenes, sessions persist across CLI calls until killed or idle-timeout.

## CLI Interface

### Core Commands

Every command that touches a session requires `<session>` (letters/digits only, e.g. `dev`, `tempwork`, `agent`).

```
ttc start <session> <command...>   # Start program, wait until stable, print screen
ttc start <session> --cwd <path> <command...>  # Start in a specific directory
ttc now <session>                # Print current screen
ttc done <session>               # Wait until stable, print screen
ttc watch                        # Human-only: local web UI for all sessions (read-only)
ttc u <session>                  # Scroll up one screen
ttc d <session>                  # Scroll down one screen
ttc t <session>                  # Scroll to top
ttc b <session>                  # Scroll to bottom
ttc type <session> <text>        # Type text, then print screen when stable
ttc press <session> <key>        # Press key, then print screen when stable
ttc keys                         # List keys supported by press
ttc list                         # List all sessions
ttc kill <session>               # Kill a session
```

`ttc watch` prints a `http://127.0.0.1:…` URL and keeps running until Ctrl+C. It requires an interactive terminal (TTY) and is blocked for non-human callers.

## Limitations

- **`start` runs programs directly** — no shell; pipes, redirects, and `&&` are not supported.
- **TUI color/style info is mostly lost in agent CLI output** — `now` / `done` return plain text; `ttc watch` preserves ANSI via xterm.js.

## Troubleshooting

### PTY install fails

`npm install` downloads a prebuilt PTY binary for your platform (macOS, Windows, Linux glibc/musl). If install falls back to compiling from source, install build tools:

- macOS: `xcode-select --install`
- Linux: `sudo apt-get install build-essential python3 g++`
- Windows: Visual Studio Build Tools (usually not needed — prebuilds are provided)

## Development

```bash
git clone <repo_url>
cd tui-tool-call
npm install
npm run build
npm link

# Try it
ttc start tempwork python3 examples/ask.py
ttc type tempwork "Alice"
ttc press tempwork enter
ttc kill tempwork
```

## License

[MIT License](LICENSE)
