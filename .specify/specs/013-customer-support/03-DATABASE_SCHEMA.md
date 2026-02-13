# Customer Support Portal - Database Schema

## 1. Overview

The Customer Support Portal extends the existing MongoDB support database with new collections for organizations, contacts, and enhanced ticket structure.

## 2. Collections

### 2.1 Organizations

Stores customer organization information.

```javascript
// Collection: support.organizations
{
  _id: ObjectId("65a1b2c3d4e5f6a7b8c9d0e1"),

  // Organization Identity
  organization_id: "org-acme-001",  // Business key, matches JWT claim
  name: "Acme Corporation",
  domain: "acme.com",              // For email domain validation

  // Subscription
  subscription_tier: "enterprise", // enterprise | professional | basic
  subscription_start: ISODate("2024-01-15"),
  subscription_end: ISODate("2025-01-15"),

  // SLA Configuration
  settings: {
    sla_tier: "premium",           // premium | standard | basic
    max_tickets_per_month: 100,
    max_contacts: 20,
    response_time_hours: 4,        // SLA target
    resolution_time_hours: 24
  },

  // Contact Limits
  current_contacts: 3,

  // Metadata
  created_at: ISODate("2024-01-15T10:00:00Z"),
  updated_at: ISODate("2024-06-01T14:30:00Z"),
  created_by: "admin",

  // Status
  status: "active"                 // active | suspended | churned
}

// Indexes
db.organizations.createIndex({ organization_id: 1 }, { unique: true });
db.organizations.createIndex({ domain: 1 });
db.organizations.createIndex({ subscription_tier: 1, status: 1 });
```

### 2.2 Contacts

Stores customer contact information linked to Keycloak users.

```javascript
// Collection: support.contacts
{
  _id: ObjectId("65a2b3c4d5e6f7a8b9c0d1e2"),

  // Identity
  keycloak_user_id: "kc-customer-uuid-001",  // Links to Keycloak
  organization_id: "org-acme-001",

  // Profile
  email: "jane.smith@acme.com",
  first_name: "Jane",
  last_name: "Smith",
  phone: "+1-555-123-4567",
  title: "IT Director",

  // Role
  role: "lead",                    // lead | basic
  is_lead_contact: true,           // Denormalized for quick queries

  // Permissions
  permissions: {
    can_view_org_tickets: true,
    can_manage_contacts: true,
    can_transfer_lead: true
  },

  // Preferences
  notification_preferences: {
    email_on_ticket_update: true,
    email_on_ticket_resolved: true,
    email_digest: "daily"          // none | daily | weekly
  },

  // Activity
  last_login: ISODate("2024-12-15T09:30:00Z"),
  ticket_count: 12,

  // Metadata
  created_at: ISODate("2024-01-15T10:30:00Z"),
  updated_at: ISODate("2024-12-15T09:30:00Z"),
  invited_by: "admin",

  // Status
  status: "active"                 // active | pending | disabled
}

// Indexes
db.contacts.createIndex({ keycloak_user_id: 1 }, { unique: true });
db.contacts.createIndex({ organization_id: 1 });
db.contacts.createIndex({ email: 1 }, { unique: true });
db.contacts.createIndex({ organization_id: 1, is_lead_contact: 1 });
```

### 2.3 Tickets (Enhanced)

Extends existing tickets collection with customer-specific fields.

