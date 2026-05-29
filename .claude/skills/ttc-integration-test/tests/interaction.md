# Test: Interaction Input

Test user interaction: wait, type, press, REPL interaction.

Before starting: kill any stale daemon.
```bash
ttc daemon stop 2>/dev/null || true
```

---

## Scenario 1: Basic wait and type

**Goal:** Drive a simple prompt-based CLI.

```bash
ttc start temp-work python3 examples/ask.py
ttc now -d --text "name"
```

**Step 1.1** — Verify prompt appeared:
```bash
ttc now
```
Assert: screen contains "What is your name?"

**Step 1.2** — Type and submit:
```bash
ttc type "Alice"
ttc press enter
ttc now -d --text "age"
```
Assert: screen contains "Hello Alice!" and "What is your age?"

**Step 1.3** — Complete interaction:
```bash
ttc type "30"
ttc press enter
ttc now -d
```
Assert: screen contains "You are 30 years old!"

**Cleanup:**
```bash
ttc kill 2>/dev/null || true
```

---

## Scenario 2: REPL interaction

**Goal:** Interact with Python REPL.

```bash
ttc start temp-work python3
ttc now -d --text ">>>"
```

**Step 2.1** — Set variable:
```bash
ttc type "x = 42"
ttc press enter
ttc now -d --text ">>>"
```
Assert: prompt returns

**Step 2.2** — Evaluate expression:
```bash
ttc type "print(x * 2)"
ttc press enter
ttc now -d --text ">>>"
```
Assert: screen contains "84"

**Step 2.3** — Exit REPL:
```bash
ttc type "exit()"
ttc press enter
ttc now -d
```
Assert: REPL has exited (no `>>>` prompt on screen)

**Cleanup:**
```bash
ttc kill 2>/dev/null || true
```

---

## Scenario 3: Multi-line input via type

**Goal:** Send multiple lines with `type` and `\n`.

```bash
ttc start temp-work python3
ttc now -d --text ">>>"
```

**Step 3.1** — Type multi-line code (returns screen when stable):
```bash
ttc type "x = 1\ny = 2\nprint(x + y)" --text ">>>"
```
Assert: screen contains "1", "2", and "3"

**Step 3.2** — Type function definition, then call it:
```bash
ttc type "def greet(name):\n    return f'Hello, {name}!'\n" --text ">>>"
ttc type "print(greet('World'))" --text ">>>"
```
Assert: screen contains "Hello, World!"

**Cleanup:**
```bash
ttc type "exit()"
ttc press enter
ttc now -d
ttc kill 2>/dev/null || true
```

---

## Scenario 4: Custom timeout and --text pattern

**Goal:** Verify wait options work correctly.

```bash
ttc start temp-work sleep 10
```

**Step 4.1** — Custom timeout returns quickly:
```bash
time ttc now -d 300
```
Assert: returns within ~400ms; screen unchanged from before (still empty or sleep output only)

**Cleanup:**
```bash
ttc kill
```

---

## Scenario 5: Special keys (ctrl+c)

**Goal:** Send interrupt signal.

```bash
ttc start temp-work python3
ttc now -d --text ">>>"
ttc press ctrl+c
ttc now -d 1000
```
Assert: screen contains "KeyboardInterrupt"

**Cleanup:**
```bash
ttc kill
```

---

