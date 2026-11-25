-- Migration 002: Add isolated Context Knowledge System tables (Phase 1: Cultural Context)
-- Zero alterations to existing REFLECT tables.

CREATE TABLE IF NOT EXISTS context_runs (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    knowledge_set_id VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'pending',
    resolved_location JSONB,
    location_confidence VARCHAR,
    project_context_summary JSONB,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    evaluation_result VARCHAR,
    evaluation_issues JSONB,
    retry_history JSONB,
    limitations JSONB,
    research_gaps JSONB,
    local_verification_requirements JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_context_runs_project_id ON context_runs(project_id);
CREATE INDEX IF NOT EXISTS ix_context_runs_knowledge_set_id ON context_runs(knowledge_set_id);

CREATE TABLE IF NOT EXISTS context_cards (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id VARCHAR REFERENCES context_runs(id) ON DELETE SET NULL,
    knowledge_set_id VARCHAR NOT NULL,
    knowledge_set_name VARCHAR NOT NULL,
    sub_aspect_key VARCHAR NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    title VARCHAR NOT NULL,
    content TEXT NOT NULL,
    research_register VARCHAR NOT NULL DEFAULT 'DOCUMENTED',
    confidence VARCHAR,
    version INTEGER NOT NULL DEFAULT 1,
    priority VARCHAR,
    architect_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_context_cards_project_id ON context_cards(project_id);
CREATE INDEX IF NOT EXISTS ix_context_cards_run_id ON context_cards(run_id);
CREATE INDEX IF NOT EXISTS ix_context_cards_knowledge_set_id ON context_cards(knowledge_set_id);
CREATE INDEX IF NOT EXISTS ix_context_cards_sub_aspect_key ON context_cards(sub_aspect_key);

CREATE TABLE IF NOT EXISTS context_sources (
    id VARCHAR PRIMARY KEY,
    card_id VARCHAR NOT NULL REFERENCES context_cards(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    author_or_org VARCHAR,
    url VARCHAR,
    published_date VARCHAR,
    source_type VARCHAR,
    supported_claim TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_context_sources_card_id ON context_sources(card_id);

CREATE TABLE IF NOT EXISTS context_card_images (
    id VARCHAR PRIMARY KEY,
    card_id VARCHAR NOT NULL REFERENCES context_cards(id) ON DELETE CASCADE,
    image_url VARCHAR NOT NULL,
    source_page_url VARCHAR,
    source_title VARCHAR,
    image_caption TEXT,
    image_type VARCHAR DEFAULT 'architectural_reference',
    relevance_reason TEXT,
    license VARCHAR DEFAULT 'unknown',
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_architect_upload BOOLEAN NOT NULL DEFAULT FALSE,
    retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_context_card_images_card_id ON context_card_images(card_id);

CREATE TABLE IF NOT EXISTS context_jobs (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    knowledge_set_id VARCHAR NOT NULL DEFAULT 'cultural_context',
    job_kind VARCHAR NOT NULL DEFAULT 'initial_research',
    target_card_id VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'queued',
    current_step VARCHAR,
    error TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_context_jobs_project_id ON context_jobs(project_id);
CREATE INDEX IF NOT EXISTS ix_context_jobs_user_id ON context_jobs(user_id);
