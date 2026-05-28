-- Add workflow_type column to support Sandbox and Development fast-track workflows
ALTER TABLE architecture_requests
  ADD COLUMN IF NOT EXISTS workflow_type TEXT NOT NULL DEFAULT 'standard';
