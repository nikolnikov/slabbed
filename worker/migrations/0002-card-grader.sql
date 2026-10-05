-- Adds the grading company to databases created before grader was in schema.sql.
-- Every graded card before this was a PSA slab (PSA was the only grader the app supported).
ALTER TABLE cards ADD COLUMN grader TEXT;
UPDATE cards SET grader = 'PSA' WHERE is_graded = 1 AND grader IS NULL;
