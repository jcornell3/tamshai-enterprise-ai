// Tamshai Corp Support Tickets Sample Data
// MongoDB initialization script
//
// NOTE: Knowledge Base articles are stored in Elasticsearch (not deployed in GCP Phase 1)
// See: sample-data/support-data.ndjson for KB articles in Elasticsearch NDJSON format

// Switch to the support database
db = db.getSiblingDB('tamshai_support');

// =============================================================================
// TICKETS COLLECTION
// =============================================================================
db.tickets.drop();
db.tickets.insertMany([
  {
    _id: ObjectId("670000000000000000000001"),
    ticket_id: "TICK-001",
    title: "Cannot login to TamshaiAI app",
    description: "I'm unable to login to the TamshaiAI desktop application. Getting 'Invalid credentials' error even though I'm using the correct password.",
    status: "open",
    priority: "high",
    created_by: "marcus.johnson",
    created_at: new Date("2025-12-30T09:15:00Z"),
    updated_at: new Date("2025-12-30T09:15:00Z"),
    tags: ["authentication", "login", "desktop-app"],
    assigned_to: "dan.williams",
    resolution: null,
    // SLA fields
    customer_tier: "standard",
    sla_target_response_minutes: 60,
    sla_target_resolution_minutes: 480,
    first_response_at: new Date("2025-12-30T09:45:00Z"),
    resolution_deadline: new Date("2025-12-30T17:15:00Z")
  },
  {
    _id: ObjectId("670000000000000000000002"),
    ticket_id: "TICK-002",
    title: "Slow query performance on HR data",
    description: "Queries about employee data are taking 30+ seconds to return results. This seems unusually slow.",
    status: "in_progress",
    priority: "medium",
    created_by: "alice.chen",
    created_at: new Date("2025-12-29T14:30:00Z"),
    updated_at: new Date("2025-12-30T10:00:00Z"),
    tags: ["performance", "hr", "database"],
    assigned_to: "dan.williams",
    resolution: null,
    customer_tier: "enterprise",
    sla_target_response_minutes: 30,
    sla_target_resolution_minutes: 240,
    first_response_at: new Date("2025-12-29T14:45:00Z"),
    resolution_deadline: new Date("2025-12-29T18:30:00Z")
  },
  {
    _id: ObjectId("670000000000000000000003"),
    ticket_id: "TICK-003",
    title: "Add new user to Finance team",
    description: "Please create account for new hire Sarah Martinez (sarah.martinez@tamshai-playground.local) with finance-read role.",
    status: "resolved",
    priority: "medium",
    created_by: "bob.martinez",
    created_at: new Date("2025-12-28T11:00:00Z"),
    updated_at: new Date("2025-12-29T15:30:00Z"),
    tags: ["user-management", "finance", "onboarding"],
    assigned_to: "dan.williams",
    resolution: "User account created and granted finance-read role",
    customer_tier: "standard",
    sla_target_response_minutes: 120,
    sla_target_resolution_minutes: 1440,
    first_response_at: new Date("2025-12-28T12:30:00Z"),
    resolution_deadline: new Date("2025-12-30T11:00:00Z"),
    closed_at: new Date("2025-12-29T15:30:00Z")
  },
  {
    _id: ObjectId("670000000000000000000004"),
    ticket_id: "TICK-004",
    title: "Request access to Sales CRM data",
    description: "I need access to the Sales MCP server to view customer opportunity pipeline for Q1 planning.",
    status: "closed",
    priority: "low",
    created_by: "nina.patel",
    created_at: new Date("2025-12-27T16:45:00Z"),
    updated_at: new Date("2025-12-28T09:00:00Z"),
    tags: ["access-request", "sales", "crm"],
    assigned_to: "dan.williams",
    resolution: "Denied - user role (manager) does not require sales data access",
    customer_tier: "standard",
    sla_target_response_minutes: 240,
    sla_target_resolution_minutes: 2880,
    first_response_at: new Date("2025-12-28T08:30:00Z"),
    resolution_deadline: new Date("2025-12-29T16:45:00Z"),
    closed_at: new Date("2025-12-28T09:00:00Z")
  },
  {
    _id: ObjectId("670000000000000000000005"),
    ticket_id: "TICK-005",
    title: "Claude AI returns incomplete results",
    description: "When querying 'List all employees in Engineering', the AI response says 'showing 50 of 50+ results' but I need to see all 75 engineers.",
    status: "open",
    priority: "medium",
    created_by: "nina.patel",
    created_at: new Date("2025-12-30T08:00:00Z"),
    updated_at: new Date("2025-12-30T08:00:00Z"),
    tags: ["ai", "pagination", "hr"],
    assigned_to: "dan.williams",
    resolution: null,
    customer_tier: "enterprise",
    sla_target_response_minutes: 60,
    sla_target_resolution_minutes: 480,
    first_response_at: new Date("2025-12-30T08:45:00Z"),
    resolution_deadline: new Date("2025-12-30T16:00:00Z")
  },
  {
    _id: ObjectId("670000000000000000000006"),
    ticket_id: "TICK-006",
    title: "TOTP setup instructions needed",
    description: "I received email about required TOTP setup but the link doesn't work. Can you send new instructions?",
    status: "resolved",
    priority: "high",
    created_by: "frank.davis",
    created_at: new Date("2025-12-26T10:30:00Z"),
    updated_at: new Date("2025-12-27T11:00:00Z"),
    tags: ["security", "mfa", "totp"],
    assigned_to: "dan.williams",
    resolution: "Sent new TOTP setup link via secure email",
    customer_tier: "standard",
    sla_target_response_minutes: 60,
    sla_target_resolution_minutes: 480,
    first_response_at: new Date("2025-12-26T11:15:00Z"),
    resolution_deadline: new Date("2025-12-26T18:30:00Z"),
    closed_at: new Date("2025-12-27T11:00:00Z")
  },
  {
    _id: ObjectId("670000000000000000000007"),
    ticket_id: "TICK-007",
    title: "Budget report export failing",
    description: "Trying to export Q4 2024 budget report but getting 500 error. Urgent - need for board meeting tomorrow.",
    status: "in_progress",
    priority: "critical",
    created_by: "bob.martinez",
    created_at: new Date("2025-12-30T13:00:00Z"),
    updated_at: new Date("2025-12-30T13:30:00Z"),
    tags: ["finance", "export", "bug"],
    assigned_to: "dan.williams",
    resolution: null,
    customer_tier: "enterprise",
    sla_target_response_minutes: 15,
    sla_target_resolution_minutes: 120,
    first_response_at: new Date("2025-12-30T13:10:00Z"),
    resolution_deadline: new Date("2025-12-30T15:00:00Z")
  },
  {
    _id: ObjectId("670000000000000000000008"),
    ticket_id: "TICK-008",
    title: "Feature request: Dark mode for desktop app",
    description: "Would love to have a dark mode option in the TamshaiAI Windows app for late-night work sessions.",
    status: "open",
    priority: "low",
    created_by: "marcus.johnson",
    created_at: new Date("2025-12-29T18:00:00Z"),
    updated_at: new Date("2025-12-29T18:00:00Z"),
    tags: ["feature-request", "ui", "desktop-app"],
    assigned_to: null,
    resolution: null,
    customer_tier: "standard",
    sla_target_response_minutes: 480,
    sla_target_resolution_minutes: 10080,
    first_response_at: null,
    resolution_deadline: new Date("2026-01-05T18:00:00Z")
  },
  {
    _id: ObjectId("670000000000000000000009"),
    ticket_id: "TICK-009",
    title: "Executive dashboard not loading",
    description: "Eve Thompson's executive dashboard shows blank screen. Other users report working fine.",
    status: "open",
    priority: "high",
    created_by: "eve.thompson",
    created_at: new Date("2025-12-30T07:30:00Z"),
    updated_at: new Date("2025-12-30T07:30:00Z"),
    tags: ["dashboard", "executive", "bug"],
    assigned_to: "dan.williams",
    resolution: null,
    customer_tier: "enterprise",
    sla_target_response_minutes: 30,
    sla_target_resolution_minutes: 240,
    first_response_at: new Date("2025-12-30T07:45:00Z"),
    resolution_deadline: new Date("2025-12-30T11:30:00Z")
  },
  {
    _id: ObjectId("670000000000000000000010"),
    ticket_id: "TICK-010",
    title: "Password reset not working",
    description: "Clicked 'Forgot Password' but never received reset email. Checked spam folder.",
    status: "resolved",
    priority: "medium",
    created_by: "carol.johnson",
    created_at: new Date("2025-12-25T14:00:00Z"),
    updated_at: new Date("2025-12-26T09:30:00Z"),
    tags: ["authentication", "password", "email"],
    assigned_to: "dan.williams",
    resolution: "Email server issue fixed, reset link sent",
    customer_tier: "standard",
    sla_target_response_minutes: 120,
    sla_target_resolution_minutes: 1440,
    first_response_at: new Date("2025-12-25T15:30:00Z"),
    resolution_deadline: new Date("2025-12-27T14:00:00Z"),
    closed_at: new Date("2025-12-26T09:30:00Z")
  },
  // =============================================================================
  // EDGE CASE: Breached SLA Tickets (Phase 5 - Enterprise UX Hardening)
  // Used to test SLA urgency UI, escalation workflows, and danger styling
  // =============================================================================
  // Breached SLA - Enterprise critical ticket (2 days overdue)
  {
    _id: ObjectId("670000000000000000000011"),
    ticket_id: "TICK-011",
    title: "API rate limiting causing production outages",
    description: "Enterprise API calls are being rate limited during peak hours, causing intermittent 429 errors for our largest client TechCorp Inc.",
    status: "open",
    priority: "critical",
    created_by: "carol.johnson",
    created_at: new Date("2026-01-30T09:00:00Z"),
    updated_at: new Date("2026-02-01T14:00:00Z"),
    tags: ["api", "production", "enterprise", "sla-breach"],
    assigned_to: "dan.williams",
    resolution: null,
    customer_tier: "enterprise",
    sla_target_response_minutes: 15,
    sla_target_resolution_minutes: 120,
    first_response_at: new Date("2026-01-30T09:10:00Z"),
    resolution_deadline: new Date("2026-01-30T11:00:00Z")  // 4 days overdue by Feb 3
  },
  // Breached SLA - High priority unassigned (1 day overdue)
  {
    _id: ObjectId("670000000000000000000012"),
    ticket_id: "TICK-012",
    title: "Data sync failing between HR and Finance systems",
    description: "Employee salary updates made in HR system are not syncing to Finance payroll. Last successful sync was January 25th.",
    status: "open",
    priority: "high",
    created_by: "bob.martinez",
    created_at: new Date("2026-02-01T10:00:00Z"),
    updated_at: new Date("2026-02-01T10:00:00Z"),
    tags: ["integration", "data-sync", "hr", "finance", "sla-breach"],
    assigned_to: null,
    resolution: null,
    customer_tier: "enterprise",
    sla_target_response_minutes: 30,
    sla_target_resolution_minutes: 240,
    first_response_at: null,  // Never responded - missed response SLA too
    resolution_deadline: new Date("2026-02-01T14:00:00Z")  // 2 days overdue by Feb 3
  },
  // Breached SLA - In progress but past deadline
  {
    _id: ObjectId("670000000000000000000013"),
    ticket_id: "TICK-013",
    title: "SSO authentication randomly logging users out",
    description: "Multiple users report being logged out mid-session. Happens 3-4 times per day. Suspect token refresh issue.",
    status: "in_progress",
    priority: "high",
    created_by: "alice.chen",
    created_at: new Date("2026-01-28T08:00:00Z"),
    updated_at: new Date("2026-02-02T16:00:00Z"),
    tags: ["authentication", "sso", "keycloak", "sla-breach"],
    assigned_to: "dan.williams",
    resolution: null,
    customer_tier: "enterprise",
    sla_target_response_minutes: 30,
    sla_target_resolution_minutes: 240,
    first_response_at: new Date("2026-01-28T08:20:00Z"),
    resolution_deadline: new Date("2026-01-28T12:00:00Z")  // 6 days overdue by Feb 3
  }
]);

