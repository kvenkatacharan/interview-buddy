import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'

const HOME = 'https://www.google.com'

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
  const [pinned, setPinned] = useState(true)

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
  }, [])

  function handleOpacityChange(e) {
    const v = Number(e.target.value)
    setOpacity(v)
    window.electronAPI?.setOpacity(v / 100)
  }

  function handlePinToggle() {
    const next = !pinned
    setPinned(next)
    window.electronAPI?.setAlwaysOnTop(next)
  }

  function handleSubmit(e) {
    e.preventDefault()
    window.electronAPI?.navigate(toNavigationUrl(address))
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
        </header>

        <div className="toolbar">
          <label className="opacity-control">
            <span>Transparency</span>
            <input
              type="range"
              min="20"
              max="100"
              value={opacity}
              onChange={handleOpacityChange}
            />
            <output>{100 - opacity}%</output>
          </label>
          <button
            className={`pin-btn${pinned ? ' pin-btn--active' : ''}`}
            onClick={handlePinToggle}
            title={pinned ? 'Always on top (click to disable)' : 'Click to keep on top'}
          >
            📌
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
