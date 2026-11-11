// The AI interviewer and the post-interview debrief, both on the Claude API.
//
// The conversation for a live session is kept here in the main process and is only
// ever appended to: assistant turns go back exactly as the API returned them
// (thinking blocks included) and the system prompt is fixed for the whole session.
import Anthropic from '@anthropic-ai/sdk'
import { DIMENSIONS, ISSUE_TAGS, VERDICTS, computeWeakSpots, labelFor } from './taxonomy.js'

const MODEL = 'claude-opus-5-5'
// On a safety-classifier decline, the API retries on Anthropic's recommended fallback model.
const BETAS = ['server-side-fallback-2026-07-01']

export function createClient(apiKey) {
  // With no saved key, the SDK falls back to ANTHROPIC_API_KEY or an `ant auth login` profile.
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic()
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

function interviewerSystemPrompt(settings, pastSessions) {
  const weak = computeWeakSpots(pastSessions)
  const recurring = weak.issues.filter((i) => i.count >= 2).slice(0, 4)
  const lowDims = weak.dimensions.filter((d) => d.average !== null && d.average < 2.5)
  const usedTitles = pastSessions
    .map((s) => s.report?.problem_title)
    .filter(Boolean)
    .slice(0, 30)

  const weakBlock =
    settings.targetWeakSpots && (recurring.length || lowDims.length)
      ? `\nThis candidate's recent mock interviews flagged these recurring weaknesses. Pick a problem where they will matter, and give the candidate natural chances to show whether they have improved (without telling them what you are testing):
${recurring.map((i) => `- ${i.label} (in ${i.count} of the last ${weak.sessionsConsidered} sessions)`).join('\n')}
${lowDims.map((d) => `- Low scores on ${d.label.toLowerCase()} (average ${d.average.toFixed(1)} / 4)`).join('\n')}\n`
      : ''

  const avoidBlock = usedTitles.length
    ? `\nProblems this candidate has already practiced (pick a different one): ${usedTitles.join('; ')}.\n`
    : ''

  return `You are the interviewer in a mock coding interview. The candidate is practicing for real software engineering interviews. The session is only useful if it feels like the real thing: they have to do the thinking themselves, and their weak spots have to show so the debrief afterward can point at them.

Session setup:
- Difficulty: ${settings.difficulty}
- Topic: ${settings.topic || 'your choice, typical of big-tech coding rounds'}
- Candidate's language: ${settings.language}
- Length: ${settings.minutes} minutes
${weakBlock}${avoidBlock}
Open with a one-line greeting and present one problem the way an interviewer would: a short statement, one or two examples with input and output, and the core constraints. Leave some details unstated (input size, duplicates, empty input, value ranges and so on) so the candidate has a reason to ask, and answer their clarifying questions accurately and briefly. Use markdown for the problem statement; use plain conversational text after that.

Talk like a human interviewer on a video call: short replies, usually one to three sentences. Don't lecture, don't repeat their idea back at length, and don't praise every message.

Don't solve the problem for them, write their code, or name the algorithm or data structure they should use, unless they ask for a hint. When they ask for a hint, give the smallest nudge that unblocks them, such as a question or an observation, and get more specific only if they ask again. If they head down a wrong path, let them go a little, then ask a question that exposes the problem, as a real interviewer would. If they ask you to just give the answer, say you'd rather give a hint and that the full solution comes in the debrief.

Each candidate message shows the elapsed time and, when it changed, the code in their editor. Read the code, but don't comment on every change: react when they ask, when they say they're done, or when a bug is serious enough that an interviewer would step in.

When they say they're done, ask them to walk through an example or test case, ask for time and space complexity if they haven't given it, and if a case fails, point them at it without fixing it. If time remains and the solution is solid, ask a follow-up: a harder variant, a changed constraint, or an optimization.

Manage the clock: about ten minutes before the end, tell them how much time is left, and when time is up, ask them to wrap up. Don't grade them or debrief during the interview; that happens separately afterward.`
}

function candidateTurn(session, { text, code, event }) {
  const parts = [`[elapsed ${formatClock(Date.now() - session.startedAt)} of ${session.settings.minutes}:00]`]
  if (event === 'start') parts.push('[The candidate has joined the call. Begin the interview.]')
  if (event === 'hint') parts.push('[The candidate asks for a hint.]')
  if (event === 'submit') parts.push("[The candidate says they're done and submits their code.]")
  if (event === 'timeup') parts.push('[The scheduled time is up.]')
  if (text?.trim()) parts.push(`<candidate>\n${text.trim()}\n</candidate>`)
  if (typeof code === 'string' && code !== session.lastSentCode) {
    parts.push(`<editor language="${session.settings.language}">\n${code}\n</editor>`)
    session.lastSentCode = code
  }
  return parts.join('\n')
}

// After a mid-stream fallback, thinking and tool blocks written before the last
// fallback block must not be echoed back. Everything else is kept as returned.
function contentForHistory(content) {
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback')
  if (lastFallback === -1) return content
  return content.filter(
    (b, i) => i >= lastFallback || !['thinking', 'redacted_thinking', 'tool_use', 'server_tool_use'].includes(b.type),
  )
}

export function startSession(settings, pastSessions) {
  return {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    settings,
    system: interviewerSystemPrompt(settings, pastSessions),
    messages: [],
    transcript: [], // what the UI shows: { role, text, event?, at }
    hintsUsed: 0,
    lastSentCode: undefined,
  }
}

export async function sendTurn(client, session, turn, onText) {
  const at = Date.now() - session.startedAt
  const codeBefore = session.lastSentCode
  session.messages.push({ role: 'user', content: candidateTurn(session, turn) })

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: 'default',
    cache_control: { type: 'ephemeral' },
    output_config: { effort: 'medium' },
    system: session.system,
    messages: session.messages,
  })
  stream.on('text', (delta) => onText(delta))

  // On failure, undo the user turn so the candidate can retry it as-is.
  const rollback = () => {
    session.messages.pop()
    session.lastSentCode = codeBefore
  }

  let message
  try {
    message = await stream.finalMessage()
  } catch (err) {
    rollback()
    throw err
  }
  if (message.stop_reason === 'refusal') {
    rollback()
    throw new Error('The interviewer declined to respond to that message. Try rephrasing it.')
  }

  if (turn.event === 'hint') session.hintsUsed += 1
  if (turn.event !== 'start') {
    session.transcript.push({ role: 'candidate', text: turn.text?.trim() ?? '', event: turn.event, at })
  }
  session.messages.push({ role: 'assistant', content: contentForHistory(message.content) })
  const reply = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  session.transcript.push({ role: 'interviewer', text: reply, at: Date.now() - session.startedAt })
  return reply
}

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['problem_title', 'verdict', 'summary', 'dimensions', 'strengths', 'issues', 'practice_next', 'reference_solution'],
  properties: {
    problem_title: { type: 'string', description: 'Short name of the problem that was asked' },
    verdict: { type: 'string', enum: VERDICTS.map((v) => v.id) },
    summary: { type: 'string', description: 'Two or three sentences: how the interview went and the single most important thing to fix' },
    dimensions: {
      type: 'array',
      description: 'One entry per dimension, in the order given',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'score', 'evidence'],
        properties: {
          id: { type: 'string', enum: DIMENSIONS.map((d) => d.id) },
          score: { type: 'integer', description: '1 = clear weakness, 2 = below the bar, 3 = meets the bar, 4 = strong' },
          evidence: { type: 'string', description: 'What the candidate actually did that justifies the score, citing the transcript or code' },
        },
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      description: 'Concrete problems, most important first',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tag', 'severity', 'what_happened', 'how_to_fix'],
        properties: {
          tag: { type: 'string', enum: ISSUE_TAGS.map((t) => t.id) },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          what_happened: { type: 'string', description: 'The specific moment, quoting the candidate or their code where possible' },
          how_to_fix: { type: 'string', description: 'What to do differently next time, as a concrete habit' },
        },
      },
    },
    practice_next: {
      type: 'array',
      description: 'Two to four specific things to practice, such as problem types or drills',
      items: { type: 'string' },
    },
    reference_solution: {
      type: 'object',
      additionalProperties: false,
      required: ['approach', 'time_complexity', 'space_complexity', 'code'],
      properties: {
        approach: { type: 'string' },
        time_complexity: { type: 'string' },
        space_complexity: { type: 'string' },
        code: { type: 'string', description: "A clean optimal solution in the candidate's language" },
      },
    },
  },
}

