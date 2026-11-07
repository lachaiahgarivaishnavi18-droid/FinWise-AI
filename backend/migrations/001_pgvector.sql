-- Apply after `flask --app backend.app:create_app init-db`.
-- The configured embedding model must produce 384-dimensional vectors.
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE memory_embeddings ADD COLUMN IF NOT EXISTS semantic_vector vector(384);
CREATE INDEX IF NOT EXISTS memory_embeddings_hnsw ON memory_embeddings USING hnsw (semantic_vector vector_cosine_ops);
CREATE INDEX IF NOT EXISTS expense_user_date ON expense_records(user_id, date);
CREATE INDEX IF NOT EXISTS income_user_date ON income_records(user_id, date);
COMMIT;
