import { app, BrowserWindow, WebContentsView, ipcMain, desktopCapturer, clipboard, nativeImage, screen, globalShortcut } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

const DEFAULT_WIDTH = 600
const DEFAULT_HEIGHT = 600
const TELEPROMPTER_WIDTH = 540
const TELEPROMPTER_HEIGHT = 300

let mainWin = null
let browserView = null
let isQuitting = false
let chromeHeight = 80 // updated dynamically from renderer
let hSide = 'center' // 'left' | 'center' | 'right'
let vSide = 'top'    // 'top' | 'bottom'
let currentOpacity = 0.7
let activePreset = 'c'
let clipboardMode = false
let clipboardTimer = null
let lastClipboardText = ''
let teleprompterMode = false
let savedSize = [DEFAULT_WIDTH, DEFAULT_HEIGHT]
let ghostMode = false

const PROMPTS = {
  c: `You are an expert coding interview assistant.

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

Return only the final answer and code.`,
  i: `You are an expert technical interview assistant.

Analyze the dictated question or attached screenshot(s).

Answer exactly as a strong candidate would in a real interview.
- Keep the answer natural and conversational.
- Be concise (30–90 seconds when spoken).
- Explain technical concepts clearly.
- Include a practical example whenever helpful.
- Avoid AI-sounding language or unnecessary theory.
- If the question is based on code shown in the screenshot, explain it confidently.`,
  b: `You are an expert behavioral interview coach.

Answer using the STAR method whenever appropriate.

- Situation
- Task
- Action
- Result

Keep answers natural, confident, and realistic.
Use first-person ("I") statements.
Focus on leadership, ownership, teamwork, conflict resolution, problem-solving, learning, and impact.
Keep responses around 1–2 minutes when spoken.
Avoid generic or robotic language.`,
}

function hasValidWindow() {
  return Boolean(mainWin && !mainWin.isDestroyed())
}

function hasValidBrowserView() {
  return Boolean(browserView && browserView.webContents && !browserView.webContents.isDestroyed())
}

const FIND_CHAT_INPUT_JS = `
  document.querySelector('#prompt-textarea, div[contenteditable="true"], textarea')
`

const AUTO_SEND_JS = `
  new Promise((resolve) => {
    var attempts = 0;
    function trySend() {
      attempts++;
      var btn = document.querySelector(
        'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], form button[type="submit"]'
      );
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
        btn.click();
        resolve(true);
        return;
      }
      if (attempts >= 30) {
        var el = ${FIND_CHAT_INPUT_JS};
        if (el) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        }
        resolve(false);
        return;
      }
      setTimeout(trySend, 120);
    }
    setTimeout(trySend, 150);
  })
`

const TELEPROMPTER_CSS = `
  #stage-slideover-sidebar, nav[aria-label="Chat history"] {
    display: none !important;
  }
  .markdown, .prose {
    font-size: 14.5px !important;
    line-height: 1.45 !important;
  }
`

async function syncTeleprompterStyles() {
  if (!hasValidBrowserView()) return
  try {
    await browserView.webContents.executeJavaScript(`
      (function () {
        var existing = document.getElementById('ib-teleprompter-style');
        if (${JSON.stringify(teleprompterMode)}) {
          if (!existing) {
            existing = document.createElement('style');
            existing.id = 'ib-teleprompter-style';
            document.head.appendChild(existing);
          }
          existing.textContent = ${JSON.stringify(TELEPROMPTER_CSS)};
        } else if (existing) {
          existing.remove();
        }
      })();
    `, true)
  } catch {
    // Ignore if page is still navigating
  }
}

async function scrollBrowserView(deltaY) {
  if (!hasValidBrowserView()) return
  try {
    await browserView.webContents.executeJavaScript(`
      (function () {
        var candidates = Array.from(document.querySelectorAll('main *, div, main'));
        var best = null;
        var bestArea = 0;
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          if (el.scrollHeight <= el.clientHeight + 20) continue;
          var style = window.getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') {
            var area = el.clientWidth * el.clientHeight;
            if (area > bestArea) {
              bestArea = area;
              best = el;
            }
          }
        }
        var target = best || document.scrollingElement || document.documentElement;
        target.scrollBy({ top: ${Number(deltaY)}, behavior: 'smooth' });
      })();
    `, true)
  } catch {
    // Ignore errors
  }
}

