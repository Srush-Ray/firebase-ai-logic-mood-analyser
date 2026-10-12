import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Flame,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Send,
  Brain,
  Loader2
} from 'lucide-react';
import {
  saveMoodToFirestore,
  getTodayDocId,
  getTodayMoodsFromFirestore,
  subscribeToTodayMoods,
  analyseTodayMoodsWithAI
} from './firebase';

// Web Audio API synthesized retro sound effects (no external audio files needed!)
const playSound = (type = 'click') => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {
    // Audio context may be restricted before user gesture
  }
};

// Fun word archetype detector to add quiz-like personality
const getMoodArchetype = (word) => {
  if (!word) return null;
  const w = word.toLowerCase();
  if (['happy', 'joyful', 'excited', 'ecstatic', 'thrilled', 'sunny'].includes(w)) {
    return { title: 'Solar Flare', emoji: '☀️', color: 'from-amber-400 to-yellow-500' };
  }
  if (['calm', 'peaceful', 'serene', 'zen', 'chill', 'relaxed'].includes(w)) {
    return { title: 'Ocean Wave', emoji: '🌊', color: 'from-cyan-400 to-blue-500' };
  }
  if (['tired', 'sleepy', 'exhausted', 'drained', 'fatigued'].includes(w)) {
    return { title: 'Low Battery', emoji: '🌙', color: 'from-indigo-400 to-purple-600' };
  }
  if (['angry', 'furious', 'mad', 'frustrated', 'annoyed'].includes(w)) {
    return { title: 'Volcano Core', emoji: '🌋', color: 'from-rose-500 to-red-600' };
  }
  if (['anxious', 'nervous', 'stressed', 'overwhelmed'].includes(w)) {
    return { title: 'Static Storm', emoji: '🌀', color: 'from-violet-400 to-fuchsia-600' };
  }
  if (['creative', 'inspired', 'productive', 'focused', 'determined'].includes(w)) {
    return { title: 'Lightning Focus', emoji: '⚡', color: 'from-emerald-400 to-teal-500' };
  }
  // Generic dynamic game vibe
  const vibes = [
    { title: 'Mystic Aura', emoji: '✨', color: 'from-purple-400 to-pink-500' },
    { title: 'Cosmic Pulse', emoji: '🌌', color: 'from-blue-400 to-indigo-600' },
    { title: 'Neon Spark', emoji: '💫', color: 'from-fuchsia-400 to-rose-500' },
  ];
  return vibes[word.length % vibes.length];
};

const SUGGESTED_MOODS = [
  '⚡ energetic',
  '☕ caffeinated',
  '🧘 zen',
  '🎯 focused',
  '🔥 unstoppable',
  '✨ grateful',
  '🥑 cozy',
];

