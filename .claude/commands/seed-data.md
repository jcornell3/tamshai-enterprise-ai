# Idempotent Data Seeding

Create and maintain sample data that can be safely re-run without duplicates.

## Purpose

Ensure E2E tests can trigger a full data reset without breaking the database state for other developers.

## Data Locations

| Domain | Format | Location |
|--------|--------|----------|
| HR | SQL | `sample-data/hr/*.sql` |
| Finance | SQL | `sample-data/finance/*.sql` |
| Sales | SQL | `sample-data/sales/*.sql` |
| Support | NDJSON | `sample-data/support/*.ndjson` |
| Payroll | SQL | `sample-data/payroll/*.sql` |
| Tax | SQL | `sample-data/tax/*.sql` |

## Idempotent SQL Pattern (Upsert)

### PostgreSQL
```sql
-- Use ON CONFLICT for upserts
INSERT INTO hr.employees (employee_id, first_name, last_name, email)
VALUES
  ('emp-001', 'Alice', 'Chen', 'alice.chen@tamshai.com'),
  ('emp-002', 'Bob', 'Martinez', 'bob.martinez@tamshai.com')
ON CONFLICT (employee_id)
DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email;
```

### MongoDB (NDJSON with upsert)
```javascript
// In loader script
db.tickets.updateOne(
  { ticket_id: doc.ticket_id },
  { $set: doc },
  { upsert: true }
);
```

## Seed Data Requirements

1. **Deterministic IDs**: Use predictable IDs (e.g., `emp-001`, `inv-2024-001`)
2. **Referential Integrity**: Seed parent tables before children
3. **Realistic Data**: Use plausible names, dates, amounts
4. **Test Scenarios**: Include edge cases for testing:
   - Active/inactive employees
   - Overdue/paid invoices
   - Open/closed tickets
   - Various date ranges

## Reseed Command

```bash
# Full reseed (all domains)
./scripts/infra/deploy.sh dev --reseed

# Single domain
./scripts/db/seed.sh dev hr
./scripts/db/seed.sh dev finance
```

## E2E Test Integration

```typescript
// In Playwright test
test.beforeAll(async () => {
  // Reset to known state
  await execSync('./scripts/db/seed.sh dev --reset');
});

test.afterAll(async () => {
  // Restore original state
  await execSync('./scripts/db/seed.sh dev --reset');
});
```

## Adding New Sample Data

1. Create SQL/NDJSON file in appropriate `sample-data/` subdirectory
2. Use upsert patterns (ON CONFLICT / updateOne with upsert)
3. Reference existing IDs for foreign keys
4. Add to entrypoint script order if dependencies exist
5. Test with `--reseed` flag

## Verification

```bash
# Check for duplicates after reseed
psql -c "SELECT employee_id, COUNT(*) FROM hr.employees GROUP BY employee_id HAVING COUNT(*) > 1;"
# Should return 0 rows
```
