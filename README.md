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
- **📸 Screen Model** — `now` to read, `type`/`press` to act, `done` to confirm, repeat.
- **🔍 TUI selection** — Read which menu option, tab, or button is active directly from the rendered text on screen.

## Installation

**From npm (recommended):**

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

Behind the scenes, a daemon process manages PTY sessions so they persist across CLI calls.

## CLI Interface

### Core Commands

```
ttc start <session-name> <cmd>             # Start a named session (required; never auto-generated)
ttc start --cwd <dir> <session-name> <cmd> # Start in specific directory
ttc start temp-work "<cmd> -flags"         # Short tools: reuse temp-work via ttc use
ttc start --cols <n> --rows <n> <name> <cmd>  # Custom terminal size (default: 120x30)
ttc use <session-name>                     # Switch to a session
ttc now                                    # Print current screen
ttc done                                   # Wait until stable, print screen
ttc watch                                  # Refresh now every 1s in-place (Ctrl+C)
ttc u                                      # Scroll up one screen
ttc d                                      # Scroll down one screen
ttc t                                      # Scroll to top
ttc b                                      # Scroll to bottom
ttc type <text>                            # Type text, then print screen when stable
ttc press <key>                            # Press key, then print screen when stable
ttc list                                   # List all sessions
ttc info                                   # Show session details
ttc rename <label>                         # Rename session
ttc kill                                   # Kill current session
ttc daemon status                          # Check if daemon is running
ttc daemon stop                            # Stop the daemon
ttc daemon restart                         # Restart the daemon
```

## Limitations

- **TUI color/style info is mostly lost** — output is plain text only; colors and most formatting are stripped. Read selection/state directly from the rendered text on screen.

## Troubleshooting

### Automatic Rebuild Fails

The installer automatically detects your platform and uses a prebuilt binary when available. If no compatible prebuild exists, it will automatically rebuild from source (requires build tools).

**Build tools** (only needed if automatic rebuild fails):

- macOS: `xcode-select --install`
- Linux: `sudo apt-get install build-essential python3 g++`
- Windows: Prebuilt binaries available (no build tools needed)

## Development

```bash
git clone <repo_url>
cd tui-tool-call
npm install
npm run build
npm link

# Try it
ttc start temp-work python3 examples/ask.py
ttc done
ttc type "Alice"
ttc press enter
ttc done
ttc kill
```

### Integration Tests

A Claude Code skill is included for running the full integration test suite.

Run the following command in Claude Code:

```
/ttc-integration-test
```

Claude will execute the test suite in order and then report `PASS / FAIL` for each, with actual screen output on any failure.

## License

[MIT License](LICENSE)
