# Quaderno Sales Tax API & Reporting Schema

**Research Date**: February 2, 2026
**Sources**: Quaderno API Documentation, Quaderno Connect Platform

---

## Overview

Quaderno provides a powerful REST API for sales tax, VAT, and GST calculations across 12,000+ jurisdictions worldwide. This document captures their data schemas and patterns for implementation in the Tamshai Tax module.

---

## Tax Calculation API

### Core Calculation Factors

Tax calculations are based on three primary factors:

| Factor | Description | Source |
|--------|-------------|--------|
| Registered Jurisdictions | Where business has tax obligations | Account configuration |
| Product Details | Type and classification | Transaction or defaults |
| Customer Location | Ship-to address for goods, residence for services | Transaction data |

### Product Type Tax Rules

| Product Type | Tax Calculation Basis |
|--------------|----------------------|
| Physical Goods | Origin + Destination (ship from/to) |
| Digital Services (SaaS, e-Books) | Customer location + registered jurisdictions |
| Consulting | Seller's local rate only |
| Other Services | Seller's local rate universally |

### Account Configuration Requirements

```typescript
interface QuadernoAccountConfig {
  // Tax jurisdictions where business is registered
  registeredJurisdictions: Jurisdiction[];

  // Default product classification
  defaultProductType: 'goods' | 'services' | 'digital';

  // Default tax code for products
  defaultTaxCode: string;
}

interface Jurisdiction {
  country: string;         // ISO 3166-1 alpha-2
  state?: string;          // For US states
  taxId: string;           // Local tax registration ID
  registeredAt: Date;      // When registration became effective
  thresholds?: Threshold[];
}

interface Threshold {
  type: 'economic_nexus' | 'vat' | 'gst';
  amount: number;
  currency: string;
  period: 'annual' | 'quarterly';
  currentAmount: number;
  percentToThreshold: number;
}
```

---

## Tax Jurisdiction Schema

### US State Nexus Tracking

```typescript
interface USNexusStatus {
  state: string;              // Two-letter state code
  stateName: string;          // Full state name
  nexusEstablished: boolean;  // Whether nexus exists
  nexusType: 'physical' | 'economic' | 'both' | 'none';

  // Economic nexus thresholds
  economicNexus: {
    salesThreshold: number;      // e.g., $100,000
    transactionThreshold: number; // e.g., 200 transactions
    salesYTD: number;
    transactionsYTD: number;
    percentToThreshold: number;
    projectedThresholdDate?: Date;
  };

  // Registration status
  registration: {
    status: 'not_required' | 'required' | 'registered' | 'pending';
    registrationId?: string;
    effectiveDate?: Date;
    filingFrequency?: 'monthly' | 'quarterly' | 'annual';
  };
}
```

### International Tax Jurisdictions

```typescript
interface InternationalJurisdiction {
  country: string;
  countryCode: string;
  region?: string;

  taxType: 'vat' | 'gst' | 'sales_tax' | 'consumption';
  standardRate: number;
  reducedRates?: {
    rate: number;
    description: string;
    applicableProducts: string[];
  }[];

  // Threshold tracking
  threshold: {
    amount: number;
    currency: string;
    currentSales: number;
    percentToThreshold: number;
  };

  // Compliance requirements
  compliance: {
    registrationRequired: boolean;
    filingFrequency: string;
    vatMossEligible?: boolean;  // EU VAT MOSS scheme
  };
}
```

---

## Tax Report Schema

### Transaction Tax Report

```typescript
interface TaxReport {
  reportId: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
    type: 'monthly' | 'quarterly' | 'annual';
  };

  // Summary by jurisdiction
  jurisdictionSummaries: JurisdictionSummary[];

  // Individual transactions
  transactions: TaxTransaction[];

  // Totals
  totals: {
    grossSales: number;
    taxableSales: number;
    exemptSales: number;
    totalTaxCollected: number;
    currency: string;
  };

  // Export options
  exports: {
    csv: string;     // URL to CSV download
    pdf: string;     // URL to PDF report
    json: string;    // URL to JSON data
  };
}

interface JurisdictionSummary {
  jurisdiction: string;
  country: string;
  state?: string;

  grossSales: number;
  taxableSales: number;
  exemptSales: number;
  taxCollected: number;

  taxRate: number;
  transactionCount: number;

  // Filing info
  filingDeadline: Date;
  filingStatus: 'not_due' | 'due' | 'filed' | 'overdue';
}

interface TaxTransaction {
  transactionId: string;
  date: Date;
  type: 'sale' | 'refund' | 'adjustment';

  customer: {
    id: string;
    name: string;
    country: string;
    state?: string;
    taxExempt: boolean;
    exemptionCertificate?: string;
  };

  items: {
    description: string;
    productType: string;
    taxCode: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
  }[];

  totals: {
    subtotal: number;
    taxAmount: number;
    total: number;
  };

  taxJurisdiction: string;
  taxCalculationDetails: {
    originAddress?: string;
    destinationAddress: string;
    appliedRate: number;
    rateBreakdown?: {
      state: number;
      county: number;
      city: number;
      special: number;
    };
  };
}
```

### Filing Period Structure

```typescript
interface FilingPeriod {
  periodId: string;
  jurisdiction: string;
  periodType: 'monthly' | 'quarterly' | 'annual';

  startDate: Date;
  endDate: Date;
  filingDeadline: Date;
  paymentDeadline: Date;

  status: FilingStatus;

  amounts: {
    grossSales: number;
    taxableSales: number;
    taxCollected: number;
    taxOwed: number;
    credits: number;
    netOwed: number;
  };

  // Audit trail
  filedAt?: Date;
  filedBy?: string;
  confirmationNumber?: string;
  paymentConfirmation?: string;
}

type FilingStatus =
  | 'not_started'    // Period hasn't ended
  | 'pending_review' // Period ended, awaiting review
  | 'reviewed'       // Ready to file
  | 'filed'          // Submitted to tax authority
  | 'paid'           // Payment confirmed
  | 'overdue';       // Past deadline, not filed
```

