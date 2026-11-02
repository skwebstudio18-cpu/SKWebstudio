ALTER TABLE skts_requests ADD COLUMN budget_agreed boolean NOT NULL DEFAULT false;
ALTER TABLE skts_requests ADD COLUMN payment_due_date date;
ALTER TABLE skts_requests ADD COLUMN payment_target_paise bigint CHECK (payment_target_paise > 0);
ALTER TABLE skts_requests ADD COLUMN reminder_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE skts_requests ADD COLUMN reminder_schedule text NOT NULL DEFAULT 'due_and_overdue' CHECK (reminder_schedule IN ('before_due_overdue','due_and_overdue','overdue'));
ALTER TABLE skts_requests ADD COLUMN whatsapp_phone text NOT NULL DEFAULT '';
ALTER TABLE skts_requests ADD COLUMN whatsapp_opted_in_at timestamptz;
ALTER TABLE skts_requests ADD COLUMN whatsapp_consent_note text NOT NULL DEFAULT '';
ALTER TABLE skts_requests ADD CONSTRAINT skts_agreed_budget CHECK (NOT budget_agreed OR (quoted_amount_paise IS NOT NULL AND quoted_amount_paise > 0));
CREATE TABLE skts_project_services (
  id uuid PRIMARY KEY,
  request_reference text NOT NULL REFERENCES skts_requests(reference),
  title varchar(160) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','on_hold','cancelled')),
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skts_services_project ON skts_project_services(request_reference,sort_order);
CREATE TABLE skts_reminder_deliveries (
  id uuid PRIMARY KEY,
  request_reference text NOT NULL REFERENCES skts_requests(reference),
  due_date date NOT NULL,
  stage text NOT NULL CHECK (stage IN ('before','due','overdue')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','accepted','sent','delivered','read','failed','unknown','suppressed')),
  provider_message_id text UNIQUE,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_reference,due_date,stage)
);
