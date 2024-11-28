-- Add foreign keys only on the server
ALTER TABLE comment ADD FOREIGN KEY (issue_id) REFERENCES issue(id) ON DELETE CASCADE
