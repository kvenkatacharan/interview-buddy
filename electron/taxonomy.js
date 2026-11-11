// Shared between the main process and the renderer. Issue tags are a fixed list so
// the same weakness can be counted across sessions and fed into the next interview.

export const DIMENSIONS = [
  { id: 'problem_understanding', label: 'Problem understanding', hint: 'Restated the problem, asked clarifying questions, pinned down constraints' },
  { id: 'approach', label: 'Approach', hint: 'Found a working approach, then an efficient one, and explained the tradeoffs' },
  { id: 'correctness', label: 'Correctness', hint: 'Final code works, including edge cases' },
  { id: 'code_quality', label: 'Code quality', hint: 'Readable, well-named, sensibly structured' },
  { id: 'complexity_analysis', label: 'Complexity analysis', hint: 'Stated time and space complexity correctly' },
  { id: 'testing', label: 'Testing', hint: 'Dry-ran examples and chose good test cases unprompted' },
  { id: 'communication', label: 'Communication', hint: 'Thought aloud, kept the interviewer in the loop, took hints well' },
]

export const ISSUE_TAGS = [
  { id: 'no_clarifying_questions', label: 'Skipped clarifying questions' },
  { id: 'jumped_to_code', label: 'Started coding before agreeing on an approach' },
  { id: 'missed_edge_cases', label: 'Missed edge cases' },
  { id: 'suboptimal_approach', label: 'Settled for a suboptimal approach' },
  { id: 'no_complexity_analysis', label: 'Did not state complexity' },
  { id: 'wrong_complexity', label: 'Got complexity wrong' },
  { id: 'bugs_in_code', label: 'Bugs in the final code' },
  { id: 'off_by_one', label: 'Off-by-one / boundary errors' },
  { id: 'unclear_code', label: 'Hard-to-read code (naming, structure)' },
  { id: 'no_testing', label: 'Did not test or dry-run the code' },
  { id: 'silent_coding', label: 'Coded silently without explaining' },
  { id: 'heavy_hint_reliance', label: 'Needed many hints' },
  { id: 'time_management', label: 'Ran out of time / poor pacing' },
  { id: 'weak_follow_up', label: 'Struggled with the follow-up question' },
  { id: 'language_fluency', label: 'Unfamiliar with language or library basics' },
  { id: 'other', label: 'Other' },
]

export const VERDICTS = [
  { id: 'strong_hire', label: 'Strong hire' },
  { id: 'hire', label: 'Hire' },
  { id: 'lean_hire', label: 'Lean hire' },
  { id: 'lean_no_hire', label: 'Lean no hire' },
  { id: 'no_hire', label: 'No hire' },
]

export const labelFor = (list, id) => list.find((x) => x.id === id)?.label ?? id

// Recurring weaknesses across recent sessions: how many of the last N reports flagged
// each issue tag, and which dimensions average below the bar.
export function computeWeakSpots(sessions, lookback = 8) {
  const recent = sessions.filter((s) => s.report).slice(0, lookback)
  const tagCounts = new Map()
  const dimTotals = new Map()

  for (const s of recent) {
    const tags = new Set(s.report.issues.map((i) => i.tag).filter((t) => t !== 'other'))
    for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    for (const d of s.report.dimensions) {
      const cur = dimTotals.get(d.id) ?? { sum: 0, n: 0 }
      dimTotals.set(d.id, { sum: cur.sum + d.score, n: cur.n + 1 })
    }
  }

  const issues = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, label: labelFor(ISSUE_TAGS, tag), count }))
    .sort((a, b) => b.count - a.count)

  const dimensions = DIMENSIONS.map((d) => {
    const t = dimTotals.get(d.id)
    return { ...d, average: t ? t.sum / t.n : null }
  })

  return { sessionsConsidered: recent.length, issues, dimensions }
}
