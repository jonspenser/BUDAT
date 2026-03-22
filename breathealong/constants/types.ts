export type NoteType = 'inhale' | 'hold' | 'exhale';

export interface BreathCycle {
  inhale: number;   // seconds
  hold: number;     // seconds (0 = skip hold)
  exhale: number;   // seconds
}

export interface BreathingPattern {
  songTitle: string;
  artist: string;
  bpm: number;
  technique: string;       // e.g. "4-7-8", "box breathing", "diaphragmatic"
  vibe: string;            // short mood description
  cycles: BreathCycle[];   // sequence of breath cycles to repeat
  totalDuration: number;   // seconds
  notes: string;           // AI guidance note
}

export interface BreathNote {
  id: string;
  type: NoteType;
  duration: number;   // seconds
  startTime: number;  // absolute seconds from session start
}

export type SongInputMethod = 'name' | 'file' | 'spotify';

export interface SongInput {
  method: SongInputMethod;
  value: string;          // song name, file URI, or spotify URL
  fileName?: string;      // for file uploads
}
