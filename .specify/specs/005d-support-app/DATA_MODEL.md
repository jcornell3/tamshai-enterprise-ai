# Support Application Data Model

## 1. Overview

This document defines the database schema for the Support application. Tickets and related data are stored in MongoDB, while Knowledge Base articles use Elasticsearch for full-text search capabilities.

**MongoDB Database**: `tamshai_support`
**Elasticsearch Index**: `tamshai-kb`

---

## 2. MongoDB Collections

### 2.1 Tickets

```javascript
// Collection: tickets
{
  _id: ObjectId,
  ticket_number: String,            // TKT-2024-0001

  // Customer info
  customer_id: String,              // Sales CRM reference
  customer_name: String,            // Denormalized for display
  customer_tier: String,            // starter, professional, enterprise
  contact: {
    name: String,
    email: String,
    phone: String
  },

  // Ticket info
  subject: String,                  // Required
  description: String,              // Initial message
  channel: String,                  // email, chat, phone, portal

  // Classification
  category: String,                 // Top-level category
  subcategory: String,              // Specific issue type
  tags: [String],

  // Priority & Status
  priority: String,                 // critical, high, medium, low
  status: String,                   // open, pending, resolved, closed
  is_escalated: Boolean,
  escalation_reason: String,

  // Assignment
  assigned_to: String,              // Agent employee ID
  assigned_team: String,
  assigned_at: Date,
  assigned_by: String,

  // SLA
  sla_policy_id: ObjectId,
  response_due: Date,
  resolution_due: Date,
  first_response_at: Date,
  response_sla_met: Boolean,
  resolution_sla_met: Boolean,

  // Resolution
  resolved_at: Date,
  resolved_by: String,
  resolution_type: String,          // solved, wont_fix, duplicate, customer_no_response
  resolution_summary: String,
  root_cause: String,
  related_kb_article_id: String,

  // Customer satisfaction
  csat_requested: Boolean,
  csat_sent_at: Date,
  csat_rating: Number,              // 1-5
  csat_comment: String,
  csat_submitted_at: Date,

  // Merging
  is_merged: Boolean,
  merged_into_ticket_id: ObjectId,
  merged_ticket_ids: [ObjectId],    // Tickets merged into this one

  // Related
  related_ticket_ids: [ObjectId],

  // Metadata
  source_email_id: String,          // Original email message ID
  custom_fields: Object,
  created_at: Date,
  updated_at: Date,
  created_by: String,
  closed_at: Date
}

// Indexes
db.tickets.createIndex({ ticket_number: 1 }, { unique: true })
db.tickets.createIndex({ customer_id: 1 })
db.tickets.createIndex({ status: 1 })
db.tickets.createIndex({ priority: 1 })
db.tickets.createIndex({ assigned_to: 1 })
db.tickets.createIndex({ created_at: -1 })
db.tickets.createIndex({ resolution_due: 1 })
db.tickets.createIndex({ is_escalated: 1 })
db.tickets.createIndex({ subject: "text", description: "text" })
```

### 2.2 Ticket Comments

```javascript
// Collection: ticket_comments
{
  _id: ObjectId,
  ticket_id: ObjectId,              // Required

  // Content
  body: String,                     // HTML or Markdown
  body_plain: String,               // Plain text version

  // Type
  type: String,                     // reply, internal_note, system
  is_internal: Boolean,             // Not visible to customer
  is_customer: Boolean,             // From customer

  // Author
  author_type: String,              // agent, customer, system
  author_id: String,                // Employee ID or contact email
  author_name: String,

  // Attachments
  attachments: [{
    file_name: String,
    file_size: Number,
    mime_type: String,
    storage_url: String             // MinIO path
  }],

  // Email tracking
  email_message_id: String,
  email_sent_at: Date,
  email_opened_at: Date,

  // Canned response
  canned_response_id: ObjectId,

  // Metadata
  created_at: Date
}

// Indexes
db.ticket_comments.createIndex({ ticket_id: 1, created_at: 1 })
db.ticket_comments.createIndex({ author_id: 1 })
```

### 2.3 Ticket Activities

```javascript
// Collection: ticket_activities
{
  _id: ObjectId,
  ticket_id: ObjectId,              // Required

  // Activity info
  activity_type: String,            // status_change, assignment, priority_change, escalation, sla_breach, merge
  description: String,              // Human-readable description

  // Change details
  field_changed: String,
  old_value: String,
  new_value: String,

  // Actor
  performed_by: String,             // Employee ID or "system"
  performed_by_name: String,

  // Metadata
  created_at: Date
}

// Indexes
db.ticket_activities.createIndex({ ticket_id: 1, created_at: -1 })
```

