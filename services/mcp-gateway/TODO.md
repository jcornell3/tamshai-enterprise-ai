# MCP Gateway TODO List

## 🚨 CRITICAL - Production Blocker (Temporary Workaround Active)

### Admin Portal Routes Disabled in Production

**Issue:** Admin routes (`/api/admin/*`) are temporarily disabled to unblock production deployment.

**Root Cause:**
- `auditLogger` in `src/services/audit-logger.ts` creates PostgreSQL connection pool at module load time
- `admin.routes.ts` imports `auditLogger` → triggers immediate DB connection
- Production GCP environment doesn't have Cloud SQL PostgreSQL configured yet
- Container startup fails health checks when DB connection fails

**Current Workaround:**
- Admin routes commented out in `src/index.ts` (line 412)
- Admin portal functional locally/dev but **not deployed to production**

**Permanent Fix Required:**
1. **Implement lazy initialization** (Option 1 from analysis)
   - Refactor `audit-logger.ts` to use factory pattern
   - Change from: `export const auditLogger = new AuditLogger()`
   - Change to: `export function getAuditLogger(): AuditLogger { ... }`
   - Only create pool when `getAuditLogger()` is first called

2. **Update admin.routes.ts** to use lazy getter
   - Replace all `auditLogger.log()` calls
   - With `getAuditLogger().log()` calls

3. **Re-enable admin routes** in `src/index.ts`
   - Uncomment line 412: `app.use('/api/admin', authMiddleware, adminRoutes);`

**Prerequisites before implementing fix:**
- ✅ Unit tests complete (10/31 passing - need to fix remaining 21)
- ⏳ Fix remaining 21 failing unit tests
- ⏳ Manual API testing with Postman/curl complete
- ⏳ Verify admin endpoints work locally
- ⏳ (Optional) Set up Cloud SQL in production for full functionality

**Testing Plan:**
1. Fix lazy initialization in `audit-logger.ts`
2. Update all callsites in `admin.routes.ts`
3. Run unit tests - should still pass
4. Test locally with `npm run dev`
5. Deploy to dev environment
6. Test admin endpoints work
7. Re-enable in production (uncomment line 412)
8. Deploy to production
9. Verify container starts successfully
10. Run production E2E tests

**Timeline:**
- Target: Complete after Phase 1 unit testing finalized
- Estimated effort: 30 minutes
- Priority: HIGH (blocks admin portal in production)

---

## Other TODO Items

### Unit Testing
- [ ] Fix remaining 21 failing admin API unit tests (mock configuration issues)
  - Tests exist but mocks need proper setup
  - 10/31 currently passing
  - Target: 90%+ coverage

### Integration Testing
- [ ] Manual API testing with Postman/curl
  - Test all 6 admin endpoints
  - Verify authentication/authorization
  - Test error cases

### Future Enhancements
- [ ] Phase 2: Role Management API endpoints
- [ ] Phase 3: Admin UI foundation
- [ ] Set up Cloud SQL PostgreSQL in production GCP

---

**Last Updated:** 2026-01-10
**Status:** Production deployment unblocked ✅, Admin routes pending lazy init fix ⏳
