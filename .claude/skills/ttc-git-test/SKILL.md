---
name: ttc-git-test
description: Use when you need to verify ttc's ability to drive git workflows — interactive rebase, conflict resolution with vim, and verifying repository state.
---

# ttc git Tests

Run tests to verify ttc can drive real git workflows involving interactive rebase and conflict resolution.

## Usage

```
/ttc-git-test              # Run all test suites
/ttc-git-test <suite>      # Run specific test suite
```

## Available Test Suites

| Suite | Description |
|-------|-------------|
| `rebase-conflict` | Interactive rebase with conflict, resolve in vim, verify result |

Test specifications are in `tests/` directory.

## Reporting

After running tests, report results as:

```
<suite>:
  <scenario>      — PASS / FAIL / PARTIAL
    - <step description>: PASS / FAIL (<reason or actual output>)
```

If any test fails, include the actual screen content and what was expected.
