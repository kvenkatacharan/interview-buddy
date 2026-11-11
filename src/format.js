export function averageScore(report) {
  const scores = report.dimensions.map((d) => d.score)
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