```javascript
// Collection: support.tickets
{
  _id: ObjectId("65a3b4c5d6e7f8a9b0c1d2e3"),

  // Existing Fields (unchanged)
  ticket_id: "TKT-2024-0001",
  subject: "Unable to access dashboard",
  description: "After the latest update, I can no longer access the analytics dashboard...",
  priority: "high",                // critical | high | medium | low
  status: "open",                  // open | pending | resolved | closed
  category: "Technical > Access Issues",

  // ========== NEW CUSTOMER FIELDS ==========

  // Organization & Contact (for customer tickets)
  source: "customer_portal",       // customer_portal | internal | email | phone
  organization_id: "org-acme-001", // null for internal tickets
  contact_id: ObjectId("65a2b3c4d5e6f7a8b9c0d1e2"),  // Customer who created
  customer_email: "jane.smith@acme.com",

  // Visibility Control
  visibility: "organization",      // organization | private | internal_only
  // organization = all org contacts can see
  // private = only creator can see
  // internal_only = employees only (internal tickets)

  // Separate Note Collections
  internal_notes: [
    {
      note_id: ObjectId("65b1c2d3e4f5a6b7c8d9e0f1"),
      content: "Customer has premium SLA - escalate if not resolved in 2 hours",
      author_id: "emp-alice-chen",
      author_name: "Alice Chen",
      created_at: ISODate("2024-12-15T10:00:00Z")
    }
  ],

  customer_visible_notes: [
    {
      note_id: ObjectId("65b2c3d4e5f6a7b8c9d0e1f2"),
      content: "Thank you for your patience. We are investigating this issue.",
      author_type: "agent",        // agent | customer
      author_id: "emp-bob-support",
      author_name: "Bob Support",
      created_at: ISODate("2024-12-15T10:15:00Z")
    },
    {
      note_id: ObjectId("65b3c4d5e6f7a8b9c0d1e2f3"),
      content: "I tried clearing my cache but the issue persists.",
      author_type: "customer",
      author_id: "kc-customer-uuid-001",
      author_name: "Jane Smith",
      created_at: ISODate("2024-12-15T10:30:00Z")
    }
  ],

  // ========== END NEW FIELDS ==========

  // Existing Assignment & SLA
  assigned_to: "emp-bob-support",
  assigned_at: ISODate("2024-12-15T09:45:00Z"),
  sla_response_due: ISODate("2024-12-15T13:00:00Z"),
  sla_resolution_due: ISODate("2024-12-16T09:00:00Z"),
  sla_response_met: true,
  sla_resolution_met: null,

  // Existing Timestamps
  created_at: ISODate("2024-12-15T09:00:00Z"),
  updated_at: ISODate("2024-12-15T10:30:00Z"),
  first_response_at: ISODate("2024-12-15T10:15:00Z"),
  resolved_at: null,
  closed_at: null,

  // Tags & Attachments
  tags: ["dashboard", "access-issue", "premium-customer"],
  attachments: [
    {
      filename: "screenshot.png",
      url: "minio://support-attachments/TKT-2024-0001/screenshot.png",
      size: 245000,
      mime_type: "image/png",
      uploaded_by: "jane.smith@acme.com",
      uploaded_at: ISODate("2024-12-15T09:05:00Z")
    }
  ]
}

// Additional Indexes for Customer Access
db.tickets.createIndex({ organization_id: 1, created_at: -1 });
db.tickets.createIndex({ contact_id: 1, created_at: -1 });
db.tickets.createIndex({ organization_id: 1, status: 1 });
db.tickets.createIndex({ source: 1, created_at: -1 });
```

### 2.4 Audit Log

Tracks all customer-related write operations for compliance.

```javascript
// Collection: support.audit_log
{
  _id: ObjectId("65a4b5c6d7e8f9a0b1c2d3e4"),

  // Event Identity
  event_id: "evt-2024-12-15-001",
  event_type: "lead_transfer",     // lead_transfer | contact_invite | ticket_create | etc.

  // Actor
  actor_type: "customer",          // customer | employee | system
  actor_id: "kc-customer-uuid-001",
  actor_email: "jane.smith@acme.com",

  // Target
  target_type: "contact",
  target_id: "kc-customer-uuid-002",

  // Context
  organization_id: "org-acme-001",

  // Event Details
  details: {
    action: "transfer_lead_role",
    from_contact: "jane.smith@acme.com",
    to_contact: "bob.developer@acme.com",
    reason: "Changing primary contact",
    confirmation_id: "conf-abc123"
  },

  // Result
  status: "success",               // success | failed | cancelled
  error_message: null,

  // Metadata
  timestamp: ISODate("2024-12-15T14:00:00Z"),
  ip_address: "192.168.1.100",
  user_agent: "Mozilla/5.0...",

  // Retention
  expires_at: ISODate("2025-03-15T14:00:00Z")  // 90-day retention
}

// Indexes
db.audit_log.createIndex({ organization_id: 1, timestamp: -1 });
db.audit_log.createIndex({ actor_id: 1, timestamp: -1 });
db.audit_log.createIndex({ event_type: 1, timestamp: -1 });
db.audit_log.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
```

