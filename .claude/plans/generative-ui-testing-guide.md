# Generative UI - Manual Testing Guide

**Date**: 2026-02-12
**Phase**: 5 - Manual Component Testing

## Prerequisites

1. **Start all services:**
   ```bash
   cd infrastructure/terraform/dev
   terraform apply -var-file=dev.tfvars
   ```

2. **Verify MCP UI service is running:**
   ```bash
   curl http://localhost:3118/health
   # Should return: {"status":"healthy"}
   ```

3. **Login to portal:**
   - URL: https://www.tamshai-playground.local
   - User: alice.chen (HR manager with access to all components)
   - Password: [DEV_PASSWORD]

---

## Test Cases

### 1. HR: Org Chart (hr:org_chart)

**Test Query:** "Show me the org chart for alice.chen"

**Expected Directive:** `display:hr:org_chart:userId=me,depth=1`

**Validation Checklist:**
- [ ] Component renders without errors
- [ ] Self card shows Alice Chen's information
- [ ] Direct reports section shows employees reporting to Alice
- [ ] Employee cards have proper styling (Tailwind semantic tokens)
- [ ] Click on employee card shows details
- [ ] Voice narration reads: "You report to [manager]. You have [N] direct reports."

**Expected Data:**
- Self: Alice Chen, VP of HR
- Direct reports: Multiple employees from HR department
- IDs properly mapped (employee_id → id)

---

### 2. Sales: Customer Detail (sales:customer)

**Test Query:** "Show me customer details for Acme Corporation"

**Expected Directive:** `display:sales:customer:customerId=<ACME_ID>`

**Validation Checklist:**
- [ ] Component renders without errors
- [ ] Customer header shows company name, industry, status
- [ ] Contacts section lists primary and secondary contacts
- [ ] Contacts have id field (mapped from _id)
- [ ] Opportunities section shows active deals
- [ ] Quick actions (call, email, schedule meeting) visible
- [ ] Responsive layout works on mobile

**Expected Data:**
- Customer: Acme Corporation
- Industry: Technology
- Contacts: 2-3 contacts with emails, phones
- Opportunities: Active deals in pipeline

---

### 3. Sales: Leads Table (sales:leads)

**Test Query:** "Show me hot leads"

**Expected Directive:** `display:sales:leads:status=hot,limit=50`

**Validation Checklist:**
- [ ] Component renders without errors
- [ ] Table shows leads with proper columns
- [ ] Each lead has id field
- [ ] Status badges color-coded correctly
- [ ] Score column shows lead scoring
- [ ] Sorting works on columns
- [ ] Filter controls functional
- [ ] Pagination visible if > 50 leads

**Expected Data:**
- Leads array with id, name, email, company, status, score
- Status: 'hot' or filtered status
- Score: 0-100 numeric value

---

### 4. Sales: Forecast Chart (sales:forecast)

**Test Query:** "Show sales forecast for Q1 2026"

**Expected Directive:** `display:sales:forecast:period=Q1 2026`

**Validation Checklist:**
- [ ] Component renders without errors
- [ ] Bar chart displays with actual vs forecast bars
- [ ] Target line visible (warning-500 dashed border)
- [ ] Period selector (Monthly/Quarterly) functional
- [ ] Legend shows Actual (primary-500), Forecast (secondary-300), Target (warning-500)
- [ ] Summary cards show Target, Achieved, Projected, Gap
- [ ] Status indicators color-coded (success/warning/danger)
- [ ] Hover tooltip shows period details

**Expected Data:**
- Periods: Array of monthly/quarterly data
- Each period: actual, forecast, percentage
- Summary: target, achieved, projected values

---

### 5. Finance: Budget Summary (finance:budget)

**Test Query:** "Show Engineering budget for 2024"

**Expected Directive:** `display:finance:budget:department=Engineering,year=2024`

**Validation Checklist:**
- [ ] Component renders without errors
- [ ] Department header shows "Engineering" and fiscal year
- [ ] Progress bar shows allocated vs spent
- [ ] Warning indicator if > 90% spent
- [ ] Category breakdown table with individual progress bars
- [ ] Request Amendment button visible if remaining < 10%
- [ ] All amounts formatted as currency ($)
- [ ] Trend indicator vs last period (if available)

