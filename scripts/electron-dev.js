import { spawn } from 'node:child_process'
import process from 'node:process'

const devServerUrl = 'http://localhost:5173'

const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  stdio: 'inherit',
  shell: true,
})

let electron
let shuttingDown = false

async function waitForVite() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(devServerUrl)

      if (response.ok) {
        return
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(`Timed out waiting for ${devServerUrl}`)
}

function stop() {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  if (electron && !electron.killed) {
    electron.kill()
  }

  if (!vite.killed) {
    vite.kill()
  }
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', stop)

waitForVite()
  .then(() => {
    electron = spawn('npx', ['electron', '.'], {
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devServerUrl,
      },
      stdio: 'inherit',
      shell: true,
    })

    electron.on('exit', (code) => {
      stop()
      process.exit(code ?? 0)
    })
  })
  .catch((error) => {
    console.error(error)
    stop()
    process.exit(1)
  })
