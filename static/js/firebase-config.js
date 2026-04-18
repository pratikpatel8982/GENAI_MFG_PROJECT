// firebase-config.js
// Replace ALL values with your Firebase project credentials.
// Firebase Console → Project Settings → Your Apps → Web app

const firebaseConfig = {
  apiKey: "AIzaSyBTwjPNyLOJSeVN0tRMMt-9j5bu8ty_rYM",
  authDomain: "genai-eb4e2.firebaseapp.com",
  projectId: "genai-eb4e2",
  storageBucket: "genai-eb4e2.firebasestorage.app",
  messagingSenderId: "208918270514",
  appId: "1:208918270514:web:af8b17cce6f86ff635222b"
};

firebase.initializeApp(firebaseConfig);
const auth           = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Open the Google OAuth popup and sign the user in.
 * Returns the Firebase User object on success.
 */
async function signInWithGoogle() {
  const result = await auth.signInWithPopup(googleProvider);
  return result.user;
}

/** Sign the current user out. */
async function signOut() {
  await auth.signOut();
}

/** Return the currently signed-in Firebase User (or null). */
function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Fetch a fresh Firebase ID token for the current user.
 * Pass this as  Authorization: Bearer <token>  in every API request.
 */
async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return user.getIdToken(/* forceRefresh= */ false);
}

/**
 * Register a callback that fires whenever auth state changes.
 * Returns the unsubscribe function.
 */
function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(callback);
}
