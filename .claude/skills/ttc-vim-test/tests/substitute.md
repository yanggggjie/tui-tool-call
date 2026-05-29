# Test: vim Substitute

Test global search & replace with :%s.

Before starting: prepare a test file and kill any stale daemon.
```bash
ttc daemon stop 2>/dev/null || true
printf "foo bar\nfoo baz\nfoo qux\n" > /tmp/tui-vim-sub-test.txt
```

---

## Scenario 1: Global substitution

**Goal:** Replace all occurrences of "foo" with "replaced" across the file.

```bash
ttc start temp-work vim /tmp/tui-vim-sub-test.txt
ttc now -d --text "tui-vim-sub-test"
```

**Step 1.1** — Run substitution command:
```bash
ttc type ":%s/foo/replaced/g"
ttc press enter
ttc now -d 300
ttc now
```
Assert: all three lines now start with "replaced", no "foo" remains on screen

**Step 1.2** — Save and verify:
```bash
ttc type ":wq"
ttc press enter
ttc now -d
cat /tmp/tui-vim-sub-test.txt
```
Assert: exit_code is `0`, file contains "replaced bar", "replaced baz", "replaced qux"

**Cleanup:**
```bash
ttc kill 2>/dev/null || true
rm -f /tmp/tui-vim-sub-test.txt
```
