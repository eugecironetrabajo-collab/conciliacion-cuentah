import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const path = resolve('web/.env.production')
if (!existsSync(path)) {
  console.error(
    'Falta web/.env.production. Copie web/.env.production.example → web/.env.production y pegue las claves de Firebase Console.',
  )
  process.exit(1)
}

const text = readFileSync(path, 'utf8')
const required = [
  'VITE_BACKEND=firestore',
  'VITE_FIREBASE_API_KEY=',
  'VITE_FIREBASE_PROJECT_ID=',
  'VITE_FIREBASE_APP_ID=',
]

for (const key of required) {
  if (!text.includes(key.split('=')[0] + '=')) {
    console.error(`web/.env.production: falta ${key.split('=')[0]}`)
    process.exit(1)
  }
}

if (/VITE_FIREBASE_EMULATOR\s*=\s*true/i.test(text)) {
  console.error('web/.env.production no debe tener VITE_FIREBASE_EMULATOR=true (solo emulador local).')
  process.exit(1)
}
if (!/VITE_FIREBASE_EMULATOR\s*=\s*false/i.test(text)) {
  console.error('web/.env.production debe incluir VITE_FIREBASE_EMULATOR=false (evita mezclar con web/.env.local).')
  process.exit(1)
}

const empty = text
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('VITE_FIREBASE_') && line.endsWith('='))

if (empty.length) {
  console.error('web/.env.production tiene variables vacías:', empty.join(', '))
  process.exit(1)
}

if (/demo-key|localhost/i.test(text) && !process.env.ALLOW_DEMO_FIREBASE_ENV) {
  console.error('web/.env.production parece configuración de demo/emulador. Use claves reales de Firebase Console.')
  process.exit(1)
}

console.log('OK web/.env.production')
