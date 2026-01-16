import React, { useState, useEffect } from 'react';
import { generateQuizScript, generateQuizImage, generateQuizAudio } from './services/geminiService';
import { AppStatus, QuizSlide } from './types';
import { VideoPlayer } from './components/VideoPlayer';
import { UploadKit } from './components/UploadKit';
import { Loader2, Wand2, Youtube, AlertCircle, Music, Settings2, Volume2, Clock, Sun, User, Mic2, Gauge, Palette, LayoutTemplate, Timer, Sparkles, BookOpen, AudioWaveform, BarChart, Shuffle } from 'lucide-react';

const App = () => {
  const [topic, setTopic] = useState('Geography');
  // Replaced simple difficulty with percentage distribution
  const [diffEasy, setDiffEasy] = useState<number>(33);
  const [diffMedium, setDiffMedium] = useState<number>(33);
  const [diffHard, setDiffHard] = useState<number>(34);
  const [orderMode, setOrderMode] = useState<'Progressive' | 'Mixed'>('Progressive');
  
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [bgMusicFile, setBgMusicFile] = useState<File | null>(null);
  const [countdownSfxFile, setCountdownSfxFile] = useState<File | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [progress, setProgress] = useState('');
  const [slides, setSlides] = useState<QuizSlide[]>([]);
  const [error, setError] = useState('');

  // Customization States
  const [timerDuration, setTimerDuration] = useState<number>(5);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.6);
  const [enableSfx, setEnableSfx] = useState<boolean>(true);
  
  // Voice Settings
  const [narrator, setNarrator] = useState<string>('Fenrir');
  const [voiceStyle, setVoiceStyle] = useState<string>('');
  const [pace, setPace] = useState<string>('Normal');
  const [pitch, setPitch] = useState<string>('Medium');
  
  // Visual Settings
  const [imageStyle, setImageStyle] = useState<string>('Cinematic');
  const [layoutMode, setLayoutMode] = useState<'Cinematic' | 'Broadcast'>('Cinematic');
  const [imageQuality, setImageQuality] = useState<'Standard' | 'Premium'>('Standard');

  // Logic to calculate actual counts based on percentages
  const getCounts = () => {
      const totalPct = diffEasy + diffMedium + diffHard;
      if (totalPct === 0) return { easy: 0, medium: 0, hard: 0 };
      
      const e = Math.round((diffEasy / totalPct) * questionCount);
      const m = Math.round((diffMedium / totalPct) * questionCount);
      let h = questionCount - e - m;
      if (h < 0) h = 0; // simple fix
      return { easy: e, medium: m, hard: h };
  };

  const voiceOptions = [
      { label: 'Fenrir (Male)', value: 'Fenrir' },
      { label: 'Algieba (Male)', value: 'Puck' }, 
      { label: 'Enceladus (Male)', value: 'Charon' }, 
  ];

  const paceOptions = ['Slow', 'Normal', 'Fast', 'Very Fast'];
  const pitchOptions = ['Low', 'Medium', 'High'];
  
  const imageStyleOptions = [
      'Cinematic',
      '3D Cartoon',
      'Cyberpunk',
      'Watercolor',
      'Oil Painting'
  ];

  const topics = [
      "Geography",
      "Science",
      "Nutrition",
      "Anatomy",
      "Astronomy",
      "History",
      "General Knowledge",
      "Technology",
      "Home Gardening",
      "Math Lite",
      "Music",
      "Pets",
      "Riddles",
      "Home Cooking"
  ];

  const handleGenerate = async () => {
    if (!topic) return;
    
    try {
      setError('');
      setStatus(AppStatus.GENERATING_SCRIPT);
      setProgress('Crafting quiz questions with Gemini...');
      
      const counts = getCounts();

      // Determine model based on quality selection
      const imageModel = imageQuality === 'Premium' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

      // 1. Generate Script
      const questions = await generateQuizScript(topic, counts, orderMode);
      
      setStatus(AppStatus.GENERATING_MEDIA);
      const generatedSlides: QuizSlide[] = [];

      // Answer reveal variations
      const answerTemplates = [
        (ans: string) => `The answer is ${ans}.`,
        (ans: string) => `The answer... is ${ans}!`,
        (ans: string) => `Answer... ${ans}!`,
        (ans: string) => `And the answer is... ${ans}!`,
        (ans: string) => `Time's up! It's ${ans}!`,
        (ans: string) => `Did you guess it? The answer is ${ans}.`,
        (ans: string) => `The correct choice is... ${ans}.`,
        (ans: string) => `Here is the answer... ${ans}!`
      ];

      // 2. Generate Media for each slide
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        setProgress(`Generating assets for Question ${i + 1} of ${questions.length}...`);
        
        // Image Generation
        const bgImage = await generateQuizImage(topic, q.question, imageStyle, imageModel);
        
        await new Promise(r => setTimeout(r, 4000));

        // Question Audio
        const questionAudio = await generateQuizAudio(q.question, narrator, voiceStyle, pace, pitch);

        await new Promise(r => setTimeout(r, 4000));

        // Answer Audio
        const randomTemplate = answerTemplates[Math.floor(Math.random() * answerTemplates.length)];
        const answerText = randomTemplate(q.options[q.correctAnswerIndex]);
        
        const answerAudio = await generateQuizAudio(answerText, narrator, voiceStyle, pace, pitch);

        generatedSlides.push({
          id: `slide-${i}`,
          ...q,
          backgroundImage: bgImage,
          questionAudio: questionAudio,
          answerAudio: answerAudio
        });
        
        // Extended delay between slides (8s) to keep RPM low
        if (i < questions.length - 1) {
            await new Promise(r => setTimeout(r, 8000));
        }
      }

      setSlides(generatedSlides);
      setStatus(AppStatus.READY);
    } catch (e: any) {
      console.error(e);
      // Extract meaningful error message
      let msg = e.message || "Something went wrong during generation";
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          msg = "Quota exceeded. Please try reducing the number of questions or waiting a moment.";
      }
      setError(msg);
      setStatus(AppStatus.ERROR);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>) => {
    if (e.target.files && e.target.files[0]) {
      setter(e.target.files[0]);
    }
  };

  const counts = getCounts();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <header className="max-w-6xl mx-auto mb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Youtube size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AutoQuiz <span className="text-blue-500">Studio</span></h1>
        </div>
        <div className="text-sm text-gray-400 border border-gray-800 px-3 py-1 rounded-full">
            Powered by Gemini
        </div>
      </header>

      <main className="max-w-6xl mx-auto flex flex-col items-center">
        
        {/* Input Section */}
        {status === AppStatus.IDLE && (
          <div className="w-full max-w-xl text-center space-y-8 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 pb-2">
                    Create Viral Quiz Videos
                </h2>
                <p className="text-gray-400 text-lg">
                    Select a topic, and our AI will generate questions, voiceovers, images, and a complete video ready for YouTube Shorts or TikTok.
                </p>
             </div>

             <div className="flex flex-col gap-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800 shadow-xl">
                {/* Topic Input */}
                <div className="flex flex-col text-left gap-2">
                    <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                        <BookOpen size={16} /> Quiz Topic
                    </label>
                    <div className="relative">
                        <select 
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none"
                        >
                            {topics.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                    </div>
                </div>

                {/* Difficulty Distribution Section (New) */}
                <div className="flex flex-col text-left gap-2">
                     <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                        <BarChart size={16} /> Difficulty Balance
                     </label>
                     <div className="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800">
                         <div className="flex flex-col gap-1">
                             <label className="text-xs text-green-400 font-bold">Easy %</label>
                             <input 
                                type="number" 
                                value={diffEasy} 
                                onChange={(e) => setDiffEasy(Number(e.target.value))}
                                className="bg-gray-800 border border-gray-700 rounded p-2 text-sm text-center focus:border-green-500 outline-none"
                             />
                             <span className="text-[10px] text-gray-500 text-center">{counts.easy} Qs</span>
                         </div>
                         <div className="flex flex-col gap-1">
                             <label className="text-xs text-yellow-400 font-bold">Med %</label>
                             <input 
                                type="number" 
                                value={diffMedium} 
                                onChange={(e) => setDiffMedium(Number(e.target.value))}
                                className="bg-gray-800 border border-gray-700 rounded p-2 text-sm text-center focus:border-yellow-500 outline-none"
                             />
                             <span className="text-[10px] text-gray-500 text-center">{counts.medium} Qs</span>
                         </div>
                         <div className="flex flex-col gap-1">
                             <label className="text-xs text-red-400 font-bold">Hard %</label>
                             <input 
                                type="number" 
                                value={diffHard} 
                                onChange={(e) => setDiffHard(Number(e.target.value))}
                                className="bg-gray-800 border border-gray-700 rounded p-2 text-sm text-center focus:border-red-500 outline-none"
                             />
                             <span className="text-[10px] text-gray-500 text-center">{counts.hard} Qs</span>
                         </div>
                     </div>
                </div>

                {/* Ordering & Count */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Order Mode */}
                    <div className="flex flex-col text-left gap-2">
                         <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                            <Shuffle size={14}/> Order Mode
                         </label>
                         <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                            <button
                                onClick={() => setOrderMode('Progressive')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    orderMode === 'Progressive' 
                                    ? 'bg-blue-600 text-white shadow-md' 
                                    : 'text-gray-400 hover:text-gray-200'
                                }`}
                                title="Easy -> Medium -> Hard"
                            >
                                Progressive
                            </button>
                            <button
                                onClick={() => setOrderMode('Mixed')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    orderMode === 'Mixed' 
                                    ? 'bg-blue-600 text-white shadow-md' 
                                    : 'text-gray-400 hover:text-gray-200'
                                }`}
                                title="Randomized Order"
                            >
                                Mixed
                            </button>
                         </div>
                    </div>

                    {/* Question Count */}
                    <div className="flex flex-col text-left gap-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold text-gray-300 ml-1">Total Questions</label>
                            <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full">{questionCount}</span>
                        </div>
                        <input 
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={questionCount}
                            onChange={(e) => setQuestionCount(Number(e.target.value))}
                            className="w-full accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>

                {/* Voice & Visuals Settings */}
                <div className="border-t border-gray-800 pt-4 mt-2">
                     <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 text-left">Voice & Visuals</p>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        {/* Narrator */}
                        <div className="flex flex-col text-left gap-2">
                             <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                                <User size={14}/> Narrator
                             </label>
                             <div className="relative">
                                 <select 
                                     value={narrator}
                                     onChange={(e) => setNarrator(e.target.value)}
                                     className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm appearance-none focus:border-blue-500 outline-none"
                                 >
                                     {voiceOptions.map(opt => (
                                         <option key={opt.value} value={opt.value}>{opt.label}</option>
                                     ))}
                                 </select>
                                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                             </div>
                        </div>

                         {/* Image Style */}
                         <div className="flex flex-col text-left gap-2">
                             <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                                <Palette size={14}/> Visual Style
                             </label>
                             <div className="relative">
                                 <select 
                                     value={imageStyle}
                                     onChange={(e) => setImageStyle(e.target.value)}
                                     className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm appearance-none focus:border-blue-500 outline-none"
                                 >
                                     {imageStyleOptions.map(opt => (
                                         <option key={opt} value={opt}>{opt}</option>
                                     ))}
                                 </select>
                                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                             </div>
                        </div>
                     </div>
                     
                     {/* Layout & Quality */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        {/* Layout */}
                        <div className="flex flex-col text-left gap-2">
                             <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                                <LayoutTemplate size={14}/> Layout
                             </label>
                             <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                                <button
                                    onClick={() => setLayoutMode('Cinematic')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                        layoutMode === 'Cinematic' 
                                        ? 'bg-blue-600 text-white shadow-md' 
                                        : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    Cinematic
                                </button>
                                <button
                                    onClick={() => setLayoutMode('Broadcast')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                        layoutMode === 'Broadcast' 
                                        ? 'bg-blue-600 text-white shadow-md' 
                                        : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    Broadcast
                                </button>
                             </div>
                        </div>

                        {/* Visual Quality (New) */}
                        <div className="flex flex-col text-left gap-2">
                             <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                                <Sparkles size={14}/> Visual Quality
                             </label>
                             <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                                <button
                                    onClick={() => setImageQuality('Standard')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                        imageQuality === 'Standard' 
                                        ? 'bg-green-600 text-white shadow-md' 
                                        : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    Standard
                                </button>
                                <button
                                    onClick={() => setImageQuality('Premium')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                        imageQuality === 'Premium' 
                                        ? 'bg-purple-600 text-white shadow-md' 
                                        : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    Premium
                                </button>
                             </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
                         {/* Voice Style */}
                         <div className="flex flex-col text-left gap-2">
                             <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                                <Mic2 size={14}/> Voice Style
                             </label>
                             <input 
                                type="text"
                                value={voiceStyle}
                                onChange={(e) => setVoiceStyle(e.target.value)}
                                placeholder="e.g. Deep, Energetic"
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none placeholder:text-gray-600"
                             />
                         </div>

                         {/* Pace */}
                         <div className="flex flex-col text-left gap-2">
                             <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                                <Gauge size={14}/> Pace
                             </label>
                             <div className="relative">
                                 <select 
                                     value={pace}
                                     onChange={(e) => setPace(e.target.value)}
                                     className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm appearance-none focus:border-blue-500 outline-none"
                                 >
                                     {paceOptions.map(opt => (
                                         <option key={opt} value={opt}>{opt}</option>
                                     ))}
                                 </select>
                                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                             </div>
                        </div>

                         {/* Pitch (New) */}
                         <div className="flex flex-col text-left gap-2">
                             <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                                <AudioWaveform size={14}/> Pitch
                             </label>
                             <div className="relative">
                                 <select 
                                     value={pitch}
                                     onChange={(e) => setPitch(e.target.value)}
                                     className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm appearance-none focus:border-blue-500 outline-none"
                                 >
                                     {pitchOptions.map(opt => (
                                         <option key={opt} value={opt}>{opt}</option>
                                     ))}
                                 </select>
                                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                             </div>
                        </div>
                     </div>
                </div>

                {/* Video Settings */}
                <div className="border-t border-gray-800 pt-4 mt-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 text-left">Video Settings</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Timer Duration */}
                        <div className="flex flex-col text-left gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2"><Clock size={14}/> Thinking Time</label>
                                <span className="text-xs text-gray-400">{timerDuration}s</span>
                            </div>
                            <input 
                                type="range"
                                min="3"
                                max="15"
                                step="1"
                                value={timerDuration}
                                onChange={(e) => setTimerDuration(Number(e.target.value))}
                                className="w-full accent-purple-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Overlay Opacity */}
                        <div className="flex flex-col text-left gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2"><Sun size={14}/> Background Dim</label>
                                <span className="text-xs text-gray-400">{Math.round(overlayOpacity * 100)}%</span>
                            </div>
                            <input 
                                type="range"
                                min="0.1"
                                max="0.9"
                                step="0.1"
                                value={overlayOpacity}
                                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                                className="w-full accent-purple-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                    
                    {/* Toggles */}
                    <div className="flex items-center justify-between mt-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-10 h-5 rounded-full relative transition-colors ${enableSfx ? 'bg-blue-600' : 'bg-gray-700'}`} onClick={() => setEnableSfx(!enableSfx)}>
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${enableSfx ? 'left-6' : 'left-1'}`}></div>
                            </div>
                            <span className="text-sm font-medium text-gray-300 flex items-center gap-2"><Volume2 size={14}/> Countdown SFX</span>
                        </label>
                    </div>
                </div>

                {/* Audio Uploads */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* Background Music */}
                    <div className="flex flex-col text-left gap-2">
                        <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                            <Music size={16} /> Background Music
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/50 hover:bg-gray-900 cursor-pointer transition-colors group h-full">
                            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                                <Settings2 size={20} className="text-gray-400 group-hover:text-white" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-medium text-gray-200 truncate">
                                    {bgMusicFile ? bgMusicFile.name : "Upload BGM"}
                                </p>
                            </div>
                            <input 
                                type="file" 
                                accept="audio/*"
                                onChange={(e) => handleFileChange(e, setBgMusicFile)}
                                className="hidden" 
                            />
                            {bgMusicFile && (
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setBgMusicFile(null);
                                    }}
                                    className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-400"
                                >
                                    &times;
                                </button>
                            )}
                        </label>
                    </div>

                    {/* Countdown SFX */}
                    <div className="flex flex-col text-left gap-2">
                        <label className="text-sm font-semibold text-gray-300 ml-1 flex items-center gap-2">
                            <Timer size={16} /> Countdown SFX
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/50 hover:bg-gray-900 cursor-pointer transition-colors group h-full">
                            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                                <Volume2 size={20} className="text-gray-400 group-hover:text-white" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-medium text-gray-200 truncate">
                                    {countdownSfxFile ? countdownSfxFile.name : "Upload Tick"}
                                </p>
                            </div>
                            <input 
                                type="file" 
                                accept="audio/*"
                                onChange={(e) => handleFileChange(e, setCountdownSfxFile)}
                                className="hidden" 
                            />
                            {countdownSfxFile && (
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setCountdownSfxFile(null);
                                    }}
                                    className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-400"
                                >
                                    &times;
                                </button>
                            )}
                        </label>
                    </div>
                </div>

                <button 
                    onClick={handleGenerate}
                    disabled={!topic.trim()}
                    className="w-full py-4 mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold text-lg rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                >
                    <Wand2 size={20} />
                    Generate Video
                </button>
             </div>
          </div>
        )}

        {/* Loading State */}
        {(status === AppStatus.GENERATING_SCRIPT || status === AppStatus.GENERATING_MEDIA) && (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 text-center animate-in fade-in duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                    <Loader2 size={48} className="text-blue-500 animate-spin relative z-10" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-white">Creating your video...</h3>
                    <p className="text-gray-400">{progress}</p>
                </div>
            </div>
        )}

        {/* Error State */}
        {status === AppStatus.ERROR && (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 text-center animate-in fade-in">
                <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center">
                    <AlertCircle size={32} className="text-red-500" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h3 className="text-2xl font-bold text-white">Generation Failed</h3>
                    <p className="text-red-400">{error}</p>
                </div>
                <button 
                    onClick={() => setStatus(AppStatus.IDLE)}
                    className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
                >
                    Try Again
                </button>
            </div>
        )}

        {/* Player State */}
        {status === AppStatus.READY && (
            <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex items-center justify-between w-full max-w-4xl mb-4">
                     <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold">{topic} Quiz</h2>
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 border border-gray-700">{orderMode} Mode</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-900 text-blue-300 border border-blue-800">{slides.length} Questions</span>
                     </div>
                     <button 
                        onClick={() => setStatus(AppStatus.IDLE)}
                        className="text-sm text-gray-400 hover:text-white transition-colors"
                     >
                        Create New
                     </button>
                </div>
                <VideoPlayer 
                    slides={slides} 
                    bgMusicFile={bgMusicFile} 
                    countdownSfxFile={countdownSfxFile}
                    timerDuration={timerDuration}
                    overlayOpacity={overlayOpacity}
                    enableSfx={enableSfx}
                    layoutMode={layoutMode}
                />
                
                <UploadKit topic={topic} slideCount={slides.length} />

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-6xl">
                    {slides.map((slide, idx) => (
                        <div key={slide.id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex gap-4 items-start hover:border-blue-500/30 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
                                {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-1">
                                    <p className="font-medium text-sm text-gray-200 truncate w-3/4">{slide.question}</p>
                                    {slide.difficulty && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                            slide.difficulty === 'Easy' ? 'bg-green-900/30 border-green-800 text-green-400' :
                                            slide.difficulty === 'Medium' ? 'bg-yellow-900/30 border-yellow-800 text-yellow-400' :
                                            'bg-red-900/30 border-red-800 text-red-400'
                                        }`}>
                                            {slide.difficulty.substring(0,1)}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Answer: {slide.options[slide.correctAnswerIndex]}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;