const [email = 'demo@mec.local', password = 'demo1234'] = process.argv.slice(2)
const response = await fetch(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
)
const body = await response.json()
if (!response.ok) {
  console.error(body)
  process.exit(1)
}
console.log(`Usuario emulador listo: ${email}`)