### 2.4 SLA Policies

```javascript
// Collection: sla_policies
{
  _id: ObjectId,
  name: String,                     // "Enterprise SLA"
  tier: String,                     // starter, professional, enterprise

  // Response times (in minutes)
  response_time: {
    critical: Number,               // e.g., 30
    high: Number,                   // e.g., 120
    medium: Number,                 // e.g., 240
    low: Number                     // e.g., 480
  },

  // Resolution times (in minutes)
  resolution_time: {
    critical: Number,
    high: Number,
    medium: Number,
    low: Number
  },

  // Business hours
  business_hours: {
    timezone: String,               // "America/Los_Angeles"
    schedule: {                     // Day: [start_hour, end_hour] or null
      monday: [Number, Number],     // [9, 17] = 9am-5pm
      tuesday: [Number, Number],
      wednesday: [Number, Number],
      thursday: [Number, Number],
      friday: [Number, Number],
      saturday: null,
      sunday: null
    }
  },
  is_24x7: Boolean,                 // Override business hours

  // Escalation rules
  escalation_rules: [{
    trigger: String,                // sla_50, sla_75, sla_breach
    action: String,                 // notify, escalate
    notify: [String]                // Email addresses or roles
  }],

  active: Boolean,
  created_at: Date
}

// Seed data
db.sla_policies.insertMany([
  {
    name: "Starter SLA",
    tier: "starter",
    response_time: { critical: 1440, high: 2880, medium: 2880, low: 2880 },  // 24h, 48h
    resolution_time: { critical: 10080, high: 10080, medium: 10080, low: 10080 },  // 7 days
    business_hours: {
      timezone: "America/Los_Angeles",
      schedule: { monday: [9, 17], tuesday: [9, 17], wednesday: [9, 17], thursday: [9, 17], friday: [9, 17], saturday: null, sunday: null }
    },
    is_24x7: false,
    active: true
  },
  {
    name: "Professional SLA",
    tier: "professional",
    response_time: { critical: 240, high: 480, medium: 1440, low: 1440 },  // 4h, 8h, 24h
    resolution_time: { critical: 1440, high: 2880, medium: 4320, low: 4320 },  // 1d, 2d, 3d
    business_hours: {
      timezone: "America/Los_Angeles",
      schedule: { monday: [6, 20], tuesday: [6, 20], wednesday: [6, 20], thursday: [6, 20], friday: [6, 20], saturday: null, sunday: null }
    },
    is_24x7: false,
    active: true
  },
  {
    name: "Enterprise SLA",
    tier: "enterprise",
    response_time: { critical: 30, high: 60, medium: 240, low: 240 },  // 30m, 1h, 4h
    resolution_time: { critical: 240, high: 480, medium: 1440, low: 1440 },  // 4h, 8h, 24h
    is_24x7: true,
    active: true
  }
])
```

### 2.5 Canned Responses

```javascript
// Collection: canned_responses
{
  _id: ObjectId,
  name: String,                     // "Password Reset Instructions"
  shortcut: String,                 // "/password-reset"
  category: String,                 // General, Technical, Billing
  content: String,                  // HTML template with variables
  variables: [String],              // ["customer_name", "reset_link"]
  usage_count: Number,
  created_by: String,
  created_at: Date,
  updated_at: Date
}

// Index
db.canned_responses.createIndex({ shortcut: 1 })
db.canned_responses.createIndex({ category: 1 })
```

### 2.6 CSAT Surveys

```javascript
// Collection: csat_surveys
{
  _id: ObjectId,
  ticket_id: ObjectId,              // Required
  customer_email: String,

  // Survey data
  survey_token: String,             // Unique token for survey link
  sent_at: Date,
  opened_at: Date,

  // Response
  rating: Number,                   // 1-5
  comment: String,
  submitted_at: Date,

  // Agent
  agent_id: String,

  // Expiry
  expires_at: Date,                 // 7 days after sent

  created_at: Date
}

// Indexes
db.csat_surveys.createIndex({ ticket_id: 1 })
db.csat_surveys.createIndex({ survey_token: 1 }, { unique: true })
db.csat_surveys.createIndex({ agent_id: 1, submitted_at: -1 })
```

### 2.7 Agent Metrics (Daily Snapshots)

