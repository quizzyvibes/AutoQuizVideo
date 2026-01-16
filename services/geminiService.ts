import { GoogleGenAI, Type, Modality } from "@google/genai";
import { QuizQuestion } from "../types";

// Safely retrieve API key to prevent runtime crashes in browsers
const getApiKey = (): string => {
  try {
    // 1. Try Vite environment variable (Standard for Vercel + Vite)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
    // 2. Try Standard process.env (Standard for Create React App / Next.js)
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.VITE_API_KEY) return process.env.VITE_API_KEY;
      if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
      if (process.env.NEXT_PUBLIC_API_KEY) return process.env.NEXT_PUBLIC_API_KEY;
      // Note: 'API_KEY' usually returns undefined in browsers for security, but we check it just in case.
      if (process.env.API_KEY) return process.env.API_KEY;
    }
  } catch (e) {
    console.warn("Failed to retrieve API key", e);
  }
  return "";
};

const API_KEY = getApiKey();

const getClient = () => {
  if (!API_KEY) {
    throw new Error("API Key is missing. In Vercel Settings > Environment Variables, please rename 'API_KEY' to 'VITE_API_KEY' and redeploy.");
  }
  return new GoogleGenAI({ apiKey: API_KEY });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// History Management for Anti-Repetition
const HISTORY_KEY = 'autoquiz_question_history';
const MAX_HISTORY = 100;

const getQuestionHistory = (): string[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

const saveQuestionHistory = (newQuestions: string[]) => {
  try {
    const current = getQuestionHistory();
    // Combine, remove duplicates, keep only recent 100
    const updated = [...newQuestions, ...current].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to save history", e);
  }
};


// Generic retry wrapper for API calls
async function withRetry<T>(operation: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (e: any) {
      lastError = e;
      
      // Detailed error checking for Gemini API responses
      const errorMessage = e.message || JSON.stringify(e);
      const isRateLimit = 
        e.status === 429 || 
        e.status === 'RESOURCE_EXHAUSTED' || 
        errorMessage.includes('429') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('Quota exceeded');
      
      if (isRateLimit) {
        // If it's a rate limit, wait significantly longer (exponential backoff starting at 6s)
        const delay = 6000 * Math.pow(2, i);
        console.warn(`Rate limit hit. Retrying in ${delay/1000}s... (Attempt ${i + 1}/${retries})`);
        await wait(delay);
      } else {
        // For other errors, shorter backoff
        const delay = baseDelay * Math.pow(2, i);
        console.warn(`API Error. Retrying in ${delay/1000}s... (Attempt ${i + 1}/${retries})`, errorMessage);
        await wait(delay);
      }
    }
  }
  throw lastError;
}

export const generateQuizScript = async (
    topic: string, 
    distribution: { easy: number, medium: number, hard: number },
    orderMode: 'Progressive' | 'Mixed'
): Promise<QuizQuestion[]> => {
  return withRetry(async () => {
    const ai = getClient();
    
    const totalCount = distribution.easy + distribution.medium + distribution.hard;
    const history = getQuestionHistory();
    const historyText = history.length > 0 ? `DO NOT use these previously asked questions: ${history.slice(0, 50).join(' | ')}` : "";

    const prompt = `Create a quiz about "${topic}" with exactly ${totalCount} multiple-choice questions. 
    
    DIFFICULTY DISTRIBUTION:
    - ${distribution.easy} Easy questions
    - ${distribution.medium} Medium questions
    - ${distribution.hard} Hard questions
    
    ${historyText}

    Each question must have 4 options. 
    Keep questions concise (under 20 words). 
    Keep options concise (under 5 words).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswerIndex: { type: Type.INTEGER, description: "Index of the correct answer (0-3)" },
              explanation: { type: Type.STRING },
              difficulty: { type: Type.STRING, description: "Easy, Medium, or Hard" }
            },
            required: ["question", "options", "correctAnswerIndex", "difficulty"]
          }
        }
      }
    });

    if (!response.text) throw new Error("No script generated");
    let questions = JSON.parse(response.text) as QuizQuestion[];

    // Save new questions to history
    const newQuestionTexts = questions.map(q => q.question);
    saveQuestionHistory(newQuestionTexts);

    // Apply Client-Side Sorting based on OrderMode
    if (orderMode === 'Progressive') {
        const difficultyValue: Record<string, number> = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
        questions.sort((a, b) => {
            const valA = difficultyValue[a.difficulty || 'Medium'] || 2;
            const valB = difficultyValue[b.difficulty || 'Medium'] || 2;
            return valA - valB;
        });
    } else {
        // Mixed/Random shuffle
        questions = questions.sort(() => Math.random() - 0.5);
    }

    return questions;
  });
};

export const generateQuizImage = async (
    topic: string, 
    questionContext: string, 
    style: string = 'Cinematic',
    model: string = 'gemini-2.5-flash-image'
): Promise<string> => {
  return withRetry(async () => {
    const ai = getClient();
    
    // High-fidelity prompt
    const prompt = `Create a masterpiece, 8k resolution, photorealistic image of ${topic}. 
    Context: ${questionContext}. 
    Style: ${style}. 
    Use ray tracing, global illumination, and highly detailed textures. 
    Make it look like a high-budget documentary frame or a national geographic photo.
    CRITICAL RULE: DO NOT INCLUDE ANY TEXT, LETTERS, WORDS, OR NUMBERS IN THE IMAGE. 
    The composition should be balanced and atmospheric.`;
    
    // Define Config
    // Note: 'imageSize' is only supported by gemini-3-pro-image-preview, not 2.5-flash
    const imageConfig: any = {
        aspectRatio: '16:9'
    };

    if (model === 'gemini-3-pro-image-preview') {
        imageConfig.imageSize = '2K';
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: imageConfig
      }
    });

    // Iterate to find image part
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  }, 3, 2000);
};

export const generateQuizAudio = async (
    text: string, 
    voiceName: string = 'Fenrir', 
    style: string = '', 
    pace: string = 'Normal',
    pitch: string = 'Medium'
): Promise<ArrayBuffer> => {
  if (!text) throw new Error("Text is required for audio generation");
  
  return withRetry(async () => {
    const ai = getClient();
    
    // Construct a prompt instruction for the model
    let instruction = "";
    if (style || pace !== 'Normal' || pitch !== 'Medium') {
        const parts = [];
        if (style) parts.push(`in a ${style} tone`);
        if (pace !== 'Normal') parts.push(`speaking ${pace.toLowerCase()}`);
        if (pitch !== 'Medium') parts.push(`with a ${pitch.toLowerCase()} pitch`);
        instruction = `Say ${parts.join(' and ')}: `;
    }
    
    const finalPrompt = `${instruction}${text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{
        parts: [{ text: finalPrompt }]
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName } 
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated from API response");

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }, 4, 3000); // 4 retries, starting delay 3s
};

export const generateThumbnail = async (
    topic: string,
    overlayText: string,
    style: string
): Promise<string> => {
    return withRetry(async () => {
        const ai = getClient();
        const prompt = `Create a high-quality, click-optimized YouTube thumbnail for a quiz video about "${topic}".
        
        TEXT OVERLAY: The image MUST feature the text "${overlayText}" clearly and boldly. 
        The text should be central or positioned to catch the eye, using large, legible typography.
        
        STYLE: ${style}.
        
        composition: 16:9 aspect ratio. The background should be exciting and relevant to the topic. 
        High contrast, vibrant colors. Make it look like a trending YouTube video thumbnail.
        Do not include any other small unreadable text. Only the main overlay text.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                imageConfig: {
                    aspectRatio: '16:9',
                    imageSize: '2K' // High res for thumbnails
                }
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        throw new Error("No thumbnail generated");
    });
};

export const generateMetadata = async (
    topic: string,
    count: number
): Promise<{ titles: string[], description: string, hashtags: string[], tags: string }> => {
    return withRetry(async () => {
        const ai = getClient();
        const prompt = `Act as a YouTube SEO Expert. Write metadata for a Quiz Video.
        Topic: ${topic}
        Number of Questions: ${count}
        
        Output JSON with:
        1. titles: Array of 3 viral, click-worthy titles (mix of questions, shock, and listicle styles). Include emojis.
        2. description: A compelling description (hook, summary, CTA).
        3. hashtags: Array of 10 relevant hashtags (start with #).
        4. tags: A single string of comma-separated SEO tags (keywords) for the backend.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        titles: { type: Type.ARRAY, items: { type: Type.STRING } },
                        description: { type: Type.STRING },
                        hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                        tags: { type: Type.STRING }
                    },
                    required: ["titles", "description", "hashtags", "tags"]
                }
            }
        });

        if (!response.text) throw new Error("No metadata generated");
        return JSON.parse(response.text);
    });
};
