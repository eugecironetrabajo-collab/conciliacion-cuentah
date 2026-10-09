import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let firestore: Firestore | null = null

export function firebaseEnabled() {
  return import.meta.env.VITE_BACKEND === 'firestore' && Boolean(config.projectId)
}

export function getFirebaseApp() {
  if (!firebaseEnabled()) throw new Error('Firebase no está configurado')
  if (!app) app = initializeApp(config)
  return app
}

export function getFirebaseAuth() {
  if (!auth) {
    auth = getAuth(getFirebaseApp())
    if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    }
  }
  return auth
}

export function getFirestoreDb() {
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp())
    if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
    }
  }
  return firestore
}
