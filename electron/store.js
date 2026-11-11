// Local persistence: the API key (encrypted with the OS keychain via safeStorage)
// and past interview sessions, both as JSON files in Electron's userData folder.
import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

function filePath(name) {
  return path.join(app.getPath('userData'), name)
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(name, data) {
  const target = filePath(name)
  const tmp = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, target)
}

export function getApiKey() {
  const { apiKey } = readJson('config.json', {})
  if (!apiKey || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(apiKey, 'base64'))
  } catch {
    return null
  }
}

export function setApiKey(key) {
  const config = readJson('config.json', {})
  if (!key) {
    delete config.apiKey
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is unavailable on this system, so the key cannot be saved.')
    }
    config.apiKey = safeStorage.encryptString(key).toString('base64')
  }
  writeJson('config.json', config)
}

export function listSessions() {
  return readJson('sessions.json', [])
}

export function saveSession(session) {
  const sessions = listSessions().filter((s) => s.id !== session.id)
  sessions.unshift(session)
  writeJson('sessions.json', sessions)
}

export function deleteSession(id) {
  writeJson('sessions.json', listSessions().filter((s) => s.id !== id))
}
