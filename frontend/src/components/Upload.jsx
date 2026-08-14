import { useState, useRef } from 'react'
import { uploadAndAnalyze } from '../api.js'

/**
 * Upload view — file picker + Analyze button.
 * On success calls onStarted(sessionId).
 */
export default function Upload({ onStarted }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
    }
  }

  async function handleSubmit() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const data = await uploadAndAnalyze(file)
      onStarted(data.session_id)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        className={`drop-zone${dragging ? ' active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="File upload area"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.docx"
          onChange={handleFileChange}
          id="file-input"
        />
        <div className="label">
          {dragging
            ? 'Drop it here!'
            : <>Drag & drop a PDF/DOCX/TXT here, or <strong>browse</strong></>
          }
        </div>
      </div>

      {/* Selected file name */}
      {file && (
        <div className="file-info">
          📄 <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
        </div>
      )}

      {/* Error */}
      {error && <div className="error-msg">⚠ {error}</div>}

      {/* Submit */}
      <button
        className="btn"
        onClick={handleSubmit}
        disabled={!file || loading}
        id="analyze-btn"
      >
        {loading ? 'Uploading…' : 'Analyze Document'}
      </button>
    </div>
  )
}
