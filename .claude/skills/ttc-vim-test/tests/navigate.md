# Test: vim Navigate

Test line jumping, deleting lines, undo, and redo.

Before starting: prepare a test file and kill any stale daemon.
```bash
ttc daemon stop 2>/dev/null || true
printf "line one\nline two\nline three\n" > /tmp/tui-vim-nav-test.txt
```

---

## Scenario 1: Line jump with G

**Goal:** Jump to a specific line number.

```bash
ttc start temp-work vim /tmp/tui-vim-nav-test.txt
ttc now -d --text "tui-vim-nav-test"
```

**Step 1.1** — Jump to line 2:
```bash
ttc type "2G"
ttc now -d 300
ttc now
```
Assert: screen highlights or shows "line two" as the current line (line 2 selected)

---

## Scenario 2: Delete line and undo/redo

**Goal:** Delete a line, undo, then redo with ctrl+r.

**Step 2.1** — Delete line 1:
```bash
ttc type "1G"
ttc now -d 300
ttc type "dd"
ttc now -d 300
ttc now
```
Assert: "line one" is no longer on screen

**Step 2.2** — Undo:
```bash
ttc type "u"
ttc now -d 300
ttc now
```
Assert: "line one" is back on screen

**Step 2.3** — Redo with ctrl+r:
```bash
ttc press ctrl+r
ttc now -d 300
ttc now
```
Assert: "line one" is gone again

**Cleanup:**
```bash
ttc type ":q!"
ttc press enter
ttc now -d
ttc kill 2>/dev/null || true
rm -f /tmp/tui-vim-nav-test.txt
```
