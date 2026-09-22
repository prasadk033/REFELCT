import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, listSources, uploadSource, deleteSource, extractSources, reparseSource, cancelSourceExtraction, analyzeBrief, cancelBrief, listCards, getBriefStatus, deleteProject, resetSourceVersion, resetVersion, acknowledgeJobNotification } from '../api.js'
import ProjectShell from '../components/ProjectShell.jsx'
import GeneratingProgressModal from '../components/GeneratingProgressModal.jsx'
import ExtractingProgressModal from '../components/ExtractingProgressModal.jsx'
import { calculateBriefEstimate } from '../utils/estimate.js'


function formatRelativeTime(dateString) {
  if (!dateString) return 'Recently'
  // Ensure UTC timestamp is properly recognized by appending 'Z' if missing
  const utcString = (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.includes('+'))
    ? `${dateString}Z`
    : dateString
  const date = new Date(utcString)
  const now = new Date()
  const diffSec = Math.floor((now - date) / 1000)

  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function ProjectOverviewPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const modalFileInputRef = useRef(null)

  const [project, setProject] = useState(null)
  const [sources, setSources] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [rowExtractingId, setRowExtractingId] = useState(null)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Custom Confirmation Dialog (Replaces browser window.confirm)
  const [confirmModal, setConfirmModal] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // AI Service Fallback Modal
  const [aiFallbackModalOpen, setAiFallbackModalOpen] = useState(false)
  const [aiFallbackTitle, setAiFallbackTitle] = useState('AI Service Notice')
  const [aiFallbackBadge, setAiFallbackBadge] = useState(null)
  const [aiFallbackErrorMsg, setAiFallbackErrorMsg] = useState('AI services are temporarily unavailable. Please try again later.')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  // Document Text Inspector Modal
  const [viewingSource, setViewingSource] = useState(null)

  // Share Dialog
  const [showShareModal, setShowShareModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Upload Source Modal
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('document') // 'document' or 'image'
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadDescription, setUploadDescription] = useState('')
  const [containsImages, setContainsImages] = useState(false)
  const [fileTypeError, setFileTypeError] = useState(null)

  function openUploadModal(category = 'document') {
    setUploadCategory(category)
    setSelectedFile(null)
    setUploading(false)
    setUploadDescription('')
    setContainsImages(category === 'image')
    setFileTypeError(null)
    setError(null)
    if (modalFileInputRef.current) modalFileInputRef.current.value = ''
    setShowUploadModal(true)
  }

  function closeUploadModal() {
    setShowUploadModal(false)
    setSelectedFile(null)
    setUploading(false)
    setUploadDescription('')
    setContainsImages(false)
    setFileTypeError(null)
    if (modalFileInputRef.current) modalFileInputRef.current.value = ''
  }

  function switchUploadCategory(cat) {
    setUploadCategory(cat)
    setSelectedFile(null)
    setContainsImages(cat === 'image')
    setFileTypeError(null)
    if (modalFileInputRef.current) modalFileInputRef.current.value = ''
  }

  // Analysis Blocking & Progress
  const [analyzing, setAnalyzing] = useState(false)
  const [showAnalysisModal, setShowAnalysisModal] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [showExtractModal, setShowExtractModal] = useState(true)
  const [analysisStep, setAnalysisStep] = useState('Initiating analysis...')
  const [analysisJobId, setAnalysisJobId] = useState(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showExtractCompleteModal, setShowExtractCompleteModal] = useState(false)
  const [analysisSummary, setAnalysisSummary] = useState(null)

  function formatFileSize(bytes) {
    if (!bytes) return ''
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
    return Math.round(bytes / 1024) + ' KB'
  }

  const [analysisError, setAnalysisError] = useState(null)
  const [analyzingSeconds, setAnalyzingSeconds] = useState(0)
  const [analysisEstimate, setAnalysisEstimate] = useState(null)

  // Document Extraction Progress Modal
  const [extractModalOpen, setExtractModalOpen] = useState(false)
  const [extractDocName, setExtractDocName] = useState('Document')
  const [extractDocsCompleted, setExtractDocsCompleted] = useState(0)
  const [extractDocCount, setExtractDocCount] = useState(1)
  const [extractServerStep, setExtractServerStep] = useState('')
  const [extractTotalPages, setExtractTotalPages] = useState(20)
  const [extractEstSeconds, setExtractEstSeconds] = useState(35)
  const [extractElapsedSeconds, setExtractElapsedSeconds] = useState(0)
  const extractTimerRef = useRef(null)

  const pollIntervalRef = useRef(null)

  useEffect(() => {
    if (projectId) {
      loadProjectData()
      checkActiveBackgroundJob()
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (extractTimerRef.current) clearInterval(extractTimerRef.current)
    }
  }, [projectId])

  async function checkActiveBackgroundJob() {
    try {
      const statusRes = await getBriefStatus(projectId)
      if (statusRes) {
        if (['queued', 'parsing', 'extracting_images', 'processing_brief', 'generating_cards'].includes(statusRes.status)) {
          setAnalyzing(true)
          setShowAnalysisModal(false) // If returning to page while job runs, stay in non-blocking background mode
          setAnalysisStep(statusRes.current_step || 'Processing brief in background...')
          startPollingStatus()
        } else if (['pending', 'extracting'].includes(statusRes.status)) {
          setExtracting(true)
          setExtractModalOpen(false)
          setShowExtractModal(false)
          if (typeof statusRes.cards_generated === 'number') setExtractDocsCompleted(statusRes.cards_generated)
          if (typeof statusRes.questions_count === 'number' && statusRes.questions_count > 0) setExtractDocCount(statusRes.questions_count)
          if (statusRes.current_step) setExtractServerStep(statusRes.current_step)
          startExtractionPolling()
        } else if (statusRes.status === 'completed' && !statusRes.notification_seen) {
          if (statusRes.id) acknowledgeJobNotification(statusRes.id).catch(() => {})
          await loadProjectData()
        } else if ((statusRes.status === 'failed' || statusRes.status === 'partial') && !statusRes.notification_seen) {
          if (statusRes.id) acknowledgeJobNotification(statusRes.id).catch(() => {})
          await loadProjectData()
        }
      }
    } catch (e) {
      // No active job found
    }
  }

  function handleFileSelected(file) {
    if (!file) return
    setFileTypeError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    
    if (uploadCategory === 'document') {
      const allowed = ['pdf', 'docx', 'doc', 'txt']
      if (!allowed.includes(ext)) {
        setFileTypeError(`Selected file is .${ext}. Please select a PDF, DOCX, DOC, or TXT file for Document sources.`)
        setSelectedFile(null)
        return
      }
    } else {
      const allowed = ['jpg', 'jpeg', 'png', 'webp']
      if (!allowed.includes(ext)) {
        setFileTypeError(`Selected file is .${ext}. Please select a JPG, PNG, or WEBP file for Image sources.`)
        setSelectedFile(null)
        return
      }
    }
    setSelectedFile(file)
  }

  async function handleConfirmUpload() {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    const ext = selectedFile.name.split('.').pop()?.toLowerCase()
    const isImageUpload = uploadCategory === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)
    const willUseVision = isImageUpload ? true : Boolean(containsImages)
    try {
      await uploadSource(projectId, selectedFile, uploadDescription, willUseVision)
      showToast(`Source "${selectedFile.name}" added successfully (${willUseVision ? 'Vision Pipeline' : 'Standard Pipeline'})`)
      closeUploadModal()
      await loadProjectData()
    } catch (err) {
      showError(err.message)
    } finally {
      setUploading(false)
    }
  }


  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function showError(msg) {
    setError(msg)
    setTimeout(() => setError(null), 6000)
  }

  async function loadProjectData() {
    setLoading(true)
    try {
      const [p, s, c] = await Promise.all([
        getProject(projectId),
        listSources(projectId).catch(() => []),
        listCards(projectId).catch(() => []),
      ])
      setProject(p)
      setSources(s || [])
      setCards(c || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const isImg = ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)
      await uploadSource(projectId, file, '', isImg)
      showToast(`Document "${file.name}" uploaded successfully`)
      await loadProjectData()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function startExtractionPolling() {
    if (extractTimerRef.current) clearInterval(extractTimerRef.current)
    extractTimerRef.current = setInterval(async () => {
      setExtractElapsedSeconds(s => s + 1)
      try {
        const statusRes = await getBriefStatus(projectId)
        if (statusRes) {
          if (typeof statusRes.cards_generated === 'number') {
            setExtractDocsCompleted(statusRes.cards_generated)
          }
          if (typeof statusRes.questions_count === 'number' && statusRes.questions_count > 0) {
            setExtractDocCount(statusRes.questions_count)
          }
          if (statusRes.current_step) {
            setExtractServerStep(statusRes.current_step)
          }

          if (statusRes.status === 'completed' || statusRes.current_step?.includes('Extraction Complete')) {
            clearInterval(extractTimerRef.current)
            extractTimerRef.current = null
            setExtracting(false)
            setExtractModalOpen(false)
            setShowExtractModal(false)
            await loadProjectData()
            setShowExtractCompleteModal(true)
            if (statusRes.id) acknowledgeJobNotification(statusRes.id).catch(() => {})
            showToast('✓ Extraction completed for all pending sources')
          } else if (statusRes.status === 'partial') {
            clearInterval(extractTimerRef.current)
            extractTimerRef.current = null
            setExtracting(false)
            setExtractModalOpen(false)
            setShowExtractModal(false)
            
            const completedCount = statusRes.cards_generated || 0
            const totalCount = statusRes.questions_count || 1
            const msg = statusRes.error?.includes('AI services') || statusRes.error?.includes('unavailable') || statusRes.error?.includes('timed out') || statusRes.error?.includes('low')
              ? 'AI services are temporarily unavailable. Please try again later.'
              : (statusRes.error || 'AI services are temporarily unavailable. Please try again later.')
            
            setAiFallbackTitle('PARTIAL / FAILED')
            setAiFallbackBadge(`${completedCount} / ${totalCount} Documents Completed`)
            setAiFallbackErrorMsg(msg)
            setAiFallbackModalOpen(true)
            if (statusRes.id) acknowledgeJobNotification(statusRes.id).catch(() => {})
            showToast(`⚠ Partial extraction (${completedCount}/${totalCount} completed)`)
            await loadProjectData()
          } else if (statusRes.status === 'failed') {
            clearInterval(extractTimerRef.current)
            extractTimerRef.current = null
            setExtracting(false)
            setExtractModalOpen(false)
            setShowExtractModal(false)
            
            const totalCount = statusRes.questions_count || 1
            const msg = statusRes.error?.includes('AI services') || statusRes.error?.includes('low') || statusRes.error?.includes('unavailable') || statusRes.error?.includes('timed out')
              ? 'AI services are temporarily unavailable. Please try again later.'
              : (statusRes.error ? `Extraction failed: ${statusRes.error}` : 'AI services are temporarily unavailable. Please try again later.')
            
            setAiFallbackTitle('FAILED')
            setAiFallbackBadge(`0 / ${totalCount} Documents Completed`)
            setAiFallbackErrorMsg(msg)
            setAiFallbackModalOpen(true)
            if (statusRes.id) acknowledgeJobNotification(statusRes.id).catch(() => {})
            showToast('✕ Extraction failed')
            await loadProjectData()
          }
        }
      } catch (err) {
        console.error('Polling extraction error:', err)
      }
    }, 2000)
  }

  function startPollingStatus() {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = setInterval(async () => {
      setAnalyzingSeconds(s => s + 1)
      try {
        const statusRes = await getBriefStatus(projectId)
        if (statusRes.current_step) {
          setAnalysisStep(statusRes.current_step)
        }

        if (statusRes.status === 'completed' || statusRes.current_step === 'Ready for Review') {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
          setAnalyzing(false)
          setShowAnalysisModal(false)
          
          // Reload updated project data
          const [freshCards, freshProj] = await Promise.all([
            listCards(projectId).catch(() => []),
            getProject(projectId).catch(() => null),
            loadProjectData()
          ])
          
          const docGeneratedCount = typeof statusRes.cards_generated === 'number'
            ? statusRes.cards_generated
            : 0
          const qCount = typeof statusRes.questions_count === 'number'
            ? statusRes.questions_count
            : (freshCards || []).filter(c => c.card_type === 'QUESTION').length
          const cCount = typeof statusRes.conflicts_count === 'number'
            ? statusRes.conflicts_count
            : (freshCards || []).filter(c => c.card_type === 'CONFLICT' || c.card_type === 'TENSION').length
          
          setAnalysisSummary({
            cardsGenerated: docGeneratedCount,
            projectTotalCards: (freshCards || []).length,
            questions: qCount,
            conflicts: cCount,
            documents: statusRes.document_names || sources.map(s => s.file_name).join(', ')
          })
          setShowCompleteModal(true)
          if (statusRes.id) acknowledgeJobNotification(statusRes.id).catch(() => {})
          showToast(`✦ ${docGeneratedCount} Brief Cards generated for "${freshProj?.name || project?.name || 'Project'}"!`)
        } else if (statusRes.status === 'failed') {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
          setAnalyzing(false)
          setShowAnalysisModal(false)
          const rawErr = statusRes.error || statusRes.error_message || ''
          const isAiDown = !rawErr || rawErr.includes('AI services') || rawErr.includes('unavailable') || rawErr.includes('timed out') || rawErr.includes('503') || rawErr.includes('low')
          setAnalysisError(isAiDown ? 'AI services are temporarily unavailable. Please try again later.' : rawErr)
          if (statusRes.id) acknowledgeJobNotification(statusRes.id).catch(() => {})
          loadProjectData().catch(() => {})
        } else if (statusRes.status === 'cancelled') {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
          setAnalyzing(false)
          setShowAnalysisModal(false)
          loadProjectData().catch(() => {})
        }
      } catch (pollErr) {
        console.error('Polling error:', pollErr)
      }
    }, 1500)
  }

  async function handleCancelAnalysis() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    try {
      await cancelBrief(projectId)
      showToast('Brief generation cancelled.')
    } catch (err) {
      console.warn('Cancel error:', err)
    } finally {
      setAnalyzing(false)
      setShowAnalysisModal(false)
      await loadProjectData()
    }
  }

  async function handleCancelExtract() {
    if (extractTimerRef.current) {
      clearInterval(extractTimerRef.current)
      extractTimerRef.current = null
    }
    try {
      await cancelSourceExtraction(projectId)
    } catch (e) {
      console.warn('Extraction cancel notification error:', e)
    }
    setExtractModalOpen(false)
    setShowExtractModal(false)
    setExtracting(false)
    setRowExtractingId(null)
    showToast('Document extraction cancelled. You can extract again when ready.')
    await loadProjectData()
  }

  async function handleRunAnalysis() {
    if (sources.length === 0) {
      showToast('Please upload at least one project document first.')
      if (fileInputRef.current) fileInputRef.current.click()
      return
    }

    if (isAllBriefed && !hasApprovedPendingReadyForBrief) {
      showToast('Analysis is already complete. All documents are parsed and up to date.')
      const qCount = cards.filter(c => c.card_type === 'QUESTION').length
      const cCount = cards.filter(c => c.card_type === 'CONFLICT' || c.card_type === 'TENSION').length
      setAnalysisSummary({
        totalCards: cards.length,
        questions: qCount,
        conflicts: cCount,
        documents: sources.map(s => s.file_name).join(', ')
      })
      setShowCompleteModal(true)
      return
    }

    const docsToProcess = pendingBatchSources.length > 0 ? pendingBatchSources : sources
    const estimate = calculateBriefEstimate(docsToProcess)
    setAnalysisEstimate(estimate)

    setAnalyzing(true)
    setShowAnalysisModal(true)
    setAnalysisError(null)
    setAnalyzingSeconds(0)
    setAnalysisStep('Initiating multi-agent analysis...')

    try {
      const job = await analyzeBrief(projectId)
      setAnalysisJobId(job.id)
      startPollingStatus()
    } catch (err) {
      setAnalyzing(false)
      setShowAnalysisModal(false)
      const rawMsg = err.message || ''
      const isAiDown = !rawMsg || rawMsg.includes('AI services') || rawMsg.includes('unavailable') || rawMsg.includes('timed out') || rawMsg.includes('503') || rawMsg.includes('low')
      setAnalysisError(isAiDown ? 'AI services are temporarily unavailable. Please try again later.' : rawMsg)
    }
  }

  function handleCopyShareLink() {
    const shareUrl = `${window.location.origin}/projects/${projectId}`
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true)
      showToast('Project link copied to clipboard!')
      setTimeout(() => setCopiedLink(false), 3000)
    }).catch(() => {
      showToast('Failed to copy link. Please copy URL manually.')
    })
  }

  function handleDeleteSource(sourceId, fileName) {
    setConfirmModal({
      title: 'Delete Document',
      message: `Are you sure you want to delete "${fileName}"? Any active background extraction will be stopped immediately and all parsed data will be permanently removed.`,
      confirmLabel: 'Delete Document',
      confirmStyle: 'danger',
      action: async () => {
        try {
          await deleteSource(projectId, sourceId)
          showToast(`Document "${fileName}" deleted and active processes halted.`)
          await loadProjectData()
        } catch (err) {
          setError(err.message)
        }
      }
    })
  }

  function handleDeleteProject() {
    setConfirmModal({
      title: 'Delete Project',
      message: `Are you sure you want to delete project "${project?.name || 'this project'}"? All associated documents, brief versions, cards, and questions will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete Project',
      confirmStyle: 'danger',
      action: async () => {
        try {
          await deleteProject(projectId)
          navigate('/overview')
        } catch (err) {
          setError(err.message)
        }
      }
    })
  }

  function handleResetVersion(ver) {
    setConfirmModal({
      title: `Reset Version ${ver}`,
      message: `Reset Version ${ver} to re-generate Brief Cards? All documents in Version ${ver} will return to pending extraction and synthesis.`,
      confirmLabel: `Reset Version ${ver}`,
      confirmStyle: 'warning',
      action: async () => {
        try {
          await resetVersion(projectId, ver)
          showToast(`Version ${ver} reset to pending.`)
          await loadProjectData()
        } catch (err) {
          showToast(`Reset failed: ${err.message}`)
        }
      }
    })
  }

  async function handleResetSourceVersion(sourceId) {
    try {
      await resetSourceVersion(projectId, sourceId)
      showToast('Document moved back to pending.')
      await loadProjectData()
    } catch (err) {
      showToast(`Reset failed: ${err.message}`)
    }
  }

  async function handleExtractSingle(source) {
    const ext = source.file_name?.split('.').pop()?.toLowerCase() || ''
    const isImg = source.file_type?.startsWith('image') || ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)
    let totalP = 1
    if (!isImg) {
      const pm = (source.file_name || '').match(/(\d+)\s*pages?/i)
      if (pm) totalP = parseInt(pm[1], 10)
      else if (source.file_size && source.file_size > 500000) totalP = Math.max(2, Math.round(source.file_size / (120 * 1024)))
      else totalP = 20
    }
    const estSec = isImg ? 8 : Math.max(25, totalP * 2)

    setExtractDocName(source.file_name || 'Document')
    setExtractDocCount(1)
    setExtractTotalPages(totalP)
    setExtractEstSeconds(estSec)
    setExtractElapsedSeconds(0)
    setExtractServerStep(`Initiating extraction for ${source.file_name || 'document'}...`)
    setExtractModalOpen(true)
    setShowExtractModal(true)
    setRowExtractingId(source.id)

    if (extractTimerRef.current) clearInterval(extractTimerRef.current)
    extractTimerRef.current = setInterval(() => {
      setExtractElapsedSeconds(s => s + 1)
    }, 1000)

    try {
      await reparseSource(projectId, source.id)
      // Extraction is async (background worker). Start polling sources until status resolves.
      const pollSingleSource = setInterval(async () => {
        try {
          const updated = await listSources(projectId)
          setSources(updated || [])
          const current = updated?.find(s => s.id === source.id)
          // Stop polling when no longer extracting
          if (current && current.processing_status !== 'extracting') {
            clearInterval(pollSingleSource)
            if (extractTimerRef.current) {
              clearInterval(extractTimerRef.current)
              extractTimerRef.current = null
            }
            setExtractModalOpen(false)
            setShowExtractModal(false)
            setRowExtractingId(null)
            if (current.processing_status === 'extracted' || current.extracted_text) {
              showToast(`✓ Extracted data for "${source.file_name}"`)
              setShowExtractCompleteModal(true)
            } else if (current.processing_status === 'failed') {
              const msg = current.processing_error?.includes('AI') || current.processing_error?.includes('timed out')
                ? 'It might take some time, AI services are temporarily low.'
                : `Extraction failed: ${current.processing_error || 'Unknown error'}`
              setAiFallbackErrorMsg(msg)
              setAiFallbackModalOpen(true)
            }
          }
        } catch (pollErr) {
          console.error('Source poll error:', pollErr)
        }
      }, 2500)
    } catch (err) {
      console.error('Source extraction error:', err)
      if (extractTimerRef.current) {
        clearInterval(extractTimerRef.current)
        extractTimerRef.current = null
      }
      setExtractModalOpen(false)
      setShowExtractModal(false)
      setRowExtractingId(null)
      const msg = err.message?.includes('AI services') || err.status === 503
        ? 'It might take some time, AI services are temporarily low.'
        : `Extraction failed: ${err.message}`
      setAiFallbackErrorMsg(msg)
      setAiFallbackModalOpen(true)
    }
  }

  async function handleExtractAllPending() {
    const docs = pendingBatchSources.length > 0 ? pendingBatchSources : sources.filter(s => !s.extracted_text)
    const docCount = docs.length || 1
    let totalP = 0
    docs.forEach(d => {
      const ext = d.file_name?.split('.').pop()?.toLowerCase() || ''
      const isImg = d.file_type?.startsWith('image') || ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)
      if (isImg) totalP += 1
      else {
        const pm = (d.file_name || '').match(/(\d+)\s*pages?/i)
        if (pm) totalP += parseInt(pm[1], 10)
        else if (d.file_size && d.file_size > 500000) totalP += Math.max(2, Math.round(d.file_size / (120 * 1024)))
        else totalP += 20
      }
    })
    totalP = Math.max(1, totalP)
    const estSec = Math.max(20, totalP * 2)

    setExtractDocName(docs[0]?.file_name || 'Pending Documents')
    setExtractDocCount(docCount)
    setExtractDocsCompleted(0)
    setExtractServerStep('Initiating background extraction...')
    setExtractTotalPages(totalP)
    setExtractEstSeconds(estSec)
    setExtractElapsedSeconds(0)
    setExtractModalOpen(true)
    setShowExtractModal(true)
    setExtracting(true)

    try {
      const resp = await extractSources(projectId)
      if (resp && resp.job_id) {
        startExtractionPolling()
      } else {
        // Fallback if no job id
        await loadProjectData()
        setExtracting(false)
        setExtractModalOpen(false)
        setShowExtractModal(false)
      }
    } catch (err) {
      console.error('Batch extraction error:', err)
      setExtracting(false)
      setExtractModalOpen(false)
      setShowExtractModal(false)
      const isConcurrency = err.message?.includes('Another extraction task is currently running')
      if (isConcurrency) {
        showError(err.message)
      } else {
        const msg = err.message?.includes('AI services') || err.status === 503
          ? 'It might take some time, AI services are temporarily low.'
          : `Extraction failed: ${err.message}`
        setAiFallbackErrorMsg(msg)
        setAiFallbackModalOpen(true)
      }
    }
  }

  // Real Counts & Status Breakdown
  const totalCards = cards.length
  const pendingCards = cards.filter(c => {
    const s = (c.status || '').toLowerCase()
    return s === 'provisional' || s === 'under review' || s === ''
  }).length
  const acceptedCards = cards.filter(c => (c.status || '').toLowerCase() === 'accepted').length
  const rejectedCards = cards.filter(c => (c.status || '').toLowerCase() === 'rejected').length

  // Version Grouping — A version is only considered completed if cards actually exist for that version!
  const versionsWithCards = new Set(cards.map(c => Number(c.version)).filter(v => !isNaN(v)))

  // Sources that belong to a completed version with generated cards
  const versionedSources = sources.filter(s => s.version !== null && s.version !== undefined && versionsWithCards.has(Number(s.version)))

  // Pending batch sources: either version is null OR their version has 0 cards generated
  const pendingBatchSources = sources.filter(s => s.version === null || s.version === undefined || !versionsWithCards.has(Number(s.version)))

  // Unique completed version numbers sorted descending (latest on top: Version 1, Version 0)
  const completedVersions = Array.from(new Set(versionedSources.map(s => Number(s.version)))).sort((a, b) => b - a)
  const authoritativeTargetVersion = completedVersions.length === 0 ? 0 : completedVersions[0] + 1

  // Check pending status
  const pendingNeedsExtraction = pendingBatchSources.some(s => s.processing_status === 'uploaded' || !s.extracted_text)
  const pendingNeedsReview = pendingBatchSources.length > 0 && !pendingNeedsExtraction && pendingBatchSources.some(s => s.approval_status !== 'approved')
  const hasApprovedPendingReadyForBrief = pendingBatchSources.length > 0 && pendingBatchSources.every(s => s.approval_status === 'approved')
  const isAllBriefed = sources.length > 0 && pendingBatchSources.length === 0 && totalCards > 0

  if (loading && !project) {
    return (
      <ProjectShell project={{ id: projectId }}>
        <div className="brief-ui-loading" style={{ minHeight: 'calc(100vh - 140px)' }}>
          <div className="bui-spinner bui-spinner-lg" />
          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>Loading project...</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Retrieving project sources and workspace parameters</div>
        </div>
      </ProjectShell>
    )
  }

  return (
    <ProjectShell project={project}>
      <div className="pov-container">
        
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp"
        />

        {/* Top Bar Header */}
        <header className="pov-top-bar">
          <div className="pov-top-left">
            <div className="pov-title-row">
              <h1 className="pov-title">{project?.name || 'Project Overview'}</h1>
              <span className="pov-badge-active">Active</span>
            </div>
            <p className="pov-subtitle">
              {project?.project_type || 'Residential Project'} • {project?.location || 'Studio Workspace'}
            </p>
          </div>

          <div className="pov-top-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="pov-btn-share" onClick={() => setShowShareModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>Share</span>
            </button>
            <button
              type="button"
              className="pov-btn-share"
              style={{ color: '#ef4444', borderColor: '#fee2e2' }}
              onClick={handleDeleteProject}
              title="Delete Project"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Delete Project</span>
            </button>
          </div>
        </header>

        {/* BACKGROUND STATUS BANNERS */}
        {analyzing && !showAnalysisModal && (
          <div style={{
            background: '#eff6ff',
            border: '1.5px solid #93c5fd',
            borderRadius: '10px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '16px',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="bui-spinner-inline" style={{ width: '18px', height: '18px', borderWidth: '2.5px' }} />
              <div>
                <strong style={{ fontSize: '13.5px', color: '#1e40af', display: 'block' }}>
                  Generating Brief Cards in background ({analyzingSeconds}s elapsed)
                </strong>
                <span style={{ fontSize: '12px', color: '#3b82f6' }}>
                  {analysisStep || 'Analyzing project documents and synthesizing cards...'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="bui-btn"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                onClick={() => setShowAnalysisModal(true)}
              >
                View Progress
              </button>
              <button
                type="button"
                className="bui-btn"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: '#ffffff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                onClick={handleCancelAnalysis}
              >
                Cancel Task
              </button>
            </div>
          </div>
        )}

        {extractModalOpen && !showExtractModal && (
          <div style={{
            background: '#f8fafc',
            border: '1.5px solid #cbd5e1',
            borderRadius: '10px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '16px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="bui-spinner-inline" style={{ width: '18px', height: '18px', borderWidth: '2.5px', borderColor: '#0f172a', borderTopColor: 'transparent' }} />
              <div>
                <strong style={{ fontSize: '13.5px', color: '#0f172a', display: 'block' }}>
                  Extracting documents in background ({extractElapsedSeconds}s elapsed)
                </strong>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Analyzing {extractDocName} • Workspace will update automatically
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="bui-btn bui-btn-outline"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, color: '#0f172a', borderColor: '#cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
                onClick={() => setShowExtractModal(true)}
              >
                View Progress
              </button>
              <button
                type="button"
                className="bui-btn"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: '#ffffff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                onClick={handleCancelExtract}
              >
                Cancel Task
              </button>
            </div>
          </div>
        )}

        {/* SECTION 1: Project Overview Hero Card */}
        <section className="pov-hero-card" style={analyzing || extractModalOpen ? { transition: 'all 0.3s' } : {}}>
          <div className="pov-hero-content">
            <div className="pov-hero-header">
              <h2 className="pov-section-title">Project Overview</h2>
              <p className="pov-hero-desc">
                Upload project documents, review extracted information, and generate AI Brief Cards.
              </p>
            </div>

            {/* 4 Stat Counters — Total / Pending / Accepted / Rejected */}
            <div className="pov-stats-row">
              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{totalCards}</strong>
                <span className="pov-stat-label">Total<br />Cards</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{pendingCards}</strong>
                <span className="pov-stat-label">Pending<br />Review</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{acceptedCards}</strong>
                <span className="pov-stat-label">Accepted<br />Cards</span>
              </div>

              <div className="pov-stat-cell">
                <strong className="pov-stat-number">{rejectedCards}</strong>
                <span className="pov-stat-label">Rejected<br />Cards</span>
              </div>
            </div>

            {/* Action Row */}
            <div className="pov-analyse-action-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', ...(analyzing || extractModalOpen ? { opacity: 0.65, pointerEvents: 'none' } : {}) }}>
              
              {sources.length === 0 ? (
                /* 1. No documents yet: Add Source CTA */
                <button
                  className="pov-btn-analyse"
                  onClick={() => openUploadModal('document')}
                  disabled={uploading}
                >
                  <span className="pov-sparkle">+</span>
                  <span>Add Project Source</span>
                </button>
              ) : pendingNeedsExtraction ? (
                /* 2. Newly uploaded documents requiring extraction */
                <button
                  className="pov-btn-analyse"
                  onClick={handleExtractAllPending}
                  disabled={extracting || analyzing}
                >
                  <span className="pov-sparkle">📄</span>
                  <span>
                    {extracting ? 'Extracting Data...' : 'Extract Data & Review'}
                  </span>
                </button>
              ) : pendingNeedsReview ? (
                /* 3. Already extracted documents needing review/approval */
                <button
                  className="pov-btn-analyse"
                  onClick={() => navigate(`/projects/${projectId}/extract`)}
                >
                  <span className="pov-sparkle">✓</span>
                  <span>Review Extracted Data →</span>
                </button>
              ) : hasApprovedPendingReadyForBrief ? (
                /* 4. Pending batch approved: Generate Brief */
                <button
                  className="pov-btn-analyse"
                  onClick={handleRunAnalysis}
                  disabled={analyzing}
                >
                  <span className="pov-sparkle">✦</span>
                  <span>
                    {analyzing ? 'Generating Brief...' : `Generate Brief (${completedVersions.length === 0 ? 'Version 0' : `Version ${completedVersions[0] + 1}`})`}
                  </span>
                </button>
              ) : (
                /* 5. All documents completed: View Brief Workspace + Re-generate option */
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="pov-btn-analyse"
                    onClick={() => navigate(`/projects/${projectId}/brief`)}
                  >
                    <span>View Brief Workspace →</span>
                  </button>
                  {/* Re-generate button disabled for now; can be enabled in future
                  {completedVersions.length > 0 && (
                    <button
                      type="button"
                      className="bui-btn bui-btn-outline"
                      style={{ padding: '11px 18px', fontSize: '13px', color: '#0f172a', borderColor: '#cbd5e1', borderRadius: '8px', fontWeight: 600, background: '#ffffff', cursor: 'pointer' }}
                      onClick={() => handleResetVersion(completedVersions[0])}
                      title={`Re-generate Brief Cards for latest Version ${completedVersions[0]}`}
                    >
                      ↻ Re-generate (Version {completedVersions[0]})
                    </button>
                  )}
                  */}
                </div>
              )}

              <span className="pov-analyse-subtext">
                {sources.length === 0
                  ? 'Upload project documents (PDF, DOCX, TXT) or images to begin.'
                  : pendingNeedsExtraction
                  ? `${pendingBatchSources.length} document(s) uploaded. Extract data and review before generating Brief.`
                  : pendingNeedsReview
                  ? `${pendingBatchSources.length} document(s) extracted. Review and approve before generating Brief.`
                  : hasApprovedPendingReadyForBrief
                  ? `Approved ${pendingBatchSources.length} document(s). Ready to synthesize Brief Cards.`
                  : `All ${sources.length} sources analysed and structured into Brief Cards.`}
              </span>
            </div>
          </div>

          <div className="pov-hero-graphic">
            <img
              src="/hero-sketch.jpg"
              alt="Project Architectural Drawing"
              className="pov-sketch-img"
            />
          </div>
        </section>

        {/* SECTION 2: Project Sources (Grouped by Version Header) */}
        <section className="pov-sources-section">
          <div className="pov-sources-header">
            <div>
              <h2 className="pov-section-title">Project Sources</h2>
              <p className="pov-sources-desc">All project documents and image sources organized by Version.</p>
            </div>

            <div className="pov-sources-actions">
              <button
                className="pov-btn-add-doc"
                onClick={() => openUploadModal('document')}
                disabled={uploading || analyzing}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Source</span>
              </button>
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="pov-empty-sources">
              <p>No documents or images uploaded to this project yet.</p>
              <button className="pov-btn-add-doc" onClick={() => openUploadModal('document')}>
                + Add Project Source
              </button>
            </div>
          ) : (
            <div className="pov-sources-version-groups" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* 1. Render Pending Extraction Group at Top (New In-flight Documents) */}
              {pendingBatchSources.length > 0 && (
                <div
                  className="pov-version-group-card"
                  style={{
                    background: '#ffffff',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    transition: 'all 0.25s',
                    ...((extractModalOpen && !showExtractModal) || (analyzing && !showAnalysisModal) ? {
                      opacity: 0.55,
                      filter: 'blur(0.5px)',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    } : {})
                  }}
                >
                  
                  {/* Single Pending Group Header */}
                  <div style={{ background: (extracting && !showExtractModal) ? '#eff6ff' : (analyzing && !showAnalysisModal) ? '#eff6ff' : '#f8fafc', borderBottom: '1px dashed #cbd5e1', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.3s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {(extracting && !showExtractModal) ? (
                        <span style={{ background: '#2563eb', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '4px', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span className="bui-spinner-inline" style={{ width: '10px', height: '10px', borderWidth: '1.5px', borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#ffffff', display: 'inline-block', verticalAlign: 'middle' }} />
                          Version {authoritativeTargetVersion} — ⏳ Extraction in Background
                        </span>
                      ) : (analyzing && !showAnalysisModal) ? (
                        <span style={{ background: '#2563eb', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '4px', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span className="bui-spinner-inline" style={{ width: '10px', height: '10px', borderWidth: '1.5px', borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#ffffff', display: 'inline-block', verticalAlign: 'middle' }} />
                          Version {authoritativeTargetVersion} — ⏳ Processing in Background
                        </span>
                      ) : (
                        <span style={{ background: '#0f172a', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                          Version {authoritativeTargetVersion} (Pending Extraction)
                        </span>
                      )}
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                        {pendingBatchSources.length} Document{pendingBatchSources.length !== 1 ? 's' : ''}
                      </span>
                      {pendingNeedsExtraction && !(extracting && !showExtractModal) && !(analyzing && !showAnalysisModal) && (
                        <button
                          type="button"
                          className="bui-btn"
                          onClick={handleExtractAllPending}
                          disabled={extracting || analyzing}
                          style={{
                            background: '#000000',
                            color: '#ffffff',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            border: 'none',
                            cursor: (extracting || analyzing) ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                          }}
                          title="Extract all documents belonging to this version"
                        >
                          <span>📄</span>
                          <span>EXTRACT & REVIEW</span>
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {(extracting && !showExtractModal) ? (
                        <span style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span className="bui-spinner-inline" style={{ width: '12px', height: '12px', borderWidth: '2px', borderColor: '#bfdbfe', borderTopColor: '#2563eb', display: 'inline-block' }} />
                          {(() => {
                            const pMatch = (extractServerStep || '').match(/Page\s+(\d+)\s+of\s+(\d+)/i)
                            return pMatch ? `Page ${pMatch[1]} / ${pMatch[2]} processed` : 'All extracting in background...'
                          })()}
                        </span>
                      ) : (analyzing && !showAnalysisModal) ? (
                        <span style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span className="bui-spinner-inline" style={{ width: '12px', height: '12px', borderWidth: '2px', borderColor: '#bfdbfe', borderTopColor: '#2563eb', display: 'inline-block' }} />
                          Brief synthesis in progress...
                        </span>
                      ) : !pendingNeedsExtraction ? (
                        <button
                          type="button"
                          className="bui-btn bui-btn-outline"
                          onClick={() => navigate(`/projects/${projectId}/extract`)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            color: '#2563eb',
                            borderColor: '#93c5fd',
                            background: '#eff6ff',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          Review Extracted Data →
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <table className="pov-sources-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Uploaded On</th>
                        <th>Status & Extracted Data</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBatchSources.map(s => {
                        const isApproved = s.approval_status === 'approved' || s.processing_status === 'approved'
                        const isExtracted = s.processing_status === 'extracted'
                        const isFailed = s.processing_status === 'failed'

                        return (
                          <tr key={s.id}>
                            <td className="td-name">
                              <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" width="14" height="14" className="pov-doc-icon">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span>{s.file_name}</span>
                            </td>
                            <td className="td-type">{(s.file_type || 'PDF').toUpperCase()}</td>
                            <td className="td-date">
                              {s.upload_timestamp ? new Date(s.upload_timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'}
                            </td>
                            <td className="td-ver" style={{ verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {/* When batch extraction is running in background, ALL rows show blue background state */}
                                {(extracting && !showExtractModal) ? (
                                  <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    <span className="bui-spinner-inline" style={{ width: '10px', height: '10px', borderWidth: '1.5px', borderColor: '#bfdbfe', borderTopColor: '#2563eb', display: 'inline-block' }} />
                                    Running in Background
                                  </span>
                                ) : rowExtractingId === s.id ? (
                                  <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    <span className="bui-spinner-inline" style={{ width: '10px', height: '10px', borderWidth: '1.5px', borderColor: '#bfdbfe', borderTopColor: '#2563eb', display: 'inline-block' }} />
                                    Extracting...
                                  </span>
                                ) : isApproved ? (
                                  <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                    ✓ Approved
                                  </span>
                                ) : isExtracted ? (
                                  <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                    ✓ Extracted
                                  </span>
                                ) : isFailed ? (
                                  <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                    ✕ Extraction Failed
                                  </span>
                                ) : (
                                  <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                    ○ Pending
                                  </span>
                                )}

                                {/* Extracted Data quick-view button: only show when extracted text is ready */}
                                {!(extracting && !showExtractModal) && rowExtractingId !== s.id && s.extracted_text && (
                                  <button
                                    type="button"
                                    className="bui-btn bui-btn-outline"
                                    style={{
                                      padding: '2px 8px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      color: '#2563eb',
                                      borderColor: '#93c5fd',
                                      background: '#eff6ff',
                                      borderRadius: '4px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      cursor: 'pointer'
                                    }}
                                    onClick={() => setViewingSource(s)}
                                    title="View extracted observations & text"
                                  >
                                    <span>📄</span>
                                    <span>Extracted Data</span>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              {/* Disable all row actions while batch extraction is running in background */}
                              {!(extracting && !showExtractModal) && rowExtractingId !== s.id && (
                                <>
                                  {s.extracted_text && (
                                    <button
                                      type="button"
                                      className="bui-btn bui-btn-outline"
                                      style={{ padding: '3px 10px', fontSize: '11px', color: '#0f172a', borderColor: '#cbd5e1', fontWeight: 600 }}
                                      onClick={() => setViewingSource(s)}
                                      title="Inspect extracted text & observations"
                                    >
                                      📄 View
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="bui-btn bui-btn-outline"
                                    style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#cbd5e1' }}
                                    onClick={() => handleDeleteSource(s.id, s.file_name)}
                                    title="Delete document"
                                  >
                                    🗑
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 2. Render Completed Version Groups (Latest on Top: Version 2, Version 1, Version 0) */}
              {completedVersions.map(ver => {
                const groupDocs = versionedSources.filter(s => Number(s.version) === ver)
                return (
                  <div key={`ver-${ver}`} className="pov-version-group-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    
                    {/* Single Version Group Header */}
                    <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#0f172a', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                          Version {ver}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                          {groupDocs.length} Document{groupDocs.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ✓ Complete
                        </span>
                        {/* Re-generate Cards button disabled for now; can be enabled in future
                        <button
                          type="button"
                          className="bui-btn bui-btn-outline"
                          style={{ padding: '3px 10px', fontSize: '11px', color: '#0f172a', borderColor: '#cbd5e1', background: '#ffffff', cursor: 'pointer' }}
                          onClick={() => handleResetVersion(ver)}
                          title={`Reset Version ${ver} documents to re-generate Brief Cards`}
                        >
                          ↻ Re-generate Cards
                        </button>
                        */}
                      </div>
                    </div>

                    <table className="pov-sources-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Uploaded On</th>
                          <th>Status & Extracted Data</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupDocs.map(s => (
                          <tr key={s.id}>
                            <td className="td-name">
                              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" width="14" height="14" className="pov-doc-icon">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span>{s.file_name}</span>
                            </td>
                            <td className="td-type">{(s.file_type || 'PDF').toUpperCase()}</td>
                            <td className="td-date">
                              {s.upload_timestamp ? new Date(s.upload_timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'}
                            </td>
                            <td className="td-ver" style={{ verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                  ✓ Approved
                                </span>
                                {s.extracted_text && (
                                  <button
                                    type="button"
                                    className="bui-btn bui-btn-outline"
                                    style={{
                                      padding: '2px 8px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      color: '#2563eb',
                                      borderColor: '#93c5fd',
                                      background: '#eff6ff',
                                      borderRadius: '4px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      cursor: 'pointer'
                                    }}
                                    onClick={() => setViewingSource(s)}
                                    title="View extracted observations & text"
                                  >
                                    <span>📄</span>
                                    <span>Extracted Data</span>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button
                                type="button"
                                className="bui-btn bui-btn-outline"
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#0f172a', borderColor: '#cbd5e1' }}
                                onClick={() => setViewingSource(s)}
                                title="Inspect extracted text & observations"
                              >
                                📄 View Data
                              </button>
                              <button
                                type="button"
                                className="bui-btn bui-btn-outline"
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#cbd5e1' }}
                                onClick={() => handleDeleteSource(s.id, s.file_name)}
                                title="Delete document"
                              >
                                🗑
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}

            </div>
          )}
        </section>

        {/* DOCUMENT TEXT INSPECTOR MODAL */}
        {viewingSource && (
          <div className="bui-modal-overlay" onClick={() => setViewingSource(null)} style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '90%', background: '#ffffff', borderRadius: '12px', padding: '24px 28px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ background: '#0f172a', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                      {viewingSource.version !== null && viewingSource.version !== undefined ? `Version ${viewingSource.version}` : 'Pending'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {(viewingSource.file_type || 'PDF').toUpperCase()} • {viewingSource.file_size ? formatFileSize(viewingSource.file_size) : ''}
                    </span>
                    {viewingSource.file_type === 'image' && (
                      <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600 }}>
                        ✦ Visual Analysis Complete
                      </span>
                    )}
                    {viewingSource.approval_status === 'approved' && (
                      <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600 }}>
                        ✓ Approved
                      </span>
                    )}
                  </div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    {viewingSource.file_name}
                  </h2>
                </div>
                <button
                  type="button"
                  className="bui-close-btn"
                  onClick={() => setViewingSource(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>
                  {viewingSource.file_type === 'image' ? 'Visual Site Observations & Extracted Text' : 'Extracted Document Content'}
                </span>
                <div style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  background: '#f8fafc',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12.5px',
                  lineHeight: 1.6,
                  color: '#1e293b',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'Consolas, Monaco, monospace'
                }}>
                  {viewingSource.extracted_text || viewingSource.ocr_text || 'No extracted text available for this document.'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  style={{ padding: '8px 16px', fontSize: '12.5px', color: '#2563eb', borderColor: '#cbd5e1' }}
                  onClick={() => {
                    setViewingSource(null)
                    navigate(`/projects/${projectId}/extract`)
                  }}
                >
                  ✏ Open in Review Editor →
                </button>
                <button
                  type="button"
                  className="bui-btn"
                  style={{ background: '#0f172a', color: '#ffffff', padding: '8px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                  onClick={() => setViewingSource(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI SERVICES TEMPORARILY LOW FALLBACK MODAL */}
        {aiFallbackModalOpen && (
          <div className="bui-modal-overlay" onClick={() => setAiFallbackModalOpen(false)} style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 1100 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', width: '90%', background: '#ffffff', borderRadius: '12px', padding: '26px 28px', color: '#0f172a', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px auto', fontSize: '24px' }}>
                ⚠️
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.01em' }}>
                {aiFallbackTitle || 'AI Service Notice'}
              </h3>
              {aiFallbackBadge && (
                <div style={{
                  display: 'inline-block',
                  background: '#f1f5f9',
                  color: '#1e293b',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '3px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  marginBottom: '14px'
                }}>
                  {aiFallbackBadge}
                </div>
              )}
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.55, marginBottom: '22px' }}>
                {aiFallbackErrorMsg || "AI services are temporarily unavailable. Please try again later."}
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  style={{ padding: '8px 18px', fontSize: '12.5px', color: '#64748b', borderColor: '#cbd5e1' }}
                  onClick={() => setAiFallbackModalOpen(false)}
                >
                  Dismiss
                </button>
                {aiFallbackBadge && !aiFallbackBadge.startsWith('0 /') && (
                  <button
                    type="button"
                    className="bui-btn"
                    style={{ background: '#0f172a', color: '#ffffff', padding: '8px 18px', borderRadius: '6px', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: '12.5px' }}
                    onClick={() => {
                      setAiFallbackModalOpen(false)
                      navigate(`/projects/${projectId}/extract`)
                    }}
                  >
                    View Completed Sources →
                  </button>
                )}
                <button
                  type="button"
                  className="bui-btn"
                  style={{ background: '#2563eb', color: '#ffffff', padding: '8px 20px', borderRadius: '6px', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: '12.5px' }}
                  onClick={() => {
                    setAiFallbackModalOpen(false)
                    handleExtractAllPending()
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}




        {/* SOURCE UPLOAD MODAL (DOCUMENT VS IMAGE SELECTION) */}
        {showUploadModal && (
          <div className="bui-modal-overlay" onClick={closeUploadModal}>
            <div
              className="bui-modal"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '480px',
                width: '100%',
                background: '#ffffff',
                color: '#0f172a',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                padding: '24px 28px',
                boxSizing: 'border-box'
              }}
            >
              <div className="bui-modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Add Project Source</h2>
                <button className="bui-close-btn" style={{ color: '#64748b' }} onClick={closeUploadModal}>✕</button>
              </div>

              <div>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px', lineHeight: 1.4 }}>
                  Select the source format to ingest. The system will extract and prepare text for your review.
                </p>

                {/* Step 1: Category Selection Tabs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  
                  <button
                    type="button"
                    onClick={() => switchUploadCategory('document')}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                      background: uploadCategory === 'document' ? '#000000' : '#ffffff',
                      color: uploadCategory === 'document' ? '#ffffff' : '#334155',
                      border: uploadCategory === 'document' ? '1.5px solid #000000' : '1px solid #e2e8f0',
                      boxShadow: uploadCategory === 'document' ? '0 4px 12px rgba(0,0,0,0.12)' : 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <strong style={{ fontSize: '13px', letterSpacing: '-0.01em' }}>Document</strong>
                    <span style={{ fontSize: '11px', opacity: uploadCategory === 'document' ? 0.8 : 0.6 }}>PDF, DOCX, TXT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => switchUploadCategory('image')}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                      background: uploadCategory === 'image' ? '#000000' : '#ffffff',
                      color: uploadCategory === 'image' ? '#ffffff' : '#334155',
                      border: uploadCategory === 'image' ? '1.5px solid #000000' : '1px solid #e2e8f0',
                      boxShadow: uploadCategory === 'image' ? '0 4px 12px rgba(0,0,0,0.12)' : 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <strong style={{ fontSize: '13px', letterSpacing: '-0.01em' }}>Image / Visual</strong>
                    <span style={{ fontSize: '11px', opacity: uploadCategory === 'image' ? 0.8 : 0.6 }}>JPG, PNG, WEBP</span>
                  </button>

                </div>

                {/* Hidden Modal File Input (Mounted in DOM so browser file streams remain valid) */}
                <input
                  type="file"
                  ref={modalFileInputRef}
                  style={{ display: 'none' }}
                  accept={uploadCategory === 'document' ? '.pdf,.docx,.doc,.txt' : '.jpg,.jpeg,.png,.webp'}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileSelected(f)
                    e.target.value = ''
                  }}
                />

                {/* Step 2: File Selector / Dropzone */}
                <div
                  style={{
                    border: '1.5px dashed #cbd5e1',
                    borderRadius: '8px',
                    padding: '20px 16px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => modalFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const f = e.dataTransfer?.files?.[0]
                    if (f) handleFileSelected(f)
                  }}
                >
                  {selectedFile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px' }}>
                        ✓ File Selected
                      </span>
                      <strong style={{ fontSize: '13px', color: '#0f172a', wordBreak: 'break-all', marginTop: '2px' }}>
                        {selectedFile.name}
                      </strong>
                      <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {formatFileSize(selectedFile.size)} • Click to change
                      </span>
                    </div>
                  ) : (
                    <div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.75" width="24" height="24" style={{ margin: '0 auto 6px auto', display: 'block' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                        Click to browse {uploadCategory === 'document' ? 'documents' : 'images'}
                      </strong>
                      <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                        {uploadCategory === 'document' ? 'Supported: PDF, DOCX, DOC, TXT' : 'Supported: JPG, JPEG, PNG, WEBP'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 2b: Image Presence Option — Only for Documents (PDF, DOCX, TXT); Images route directly to visual pipeline */}
                {uploadCategory === 'document' ? (
                  <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', textAlign: 'left' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
                      Does this document include drawings, plans, or visual diagrams?
                    </label>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#1e293b', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="containsImagesOption"
                          checked={containsImages === true}
                          onChange={() => setContainsImages(true)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: containsImages ? 700 : 500 }}>Yes</span>
                        <span style={{ fontSize: '11px', color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px' }}>Full Document Analysis</span>
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#1e293b', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="containsImagesOption"
                          checked={containsImages === false}
                          onChange={() => setContainsImages(false)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: !containsImages ? 700 : 500 }}>No</span>
                        <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>Standard Processing</span>
                      </label>
                    </div>
                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '8px 0 0 0', lineHeight: 1.45 }}>
                      {containsImages 
                        ? "✦ Comprehensive document processing including diagrams, drawings, plans, and embedded visual content."
                        : "Standard pipeline: Fast structured text and tabular data extraction for standard text documents, specifications, and reports."}
                    </p>
                  </div>
                ) : (
                  <div style={{ marginTop: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', color: '#2563eb' }}>✦</span>
                    <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600 }}>
                      Detailed architectural image processing for site context, orientation, and visual references.
                    </span>
                  </div>
                )}

                <div style={{ marginTop: '14px', textAlign: 'left' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Document Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Site survey and site dimensions for the Jubilee Hills residence."
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: '12.5px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      color: '#0f172a'
                    }}
                  />
                </div>

                {fileTypeError && (
                  <div style={{ color: '#b91c1c', fontSize: '12px', marginTop: '10px', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '6px' }}>
                    ⚠ {fileTypeError}
                  </div>
                )}
              </div>

              <div className="bui-modal-actions" style={{ borderTop: '1px solid #f1f5f9', marginTop: '16px', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="bui-btn"
                  style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  onClick={closeUploadModal}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={{
                    background: '#000000',
                    color: '#ffffff',
                    border: '1px solid #000000',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: (!selectedFile || uploading) ? 'not-allowed' : 'pointer',
                    opacity: (!selectedFile || uploading) ? 0.5 : 1,
                    transition: 'all 0.15s'
                  }}
                  onClick={handleConfirmUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading
                    ? 'Uploading...'
                    : uploadCategory === 'image'
                    ? 'Upload Image for Visual Analysis'
                    : 'Upload & Save Source'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* SHARE MODAL */}
        {showShareModal && (
          <div className="bui-modal-overlay" onClick={() => setShowShareModal(false)}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="bui-modal-header">
                <h2>Share Project</h2>
                <button className="bui-close-btn" onClick={() => setShowShareModal(false)}>✕</button>
              </div>

              <div style={{ padding: '8px 0 20px 0' }}>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
                  Share this project link with authorized studio members. Authentication is required to view project details.
                </p>

                <div className="bui-form-group">
                  <label>Project Link</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/projects/${projectId}`}
                      style={{ background: '#090d16', color: '#f8fafc', fontSize: '12px' }}
                    />
                    <button
                      type="button"
                      className="bui-btn bui-btn-primary"
                      onClick={handleCopyShareLink}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {copiedLink ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bui-modal-actions">
                <button type="button" className="bui-btn bui-btn-outline" onClick={() => setShowShareModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DYNAMIC ANALYSIS IN-PROGRESS MODAL */}
        {analyzing && showAnalysisModal && (
          <GeneratingProgressModal
            estimate={analysisEstimate}
            elapsedSeconds={analyzingSeconds}
            serverStep={analysisStep}
            projectName={project?.name || 'Project'}
            onRunInBackground={() => setShowAnalysisModal(false)}
            onCancel={handleCancelAnalysis}
          />
        )}

        {/* DYNAMIC EXTRACTION IN-PROGRESS MODAL */}
        {extractModalOpen && showExtractModal && (
          <ExtractingProgressModal
            documentName={extractDocName}
            docsCompleted={extractDocsCompleted}
            docCount={extractDocCount}
            serverStep={extractServerStep}
            totalPages={extractTotalPages}
            estimatedSeconds={extractEstSeconds}
            elapsedSeconds={extractElapsedSeconds}
            onRunInBackground={() => {
              setShowExtractModal(false)
              showToast('⚙ Extraction running in background. You can navigate freely.')
            }}
            onCancel={handleCancelExtract}
          />
        )}

        {/* NON-BLOCKING BACKGROUND RUNNING INDICATOR */}
        {((extracting && !showExtractModal) || (analyzing && !showAnalysisModal)) && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#ffffff',
            border: '1px solid #bfdbfe',
            boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.15)',
            borderRadius: '12px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 900
          }}>
            <span className="bui-spinner-inline" style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: '#bfdbfe', borderTopColor: '#2563eb' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                {extracting
                  ? `Extraction in background (${extractDocsCompleted} / ${extractDocCount} completed)`
                  : 'Analysis running in background'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {extracting ? (extractServerStep || 'Processing documents...') : (analysisStep || 'Generating Brief Cards...')}
              </div>
            </div>
            <button
              onClick={() => extracting ? setShowExtractModal(true) : setShowAnalysisModal(true)}
              style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
            >
              View
            </button>
            <button
              onClick={extracting ? handleCancelExtract : handleCancelAnalysis}
              style={{ background: 'transparent', color: '#ef4444', border: 'none', padding: '4px 6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
              title="Cancel task"
            >
              Cancel
            </button>
          </div>
        )}

        {/* EXTRACTION COMPLETE SUCCESS MODAL */}
        {showExtractCompleteModal && (
          <div className="bui-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', textAlign: 'center', padding: '30px 24px', background: '#ffffff', borderRadius: '12px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '22px' }}>
                ✓
              </div>
              <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                Extraction Completed
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '22px', lineHeight: 1.5 }}>
                Documents have been extracted and prepared. You can now review the extracted content or proceed to generate Brief Cards.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  style={{ padding: '8px 16px', fontSize: '13px', color: '#64748b', borderColor: '#cbd5e1' }}
                  onClick={() => setShowExtractCompleteModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  style={{ background: '#000000', color: '#ffffff', padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                  onClick={() => {
                    setShowExtractCompleteModal(false)
                    navigate(`/projects/${projectId}/extract`)
                  }}
                >
                  Review Extracted Data →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ANALYSIS COMPLETE SUCCESS MODAL */}
        {showCompleteModal && (
          <div className="bui-modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center', padding: '32px 28px', background: '#ffffff', borderRadius: '12px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '22px' }}>
                ✓
              </div>
              
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                Analysis Complete
              </h2>
              
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
                Project information has been analysed and the Brief Cards have been generated successfully.
              </p>

              {analysisSummary && (
                <>
                  <div className="pov-summary-counts" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                    <div>
                      <strong style={{ fontSize: '20px', color: '#0f172a', display: 'block' }}>{analysisSummary.cardsGenerated}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Cards Generated</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: '20px', color: '#0f172a', display: 'block' }}>{analysisSummary.questions}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Questions</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: '20px', color: '#0f172a', display: 'block' }}>{analysisSummary.conflicts}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Conflicts</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', marginBottom: '20px', fontSize: '12px', color: '#64748b' }}>
                    Project Total: <strong style={{ color: '#0f172a' }}>{analysisSummary.projectTotalCards} Total Cards</strong> across all documents
                  </div>
                </>
              )}
              <button
                style={{
                  width: '100%',
                  background: '#000000',
                  color: '#ffffff',
                  border: '1px solid #000000',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onClick={() => {
                  setShowCompleteModal(false)
                  navigate(`/projects/${projectId}/brief`)
                }}
              >
                Open Brief Workspace →
              </button>
            </div>
          </div>
        )}

        {/* ANALYSIS ERROR MODAL */}
        {analysisError && (
          <div className="bui-modal-overlay" onClick={() => setAnalysisError(null)} style={{ background: 'rgba(5, 7, 12, 0.85)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
            <div className="bui-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center', padding: '32px 28px', background: '#ffffff', borderRadius: '12px', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '24px' }}>
                ⚠️
              </div>
              <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#991b1b', marginBottom: '8px' }}>
                Generation Failed
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '22px', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {analysisError}
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  style={{ padding: '10px 18px', fontSize: '13px', color: '#64748b', borderColor: '#cbd5e1' }}
                  onClick={() => setAnalysisError(null)}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="bui-btn"
                  style={{ background: '#0f172a', color: '#ffffff', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: '13px' }}
                  onClick={() => {
                    setAnalysisError(null)
                    handleRunAnalysis()
                  }}
                >
                  Generate Brief Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM CONFIRMATION MODAL */}
        {confirmModal && (
          <div className="bui-modal-overlay" onClick={() => !confirmLoading && setConfirmModal(null)} style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(5px)', zIndex: 1200 }}>
            <div
              className="bui-modal"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '460px',
                width: '90%',
                background: '#ffffff',
                borderRadius: '14px',
                padding: '28px 26px',
                color: '#0f172a',
                boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
                border: '1px solid #e2e8f0',
                textAlign: 'center'
              }}
            >
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: confirmModal.confirmStyle === 'danger' ? '#fef2f2' : '#fffbeb',
                border: `1.5px solid ${confirmModal.confirmStyle === 'danger' ? '#fecaca' : '#fde68a'}`,
                color: confirmModal.confirmStyle === 'danger' ? '#dc2626' : '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                fontSize: '22px'
              }}>
                {confirmModal.confirmStyle === 'danger' ? '🗑' : '⚠️'}
              </div>

              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
                {confirmModal.title}
              </h3>

              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 24px 0' }}>
                {confirmModal.message}
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="bui-btn bui-btn-outline"
                  style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 600, color: '#475569', borderColor: '#cbd5e1', borderRadius: '8px', cursor: 'pointer' }}
                  onClick={() => setConfirmModal(null)}
                  disabled={confirmLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={{
                    background: confirmModal.confirmStyle === 'danger' ? '#dc2626' : '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 22px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: confirmLoading ? 'not-allowed' : 'pointer',
                    opacity: confirmLoading ? 0.7 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: confirmModal.confirmStyle === 'danger' ? '0 4px 12px rgba(220, 38, 38, 0.25)' : 'none'
                  }}
                  onClick={async () => {
                    setConfirmLoading(true)
                    try {
                      await confirmModal.action()
                    } finally {
                      setConfirmLoading(false)
                      setConfirmModal(null)
                    }
                  }}
                  disabled={confirmLoading}
                >
                  {confirmLoading ? 'Processing...' : confirmModal.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && <div className="bui-toast">{toast}</div>}
        {error && <div className="bui-toast-error">{error}</div>}

      </div>
    </ProjectShell>
  )
}

