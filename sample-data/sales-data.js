// Tamshai Corp Sales CRM Sample Data
// MongoDB initialization script

// Switch to the sales database
db = db.getSiblingDB('tamshai_sales');

// =============================================================================
// CUSTOMERS COLLECTION
// =============================================================================
db.customers.drop();
db.customers.insertMany([
  {
    _id: ObjectId("650000000000000000000001"),
    company_name: "Acme Corporation",
    industry: "Manufacturing",
    company_size: "Enterprise",
    website: "https://www.acmecorp.example.com",
    annual_revenue: 500000000,
    employee_count: 5000,
    address: {
      street: "123 Industrial Way",
      city: "Detroit",
      state: "MI",
      zip: "48201",
      country: "USA"
    },
    contacts: [
      {
        _id: ObjectId("660000000000000000000001"),
        name: "John Smith",
        title: "VP of Operations",
        email: "john.smith@acmecorp.example.com",  // CONFIDENTIAL: sales-write only
        phone: "+1-555-123-4567",                   // CONFIDENTIAL: sales-write only
        is_primary: true
      },
      {
        _id: ObjectId("660000000000000000000002"),
        name: "Sarah Johnson",
        title: "Procurement Manager",
        email: "sarah.j@acmecorp.example.com",
        phone: "+1-555-123-4568",
        is_primary: false
      }
    ],
    tags: ["enterprise", "manufacturing", "high-value"],
    status: "ACTIVE",
    created_at: new Date("2025-03-15"),
    updated_at: new Date("2026-01-03"),
    account_owner: "carol.johnson"
  },
  {
    _id: ObjectId("650000000000000000000002"),
    company_name: "TechStart Inc",
    industry: "Technology",
    company_size: "Mid-Market",
    website: "https://www.techstart.example.com",
    annual_revenue: 25000000,
    employee_count: 150,
    address: {
      street: "456 Innovation Blvd",
      city: "San Francisco",
      state: "CA",
      zip: "94105",
      country: "USA"
    },
    contacts: [
      {
        _id: ObjectId("660000000000000000000003"),
        name: "Emily Chen",
        title: "CTO",
        email: "emily@techstart.example.com",
        phone: "+1-555-234-5678",
        is_primary: true
      }
    ],
    tags: ["technology", "startup", "fast-growth"],
    status: "ACTIVE",
    created_at: new Date("2025-01-10"),
    updated_at: new Date("2026-01-02"),
    account_owner: "ryan.garcia"
  },
  {
    _id: ObjectId("650000000000000000000003"),
    company_name: "Global Finance Partners",
    industry: "Financial Services",
    company_size: "Enterprise",
    website: "https://www.gfp.example.com",
    annual_revenue: 1200000000,
    employee_count: 8500,
    address: {
      street: "789 Wall Street",
      city: "New York",
      state: "NY",
      zip: "10005",
      country: "USA"
    },
    contacts: [
      {
        _id: ObjectId("660000000000000000000004"),
        name: "Michael Brown",
        title: "Head of Technology",
        email: "m.brown@gfp.example.com",
        phone: "+1-555-345-6789",
        is_primary: true
      },
      {
        _id: ObjectId("660000000000000000000005"),
        name: "Lisa Park",
        title: "Senior Director, IT",
        email: "l.park@gfp.example.com",
        phone: "+1-555-345-6790",
        is_primary: false
      }
    ],
    tags: ["enterprise", "financial", "regulated"],
    status: "ACTIVE",
    created_at: new Date("2023-08-20"),
    updated_at: new Date("2026-01-04"),
    account_owner: "amanda.white"
  },
  {
    _id: ObjectId("650000000000000000000004"),
    company_name: "HealthCare Plus",
    industry: "Healthcare",
    company_size: "Mid-Market",
    website: "https://www.healthcareplus.example.com",
    annual_revenue: 75000000,
    employee_count: 450,
    address: {
      street: "321 Medical Center Dr",
      city: "Boston",
      state: "MA",
      zip: "02115",
      country: "USA"
    },
    contacts: [
      {
        _id: ObjectId("660000000000000000000006"),
        name: "Dr. Robert Lee",
        title: "Chief Medical Officer",
        email: "r.lee@healthcareplus.example.com",
        phone: "+1-555-456-7890",
        is_primary: true
      }
    ],
    tags: ["healthcare", "hipaa", "compliance-sensitive"],
    status: "ACTIVE",
    created_at: new Date("2025-11-05"),
    updated_at: new Date("2026-01-05"),
    account_owner: "chris.taylor"
  },
  {
    _id: ObjectId("650000000000000000000005"),
    company_name: "RetailMax",
    industry: "Retail",
    company_size: "Enterprise",
    website: "https://www.retailmax.example.com",
    annual_revenue: 850000000,
    employee_count: 12000,
    address: {
      street: "555 Commerce Way",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      country: "USA"
    },
    contacts: [
      {
        _id: ObjectId("660000000000000000000007"),
        name: "Jennifer Martinez",
        title: "VP of Digital",
        email: "j.martinez@retailmax.example.com",
        phone: "+1-555-567-8901",
        is_primary: true
      }
    ],
    tags: ["enterprise", "retail", "omnichannel"],
    status: "PROSPECT",
    created_at: new Date("2025-06-15"),
    updated_at: new Date("2026-01-02"),
    account_owner: "carol.johnson"
  }
]);

