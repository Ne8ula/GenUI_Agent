export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted' | 'unavailable';
export type Stance = 'attentive' | 'comforting' | 'shared_joy' | 'congratulatory' | 'supportive';
export interface Readiness {
  ready: boolean;
  missing: string[];
  providers: { stt: string; reply: string; tts: string };
  remainingTurns: number;
}
export interface Reply {
  sessionId: string;
  generation: number;
  transcript: string;
  reply: string;
  stance: Stance;
  intensity: number;
  audioBase64: string;
  audioMime: 'audio/mpeg';
}
export interface VoiceTransport {
  status(): Promise<Readiness>;
  start(): Promise<{ sessionId: string }>;
  advance(sessionId: string, generation: number): Promise<void>;
  turn(sessionId: string, generation: number, wav: Uint8Array): Promise<Reply>;
  delivered(sessionId: string, generation: number): Promise<void>;
  end(sessionId: string): Promise<void>;
}
export interface Capture {
  start(onset: () => void, utterance: (wav: Uint8Array) => void, failure: () => void): Promise<void>;
  mute(value: boolean): void;
  discard(): void;
  stop(): void;
}
export interface Playback {
  unlock(): Promise<void>;
  play(reply: Reply, started: () => void): Promise<void>;
  stop(): void;
  close(): void;
}
export interface SessionView {
  active: boolean;
  starting: boolean;
  muted: boolean;
  state: TurnState;
  stance: Stance;
  intensity: number;
  seed: number;
  transcript: string;
  reply: string;
  message: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
