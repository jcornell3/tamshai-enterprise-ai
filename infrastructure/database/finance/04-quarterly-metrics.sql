-- Quarterly Metrics Table
-- Stores aggregated quarterly financial metrics for reporting

CREATE TABLE IF NOT EXISTS finance.quarterly_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quarter_name VARCHAR(2) NOT NULL CHECK (quarter_name IN ('Q1', 'Q2', 'Q3', 'Q4')),
    fiscal_year INTEGER NOT NULL CHECK (fiscal_year >= 2020 AND fiscal_year <= 2030),

    -- Core financials
    revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
    expenses DECIMAL(15,2) NOT NULL DEFAULT 0,
    profit DECIMAL(15,2) GENERATED ALWAYS AS (revenue - expenses) STORED,

    -- Recurring revenue metrics
    mrr DECIMAL(15,2) NOT NULL DEFAULT 0, -- Monthly Recurring Revenue
    arr DECIMAL(15,2) NOT NULL DEFAULT 0, -- Annual Recurring Revenue

    -- Customer health metrics
    churn_rate DECIMAL(5,2) NOT NULL DEFAULT 0, -- Percentage
    nps INTEGER CHECK (nps >= -100 AND nps <= 100), -- Net Promoter Score

    -- ARR waterfall components
    arr_beginning DECIMAL(15,2) NOT NULL DEFAULT 0,
    arr_new_business DECIMAL(15,2) NOT NULL DEFAULT 0,
    arr_expansion DECIMAL(15,2) NOT NULL DEFAULT 0,
    arr_contraction DECIMAL(15,2) NOT NULL DEFAULT 0,
    arr_churn DECIMAL(15,2) NOT NULL DEFAULT 0,
    arr_ending DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per quarter/year combination
    UNIQUE (quarter_name, fiscal_year)
);

-- Index for common queries
CREATE INDEX idx_quarterly_metrics_quarter_year
    ON finance.quarterly_metrics(quarter_name, fiscal_year);

-- RLS Policies
ALTER TABLE finance.quarterly_metrics ENABLE ROW LEVEL SECURITY;

-- Finance read/write roles can see all quarterly metrics
CREATE POLICY quarterly_metrics_finance_read ON finance.quarterly_metrics
    FOR SELECT
    USING (
        current_setting('app.current_user_roles') LIKE '%finance-read%' OR
        current_setting('app.current_user_roles') LIKE '%finance-write%' OR
        current_setting('app.current_user_roles') LIKE '%executive%'
    );

-- Finance write role can insert/update metrics
CREATE POLICY quarterly_metrics_finance_write ON finance.quarterly_metrics
    FOR ALL
    USING (
        current_setting('app.current_user_roles') LIKE '%finance-write%' OR
        current_setting('app.current_user_roles') LIKE '%executive%'
    );

-- Sample data for testing
INSERT INTO finance.quarterly_metrics (
    quarter_name, fiscal_year, revenue, expenses, mrr, arr, churn_rate, nps,
    arr_beginning, arr_new_business, arr_expansion, arr_contraction, arr_churn, arr_ending
) VALUES
    -- Q4 2024
    ('Q4', 2024, 1150000, 780000, 383333, 4600000, 3.0, 42,
     4300000, 250000, 120000, 50000, 120000, 4600000),

    -- Q1 2025
    ('Q1', 2025, 1250000, 850000, 416667, 5000000, 2.5, 45,
     4600000, 300000, 150000, 50000, 100000, 5000000),

    -- Q2 2025 (projected)
    ('Q2', 2025, 1350000, 920000, 450000, 5400000, 2.2, 48,
     5000000, 280000, 180000, 40000, 120000, 5400000),

    -- Q3 2025 (projected)
    ('Q3', 2025, 1450000, 980000, 483333, 5800000, 2.0, 50,
     5400000, 300000, 200000, 50000, 150000, 5800000)
ON CONFLICT (quarter_name, fiscal_year) DO NOTHING;

-- Grant permissions
GRANT SELECT ON finance.quarterly_metrics TO tamshai_app;
GRANT INSERT, UPDATE, DELETE ON finance.quarterly_metrics TO tamshai_app;

COMMENT ON TABLE finance.quarterly_metrics IS 'Aggregated quarterly financial metrics for executive reporting';
COMMENT ON COLUMN finance.quarterly_metrics.quarter_name IS 'Quarter identifier (Q1, Q2, Q3, Q4)';
COMMENT ON COLUMN finance.quarterly_metrics.mrr IS 'Monthly Recurring Revenue (average for quarter)';
COMMENT ON COLUMN finance.quarterly_metrics.arr IS 'Annual Recurring Revenue (MRR * 12)';
COMMENT ON COLUMN finance.quarterly_metrics.churn_rate IS 'Customer churn rate as percentage';
COMMENT ON COLUMN finance.quarterly_metrics.nps IS 'Net Promoter Score (-100 to 100)';
COMMENT ON COLUMN finance.quarterly_metrics.arr_beginning IS 'ARR at start of quarter';
COMMENT ON COLUMN finance.quarterly_metrics.arr_ending IS 'ARR at end of quarter';
