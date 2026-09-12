CREATE TABLE faculty (
  emp_id TEXT PRIMARY KEY,
  faculty_name TEXT NOT NULL,
  designation TEXT NOT NULL,
  admin_role TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subjects (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  credits INTEGER NOT NULL DEFAULT 3,
  academic_year TEXT,
  semester_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE allocation_runs (
  id BIGSERIAL PRIMARY KEY,
  hierarchy_mode TEXT NOT NULL,
  runtime_seconds NUMERIC(10,3),
  coverage_percent NUMERIC(5,2),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE allocations (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES allocation_runs(id) ON DELETE CASCADE,
  emp_id TEXT NOT NULL REFERENCES faculty(emp_id),
  subject_code TEXT NOT NULL REFERENCES subjects(code),
  slot INTEGER NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  workload_hours INTEGER NOT NULL,
  reason TEXT,
  UNIQUE (run_id, emp_id, slot)
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT REFERENCES allocation_runs(id) ON DELETE SET NULL,
  admin_user TEXT NOT NULL,
  action_type TEXT NOT NULL,
  before_value JSONB,
  after_value JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE validation_results (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT REFERENCES allocation_runs(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  row_number INTEGER,
  code TEXT
);

