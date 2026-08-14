import { useEffect, useState } from 'react'

export default function Result({ activeWorkspace, reportData }) {
  const [selectedCardIdx, setSelectedCardIdx] = useState(null)

  // Reset selected card when switching workspaces
  useEffect(() => {
    setSelectedCardIdx(null)
  }, [activeWorkspace])

  if (!reportData) {
    return (
      <div className="workspace-container">
        <div className="card loading-state">
          <span className="spinner" aria-hidden="true" />
          Loading workspace data…
        </div>
      </div>
    )
  }

  const activeCards = reportData[activeWorkspace] || [];
  const selectedCard = selectedCardIdx !== null ? activeCards[selectedCardIdx] : null;

  return (
    <div className="split-view">
      {/* Pane 1: Cards Board */}
      <div className="split-pane main-board">
        {activeCards.length === 0 ? (
          <div className="card empty-state">
            <p>No information extracted for this workspace.</p>
          </div>
        ) : (
          <div className="cards-grid">
            {activeCards.map((card, idx) => (
              <div 
                key={idx} 
                className={`result-card premium-card clickable ${selectedCardIdx === idx ? 'selected' : ''}`}
                onClick={() => setSelectedCardIdx(idx)}
              >
                <div className="card-header">
                  <span className="category-label">{card.category}</span>
                </div>
                <h3 className="card-title">{card.title}</h3>
                <div className="card-preview">
                  <p>{card.content.length > 140 ? card.content.substring(0, 140) + '...' : card.content}</p>
                </div>
                <div className="card-meta-footer">
                  <span className="meta-source">{card.source_evidence && card.source_evidence !== "Not provided" ? "Source Available" : "No Source"}</span>
                  <svg className="comment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pane 2: Detail Panel */}
      <div className="split-pane detail-panel">
        {selectedCard ? (
          <div className="detail-content-wrapper">
            <div className="detail-header-top">
              <span className="eyebrow">SELECTED INSIGHT</span>
              <button className="close-btn" onClick={() => setSelectedCardIdx(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="detail-title-section">
              <h2 className="detail-title">{selectedCard.title}</h2>
            </div>
            
            <div className="detail-metadata-grid">
              <div className="meta-row">
                <span className="meta-key">Category</span>
                <span className="meta-value badge">{selectedCard.category}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Source</span>
                <span className="meta-value">{selectedCard.source_evidence || "Not provided"}</span>
              </div>
            </div>

            <div className="detail-section">
              <h3>Description</h3>
              <p>{selectedCard.content || "Not provided"}</p>
            </div>
          </div>
        ) : (
          <div className="detail-empty-state">
            <p>Select an insight to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
