const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  navigate:        (url) => ipcRenderer.send('browser:navigate', url),
  goBack:          ()    => ipcRenderer.send('browser:back'),
  goForward:       ()    => ipcRenderer.send('browser:forward'),
  reload:          ()    => ipcRenderer.send('browser:reload'),
  setOpacity:      (v)   => ipcRenderer.send('window:opacity', v),
  setAlwaysOnTop:  (v)   => ipcRenderer.send('window:alwaysOnTop', v),
  getUrl:          ()    => ipcRenderer.invoke('browser:getUrl'),
  setChromeHeight: (h)   => ipcRenderer.send('chrome:height', h),

  onUrlUpdate:    (fn) => ipcRenderer.on('browser:url',     (_, url)   => fn(url)),
  onLoadingChange:(fn) => ipcRenderer.on('browser:loading', (_, v)     => fn(v)),
  onNavState:     (fn) => ipcRenderer.on('browser:navstate',(_, state) => fn(state)),
})