---

## Nexus Tracking & Alerts

### Threshold Alert Schema

```typescript
interface ThresholdAlert {
  alertId: string;
  createdAt: Date;
  jurisdiction: string;

  alertType: 'approaching' | 'exceeded' | 'registration_required';
  threshold: {
    type: 'economic_nexus' | 'vat' | 'gst';
    amount: number;
    currentAmount: number;
    percentReached: number;
  };

  message: string;
  suggestedAction: string;
  actionUrl: string;

  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}
```

### Webhook Events for Nexus

```typescript
// Webhook event types
type NexusWebhookEvent =
  | 'nexus.threshold.approaching'  // 80% of threshold
  | 'nexus.threshold.exceeded'     // Threshold crossed
  | 'nexus.registration.required'  // Must register
  | 'nexus.filing.due'             // Filing deadline approaching
  | 'nexus.filing.overdue';        // Past deadline

interface NexusWebhookPayload {
  event: NexusWebhookEvent;
  timestamp: Date;
  jurisdiction: string;
  details: Record<string, unknown>;
}
```

---

## Export Formats

### CSV Export Structure

```csv
transaction_id,date,customer_name,customer_country,customer_state,product_type,subtotal,tax_rate,tax_amount,total,jurisdiction
TXN-001,2026-01-15,Acme Corp,US,CA,digital,100.00,7.25,7.25,107.25,US-CA
TXN-002,2026-01-16,Euro Ltd,DE,,digital,200.00,19.00,38.00,238.00,DE
```

### JSON Export Structure

```json
{
  "report": {
    "period": "2026-Q1",
    "generated_at": "2026-04-05T12:00:00Z"
  },
  "summary": {
    "total_gross": 50000.00,
    "total_tax": 4250.00,
    "jurisdictions": [
      {
        "code": "US-CA",
        "gross": 30000.00,
        "tax": 2175.00,
        "rate": 7.25
      }
    ]
  },
  "transactions": [...]
}
```

### PDF Report Sections

1. **Executive Summary** - Total sales, tax collected, jurisdictions
2. **Jurisdiction Breakdown** - Table per jurisdiction with totals
3. **Transaction Detail** - Optional detailed listing
4. **Filing Calendar** - Upcoming deadlines
5. **Compliance Status** - Registration and filing status

---

## Implementation Recommendations for Tamshai

### Tax Module Database Schema

```sql
-- Tax jurisdictions where company is registered
CREATE TABLE tax.jurisdictions (
    id UUID PRIMARY KEY,
    country_code VARCHAR(2) NOT NULL,
    state_code VARCHAR(10),
    tax_type VARCHAR(20) NOT NULL,
    tax_id VARCHAR(100),
    standard_rate DECIMAL(5,4),
    effective_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Economic nexus tracking
CREATE TABLE tax.nexus_tracking (
    id UUID PRIMARY KEY,
    jurisdiction_id UUID REFERENCES tax.jurisdictions(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    sales_threshold DECIMAL(12,2),
    transaction_threshold INTEGER,
    current_sales DECIMAL(12,2) DEFAULT 0,
    current_transactions INTEGER DEFAULT 0,
    threshold_exceeded BOOLEAN DEFAULT FALSE,
    threshold_exceeded_at TIMESTAMPTZ,
    UNIQUE(jurisdiction_id, period_start)
);

-- Tax transactions
CREATE TABLE tax.transactions (
    id UUID PRIMARY KEY,
    invoice_id UUID,
    transaction_date DATE NOT NULL,
    customer_country VARCHAR(2),
    customer_state VARCHAR(10),
    product_type VARCHAR(20),
    subtotal DECIMAL(12,2),
    tax_rate DECIMAL(5,4),
    tax_amount DECIMAL(12,2),
    jurisdiction_id UUID REFERENCES tax.jurisdictions(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Filing periods
CREATE TABLE tax.filing_periods (
    id UUID PRIMARY KEY,
    jurisdiction_id UUID REFERENCES tax.jurisdictions(id),
    period_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    filing_deadline DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'not_started',
    gross_sales DECIMAL(12,2),
    tax_collected DECIMAL(12,2),
    tax_owed DECIMAL(12,2),
    filed_at TIMESTAMPTZ,
    confirmation_number VARCHAR(100),
    UNIQUE(jurisdiction_id, period_start)
);
```

### MCP Tax Server Tools

```typescript
// Tool definitions for MCP Tax Server
const taxTools = [
  'list_jurisdictions',        // Get registered tax jurisdictions
  'get_nexus_status',          // Check nexus status by state
  'get_filing_periods',        // Get filing periods and deadlines
  'get_tax_report',            // Generate tax report for period
  'get_threshold_alerts',      // Get nexus threshold warnings
  'calculate_tax',             // Calculate tax for transaction
  'export_report'              // Export report in CSV/PDF/JSON
];
```

---

## References

- [Quaderno API Documentation](https://developers.quaderno.io/)
- [Quaderno Tax Calculations Guide](https://developers.quaderno.io/guides/tax-calculations/)
- [Quaderno Connect Platform](https://quaderno.io/connect/)
- [Quaderno REST API](https://quaderno.io/api/)
