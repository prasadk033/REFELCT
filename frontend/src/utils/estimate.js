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

    // Check for explicit page markers from page-by-page vision extraction
    const pageMatches = text.match(/Page:\s*\d+/gi)
    if (pageMatches && pageMatches.length > 0) {
      // Find highest page number or match count
      totalPages += pageMatches.length
    } else {
      // Check if filename contains page info (e.g. jub(8PAGES).pdf)
      const filenameMatch = (s.file_name || '').match(/(\d+)\s*pages?/i)
      if (filenameMatch) {
        totalPages += parseInt(filenameMatch[1], 10)
      } else {
        // Estimate based on standard density (~3,000 characters per page)
        const est = Math.max(1, Math.round(textLen / 3000))
        totalPages += est
      }
    }
  })

  // Dynamic formula calibrated from production logs
  const baselineOverhead = 18 // Initialization & LiteLLM handshake
  const charProcessingTime = (totalChars / 1000) * 1.65
  const multiDocCrossTime = sourcesToProcess.length > 1 ? (sourcesToProcess.length - 1) * 12 : 0

  let estimatedSeconds = Math.round(baselineOverhead + charProcessingTime + multiDocCrossTime)
  if (estimatedSeconds < 25) estimatedSeconds = 25

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
