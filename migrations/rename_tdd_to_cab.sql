-- Migration: rename tdd_* columns, table, and status values to cab_*
-- Run this against your database to fully align with the CAB rebrand.
-- Safe to run multiple times (uses IF EXISTS / DO UPDATE).

BEGIN;

-- ── 1. Update existing status values in architecture_requests ────────────────
UPDATE architecture_requests SET status = 'cab_in_progress' WHERE status = 'tdd_in_progress';
UPDATE architecture_requests SET status = 'cab_completed'   WHERE status = 'tdd_completed';

-- ── 2. Rename columns in architecture_requests ───────────────────────────────
ALTER TABLE architecture_requests
  RENAME COLUMN tdd_form_data TO cab_form_data;

ALTER TABLE architecture_requests
  RENAME COLUMN tdd_submission_id TO cab_submission_id;

-- ── 3. Rename tdd_submissions table to cab_submissions ───────────────────────
ALTER TABLE tdd_submissions RENAME TO cab_submissions;

COMMIT;
