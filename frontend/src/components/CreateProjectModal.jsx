import { useState } from 'react'
import { createProject } from '../api.js'

const PROJECT_TYPES = [
  'School Interior',
  'Residential Interior',
  'Office Interior',
  'Hospitality Interior',
  'Retail Interior',
  'Healthcare Interior',
  'Institutional Building',
  'Commercial Building',
  'Other',
]

export default function CreateProjectModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    project_type: '',
    custom_type: '',
    location: '',
    client: '',
    description: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Project name is required')
    if (!form.project_type && !form.custom_type.trim()) return setError('Project type is required')

    setLoading(true)
    setError(null)
    try {
      const projectType = form.project_type === 'Other' ? form.custom_type.trim() : form.project_type
      const data = {
        name: form.name.trim(),
        project_type: projectType,
        location: form.location.trim() || null,
        client: form.client.trim() || null,
        description: form.description.trim() || null,
      }
      const project = await createProject(data)
      onCreated(project)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Project</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Project Name <span className="required">*</span></label>
            <input
              type="text"
              placeholder="e.g., ABC School Interior"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Project Type <span className="required">*</span></label>
            <select
              value={form.project_type}
              onChange={e => updateField('project_type', e.target.value)}
            >
              <option value="">Select project type...</option>
              {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {form.project_type === 'Other' && (
              <input
                type="text"
                placeholder="Enter custom project type"
                value={form.custom_type}
                onChange={e => updateField('custom_type', e.target.value)}
                className="custom-type-input"
              />
            )}
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              placeholder="e.g., Visakhapatnam"
              value={form.location}
              onChange={e => updateField('location', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Client</label>
            <input
              type="text"
              placeholder="e.g., Client Name"
              value={form.client}
              onChange={e => updateField('client', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              placeholder="Brief description of the project..."
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              rows={3}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-text" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
