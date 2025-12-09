# Specification: [Feature Name]

## 1. Business Intent
**User Story:** As a [Role: e.g., HR Manager], I want to [Action], so that [Benefit].
**Business Value:** [Why do we need this?]

## 2. Access Control & Security (Crucial)
* **Required Role(s):** [e.g., hr-write, sales-read]
* **Data Classification:** [Public / Internal / Confidential / Restricted]
* **PII Risks:** Does this feature handle salaries, SSNs, or contact info? [Yes/No]
* **RLS Impact:** Which database tables are accessed? Do existing RLS policies cover this?

## 3. MCP Tool Definition
We will expose this feature to the AI via the following MCP Tools:

| Tool Name | Description | Input Schema (JSON) | Output Schema |
| :--- | :--- | :--- | :--- |
| `get_...` | ... | `{ id: string }` | `{ ... }` |

## 4. User Interaction Scenarios
* **Happy Path:** User asks "..." -> AI calls tool `...` -> AI responds "...".
* **Unauthorized Path:** User (Intern) asks "..." -> AI calls tool -> Gateway blocks -> AI responds "I cannot access that."
* **Edge Case:** [e.g., Data not found, External API timeout]

## 5. Success Criteria
- [ ] Tool is registered in the MCP Gateway.
- [ ] RLS policies prevent unauthorized access at the DB level.
- [ ] Unit tests pass.
- [ ] Integration test verifies RBAC.
