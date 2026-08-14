# Reflect — Virtual Architect Document Analysis

A multi-agent document analysis system. Upload an interior architecture brief (PDF/DOCX/TXT), and the Virtual Architect orchestrates specialist AI agents to produce a structured, 19-section analysis report.

---

## Architecture Overview

Reflect is a fully containerized, microservice architecture leveraging large language models.

```text
React (frontend) -> Nginx (Port 5173)
  ↓ POST /upload-and-analyze
FastAPI (backend) -> Uvicorn (Port 8000)
  ↓ 
Virtual Architect (orchestrator)
  ↓ parallel execution
┌────────────────────────────────────────┐
│  Requirement  │  Analysis  │  Research  │  Validation  │
└────────────────────────────────────────┘
  ↓ read/write state
Redis (Port 6379)
  ↓ evaluate & synthesize
Report Agent
  ↓ LiteLLM proxy
LiteLLM (Port 4000) -> PostgreSQL (logging)
  ↓
Qwen 2.5 GPU API (Port 8000)
```

---

## Project Structure

```text
reflect-ver1/
├── backend/                        ← Python FastAPI backend
│   ├── main.py                     ← FastAPI app, API endpoints
│   ├── config.py                   ← Central config
│   ├── agents/                     ← AI agents (Haystack @components)
│   ├── documents/                  ← Document loader (Haystack/python-docx)
│   ├── llm/                        ← LiteLLM bridge
│   ├── memory/                     ← Redis session store
│   ├── schemas/                    ← Pydantic models (FinalReport)
│   └── Dockerfile                  ← Python 3.11 runner
│
├── frontend/                       ← React frontend (Vite)
│   ├── src/                        ← React source code
│   ├── nginx.conf                  ← Nginx configuration
│   └── Dockerfile                  ← Multi-stage Node builder + Nginx runner
│
├── docker-compose.yml              ← Full stack deployment configuration
├── litellm_config.yaml             ← LiteLLM proxy model routing config
├── .env.example                    ← Template for .env (safe to commit)
└── .dockerignore                   ← Excludes node_modules/venv from builds
```

---

## How to Run (Docker Compose)

The entire application has been dockerized for seamless deployment. You do not need to run manual Python or NPM commands.

### 1. Configure Environment
Create a `.env` file from the example template:
```bash
cp .env.example .env
```
Fill in your `QWEN_API_KEY` and any other secrets in `.env`.

### 2. Build and Deploy
```bash
sudo docker compose build
sudo docker compose up -d
```

### 3. Access the Application
- **Frontend (React UI):** `http://<your-server-ip>:5173`
- **Backend (FastAPI):** `http://<your-server-ip>:8000`
- **LiteLLM Proxy:** `http://<your-server-ip>:4000`

### 4. Stop the Application
```bash
sudo docker compose down
```

---

## Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `HOST` | FastAPI bind host (default `0.0.0.0`) |
| `PORT` | FastAPI port (default `8000`) |
| `CORS_ORIGINS` | Allowed frontend origins (e.g., `http://152.228.229.140:5173`) |
| `REDIS_URL` | Redis connection string (`redis://redis:6379`) |
| `QWEN_API_KEY` | Qwen API key for inference |
| `LITELLM_API_BASE` | LiteLLM proxy URL (`http://litellm:4000`) |
| `LITELLM_MASTER_KEY` | LiteLLM proxy master authentication key |
| `DATABASE_URL` | PostgreSQL URL for LiteLLM logging |
| `MAX_AGENT_RETRIES` | Max retries per agent upon validation failure (default `3`) |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload-and-analyze` | Upload file (multipart), returns `session_id` |
| `GET` | `/status/{session_id}` | Poll analysis status + current step |
| `GET` | `/result/{session_id}` | Fetch final validated `FinalReport` JSON |
| `GET` | `/health` | Application health check |