async function insertTextIntoChat(text, autoSend = false) {
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
        if (el.isContentEditable) {
          var sel = window.getSelection();
          if (sel) {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        document.execCommand('insertText', false, ${JSON.stringify(text)});
        return true;
      })();
    `, true)
    if (!found) return { ok: false, error: 'Chat input not found on this page' }
    if (autoSend && hasValidBrowserView()) {
      await browserView.webContents.executeJavaScript(AUTO_SEND_JS, true)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function captureAndPasteToChat({ promptText = '', autoSend = false } = {}) {
  if (!hasValidWindow() || !hasValidBrowserView()) return { ok: false, error: 'No browser view' }
  try {
    const display = screen.getPrimaryDisplay()
    const MAX_BYTES = 2.8 * 1024 * 1024
    let currentScale = Math.min(display.scaleFactor || 1, 1.5)
    let targetWidth = Math.max(1, Math.round(display.size.width * currentScale))
    let targetHeight = Math.max(1, Math.round(display.size.height * currentScale))

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

    let resized = source.thumbnail.resize({ width: targetWidth, height: targetHeight, quality: 'best' })
    let pngBuffer = resized.toPNG()

    while (pngBuffer.length > MAX_BYTES && currentScale > 0.8) {
      currentScale = Math.max(0.8, Number((currentScale - 0.2).toFixed(2)))
      targetWidth = Math.max(1, Math.round(display.size.width * currentScale))
      targetHeight = Math.max(1, Math.round(display.size.height * currentScale))
      resized = source.thumbnail.resize({ width: targetWidth, height: targetHeight, quality: 'best' })
      pngBuffer = resized.toPNG()
    }

    const compactImage = nativeImage.createFromBuffer(pngBuffer, { scaleFactor: 1.0 })
    clipboard.writeImage(compactImage)
    lastClipboardText = (clipboard.readText() || '').trim()

    if (!mainWin.isVisible()) {
      mainWin.show()
    }
    app.focus({ steal: true })
    mainWin.focus()
    browserView.webContents.focus()

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

    if (promptText && hasValidBrowserView()) {
      await browserView.webContents.executeJavaScript(`
        new Promise((resolve) => {
          setTimeout(() => {
            var el = ${FIND_CHAT_INPUT_JS};
            if (el) {
              el.focus();
              document.execCommand('insertText', false, ${JSON.stringify(promptText)});
            }
            resolve(true);
          }, 80);
        })
      `, true)
    }

    if (autoSend && hasValidBrowserView()) {
      await browserView.webContents.executeJavaScript(AUTO_SEND_JS, true)
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function setClipboardListener(enabled) {
  clipboardMode = Boolean(enabled)
  if (clipboardTimer) {
    clearInterval(clipboardTimer)
    clipboardTimer = null
  }
  if (clipboardMode) {
    lastClipboardText = (clipboard.readText() || '').trim()
    clipboardTimer = setInterval(() => {
      if (!clipboardMode || !hasValidBrowserView()) return
      const text = (clipboard.readText() || '').trim()
      if (!text || text === lastClipboardText || text.length < 4) return
      lastClipboardText = text
      const prompt = PROMPTS[activePreset] || PROMPTS.c
      insertTextIntoChat(`${prompt}\n\nQuestion:\n${text}`, true)
    }, 600)
  }
  if (hasValidWindow()) {
    mainWin.webContents.send('clipboard:mode', clipboardMode)
  }
  return clipboardMode
}

function setTeleprompter(enabled) {
  teleprompterMode = Boolean(enabled)
  if (hasValidWindow()) {
    if (teleprompterMode) {
      savedSize = mainWin.getSize()
      hSide = 'center'
      vSide = 'top'
      mainWin.setSize(TELEPROMPTER_WIDTH, TELEPROMPTER_HEIGHT, false)
      applyPosition()
    } else {
      const [w, h] = savedSize || [DEFAULT_WIDTH, DEFAULT_HEIGHT]
      mainWin.setSize(w, h, false)
      applyPosition()
    }
    updateViewBounds()
    setTimeout(updateViewBounds, 50)
    mainWin.webContents.send('window:teleprompter', teleprompterMode)
  }
  syncTeleprompterStyles()
  return teleprompterMode
}

function setGhostMode(enabled) {
  ghostMode = Boolean(enabled)
  if (hasValidWindow()) {
    mainWin.setIgnoreMouseEvents(ghostMode, { forward: true })
    mainWin.webContents.send('window:ghost', ghostMode)
  }
  return ghostMode
}

function stepOpacity(delta) {
  currentOpacity = Math.min(1, Math.max(0.2, Number((currentOpacity + delta).toFixed(2))))
  if (hasValidWindow()) {
    mainWin.setOpacity(currentOpacity)
    mainWin.webContents.send('window:opacity-sync', Math.round(currentOpacity * 100))
  }
}

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
ipcMain.handle('browser:screenshotToChat', async () => captureAndPasteToChat())
ipcMain.handle('browser:insertText', async (_, text, autoSend = false) => insertTextIntoChat(text, autoSend))
ipcMain.handle('clipboard:toggle', () => setClipboardListener(!clipboardMode))
ipcMain.on('preset:set', (_, k) => {
  if (PROMPTS[k]) activePreset = k
})
ipcMain.handle('window:toggleTeleprompter', () => setTeleprompter(!teleprompterMode))
ipcMain.handle('window:toggleGhost', () => setGhostMode(!ghostMode))
ipcMain.on('window:opacity', (_, v) => {
  currentOpacity = Math.min(1, Math.max(0.2, Number(v) || 0.7))
  if (hasValidWindow()) mainWin.setOpacity(currentOpacity)
})
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

  // 1. Zero-Click Workflow: One-Shot Capture + Prompt + Auto-Send
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    activePreset = 'c'
    captureAndPasteToChat({ promptText: PROMPTS.c, autoSend: true })
  })
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    activePreset = 'i'
    captureAndPasteToChat({ promptText: PROMPTS.i, autoSend: true })
  })
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    activePreset = 'b'
    captureAndPasteToChat({ promptText: PROMPTS.b, autoSend: true })
  })

  // Global Scroll inside browserView without moving mouse focus
  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    scrollBrowserView(-300)
  })
  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    scrollBrowserView(300)
  })

  // 2. Clipboard Listener Mode ("Copy-to-Ask") toggle
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    setClipboardListener(!clipboardMode)
  })

  // 4. Reading Ergonomics & Eye-Line Control
  // Teleprompter mode (top-center under webcam + clutter-free CSS)
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    setTeleprompter(!teleprompterMode)
  })
  // Click-Through Ghost mode
  globalShortcut.register('CommandOrControl+Shift+\\', () => {
    setGhostMode(!ghostMode)
  })
  // Opacity stepper (-10% / +10%)
  globalShortcut.register('CommandOrControl+Alt+[', () => {
    stepOpacity(-0.1)
  })
  globalShortcut.register('CommandOrControl+Alt+]', () => {
    stepOpacity(0.1)
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
    if (teleprompterMode) syncTeleprompterStyles()
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
  if (clipboardTimer) clearInterval(clipboardTimer)
  globalShortcut.unregisterAll()
})
