# Test: vim Edit

Test creating a new file, inserting content, saving, and verifying.

Before starting: kill any stale daemon and remove temp file.
```bash
ttc daemon stop 2>/dev/null || true
rm -f /tmp/tui-vim-test.txt
```

---

## Scenario 1: Create file and insert text

**Goal:** Open a new file in vim, insert multi-line content, save and verify.

```bash
ttc start temp-work vim /tmp/tui-vim-test.txt
ttc now -d --text "tui-vim-test"
```

Assert: vim opened, screen shows `[New]`

**Step 1.1** — Enter insert mode:
```bash
ttc type "i"
ttc now -d --text "INSERT"
```
Assert: status line shows `-- INSERT --`

**Step 1.2** — Type content line by line:
```bash
ttc type "hello world"
ttc press enter
ttc type "second line"
ttc press enter
ttc type "third line"
```

**Step 1.3** — Return to normal mode and save:
```bash
ttc press escape
ttc now -d 300
ttc type ":wq"
ttc press enter
ttc now -d
```
Assert: status is `exited`, exit_code is `0`

**Step 1.4** — Verify file content:
```bash
cat /tmp/tui-vim-test.txt
```
Assert: file contains "hello world", "second line", "third line"

**Cleanup:**
```bash
ttc kill 2>/dev/null || true
rm -f /tmp/tui-vim-test.txt
```
