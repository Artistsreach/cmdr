// 'use client' is not required here; this module is imported by client components.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

// NOTE: For production, move these to NEXT_PUBLIC_* env vars.
const firebaseConfig = {
  apiKey: "AIzaSyBAZLKhYHLevVvBVfWG9ZLwVZMlQ9Fh8zA",
  authDomain: "fresh25.firebaseapp.com",
  projectId: "fresh25",
  storageBucket: "fresh25.firebasestorage.app",
  messagingSenderId: "382962850342",
  appId: "1:382962850342:web:4a87b6ee30d0c77bf2a4e7",
  measurementId: "G-CZZW8LMXN3",
};

let app: FirebaseApp;
let auth: Auth;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

auth = getAuth(app);

export { app, auth, GoogleAuthProvider };
