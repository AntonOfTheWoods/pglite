-- Add extra local columns

ALTER TABLE "issue"
    ADD COLUMN IF NOT EXISTS "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'B')
    ) STORED;

-- Add extra local indexes
CREATE INDEX IF NOT EXISTS "issue_priority_idx" ON "issue" ("priority");
CREATE INDEX IF NOT EXISTS "issue_status_idx" ON "issue" ("status");
CREATE INDEX IF NOT EXISTS "issue_modified_idx" ON "issue" ("modified");
CREATE INDEX IF NOT EXISTS "issue_created_idx" ON "issue" ("created");
CREATE INDEX IF NOT EXISTS "issue_kanbanorder_idx" ON "issue" ("kanbanorder");
CREATE INDEX IF NOT EXISTS "issue_search_idx" ON "issue" USING GIN ("search_vector");

CREATE INDEX IF NOT EXISTS "comment_issue_id_idx" ON "comment" ("issue_id");
CREATE INDEX IF NOT EXISTS "comment_created_idx" ON "comment" ("created");
