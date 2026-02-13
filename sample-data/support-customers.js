// Tamshai Corp Customer Support Portal Sample Data
// MongoDB initialization script for customer organizations, contacts, and tickets
//
// This script creates:
// - Organizations: 3 customer organizations (Acme, Globex, Initech)
// - Contacts: 6 customer contacts (2 per organization - 1 lead, 1 basic)
// - Customer Tickets: 15+ tickets with customer-specific fields
// - Audit Log: Sample audit entries
//
// Usage:
//   mongosh mongodb://localhost:27018/tamshai_support --file support-customers.js

// Switch to the support database
db = db.getSiblingDB('tamshai_support');

// =============================================================================
// ORGANIZATIONS COLLECTION
// =============================================================================
print("Creating organizations collection...");
db.organizations.drop();
db.organizations.insertMany([
  {
    _id: ObjectId("700000000000000000000001"),
    organization_id: "org-acme-001",
    name: "Acme Corporation",
    domain: "acme.com",
    subscription_tier: "enterprise",
    subscription_start: new Date("2024-01-15T00:00:00Z"),
    subscription_end: new Date("2026-01-15T00:00:00Z"),
    settings: {
      sla_tier: "premium",
      max_tickets_per_month: 100,
      max_contacts: 20,
      response_time_hours: 4,
      resolution_time_hours: 24
    },
    current_contacts: 2,
    created_at: new Date("2024-01-15T10:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    created_by: "admin",
    status: "active"
  },
  {
    _id: ObjectId("700000000000000000000002"),
    organization_id: "org-globex-002",
    name: "Globex Industries",
    domain: "globex.com",
    subscription_tier: "professional",
    subscription_start: new Date("2024-06-01T00:00:00Z"),
    subscription_end: new Date("2026-06-01T00:00:00Z"),
    settings: {
      sla_tier: "standard",
      max_tickets_per_month: 50,
      max_contacts: 10,
      response_time_hours: 24,
      resolution_time_hours: 72
    },
    current_contacts: 2,
    created_at: new Date("2024-06-01T14:30:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    created_by: "admin",
    status: "active"
  },
  {
    _id: ObjectId("700000000000000000000003"),
    organization_id: "org-initech-003",
    name: "Initech Solutions",
    domain: "initech.com",
    subscription_tier: "basic",
    subscription_start: new Date("2025-03-01T00:00:00Z"),
    subscription_end: new Date("2026-03-01T00:00:00Z"),
    settings: {
      sla_tier: "basic",
      max_tickets_per_month: 20,
      max_contacts: 5,
      response_time_hours: 48,
      resolution_time_hours: 168
    },
    current_contacts: 2,
    created_at: new Date("2025-03-01T09:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    created_by: "admin",
    status: "active"
  }
]);

// Create indexes for organizations
db.organizations.createIndex({ organization_id: 1 }, { unique: true });
db.organizations.createIndex({ domain: 1 });
db.organizations.createIndex({ subscription_tier: 1, status: 1 });

// =============================================================================
// CONTACTS COLLECTION
// =============================================================================
print("Creating contacts collection...");
db.contacts.drop();
db.contacts.insertMany([
  // Acme Corporation - Lead Contact
  {
    _id: ObjectId("710000000000000000000001"),
    keycloak_user_id: "kc-jane-smith-001",
    organization_id: "org-acme-001",
    email: "jane.smith@acme.com",
    first_name: "Jane",
    last_name: "Smith",
    phone: "+1-555-100-0001",
    title: "IT Director",
    role: "lead",
    is_lead_contact: true,
    permissions: {
      can_view_org_tickets: true,
      can_manage_contacts: true,
      can_transfer_lead: true
    },
    notification_preferences: {
      email_on_ticket_update: true,
      email_on_ticket_resolved: true,
      email_digest: "daily"
    },
    last_login: new Date("2026-02-05T09:30:00Z"),
    ticket_count: 8,
    created_at: new Date("2024-01-15T10:30:00Z"),
    updated_at: new Date("2026-02-05T09:30:00Z"),
    invited_by: "admin",
    status: "active"
  },
  // Acme Corporation - Basic Contact
  {
    _id: ObjectId("710000000000000000000002"),
    keycloak_user_id: "kc-bob-developer-001",
    organization_id: "org-acme-001",
    email: "bob.developer@acme.com",
    first_name: "Bob",
    last_name: "Developer",
    phone: "+1-555-100-0002",
    title: "Software Developer",
    role: "basic",
    is_lead_contact: false,
    permissions: {
      can_view_org_tickets: false,
      can_manage_contacts: false,
      can_transfer_lead: false
    },
    notification_preferences: {
      email_on_ticket_update: true,
      email_on_ticket_resolved: true,
      email_digest: "none"
    },
    last_login: new Date("2026-02-04T15:00:00Z"),
    ticket_count: 5,
    created_at: new Date("2024-02-01T11:00:00Z"),
    updated_at: new Date("2026-02-04T15:00:00Z"),
    invited_by: "jane.smith@acme.com",
    status: "active"
  },
  // Globex Industries - Lead Contact
  {
    _id: ObjectId("710000000000000000000003"),
    keycloak_user_id: "kc-mike-manager-001",
    organization_id: "org-globex-002",
    email: "mike.manager@globex.com",
    first_name: "Mike",
    last_name: "Manager",
    phone: "+1-555-200-0001",
    title: "Operations Manager",
    role: "lead",
    is_lead_contact: true,
    permissions: {
      can_view_org_tickets: true,
      can_manage_contacts: true,
      can_transfer_lead: true
    },
    notification_preferences: {
      email_on_ticket_update: true,
      email_on_ticket_resolved: true,
      email_digest: "weekly"
    },
    last_login: new Date("2026-02-03T10:00:00Z"),
    ticket_count: 4,
    created_at: new Date("2024-06-01T14:45:00Z"),
    updated_at: new Date("2026-02-03T10:00:00Z"),
    invited_by: "admin",
    status: "active"
  },
  // Globex Industries - Basic Contact
  {
    _id: ObjectId("710000000000000000000004"),
    keycloak_user_id: "kc-sara-support-001",
    organization_id: "org-globex-002",
    email: "sara.support@globex.com",
    first_name: "Sara",
    last_name: "Support",
    phone: "+1-555-200-0002",
    title: "Support Specialist",
    role: "basic",
    is_lead_contact: false,
    permissions: {
      can_view_org_tickets: false,
      can_manage_contacts: false,
      can_transfer_lead: false
    },
    notification_preferences: {
      email_on_ticket_update: true,
      email_on_ticket_resolved: true,
      email_digest: "none"
    },
    last_login: new Date("2026-02-02T16:30:00Z"),
    ticket_count: 3,
    created_at: new Date("2024-07-15T09:00:00Z"),
    updated_at: new Date("2026-02-02T16:30:00Z"),
    invited_by: "mike.manager@globex.com",
    status: "active"
  },
  // Initech Solutions - Lead Contact
  {
    _id: ObjectId("710000000000000000000005"),
    keycloak_user_id: "kc-peter-principal-001",
    organization_id: "org-initech-003",
    email: "peter.principal@initech.com",
    first_name: "Peter",
    last_name: "Principal",
    phone: "+1-555-300-0001",
    title: "IT Manager",
    role: "lead",
    is_lead_contact: true,
    permissions: {
      can_view_org_tickets: true,
      can_manage_contacts: true,
      can_transfer_lead: true
    },
    notification_preferences: {
      email_on_ticket_update: true,
      email_on_ticket_resolved: true,
      email_digest: "daily"
    },
    last_login: new Date("2026-02-01T08:00:00Z"),
    ticket_count: 2,
    created_at: new Date("2025-03-01T09:15:00Z"),
    updated_at: new Date("2026-02-01T08:00:00Z"),
    invited_by: "admin",
    status: "active"
  },
  // Initech Solutions - Basic Contact
  {
    _id: ObjectId("710000000000000000000006"),
    keycloak_user_id: "kc-tim-tech-001",
    organization_id: "org-initech-003",
    email: "tim.tech@initech.com",
    first_name: "Tim",
    last_name: "Tech",
    phone: "+1-555-300-0002",
    title: "Developer",
    role: "basic",
    is_lead_contact: false,
    permissions: {
      can_view_org_tickets: false,
      can_manage_contacts: false,
      can_transfer_lead: false
    },
    notification_preferences: {
      email_on_ticket_update: true,
      email_on_ticket_resolved: false,
      email_digest: "none"
    },
    last_login: new Date("2026-01-30T14:00:00Z"),
    ticket_count: 1,
    created_at: new Date("2025-04-01T10:00:00Z"),
    updated_at: new Date("2026-01-30T14:00:00Z"),
    invited_by: "peter.principal@initech.com",
    status: "active"
  }
]);

// Create indexes for contacts
db.contacts.createIndex({ keycloak_user_id: 1 }, { unique: true });
db.contacts.createIndex({ organization_id: 1 });
db.contacts.createIndex({ email: 1 }, { unique: true });
db.contacts.createIndex({ organization_id: 1, is_lead_contact: 1 });

// =============================================================================
// CUSTOMER TICKETS COLLECTION
// Customer tickets with organization_id, contact_id, visibility, and
// separate internal_notes vs customer_visible_notes
// =============================================================================
print("Creating customer tickets...");

// Note: We're adding to the existing tickets collection with customer-specific fields
// These tickets have source: "customer_portal" to distinguish from internal tickets

db.tickets.insertMany([
  // ==========================================================================
  // ACME CORPORATION TICKETS
  // ==========================================================================
  {
    _id: ObjectId("720000000000000000000001"),
    ticket_id: "TKT-CUST-001",
    subject: "Unable to access analytics dashboard",
    description: "After the latest update (v2.5.1), I can no longer access the analytics dashboard. When I click on 'Analytics' in the sidebar, I get a blank white page. This started happening after the update was deployed on Monday.",
    status: "open",
    priority: "high",
    category: "Technical > Access Issues",
    source: "customer_portal",
    organization_id: "org-acme-001",
    contact_id: ObjectId("710000000000000000000001"),
    customer_email: "jane.smith@acme.com",
    visibility: "organization",
    internal_notes: [
      {
        note_id: ObjectId("730000000000000000000001"),
        content: "Customer has premium SLA - escalate if not resolved in 2 hours. Checked access logs - user has correct permissions.",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-05T10:00:00Z")
      }
    ],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000002"),
        content: "Thank you for reporting this issue. I'm investigating the analytics dashboard access issue now.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-05T10:15:00Z")
      },
      {
        note_id: ObjectId("730000000000000000000003"),
        content: "I tried clearing my cache but the issue persists. I also tested in Firefox and Chrome - same result.",
        author_type: "customer",
        author_id: "kc-jane-smith-001",
        author_name: "Jane Smith",
        created_at: new Date("2026-02-05T10:30:00Z")
      }
    ],
    assigned_to: "dan.williams",
    assigned_at: new Date("2026-02-05T09:45:00Z"),
    sla_response_due: new Date("2026-02-05T13:00:00Z"),
    sla_resolution_due: new Date("2026-02-06T09:00:00Z"),
    sla_response_met: true,
    sla_resolution_met: null,
    created_at: new Date("2026-02-05T09:00:00Z"),
    updated_at: new Date("2026-02-05T10:30:00Z"),
    first_response_at: new Date("2026-02-05T10:15:00Z"),
    resolved_at: null,
    closed_at: null,
    tags: ["dashboard", "access-issue", "v2.5.1"],
    attachments: [
      {
        filename: "screenshot.png",
        url: "minio://support-attachments/TKT-CUST-001/screenshot.png",
        size: 245000,
        mime_type: "image/png",
        uploaded_by: "jane.smith@acme.com",
        uploaded_at: new Date("2026-02-05T09:05:00Z")
      }
    ]
  },
  {
    _id: ObjectId("720000000000000000000002"),
    ticket_id: "TKT-CUST-002",
    subject: "API rate limit errors during peak hours",
    description: "We're experiencing 429 rate limit errors when making API calls during business hours (9am-5pm EST). Our integration was working fine until last week. We're only making about 100 requests per minute.",
    status: "in_progress",
    priority: "critical",
    category: "Technical > API",
    source: "customer_portal",
    organization_id: "org-acme-001",
    contact_id: ObjectId("710000000000000000000002"),
    customer_email: "bob.developer@acme.com",
    visibility: "organization",
    internal_notes: [
      {
        note_id: ObjectId("730000000000000000000004"),
        content: "Rate limit was accidentally reduced during last deployment. Reverted to 500 req/min for enterprise tier. Monitoring.",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-04T11:00:00Z")
      }
    ],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000005"),
        content: "We've identified the issue - an incorrect rate limit configuration was deployed. We're working on a fix now.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-04T10:30:00Z")
      }
    ],
    assigned_to: "dan.williams",
    assigned_at: new Date("2026-02-04T10:00:00Z"),
    sla_response_due: new Date("2026-02-04T13:00:00Z"),
    sla_resolution_due: new Date("2026-02-05T09:00:00Z"),
    sla_response_met: true,
    sla_resolution_met: null,
    created_at: new Date("2026-02-04T09:00:00Z"),
    updated_at: new Date("2026-02-04T11:00:00Z"),
    first_response_at: new Date("2026-02-04T10:30:00Z"),
    tags: ["api", "rate-limit", "enterprise", "integration"]
  },
  {
    _id: ObjectId("720000000000000000000003"),
    ticket_id: "TKT-CUST-003",
    subject: "Private ticket - Security concern",
    description: "I noticed some unusual login attempts on my account from IP addresses I don't recognize. Can you check the security logs?",
    status: "open",
    priority: "high",
    category: "Security",
    source: "customer_portal",
    organization_id: "org-acme-001",
    contact_id: ObjectId("710000000000000000000001"),
    customer_email: "jane.smith@acme.com",
    visibility: "private",
    internal_notes: [
      {
        note_id: ObjectId("730000000000000000000006"),
        content: "Checked logs - appears to be legitimate login attempts from VPN. User has been traveling. Confirmed with HR.",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-03T14:00:00Z")
      }
    ],
    customer_visible_notes: [],
    assigned_to: "dan.williams",
    sla_response_due: new Date("2026-02-03T17:00:00Z"),
    sla_resolution_due: new Date("2026-02-04T13:00:00Z"),
    created_at: new Date("2026-02-03T13:00:00Z"),
    updated_at: new Date("2026-02-03T14:00:00Z"),
    tags: ["security", "login", "private"]
  },
  // Resolved ticket
  {
    _id: ObjectId("720000000000000000000004"),
    ticket_id: "TKT-CUST-004",
    subject: "Password reset not working",
    description: "I clicked the forgot password link but never received the reset email. I've checked my spam folder.",
    status: "resolved",
    priority: "medium",
    category: "Account > Password",
    source: "customer_portal",
    organization_id: "org-acme-001",
    contact_id: ObjectId("710000000000000000000002"),
    customer_email: "bob.developer@acme.com",
    visibility: "organization",
    internal_notes: [],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000007"),
        content: "The email was sent but caught by your company's email filter. I've sent it to your personal email as a workaround.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-01-28T11:00:00Z")
      },
      {
        note_id: ObjectId("730000000000000000000008"),
        content: "Got it! Thank you for the quick resolution.",
        author_type: "customer",
        author_id: "kc-bob-developer-001",
        author_name: "Bob Developer",
        created_at: new Date("2026-01-28T11:15:00Z")
      }
    ],
    assigned_to: "dan.williams",
    sla_response_met: true,
    sla_resolution_met: true,
    created_at: new Date("2026-01-28T10:00:00Z"),
    updated_at: new Date("2026-01-28T11:15:00Z"),
    first_response_at: new Date("2026-01-28T11:00:00Z"),
    resolved_at: new Date("2026-01-28T11:15:00Z"),
    closed_at: new Date("2026-01-28T11:30:00Z"),
    tags: ["password", "email", "resolved"]
  },

  // ==========================================================================
  // GLOBEX INDUSTRIES TICKETS
  // ==========================================================================
  {
    _id: ObjectId("720000000000000000000005"),
    ticket_id: "TKT-CUST-005",
    subject: "Need additional user licenses",
    description: "We need to add 5 more users to our account. Can you help us upgrade our plan?",
    status: "open",
    priority: "low",
    category: "Billing > Licenses",
    source: "customer_portal",
    organization_id: "org-globex-002",
    contact_id: ObjectId("710000000000000000000003"),
    customer_email: "mike.manager@globex.com",
    visibility: "organization",
    internal_notes: [
      {
        note_id: ObjectId("730000000000000000000009"),
        content: "Forwarded to sales team for upsell opportunity. Professional tier allows up to 10 users.",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-02T14:00:00Z")
      }
    ],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000010"),
        content: "I've forwarded your request to our sales team. They will reach out within 1 business day to discuss license options.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-02T14:30:00Z")
      }
    ],
    assigned_to: "dan.williams",
    sla_response_due: new Date("2026-02-03T14:00:00Z"),
    sla_resolution_due: new Date("2026-02-05T14:00:00Z"),
    created_at: new Date("2026-02-02T14:00:00Z"),
    updated_at: new Date("2026-02-02T14:30:00Z"),
    first_response_at: new Date("2026-02-02T14:30:00Z"),
    tags: ["billing", "licenses", "sales"]
  },
  {
    _id: ObjectId("720000000000000000000006"),
    ticket_id: "TKT-CUST-006",
    subject: "Data export feature not working",
    description: "When I try to export our data to CSV, the download starts but the file is always empty (0 bytes).",
    status: "pending",
    priority: "medium",
    category: "Technical > Export",
    source: "customer_portal",
    organization_id: "org-globex-002",
    contact_id: ObjectId("710000000000000000000004"),
    customer_email: "sara.support@globex.com",
    visibility: "organization",
    internal_notes: [],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000011"),
        content: "I've tested the export feature and can reproduce the issue. Can you tell me which browser and version you're using?",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-01T16:00:00Z")
      }
    ],
    assigned_to: "dan.williams",
    sla_response_due: new Date("2026-02-02T15:00:00Z"),
    sla_resolution_due: new Date("2026-02-04T15:00:00Z"),
    sla_response_met: true,
    created_at: new Date("2026-02-01T15:00:00Z"),
    updated_at: new Date("2026-02-01T16:00:00Z"),
    first_response_at: new Date("2026-02-01T16:00:00Z"),
    tags: ["export", "csv", "bug"]
  },
  // Resolved Globex ticket
  {
    _id: ObjectId("720000000000000000000007"),
    ticket_id: "TKT-CUST-007",
    subject: "How to set up SSO with Azure AD?",
    description: "We want to configure single sign-on with our Azure Active Directory. Where do I find the setup instructions?",
    status: "resolved",
    priority: "low",
    category: "How To > SSO",
    source: "customer_portal",
    organization_id: "org-globex-002",
    contact_id: ObjectId("710000000000000000000003"),
    customer_email: "mike.manager@globex.com",
    visibility: "organization",
    internal_notes: [],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000012"),
        content: "Here's our Azure AD SSO setup guide: kb.tamshai.com/articles/azure-ad-sso. Let me know if you have any questions!",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-01-25T10:00:00Z")
      },
      {
        note_id: ObjectId("730000000000000000000013"),
        content: "Perfect, got it set up! Thanks for the quick help.",
        author_type: "customer",
        author_id: "kc-mike-manager-001",
        author_name: "Mike Manager",
        created_at: new Date("2026-01-25T14:00:00Z")
      }
    ],
    sla_response_met: true,
    sla_resolution_met: true,
    created_at: new Date("2026-01-25T09:00:00Z"),
    resolved_at: new Date("2026-01-25T14:00:00Z"),
    closed_at: new Date("2026-01-25T14:30:00Z"),
    tags: ["sso", "azure-ad", "how-to", "resolved"]
  },

  // ==========================================================================
  // INITECH SOLUTIONS TICKETS
  // ==========================================================================
  {
    _id: ObjectId("720000000000000000000008"),
    ticket_id: "TKT-CUST-008",
    subject: "Feature request: Dark mode",
    description: "Would love to have a dark mode option for late-night work. The current interface is too bright.",
    status: "open",
    priority: "low",
    category: "Feature Request",
    source: "customer_portal",
    organization_id: "org-initech-003",
    contact_id: ObjectId("710000000000000000000006"),
    customer_email: "tim.tech@initech.com",
    visibility: "organization",
    internal_notes: [
      {
        note_id: ObjectId("730000000000000000000014"),
        content: "Added to product backlog. ETA Q2 2026.",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-01-20T11:00:00Z")
      }
    ],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000015"),
        content: "Thanks for the suggestion! I've passed this to our product team for consideration.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-01-20T11:30:00Z")
      }
    ],
    assigned_to: null,
    sla_response_met: true,
    created_at: new Date("2026-01-20T10:00:00Z"),
    updated_at: new Date("2026-01-20T11:30:00Z"),
    first_response_at: new Date("2026-01-20T11:30:00Z"),
    tags: ["feature-request", "ui", "dark-mode"]
  },
  {
    _id: ObjectId("720000000000000000000009"),
    ticket_id: "TKT-CUST-009",
    subject: "Invoice for January is incorrect",
    description: "Our January invoice shows charges for 10 users but we only have 5 active users. Please review and correct.",
    status: "open",
    priority: "medium",
    category: "Billing > Invoice",
    source: "customer_portal",
    organization_id: "org-initech-003",
    contact_id: ObjectId("710000000000000000000005"),
    customer_email: "peter.principal@initech.com",
    visibility: "organization",
    internal_notes: [
      {
        note_id: ObjectId("730000000000000000000016"),
        content: "Verified - they have 5 active users and 5 deactivated. System incorrectly counted all 10. Credit memo needed.",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-03T10:00:00Z")
      }
    ],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000017"),
        content: "I'm reviewing your account now. It looks like there was a billing error. I'll have a credit memo issued within 24 hours.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-03T10:30:00Z")
      }
    ],
    assigned_to: "dan.williams",
    sla_response_met: true,
    created_at: new Date("2026-02-03T09:00:00Z"),
    updated_at: new Date("2026-02-03T10:30:00Z"),
    first_response_at: new Date("2026-02-03T10:30:00Z"),
    tags: ["billing", "invoice", "error"]
  },

  // ==========================================================================
  // ADDITIONAL TICKETS FOR TESTING
  // ==========================================================================
  // Acme - more tickets for pagination testing
  {
    _id: ObjectId("720000000000000000000010"),
    ticket_id: "TKT-CUST-010",
    subject: "Integration with Slack not working",
    description: "The Slack integration stopped sending notifications yesterday. No error messages.",
    status: "open",
    priority: "medium",
    category: "Integration > Slack",
    source: "customer_portal",
    organization_id: "org-acme-001",
    contact_id: ObjectId("710000000000000000000001"),
    customer_email: "jane.smith@acme.com",
    visibility: "organization",
    internal_notes: [],
    customer_visible_notes: [],
    sla_response_due: new Date("2026-02-06T13:00:00Z"),
    sla_resolution_due: new Date("2026-02-07T09:00:00Z"),
    created_at: new Date("2026-02-05T13:00:00Z"),
    updated_at: new Date("2026-02-05T13:00:00Z"),
    tags: ["integration", "slack", "notifications"]
  },
  {
    _id: ObjectId("720000000000000000000011"),
    ticket_id: "TKT-CUST-011",
    subject: "Question about data retention policy",
    description: "How long do you retain our data? We need this for compliance documentation.",
    status: "resolved",
    priority: "low",
    category: "General > Compliance",
    source: "customer_portal",
    organization_id: "org-acme-001",
    contact_id: ObjectId("710000000000000000000002"),
    customer_email: "bob.developer@acme.com",
    visibility: "organization",
    internal_notes: [],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000018"),
        content: "Our data retention policy is available at tamshai.com/legal/retention. Enterprise customers have configurable retention from 30 days to 7 years.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-01-15T11:00:00Z")
      }
    ],
    sla_response_met: true,
    sla_resolution_met: true,
    created_at: new Date("2026-01-15T10:00:00Z"),
    resolved_at: new Date("2026-01-15T11:00:00Z"),
    closed_at: new Date("2026-01-15T11:30:00Z"),
    tags: ["compliance", "data-retention", "policy"]
  },
  // Globex - additional tickets
  {
    _id: ObjectId("720000000000000000000012"),
    ticket_id: "TKT-CUST-012",
    subject: "Mobile app crashes on launch",
    description: "The iOS mobile app crashes immediately after launch. iPhone 15 Pro, iOS 18.1.",
    status: "in_progress",
    priority: "high",
    category: "Technical > Mobile App",
    source: "customer_portal",
    organization_id: "org-globex-002",
    contact_id: ObjectId("710000000000000000000004"),
    customer_email: "sara.support@globex.com",
    visibility: "organization",
    internal_notes: [
      {
        note_id: ObjectId("730000000000000000000019"),
        content: "Reproduced on iOS 18.1. Crash log points to new auth flow. Dev team investigating.",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-04T15:00:00Z")
      }
    ],
    customer_visible_notes: [
      {
        note_id: ObjectId("730000000000000000000020"),
        content: "We've identified a compatibility issue with iOS 18.1. Our development team is working on a hotfix.",
        author_type: "agent",
        author_id: "emp-dan-williams",
        author_name: "Dan Williams",
        created_at: new Date("2026-02-04T15:30:00Z")
      }
    ],
    assigned_to: "dan.williams",
    sla_response_met: true,
    created_at: new Date("2026-02-04T14:00:00Z"),
    updated_at: new Date("2026-02-04T15:30:00Z"),
    first_response_at: new Date("2026-02-04T15:30:00Z"),
    tags: ["mobile", "ios", "crash", "ios18"]
  }
]);

