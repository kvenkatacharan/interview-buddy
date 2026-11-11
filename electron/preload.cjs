const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  navigate:           (url) => ipcRenderer.send('browser:navigate', url),
  goBack:             ()    => ipcRenderer.send('browser:back'),
  goForward:          ()    => ipcRenderer.send('browser:forward'),
  reload:             ()    => ipcRenderer.send('browser:reload'),
  setOpacity:         (v)   => ipcRenderer.send('window:opacity', v),
  getUrl:             ()    => ipcRenderer.invoke('browser:getUrl'),
  setChromeHeight:    (h)   => ipcRenderer.send('chrome:height', h),
  screenshotToChat:   ()    => ipcRenderer.invoke('browser:screenshotToChat'),
  insertText:         (t, autoSend = false) => ipcRenderer.invoke('browser:insertText', t, autoSend),
  toggleClipboardMode:()    => ipcRenderer.invoke('clipboard:toggle'),
  setActivePreset:    (k)   => ipcRenderer.send('preset:set', k),
  toggleTeleprompter: ()    => ipcRenderer.invoke('window:toggleTeleprompter'),
  toggleGhostMode:    ()    => ipcRenderer.invoke('window:toggleGhost'),

  onUrlUpdate:        (fn) => ipcRenderer.on('browser:url',         (_, url)   => fn(url)),
  onLoadingChange:    (fn) => ipcRenderer.on('browser:loading',     (_, v)     => fn(v)),
  onNavState:         (fn) => ipcRenderer.on('browser:navstate',    (_, state) => fn(state)),
  onClipboardMode:    (fn) => ipcRenderer.on('clipboard:mode',      (_, v)     => fn(v)),
  onTeleprompterMode: (fn) => ipcRenderer.on('window:teleprompter', (_, v)     => fn(v)),
  onGhostMode:        (fn) => ipcRenderer.on('window:ghost',        (_, v)     => fn(v)),
  onOpacitySync:      (fn) => ipcRenderer.on('window:opacity-sync', (_, v)     => fn(v)),
})
