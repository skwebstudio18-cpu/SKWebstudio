-- Only anonymous daily counters; never chat messages, raw IPs or client records.
CREATE TABLE skts_visitor_ai_quota (
  day date NOT NULL,
  bucket text NOT NULL CHECK (bucket = 'site' OR bucket ~ '^ip:[a-f0-9]{64}$'),
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (day, bucket)
);
