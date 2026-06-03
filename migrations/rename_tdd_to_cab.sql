-- Migration: rename tdd_* columns and table to cab_*
-- Run this against your database to align with the CAB rebrand.

-- 1. Rename tdd_form_data column to cab_form_data in architecture_requests
ALTER TABLE architecture_requests
  RENAME COLUMN tdd_form_data TO cab_form_data;

-- 2. Rename tdd_submission_id column to cab_submission_id in architecture_requests
ALTER TABLE architecture_requests
  RENAME COLUMN tdd_submission_id TO cab_submission_id;

-- 3. Rename tdd_submissions table to cab_submissions
ALTER TABLE tdd_submissions RENAME TO cab_submissions;
