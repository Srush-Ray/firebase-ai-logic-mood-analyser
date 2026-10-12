import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, arrayUnion } from "firebase/firestore";
import { initializeAppCheck, CustomProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";

// ============================================================================
// APP CHECK DEBUG CONFIGURATION
// Configured with the registered debug token for local dev and testing
// Matching the reference implementation in firebase-ai-logic
// ============================================================================
const CANDIDATE_DEBUG_TOKENS = Array.from(new Set([
  import.meta.env?.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN,
])).filter(Boolean);

const PRIMARY_DEBUG_TOKEN = CANDIDATE_DEBUG_TOKENS[0];

if (typeof window !== "undefined") {
  window.FIREBASE_APPCHECK_EXECUTE_IN_DEV = true;
  window.FIREBASE_APPCHECK_DEBUG_TOKEN = PRIMARY_DEBUG_TOKEN;
  self.FIREBASE_APPCHECK_EXECUTE_IN_DEV = true;
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = PRIMARY_DEBUG_TOKEN;
  console.log(
    `%c[Firebase App Check Debug Tokens]%c ${CANDIDATE_DEBUG_TOKENS.join(', ')}`,
    'background: #4f46e5; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;',
    'color: #38bdf8; font-weight: bold; font-size: 13px;'
  );
}

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCryqo7AYnbVh4GMtIEM3M9ud_m1qKr8po",
  authDomain: "web-apps-47374.firebaseapp.com",
  projectId: "web-apps-47374",
  storageBucket: "web-apps-47374.firebasestorage.app",
  messagingSenderId: "908298399919",
  appId: "1:908298399919:web:fa20c75959c762a0fb245a"
};

// Check whether real credentials have been provided
export const isFirebaseConfigured = () => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey.trim() !== "" &&
    firebaseConfig.projectId.trim() !== ""
  );
};

let appInstance = null;
let firestoreInstance = null;
let appCheckInstance = null;

export function getFirebaseApp() {
  if (!appInstance) {
    if (getApps().length > 0) {
      appInstance = getApp();
    } else {
      appInstance = initializeApp(firebaseConfig);
    }

    if (typeof window !== "undefined" && !appCheckInstance) {
      try {
        appCheckInstance = initializeAppCheck(appInstance, {
          provider: new CustomProvider({
            getToken: async () => {
              for (const token of CANDIDATE_DEBUG_TOKENS) {
                try {
                  const res = await fetch(
                    `https://firebaseappcheck.googleapis.com/v1/projects/${firebaseConfig.projectId}/apps/${firebaseConfig.appId}:exchangeDebugToken?key=${firebaseConfig.apiKey}`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ debugToken: token }),
                    }
                  );
                  if (res.ok) {
                    const data = await res.json();
                    return {
                      token: data.token,
                      expireTimeMillis: Date.now() + 3600000,
                    };
                  }
                } catch (err) {
                  console.warn("App Check token exchange error for token:", token, err);
                }
              }
              return {
                token: PRIMARY_DEBUG_TOKEN,
                expireTimeMillis: Date.now() + 3600000 * 24,
              };
            },
          }),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (e) {
        console.warn("App Check init skipped:", e);
      }
    }
  }
  return appInstance;
}

