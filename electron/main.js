import { app, BrowserWindow, ipcMain, shell } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as store from './store.js'
import { createClient, startSession, sendTurn, generateReport } from './interviewer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

let client = null
const activeSessions = new Map()

function getClient() {
  if (!client) client = createClient(store.getApiKey())
  return client
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Your Anthropic API key was rejected. Quit (×) and update it in Settings on the home screen.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key does not have access to the model.'
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and try again.'
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API. Check your connection.'
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ''}: ${err.message}`
  if (err?.message?.includes('Could not resolve authentication')) return 'No API key set. Add one in Settings.'
  return err?.message ?? String(err)
}

async function guarded(fn) {
  try {
    return { ok: true, ...(await fn()) }
  } catch (err) {
    console.error('[interview-buddy]', err)
    return { ok: false, error: friendlyError(err) }
  }
}

// ── Settings ───────────────────────────────────────────────────────────────
ipcMain.handle('settings:status', () => ({
  hasSavedKey: Boolean(store.getApiKey()),
  hasEnvKey: Boolean(process.env.ANTHROPIC_API_KEY),
}))
ipcMain.handle('settings:setApiKey', (_, key) =>
  guarded(async () => {
    store.setApiKey(key?.trim() || null)
    client = null
    return {}
  }),
)

// ── Sessions ───────────────────────────────────────────────────────────────
ipcMain.handle('sessions:list', () => store.listSessions())
ipcMain.handle('sessions:delete', (_, id) => {
  store.deleteSession(id)
  return store.listSessions()
})

// ── Live interview ─────────────────────────────────────────────────────────
ipcMain.handle('interview:start', (_, settings) => {
  const session = startSession(settings, store.listSessions())
  activeSessions.set(session.id, session)
  return { sessionId: session.id, startedAt: session.startedAt }
})

ipcMain.handle('interview:turn', (event, { sessionId, text, code, event: turnEvent }) =>
  guarded(async () => {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('This interview is no longer active.')
    const reply = await sendTurn(getClient(), session, { text, code, event: turnEvent }, (delta) => {
      if (!event.sender.isDestroyed()) event.sender.send('interview:delta', { sessionId, delta })
    })
    return { reply, hintsUsed: session.hintsUsed }
  }),
)

ipcMain.handle('interview:end', (_, { sessionId, code }) =>
  guarded(async () => {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('This interview is no longer active.')
    const { report, durationMs } = await generateReport(getClient(), session, code)
    const saved = {
      id: session.id,
      startedAt: session.startedAt,
      durationMs,
      settings: session.settings,
      hintsUsed: session.hintsUsed,
      transcript: session.transcript,
      finalCode: code,
      report,
    }
    store.saveSession(saved)
    activeSessions.delete(sessionId)
    return { session: saved }
  }),
)

ipcMain.handle('interview:abandon', (_, sessionId) => {
  activeSessions.delete(sessionId)
})

// ── Window ─────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Interview Buddy',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDev,
    },
  })

  // Links in feedback (e.g. to docs) open in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
