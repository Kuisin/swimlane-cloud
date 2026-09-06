# Diagrams

| Diagram | Owner | Status | What it shows |
| --- | --- | --- | --- |
| `sales/order-to-cash.txt` | sales-ops | review | two phases, nested `if`, a labelled three-path `fork`, a `branch`, a `section`, `goto` and `loop`, a sub-process link |
| `sales/shipping-prep.txt` | sales-ops | review | a minimal sub-process: root-level steps and one `if` with a bare `loop` |
| `support/incident-response.txt` | sre | approved | a `fork` inside a case, a nested `if` looping to a step in the same case, a `goto` past a phase |
| `support/rollback.txt` | sre | approved | a runbook sub-process |
| `hr/onboarding.txt` | hr | draft | a `fork` inside a `section`, then a `phase`, with a `loop` back into the phase |
