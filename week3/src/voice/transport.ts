import { invoke, isTauri } from '@tauri-apps/api/core';
import { bytesToBase64, type Readiness, type Reply, type VoiceTransport } from './contracts';

export const nativeTransport: VoiceTransport = {
  status: () => isTauri()
    ? invoke<Readiness>('w3_status')
    : Promise.resolve({ ready: false, missing: ['Open the native app for live voice. Browser preview never calls providers.'], providers: { stt: '', reply: '', tts: '' }, remainingTurns: 0 }),
  start: () => invoke('w3_start'),
  advance: (sessionId, generation) => invoke('w3_advance', { sessionId, generation }),
  turn: (sessionId, generation, wav) => invoke<Reply>('w3_turn', { sessionId, generation, wavBase64: bytesToBase64(wav) }),
  delivered: (sessionId, generation) => invoke('w3_delivered', { sessionId, generation }),
  end: (sessionId) => invoke('w3_end', { sessionId }),
};
