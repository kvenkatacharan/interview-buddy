import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'

const HOME = 'https://www.google.com'

const QUICK_TEXTS = [
  {
    label: 'c',
    text: `You are an expert coding interview assistant.

Analyze the attached screenshot(s) or the dictated question.

If it is a coding problem:
- Identify the problem.
- Explain the optimal approach briefly.
- Write the most optimal, production-quality solution.
- Use the programming language shown in the editor; otherwise use JavaScript/python.
- have some color coding style for identation  for loops , {} () and syntax highlighting.
- Include time and space complexity.
- Consider edge cases.
- Keep the response concise and interview-ready.

Return only the final answer and code.`
  },
  {
    label: 'i',
    text: `You are an expert technical interview assistant.

Analyze the dictated question or attached screenshot(s).

Answer exactly as a strong candidate would in a real interview.
- Keep the answer natural and conversational.
- Be concise (30–90 seconds when spoken).
- Explain technical concepts clearly.
- Include a practical example whenever helpful.
- Avoid AI-sounding language or unnecessary theory.
- If the question is based on code shown in the screenshot, explain it confidently.`
  },
  {
    label: 'b',
    text: `You are an expert behavioral interview coach.

Answer using the STAR method whenever appropriate.

- Situation
- Task
- Action
- Result

Keep answers natural, confident, and realistic.
Use first-person ("I") statements.
Focus on leadership, ownership, teamwork, conflict resolution, problem-solving, learning, and impact.
Keep responses around 1–2 minutes when spoken.
Avoid generic or robotic language.`
  },
];
function toNavigationUrl(raw) {
  const t = raw.trim()
  if (!t) return HOME
  if (/^https?:\/\//i.test(t)) return t
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(t) && !t.includes(' ')) {
    return `https://${t}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

function App() {
  const shellRef = useRef(null)
  const [address, setAddress] = useState(HOME)
  const [opacity, setOpacity] = useState(70)
  const [loading, setLoading] = useState(true)
  const [canBack, setCanBack] = useState(false)
  const [canFwd, setCanFwd] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState('')
  const [activePreset, setActivePreset] = useState('c')
  const [clipboardMode, setClipboardMode] = useState(false)
  const [teleprompterMode, setTeleprompterMode] = useState(false)
  const [ghostMode, setGhostMode] = useState(false)

  // Tell main process where the shell ends so it can position WebContentsView below it
  useLayoutEffect(() => {
    const el = shellRef.current
    if (!el || !window.electronAPI) return
    const ro = new ResizeObserver(([entry]) => {
      window.electronAPI.setChromeHeight(Math.round(entry.contentRect.height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Subscribe to navigation events coming from the WebContentsView
  useEffect(() => {
    if (!window.electronAPI) return
    // Sync address bar with the actual browserView URL (handles timing gap on startup)
    window.electronAPI.getUrl().then((url) => { if (url) setAddress(url) })
    window.electronAPI.onUrlUpdate((url) => setAddress(url))
    window.electronAPI.onLoadingChange((v) => setLoading(v))
    window.electronAPI.onNavState(({ canBack: b, canFwd: f }) => {
      setCanBack(b)
      setCanFwd(f)
    })
    window.electronAPI.onClipboardMode?.((v) => setClipboardMode(v))
    window.electronAPI.onTeleprompterMode?.((v) => setTeleprompterMode(v))
    window.electronAPI.onGhostMode?.((v) => setGhostMode(v))
    window.electronAPI.onOpacitySync?.((v) => setOpacity(v))
  }, [])

  function handleOpacityChange(e) {
    const v = Number(e.target.value)
    setOpacity(v)
    window.electronAPI?.setOpacity(v / 100)
  }

  function handleSubmit(e) {
    e.preventDefault()
    window.electronAPI?.navigate(toNavigationUrl(address))
  }

  async function handleScreenshot() {
    if (!window.electronAPI || capturing) return
    setCapturing(true)
    setCaptureError('')
    try {
      const result = await window.electronAPI.screenshotToChat()
      if (!result?.ok) setCaptureError(result?.error || 'Screenshot failed')
    } catch (err) {
      setCaptureError(err.message)
    } finally {
      setCapturing(false)
    }
  }

  async function handleInsertText(label, text) {
    if (!window.electronAPI) return
    setActivePreset(label)
    window.electronAPI.setActivePreset?.(label)
    setCaptureError('')
    try {
      const result = await window.electronAPI.insertText(text, true)
      if (!result?.ok) setCaptureError(result?.error || 'Insert failed')
    } catch (err) {
      setCaptureError(err.message)
    }
  }

  async function handleToggleClipboard() {
    if (!window.electronAPI?.toggleClipboardMode) return
    const next = await window.electronAPI.toggleClipboardMode()
    setClipboardMode(Boolean(next))
  }

  async function handleToggleTeleprompter() {
    if (!window.electronAPI?.toggleTeleprompter) return
    const next = await window.electronAPI.toggleTeleprompter()
    setTeleprompterMode(Boolean(next))
  }

  async function handleToggleGhost() {
    if (!window.electronAPI?.toggleGhostMode) return
    const next = await window.electronAPI.toggleGhostMode()
    setGhostMode(Boolean(next))
  }

  return (
    <div className="app">
      <div ref={shellRef} className="shell">
        <header className="chrome" style={{ WebkitAppRegion: 'drag' }}>
          <span className="tl-gap" aria-hidden="true" />

          <div className="nav-btns" style={{ WebkitAppRegion: 'no-drag' }}>
            <button
              type="button"
              className="nav-btn"
              onClick={() => window.electronAPI?.goBack()}
              disabled={!canBack}
              aria-label="Back"
              title="Back"
            >‹</button>
            <button
              type="button"
              className="nav-btn"
              onClick={() => window.electronAPI?.goForward()}
              disabled={!canFwd}
              aria-label="Forward"
              title="Forward"
            >›</button>
            <button
              type="button"
              className="nav-btn"
              onClick={() => window.electronAPI?.reload()}
              aria-label="Reload"
              title="Reload"
            >{loading ? '…' : '↻'}</button>
          </div>

          <form
            className="address-form"
            onSubmit={handleSubmit}
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Search Google or type a URL"
              aria-label="Address bar"
              spellCheck={false}
            />
          </form>

          <div className="chrome-controls" style={{ WebkitAppRegion: 'no-drag' }}>
            <label className="opacity-control" title={`Transparency: ${100 - opacity}%`}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="opacity-icon">
                <path
                  fill="currentColor"
                  d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2v16a8 8 0 0 1 0-16Z"
                />
              </svg>
              <input
                type="range"
                min="20"
                max="100"
                value={opacity}
                onChange={handleOpacityChange}
                aria-label="Transparency"
              />
            </label>

            <button
              type="button"
              className="capture-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleScreenshot}
              disabled={capturing}
              aria-label={capturing ? 'Capturing…' : 'Screenshot to ChatGPT'}
              title={capturing ? 'Capturing…' : 'Screenshot to ChatGPT'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M9 3 7.17 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                />
              </svg>
            </button>

            <button
              type="button"
              className={`mode-btn ${clipboardMode ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleToggleClipboard}
              aria-label="Toggle Copy-to-Ask Clipboard Listener"
              title={`Copy-to-Ask Clipboard Listener (${clipboardMode ? 'ON' : 'OFF'}) • Cmd+Shift+L`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M16 2H8a2 2 0 0 0-2 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1a2 2 0 0 0-2-2Zm-8 2h8v2H8V4Zm11 16H5V6h1v2h12V6h1v14Z"
                />
              </svg>
            </button>

            <button
              type="button"
              className={`mode-btn ${teleprompterMode ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleToggleTeleprompter}
              aria-label="Toggle Teleprompter Eye-Line Mode"
              title={`Teleprompter Eye-Line Mode (${teleprompterMode ? 'ON' : 'OFF'}) • Cmd+Shift+T`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 4h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v8h16V6H4Zm4 12h8v2H8v-2Z"
                />
              </svg>
            </button>

            <button
              type="button"
              className={`mode-btn ${ghostMode ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleToggleGhost}
              aria-label="Toggle Click-Through Ghost Mode"
              title={`Click-Through Ghost Mode (${ghostMode ? 'ON — press Cmd+Shift+\\ to exit' : 'OFF'}) • Cmd+Shift+\\`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2a9 9 0 0 0-9 9v11l3-3 3 3 3-3 3 3 3-3 3 3V11a9 9 0 0 0-9-9Zm-3 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"
                />
              </svg>
            </button>

            {QUICK_TEXTS.map(({ label, text }) => (
              <button
                key={label}
                type="button"
                className={`text-btn ${activePreset === label ? 'active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleInsertText(label, text)}
                aria-label={`Insert & Send "${label.toUpperCase()}" (Cmd+Shift+${label.toUpperCase()} for 1-Shot Screenshot+Send)`}
                title={`Insert & Send (${label.toUpperCase()}) • 1-Shot Screenshot+Send: Cmd+Shift+${label.toUpperCase()}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {ghostMode && (
          <div className="ghost-banner">
            Click-Through Ghost Mode ON — press <strong>Cmd+Shift+\</strong> to interact with widget
          </div>
        )}
        {captureError && <div className="capture-error">{captureError}</div>}
      </div>
    </div>
  )
}

export default App
