# Daily Mood Analyser

A single-page React app that captures daily mood sentiment and stores it into Google Cloud Firestore.

## 🌟 Features

- **Single-Word Sentiment Quest**: Prompts for exactly one word representing your vibe with live archetype detection (e.g., Solar Flare ☀️, Ocean Wave 🌊, Volcano Core 🌋, Lightning Focus ⚡).
- **Gamified Quiz UI**: Retro-arcade theme with XP levels, streak counter, sound effects, particle animations, and victory confetti.
- **Automated Firestore Architecture**:
  - **Collection**: `moodAnalyser`
  - **Document ID**: Today's date formatted as `YYYY-MM-DD` (e.g. `2026-10-12`)
  - **Field**: `moods` (all words are appended to the same array field using Firestore's `arrayUnion()`)
- **Zero-Crash Empty Config Fallback**: Firebase configuration keys are kept empty by default as requested. The app runs immediately in interactive preview/demo mode and smoothly switches to live Firestore as soon as you add your keys.

---

## 🚀 Getting Started

### 1. Install & Run Dev Server

```bash
npm install
npm run dev
```

The app will be running at `http://localhost:5173`.

### 2. Adding your Firebase Credentials

Open [`src/firebase.js`](src/firebase.js) and fill in your project credentials from the [Firebase Console](https://console.firebase.google.com/):

```javascript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

### 3. Firestore Document Structure

When you submit a word (e.g., `"joyful"`), Firestore stores it as:

```
moodAnalyser (collection)
└── 2026-10-12 (document)
    └── moods: ["joyful", "focused", "energetic"] (array)
```

Submitting multiple words on the same day appends them to the same `moods` array in that day's document!
