CREATE TABLE skts_project_documents (
  id uuid PRIMARY KEY,
  request_reference text NOT NULL REFERENCES skts_requests(reference),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skts_project_documents_project ON skts_project_documents(request_reference);
CREATE TABLE skts_document_versions (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES skts_project_documents(id),
  version integer NOT NULL CHECK (version > 0),
  storage_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  media_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 3145728),
  sha256 text NOT NULL,
  uploaded_by text NOT NULL,
  uploader_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','under_review','approved','changes_needed')),
  review_revision integer NOT NULL DEFAULT 1,
  UNIQUE(document_id,version)
);
CREATE TABLE skts_document_reviews (
  id uuid PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES skts_document_versions(id),
  actor_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('under_review','approved','changes_needed')),
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skts_document_reviews_version ON skts_document_reviews(version_id,created_at);
