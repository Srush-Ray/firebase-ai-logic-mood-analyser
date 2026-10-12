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
  Loader2,
  Database,
  Copy,
  Check,
  Quote,
  Zap
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
  const [copied, setCopied] = useState(false);

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

      // Real-time Firestore onSnapshot listener automatically updates todaysMoods from Firestore.
      playSound('success');
      triggerConfetti();

      setStatusMessage({
        type: 'success',
        text: `Word "${trimmed}" stored in Firestore!`,
        docId: result.docId,
      });

      setWordInput('');
    } catch (err) {
      console.error('Firestore save failed:', err);
      playSound('error');
      setStatusMessage({
        type: 'error',
        text: `Error saving to Firestore: ${err.message || 'Check Firebase credentials.'}`,
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

  const handleCopy = () => {
    if (aiAnalysis?.text) {
      navigator.clipboard.writeText(aiAnalysis.text);
      setCopied(true);
      playSound('click');
      setTimeout(() => setCopied(false), 2000);
    }
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
        setAiError("No moods recorded in Firestore for today yet! Please add at least one mood first on the left.");
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
    <div className="min-h-screen flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8 relative overflow-x-hidden">
      {/* Background ambient lighting */}
      <div className="fixed top-12 left-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse-glow" />
      <div className="fixed bottom-12 right-1/4 w-96 h-96 bg-pink-600/15 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse-glow" />
      <div className="fixed top-1/2 right-1/3 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Header */}
      <header className="w-full max-w-6xl mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-fuchsia-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Mood Pulse
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/30">
                AI Logic
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Live Firestore vibe logger & Gemini emotional sentiment synthesis
            </p>
          </div>
        </div>

        {/* Header Metadata Badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-semibold text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            <span>Today:</span>
            <code className="text-purple-300 font-mono text-[11px] font-bold">
              {todayDocId}
            </code>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] font-bold text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Firestore Live</span>
          </div>
        </div>
      </header>

      {/* Main 2-Section Grid Layout */}
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

        {/* ========================================================================= */}
        {/* LEFT SECTION (Cols 1-6): Mood Input + Database Moods List                 */}
        {/* ========================================================================= */}
        <section className="lg:col-span-6 flex flex-col gap-6 w-full">

          {/* Card 1: Mood Input Form */}
          <div className="relative rounded-3xl bg-slate-900/90 border-2 border-purple-500/30 p-6 sm:p-7 backdrop-blur-xl game-card-glow overflow-hidden">
            {/* Header pill */}
            <div className="flex items-center justify-between gap-2 mb-5 pb-3 border-b border-slate-800/80">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-xs font-bold tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Daily Challenge</span>
              </div>
              <span className="text-xs text-slate-400 font-medium">Step 1: Log Vibes</span>
            </div>

            {/* Prompt Heading */}
            <div className="mb-6">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                What is your current vibe?
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Summon your emotion in <span className="text-pink-400 font-bold underline decoration-pink-500/40">one single word</span>.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative">
                {/* Vibe Archetype Floating Badge */}
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
                    placeholder="e.g. ecstatic, serene, focused..."
                    disabled={isLoading}
                    autoComplete="off"
                    maxLength={25}
                    className={`w-full px-5 py-4 rounded-2xl bg-slate-950/90 border-2 text-base sm:text-lg font-bold text-white placeholder-slate-600 focus:outline-none transition-all duration-200 shadow-inner ${isValidWord
                      ? 'border-purple-500 ring-4 ring-purple-500/20'
                      : wordInput.length > 0
                        ? 'border-pink-500/80 ring-4 ring-pink-500/10'
                        : 'border-slate-800 hover:border-slate-700 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20'
                      }`}
                  />

                  {/* 1 word badge */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                    {trimmed.length > 0 && (
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                        1 word
                      </span>
                    )}
                  </div>
                </div>

                {/* Validation text */}
                <div className="flex items-center justify-between px-2 pt-2 text-[12px]">
                  <span className="text-slate-500">
                    {wordInput.length === 0 ? 'Single word only' : `${wordInput.length} chars`}
                  </span>
                  <span className="text-purple-400/90 font-medium">
                    {isValidWord ? '⚡ Ready to cast!' : 'Awaiting word...'}
                  </span>
                </div>
              </div>

              {/* Quick Pick Power-ups */}
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
                className={`w-full py-4 px-6 rounded-2xl font-black text-sm sm:text-base tracking-wider uppercase flex items-center justify-center gap-2.5 transition-all duration-200 transform ${isValidWord && !isLoading
                  ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white neon-btn-glow hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
                  : 'bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                  }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>SAVING TO FIRESTORE...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>LOCK IN MOOD</span>
                  </>
                )}
              </button>
            </form>

            {/* Status Message */}
            {statusMessage && (
              <div
                className={`mt-4 p-3.5 rounded-2xl border flex items-start gap-3 transition-all duration-300 ${statusMessage.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-0.5">
                  <p className="font-bold">{statusMessage.text}</p>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Database Moods List (Real-time Firestore) */}
          <div className="relative rounded-3xl bg-slate-900/90 border-2 border-purple-500/30 p-6 sm:p-7 backdrop-blur-xl game-card-glow overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-950/80 border border-purple-700/50 flex items-center justify-center text-purple-300">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Database Moods
                  </h3>
                </div>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950/80 border border-purple-800/60 text-purple-300 font-mono font-bold">
                {todaysMoods.length} {todaysMoods.length === 1 ? 'mood' : 'moods'}
              </span>
            </div>

            {/* Mood List Content */}
            {todaysMoods.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40">
                <Flame className="w-7 h-7 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">
                  No moods stored for today yet.
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Type a vibe in the box above to store it in Firestore!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                  {todaysMoods.map((m, idx) => {
                    const arch = getMoodArchetype(m);
                    return (
                      <span
                        key={`${m}-${idx}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/50 border border-purple-700/50 text-xs font-bold text-purple-200 shadow-sm transition-all duration-150 transform hover:scale-105"
                      >
                        <span className="text-pink-400">{arch ? arch.emoji : '#'}</span>
                        <span className="capitalize">{m}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </section>

        {/* ========================================================================= */}
        {/* RIGHT SECTION (Cols 7-12): Generated Summary / Analysed Moods             */}
        {/* ========================================================================= */}
        <section className="lg:col-span-6 flex flex-col gap-6 w-full">

          <div className="relative rounded-3xl bg-slate-900/90 border-2 border-purple-500/30 p-6 sm:p-7 backdrop-blur-xl game-card-glow overflow-hidden min-h-[500px] flex flex-col justify-between">

            {/* Top Action Header */}
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-purple-500/30">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                      AI Mood Analysis
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Firebase AI Logic • Daily Sentiment Synthesis
                    </p>
                  </div>
                </div>

                {/* Analyse Mood Trigger Button */}
                <button
                  type="button"
                  onClick={handleAnalyseMood}
                  disabled={isAnalysing}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:via-fuchsia-500 hover:to-pink-500 text-white shadow-lg shadow-purple-600/30 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                  {isAnalysing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Analysing...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-yellow-300" />
                      <span>Analyse Mood</span>
                    </>
                  )}
                </button>
              </div>

              {/* Dynamic Analysis State Content */}
              {isAnalysing ? (
                /* LOADING STATE */
                <div className="my-10 p-8 rounded-2xl bg-purple-950/30 border border-purple-500/30 text-center flex flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/40 animate-pulse">
                      <Brain className="w-8 h-8" />
                    </div>
                    <Loader2 className="w-20 h-20 text-pink-400 animate-spin absolute -top-2 -left-2 pointer-events-none" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">
                      Synthesizing Today's Moods...
                    </h3>
                    <p className="text-xs text-purple-300/80 max-w-sm mx-auto">
                      Reading {todaysMoods.length} recorded mood words from Firestore and running Gemini Developer API inference.
                    </p>
                  </div>
                </div>
              ) : aiError ? (
                /* ERROR STATE */
                <div className="my-6 p-5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    <h3 className="text-sm font-bold text-rose-300">Analysis Encountered an Issue</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-rose-200/90 pl-7">
                    {aiError}
                  </p>
                  <div className="pl-7 pt-1">
                    <button
                      type="button"
                      onClick={handleAnalyseMood}
                      className="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-xs font-semibold text-white border border-rose-700/60 transition-all"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : aiAnalysis ? (
                /* RESULT STATE */
                <div className="space-y-6 my-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-900/40 border border-purple-700/50 text-[11px] font-bold text-purple-300">
                      <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                      <span>{aiAnalysis.count} moods synthesized</span>
                    </span>

                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors border border-slate-700"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Summary Quote Box */}
                  <div className="relative p-6 sm:p-7 rounded-2xl bg-slate-950/80 border-2 border-purple-500/40 shadow-xl overflow-hidden group">
                    <Quote className="w-16 h-16 text-purple-600/10 absolute -top-2 -left-2 pointer-events-none transform -scale-x-100" />
                    <div className="relative z-10 space-y-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 block">
                        Today's Emotional Essence
                      </span>
                      <p className="text-lg sm:text-xl font-semibold text-white leading-relaxed italic">
                        "{aiAnalysis.text}"
                      </p>
                    </div>
                  </div>

                  {/* Analysed Moods Cloud */}
                  {Array.isArray(aiAnalysis.moods) && aiAnalysis.moods.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Moods analyzed in this session:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {aiAnalysis.moods.map((m, i) => (
                          <span
                            key={`analyzed-${m}-${i}`}
                            className="px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-800/40 text-[11px] font-medium text-purple-300"
                          >
                            #{m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* INITIAL / AWAITING ANALYSIS STATE */
                <div className="my-8 py-10 px-6 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center text-purple-300 mb-1">
                    <Brain className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    Awaiting Mood Analysis
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Log your emotions on the left side, then click <strong className="text-pink-300">"Analyse Mood"</strong> to generate your one-sentence daily emotional sentiment synthesis powered by Firebase AI Logic.
                  </p>

                  <div className="mt-3">
                    {todaysMoods.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleAnalyseMood}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-xs font-bold text-white shadow-md shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5 text-yellow-300" />
                        <span>Synthesize {todaysMoods.length} Recorded {todaysMoods.length === 1 ? 'Mood' : 'Moods'} Now</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-medium">
                        Log at least 1 mood on the left to activate analysis
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Card Footer Info */}
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                Single-sentence AI synthesis
              </span>
              <span>Gemini 3.8 Flash</span>
            </div>

          </div>

        </section>

      </main>
    </div>
  );
}
