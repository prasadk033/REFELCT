// All API calls to the FastAPI backend.

const API_BASE = import.meta.env.VITE_API_BASE !== undefined 
  ? import.meta.env.VITE_API_BASE 
  : (import.meta.env.DEV ? "http://localhost:8000" : "");

function authHeaders() {
  const token = localStorage.getItem("reflect_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url, options = {}) {
  const headers = { ...authHeaders(), ...options.headers };
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("reflect_token");
    localStorage.removeItem("reflect_user");
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function loginWithGoogle(googleToken) {
  return apiFetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: googleToken }),
  });
}

export async function loginDev(email = "dev@reflect.local", name = "Developer") {
  return apiFetch("/api/auth/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name }),
  });
}

export async function getCurrentUser() {
  return apiFetch("/api/auth/me");
}

// ── Projects ────────────────────────────────────────────────────────────────

export async function createProject(data) {
  return apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listProjects() {
  return apiFetch("/api/projects");
}

export async function getProject(projectId) {
  return apiFetch(`/api/projects/${projectId}`);
}

export async function updateProject(projectId, data) {
  return apiFetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Sources ─────────────────────────────────────────────────────────────────

export async function uploadSource(projectId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(`/api/projects/${projectId}/sources`, {
    method: "POST",
    body: formData,
  });
}

export async function listSources(projectId) {
  return apiFetch(`/api/projects/${projectId}/sources`);
}

export async function extractSources(projectId) {
  return apiFetch(`/api/projects/${projectId}/sources/extract`, {
    method: "POST",
  });
}

export async function reparseSource(projectId, sourceId) {
  return apiFetch(`/api/projects/${projectId}/sources/${sourceId}/reparse`, {
    method: "POST",
  });
}

export async function updateSourceContent(projectId, sourceId, extractedText) {
  return apiFetch(`/api/projects/${projectId}/sources/${sourceId}/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extracted_text: extractedText }),
  });
}

export async function approveSource(projectId, sourceId) {
  return apiFetch(`/api/projects/${projectId}/sources/${sourceId}/approve`, {
    method: "POST",
  });
}

export async function approveAllSources(projectId) {
  return apiFetch(`/api/projects/${projectId}/sources/approve-all`, {
    method: "POST",
  });
}

export async function deleteSource(projectId, sourceId) {
  return apiFetch(`/api/projects/${projectId}/sources/${sourceId}`, {
    method: "DELETE",
  });
}


// ── Briefs ──────────────────────────────────────────────────────────────────

export async function analyzeBrief(projectId, sourceIds = null) {
  const body = sourceIds ? { source_ids: sourceIds } : {};
  return apiFetch(`/api/projects/${projectId}/brief/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getBriefStatus(projectId) {
  return apiFetch(`/api/projects/${projectId}/brief/status`);
}

export async function getCurrentBrief(projectId) {
  return apiFetch(`/api/projects/${projectId}/brief`);
}

export async function getBriefVersions(projectId) {
  return apiFetch(`/api/projects/${projectId}/brief/versions`);
}

export async function getBriefById(projectId, briefId) {
  return apiFetch(`/api/projects/${projectId}/brief/${briefId}`);
}

export async function getBriefSummary(projectId) {
  return apiFetch(`/api/projects/${projectId}/brief/summary`);
}

// ── Cards ───────────────────────────────────────────────────────────────────

export async function listCards(projectId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.card_type) params.set("card_type", filters.card_type);
  if (filters.status) params.set("status", filters.status);
  if (filters.brief_id) params.set("brief_id", filters.brief_id);
  const qs = params.toString();
  return apiFetch(`/api/projects/${projectId}/brief/cards${qs ? "?" + qs : ""}`);
}

export async function createCard(projectId, data) {
  return apiFetch(`/api/projects/${projectId}/brief/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateCard(cardId, data) {
  return apiFetch(`/api/cards/${cardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteCard(cardId) {
  return apiFetch(`/api/cards/${cardId}`, { method: "DELETE" });
}

export async function acceptCard(cardId) {
  return apiFetch(`/api/cards/${cardId}/accept`, { method: "POST" });
}

export async function rejectCard(cardId) {
  return apiFetch(`/api/cards/${cardId}/reject`, { method: "POST" });
}

// ── Activities ──────────────────────────────────────────────────────────────

export async function listActivities(projectId = null, limit = 20) {
  const params = new URLSearchParams();
  if (projectId) params.set("project_id", projectId);
  if (limit) params.set("limit", limit);
  const qs = params.toString();
  return apiFetch(`/api/activities${qs ? "?" + qs : ""}`);
}