// Add customer ticket specific indexes
db.tickets.createIndex({ organization_id: 1, created_at: -1 });
db.tickets.createIndex({ contact_id: 1, created_at: -1 });
db.tickets.createIndex({ organization_id: 1, status: 1 });
db.tickets.createIndex({ source: 1, created_at: -1 });

// =============================================================================
// AUDIT LOG COLLECTION
// =============================================================================
print("Creating audit log entries...");
db.audit_log.drop();
db.audit_log.insertMany([
  {
    _id: ObjectId("740000000000000000000001"),
    event_id: "evt-2026-02-05-001",
    event_type: "ticket_create",
    actor_type: "customer",
    actor_id: "kc-jane-smith-001",
    actor_email: "jane.smith@acme.com",
    target_type: "ticket",
    target_id: "TKT-CUST-001",
    organization_id: "org-acme-001",
    details: {
      action: "create_ticket",
      subject: "Unable to access analytics dashboard",
      priority: "high"
    },
    status: "success",
    timestamp: new Date("2026-02-05T09:00:00Z"),
    ip_address: "192.168.1.100",
    expires_at: new Date("2026-05-05T09:00:00Z")
  },
  {
    _id: ObjectId("740000000000000000000002"),
    event_id: "evt-2026-02-04-001",
    event_type: "ticket_create",
    actor_type: "customer",
    actor_id: "kc-bob-developer-001",
    actor_email: "bob.developer@acme.com",
    target_type: "ticket",
    target_id: "TKT-CUST-002",
    organization_id: "org-acme-001",
    details: {
      action: "create_ticket",
      subject: "API rate limit errors during peak hours",
      priority: "critical"
    },
    status: "success",
    timestamp: new Date("2026-02-04T09:00:00Z"),
    ip_address: "192.168.1.101",
    expires_at: new Date("2026-05-04T09:00:00Z")
  }
]);

