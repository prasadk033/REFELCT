// All API calls to the FastAPI backend live here.
// The base URL points to the FastAPI server.

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

/**
 * Upload a file and start the analysis.
 * Returns: { session_id: string, status: string }
 */
export async function uploadAndAnalyze(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/upload-and-analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  return res.json();
}

/**
 * Poll the analysis status for a given session.
 * Returns: { session_id, status, current_step, error }
 */
export async function getStatus(sessionId) {
  const res = await fetch(`${API_BASE}/status/${sessionId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Status fetch failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch the final analysis result once status === "completed".
 * Returns the FinalReport object.
 */
export async function getResult(sessionId) {
  const res = await fetch(`${API_BASE}/result/${sessionId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Result fetch failed (${res.status})`);
  }

  return res.json();
}
