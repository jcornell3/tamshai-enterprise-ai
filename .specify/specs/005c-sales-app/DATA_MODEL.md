# Sales Application Data Model

## 1. Overview

This document defines the database schema for the Sales application. Data is stored in MongoDB for flexibility in handling CRM data structures.

**Database**: `tamshai_sales`
**Collections**: customers, opportunities, leads, activities, quotes

---

## 2. Core Collections

### 2.1 Customers

```javascript
// Collection: customers
{
  _id: ObjectId,
  external_id: String,              // Finance system reference

  // Company info
  name: String,                     // Required
  legal_name: String,
  industry: String,                 // technology, finance, healthcare, retail, etc.
  company_size: String,             // 1-10, 11-50, 51-200, 201-500, 500+
  website: String,
  logo_url: String,

  // Location
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String                 // Default: US
  },

  // Classification
  type: String,                     // prospect, customer, former, partner
  territory: String,                // west, east, central
  segment: String,                  // enterprise, mid_market, smb

  // Account ownership
  owner_id: String,                 // Employee ID (sales rep)
  team_id: String,

  // Financial
  arr: Number,                      // Current ARR
  lifetime_value: Number,           // Total revenue
  payment_terms: Number,            // Net days

  // Health
  health_score: Number,             // 0-100
  health_factors: {
    product_usage: Number,          // 0-25
    support_satisfaction: Number,   // 0-25
    engagement: Number,             // 0-25
    payment_history: Number         // 0-25
  },
  churn_risk: String,               // low, medium, high

  // Dates
  became_customer_date: Date,
  last_activity_date: Date,
  next_renewal_date: Date,

  // Metadata
  tags: [String],
  custom_fields: Object,
  created_at: Date,
  updated_at: Date,
  created_by: String
}

// Indexes
db.customers.createIndex({ name: "text", legal_name: "text" })
db.customers.createIndex({ type: 1 })
db.customers.createIndex({ owner_id: 1 })
db.customers.createIndex({ territory: 1 })
db.customers.createIndex({ health_score: 1 })
```

### 2.2 Contacts

```javascript
// Collection: contacts
{
  _id: ObjectId,
  customer_id: ObjectId,            // Required

  // Personal info
  first_name: String,
  last_name: String,
  email: String,
  phone: String,
  mobile: String,
  linkedin_url: String,

  // Role
  title: String,
  department: String,
  role: String,                     // decision_maker, influencer, champion, user, blocker
  influence_level: String,          // high, medium, low

  // Status
  is_primary: Boolean,              // Primary contact for account
  status: String,                   // active, left_company, unresponsive

  // Engagement
  last_contacted: Date,
  contact_frequency: String,        // weekly, monthly, quarterly

  // Metadata
  notes: String,
  created_at: Date,
  updated_at: Date
}

// Indexes
db.contacts.createIndex({ customer_id: 1 })
db.contacts.createIndex({ email: 1 })
db.contacts.createIndex({ role: 1 })
```

### 2.3 Opportunities

```javascript
// Collection: opportunities
{
  _id: ObjectId,
  opportunity_number: String,       // OPP-2024-0001

  // Core info
  name: String,                     // Required
  customer_id: ObjectId,            // Required
  owner_id: String,                 // Employee ID (sales rep)

  // Deal info
  amount: Number,                   // Required
  currency: String,                 // Default: USD
  stage: String,                    // prospecting, qualification, proposal, negotiation, verbal_commit, closed_won, closed_lost
  probability: Number,              // 0-100, derived from stage

  // Type
  deal_type: String,                // new_business, expansion, renewal
  source: String,                   // inbound, outbound, referral, partner

  // Products
  products: [{
    product_id: String,
    product_name: String,
    quantity: Number,
    unit_price: Number,
    discount_percent: Number,
    total: Number
  }],

  // Dates
  created_date: Date,
  expected_close_date: Date,
  actual_close_date: Date,

  // Close details (when closed)
  close_outcome: String,            // won, lost
  contract_value: Number,           // Actual signed value
  contract_term_months: Number,
  contract_start_date: Date,
  lost_reason: String,              // budget, competitor, timing, no_decision, other
  lost_competitor: String,
  close_notes: String,

  // Forecast
  forecast_category: String,        // commit, best_case, pipeline, omitted
  forecast_override_notes: String,

  // Weighted value (computed)
  weighted_amount: Number,          // amount * (probability / 100)

  // Related
  lead_id: ObjectId,                // Source lead
  primary_contact_id: ObjectId,
  invoice_id: String,               // Finance system reference

  // Competition
  competitors: [{
    name: String,
    threat_level: String,           // low, medium, high
    strengths: String,
    weaknesses: String
  }],

  // Next steps
  next_action: String,
  next_action_date: Date,

  // Metadata
  tags: [String],
  custom_fields: Object,
  created_at: Date,
  updated_at: Date,
  created_by: String
}

// Indexes
db.opportunities.createIndex({ customer_id: 1 })
db.opportunities.createIndex({ owner_id: 1 })
db.opportunities.createIndex({ stage: 1 })
db.opportunities.createIndex({ expected_close_date: 1 })
db.opportunities.createIndex({ forecast_category: 1 })
db.opportunities.createIndex({ "amount": -1 })
db.opportunities.createIndex({ created_at: -1 })
```

