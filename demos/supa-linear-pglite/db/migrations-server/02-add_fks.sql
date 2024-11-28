-- Add foreign keys only on the server
ALTER TABLE "comment" ADD FOREIGN KEY (issue_id) REFERENCES issue(id) ON DELETE CASCADE;
ALTER TABLE "comment" ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; -- SET NULL?
ALTER TABLE "issue" ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; -- SET NULL?
