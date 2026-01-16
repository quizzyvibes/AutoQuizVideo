import React, { useRef, useEffect, useState, useCallback } from 'react';
import { QuizSlide } from '../types';
import { Play, Pause, Download, RotateCcw, Volume2, VolumeX } from 'lucide-react';

interface VideoPlayerProps {
  slides: QuizSlide[];
  bgMusicFile: File | null;
  countdownSfxFile: File | null;
  timerDuration: number;
  overlayOpacity: number;
  enableSfx: boolean;
  autoPlay?: boolean;
  layoutMode: 'Cinematic' | 'Broadcast';
}

// Visual Constants
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const TRANSITION_DURATION = 500; // 500ms cross-fade

interface SlideTiming {
    start: number;
    questionAudioDuration: number;
    thinkingStart: number;
    revealStart: number;
    answerAudioDuration: number;
    end: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
    slides, 
    bgMusicFile, 
    countdownSfxFile,
    timerDuration, 
    overlayOpacity,
    enableSfx,
    autoPlay = false,
    layoutMode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); 
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // Timing State
  const [timings, setTimings] = useState<SlideTiming[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);

  // Asset References
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sfxGainRef = useRef<GainNode | null>(null);
  const voiceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const bgMusicNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Buffers
  const questionBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const answerBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const bgMusicBufferRef = useRef<AudioBuffer | null>(null);
  const countdownSfxBufferRef = useRef<AudioBuffer | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  // Loop State
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Track playback state
  const currentAudioTrackRef = useRef<{slideIndex: number, type: 'question' | 'answer'} | null>(null);
  const lastTickTimeRef = useRef<number>(-1); 

  // 1. Initialize Audio Context & Preload Assets
  useEffect(() => {
    let cancelled = false;

    const prepareAssets = async () => {
      setIsReady(false);
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      audioContextRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      const sfxGain = ctx.createGain();
      sfxGain.connect(masterGain);
      sfxGainRef.current = sfxGain;

      const dest = ctx.createMediaStreamDestination();
      masterGain.connect(dest);
      destRef.current = dest;

      // 1. Decode Background Music
      if (bgMusicFile) {
        try {
          const arrayBuffer = await bgMusicFile.arrayBuffer();
          bgMusicBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
          console.error("Failed to decode background music", e);
        }
      }

      // 2. Decode Countdown SFX
      if (countdownSfxFile) {
        try {
          const arrayBuffer = await countdownSfxFile.arrayBuffer();
          countdownSfxBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
          console.error("Failed to decode countdown sfx", e);
        }
      } else {
        countdownSfxBufferRef.current = null;
      }

      // 3. Preload Images
      const imagePromises = slides.map(slide => {
          if (!slide.backgroundImage) return Promise.resolve();
          return new Promise<void>((resolve) => {
              const img = new Image();
              img.src = slide.backgroundImage!;
              img.onload = () => {
                  if (!cancelled) imagesRef.current.set(slide.id, img);
                  resolve();
              };
              img.onerror = () => resolve(); 
          });
      });
      await Promise.all(imagePromises);

      // 4. Decode Voiceovers and Calculate Timings
      const newTimings: SlideTiming[] = [];
      let accumulatedTime = 0;

      const decodePCM = (arrayBuffer: ArrayBuffer) => {
        try {
            const pcmData = new Int16Array(arrayBuffer);
            const buffer = ctx.createBuffer(1, pcmData.length, 24000);
            const channel = buffer.getChannelData(0);
            for (let j = 0; j < pcmData.length; j++) {
                channel[j] = pcmData[j] / 32768.0;
            }
            return buffer;
        } catch(e) {
            console.error("PCM Decode error", e);
            return null;
        }
      };

      for (let i = 0; i < slides.length; i++) {
          if (cancelled) return;
          const slide = slides[i];
          
          let qDur = 3000;
          let aDur = 2000;

          if (slide.questionAudio) {
              const buffer = decodePCM(slide.questionAudio);
              if (buffer) {
                  questionBuffersRef.current.set(i, buffer);
                  qDur = buffer.duration * 1000;
              }
          }

          if (slide.answerAudio) {
              const buffer = decodePCM(slide.answerAudio);
              if (buffer) {
                  answerBuffersRef.current.set(i, buffer);
                  aDur = buffer.duration * 1000;
              }
          }

          const thinkingDurMs = timerDuration * 1000;
          const revealDurMs = Math.max(2000, aDur + 1000);
          
          newTimings.push({
              start: accumulatedTime,
              questionAudioDuration: qDur,
              thinkingStart: accumulatedTime + qDur + 500, // 500ms pause after reading
              revealStart: accumulatedTime + qDur + 500 + thinkingDurMs, 
              answerAudioDuration: aDur,
              end: accumulatedTime + qDur + 500 + thinkingDurMs + revealDurMs
          });

          accumulatedTime += (qDur + 500 + thinkingDurMs + revealDurMs);
      }

      if (!cancelled) {
          setTimings(newTimings);
          setTotalDuration(accumulatedTime);
          setIsReady(true);
      }
    };

    prepareAssets();

    return () => {
        cancelled = true;
        audioContextRef.current?.close();
    };
  }, [slides, bgMusicFile, countdownSfxFile, timerDuration]);


  // 2. Audio Playback Logic
  const startBgMusic = (startTimeOffset: number) => {
    if (!audioContextRef.current || !bgMusicBufferRef.current || !masterGainRef.current) return;
    
    if (bgMusicNodeRef.current) {
        try { bgMusicNodeRef.current.stop(); } catch(e){}
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = bgMusicBufferRef.current;
    source.loop = true;
    
    const bgGain = audioContextRef.current.createGain();
    bgGain.gain.value = 0.15; 
    
    source.connect(bgGain);
    bgGain.connect(masterGainRef.current);
    
    const duration = bgMusicBufferRef.current.duration;
    const offset = startTimeOffset % duration;
    
    source.start(0, offset);
    bgMusicNodeRef.current = source;
  };

  const playVoiceTrack = (slideIndex: number, type: 'question' | 'answer', offsetMs: number = 0) => {
      if (!audioContextRef.current || !masterGainRef.current) return;
      
      const bufferMap = type === 'question' ? questionBuffersRef.current : answerBuffersRef.current;
      const buffer = bufferMap.get(slideIndex);
      if (!buffer) return;

      if (voiceNodeRef.current) {
          try { voiceNodeRef.current.stop(); } catch(e){}
      }

      if (offsetMs / 1000 < buffer.duration) {
          const source = audioContextRef.current.createBufferSource();
          source.buffer = buffer;
          
          const gain = audioContextRef.current.createGain();
          gain.gain.value = 1.0;
          
          source.connect(gain);
          gain.connect(masterGainRef.current);
          
          source.start(0, offsetMs / 1000);
          voiceNodeRef.current = source;
          currentAudioTrackRef.current = { slideIndex, type };
      }
  };

  const playTickSound = (type: 'tick' | 'end') => {
      if (!audioContextRef.current || !sfxGainRef.current || !enableSfx) return;
      const ctx = audioContextRef.current;
      
      // ONLY play if custom SFX file is provided for 'tick'
      if (type === 'tick' && countdownSfxBufferRef.current) {
          const source = ctx.createBufferSource();
          source.buffer = countdownSfxBufferRef.current;
          source.connect(sfxGainRef.current);
          source.start();
          return;
      }
      
      // Default oscillators removed as per request
  };


  // 3. Rendering Helpers
  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, useShadow = true) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    if (useShadow) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 8;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
    }

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        if (useShadow) ctx.strokeText(line, x, currentY); 
        ctx.fillText(line, x, currentY);   
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (useShadow) ctx.strokeText(line, x, currentY);
    ctx.fillText(line, x, currentY);
    ctx.shadowBlur = 0;
    return currentY + lineHeight;
  };

  // --- LAYOUT 1: CINEMATIC ---
  const drawCinematicLayout = (ctx: CanvasRenderingContext2D, slideIndex: number, localTime: number, alpha: number, slide: QuizSlide, timing: SlideTiming) => {
      const isThinking = localTime >= (timing.thinkingStart - timing.start) && localTime < (timing.revealStart - timing.start);
      const isRevealed = localTime >= (timing.revealStart - timing.start);
      
      ctx.save();
      ctx.globalAlpha = alpha;

      // Draw Background
      const bgImg = imagesRef.current.get(slide.id);
      if (bgImg) {
          const scale = Math.max(WIDTH / bgImg.width, HEIGHT / bgImg.height);
          const x = (WIDTH / 2) - (bgImg.width / 2) * scale;
          const y = (HEIGHT / 2) - (bgImg.height / 2) * scale;
          ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
      }

      // Overlay
      ctx.fillStyle = `rgba(0, 0, 0, ${overlayOpacity})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Question
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 64px Inter';
      wrapText(ctx, slide.question, WIDTH / 2, 120, WIDTH - 200, 80);

      // Options
      const optYStart = 420;
      const optHeight = 110;
      const optGap = 35;
      const optWidth = (WIDTH - 400) / 2;
      const optX = 200; 
      
      ctx.font = '45px Inter';
      ctx.textBaseline = 'middle';

      slide.options.forEach((opt, idx) => {
        const yPos = optYStart + (idx * (optHeight + optGap));
        let bgColor = 'rgba(255, 255, 255, 0.1)';
        let strokeColor = 'rgba(255, 255, 255, 0.2)';
        let textColor = '#e2e8f0';

        if (isRevealed) {
            if (idx === slide.correctAnswerIndex) {
                bgColor = 'rgba(34, 197, 94, 0.9)'; 
                strokeColor = '#22c55e';
                textColor = 'white';
            } else {
                bgColor = 'rgba(255, 255, 255, 0.05)';
                textColor = 'rgba(255, 255, 255, 0.3)';
            }
        }

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, optX, yPos, optWidth, optHeight, 24);
        
        // Marker
        const markerX = optX + 45;
        const markerY = yPos + optHeight / 2;
        
        ctx.beginPath();
        ctx.arc(markerX, markerY, 24, 0, Math.PI * 2);
        ctx.fillStyle = isRevealed && idx === slide.correctAnswerIndex ? '#facc15' : '#3b82f6';
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.font = 'bold 28px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String.fromCharCode(65 + idx), markerX, markerY + 1);

        // Text
        ctx.fillStyle = textColor;
        ctx.font = '45px Inter';
        ctx.textAlign = 'left';
        
        const textX = markerX + 40;
        const textStr = opt;
        
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 4;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeText(textStr, textX, markerY);
        ctx.fillText(textStr, textX, markerY);
        ctx.shadowBlur = 0;
      });

      // Timer Logic
      let timeLeft = 0;
      let progress = 0;
      let revealProgress = 0;

      if (isThinking) {
            const thinkingElapsed = localTime - (timing.thinkingStart - timing.start);
            timeLeft = Math.max(0, Math.ceil(timerDuration - (thinkingElapsed / 1000)));
            progress = thinkingElapsed / (timerDuration * 1000);
      } else if (isRevealed) {
          timeLeft = 0;
          progress = 1;
          const revealElapsed = localTime - (timing.revealStart - timing.start);
          revealProgress = Math.min(1, revealElapsed / 500); 
      } else {
            timeLeft = timerDuration;
            progress = 0;
      }
      
      const timerBaseY = 692;
      const timerY = timerBaseY - (revealProgress * 242); 
      const timerX = 1440;
      const radius = 90;

      ctx.save();
      ctx.shadowColor = timeLeft <= 3 && !isRevealed ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)';
      ctx.shadowBlur = 20;

      // Rings
      ctx.beginPath();
      ctx.arc(timerX, timerY, radius, 0, 2 * Math.PI);
      ctx.lineWidth = 16;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.stroke();

      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + (1 - progress) * (2 * Math.PI);
      
      ctx.beginPath();
      ctx.arc(timerX, timerY, radius, startAngle, endAngle, false);
      ctx.lineWidth = 16;
      ctx.strokeStyle = timeLeft <= 3 && !isRevealed ? '#ef4444' : '#3b82f6';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      if (revealProgress < 1) {
          ctx.globalAlpha = alpha * (1 - revealProgress);
          ctx.fillStyle = 'white';
          ctx.font = 'bold 80px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timeLeft.toString(), timerX, timerY + 6);
          ctx.globalAlpha = alpha;
      }

      if (revealProgress > 0) {
          ctx.globalAlpha = alpha * revealProgress;
          ctx.fillStyle = '#22c55e';
          ctx.font = 'bold 80px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("✓", timerX, timerY + 10);
          
          const answerText = slide.options[slide.correctAnswerIndex];
          ctx.fillStyle = 'white';
          ctx.font = 'bold 70px Inter';
          ctx.shadowColor = "rgba(0,0,0,1)";
          ctx.shadowBlur = 10;
          const textY = timerY + 140; 
          ctx.fillText(answerText, timerX, textY);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = alpha;
      }
      
      ctx.restore();
  };


  // --- LAYOUT 2: BROADCAST (UPDATED) ---
  const drawBroadcastLayout = (ctx: CanvasRenderingContext2D, slideIndex: number, localTime: number, alpha: number, slide: QuizSlide, timing: SlideTiming) => {
      const isThinking = localTime >= (timing.thinkingStart - timing.start) && localTime < (timing.revealStart - timing.start);
      const isRevealed = localTime >= (timing.revealStart - timing.start);
      
      ctx.save();
      ctx.globalAlpha = alpha;

      // 1. Top Bar (Dark Blue/Black)
      ctx.fillStyle = '#020617'; 
      ctx.fillRect(0, 0, WIDTH, 80);
      
      // Question Counter
      ctx.fillStyle = 'white';
      ctx.font = 'bold 40px Inter'; 
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Question ${slideIndex + 1}/${slides.length}`, 40, 40);

      // Add Difficulty Label in Top Bar
      if (slide.difficulty) {
        let diffColor = '#22c55e';
        if (slide.difficulty === 'Medium') diffColor = '#eab308';
        if (slide.difficulty === 'Hard') diffColor = '#ef4444';
        
        ctx.fillStyle = diffColor;
        ctx.font = 'bold 30px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(slide.difficulty.toUpperCase(), WIDTH - 40, 40);
      }

      // 2. Question Banner (Red)
      const bannerHeight = 220; 
      ctx.fillStyle = '#cc0000'; 
      ctx.fillRect(0, 80, WIDTH, bannerHeight);

      // Question Text (Standard Wrap - No Typewriter)
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 64px Inter';
      
      wrapText(ctx, slide.question, WIDTH / 2, 80 + (bannerHeight / 2) - 30, WIDTH - 200, 80, false);

      // 3. Main Background (Blue Gradient)
      const contentY = 80 + bannerHeight; // 300
      const contentHeight = HEIGHT - contentY;
      const grad = ctx.createLinearGradient(0, contentY, 0, HEIGHT);
      grad.addColorStop(0, '#000044'); 
      grad.addColorStop(1, '#000088'); 
      ctx.fillStyle = grad;
      ctx.fillRect(0, contentY, WIDTH, contentHeight);

      // 4. Split Layout Configuration
      const optW = 860;
      const optH = 120;
      const optGap = 30; 
      const optX = 60; // Left Margin
      const optStartY = contentY + 80; 
      
      // -- RIGHT SIDE: IMAGE --
      const imgW = 860;
      // Reduce height slightly to avoid overlap with bottom progress bar if pushed down
      const imgH = 530; 
      // Image Y: Start 60px lower than options for visual balance (shifted down)
      const imgY = optStartY + 60;
      const imgX = 60 + 860 + 80; // Left + OptWidth + Gap

      // Image Container
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, imgW, imgH, 30);
      ctx.clip(); 

      const bgImg = imagesRef.current.get(slide.id);
      if (bgImg) {
        const scale = Math.max(imgW / bgImg.width, imgH / bgImg.height);
        const x = imgX + (imgW / 2) - (bgImg.width / 2) * scale;
        const y = imgY + (imgH / 2) - (bgImg.height / 2) * scale;
        ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(imgX, imgY, imgW, imgH);
      }
      ctx.restore();

      // Thicker Border
      ctx.lineWidth = 20; 
      ctx.strokeStyle = 'white';
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, imgW, imgH, 30);
      ctx.stroke();

      // -- LEFT SIDE: OPTIONS --
      const optionsSequenceStart = timing.questionAudioDuration; 
      
      slide.options.forEach((opt, idx) => {
          const y = optStartY + (idx * (optH + optGap));

          const isCorrect = idx === slide.correctAnswerIndex;
          const showReveal = isRevealed && isCorrect;

          // Container - Static
          ctx.beginPath();
          ctx.roundRect(optX, y, optW, optH, 60); 
          
          if (showReveal) {
              ctx.fillStyle = '#22c55e'; // Green Background for correct answer
          } else {
              ctx.fillStyle = 'white'; // White for others
          }
          
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;
          ctx.fill();
          ctx.shadowBlur = 0; 
          ctx.shadowOffsetY = 0;

          // Border for reveal
          if (showReveal) {
              ctx.lineWidth = 6;
              ctx.strokeStyle = '#166534'; // Darker green border
              ctx.stroke();
          }

          // Animation Logic for TEXT Only
          const myStart = optionsSequenceStart + (idx * 1000); // 1 sec interval
          const myLocalTime = localTime - myStart;
          let showText = false;
          let textAlpha = 1;
          
          if (myLocalTime >= 0) {
              showText = true;
              textAlpha = Math.min(1, myLocalTime / 300); // 300ms fade in
          }
          if (isRevealed) {
              showText = true;
              textAlpha = 1;
          }

          if (showText) {
             ctx.save();
             ctx.globalAlpha = alpha * textAlpha;

             // Badge
             const badgeSize = 80;
             const badgeX = optX + 15;
             const badgeY = y + (optH - badgeSize) / 2;
             
             ctx.beginPath();
             ctx.arc(badgeX + badgeSize/2, badgeY + badgeSize/2, badgeSize/2, 0, Math.PI * 2);
             
             if (showReveal) {
                 ctx.fillStyle = 'white'; // White badge on green bg
             } else {
                 ctx.fillStyle = '#ef4444'; // Red badge on white bg
             }
             ctx.fill();

             if (showReveal) {
                 ctx.fillStyle = '#22c55e'; // Green text inside badge
             } else {
                 ctx.fillStyle = 'white'; // White text inside badge
             }
             ctx.font = 'bold 40px Inter';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillText(String.fromCharCode(65 + idx), badgeX + badgeSize/2, badgeY + badgeSize/2 + 2);

             // Option Text
             if (showReveal) {
                 ctx.fillStyle = 'white'; // White text on green bg
             } else {
                 ctx.fillStyle = 'black'; // Black text on white bg
             }
             
             ctx.font = 'bold 64px Inter';
             ctx.textAlign = 'left';
             ctx.fillText(opt, badgeX + badgeSize + 30, y + optH/2);
             
             ctx.restore();
          }
      });

      // -- BOTTOM LEFT: TIMER PROGRESS BAR --
      const barX = 60;
      const barY = 980; 
      const barW = 860;
      const barH = 60; 
      const barRadius = 30; 

      let progress = 0;
      if (isThinking) {
            const thinkingElapsed = localTime - (timing.thinkingStart - timing.start);
            progress = Math.min(1, thinkingElapsed / (timerDuration * 1000));
      } else if (isRevealed) {
            progress = 1;
      } else {
            progress = 0;
      }

      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, barRadius);
      ctx.fillStyle = 'white';
      ctx.fill();

      if (progress < 1 || isRevealed) {
          const remainingPct = 1 - progress; 
          // Keep shape valid
          const drawW = (barW) * remainingPct;
          if (drawW > barRadius * 2) {
              ctx.beginPath();
              // Inner bar padding of 5px
              ctx.roundRect(barX + 5, barY + 5, drawW - 10, barH - 10, barRadius - 5);
              
              // Color Logic: Green (>60%) -> Yellow (30-60%) -> Red (<30%)
              let barColor = '#22c55e'; // Green
              if (remainingPct < 0.3) {
                  barColor = '#ef4444'; // Red
              } else if (remainingPct < 0.6) {
                  barColor = '#eab308'; // Yellow
              }

              ctx.fillStyle = barColor;
              ctx.fill();
          }
      }

      ctx.restore();
  };

  const drawSlideState = (ctx: CanvasRenderingContext2D, slideIndex: number, localTime: number, alpha: number) => {
      const slide = slides[slideIndex];
      const timing = timings[slideIndex];
      if (!slide || !timing) return;

      const isThinking = localTime >= (timing.thinkingStart - timing.start) && localTime < (timing.revealStart - timing.start);
      const isRevealed = localTime >= (timing.revealStart - timing.start);
      const thinkingElapsed = localTime - (timing.thinkingStart - timing.start);
      const timeLeft = Math.max(0, Math.ceil(timerDuration - (thinkingElapsed / 1000)));

      if (isPlaying && isThinking && timeLeft <= timerDuration && timeLeft > 0 && timeLeft !== lastTickTimeRef.current) {
         playTickSound('tick');
         lastTickTimeRef.current = timeLeft;
      }
      if (isRevealed && lastTickTimeRef.current !== -99) {
          if (isPlaying) playTickSound('end');
          lastTickTimeRef.current = -99;
      }

      if (layoutMode === 'Broadcast') {
          drawBroadcastLayout(ctx, slideIndex, localTime, alpha, slide, timing);
      } else {
          drawCinematicLayout(ctx, slideIndex, localTime, alpha, slide, timing);
      }
  };

  const renderFrame = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !timings.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000000'; 
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    let activeSlideIndex = -1;

    for (let i = 0; i < timings.length; i++) {
        if (time >= timings[i].start && time < timings[i].end) {
            activeSlideIndex = i;
            break;
        }
    }

    if (activeSlideIndex === -1 && time >= totalDuration) {
         ctx.fillStyle = 'white';
         ctx.font = '60px Inter';
         ctx.textAlign = 'center';
         ctx.fillText("Thanks for watching!", WIDTH / 2, HEIGHT / 2);
         return;
    }

    if (activeSlideIndex !== -1) {
        const slideStart = timings[activeSlideIndex].start;
        const localTime = time - slideStart;

        if (localTime < TRANSITION_DURATION && activeSlideIndex > 0) {
            const prevIndex = activeSlideIndex - 1;
            const prevTiming = timings[prevIndex];
            const prevLocalTime = (time - prevTiming.start); 
            drawSlideState(ctx, prevIndex, prevLocalTime, 1.0);
            const alpha = localTime / TRANSITION_DURATION;
            drawSlideState(ctx, activeSlideIndex, localTime, alpha);
        } else {
            drawSlideState(ctx, activeSlideIndex, localTime, 1.0);
        }
    }

    if (layoutMode === 'Cinematic') {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(0, 0, WIDTH, 8); 
        const grad = ctx.createLinearGradient(0, 0, WIDTH, 0);
        grad.addColorStop(0, '#3b82f6');
        grad.addColorStop(1, '#8b5cf6');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, (time / totalDuration) * WIDTH, 8);
    }

  }, [slides, timings, totalDuration, overlayOpacity, timerDuration, isPlaying, layoutMode]);


  // 4. Animation Loop
  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    
    if (isPlaying) {
        const delta = timestamp - previousTimeRef.current;
        setCurrentTime(prev => {
            const next = prev + delta;
            
            if (next >= totalDuration) {
                setIsPlaying(false);
                if (bgMusicNodeRef.current) { try { bgMusicNodeRef.current.stop(); } catch(e){} }
                return totalDuration;
            }

            // Audio Sync Logic
            let activeSlideIdx = -1;
            let slideTiming: SlideTiming | null = null;
            
            for (let i = 0; i < timings.length; i++) {
                if (next >= timings[i].start && next < timings[i].end) {
                    activeSlideIdx = i;
                    slideTiming = timings[i];
                    break;
                }
            }
            
            if (activeSlideIdx !== -1 && slideTiming) {
                const isReading = next < slideTiming.thinkingStart;
                const isThinking = next >= slideTiming.thinkingStart && next < slideTiming.revealStart;
                const isRevealing = next >= slideTiming.revealStart;

                if (isReading) {
                    if (currentAudioTrackRef.current?.slideIndex !== activeSlideIdx || currentAudioTrackRef.current?.type !== 'question') {
                        lastTickTimeRef.current = -1; 
                        playVoiceTrack(activeSlideIdx, 'question', next - slideTiming.start);
                    }
                } else if (isRevealing) {
                    if (currentAudioTrackRef.current?.slideIndex !== activeSlideIdx || currentAudioTrackRef.current?.type !== 'answer') {
                        playVoiceTrack(activeSlideIdx, 'answer', next - slideTiming.revealStart);
                    }
                }
            }
            
            return next;
        });
    }
    previousTimeRef.current = timestamp;
    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, totalDuration, timings]); 

  // Initial Draw
  useEffect(() => {
    if (isReady && timings.length > 0) {
        renderFrame(currentTime);
    }
  }, [currentTime, renderFrame, isReady, timings, layoutMode]);

  useEffect(() => {
      requestRef.current = requestAnimationFrame(animate);
      return () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
  }, [animate]);


  // Controls
  const togglePlay = async () => {
    if (!isPlaying) {
        if (audioContextRef.current?.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        setIsPlaying(true);
        previousTimeRef.current = performance.now();
        startBgMusic(currentTime / 1000);
        currentAudioTrackRef.current = null;
    } else {
        setIsPlaying(false);
        if (bgMusicNodeRef.current) { try{ bgMusicNodeRef.current.stop(); }catch(e){} }
        if (voiceNodeRef.current) { try{ voiceNodeRef.current.stop(); }catch(e){} }
        currentAudioTrackRef.current = null;
    }
  };

  const reset = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      currentAudioTrackRef.current = null;
      lastTickTimeRef.current = -1;
      
      if (bgMusicNodeRef.current) { try{ bgMusicNodeRef.current.stop(); }catch(e){} }
      if (voiceNodeRef.current) { try{ voiceNodeRef.current.stop(); }catch(e){} }
      
      renderFrame(0);
  };

  const startRecording = async () => {
    if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
    }

    const canvas = canvasRef.current;
    const dest = destRef.current;
    if (!canvas || !dest) return;

    const canvasStream = canvas.captureStream(FPS);
    const audioTrack = dest.stream.getAudioTracks()[0];
    if (audioTrack) canvasStream.addTrack(audioTrack);
    
    const recorder = new MediaRecorder(canvasStream, { 
        mimeType: 'video/webm; codecs=vp9,opus',
        videoBitsPerSecond: 8000000 
    });
    
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quiz-video-export.webm';
        a.click();
        setIsRecording(false);
    };

    recorder.start();
    setIsRecording(true);
    reset();
    setTimeout(() => togglePlay(), 200);
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          togglePlay();
      }
  };

  const toggleMute = () => {
      if (masterGainRef.current) {
          masterGainRef.current.gain.value = isMuted ? 1 : 0;
          setIsMuted(!isMuted);
      }
  };

  if (!isReady) {
      return (
          <div className="w-full max-w-4xl aspect-video bg-gray-900 rounded-lg flex items-center justify-center border border-gray-800">
              <p className="text-blue-400 animate-pulse">Initializing Audio Engine & Preloading Assets...</p>
          </div>
      );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative rounded-lg overflow-hidden shadow-2xl border border-gray-700 bg-black aspect-video w-full max-w-4xl group">
         <canvas 
            ref={canvasRef} 
            width={WIDTH} 
            height={HEIGHT} 
            className="w-full h-full object-contain"
         />
      </div>

      <div className="flex items-center gap-6 bg-gray-800 p-4 rounded-xl border border-gray-700 w-full max-w-4xl justify-between shadow-lg">
          <div className="flex items-center gap-3">
              <button 
                onClick={togglePlay}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors text-white shadow-lg shadow-blue-900/40"
              >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" ml-1 />}
              </button>
              
              <button onClick={reset} className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-white">
                  <RotateCcw size={20} />
              </button>

              <button onClick={toggleMute} className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-white">
                 {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>

              <div className="h-8 w-px bg-gray-600 mx-2"></div>

              <div className="text-sm font-mono text-gray-400 min-w-[100px]">
                  {Math.floor(currentTime / 1000)}s <span className="text-gray-600">/</span> {Math.floor(totalDuration / 1000)}s
              </div>
          </div>

          <div className="flex items-center gap-4">
             {isRecording ? (
                 <button 
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold animate-pulse shadow-lg shadow-red-900/40"
                 >
                     <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                     Stop Recording
                 </button>
             ) : (
                 <button 
                    onClick={startRecording}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg shadow-green-900/20 transition-all hover:translate-y-px"
                 >
                     <Download size={20} />
                     Export Video
                 </button>
             )}
          </div>
      </div>
      
      <input 
        type="range" 
        min="0" 
        max={totalDuration} 
        value={currentTime} 
        onChange={(e) => {
            const t = Number(e.target.value);
            setCurrentTime(t);
            // Force re-check of audio sync
            currentAudioTrackRef.current = null;
            if (!isPlaying) renderFrame(t);
        }}
        className="w-full max-w-4xl accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
};