### 2.4 Leads

```javascript
// Collection: leads
{
  _id: ObjectId,
  lead_number: String,              // LEAD-2024-0001

  // Contact info
  first_name: String,
  last_name: String,
  email: String,                    // Required
  phone: String,
  title: String,

  // Company info
  company_name: String,
  company_size: String,
  industry: String,
  website: String,

  // Classification
  source: String,                   // website, webinar, trade_show, referral, cold_call
  campaign_id: String,              // Marketing campaign reference

  // Status
  status: String,                   // new, contacted, qualified, converted, disqualified
  owner_id: String,                 // Assigned sales rep

  // Scoring
  score: {
    total: Number,                  // 0-100
    factors: {
      company_size: Number,         // 0-25
      industry_fit: Number,         // 0-25
      engagement: Number,           // 0-25
      timing: Number                // 0-25
    }
  },

  // Qualification (BANT)
  qualification: {
    budget: String,                 // unknown, no_budget, has_budget
    authority: String,              // unknown, no_authority, has_authority
    need: String,                   // unknown, no_need, has_need
    timeline: String                // unknown, no_timeline, has_timeline
  },

  // Conversion
  converted_at: Date,
  converted_to_opportunity_id: ObjectId,
  converted_to_customer_id: ObjectId,

  // Disqualification
  disqualified_at: Date,
  disqualification_reason: String,

  // Engagement tracking
  first_contacted_at: Date,
  last_activity_at: Date,
  email_opens: Number,
  email_clicks: Number,
  website_visits: Number,

  // Notes
  notes: String,

  // Metadata
  tags: [String],
  created_at: Date,
  updated_at: Date
}

// Indexes
db.leads.createIndex({ status: 1 })
db.leads.createIndex({ owner_id: 1 })
db.leads.createIndex({ "score.total": -1 })
db.leads.createIndex({ source: 1 })
db.leads.createIndex({ created_at: -1 })
```

### 2.5 Activities

```javascript
// Collection: activities
{
  _id: ObjectId,

  // Related entity
  entity_type: String,              // customer, opportunity, lead, contact
  entity_id: ObjectId,

  // Activity info
  type: String,                     // call, email, meeting, demo, task, note
  subject: String,
  description: String,

  // Timing
  activity_date: Date,
  duration_minutes: Number,

  // Call specific
  call_direction: String,           // inbound, outbound
  call_outcome: String,             // connected, voicemail, no_answer

  // Email specific
  email_direction: String,          // sent, received
  email_opened: Boolean,
  email_clicked: Boolean,

  // Meeting specific
  meeting_type: String,             // in_person, video, phone
  meeting_location: String,
  attendees: [String],              // Contact names/emails

  // Task specific
  task_due_date: Date,
  task_completed: Boolean,
  task_completed_at: Date,

  // Ownership
  owner_id: String,                 // Who performed/owns activity
  assigned_to: String,              // For tasks

  // Metadata
  created_at: Date,
  updated_at: Date
}

// Indexes
db.activities.createIndex({ entity_type: 1, entity_id: 1 })
db.activities.createIndex({ owner_id: 1 })
db.activities.createIndex({ activity_date: -1 })
db.activities.createIndex({ type: 1 })
```

