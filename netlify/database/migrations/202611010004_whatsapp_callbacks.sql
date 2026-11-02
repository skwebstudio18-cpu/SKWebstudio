CREATE TABLE skts_whatsapp_status_events (
  message_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('sent','delivered','read','failed')),
  event_at timestamptz NOT NULL,
  error_code text,
  PRIMARY KEY(message_id,status,event_at)
);
CREATE TABLE skts_whatsapp_opt_outs (
  message_id text PRIMARY KEY,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
