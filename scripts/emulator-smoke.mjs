import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, collection, getDocs } from 'firebase/firestore'

const config = {
  apiKey: 'demo-key',
  authDomain: 'localhost',
  projectId: 'conciliacion-cuenta-h',
  storageBucket: 'demo.appspot.com',
  messagingSenderId: '0',
  appId: '1:0:web:0',
}

const app = initializeApp(config)
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const db = getFirestore(app)
connectFirestoreEmulator(db, '127.0.0.1', 8080)

await signInWithEmailAndPassword(auth, 'demo@mec.local', 'demo1234')
const movements = await getDocs(collection(db, 'movements'))
console.log('OK login + firestore movements:', movements.size)
