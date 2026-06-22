import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

let mainWin = null
let browserView = null
let chromeHeight = 80 // updated dynamically from renderer

// ── IPC handlers (module-level so they're registered once) ─────────────────
ipcMain.on('browser:navigate', (_, url) => browserView?.webContents.loadURL(url))
ipcMain.on('browser:back',     ()       => { if (browserView?.webContents.navigationHistory.canGoBack())    browserView.webContents.navigationHistory.goBack() })
ipcMain.on('browser:forward',  ()       => { if (browserView?.webContents.navigationHistory.canGoForward()) browserView.webContents.navigationHistory.goForward() })
ipcMain.on('browser:reload', () => {
  if (!browserView) return
  const url = browserView.webContents.getURL()
  if (url && url !== 'about:blank') {
    browserView.webContents.loadURL(url)
  } else {
    browserView.webContents.reload()
  }
})
ipcMain.handle('browser:getUrl', ()      => browserView?.webContents.getURL() ?? '')
ipcMain.on('window:opacity',   (_, v)   => mainWin?.setOpacity(v))
ipcMain.on('window:alwaysOnTop', (_, v) => mainWin?.setAlwaysOnTop(v))
ipcMain.on('chrome:height',    (_, h)   => {
  chromeHeight = h
  updateViewBounds()
})

function updateViewBounds() {
  if (!mainWin || !browserView) return
  const [w, h] = mainWin.getContentSize()
  browserView.setBounds({ x: 0, y: chromeHeight, width: w, height: Math.max(0, h - chromeHeight) })
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 420,
    minHeight: 280,
    alwaysOnTop: true,
    title: 'Interview Buddy',
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDev,
    },
  })

  // Hide from screenshots, screen recordings, and screen share (Zoom, Meet, etc.)
  mainWin.setContentProtection(true)

  // Start at 30% transparent
  mainWin.setOpacity(0.7)

  // Follow the user across all macOS Spaces / desktops
  mainWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // WebContentsView for the browser area
  browserView = new WebContentsView()
  mainWin.contentView.addChildView(browserView)
  updateViewBounds()

  browserView.webContents.loadURL('https://www.google.com')

  // Open target="_blank" links inside the browserView instead of spawning a new OS window
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    browserView.webContents.loadURL(url)
    return { action: 'deny' }
  })

  // Relay navigation events to the React renderer
  browserView.webContents.on('did-navigate', (_, url) => {
    mainWin.webContents.send('browser:url', url)
    mainWin.webContents.send('browser:navstate', {
      canBack: browserView.webContents.navigationHistory.canGoBack(),
      canFwd:  browserView.webContents.navigationHistory.canGoForward(),
    })
  })
  browserView.webContents.on('did-navigate-in-page', (_, url, isMainFrame) => {
    if (isMainFrame) mainWin.webContents.send('browser:url', url)
  })
  browserView.webContents.on('did-start-loading', () => {
    mainWin.webContents.send('browser:loading', true)
  })
  browserView.webContents.on('did-stop-loading', () => {
    mainWin.webContents.send('browser:loading', false)
    mainWin.webContents.send('browser:navstate', {
      canBack: browserView.webContents.navigationHistory.canGoBack(),
      canFwd:  browserView.webContents.navigationHistory.canGoForward(),
    })
  })

  // Intercept Cmd+R / Cmd+Shift+R so they reload the browserView, not the React renderer
  mainWin.webContents.on('before-input-event', (event, input) => {
    if (input.meta && input.key.toLowerCase() === 'r') {
      event.preventDefault()
      const url = browserView?.webContents.getURL()
      if (url && url !== 'about:blank') {
        if (input.shift) {
          browserView.webContents.reloadIgnoringCache()
        } else {
          browserView.webContents.loadURL(url)
        }
      }
    }
  })

  mainWin.on('resize', updateViewBounds)

  if (isDev) {
    mainWin.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWin.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
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
