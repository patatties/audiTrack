let initialized = false;

export async function initSchema(client) {
  if (initialized) return;

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finding_status') THEN
        CREATE TYPE finding_status AS ENUM ('todo', 'in_progress', 'gathering_evidence', 'done');
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finding_severity') THEN
        CREATE TYPE finding_severity AS ENUM ('low', 'medium', 'high', 'critical');
      END IF;
    END $$;

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $$;

    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS control_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS controls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      catalog_id UUID REFERENCES control_catalog(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      implementation_notes TEXT,
      applies_to_all BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS control_locations (
      control_id UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
      location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (control_id, location_id)
    );

    CREATE TABLE IF NOT EXISTS findings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      control_id UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
      location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      severity finding_severity NOT NULL DEFAULT 'medium',
      status finding_status NOT NULL DEFAULT 'todo',
      assignee TEXT,
      due_date DATE,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS remediation_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT UNIQUE,
      title TEXT NOT NULL DEFAULT 'Untitled plan',
      description TEXT,
      status finding_status NOT NULL DEFAULT 'todo',
      assignee TEXT,
      due_date DATE,
      effort_days NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS remediation_plan_findings (
      plan_id UUID NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
      finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (plan_id, finding_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
      author TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT,
      body TEXT NOT NULL DEFAULT '',
      processed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS solutions_code_unique ON solutions (code) WHERE code IS NOT NULL;

    CREATE TABLE IF NOT EXISTS solution_controls (
      solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
      control_id UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (solution_id, control_id)
    );

    CREATE TABLE IF NOT EXISTS solution_remediations (
      solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (solution_id, plan_id)
    );

    CREATE INDEX IF NOT EXISTS idx_locations_client ON locations(client_id);
    CREATE INDEX IF NOT EXISTS idx_controls_catalog ON controls(catalog_id);
    CREATE INDEX IF NOT EXISTS idx_control_locations_location ON control_locations(location_id);
    CREATE INDEX IF NOT EXISTS idx_findings_location ON findings(location_id);
    CREATE INDEX IF NOT EXISTS idx_findings_control ON findings(control_id);
    CREATE INDEX IF NOT EXISTS idx_rpf_finding ON remediation_plan_findings(finding_id);
    CREATE INDEX IF NOT EXISTS idx_rpf_plan ON remediation_plan_findings(plan_id);
    CREATE INDEX IF NOT EXISTS idx_solution_controls_control ON solution_controls(control_id);
    CREATE INDEX IF NOT EXISTS idx_solution_remediations_plan ON solution_remediations(plan_id);

    CREATE TABLE IF NOT EXISTS control_requirements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      control_id UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
      title TEXT,
      text TEXT NOT NULL,
      source_party TEXT,
      source_name TEXT,
      source_department TEXT,
      source_document TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE control_requirements ADD COLUMN IF NOT EXISTS title TEXT;

    CREATE INDEX IF NOT EXISTS idx_control_requirements_control ON control_requirements(control_id);

    DROP TRIGGER IF EXISTS set_updated_at_control_requirements ON control_requirements;
    CREATE TRIGGER set_updated_at_control_requirements
      BEFORE UPDATE ON control_requirements
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE IF NOT EXISTS requirement_sources (
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (field, value)
    );

    ALTER TYPE finding_status ADD VALUE IF NOT EXISTS 'gathering_evidence' BEFORE 'done';

    ALTER TABLE findings ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE findings ALTER COLUMN updated_at SET DEFAULT now();
    UPDATE findings SET created_at = now() WHERE created_at IS NULL;
    UPDATE findings SET updated_at = now() WHERE updated_at IS NULL;

    DROP TRIGGER IF EXISTS set_updated_at_control_catalog ON control_catalog;
    CREATE TRIGGER set_updated_at_control_catalog
      BEFORE UPDATE ON control_catalog
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_findings ON findings;
    CREATE TRIGGER set_updated_at_findings
      BEFORE UPDATE ON findings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_remediation_plans ON remediation_plans;
    CREATE TRIGGER set_updated_at_remediation_plans
      BEFORE UPDATE ON remediation_plans
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    ALTER TABLE notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT false;
    UPDATE notes SET created_at = now() WHERE created_at IS NULL;
    UPDATE notes SET updated_at = now() WHERE updated_at IS NULL;

    DROP TRIGGER IF EXISTS set_updated_at_notes ON notes;
    CREATE TRIGGER set_updated_at_notes
      BEFORE UPDATE ON notes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_solutions ON solutions;
    CREATE TRIGGER set_updated_at_solutions
      BEFORE UPDATE ON solutions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    -- Application settings/flags, e.g. setup_completed_at (first-setup wizard).
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  initialized = true;
}
