const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  settingsStatus: () => ipcRenderer.invoke('settings:status'),
  setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),

  listSessions: () => ipcRenderer.invoke('sessions:list'),
  deleteSession: (id) => ipcRenderer.invoke('sessions:delete', id),

  startInterview: (settings) => ipcRenderer.invoke('interview:start', settings),
  sendTurn: (turn) => ipcRenderer.invoke('interview:turn', turn),
  endInterview: (args) => ipcRenderer.invoke('interview:end', args),
  abandonInterview: (sessionId) => ipcRenderer.invoke('interview:abandon', sessionId),

  // Returns an unsubscribe function.
  onDelta: (fn) => {
    const listener = (_, payload) => fn(payload)
    ipcRenderer.on('interview:delta', listener)
    return () => ipcRenderer.removeListener('interview:delta', listener)
  },
})