export async function generateReport(client, session, finalCode) {
  const durationMs = Date.now() - session.startedAt
  const transcript = session.transcript
    .map((t) => {
      const who = t.role === 'interviewer' ? 'Interviewer' : 'Candidate'
      const note = t.event === 'hint' ? ' [asked for a hint]' : t.event === 'submit' ? ' [submitted code]' : ''
      return `[${formatClock(t.at)}] ${who}${note}: ${t.text}`
    })
    .join('\n\n')

  const prompt = `Here is a mock coding interview to debrief.

Setup: ${session.settings.difficulty} difficulty, topic "${session.settings.topic || 'interviewer choice'}", ${session.settings.language}, ${session.settings.minutes} minute slot.
Time used: ${formatClock(durationMs)}. Hints requested: ${session.hintsUsed}.

<transcript>
${transcript || '(no conversation)'}
</transcript>

<final_code language="${session.settings.language}">
${finalCode || '(editor was empty)'}
</final_code>

Score these dimensions, in this order:
${DIMENSIONS.map((d) => `- ${d.id}: ${d.hint}`).join('\n')}

Score the way a calibrated interviewer at a top tech company would; the candidate is using this to find real weaknesses before real interviews, so inflated scores hurt them. Trace the final code against the problem's edge cases yourself rather than trusting the candidate's claims. Ground every score and issue in something specific from the transcript or code. If the interview ended early, judge what was shown and flag the parts that never happened.`

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: REPORT_SCHEMA },
    },
    system: 'You are a senior software engineer who has run hundreds of coding interviews, writing an honest, specific debrief for a candidate after a mock interview.',
    messages: [{ role: 'user', content: prompt }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('The debrief request was declined. Try again.')
  if (message.stop_reason === 'max_tokens') throw new Error('The debrief was cut off before it finished. Try again.')

  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const report = JSON.parse(text)

  // Keep dimensions in canonical order and scores in range, whatever came back.
  report.dimensions = DIMENSIONS.map((d) => {
    const found = report.dimensions.find((x) => x.id === d.id)
    return { id: d.id, score: Math.min(4, Math.max(1, Math.round(found?.score ?? 1))), evidence: found?.evidence ?? 'Not assessed.' }
  })
  report.verdict_label = labelFor(VERDICTS, report.verdict)
  return { report, durationMs }
}
