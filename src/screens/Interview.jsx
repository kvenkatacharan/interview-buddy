import { useEffect, useRef, useState } from 'react'
import CodeEditor from '../components/CodeEditor.jsx'
import Markdown from '../components/Markdown.jsx'
import { formatClock } from '../format.js'

const COMMENT = { Python: '#', Go: '//', Java: '//', 'C++': '//', JavaScript: '//', TypeScript: '//' }

const EVENT_LABELS = {
  hint: 'Asked for a hint',
  submit: 'Submitted code',
  timeup: "Time's up",
}

export default function Interview({ settings, onExit, onFinished }) {
  const [sessionId, setSessionId] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [messages, setMessages] = useState([])
  const [code, setCode] = useState(`${COMMENT[settings.language] ?? '//'} Write your solution here\n`)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState('starting') // 'starting' | 'replying' | 'ending' | null
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // 'end' | 'quit' | null
  const [now, setNow] = useState(() => Date.now())
  const [hintsUsed, setHintsUsed] = useState(0)

  const startedRef = useRef(false)
  const timeUpSentRef = useRef(false)
  const chatEndRef = useRef(null)
  const sessionIdRef = useRef(null)

  // Stream interviewer text into the last message as it arrives.
  useEffect(() => {
    return window.api.onDelta(({ sessionId: id, delta }) => {
      if (id !== sessionIdRef.current) return
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last?.streaming) return prev
        return [...prev.slice(0, -1), { ...last, text: last.text + delta }]
      })
    })
  }, [])

  async function send({ text = '', event } = {}, id = sessionIdRef.current) {
    setError('')
    setBusy('replying')
    const showCandidate = event !== 'start' && (text.trim() || event)
    const candidate = showCandidate ? [{ role: 'candidate', text: text.trim(), event }] : []
    setMessages((prev) => [...prev, ...candidate, { role: 'interviewer', text: '', streaming: true }])

    const result = await window.api.sendTurn({ sessionId: id, text, code, event })
    if (result.ok) {
      setHintsUsed(result.hintsUsed)
      setMessages((prev) => [...prev.slice(0, -1), { role: 'interviewer', text: result.reply }])
    } else {
      // Undo the optimistic messages and hand the text back so it can be resent.
      setMessages((prev) => prev.slice(0, prev.length - 1 - candidate.length))
      if (text) setInput(text)
      setError(result.error)
      if (event === 'timeup') timeUpSentRef.current = false
    }
    setBusy(null)
    return result.ok
  }

  async function begin() {
    setError('')
    setBusy('starting')
    let id = sessionIdRef.current
    if (!id) {
      const started = await window.api.startInterview(settings)
      id = started.sessionId
      sessionIdRef.current = id
      setSessionId(id)
      setStartedAt(started.startedAt)
    }
    await send({ event: 'start' }, id)
  }

  useEffect(() => {
    if (startedRef.current) return // StrictMode runs effects twice in dev
    startedRef.current = true
    begin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const elapsed = startedAt ? now - startedAt : 0
  const limitMs = settings.minutes * 60 * 1000
  const remaining = limitMs - elapsed
  const interviewStarted = messages.some((m) => m.role === 'interviewer' && !m.streaming)

  // Tell the interviewer once when the slot is over.
  useEffect(() => {
    if (startedAt && remaining <= 0 && !timeUpSentRef.current && !busy && interviewStarted) {
      timeUpSentRef.current = true
      send({ event: 'timeup' })
    }
  })

  async function finish() {
    setConfirm(null)
    setError('')
    setBusy('ending')
    const result = await window.api.endInterview({ sessionId, code })
    if (result.ok) {
      onFinished(result.session)
    } else {
      setError(result.error)
      setBusy(null)
    }
  }

  async function quit() {
    if (sessionId) await window.api.abandonInterview(sessionId)
    onExit()
  }

  function submitMessage(e) {
    e?.preventDefault()
    if (!input.trim() || busy) return
    const text = input
    setInput('')
    send({ text })
  }

  const canAct = Boolean(sessionId) && !busy && interviewStarted

  return (
    <div className="interview">
      <header className="topbar">
        <div className="session-info">
          <span className="pill">{settings.difficulty}</span>
          <span className="pill">{settings.language}</span>
          {settings.topic && <span className="pill">{settings.topic}</span>}
        </div>

        <div className={`timer ${remaining <= 0 ? 'over' : remaining < 10 * 60 * 1000 ? 'low' : ''}`} aria-live="off">
          {remaining >= 0 ? formatClock(remaining) : `+${formatClock(-remaining)}`}
          <small>{remaining >= 0 ? 'left' : 'over'}</small>
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={() => send({ event: 'hint' })} disabled={!canAct}>
            Hint{hintsUsed ? ` (${hintsUsed})` : ''}
          </button>
          <button className="btn" onClick={() => send({ event: 'submit' })} disabled={!canAct}>
            Submit code
          </button>
          <button className="btn primary" onClick={() => setConfirm('end')} disabled={!sessionId || busy === 'ending' || !interviewStarted}>
            End & get feedback
          </button>
          <button className="icon-btn" title="Quit without feedback" aria-label="Quit without feedback" onClick={() => setConfirm('quit')}>
            ×
          </button>
        </div>
      </header>

      {confirm && (
        <div className="confirm-bar" role="alertdialog">
          {confirm === 'end' ? (
            <>
              <span>End the interview and write your debrief?</span>
              <button className="btn ghost" onClick={() => setConfirm(null)}>
                Keep going
              </button>
              <button className="btn primary" onClick={finish} disabled={busy === 'replying'}>
                Get feedback
              </button>
            </>
          ) : (
            <>
              <span>Quit without a debrief? This interview won't be saved.</span>
              <button className="btn ghost" onClick={() => setConfirm(null)}>
                Stay
              </button>
              <button className="btn danger" onClick={quit}>
                Quit
              </button>
            </>
          )}
        </div>
      )}

      <div className="interview-body">
        <section className="chat" aria-label="Conversation with the interviewer">
          <div className="chat-scroll">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.event && <div className="msg-event">{EVENT_LABELS[m.event]}</div>}
                {m.role === 'interviewer' ? (
                  m.text ? (
                    <Markdown>{m.text}</Markdown>
                  ) : (
                    <div className="typing" aria-label="Interviewer is typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  )
                ) : (
                  m.text && <div className="msg-text">{m.text}</div>
                )}
              </div>
            ))}
            {error && (
              <div className="error">
                {error}{' '}
                {!interviewStarted && (
                  <button className="link" onClick={begin}>
                    Try again
                  </button>
                )}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="composer" onSubmit={submitMessage}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) submitMessage(e)
              }}
              placeholder="Think out loud: ask questions, explain your approach…"
              rows={3}
              disabled={!sessionId || busy === 'ending'}
            />
            <div className="composer-foot">
              <span className="muted small">Enter to send · Shift+Enter for a new line</span>
              <button className="btn primary" type="submit" disabled={!input.trim() || Boolean(busy)}>
                Send
              </button>
            </div>
          </form>
        </section>

        <section className="code-pane">
          <CodeEditor value={code} onChange={setCode} language={settings.language} readOnly={busy === 'ending'} />
          <p className="muted small code-note">
            The interviewer sees your latest code whenever you send a message, ask for a hint or submit.
          </p>
        </section>
      </div>

      {busy === 'ending' && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="spinner" />
            <h2>Writing your debrief</h2>
            <p className="muted">Reviewing the conversation and tracing your code against edge cases. This can take a minute.</p>
          </div>
        </div>
      )}
    </div>
  )
}
