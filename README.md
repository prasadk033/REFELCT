# reflect-ver1 — Virtual Architect Document Analysis

A multi-agent document analysis system. Upload a PDF/DOCX/TXT and the Virtual Architect orchestrates specialist AI agents to produce a structured analysis report.

---

## Project Structure

```
reflect-ver1/
│
├── backend/                        ← Python FastAPI backend
│   ├── app/                        ← Python package (importable as `app`)
│   │   ├── main.py                 ← FastAPI app, API endpoints
│   │   ├── config.py               ← Central config (reads .env)
│   │   │
│   │   ├── agents/                 ← AI agents (Haystack @components)
│   │   │   ├── architect.py        ← Virtual Architect (orchestrator)
│   │   │   ├── analysis_agent.py   ← Document content analysis
│   │   │   ├── requirement_agent.py ← Requirements extraction
│   │   │   ├── research_agent.py   ← Standards & evidence research
│   │   │   ├── validation_agent.py ← Risk & contradiction validation
│   │   │   └── report_agent.py     ← Final report synthesis
│   │   │
│   │   ├── documents/
│   │   │   └── loader.py           ← PDF/DOCX/TXT loader (Haystack)
│   │   │
│   │   ├── llm/
│   │   │   └── provider.py         ← LiteLLM ↔ Haystack bridge
│   │   │
│   │   ├── memory/
│   │   │   └── redis_store.py      ← Redis session/agent state store
│   │   │
│   │   └── schemas/
│   │       └── models.py           ← Pydantic models (FinalReport, etc.)
│   │
│   └── requirements.txt            ← Python dependencies
│
├── frontend/                       ← React frontend (Vite)
│   ├── src/
│   │   ├── main.jsx                ← React entry point
│   │   ├── App.jsx                 ← 3-view state: upload → progress → result
│   │   ├── index.css               ← Global styles
│   │   ├── api.js                  ← All fetch() calls to FastAPI
│   │   └── components/
│   │       ├── Upload.jsx          ← File picker + drag-and-drop
│   │       ├── Progress.jsx        ← Status polling (every 2s)
│   │       └── Result.jsx          ← Final report display
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── sample_documents/               ← Example input files for testing
├── tests/                          ← Test files (reserved)
├── uploads/                        ← Uploaded files (gitignored)
│
├── .env                            ← Environment secrets (DO NOT COMMIT)
├── .env.example                    ← Template for .env (safe to commit)
├── litellm_config.yaml             ← LiteLLM proxy model routing config
├── docker-compose.yml              ← Redis container
├── frontend.py                     ← Legacy Streamlit UI (v0, kept for reference)
│
├── venv/                           ← Python virtualenv for backend
└── proxy-env/                      ← Python virtualenv for LiteLLM proxy
```

---

## Architecture

```
React (frontend/)
  ↓ POST /upload-and-analyze (multipart)
FastAPI (backend/app/main.py)
  ↓ load document
Haystack Document Loader
  ↓ extracted text
Virtual Architect (orchestrator)
  ↓ parallel via ThreadPoolExecutor
┌────────────────────────────────────────┐
│  Requirement  │  Analysis  │  Research  │  Validation  │
└────────────────────────────────────────┘
  ↓ write/read via
Redis (session state, agent responses, retries)
  ↓ evaluate & retry loop
Virtual Architect
  ↓
Report Agent → FinalReport
  ↓ stored in Redis
FastAPI → React result view

All agents → LiteLLM Generator (provider.py)
              ↓
           LiteLLM Proxy (localhost:4000)
              ↓
           Google Gemini API

LiteLLM Proxy → PostgreSQL (dashboard/spend data)
```

---

## Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `HOST` | FastAPI bind host (default `0.0.0.0`) |
| `PORT` | FastAPI port (default `8000`) |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g. `http://localhost:5173`) |
| `REDIS_URL` | Redis connection string (default `redis://localhost:6379`) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `LITELLM_API_BASE` | LiteLLM proxy URL (default `http://localhost:4000`) |
| `LITELLM_MASTER_KEY` | LiteLLM proxy master key |
| `DATABASE_URL` | PostgreSQL URL for LiteLLM persistence |
| `MAX_AGENT_RETRIES` | Max retries per agent (default `3`) |

---

## How to Run

### 1. Redis
```bash
sudo docker-compose up -d
# OR if Redis is running natively:
redis-server
```

### 2. LiteLLM Proxy
```bash
source .env
proxy-env/bin/litellm --config litellm_config.yaml --port 4000
```

### 3. FastAPI Backend
```bash
cd backend
source ../venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. React Frontend
```bash
cd frontend
npm run dev
# → http://localhost:5173
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload-and-analyze` | Upload file (multipart), returns `session_id` |
| `GET` | `/status/{session_id}` | Poll analysis status + current step |
| `GET` | `/result/{session_id}` | Fetch final `FinalReport` |
| `GET` | `/health` | Health check |
| `POST` | `/analyze` | Legacy: JSON body with `file_path` |
