-- memories.embedding is vector(768). Unit tests do not apply this file.
-- Cosine distance, 100 lists (artifact 25).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS memories_embedding_ivfflat
  ON memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
