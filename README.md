# REFLECT — AI Architectural Intelligence Platform

**REFLECT** is a production-grade architectural intelligence system designed for architects, designers, and project managers. It ingests complex project documents (Client Briefs, Transcripts, Project Schedules, Technical Specifications, and Drawings/Images), performs automated extraction and OCR, and utilizes the **Qwen Large Language Model** to formulate discrete, structured, and auditable **Brief Cards** with strict ground-truth source traceability.

---

## 🏛️ Key Features

- **Pure LLM Architectural Comprehension**: Powered 100% by Qwen LLM with zero synthetic or mock fallbacks.
- **Architectural Taxonomy**: Automatically categorizes findings into standardized architectural types:
  - `FACT`: Established project parameters (e.g., site area, zoning constraints, budget, location).
  - `REQUIREMENT`: Explicit client and program deliverables (e.g., room counts, material specifications).
  - `QUESTION`: Missing inputs or gaps requiring clarification from stakeholders.
  - `CONFLICT`: Cross-document contradictions (e.g., schedule overlaps, conflicting budget limits).
  - `CLARIFICATION`: Ambiguous terms or scopes requiring architectural definition.
  - `ACTION`: Clear follow-up tasks and milestones (e.g., site survey, client approvals).
  - `OTHER`: General architectural context and site notes.
- **Ground-Truth Source Traceability**: Every generated card preserves the contributing document filename and exact verbatim quotes for verification.
- **Incremental Project Versioning (`V0`, `V1`, ...)**: Upload new documents over time. Historical cards are preserved and referenced as background context to prevent duplicate card generation while isolating new version requirements.
- **Extraction Review Workspace**: Review, edit, and approve raw extracted text and OCR outputs before triggering Brief generation.
- **Zero-Latency Tiered Storage**: Local caching for instant file access paired with asynchronous **MinIO S3** object storage synchronization.

---

## 🏗️ Architecture & Tech Stack

```text
┌────────────────────────────────────────────────────────┐
│               Frontend: React 18 + Vite                │
│         (Port 5173 / Production Nginx on Port 80)      │
└──────────────────────────┬─────────────────────────────┘
                           │ REST API / JSON
┌──────────────────────────▼─────────────────────────────┐
│               Backend: FastAPI (Python 3.11)           │
│                       (Port 8000)                      │
├────────────────────────────────────────────────────────┤
│  • Brief Agent (Qwen LLM Orchestration)                │
│  • Document Loaders (PDF, DOCX, TXT)                   │
│  • TurboOCR (Image & Diagram Text Extraction)          │
│  • Storage Layer (Local Cache + Async MinIO S3)        │
└────────┬───────────────────────────────┬───────────────┘
         │                               │
┌────────▼──────────┐         ┌──────────▼───────────────┐
│ PostgreSQL 15     │         │ Qwen LLM GPU Server      │
│ (Port 5432)       │         │ (Port 8000/v1)           │
└───────────────────┘         └──────────────────────────┘
```

---

## 🐳 Docker Services (8 Microservices)

The platform is fully containerized via `docker-compose.yml`:

| Service | Container Image / Build | Port | Description |
| :--- | :--- | :--- | :--- |
| **`frontend`** | `frontend/Dockerfile` (Node 20 $\to$ Nginx Alpine) | `5173:80` | Production React SPA web interface |
| **`backend`** | `backend/Dockerfile` (Python 3.11 Slim) | `8000:8000` | FastAPI application & agent engine |
| **`postgres`** | `postgres:15-alpine` | `5432:5432` | Relational application database |
| **`redis`** | `redis:7-alpine` | `6379:6379` | Background job state & caching |
| **`minio`** | `minio/minio:latest` | `9000:9000`, `9001:9001` | S3-compatible document storage |
| **`minio-init`** | `minio/mc:latest` | Background | Bucket initialization utility |
| **`litellm`** | `ghcr.io/berriai/litellm:main-latest` | `4000:4000` | LLM proxy and model gateway |
| **`pgadmin`** | `dpage/pgadmin4:latest` | `5050:80` | PostgreSQL visual administration GUI |