### 2.6 Quotes

```javascript
// Collection: quotes
{
  _id: ObjectId,
  quote_number: String,             // QTE-2024-0001

  // Related
  opportunity_id: ObjectId,         // Required
  customer_id: ObjectId,

  // Quote info
  name: String,
  version: Number,                  // 1, 2, 3...

  // Line items
  line_items: [{
    product_id: String,
    product_name: String,
    description: String,
    quantity: Number,
    unit_price: Number,
    discount_percent: Number,
    amount: Number
  }],

  // Totals
  subtotal: Number,
  discount_amount: Number,
  tax_amount: Number,
  total: Number,

  // Terms
  valid_until: Date,
  payment_terms: String,
  terms_and_conditions: String,

  // Status
  status: String,                   // draft, sent, viewed, accepted, rejected, expired

  // Tracking
  sent_at: Date,
  sent_to: String,
  first_viewed_at: Date,
  view_count: Number,
  accepted_at: Date,
  rejected_at: Date,

  // Documents
  pdf_url: String,

  // Metadata
  notes: String,
  created_at: Date,
  updated_at: Date,
  created_by: String
}

// Indexes
db.quotes.createIndex({ opportunity_id: 1 })
db.quotes.createIndex({ customer_id: 1 })
db.quotes.createIndex({ status: 1 })
db.quotes.createIndex({ valid_until: 1 })
```

---

## 3. Pipeline & Forecasting

### 3.1 Pipeline Stages Configuration

```javascript
// Collection: pipeline_stages
{
  _id: ObjectId,
  name: String,                     // Stage display name
  code: String,                     // Stage code
  probability: Number,              // Default probability
  sort_order: Number,
  is_closed: Boolean,
  is_won: Boolean,
  required_fields: [String],        // Fields required to enter stage
  exit_criteria: String,            // Description of what's needed
  created_at: Date
}

// Seed data
db.pipeline_stages.insertMany([
  { name: "Prospecting", code: "prospecting", probability: 10, sort_order: 1, is_closed: false, is_won: false },
  { name: "Qualification", code: "qualification", probability: 20, sort_order: 2, is_closed: false, is_won: false },
  { name: "Proposal", code: "proposal", probability: 40, sort_order: 3, is_closed: false, is_won: false },
  { name: "Negotiation", code: "negotiation", probability: 60, sort_order: 4, is_closed: false, is_won: false },
  { name: "Verbal Commit", code: "verbal_commit", probability: 80, sort_order: 5, is_closed: false, is_won: false },
  { name: "Closed Won", code: "closed_won", probability: 100, sort_order: 6, is_closed: true, is_won: true },
  { name: "Closed Lost", code: "closed_lost", probability: 0, sort_order: 7, is_closed: true, is_won: false }
])
```

### 3.2 Forecast Snapshots

```javascript
// Collection: forecast_snapshots
{
  _id: ObjectId,
  period: String,                   // "2024-02" (monthly)
  period_type: String,              // monthly, quarterly
  owner_id: String,                 // Sales rep or "team"
  team_id: String,

  // Quotas
  quota: Number,

  // Pipeline summary
  total_pipeline: Number,
  weighted_pipeline: Number,

  // Forecast categories
  commit: {
    count: Number,
    value: Number
  },
  best_case: {
    count: Number,
    value: Number
  },
  pipeline: {
    count: Number,
    value: Number
  },
  omitted: {
    count: Number,
    value: Number
  },

  // Closed
  closed_won: {
    count: Number,
    value: Number
  },
  closed_lost: {
    count: Number,
    value: Number
  },

  // Status
  status: String,                   // draft, submitted, approved
  submitted_at: Date,
  submitted_by: String,

  // Metadata
  snapshot_date: Date,
  created_at: Date
}

// Indexes
db.forecast_snapshots.createIndex({ period: 1, owner_id: 1 }, { unique: true })
db.forecast_snapshots.createIndex({ team_id: 1 })
```

---

## 4. Reference Data

### 4.1 Products

```javascript
// Collection: products
{
  _id: ObjectId,
  name: String,
  code: String,
  description: String,
  category: String,                 // subscription, services, addon
  pricing: {
    monthly: Number,
    annual: Number,
    setup_fee: Number
  },
  active: Boolean,
  created_at: Date
}
```

