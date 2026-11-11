import { useState } from 'react'

export default function Settings({ status, onClose }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(value) {
    setSaving(true)
    setError('')
    const result = await window.api.setApiKey(value)
    setSaving(false)
    if (!result.ok) setError(result.error)
    else onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p className="muted">
          The interviewer runs on Claude. Paste an Anthropic API key from{' '}
          <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
            platform.claude.com
          </a>
          . It is encrypted with your system keychain and stored only on this machine.
        </p>
        <p className="muted small">
          {status?.hasSavedKey
            ? 'A key is saved.'
            : status?.hasEnvKey
              ? 'No key saved. Using ANTHROPIC_API_KEY from the environment.'
              : 'No key saved yet.'}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (key.trim()) save(key)
          }}
        >
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              autoFocus
            />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="modal-actions">
            {status?.hasSavedKey && (
              <button type="button" className="btn ghost danger" onClick={() => save(null)} disabled={saving}>
                Remove saved key
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || !key.trim()}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