export default function App() {
  const [wordInput, setWordInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [todaysMoods, setTodaysMoods] = useState([]);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiError, setAiError] = useState(null);

  const todayDocId = getTodayDocId();

  // Read savedMoods directly from Firebase Firestore in real-time (NO localStorage)
  useEffect(() => {
    const unsubscribe = subscribeToTodayMoods((firestoreMoods) => {
      setTodaysMoods(firestoreMoods);
    }, todayDocId);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [todayDocId]);

  // Validation: exactly one single word, no spaces, letters/hyphens only
  const trimmed = wordInput.trim();
  const hasMultipleWords = trimmed.includes(' ') || trimmed.includes('\t');
  const isInputEmpty = trimmed.length === 0;
  const isValidWord = !isInputEmpty && !hasMultipleWords && /^[a-zA-Z\u00C0-\u024F-]+$/.test(trimmed);

  const currentArchetype = isValidWord ? getMoodArchetype(trimmed) : null;

  const handleInputChange = (e) => {
    // Automatically prevent space bar if desired, or let user see the error feedback
    const val = e.target.value.replace(/\s+/g, ''); // Game rule: single word
    setWordInput(val);
    if (statusMessage) setStatusMessage(null);
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isValidWord) {
      playSound('error');
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid single word without numbers or spaces!',
      });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    playSound('click');

    try {
      const result = await saveMoodToFirestore(trimmed);

      // Real-time Firestore onSnapshot listener updates todaysMoods from Firestore.
      playSound('success');
      triggerConfetti();

      setStatusMessage({
        type: 'success',
        text: `Word "${trimmed}" successfully synced to Firestore!`,
        docId: result.docId,
      });

      setWordInput('');
    } catch (err) {
      console.error('Firestore save failed:', err);
      playSound('error');
      setStatusMessage({
        type: 'error',
        text: `Error saving to Firestore: ${err.message || 'Check Firebase permissions and credentials.'}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSuggested = (mood) => {
    playSound('click');
    const clean = mood.replace(/^[^\w]+/, '').trim(); // Remove leading emoji
    setWordInput(clean);
  };

  const handleAnalyseMood = async () => {
    playSound('click');
    setIsAnalysing(true);
    setAiError(null);

    try {
      // 1. Read all moods that are added today directly from Firestore
      let moods = await getTodayMoodsFromFirestore(todayDocId);

      // If empty, also check the live Firestore snapshot state
      if (!moods || moods.length === 0) {
        moods = todaysMoods;
      }

      if (!moods || moods.length === 0) {
        setAiError("No moods recorded in Firestore for today yet! Please add at least one mood first.");
        playSound('error');
        setIsAnalysing(false);
        return;
      }

      // 2. Run Firebase AI Logic to analyze moods and provide one sentence
      const sentence = await analyseTodayMoodsWithAI(moods);
      setAiAnalysis({
        text: sentence,
        count: moods.length,
        moods: moods
      });
      playSound('success');
      triggerConfetti();
    } catch (err) {
      console.error("Firebase AI Logic error:", err);
      playSound('error');
      setAiError(err.message || "Failed to analyze today's moods with AI.");
    } finally {
      setIsAnalysing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse-glow" />

      {/* Main Game Box */}
      <main className="w-full max-w-xl relative">
        <div className="relative rounded-3xl bg-slate-900/90 border-2 border-purple-500/30 p-6 sm:p-8 backdrop-blur-xl game-card-glow overflow-hidden">
          {/* Card Top Pill: Target Document Info */}
          <div className="flex items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Calendar className="w-4 h-4 text-purple-400" />
              <span>Today:</span>
              <code className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 font-mono text-[11px] border border-purple-800/50">
                {todayDocId}
              </code>
            </div>
          </div>

          {/* Question / Quiz Prompt */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-xs font-bold tracking-wide uppercase mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Daily Challenge</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              What is your current vibe?
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Summon your emotion in <span className="text-pink-400 font-bold underline decoration-pink-500/40">one single word</span>.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              {/* Vibe Archetype Live Floating Badge */}
              {currentArchetype && (
                <div className="absolute -top-3.5 left-4 z-10 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-900 border border-purple-500/50 shadow-md text-[11px] font-bold text-white animate-bounce-slight">
                  <span>{currentArchetype.emoji}</span>
                  <span className={`bg-gradient-to-r ${currentArchetype.color} bg-clip-text text-transparent`}>
                    {currentArchetype.title}
                  </span>
                </div>
              )}

              {/* Input Field */}
              <div className="relative">
                <input
                  type="text"
                  value={wordInput}
                  onChange={handleInputChange}
                  placeholder="e.g. ecstatic, peaceful, focused..."
                  disabled={isLoading}
                  autoComplete="off"
                  maxLength={25}
                  className={`w-full px-5 py-4 sm:py-5 rounded-2xl bg-slate-950/90 border-2 text-lg sm:text-xl font-bold text-white placeholder-slate-600 focus:outline-none transition-all duration-200 shadow-inner ${isValidWord
                    ? 'border-purple-500 ring-4 ring-purple-500/20'
                    : wordInput.length > 0
                      ? 'border-pink-500/80 ring-4 ring-pink-500/10'
                      : 'border-slate-800 hover:border-slate-700 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20'
                    }`}
                />

                {/* Word counter / constraints badge */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  {trimmed.length > 0 && (
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                      1 word
                    </span>
                  )}
                </div>
              </div>

              {/* Validation helper text */}
              <div className="flex items-center justify-between px-2 pt-2 text-[12px]">
                <span className="text-slate-500">
                  {wordInput.length === 0 ? 'Rule: Single word only' : `${wordInput.length} chars`}
                </span>
                <span className="text-purple-400/90 font-medium">
                  {isValidWord ? '⚡ Ready to cast!' : 'Awaiting word...'}
                </span>
              </div>
            </div>

            {/* Quick Pick Inspiration Tags */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Quick Cast Power-ups:
              </span>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_MOODS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSelectSuggested(s)}
                    disabled={isLoading}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-purple-900/40 text-slate-300 hover:text-purple-200 border border-slate-700/60 hover:border-purple-500/50 transition-all duration-150 transform hover:scale-105 active:scale-95"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !isValidWord}
              className={`w-full py-4 sm:py-5 px-6 rounded-2xl font-black text-base sm:text-lg tracking-wider uppercase flex items-center justify-center gap-2.5 transition-all duration-200 transform ${isValidWord && !isLoading
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white neon-btn-glow hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
                : 'bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>TRANSMITTING TO FIRESTORE...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>LOCK IN MOOD</span>
                </>
              )}
            </button>
          </form>

          {/* Feedback & Status Message */}
          {statusMessage && (
            <div
              className={`mt-6 p-4 rounded-2xl border flex items-start gap-3 transition-all duration-300 ${statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs sm:text-sm space-y-1">
                <p className="font-bold">{statusMessage.text}</p>
              </div>
            </div>
          )}

          {/* Today's Logged Moods Inventory */}
          {todaysMoods.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-pink-400" />
                  Today's Mood Inventory ({todaysMoods.length})
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  doc: {todayDocId}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {todaysMoods.map((m, idx) => (
                  <span
                    key={`${m}-${idx}`}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-purple-950/40 border border-purple-800/50 text-xs font-bold text-purple-200 shadow-sm"
                  >
                    <span className="text-pink-400">#</span>
                    <span>{m}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* AI Mood Analysis Result */}
          {(isAnalysing || aiAnalysis || aiError) && (
            <div className="mt-6 p-5 rounded-2xl bg-gradient-to-br from-purple-950/60 via-slate-900/90 to-pink-950/50 border border-purple-500/40 backdrop-blur-md shadow-xl shadow-purple-900/20 relative overflow-hidden transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-sm shadow-purple-500/30">
                    <Brain className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                    AI Mood Analysis
                  </span>
                </div>
                {aiAnalysis && (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-900/70 border border-purple-700/60 text-purple-200 font-mono">
                    {aiAnalysis.count} {aiAnalysis.count === 1 ? 'mood' : 'moods'} analysed
                  </span>
                )}
              </div>

              {isAnalysing ? (
                <div className="flex items-center gap-3 py-3 text-purple-200">
                  <Loader2 className="w-5 h-5 animate-spin text-pink-400 shrink-0" />
                  <span className="text-xs sm:text-sm font-medium animate-pulse">
                    Reading today's moods & running Firebase AI Logic...
                  </span>
                </div>
              ) : aiError ? (
                <div className="flex items-start gap-2.5 text-rose-300 text-xs py-1">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <p className="leading-relaxed">{aiError}</p>
                </div>
              ) : (
                aiAnalysis && (
                  <div className="space-y-2">
                    <p className="text-sm sm:text-base font-medium text-slate-100 leading-relaxed italic bg-slate-950/60 p-4 rounded-xl border border-purple-500/20 shadow-inner">
                      "{aiAnalysis.text}"
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Footer with Analyse Mood button */}
        <footer className="mt-4 px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
            <span>Firebase AI Logic • Daily Sentiment Analysis</span>
          </div>

          <button
            type="button"
            onClick={handleAnalyseMood}
            disabled={isAnalysing}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:via-fuchsia-500 hover:to-pink-500 text-white shadow-lg shadow-purple-600/30 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isAnalysing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Analysing Mood...</span>
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 text-pink-200" />
                <span>Analyse Mood</span>
              </>
            )}
          </button>
        </footer>
      </main>
    </div>
  );
}
