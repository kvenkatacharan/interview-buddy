import { useEffect, useState } from 'react'
import Home from './screens/Home.jsx'
import Interview from './screens/Interview.jsx'
import Report from './screens/Report.jsx'
import Settings from './screens/Settings.jsx'
import './App.css'

export default function App() {
  const [screen, setScreen] = useState({ name: 'home' })
  const [sessions, setSessions] = useState([])
  const [keyStatus, setKeyStatus] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  function load() {
    return Promise.all([window.api.listSessions(), window.api.settingsStatus()])
  }

  async function refresh() {
    const [list, status] = await load()
    setSessions(list)
    setKeyStatus(status)
  }

  useEffect(() => {
    load().then(([list, status]) => {
      setSessions(list)
      setKeyStatus(status)
    })
  }, [])

  const hasKey = keyStatus && (keyStatus.hasSavedKey || keyStatus.hasEnvKey)

  return (
    <div className="app">
      {screen.name === 'home' && (
        <Home
          sessions={sessions}
          hasKey={hasKey}
          onOpenSettings={() => setShowSettings(true)}
          onStart={(settings) => setScreen({ name: 'interview', settings })}
          onOpenReport={(session) => setScreen({ name: 'report', session })}
          onDelete={async (id) => setSessions(await window.api.deleteSession(id))}
        />
      )}

      {screen.name === 'interview' && (
        <Interview
          settings={screen.settings}
          onExit={() => setScreen({ name: 'home' })}
          onFinished={async (session) => {
            await refresh()
            setScreen({ name: 'report', session })
          }}
        />
      )}

      {screen.name === 'report' && (
        <Report
          session={screen.session}
          onHome={() => setScreen({ name: 'home' })}
          onPracticeAgain={() =>
            setScreen({ name: 'interview', settings: { ...screen.session.settings, targetWeakSpots: true } })
          }
        />
      )}

      {showSettings && (
        <Settings
          status={keyStatus}
          onClose={async () => {
            setShowSettings(false)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