**Expected Data:**
- Budget object with departmentName, fiscalYear
- allocated, spent, remaining amounts
- categories array with name, allocated, spent, percentage

---

### 6. Finance: Quarterly Report (finance:quarterly_report)

**Status:** ⚠️ **Tool Not Implemented** - Cannot test until get_quarterly_report MCP tool is created

**Test Query:** "Show Q4 2025 financial report"

**Expected Directive:** `display:finance:quarterly_report:quarter=Q4,year=2025`

**Validation Checklist:**
- [ ] Component renders without errors
- [ ] KPI cards grid (Revenue, MRR, Churn, NPS)
- [ ] Change indicators with +/- percentages
- [ ] ARR Waterfall chart visualization
- [ ] Highlights section with bullet points
- [ ] Export buttons (PDF, CSV)
- [ ] All semantic colors applied

**Expected Data:**
- report object with quarter, year
- kpis array with name, value, change, unit
- arrWaterfall array with label, value, type
- highlights array of strings

---

### 7. Approvals: Pending Queue (approvals:pending)

**Test Query:** "Show my pending approvals"

**Expected Directive:** `display:approvals:pending:userId=me`

**Validation Checklist:**
- [ ] Component renders without errors
- [ ] Three sections: Time-Off, Expenses, Budget
- [ ] Time-off requests have id, employeeName, dates, type, reason
- [ ] Expense reports have id, employeeName, amount, date, description
- [ ] Budget amendments have id, department, amounts, reason
- [ ] Approve/Reject buttons functional
- [ ] Batch selection works (if enabled)
- [ ] Count badges show total pending items
- [ ] Empty state if no pending approvals

**Expected Data:**
- timeOffRequests: Array with properly mapped fields
- expenseReports: Array with totalAmount → amount mapping
- budgetAmendments: Array (currentBudget may be 0)

---

## Cross-Browser Testing

Test each component in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (if on macOS)
- [ ] Edge (latest)

---

## Responsive Testing

Test each component at:
- [ ] Mobile (375px width)
- [ ] Tablet (768px width)
- [ ] Desktop (1920px width)

---

## Accessibility Testing

For each component:
- [ ] Keyboard navigation works (Tab, Enter, Space)
- [ ] Screen reader announces component name
- [ ] ARIA labels present on interactive elements
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA standards

---

## Voice Integration Testing

For each component:
- [ ] Voice input trigger works ("Show me...")
- [ ] Voice output reads narration
- [ ] Narration text matches component data
- [ ] Toggle voice on/off functional

---

## Error Handling Testing

Test error states:
1. **Network Error:** Stop MCP UI service, trigger component
   - [ ] Error message displays
   - [ ] Retry button functional

2. **Invalid Parameters:** Use non-existent ID
   - [ ] Error message displays
   - [ ] Suggested action shown

3. **Empty Data:** Use filters that return no results
   - [ ] Empty state displays
   - [ ] Helpful message shown

---

## Performance Testing

For each component:
- [ ] Renders in < 2 seconds
- [ ] No console errors
- [ ] No memory leaks (check DevTools)
- [ ] Smooth animations

---

## Known Issues / Limitations

1. **finance:quarterly_report** - Tool not implemented yet (cannot test)
2. **approvals:pending** - Some fields use default values:
   - `expenseReports.itemCount` always 0
   - `budgetAmendments.currentBudget` always 0
3. **sales:forecast** - Transform not validated with real data yet

---

## Test Results Template

```markdown
### Component: [NAME]
**Tested By:** [YOUR NAME]
**Date:** [DATE]
**Status:** ✅ Pass / ⚠️ Pass with Issues / ❌ Fail

**Issues Found:**
1. [Issue description]
2. [Issue description]

**Screenshots:**
- [Link to screenshot]

**Notes:**
- [Additional observations]
```

---

## Reporting Bugs

Create GitHub issue with:
1. Component name
2. Test query used
3. Expected vs actual behavior
4. Screenshots
5. Browser/device info
6. Console errors (if any)

---

**Testing Status:** Phase 5 - Ready for Manual Testing
**Automated Tests:** Not yet implemented (future work)