### 4.2 Territories

```javascript
// Collection: territories
{
  _id: ObjectId,
  name: String,                     // West, East, Central
  code: String,                     // west, east, central
  states: [String],                 // ["CA", "WA", "OR", "AZ"]
  manager_id: String,
  active: Boolean
}

// Seed data
db.territories.insertMany([
  { name: "West", code: "west", states: ["CA", "WA", "OR", "AZ", "NV", "UT", "CO"] },
  { name: "East", code: "east", states: ["NY", "MA", "FL", "NJ", "PA", "GA", "NC"] },
  { name: "Central", code: "central", states: ["TX", "IL", "OH", "MI", "MN", "MO", "TN"] }
])
```

### 4.3 Lost Reasons

```javascript
// Collection: lost_reasons
{
  _id: ObjectId,
  code: String,
  name: String,
  description: String,
  requires_competitor: Boolean,
  sort_order: Number
}

// Seed data
db.lost_reasons.insertMany([
  { code: "budget", name: "Budget/Price", description: "Customer couldn't afford our solution", requires_competitor: false, sort_order: 1 },
  { code: "competitor", name: "Lost to Competitor", description: "Customer chose another vendor", requires_competitor: true, sort_order: 2 },
  { code: "timing", name: "Bad Timing", description: "Customer not ready to buy now", requires_competitor: false, sort_order: 3 },
  { code: "no_decision", name: "No Decision", description: "Customer decided to do nothing", requires_competitor: false, sort_order: 4 },
  { code: "feature_gap", name: "Feature Gap", description: "Missing required functionality", requires_competitor: false, sort_order: 5 },
  { code: "internal_solution", name: "Internal Solution", description: "Customer built it themselves", requires_competitor: false, sort_order: 6 },
  { code: "other", name: "Other", description: "Other reason", requires_competitor: false, sort_order: 99 }
])
```

---

## 5. Access Control

### 5.1 MongoDB Role-Based Filtering

Sales data access is controlled via query filters applied by the MCP server based on user roles:

```javascript
// MCP server applies these filters
function buildAccessFilter(userContext) {
  const { userId, roles, teamId } = userContext;

  // Executives see everything
  if (roles.includes('executive')) {
    return {};
  }

  // Sales managers see their team
  if (roles.includes('manager')) {
    return {
      $or: [
        { owner_id: userId },
        { team_id: teamId }
      ]
    };
  }

  // Sales reps see only their own
  if (roles.includes('sales-read') || roles.includes('sales-write')) {
    return { owner_id: userId };
  }

  // No access
  return { _id: null };
}
```

### 5.2 Field-Level Access

```javascript
// Fields hidden from non-owners
const restrictedFields = [
  'competitors',           // Competitive intel
  'close_notes',           // Internal notes
  'forecast_override_notes'
];

// Applied in MCP tool responses
function sanitizeOpportunity(opp, userContext) {
  if (opp.owner_id !== userContext.userId && !userContext.roles.includes('manager')) {
    restrictedFields.forEach(field => delete opp[field]);
  }
  return opp;
}
```

---

## 6. Sample Data Requirements

### 6.1 Customer Distribution

| Type | Count | ARR Range |
|------|-------|-----------|
| Enterprise | 5 | $50K-$200K |
| Mid-Market | 15 | $10K-$50K |
| SMB | 30 | $5K-$15K |
| Prospects | 50 | $0 |

### 6.2 Opportunity Pipeline

| Stage | Count | Total Value |
|-------|-------|-------------|
| Prospecting | 10 | $250,000 |
| Qualification | 8 | $320,000 |
| Proposal | 6 | $450,000 |
| Negotiation | 4 | $280,000 |
| Verbal Commit | 2 | $150,000 |
| **Pipeline Total** | **30** | **$1,450,000** |

### 6.3 Lead Distribution

| Status | Count |
|--------|-------|
| New | 20 |
| Contacted | 15 |
| Qualified | 8 |
| Converted | 12 |
| Disqualified | 25 |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial Sales data model |
| 1.1 | Feb 2026 | Added forecasting, quotes collections |