```javascript
// Collection: agent_metrics
{
  _id: ObjectId,
  agent_id: String,                 // Required
  date: Date,                       // Snapshot date (start of day)

  // Volume
  tickets_assigned: Number,
  tickets_resolved: Number,
  tickets_reopened: Number,

  // Time metrics (in minutes)
  total_handle_time: Number,
  avg_handle_time: Number,
  total_response_time: Number,
  avg_first_response_time: Number,

  // SLA
  response_sla_met: Number,
  response_sla_breached: Number,
  resolution_sla_met: Number,
  resolution_sla_breached: Number,

  // CSAT
  csat_responses: Number,
  csat_total_score: Number,
  csat_avg_score: Number,

  created_at: Date
}

// Indexes
db.agent_metrics.createIndex({ agent_id: 1, date: -1 })
db.agent_metrics.createIndex({ date: -1 })
```

---

## 3. Elasticsearch Schema

### 3.1 Knowledge Base Articles

```json
// Index: tamshai-kb
// Mapping:
{
  "mappings": {
    "properties": {
      "article_id": { "type": "keyword" },
      "title": {
        "type": "text",
        "analyzer": "english",
        "fields": {
          "keyword": { "type": "keyword" },
          "suggest": { "type": "completion" }
        }
      },
      "slug": { "type": "keyword" },
      "category": { "type": "keyword" },
      "subcategory": { "type": "keyword" },
      "content": {
        "type": "text",
        "analyzer": "english"
      },
      "summary": {
        "type": "text",
        "analyzer": "english"
      },
      "tags": { "type": "keyword" },
      "related_articles": { "type": "keyword" },

      "status": { "type": "keyword" },
      "visibility": { "type": "keyword" },

      "author_id": { "type": "keyword" },
      "author_name": { "type": "text" },

      "views": { "type": "integer" },
      "helpful_yes": { "type": "integer" },
      "helpful_no": { "type": "integer" },
      "helpful_ratio": { "type": "float" },

      "created_at": { "type": "date" },
      "updated_at": { "type": "date" },
      "published_at": { "type": "date" }
    }
  }
}

// Sample document
{
  "article_id": "kb-2024-0001",
  "title": "How to Reset Your Password",
  "slug": "how-to-reset-password",
  "category": "Troubleshooting",
  "subcategory": "Login Issues",
  "content": "If you've forgotten your password, follow these steps...",
  "summary": "Step-by-step guide to reset your account password.",
  "tags": ["password", "login", "account", "reset"],
  "related_articles": ["kb-2024-0002", "kb-2024-0003"],

  "status": "published",
  "visibility": "public",

  "author_id": "emp-123",
  "author_name": "Jane Support",

  "views": 1234,
  "helpful_yes": 98,
  "helpful_no": 5,
  "helpful_ratio": 0.95,

  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z",
  "published_at": "2024-01-01T12:00:00Z"
}
```

### 3.2 Article Categories

```javascript
// MongoDB Collection: kb_categories (reference data)
{
  _id: ObjectId,
  name: String,
  slug: String,
  parent_id: ObjectId,              // For subcategories
  sort_order: Number,
  article_count: Number,            // Denormalized
  created_at: Date
}

// Seed data
db.kb_categories.insertMany([
  { name: "Getting Started", slug: "getting-started", parent_id: null, sort_order: 1 },
  { name: "Account Setup", slug: "account-setup", parent_id: ObjectId("...getting-started"), sort_order: 1 },
  { name: "First Login", slug: "first-login", parent_id: ObjectId("...getting-started"), sort_order: 2 },
  { name: "Product Features", slug: "product-features", parent_id: null, sort_order: 2 },
  { name: "Dashboard", slug: "dashboard", parent_id: ObjectId("...product-features"), sort_order: 1 },
  { name: "Troubleshooting", slug: "troubleshooting", parent_id: null, sort_order: 3 },
  { name: "Login Issues", slug: "login-issues", parent_id: ObjectId("...troubleshooting"), sort_order: 1 },
  { name: "API Documentation", slug: "api-documentation", parent_id: null, sort_order: 4 },
  { name: "FAQ", slug: "faq", parent_id: null, sort_order: 5 }
])
```

### 3.3 Article Versions (MongoDB)

```javascript
// Collection: kb_article_versions
{
  _id: ObjectId,
  article_id: String,               // ES article ID
  version: Number,                  // 1, 2, 3...
  title: String,
  content: String,
  change_summary: String,
  created_by: String,
  created_at: Date
}

// Index
db.kb_article_versions.createIndex({ article_id: 1, version: -1 })
```

---

## 4. Reference Data

