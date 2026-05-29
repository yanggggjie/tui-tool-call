---
name: ttc
description: Operate interactive terminal programs (REPLs, debuggers, TUI apps) using PTY automation.
---

# ttc

## Workflow

```
start → done → type/press → done → kill
```

## Waiting (required)

**Never** use timing tools to wait for ttc output — no `sleep`, fixed delays, `timeout`, polling with arbitrary intervals, or any other clock-based wait.

`ttc done` is the correct wait: it debounces PTY changes until the screen is stable. That covers agent tasks finishing, spinners, progress bars, pagers, prompts, and other dynamic TUI output — you do not need extra waits on top.

| Situation | Use |
|-----------|-----|
| After `start` | `ttc done` |
| After `type` / `press` | screen is printed after internal done (no extra wait) |
| Peek without waiting | `ttc now` |
| Live refresh (human) | `ttc watch` — not a substitute for `done` |

## Session naming (required)

`ttc start` **must** include a session name as the first argument. Names are **lowercase letters and hyphens only** (`^[a-z]+(-[a-z]+)*$`), e.g. `dev`, `temp-work`, `claude-agent`, `myapp-dev`. Invalid or missing names error; names are never auto-generated.

### Three session types

| Type | Name pattern | When to use | Lifecycle |
|------|----------------|-------------|-----------|
| **Short-lived tools** | `temp-work` | lazygit, one-off TUIs, quick edits | **Reuse** — `ttc use temp-work`; do **not** kill after each task |
| **Long-running agents** | `claude-agent`, `cursor-agent`, … | Driving another agent CLI | Dedicated session; keep alive across the task |
| **Dev servers** | `api-dev`, `web-dev`, … | Background servers (`npm run dev`, etc.) | Dedicated session; leave running |

If `temp-work` (or any name) already exists, use `ttc use <name>` instead of `ttc start` again.

## Observe (stdout = plain screen text, no options)

| Command | Alias | Action |
|---------|-------|--------|
| `ttc now` | — | Current screen |
| `ttc done` | — | Wait until stable, then screen |
| `ttc watch` | — | Refresh `now` every 1s in-place (Ctrl+C to stop) |
| `ttc up` | `u` | Scroll up one screen |
| `ttc down` | `d` | Scroll down one screen |
| `ttc top` | `t` | Scroll to top |
| `ttc bottom` | `b` | Scroll to bottom |

## Session

```
ttc start <session-name> <cmd> [--cwd] [--cols] [--rows]
ttc use <session-name>
ttc kill
ttc list
ttc info
ttc rename <label>
```

## Input (then auto-done, prints screen)

```
ttc type <text>     # \n Enter, \t Tab
ttc press <key>     # enter, ctrl+c, arrow_up, …
```

## Examples

```bash
# Short tool — reuse temp-work
ttc start temp-work lazygit
ttc done
# … later …
ttc use temp-work
ttc done

# Long-running agent
ttc start claude-agent claude
ttc done

# Dev server
ttc start web-dev npm run dev
ttc done
```

```bash
# REPL smoke test
ttc start temp-work python3
ttc done
ttc type "1+1\n"
ttc done
# leave temp-work running for reuse; only kill when intentionally tearing down
```
