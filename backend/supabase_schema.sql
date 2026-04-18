-- Run this in your Supabase SQL Editor to set up the project

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main table for manufacturing concepts
CREATE TABLE IF NOT EXISTS manufacturing_concepts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uid         TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    description TEXT,
    image_url   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_manufacturing_concepts_uid
    ON manufacturing_concepts(uid);

-- Index for text search
CREATE INDEX IF NOT EXISTS idx_manufacturing_concepts_prompt
    ON manufacturing_concepts USING gin(to_tsvector('english', prompt));

-- Row Level Security
ALTER TABLE manufacturing_concepts ENABLE ROW LEVEL SECURITY;

-- Policy: users can only access their own data
CREATE POLICY "Users can view own concepts"
    ON manufacturing_concepts FOR SELECT
    USING (uid = current_user);

CREATE POLICY "Users can insert own concepts"
    ON manufacturing_concepts FOR INSERT
    WITH CHECK (true);  -- backend controls uid

-- Optional: view for recent concepts
CREATE OR REPLACE VIEW recent_concepts AS
SELECT id, uid, prompt,
       LEFT(description, 200) AS description_preview,
       image_url, created_at
FROM manufacturing_concepts
ORDER BY created_at DESC;