### 4.1 Ticket Categories

```javascript
// Collection: ticket_categories
{
  _id: ObjectId,
  name: String,
  code: String,
  parent_id: ObjectId,
  sort_order: Number,
  active: Boolean
}

// Seed data
db.ticket_categories.insertMany([
  { name: "Technical Support", code: "TECH", parent_id: null, sort_order: 1 },
  { name: "Login Issues", code: "TECH-LOGIN", parent_id: ObjectId("...TECH"), sort_order: 1 },
  { name: "Performance", code: "TECH-PERF", parent_id: ObjectId("...TECH"), sort_order: 2 },
  { name: "Error Messages", code: "TECH-ERR", parent_id: ObjectId("...TECH"), sort_order: 3 },
  { name: "Integration", code: "TECH-INT", parent_id: ObjectId("...TECH"), sort_order: 4 },
  { name: "Billing", code: "BILL", parent_id: null, sort_order: 2 },
  { name: "Invoice Questions", code: "BILL-INV", parent_id: ObjectId("...BILL"), sort_order: 1 },
  { name: "Payment Issues", code: "BILL-PAY", parent_id: ObjectId("...BILL"), sort_order: 2 },
  { name: "Feature Requests", code: "FEAT", parent_id: null, sort_order: 3 },
  { name: "General Inquiry", code: "GEN", parent_id: null, sort_order: 4 }
])
```

### 4.2 Ticket Priorities

```javascript
// Priority configuration (application code)
const PRIORITIES = {
  critical: {
    name: "Critical",
    color: "#dc2626",
    sla_multiplier: 1.0,
    sort_order: 1
  },
  high: {
    name: "High",
    color: "#f97316",
    sla_multiplier: 1.0,
    sort_order: 2
  },
  medium: {
    name: "Medium",
    color: "#eab308",
    sla_multiplier: 1.0,
    sort_order: 3
  },
  low: {
    name: "Low",
    color: "#22c55e",
    sla_multiplier: 1.0,
    sort_order: 4
  }
};
```

### 4.3 Ticket Statuses

```javascript
// Status configuration (application code)
const STATUSES = {
  open: {
    name: "Open",
    color: "#0ea5e9",
    is_open: true,
    is_resolved: false
  },
  pending: {
    name: "Pending Customer",
    color: "#eab308",
    is_open: true,
    is_resolved: false
  },
  resolved: {
    name: "Resolved",
    color: "#22c55e",
    is_open: false,
    is_resolved: true
  },
  closed: {
    name: "Closed",
    color: "#64748b",
    is_open: false,
    is_resolved: true
  }
};
```

---

## 5. Access Control

### 5.1 MongoDB Query Filters

```javascript
function buildTicketAccessFilter(userContext) {
  const { userId, roles, teamId } = userContext;

  // Executives see everything
  if (roles.includes('executive')) {
    return {};
  }

  // Managers see their team's tickets
  if (roles.includes('manager')) {
    return {
      $or: [
        { assigned_to: userId },
        { assigned_team: teamId }
      ]
    };
  }

  // Agents see assigned tickets + unassigned
  if (roles.includes('support-read') || roles.includes('support-write')) {
    return {
      $or: [
        { assigned_to: userId },
        { assigned_to: null }
      ]
    };
  }

  return { _id: null };
}
```

### 5.2 Internal Note Visibility

```javascript
// Filter out internal notes for customers (API level)
function sanitizeCommentsForCustomer(comments) {
  return comments.filter(c => !c.is_internal);
}
```

---

## 6. Sample Data Requirements

### 6.1 Ticket Distribution

| Status | Count | Priority Mix |
|--------|-------|--------------|
| Open | 25 | 2 Critical, 5 High, 12 Medium, 6 Low |
| Pending | 15 | 1 Critical, 3 High, 8 Medium, 3 Low |
| Resolved (7d) | 50 | Mix |
| Closed (30d) | 150 | Mix |

### 6.2 Knowledge Base Articles

| Category | Article Count |
|----------|---------------|
| Getting Started | 8 |
| Product Features | 12 |
| Troubleshooting | 15 |
| API Documentation | 10 |
| FAQ | 8 |
| **Total** | **53** |

### 6.3 SLA Distribution

| Tier | Customer Count | Ticket % |
|------|----------------|----------|
| Enterprise | 5 | 20% |
| Professional | 15 | 40% |
| Starter | 30 | 40% |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial Support data model |
| 1.1 | Feb 2026 | Added SLA policies, CSAT surveys |