// =============================================================================
// TICKET SUMMARY (for dashboard)
// =============================================================================
db.ticket_summary.drop();
db.ticket_summary.insertMany([
  {
    _id: ObjectId("680000000000000000000001"),
    status: "open",
    count: 6,  // Updated: +2 breached SLA tickets (TICK-011, TICK-012)
    priority_breakdown: {
      critical: 1,  // +1 (TICK-011)
      high: 3,      // +1 (TICK-012)
      medium: 1,
      low: 1
    },
    sla_breached_count: 2,  // NEW: Track SLA breaches
    updated_at: new Date("2026-02-03T00:00:00Z")
  },
  {
    _id: ObjectId("680000000000000000000002"),
    status: "in_progress",
    count: 3,  // Updated: +1 breached SLA ticket (TICK-013)
    priority_breakdown: {
      critical: 1,
      high: 1,  // +1 (TICK-013)
      medium: 1,
      low: 0
    },
    sla_breached_count: 1,  // NEW: Track SLA breaches
    updated_at: new Date("2026-02-03T00:00:00Z")
  },
  {
    _id: ObjectId("680000000000000000000003"),
    status: "resolved",
    count: 3,
    priority_breakdown: {
      critical: 0,
      high: 1,
      medium: 2,
      low: 0
    },
    updated_at: new Date("2025-12-30T13:30:00Z")
  },
  {
    _id: ObjectId("680000000000000000000004"),
    status: "closed",
    count: 1,
    priority_breakdown: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 1
    },
    updated_at: new Date("2025-12-30T13:30:00Z")
  }
]);

