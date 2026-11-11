import { useState } from 'react'
import { computeWeakSpots } from '../../electron/taxonomy.js'
import { averageScore, formatDate } from '../format.js'

const LANGUAGES = ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Go']
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const LENGTHS = [30, 45, 60]
const TOPICS = [
  '',
  'Arrays and strings',
  'Hash maps and sets',
  'Two pointers / sliding window',
  'Linked lists',
  'Stacks and queues',
  'Binary search',
  'Trees',
  'Graphs (BFS / DFS)',
  'Heaps / priority queues',
  'Intervals',
  'Backtracking',
  'Dynamic programming',
]

const PREFS_KEY = 'interview-buddy:last-settings'

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {}
  } catch {
    return {}
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Remembering the last choice is a convenience only.
  }
}

export default function Home({ sessions, hasKey, onOpenSettings, onStart, onOpenReport, onDelete }) {
  const prefs = loadPrefs()
  const [language, setLanguage] = useState(prefs.language ?? 'Python')
  const [difficulty, setDifficulty] = useState(prefs.difficulty ?? 'Medium')
  const [topic, setTopic] = useState(prefs.topic ?? '')
  const [minutes, setMinutes] = useState(prefs.minutes ?? 45)
  const [targetWeakSpots, setTargetWeakSpots] = useState(prefs.targetWeakSpots ?? true)

  const completed = sessions.filter((s) => s.report)
  const weak = computeWeakSpots(sessions)
  const topIssues = weak.issues.slice(0, 6)
  const maxCount = Math.max(1, ...topIssues.map((i) => i.count))

  function start() {
    const settings = { language, difficulty: difficulty.toLowerCase(), topic, minutes, targetWeakSpots }
    savePrefs({ language, difficulty, topic, minutes, targetWeakSpots })
    onStart(settings)
  }

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">◆</span> Interview Buddy
          <span className="brand-sub">mock coding interviews</span>
        </div>
        <button className="btn ghost" onClick={onOpenSettings}>
          Settings
        </button>
      </header>

      <main className="home-grid">
        <section className="card setup">
          <h1>Start a mock interview</h1>
          <p className="muted">
            An AI interviewer gives you a problem and reacts the way a real one would. You talk through it, write the code,
            and get a scored debrief at the end.
          </p>

          <div className="field">
            <span>Language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <span>Difficulty</span>
            <div className="segmented" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={difficulty === d}
                  className={difficulty === d ? 'on' : ''}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Topic</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t || 'Any (interviewer picks)'}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <span>Length</span>
            <div className="segmented" role="radiogroup" aria-label="Length">
              {LENGTHS.map((m) => (
                <button key={m} role="radio" aria-checked={minutes === m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <label className="check">
            <input type="checkbox" checked={targetWeakSpots} onChange={(e) => setTargetWeakSpots(e.target.checked)} />
            <span>
              Target my weak spots
              <small>The interviewer picks a problem that tests what your past debriefs flagged.</small>
            </span>
          </label>

          {hasKey === false && (
            <div className="notice">
              Add your Anthropic API key in{' '}
              <button className="link" onClick={onOpenSettings}>
                Settings
              </button>{' '}
              before starting.
            </div>
          )}

          <button className="btn primary big" onClick={start} disabled={!hasKey}>
            Start interview
          </button>
        </section>

        <section className="card progress">
          <h2>Your weak spots</h2>
          {completed.length === 0 ? (
            <p className="muted">
              Nothing yet. After each interview, the issues from your debrief are tallied here so you can see what keeps coming
              up.
            </p>
          ) : (
            <>
              <p className="muted small">Across your last {weak.sessionsConsidered} interviews</p>
              {topIssues.length === 0 ? (
                <p className="muted">No recurring issues flagged.</p>
              ) : (
                <ul className="bars">
                  {topIssues.map((i) => (
                    <li key={i.tag}>
                      <span className="bar-label">{i.label}</span>
                      <span className="bar-track">
                        <span className="bar-fill warn" style={{ width: `${(i.count / maxCount) * 100}%` }} />
                      </span>
                      <span className="bar-value">
                        {i.count}/{weak.sessionsConsidered}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <h3>Average scores</h3>
              <ul className="bars">
                {weak.dimensions.map((d) => (
                  <li key={d.id} title={d.hint}>
                    <span className="bar-label">{d.label}</span>
                    <span className="bar-track">
                      {d.average !== null && (
                        <span
                          className={`bar-fill ${d.average < 2.5 ? 'warn' : d.average < 3.25 ? 'mid' : 'good'}`}
                          style={{ width: `${(d.average / 4) * 100}%` }}
                        />
                      )}
                    </span>
                    <span className="bar-value">{d.average === null ? '–' : d.average.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card history">
          <h2>Past interviews</h2>
          {completed.length === 0 ? (
            <p className="muted">Your finished interviews will show up here.</p>
          ) : (
            <ul className="history-list">
              {completed.map((s) => (
                <li key={s.id}>
                  <button className="history-item" onClick={() => onOpenReport(s)}>
                    <span className="history-title">{s.report.problem_title}</span>
                    <span className="history-meta">
                      {formatDate(s.startedAt)} · {s.settings.difficulty} · {s.settings.language}
                    </span>
                    <span className={`verdict v-${s.report.verdict}`}>{s.report.verdict_label}</span>
                    <span className="history-score">{averageScore(s.report).toFixed(1)}</span>
                  </button>
                  <button className="icon-btn" aria-label="Delete interview" title="Delete" onClick={() => onDelete(s.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