export function getFirestoreDb() {
  if (!firestoreInstance) {
    const app = getFirebaseApp();
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

// Ensure default initialization if configured
try {
  if (isFirebaseConfigured()) {
    getFirebaseApp();
    getFirestoreDb();
  }
} catch (error) {
  console.warn("Firebase initialization skipped or encountered error:", error);
}

export const app = appInstance;
export const db = firestoreInstance;

/**
 * Returns today's date in local YYYY-MM-DD format
 * e.g., "2026-10-12"
 */
export const getTodayDocId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Saves a mood word to Firestore:
 * - Collection: "moodAnalyser"
 * - Document ID: today's date in yyyy-mm-dd format
 * - Field: "moods" (array of words using arrayUnion)
 */
export const saveMoodToFirestore = async (word) => {
  const cleanWord = word.trim().toLowerCase();
  const docId = getTodayDocId();

  if (!isFirebaseConfigured()) {
    throw new Error("Firebase credentials missing in src/firebase.js");
  }

  const firestoreDb = getFirestoreDb();
  const moodDocRef = doc(firestoreDb, "moodAnalyser", docId);

  // setDoc with merge: true will create the doc if it doesn't exist,
  // or append the new word to the 'moods' array without overwriting previous words.
  await setDoc(
    moodDocRef,
    {
      moods: arrayUnion(cleanWord),
    },
    { merge: true }
  );

  return {
    success: true,
    docId,
    word: cleanWord,
    message: "Mood stored successfully in Firestore!",
  };
};

/**
 * Reads all moods added today from Firestore:
 * - Collection: "moodAnalyser"
 * - Document ID: today's date in yyyy-mm-dd format
 * - Field: "moods"
 */
export const getTodayMoodsFromFirestore = async (docId = getTodayDocId()) => {
  if (!isFirebaseConfigured()) return [];

  const firestoreDb = getFirestoreDb();
  const moodDocRef = doc(firestoreDb, "moodAnalyser", docId);
  const docSnap = await getDoc(moodDocRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return Array.isArray(data.moods) ? data.moods : [];
  }
  return [];
};

/**
 * Real-time listener for today's moods in Firestore:
 * - Collection: "moodAnalyser"
 * - Document ID: today's date in yyyy-mm-dd format
 * - Calls callback whenever moods in Firestore change
 * - Does NOT use or touch localStorage
 */
export const subscribeToTodayMoods = (callback, docId = getTodayDocId()) => {
  if (!isFirebaseConfigured()) {
    callback([]);
    return () => { };
  }

  const firestoreDb = getFirestoreDb();
  const moodDocRef = doc(firestoreDb, "moodAnalyser", docId);

  return onSnapshot(
    moodDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const moods = Array.isArray(data?.moods) ? data.moods : [];
        callback(moods);
      } else {
        callback([]);
      }
    },
    (err) => {
      console.warn("Firestore listener error:", err);
    }
  );
};

/**
 * Runs Firebase AI Logic to analyze all moods recorded today and return one sentence.
 * Follows the proven implementation from firebase-ai-logic:
 * - Uses Gemini Developer API backend (GoogleAIBackend)
 * - Tries supported models: gemini-2.0-flash, gemini-flash-latest, gemini-2.0-flash-exp
 * - Handles App Check integration
 */
export const analyseTodayMoodsWithAI = async (moods) => {
  if (!moods || moods.length === 0) {
    throw new Error("No moods have been logged for today yet.");
  }

  const firebaseApp = getFirebaseApp();
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

  const prompt = `Here are the emotions and mood words a person recorded throughout their day today: ${moods.join(", ")}.
Analyze all these moods together and summarize their day's emotional vibe and sentiment in exactly ONE thoughtful, and insightful sentence. Do not include markdown formatting, bullet points, greetings, or extra sentences. Just return the single sentence.`;

  // Active model candidates supported on Firebase AI Logic (Gemini Developer API)
  const modelsToTry = [
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite',
  ];

  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      const generativeModel = getGenerativeModel(ai, {
        model: currentModel,
        generationConfig: {
          temperature: 0.2,
        },
      });

      const result = await generativeModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text()?.trim();
      if (text) {
        return text;
      }
    } catch (err) {
      lastError = err;
      const errStr = String(err.message || err);
      if (
        errStr.includes('404') ||
        errStr.includes('RETIRED_MODEL') ||
        errStr.includes('retired') ||
        errStr.includes('no longer available') ||
        errStr.includes('not found')
      ) {
        console.warn(`Model "${currentModel}" returned 404/retired. Trying next candidate...`);
        continue;
      }
      throw err;
    }
  }

  if (lastError) {
    const errStr = String(lastError.message || lastError);
    if (errStr.includes("reading 'some'") || errStr.includes("403")) {
      throw new Error(`Firebase AI Logic returned 403 Forbidden. Since you just enabled the API and debug token, please allow 2-3 minutes for Google Cloud's permissions to propagate across systems, then retry.`);
    }
    throw new Error(`Firebase AI Logic call failed: ${lastError.message || String(lastError)}. Please verify that Gemini Developer API is enabled in your Google Cloud / Firebase console for project "${firebaseConfig.projectId}".`);
  }

  throw new Error("Unable to analyze moods with AI.");
};
