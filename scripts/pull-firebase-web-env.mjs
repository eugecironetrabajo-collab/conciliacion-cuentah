import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const projectRoot = resolve('.')
const firebaserc = JSON.parse(readFileSync(resolve(projectRoot, '.firebaserc'), 'utf8'))
const projectId = firebaserc.projects?.default
if (!projectId) {
  console.error('Falta projectId en .firebaserc')
  process.exit(1)
}

let raw
try {
  raw = execSync(`npx firebase apps:sdkconfig WEB --project ${projectId}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
} catch (error) {
  const err = [error.stderr, error.stdout, error.message].filter(Boolean).join('\n')
  console.error(err)
  console.error('\nEjecute primero: npx firebase login')
  console.error('Y cree una app Web en Firebase Console si aún no existe.')
  process.exit(1)
}

const config = JSON.parse(raw)
const lines = [
  '# Generado por npm run firebase:pull-env',
  'VITE_BACKEND=firestore',
  `VITE_FIREBASE_API_KEY=${config.sdkConfig.apiKey}`,
  `VITE_FIREBASE_AUTH_DOMAIN=${config.sdkConfig.authDomain}`,
  `VITE_FIREBASE_PROJECT_ID=${config.sdkConfig.projectId}`,
  `VITE_FIREBASE_STORAGE_BUCKET=${config.sdkConfig.storageBucket}`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID=${config.sdkConfig.messagingSenderId}`,
  `VITE_FIREBASE_APP_ID=${config.sdkConfig.appId}`,
  'VITE_FIREBASE_EMULATOR=false',
  '',
]
const target = resolve(projectRoot, 'web/.env.production')
writeFileSync(target, lines.join('\n'), 'utf8')
console.log(`OK escrito ${target} para proyecto ${projectId}`)