// Create indexes for audit_log
db.audit_log.createIndex({ organization_id: 1, timestamp: -1 });
db.audit_log.createIndex({ actor_id: 1, timestamp: -1 });
db.audit_log.createIndex({ event_type: 1, timestamp: -1 });
db.audit_log.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

// =============================================================================
// PRINT SUMMARY
// =============================================================================
print("");
print("=== Customer Support Portal Sample Data Loaded ===");
print("Organizations: " + db.organizations.countDocuments());
print("Contacts: " + db.contacts.countDocuments());
print("Customer Tickets: " + db.tickets.countDocuments({ source: "customer_portal" }));
print("Audit Log Entries: " + db.audit_log.countDocuments());
print("");
print("Organizations breakdown:");
db.organizations.find({}, { organization_id: 1, name: 1, subscription_tier: 1 }).forEach(function(doc) {
  print("  " + doc.organization_id + ": " + doc.name + " (" + doc.subscription_tier + ")");
});
print("");
print("Contacts by organization:");
db.contacts.aggregate([
  { $group: { _id: "$organization_id", count: { $sum: 1 }, lead: { $sum: { $cond: ["$is_lead_contact", 1, 0] } } } },
  { $sort: { _id: 1 } }
]).forEach(function(doc) {
  print("  " + doc._id + ": " + doc.count + " contacts (" + doc.lead + " lead)");
});
print("");
print("Customer tickets by status:");
db.tickets.aggregate([
  { $match: { source: "customer_portal" } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]).forEach(function(doc) {
  print("  " + doc._id + ": " + doc.count);
});
