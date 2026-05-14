-- Migration: Add Observability phase columns to architecture_requests
-- Run this against your Azure PostgreSQL database to fix the 500 error on request submission.
-- Safe to run multiple times (uses IF NOT EXISTS / DO $$ guards).

DO $$
BEGIN
  -- observability_reviewer_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'architecture_requests'
      AND column_name = 'observability_reviewer_name'
  ) THEN
    ALTER TABLE architecture_requests ADD COLUMN observability_reviewer_name TEXT;
  END IF;

  -- observability_reviewed_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'architecture_requests'
      AND column_name = 'observability_reviewed_at'
  ) THEN
    ALTER TABLE architecture_requests ADD COLUMN observability_reviewed_at TIMESTAMP;
  END IF;

  -- observability_comments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'architecture_requests'
      AND column_name = 'observability_comments'
  ) THEN
    ALTER TABLE architecture_requests ADD COLUMN observability_comments TEXT;
  END IF;
END $$;