### 2.5 Pending Invitations

Tracks contact invitations awaiting acceptance.

```javascript
// Collection: support.contact_invitations
{
  _id: ObjectId("65a5b6c7d8e9f0a1b2c3d4e5"),

  invitation_id: "inv-2024-12-15-001",

  // Organization
  organization_id: "org-acme-001",

  // Invitee
  email: "new.contact@acme.com",
  first_name: "New",
  last_name: "Contact",
  role: "basic",

  // Inviter
  invited_by: "kc-customer-uuid-001",
  invited_by_email: "jane.smith@acme.com",

  // Token
  invitation_token: "inv-token-xyz123",  // Hashed

  // Timestamps
  created_at: ISODate("2024-12-15T10:00:00Z"),
  expires_at: ISODate("2024-12-22T10:00:00Z"),  // 7 days
  accepted_at: null,

  // Status
  status: "pending"                // pending | accepted | expired | revoked
}

// Indexes
db.contact_invitations.createIndex({ invitation_token: 1 }, { unique: true });
db.contact_invitations.createIndex({ organization_id: 1, status: 1 });
db.contact_invitations.createIndex({ email: 1 });
db.contact_invitations.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
```

## 3. Data Migration

For existing tickets without customer fields:

```javascript
// Migration script: add_customer_fields_to_tickets.js
db.tickets.updateMany(
  { source: { $exists: false } },
  {
    $set: {
      source: "internal",
      organization_id: null,
      contact_id: null,
      customer_email: null,
      visibility: "internal_only",
      internal_notes: [],
      customer_visible_notes: []
    }
  }
);

// Migrate existing notes to internal_notes
db.tickets.find({ notes: { $exists: true } }).forEach(function(ticket) {
  const internalNotes = ticket.notes.map(note => ({
    ...note,
    note_id: new ObjectId()
  }));

  db.tickets.updateOne(
    { _id: ticket._id },
    {
      $set: { internal_notes: internalNotes },
      $unset: { notes: "" }
    }
  );
});
```

## 4. Queries for Customer Access

### 4.1 Lead Customer - Get Organization Tickets

```javascript
// Lead can see all org tickets (visibility = 'organization' or their own)
db.tickets.find({
  organization_id: "org-acme-001",
  $or: [
    { visibility: "organization" },
    { contact_id: ObjectId("65a2b3c4d5e6f7a8b9c0d1e2") }
  ]
})
.project({
  internal_notes: 0  // NEVER return internal notes
})
.sort({ created_at: -1 })
.limit(50);
```

### 4.2 Basic Customer - Get Own Tickets

```javascript
// Basic customer can only see own tickets
db.tickets.find({
  contact_id: ObjectId("65a2b3c4d5e6f7a8b9c0d1e2")
})
.project({
  internal_notes: 0  // NEVER return internal notes
})
.sort({ created_at: -1 })
.limit(50);
```

### 4.3 Internal Agent - Full Ticket View

```javascript
// Internal agents see everything including internal notes
db.tickets.find({
  ticket_id: "TKT-2024-0001"
});
```

## 5. Sample Data

See `infrastructure/database/sample-data/support-customers.js` for complete sample data including:

- 3 Organizations (Acme, Globex, Initech)
- 6 Contacts (2 per org, 1 lead + 1 basic)
- 15+ Customer Tickets with mixed visibility
- Audit log entries