// =============================================================================
// DEALS/OPPORTUNITIES COLLECTION
// =============================================================================
db.deals.drop();
db.deals.insertMany([
  {
    _id: ObjectId("670000000000000000000001"),
    deal_name: "Acme Corp Enterprise License",
    customer_id: ObjectId("650000000000000000000001"),
    stage: "CLOSED_WON",
    value: 450000,                    // CONFIDENTIAL: sales-write for exact value
    currency: "USD",
    probability: 100,
    expected_close_date: new Date("2025-11-30"),
    actual_close_date: new Date("2025-11-28"),
    deal_type: "NEW_BUSINESS",
    products: ["Enterprise Platform", "Premium Support"],
    notes: "Multi-year agreement with expansion clause",
    owner: "carol.johnson",
    created_at: new Date("2025-09-15"),
    updated_at: new Date("2026-01-02"),
    activities: [
      { type: "CALL", date: new Date("2025-09-20"), summary: "Initial discovery call" },
      { type: "DEMO", date: new Date("2025-10-05"), summary: "Platform demo" },
      { type: "PROPOSAL", date: new Date("2025-10-20"), summary: "Sent proposal" },
      { type: "NEGOTIATION", date: new Date("2025-11-15"), summary: "Contract negotiation" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000002"),
    deal_name: "TechStart Growth Package",
    customer_id: ObjectId("650000000000000000000002"),
    stage: "PROPOSAL",
    value: 85000,
    currency: "USD",
    probability: 60,
    expected_close_date: new Date("2026-01-31"),
    actual_close_date: null,
    deal_type: "NEW_BUSINESS",
    products: ["Growth Platform", "Standard Support"],
    notes: "Fast-growing startup, budget conscious",
    owner: "ryan.garcia",
    created_at: new Date("2025-11-01"),
    updated_at: new Date("2026-01-03"),
    activities: [
      { type: "CALL", date: new Date("2025-11-05"), summary: "Intro call with CTO" },
      { type: "DEMO", date: new Date("2025-11-20"), summary: "Technical demo" },
      { type: "PROPOSAL", date: new Date("2025-12-15"), summary: "Proposal sent" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000003"),
    deal_name: "GFP Platform Expansion",
    customer_id: ObjectId("650000000000000000000003"),
    stage: "NEGOTIATION",
    value: 750000,
    currency: "USD",
    probability: 75,
    expected_close_date: new Date("2026-01-31"),
    actual_close_date: null,
    deal_type: "EXPANSION",
    products: ["Enterprise Platform", "Premium Support", "Security Add-on"],
    notes: "Expanding from 3 to 8 departments",
    owner: "amanda.white",
    created_at: new Date("2025-10-01"),
    updated_at: new Date("2026-01-04"),
    activities: [
      { type: "MEETING", date: new Date("2025-10-15"), summary: "QBR with stakeholders" },
      { type: "DEMO", date: new Date("2025-11-10"), summary: "New features demo" },
      { type: "PROPOSAL", date: new Date("2025-12-01"), summary: "Expansion proposal" },
      { type: "NEGOTIATION", date: new Date("2025-12-20"), summary: "Legal review" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000004"),
    deal_name: "HealthCare Plus Pilot",
    customer_id: ObjectId("650000000000000000000004"),
    stage: "DISCOVERY",
    value: 125000,
    currency: "USD",
    probability: 30,
    expected_close_date: new Date("2026-03-31"),
    actual_close_date: null,
    deal_type: "NEW_BUSINESS",
    products: ["Healthcare Edition", "Compliance Module"],
    notes: "Requires HIPAA compliance certification review",
    owner: "chris.taylor",
    created_at: new Date("2025-12-01"),
    updated_at: new Date("2026-01-05"),
    activities: [
      { type: "CALL", date: new Date("2025-12-05"), summary: "Initial outreach" },
      { type: "MEETING", date: new Date("2025-12-20"), summary: "Discovery meeting" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000005"),
    deal_name: "RetailMax Digital Transformation",
    customer_id: ObjectId("650000000000000000000005"),
    stage: "QUALIFICATION",
    value: 1200000,
    currency: "USD",
    probability: 20,
    expected_close_date: new Date("2026-06-30"),
    actual_close_date: null,
    deal_type: "NEW_BUSINESS",
    products: ["Enterprise Platform", "Retail Module", "Integration Services"],
    notes: "Large opportunity, long sales cycle expected",
    owner: "carol.johnson",
    created_at: new Date("2025-11-15"),
    updated_at: new Date("2026-01-02"),
    activities: [
      { type: "CALL", date: new Date("2025-11-20"), summary: "Cold outreach" },
      { type: "MEETING", date: new Date("2025-12-10"), summary: "Initial meeting" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000006"),
    deal_name: "Acme Corp Support Renewal",
    customer_id: ObjectId("650000000000000000000001"),
    stage: "CLOSED_WON",
    value: 95000,
    currency: "USD",
    probability: 100,
    expected_close_date: new Date("2025-12-31"),
    actual_close_date: new Date("2025-12-20"),
    deal_type: "RENEWAL",
    products: ["Premium Support"],
    notes: "Annual support renewal",
    owner: "carol.johnson",
    created_at: new Date("2025-11-01"),
    updated_at: new Date("2026-01-02"),
    activities: [
      { type: "CALL", date: new Date("2025-11-15"), summary: "Renewal discussion" },
      { type: "CONTRACT", date: new Date("2025-12-15"), summary: "Signed renewal" }
    ]
  },
  // Q1 2026 Deals
  {
    _id: ObjectId("670000000000000000000007"),
    deal_name: "TechStart Platform Upgrade",
    customer_id: ObjectId("650000000000000000000002"),
    stage: "CLOSED_WON",
    value: 125000,
    currency: "USD",
    probability: 100,
    expected_close_date: new Date("2026-01-31"),
    actual_close_date: new Date("2026-01-28"),
    deal_type: "EXPANSION",
    products: ["Enterprise Platform", "Integration Services"],
    notes: "Upgrading from Growth to Enterprise tier",
    owner: "ryan.garcia",
    created_at: new Date("2025-12-10"),
    updated_at: new Date("2026-01-28"),
    activities: [
      { type: "CALL", date: new Date("2025-12-15"), summary: "Discussed upgrade path" },
      { type: "DEMO", date: new Date("2026-01-10"), summary: "Enterprise features demo" },
      { type: "PROPOSAL", date: new Date("2026-01-15"), summary: "Upgrade proposal sent" },
      { type: "CONTRACT", date: new Date("2026-01-28"), summary: "Contract signed" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000008"),
    deal_name: "GFP Security Add-on",
    customer_id: ObjectId("650000000000000000000003"),
    stage: "CLOSED_WON",
    value: 180000,
    currency: "USD",
    probability: 100,
    expected_close_date: new Date("2026-01-31"),
    actual_close_date: new Date("2026-01-25"),
    deal_type: "EXPANSION",
    products: ["Security Add-on", "Compliance Module"],
    notes: "Added security features for regulatory compliance",
    owner: "amanda.white",
    created_at: new Date("2025-12-01"),
    updated_at: new Date("2026-01-25"),
    activities: [
      { type: "MEETING", date: new Date("2025-12-05"), summary: "Security requirements review" },
      { type: "DEMO", date: new Date("2025-12-20"), summary: "Security features demo" },
      { type: "PROPOSAL", date: new Date("2026-01-05"), summary: "Proposal submitted" },
      { type: "CONTRACT", date: new Date("2026-01-25"), summary: "Deal closed" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000009"),
    deal_name: "Manufacturing Co Starter Package",
    customer_id: ObjectId("650000000000000000000001"),
    stage: "PROPOSAL",
    value: 65000,
    currency: "USD",
    probability: 70,
    expected_close_date: new Date("2026-02-15"),
    actual_close_date: null,
    deal_type: "NEW_BUSINESS",
    products: ["Starter Platform", "Basic Support"],
    notes: "Manufacturing company referred by Acme Corp",
    owner: "ryan.garcia",
    created_at: new Date("2026-01-05"),
    updated_at: new Date("2026-01-08"),
    activities: [
      { type: "CALL", date: new Date("2026-01-05"), summary: "Initial discovery call" },
      { type: "DEMO", date: new Date("2026-01-08"), summary: "Platform walkthrough" }
    ]
  },
  {
    _id: ObjectId("670000000000000000000010"),
    deal_name: "RetailMax Integration Services",
    customer_id: ObjectId("650000000000000000000005"),
    stage: "NEGOTIATION",
    value: 250000,
    currency: "USD",
    probability: 65,
    expected_close_date: new Date("2026-02-28"),
    actual_close_date: null,
    deal_type: "NEW_BUSINESS",
    products: ["Enterprise Platform", "Retail Module", "Integration Services", "Premium Support"],
    notes: "Large retail chain, complex integration requirements",
    owner: "carol.johnson",
    created_at: new Date("2025-12-15"),
    updated_at: new Date("2026-01-08"),
    activities: [
      { type: "MEETING", date: new Date("2025-12-20"), summary: "Initial stakeholder meeting" },
      { type: "DEMO", date: new Date("2026-01-05"), summary: "Retail-specific features demo" },
      { type: "PROPOSAL", date: new Date("2026-01-08"), summary: "Comprehensive proposal submitted" }
    ]
  }
]);

// =============================================================================
// PIPELINE SUMMARY (for read-only access)
// Historical data for dashboard and reporting
// =============================================================================
db.pipeline_summary.drop();
db.pipeline_summary.insertMany([
  // Q1 2026 (Current Quarter)
  {
    _id: "2026-Q1",
    quarter: "Q1",
    fiscal_year: 2026,
    updated_at: new Date(),
    stages: {
      qualification: { count: 1, value: 1200000 },
      discovery: { count: 1, value: 125000 },
      proposal: { count: 2, value: 150000 },  // Added Manufacturing Co $65k
      negotiation: { count: 2, value: 1000000 },  // Added RetailMax $250k
      closed_won: { count: 4, value: 850000 },  // Added TechStart $125k + GFP $180k
      closed_lost: { count: 0, value: 0 }
    },
    total_pipeline: 3325000,  // Increased from 2160000
    weighted_pipeline: 910000,  // Recalculated based on probabilities
    closed_won_ytd: 850000,  // Updated from 545000
    target: 2500000,
    attainment_pct: 34  // 850k / 2500k = 34%
  },
  // Q4 2025 (Previous Quarter)
  {
    _id: "2025-Q4",
    quarter: "Q4",
    fiscal_year: 2025,
    updated_at: new Date("2025-12-31"),
    stages: {
      qualification: { count: 2, value: 850000 },
      discovery: { count: 3, value: 425000 },
      proposal: { count: 2, value: 320000 },
      negotiation: { count: 2, value: 680000 },
      closed_won: { count: 8, value: 2150000 },
      closed_lost: { count: 2, value: 175000 }
    },
    total_pipeline: 4425000,
    weighted_pipeline: 1850000,
    closed_won_ytd: 2150000,
    target: 2200000,
    attainment_pct: 98
  },
  // Q3 2025
  {
    _id: "2025-Q3",
    quarter: "Q3",
    fiscal_year: 2025,
    updated_at: new Date("2025-09-30"),
    stages: {
      qualification: { count: 4, value: 1100000 },
      discovery: { count: 2, value: 380000 },
      proposal: { count: 3, value: 450000 },
      negotiation: { count: 1, value: 520000 },
      closed_won: { count: 6, value: 1680000 },
      closed_lost: { count: 1, value: 120000 }
    },
    total_pipeline: 4130000,
    weighted_pipeline: 1420000,
    closed_won_ytd: 1680000,
    target: 2000000,
    attainment_pct: 84
  },
  // Q2 2025
  {
    _id: "2025-Q2",
    quarter: "Q2",
    fiscal_year: 2025,
    updated_at: new Date("2025-06-30"),
    stages: {
      qualification: { count: 3, value: 720000 },
      discovery: { count: 4, value: 560000 },
      proposal: { count: 2, value: 280000 },
      negotiation: { count: 2, value: 410000 },
      closed_won: { count: 5, value: 1450000 },
      closed_lost: { count: 2, value: 180000 }
    },
    total_pipeline: 3420000,
    weighted_pipeline: 1250000,
    closed_won_ytd: 1450000,
    target: 1800000,
    attainment_pct: 81
  },
  // FY2025 Annual Summary
  {
    _id: "2025-ANNUAL",
    quarter: "ANNUAL",
    fiscal_year: 2025,
    updated_at: new Date("2025-12-31"),
    stages: {
      qualification: { count: 0, value: 0 },
      discovery: { count: 0, value: 0 },
      proposal: { count: 0, value: 0 },
      negotiation: { count: 0, value: 0 },
      closed_won: { count: 24, value: 7280000 },
      closed_lost: { count: 6, value: 575000 }
    },
    total_pipeline: 0,
    weighted_pipeline: 0,
    closed_won_ytd: 7280000,
    target: 8000000,
    attainment_pct: 91
  }
]);

// =============================================================================
// SALES ACTIVITIES LOG
// =============================================================================
db.activities.drop();
db.activities.insertMany([
  {
    _id: ObjectId("680000000000000000000001"),
    type: "CALL",
    subject: "Discovery call with Acme Corp",
    description: "Discussed their current challenges with legacy systems",
    customer_id: ObjectId("650000000000000000000001"),
    deal_id: ObjectId("670000000000000000000001"),
    owner: "carol.johnson",
    date: new Date("2026-01-02"),
    duration_minutes: 45,
    outcome: "POSITIVE",
    next_steps: "Schedule technical demo"
  },
  {
    _id: ObjectId("680000000000000000000002"),
    type: "EMAIL",
    subject: "Follow-up: TechStart proposal",
    description: "Sent detailed proposal with pricing options",
    customer_id: ObjectId("650000000000000000000002"),
    deal_id: ObjectId("670000000000000000000002"),
    owner: "ryan.garcia",
    date: new Date("2026-01-03"),
    duration_minutes: 0,
    outcome: "NEUTRAL",
    next_steps: "Follow up in one week"
  },
  {
    _id: ObjectId("680000000000000000000003"),
    type: "MEETING",
    subject: "QBR with Global Finance Partners",
    description: "Quarterly business review discussing expansion",
    customer_id: ObjectId("650000000000000000000003"),
    deal_id: ObjectId("670000000000000000000003"),
    owner: "amanda.white",
    date: new Date("2026-01-04"),
    duration_minutes: 90,
    outcome: "POSITIVE",
    next_steps: "Prepare expansion proposal"
  }
]);

// =============================================================================
// INDEXES
// =============================================================================
db.customers.createIndex({ "company_name": 1 });
db.customers.createIndex({ "industry": 1 });
db.customers.createIndex({ "account_owner": 1 });
db.customers.createIndex({ "status": 1 });
db.customers.createIndex({ "tags": 1 });

db.deals.createIndex({ "customer_id": 1 });
db.deals.createIndex({ "stage": 1 });
db.deals.createIndex({ "owner": 1 });
db.deals.createIndex({ "expected_close_date": 1 });

db.activities.createIndex({ "customer_id": 1 });
db.activities.createIndex({ "deal_id": 1 });
db.activities.createIndex({ "owner": 1 });
db.activities.createIndex({ "date": -1 });

print("Sales CRM data initialized successfully!");