// Create indexes for efficient querying
db.tickets.createIndex({ ticket_id: 1 }, { unique: true });
db.tickets.createIndex({ status: 1 });
db.tickets.createIndex({ priority: 1 });
db.tickets.createIndex({ assigned_to: 1 });
db.tickets.createIndex({ created_by: 1 });
db.tickets.createIndex({ created_at: -1 });
db.tickets.createIndex({ tags: 1 });
// SLA indexes
db.tickets.createIndex({ customer_tier: 1 });
db.tickets.createIndex({ resolution_deadline: 1 });
db.tickets.createIndex({ first_response_at: 1 });
db.tickets.createIndex({ closed_at: -1 });

// =============================================================================
// ESCALATION TARGETS COLLECTION
// =============================================================================
db.escalation_targets.drop();
db.escalation_targets.insertMany([
  {
    _id: ObjectId("670000000000000000000101"),
    agent_id: "agent-001",
    name: "Sarah Mitchell",
    role: "Senior Support Engineer",
    current_workload: 4,
    availability: "available"
  },
  {
    _id: ObjectId("670000000000000000000102"),
    agent_id: "agent-002",
    name: "James Rodriguez",
    role: "Support Team Lead",
    current_workload: 6,
    availability: "available"
  },
  {
    _id: ObjectId("670000000000000000000103"),
    agent_id: "agent-003",
    name: "Emily Watson",
    role: "Technical Specialist",
    current_workload: 8,
    availability: "busy"
  }
]);

db.escalation_targets.createIndex({ agent_id: 1 }, { unique: true });
db.escalation_targets.createIndex({ availability: 1 });

// Print summary
print("=== Support Data Loaded ===");
print("Tickets: " + db.tickets.countDocuments());
print("Escalation targets: " + db.escalation_targets.countDocuments());
print("Summary records: " + db.ticket_summary.countDocuments());
print("");
print("Status breakdown:");
db.tickets.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]).forEach(function(doc) {
  print("  " + doc._id + ": " + doc.count);
});
