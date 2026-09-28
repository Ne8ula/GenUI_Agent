import type { VoiceEnvironment, VoiceRecognition } from "./types";

export const BROWSER_RECOGNITION_NOTICE =
  "Browser speech recognition may send microphone audio to your browser's speech service. E1 does not record or store it.";

/** Recognition only. The owner's Week 1 ElevenLabs voice is never silently substituted. */
export function createBrowserVoiceEnvironment(): VoiceEnvironment {
  if (typeof window === "undefined") return {};
  const host = window as unknown as {
    SpeechRecognition?: new () => VoiceRecognition;
    webkitSpeechRecognition?: new () => VoiceRecognition;
  };
  const Recognition = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return { createRecognition: Recognition ? () => new Recognition() : undefined };
}
