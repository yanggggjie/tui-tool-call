---
name: ttc
description: Operate interactive terminal programs (REPLs, debuggers, TUI apps) using PTY automation.
---

# ttc

## Workflow

```
start <session> <command...> → type/press <session> … → kill <session>
```

Every command takes an explicit **session name** (letters/digits only). There is no implicit current session.

## Waiting (required)

**Never** use timing tools to wait for ttc output — no `sleep`, fixed delays, `timeout`, polling with arbitrary intervals, or any other clock-based wait.

`ttc done <session>` is the correct wait: it debounces PTY changes until the screen is stable.

| Situation | Use |
|-----------|-----|
| After `start` | screen is printed after internal done (no extra wait) |
| After `type` / `press` | screen is printed after internal done (no extra wait) |
| Peek without waiting | `ttc now <session>` |
| Explicit wait | `ttc done <session>` |
| Human observer (read-only web UI) | **`ttc watch`** — humans only, agents must **not** run this |

**Agents must never run `ttc watch`.** It starts a local web server for human observation only. Use `ttc now` / `ttc done` instead.

## Session naming (required)

Names are **letters and digits only** (`^[a-zA-Z0-9]+$`). Prefer short letter-only names:

| Purpose | Example names |
|---------|----------------|
| Short-lived reuse | `tempwork`, `work` |
| Agent CLI | `agent`, `claude` |
| Dev server | `dev`, `webdev` |

If a name is already in use, pick a different session name, or run `ttc kill <name>` before `ttc start <name> …` again.

## Observe

| Command | Alias | Action |
|---------|-------|--------|
| `ttc now <session>` | — | Current screen |
| `ttc done <session>` | — | Wait until stable, then screen |
| `ttc watch` | — | **Human-only** — local web UI for all sessions (read-only) |
| `ttc up <session>` | `u` | Scroll up one screen |
| `ttc down <session>` | `d` | Scroll down one screen |
| `ttc top <session>` | `t` | Scroll to top |
| `ttc bottom <session>` | `b` | Scroll to bottom |

## Session

`ttc start <session> <command...>` spawns a program directly in a PTY (120×30, no shell). Working directory defaults to the caller's current directory; use `--cwd <path>` to override.

```
ttc start <session> <command...>
ttc start <session> --cwd <path> <command...>
ttc kill <session>
ttc list
```

## Input (auto-done, prints screen)

```
ttc type <session> <text>     # \n Enter, \t Tab
ttc press <session> <key>     # enter, ctrl+c, arrow_up, …
ttc keys                      # list supported key names
```

## Examples

```bash
# TUI tool
ttc start tempwork lazygit

# Agent CLI
ttc start agent claude --permission-mode dontAsk

# Dev server
ttc start dev npm run dev
ttc start webdev --cwd ./apps/web npm run dev
```

```bash
# REPL smoke test
ttc start tempwork python3
ttc type tempwork "1+1"
ttc press tempwork enter
ttc kill tempwork
```
