import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { createRoomInterpretationHandler } from './src/server/room-interpretation.ts'
import { createAstralReplyHandler } from './src/server/astral-reply.ts'
import { createAstralDecisionHandler } from './src/server/astral-decision.ts'
import { createSpeechHandler } from './src/server/speech.ts'

function roomInterpretation(): Plugin {
  const handler = (port: number) => {
    const enabled = process.env.EVA_ENABLE_ROOM_INTERPRETATION === '1'
    return createRoomInterpretationHandler({
      origin: `http://127.0.0.1:${port}`,
      enabled,
      maxRequests: process.env.EVA_ROOM_INTERPRETATION_MAX_REQUESTS === undefined ? undefined : Number(process.env.EVA_ROOM_INTERPRETATION_MAX_REQUESTS),
      apiKey: enabled ? process.env.EVA_ANTHROPIC_API_KEY : undefined,
    })
  }
  return {
    name: 'local-room-interpretation',
    configureServer(server) { server.middlewares.use(handler(5173)) },
    configurePreviewServer(server) { server.middlewares.use(handler(4173)) },
  }
}

function speech(): Plugin {
  const handler = (port: number) => {
    const enabled = process.env.EVA_ENABLE_SPEECH === '1'
    const privacyConfirmed = process.env.EVA_SPEECH_PRIVACY_CONFIRMED === '1'
    const permitted = enabled && privacyConfirmed
    return createSpeechHandler({
      origin: `http://127.0.0.1:${port}`,
      enabled,
      privacyConfirmed,
      maxAttempts: process.env.EVA_SPEECH_MAX_ATTEMPTS === undefined ? undefined : Number(process.env.EVA_SPEECH_MAX_ATTEMPTS),
      apiKey: permitted ? process.env.EVA_ELEVENLABS_API_KEY : undefined,
      voiceId: permitted ? process.env.EVA_ELEVENLABS_VOICE_ID : undefined,
    })
  }
  return {
    name: 'local-speech',
    configureServer(server) { server.middlewares.use(handler(5173)) },
    configurePreviewServer(server) { server.middlewares.use(handler(4173)) },
  }
}

function astralReply(): Plugin {
  const handler = (port: number) => {
    const enabled = process.env.EVA_ENABLE_ASTRAL_REPLY === '1'
    return createAstralReplyHandler({
      origin: `http://127.0.0.1:${port}`,
      enabled,
      apiKey: enabled ? process.env.EVA_ANTHROPIC_API_KEY : undefined,
      maxRequests: process.env.EVA_ASTRAL_REPLY_MAX_REQUESTS === undefined ? undefined : Number(process.env.EVA_ASTRAL_REPLY_MAX_REQUESTS),
    })
  }
  return {
    name: 'local-astral-reply',
    configureServer(server) { server.middlewares.use(handler(5173)) },
    configurePreviewServer(server) { server.middlewares.use(handler(4173)) },
  }
}

function astralDecision(): Plugin {
  const handler = (port: number) => {
    const enabled = process.env.EVA_ENABLE_ASTRAL_DECISION === '1'
    return createAstralDecisionHandler({
      origin: `http://127.0.0.1:${port}`,
      enabled,
      apiKey: enabled ? process.env.EVA_JEV_API_KEY : undefined,
      maxRequests: process.env.EVA_ASTRAL_DECISION_MAX_REQUESTS === undefined ? undefined : Number(process.env.EVA_ASTRAL_DECISION_MAX_REQUESTS),
    })
  }
  return {
    name: 'local-astral-decision',
    configureServer(server) { server.middlewares.use(handler(5173)) },
    configurePreviewServer(server) { server.middlewares.use(handler(4173)) },
  }
}

// A worktree under .claude/worktrees/ has no node_modules of its own: packages resolve from the main checkout,
// which lies outside the worktree, so the dev server must be allowed to serve package files (the fonts) from there.
// In the main checkout this folder is already inside the project, so nothing more is exposed.
const packages = path.resolve(createRequire(import.meta.url).resolve('vite/package.json'), '../..')

export default defineConfig({
  plugins: [react(), roomInterpretation(), speech(), astralReply(), astralDecision()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: { allow: ['.', packages] } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
})