---

## 🚀 Quickstart Deployment

### 1. Clone the Repository
```bash
git clone https://github.com/prasadk033/REFELCT.git
cd REFELCT
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your server configuration:
```bash
cp .env.example .env
```

Key `.env` settings:
```env
# Application Host & Database
HOST=0.0.0.0
PORT=8000
APP_DATABASE_URL=postgresql://litellm:LiteLLMPostgres2026@postgres:5432/litellm

# Allowed CORS Origins
CORS_ORIGINS=http://localhost:5173,http://<INSTANCE_IP>.nip.io:5173,http://<INSTANCE_IP>:5173

# LLM Configuration
LLM_PROVIDER=litellm
LLM_MODEL=qwen
QWEN_API_KEY=sk-datai2i-a100-qwen35-27b-8x3f9z
QWEN_API_BASE=http://115.244.46.68:8000/v1

# Storage (MinIO S3)
STORAGE_TYPE=s3
MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET=reflect-uploads
MINIO_ACCESS_KEY=reflect-minio-access
MINIO_SECRET_KEY=reflect-minio-secret-2026
```

### 3. Launch with Docker Compose
```bash
docker compose up -d --build
```

Access the services:
- **Web App**: `http://localhost:5173` (or `http://<SERVER_IP>:5173`)
- **Backend API Docs (Swagger UI)**: `http://localhost:8000/docs`
- **MinIO Console**: `http://localhost:9001`
- **pgAdmin**: `http://localhost:5050`

---

## 📡 Core API Reference

### Projects
- `GET /api/projects` — List all projects with aggregate counts.
- `POST /api/projects` — Create a new project.
- `GET /api/projects/{id}` — Get project details and brief status.
- `PATCH /api/projects/{id}` — Update project metadata.

### Sources & Document Extraction
- `POST /api/projects/{id}/sources` — Upload document (PDF, DOCX, TXT, Images).
- `GET /api/projects/{id}/sources` — List all project sources.
- `POST /api/projects/{id}/sources/extract` — Trigger extraction for pending sources.
- `PUT /api/projects/{id}/sources/{source_id}/content` — Edit extracted text before approval.
- `POST /api/projects/{id}/sources/{source_id}/approve` — Approve individual source.
- `POST /api/projects/{id}/sources/approve-all` — Batch approve all pending sources.

### Brief Synthesis & Cards
- `POST /api/projects/{id}/brief/analyze` — Launch background Brief & Card generation job.
- `GET /api/projects/{id}/brief/status` — Poll current job state (`queued`, `processing_brief`, `generating_cards`, `completed`).
- `GET /api/projects/{id}/brief/cards` — List filtered Brief Cards (filter by `version`, `card_type`, `status`).
- `POST /api/projects/{id}/brief/cards` — Manually create an architect card.
- `POST /api/cards/{id}/accept` — Accept a provisional card.
- `POST /api/cards/{id}/reject` — Reject a card.
- `PATCH /api/cards/{id}` — Edit card title, content, or type.
- `DELETE /api/cards/{id}` — Delete a card.

---

## 🔒 Google Authentication & Cloud Deployment (`nip.io`)

Google OAuth strictly prohibits raw public IP addresses (e.g. `http://152.228.229.140:5173`) in its Authorized Origins.

To deploy on a cloud server without a custom domain:
1. Use a wildcard DNS like `http://<YOUR_SERVER_IP>.nip.io:5173`.
2. Add `http://<YOUR_SERVER_IP>.nip.io:5173` to **Authorized JavaScript Origins** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
3. Set `VITE_GOOGLE_CLIENT_ID` in your frontend environment.

---

## 🛠️ Local Development (Without Docker)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
