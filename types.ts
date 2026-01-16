
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  difficulty?: string;
}

export interface QuizSlide extends QuizQuestion {
  id: string;
  backgroundImage?: string; // Base64
  questionAudio?: ArrayBuffer; // PCM or Audio File buffer for the question
  answerAudio?: ArrayBuffer;   // PCM or Audio File buffer for the reveal
}

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING_SCRIPT = 'GENERATING_SCRIPT',
  GENERATING_MEDIA = 'GENERATING_MEDIA',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface GenerationConfig {
  topic: string;
  count: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  orderMode: 'Progressive' | 'Mixed';
}
