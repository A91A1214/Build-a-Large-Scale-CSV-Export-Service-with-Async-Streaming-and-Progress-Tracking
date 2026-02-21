-- File: seeds/init.sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    signup_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    country_code CHAR(2) NOT NULL,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    lifetime_value NUMERIC(10, 2) DEFAULT 0.00
);

-- Add indexes for efficient filtering
CREATE INDEX idx_users_country_code ON users(country_code);
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX idx_users_lifetime_value ON users(lifetime_value);

-- Table to track export jobs
CREATE TABLE exports (
    id UUID PRIMARY KEY,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    file_path TEXT
);

-- Generate 10 Million Rows
-- This uses generate_series for fast insertion
DO $$
DECLARE
    batch_size CONSTANT INTEGER := 100000;
    total_rows CONSTANT INTEGER := 10000000;
BEGIN
    FOR i IN 1..(total_rows / batch_size) LOOP
        INSERT INTO users (name, email, country_code, subscription_tier, lifetime_value)
        SELECT
            'User ' || seq,
            'user' || seq || '@example.com',
            (ARRAY['US', 'UK', 'CA', 'AU', 'IN'])[floor(random() * 5 + 1)],
            (ARRAY['free', 'basic', 'premium', 'pro'])[floor(random() * 4 + 1)],
            round((random() * 1000)::numeric, 2)
        FROM generate_series(((i - 1) * batch_size) + 1, i * batch_size) as seq;
    END LOOP;
END $$;
