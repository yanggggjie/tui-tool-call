---
name: ttc-integration-test
description: Use when you need to verify ttc end-to-end behavior — driving interactive CLI programs, Python REPL, --text pattern matching, custom timeout, special key handling, and highlights detection.
---

# ttc Integration Tests

Run integration tests to verify ttc functionality.

## Usage

```
/ttc-integration-test              # Run all test suites
/ttc-integration-test <suite>      # Run specific test suite
```

## Available Test Suites

| Suite | Description |
|-------|-------------|
| `session` | Session lifecycle: start, use, info, rename, list, kill |
| `interaction` | User interaction: ttc type, press, REPL |
| `scroll` | Terminal buffer scrolling |
| `highlights` | Selection tracking via plain screen text |


Test specifications are in `tests/` directory

## Reporting

After running tests, report results as:

```
<suite>:
  <scenario 1>      — PARTIAL
    - Initial screen capture: PASS
    - scroll command executes: PASS
    - Less pager scrolling with 'space': FAIL

  <scenario 2>     — PASS
    - Find A words: PASS
    - Find B words: FAIL (<Fail reason or notes>)

```

If any test fails, include the actual screen output and what was expected.
