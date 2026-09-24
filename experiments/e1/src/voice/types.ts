export type MicrophonePhase = "off" | "starting" | "listening" | "transcribing" | "paused" | "denied" | "unavailable" | "error";

export interface VoiceState {
  readonly phase: MicrophonePhase;
  readonly enabled: boolean;
  readonly speaking: boolean;
  readonly audioEnabled: boolean;
  readonly recognitionAvailable: boolean;
  readonly speechAvailable: boolean;
  readonly message: string;
}

export interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

export interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}

/** Narrow browser-owned ports; no provider credentials or recorded audio cross this API. */
export interface VoiceRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onprocessing?: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  start(): void;
  abort(): void;
}

export interface OutputVoice {
  readonly lang: string;
  readonly localService: boolean;
  readonly default: boolean;
}

export interface VoiceUtterance {
  lang: string;
  rate: number;
  volume: number;
  voice: OutputVoice | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface VoiceEnvironment {
  readonly createRecognition?: () => VoiceRecognition;
  readonly createUtterance?: (text: string) => VoiceUtterance;
  readonly synthesis?: {
    getVoices(): readonly OutputVoice[];
    speak(utterance: VoiceUtterance): void;
    cancel(): void;
  };
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}

export interface ForecastNarration {
  readonly fixtureId: "W-NYC-02";
  readonly fixtureRevision: 1;
  readonly day: "today" | "tomorrow";
}

export interface NarrationCallbacks {
  readonly onstart: () => void;
  readonly onend: () => void;
  readonly onerror: (message: string) => void;
}

export interface NarrationAdapter {
  readonly available: boolean;
  readonly unavailableMessage: string;
  unlock(): void;
  speak(text: string, forecast: ForecastNarration, callbacks: NarrationCallbacks): void;
  cancel(): void;
  dispose(): void;
}

export interface VoiceSessionOptions {
  readonly onTranscript: (text: string) => void;
  readonly onState?: (state: VoiceState) => void;
  readonly environment?: VoiceEnvironment;
  readonly narration?: NarrationAdapter;
  readonly audioEnabled?: boolean;
}
