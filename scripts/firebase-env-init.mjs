import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const example = resolve('web/.env.production.example')
const target = resolve('web/.env.production')
if (existsSync(target)) {
  console.log('web/.env.production ya existe; no se sobrescribe.')
  process.exit(0)
}
copyFileSync(example, target)
console.log('Creado web/.env.production — complete las claves desde Firebase Console.')
