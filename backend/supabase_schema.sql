-- ================================
-- 🔥 FULL RESET
-- ================================
DROP VIEW IF EXISTS recent_concepts;
DROP TABLE IF EXISTS manufacturing_concepts;

-- ================================
-- EXTENSIONS
-- ================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================
-- MAIN TABLE
-- ================================
CREATE TABLE manufacturing_concepts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uid         TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    description TEXT,
    image_url   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- INDEXES (IMPROVED)
-- ================================

-- Fast user queries + sorting
CREATE INDEX idx_uid_created_at
ON manufacturing_concepts(uid, created_at DESC);

-- Full-text search index (important)
CREATE INDEX idx_prompt_fts
ON manufacturing_concepts
USING GIN (to_tsvector('english', prompt));

-- ================================
-- RLS (SAFE FOR YOUR BACKEND)
-- ================================
ALTER TABLE manufacturing_concepts ENABLE ROW LEVEL SECURITY;

-- Allow backend full access (since you control uid in Flask)
CREATE POLICY "Backend full access"
ON manufacturing_concepts
FOR ALL
USING (true)
WITH CHECK (true);

-- ================================
-- VIEW (IMPROVED)
-- ================================
CREATE VIEW recent_concepts AS
SELECT
    id,
    uid,
    prompt,
    LEFT(description, 200) AS description_preview,
    image_url,
    created_at
FROM manufacturing_concepts
ORDER BY created_at DESC
LIMIT 50;

-- ================================
-- OPTIONAL: FULL-TEXT SEARCH FUNCTION
-- ================================
CREATE OR REPLACE FUNCTION search_concepts(query TEXT, user_id TEXT)
RETURNS SETOF manufacturing_concepts
LANGUAGE sql
AS $$
    SELECT *
    FROM manufacturing_concepts
    WHERE uid = user_id
      AND to_tsvector('english', prompt) @@ plainto_tsquery(query)
    ORDER BY ts_rank(
        to_tsvector('english', prompt),
        plainto_tsquery(query)
    ) DESC;
$$;