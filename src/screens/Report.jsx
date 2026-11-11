import { DIMENSIONS, ISSUE_TAGS, labelFor } from '../../electron/taxonomy.js'
import CodeEditor from '../components/CodeEditor.jsx'
import Markdown from '../components/Markdown.jsx'
import { averageScore, formatClock, formatDate } from '../format.js'

const SCORE_WORDS = { 1: 'Weak', 2: 'Below bar', 3: 'Meets bar', 4: 'Strong' }

export default function Report({ session, onHome, onPracticeAgain }) {
  const { report, settings } = session

  return (
    <div className="report">
      <header className="topbar">
        <button className="btn ghost" onClick={onHome}>
          ← Home
        </button>
        <button className="btn primary" onClick={onPracticeAgain}>
          Practice again on my weak spots
        </button>
      </header>

      <main className="report-body">
        <section className="report-hero">
          <div>
            <p className="muted small">
              {formatDate(session.startedAt)} · {settings.difficulty} · {settings.language} · {formatClock(session.durationMs)} of{' '}
              {settings.minutes}:00 · {session.hintsUsed} hint{session.hintsUsed === 1 ? '' : 's'}
            </p>
            <h1>{report.problem_title}</h1>
            <p className="summary">{report.summary}</p>
          </div>
          <div className="hero-score">
            <span className={`verdict big v-${report.verdict}`}>{report.verdict_label}</span>
            <span className="avg">
              {averageScore(report).toFixed(1)}
              <small>/ 4 average</small>
            </span>
          </div>
        </section>

        <section className="card">
          <h2>Scores</h2>
          <ul className="dims">
            {report.dimensions.map((d) => (
              <li key={d.id}>
                <div className="dim-head">
                  <span className="dim-name">{labelFor(DIMENSIONS, d.id)}</span>
                  <span className={`score s-${d.score}`}>
                    {d.score} · {SCORE_WORDS[d.score]}
                  </span>
                </div>
                <div className="pips" aria-hidden="true">
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={n <= d.score ? `on s-${d.score}` : ''} />
                  ))}
                </div>
                <p className="dim-evidence">{d.evidence}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="report-cols">
          <section className="card">
            <h2>What to fix</h2>
            {report.issues.length === 0 ? (
              <p className="muted">No significant issues flagged.</p>
            ) : (
              <ol className="issues">
                {report.issues.map((issue, i) => (
                  <li key={i}>
                    <div className="issue-head">
                      <span className={`sev sev-${issue.severity}`}>{issue.severity}</span>
                      <strong>{labelFor(ISSUE_TAGS, issue.tag)}</strong>
                    </div>
                    <p>{issue.what_happened}</p>
                    <p className="fix">
                      <span>Next time:</span> {issue.how_to_fix}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="stack">
            <section className="card">
              <h2>What went well</h2>
              <ul className="plain">
                {report.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2>Practice next</h2>
              <ul className="plain">
                {report.practice_next.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <details className="card collapsible">
          <summary>
            <h2>Reference solution</h2>
          </summary>
          <p>{report.reference_solution.approach}</p>
          <p className="muted small">
            Time {report.reference_solution.time_complexity} · Space {report.reference_solution.space_complexity}
          </p>
          <CodeEditor value={report.reference_solution.code} language={settings.language} readOnly />
        </details>

        <details className="card collapsible">
          <summary>
            <h2>Your final code</h2>
          </summary>
          <CodeEditor value={session.finalCode || ''} language={settings.language} readOnly />
        </details>

        <details className="card collapsible">
          <summary>
            <h2>Transcript</h2>
          </summary>
          <div className="transcript">
            {session.transcript.map((t, i) => (
              <div key={i} className={`msg ${t.role}`}>
                <div className="msg-time">
                  {formatClock(t.at)} · {t.role === 'interviewer' ? 'Interviewer' : 'You'}
                  {t.event === 'hint' && ' · asked for a hint'}
                  {t.event === 'submit' && ' · submitted code'}
                  {t.event === 'timeup' && " · time's up"}
                </div>
                {t.role === 'interviewer' ? <Markdown>{t.text}</Markdown> : t.text && <div className="msg-text">{t.text}</div>}
              </div>
            ))}
          </div>
        </details>
      </main>
    </div>
  )
}
