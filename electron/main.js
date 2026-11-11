import { app, BrowserWindow, WebContentsView, ipcMain, desktopCapturer, clipboard, nativeImage, screen, globalShortcut } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

const DEFAULT_WIDTH = 600
const DEFAULT_HEIGHT = 600

let mainWin = null
let browserView = null
let isQuitting = false
let chromeHeight = 80 // updated dynamically from renderer
let hSide = 'center' // 'left' | 'center' | 'right'
let vSide = 'top'    // 'top' | 'bottom'

function hasValidWindow() {
  return Boolean(mainWin && !mainWin.isDestroyed())
}

function hasValidBrowserView() {
  return Boolean(browserView && browserView.webContents && !browserView.webContents.isDestroyed())
}

const FIND_CHAT_INPUT_JS = `
  document.querySelector('#prompt-textarea, div[contenteditable="true"], textarea')
`

// ── IPC handlers (module-level so they're registered once) ─────────────────
ipcMain.on('browser:navigate', (_, url) => { if (hasValidBrowserView()) browserView.webContents.loadURL(url) })
ipcMain.on('browser:back',     ()       => { if (hasValidBrowserView() && browserView.webContents.navigationHistory.canGoBack())    browserView.webContents.navigationHistory.goBack() })
ipcMain.on('browser:forward',  ()       => { if (hasValidBrowserView() && browserView.webContents.navigationHistory.canGoForward()) browserView.webContents.navigationHistory.goForward() })
ipcMain.on('browser:reload', () => {
  if (!hasValidBrowserView()) return
  const url = browserView.webContents.getURL()
  if (url && url !== 'about:blank') {
    browserView.webContents.loadURL(url)
  } else {
    browserView.webContents.reload()
  }
})
ipcMain.handle('browser:getUrl', ()      => (hasValidBrowserView() ? browserView.webContents.getURL() : ''))
ipcMain.handle('browser:screenshotToChat', async () => {
  if (!hasValidWindow() || !hasValidBrowserView()) return { ok: false, error: 'No browser view' }
  try {
    const display = screen.getPrimaryDisplay()
    // Capture at 1.35x logical screen resolution (~2040x1325) for ultra-sharp text
    // while keeping the pasted image under 3 MB.
    const captureScale = Math.min(display.scaleFactor || 1, 1.35)
    const targetWidth = Math.max(1, Math.round(display.size.width * captureScale))
    const targetHeight = Math.max(1, Math.round(display.size.height * captureScale))

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: targetWidth,
        height: targetHeight,
      },
    })
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0]
    if (!source || source.thumbnail.isEmpty()) {
      return { ok: false, error: 'Screen capture unavailable — check Screen Recording permission in System Settings.' }
    }

    // Use lossless PNG for razor-sharp letters when <= 2.8 MB; otherwise use JPEG (92)
    // so the final image is always under 3 MB.
    const resized = source.thumbnail.resize({ width: targetWidth, height: targetHeight, quality: 'best' })
    const MAX_BYTES = 2.8 * 1024 * 1024
    let imgBuffer = resized.toPNG()
    if (imgBuffer.length > MAX_BYTES) {
      imgBuffer = resized.toJPEG(92)
    }
    const compactImage = nativeImage.createFromBuffer(imgBuffer, { scaleFactor: 1.0 })

    // Content-protected windows (this one included) don't appear in the capture, so
    // the screenshot only ever contains what's behind Interview Buddy.
    clipboard.writeImage(compactImage)

    // Restore OS, window, and WebContentsView focus first (hiding/unhiding via Cmd+\
    // or clicking the toolbar leaves browserView unfocused, which causes paste() to drop).
    app.focus({ steal: true })
    mainWin.focus()
    browserView.webContents.focus()

    // Focus whatever the chat input is after browserView has focus, ensure caret selection
    // is inside the editor, and wait a frame before pasting.
    await browserView.webContents.executeJavaScript(`
      new Promise((resolve) => {
        var el = ${FIND_CHAT_INPUT_JS};
        if (el) {
          el.focus();
          if (el.isContentEditable) {
            var sel = window.getSelection();
            if (sel && (!sel.anchorNode || !el.contains(sel.anchorNode))) {
              var range = document.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }
        requestAnimationFrame(() => setTimeout(resolve, 30));
      })
    `, true)

    if (!hasValidBrowserView()) return { ok: false, error: 'Browser view closed' }
    browserView.webContents.focus()
    browserView.webContents.paste()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('browser:insertText', async (_, text) => {
  if (!hasValidWindow() || !hasValidBrowserView()) return { ok: false, error: 'No browser view' }
  try {
    app.focus({ steal: true })
    mainWin.focus()
    browserView.webContents.focus()
    const found = await browserView.webContents.executeJavaScript(`
      (function () {
        var el = ${FIND_CHAT_INPUT_JS};
        if (!el) return false;
        el.focus();
        document.execCommand('insertText', false, ${JSON.stringify(text)});
        return true;
      })();
    `, true)
    if (!found) return { ok: false, error: 'Chat input not found on this page' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.on('window:opacity',   (_, v)   => { if (hasValidWindow()) mainWin.setOpacity(v) })
ipcMain.on('chrome:height',    (_, h)   => {
  chromeHeight = h
  updateViewBounds()
})

function applyPosition() {
  if (!hasValidWindow()) return
  const { x: waX, y: waY, width: waW, height: waH } = screen.getPrimaryDisplay().workArea
  const [w, h] = mainWin.getSize()

  const x = hSide === 'left'  ? waX
          : hSide === 'right' ? waX + waW - w
          : waX + Math.round((waW - w) / 2)
  const y = vSide === 'bottom' ? waY + waH - h : waY

  mainWin.setPosition(Math.round(x), Math.round(y))
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+\\', () => {
    if (!hasValidWindow()) {
      createWindow()
      return
    }
    if (mainWin.isVisible()) {
      mainWin.hide()
    } else {
      app.focus({ steal: true })
      mainWin.show()
      mainWin.focus()
      if (hasValidBrowserView()) browserView.webContents.focus()
    }
  })

  // Alternates the widget between the right and left edges of the screen
  globalShortcut.register('CommandOrControl+Alt+Right', () => {
    if (!hasValidWindow()) return
    hSide = hSide === 'right' ? 'left' : 'right'
    applyPosition()
  })

  // Alternates the widget between the top and bottom edges of the screen
  globalShortcut.register('CommandOrControl+Alt+Down', () => {
    if (!hasValidWindow()) return
    vSide = vSide === 'bottom' ? 'top' : 'bottom'
    applyPosition()
  })
}

function updateViewBounds() {
  if (!hasValidWindow() || !hasValidBrowserView()) return
  const [w, h] = mainWin.getContentSize()
  const shellTop = Math.max(0, h - chromeHeight)
  browserView.setBounds({ x: 0, y: 0, width: w, height: shellTop })
  // Traffic lights track the (now bottom-anchored) chrome bar, same 15px inset it always had
  mainWin.setWindowButtonPosition({ x: 16, y: shellTop + 15 })
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: 420,
    minHeight: 280,
    alwaysOnTop: true,
    title: 'Interview Buddy',
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    // Placeholder for the initial paint; updateViewBounds() repositions these
    // to track the bottom-anchored chrome bar as soon as its real height is known.
    trafficLightPosition: { x: 16, y: DEFAULT_HEIGHT - chromeHeight + 15 },
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

  // Follow the user across all macOS Spaces / desktops, including fullscreen ones
  mainWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 'floating' (the alwaysOnTop default) stays below a fullscreen app's own Space —
  // 'screen-saver' is the level that actually renders on top of fullscreen apps too
  mainWin.setAlwaysOnTop(true, 'screen-saver')

  // Default: centered horizontally, flush with the top of the screen
  applyPosition()

  // Keep hSide/vSide in sync with manual toolbar drags, so the snap shortcuts
  // toggle relative to wherever the widget actually is, not a stale position.
  mainWin.on('moved', () => {
    const { x: waX, y: waY, width: waW, height: waH } = screen.getPrimaryDisplay().workArea
    const [x, y] = mainWin.getPosition()
    const [w, h] = mainWin.getSize()
    hSide = x + w / 2 < waX + waW / 2 ? 'left' : 'right'
    vSide = y + h / 2 < waY + waH / 2 ? 'top' : 'bottom'
  })

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
    if (!hasValidWindow() || !hasValidBrowserView()) return
    mainWin.webContents.send('browser:url', url)
    mainWin.webContents.send('browser:navstate', {
      canBack: browserView.webContents.navigationHistory.canGoBack(),
      canFwd:  browserView.webContents.navigationHistory.canGoForward(),
    })
  })
  browserView.webContents.on('did-navigate-in-page', (_, url, isMainFrame) => {
    if (isMainFrame && hasValidWindow()) mainWin.webContents.send('browser:url', url)
  })
  browserView.webContents.on('did-start-loading', () => {
    if (hasValidWindow()) mainWin.webContents.send('browser:loading', true)
  })
  browserView.webContents.on('did-stop-loading', () => {
    if (!hasValidWindow() || !hasValidBrowserView()) return
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
      if (!hasValidBrowserView()) return
      const url = browserView.webContents.getURL()
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

  // Hide instead of destroying on red traffic-light click / Cmd+W so the session
  // stays alive and Cmd+\ never hits a destroyed BrowserWindow.
  mainWin.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWin.hide()
    }
  })

  mainWin.on('closed', () => {
    mainWin = null
    browserView = null
  })

  if (isDev) {
    mainWin.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWin.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

app.whenReady().then(() => {
  createWindow()
  registerShortcuts()

  app.on('activate', () => {
    if (!hasValidWindow()) {
      createWindow()
    } else {
      app.focus({ steal: true })
      mainWin.show()
      mainWin.focus()
      if (hasValidBrowserView()) browserView.webContents.focus()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
