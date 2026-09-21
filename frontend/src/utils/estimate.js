/**
 * Dynamic Estimation Utility for Brief Card Generation in REFELCT.
 *
 * Calibrated against live GPU server production logs:
 * - 69,526 characters (~20 pages) processed in 132.8s (~1.65s per 1k chars + baseline 20s)
 * - 8 pages (~25,000 chars) processed in ~55 - 65s
 * - 2 pages (~6,000 chars) processed in ~28 - 35s
 */

export function calculateBriefEstimate(sourcesToProcess = []) {
  if (!sourcesToProcess || sourcesToProcess.length === 0) {
    return {
      estimatedSeconds: 30,
      formattedTime: '30 seconds',
      totalChars: 0,
      totalPages: 1,
      docCount: 1,
      docNames: 'Document'
    }
  }

  let totalChars = 0
  let totalPages = 0
  const names = []

  sourcesToProcess.forEach(s => {
    names.push(s.file_name)
    const text = s.extracted_text || ''
    const textLen = text.length
    totalChars += textLen

    // 1. Check for explicit page markers from page-by-page vision extraction
    const pageNumMatches = [...text.matchAll(/Page:\s*(\d+)/gi)].map(m => parseInt(m[1], 10))
    const pageOfMatches = [...text.matchAll(/(\d+)\s*(?:of|\/)\s*(\d+)/gi)].map(m => parseInt(m[2], 10))
    
    if (pageNumMatches.length > 0 || pageOfMatches.length > 0) {
      const allFound = [...pageNumMatches, ...pageOfMatches]
      const maxFound = Math.max(...allFound)
      totalPages += Math.max(maxFound, pageNumMatches.length)
    } else {
      // 2. Check if filename contains page info (e.g. Brief_document(25pages).pdf)
      const filenameMatch = (s.file_name || '').match(/(\d+)\s*pages?/i)
      if (filenameMatch) {
        totalPages += parseInt(filenameMatch[1], 10)
      } else if (s.file_size && s.file_size > 500000 && (s.file_name || '').endsWith('.pdf')) {
        // PDF size estimation: architectural PDFs average ~120KB per page
        const estFromSize = Math.max(2, Math.round(s.file_size / (120 * 1024)))
        totalPages += estFromSize
      } else {
        // 3. Fallback estimate based on standard density
        const est = Math.max(1, Math.round(textLen / 2200))
        totalPages += est
      }
    }
  })

  // Dynamic formula calibrated from production logs + 30s safe side buffer
  const baselineOverhead = 22 // Initialization & handshake
  const charProcessingTime = (totalChars / 1000) * 1.65
  const multiDocCrossTime = sourcesToProcess.length > 1 ? (sourcesToProcess.length - 1) * 12 : 0
  const safeBuffer = 30 // Safe-side buffer requested by user

  let estimatedSeconds = Math.round(baselineOverhead + charProcessingTime + multiDocCrossTime + safeBuffer)
  if (estimatedSeconds < 35) estimatedSeconds = 35

  let formattedTime = ''
  if (estimatedSeconds < 60) {
    formattedTime = `${estimatedSeconds} seconds`
  } else {
    const mins = Math.floor(estimatedSeconds / 60)
    const secs = estimatedSeconds % 60
    formattedTime = secs > 0 ? `${mins} min ${secs}s` : `${mins} min`
  }

  return {
    estimatedSeconds,
    formattedTime,
    totalChars,
    totalPages: Math.max(1, totalPages),
    docCount: sourcesToProcess.length,
    docNames: names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2} more` : '')
  }
}

export function getProgressStep(progressPercent) {
  if (progressPercent < 20) {
    return 'Reading verified project sources & compiling context...'
  } else if (progressPercent < 50) {
    return 'Extracting architectural parameters & synthesizing candidate cards...'
  } else if (progressPercent < 75) {
    return 'Structuring parameters, requirements, and client information...'
  } else if (progressPercent < 92) {
    return 'Evaluating cross-document correlations, tensions, and project gaps...'
  } else {
    return 'Finalizing brief intelligence and preparing workspace...'
  }
}
