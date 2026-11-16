import { createSpeechController, fetchResponse, readSpeechAvailability, responseJson } from '../speech/speech.ts';
import { createBrowserSpeechResources } from '../speech/browser-speech.ts';
import { ASTRAL_EFFECTS, ASTRAL_LIGHTS, type AstralConversation, type AstralConversationOptions, type AstralPhase, type AstralReply } from './types.ts';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateAstralReply(value: unknown): AstralReply {
  if (!record(value) || Object.keys(value).length !== 5 || !['reply', 'effect', 'intensity', 'room', 'light'].every(key => Object.hasOwn(value, key))
    || typeof value.reply !== 'string' || !value.reply.trim() || value.reply !== value.reply.trim() || value.reply.length > 600
    || value.reply.split(/\s+/u).length > 45 || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>\[\](){}*_`#\\]|https?:\/\/|www\.|^(?:EVA|assistant)\s*:/iu.test(value.reply)
    || (value.room !== null && (typeof value.room !== 'string' || !value.room.trim() || value.room !== value.room.trim() || value.room.length > 200
      || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>\[\](){}*_`#\\]|https?:\/\/|www\./iu.test(value.room)))
    || typeof value.effect !== 'string' || !ASTRAL_EFFECTS.some(effect => effect === value.effect)
    || typeof value.light !== 'string' || !ASTRAL_LIGHTS.some(light => light === value.light)
    || typeof value.intensity !== 'number' || !Number.isFinite(value.intensity) || value.intensity < 0 || value.intensity > 1) {
    throw new Error('Invalid astral reply; no substitute was made.');
  }
  return { reply: value.reply, effect: value.effect as AstralReply['effect'], intensity: value.intensity, room: value.room as string | null, light: value.light as AstralReply['light'] };
}

type Turn = {
  controller: AbortController;
  stage: 'checking' | 'listening' | 'committing' | 'reply' | 'speech';
  utterance?: string;
  reply?: AstralReply;
  announced: boolean;
};

export function createAstralConversation(options: AstralConversationOptions): AstralConversation {
  let phase: AstralPhase = 'idle';
  let disposed = false;
  let active: Turn | null = null;
  let history: { utterance: string; response: AstralReply }[] = [];
  const current = (turn: Turn) => !disposed && active === turn && !turn.controller.signal.aborted;
  function setPhase(next: AstralPhase) {
    if (phase === next) return;
    phase = next;
    options.onPhase(next);
  }
  function end(next: 'idle' | 'unavailable' = 'idle') {
    const turn = active;
    active = null;
    turn?.controller.abort();
    speech.stop();
    options.onVoiceLevel(0);
    setPhase(next);
  }
  function failed(turn: Turn, reason: unknown, unavailable = false) {
    if (!current(turn)) return;
    console.warn('EVA astral conversation stopped without retry.', reason instanceof Error ? reason.message : reason);
    end(unavailable ? 'unavailable' : 'idle');
  }
  const speech = createSpeechController({
    resources: createBrowserSpeechResources(),
    onStatus(state) {
      const turn = active;
      if (!turn || !current(turn)) {
        if (state.error) console.warn('EVA speech cleanup failed.', state.error);
        return;
      }
      if (state.phase === 'error') { failed(turn, state.error); return; }
      if (turn.stage === 'listening' && state.microphone) setPhase('listening');
      if (turn.stage === 'speech' && state.phase === 'speaking' && turn.reply && !turn.announced) {
        turn.announced = true;
        setPhase('speaking');
        if (!current(turn)) return;
        // onReply can start paid room work; interruption must not make the next turn a first arrival again.
        history = [...history, { utterance: turn.utterance!, response: turn.reply }].slice(-4);
        options.onReply({ ...turn.reply });
        // shortcut: playback has no analyser, use a coarse gate until audio metering is needed.
        if (current(turn)) options.onVoiceLevel(1);
      } else if (turn.stage === 'speech' && state.phase === 'idle' && turn.announced) {
        end();
      }
    },
    onTranscript(text) {
      const turn = active;
      if (!turn || !current(turn) || turn.stage !== 'committing') return;
      turn.stage = 'reply';
      turn.utterance = text;
      void answer(turn);
    },
  });
  async function decide(turn: Turn, body: string) {
    const { signal } = turn.controller;
    try {
      const response = await fetchResponse(globalThis.fetch, '/api/astral-decision', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
      }, signal);
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`Astral decision route returned HTTP ${response.status}.`);
      }
      const value: unknown = await responseJson(response, signal);
      if (!record(value) || Object.keys(value).length !== 3 || !['effect', 'intensity', 'light'].every(key => Object.hasOwn(value, key))
        || typeof value.effect !== 'string' || !ASTRAL_EFFECTS.some(effect => effect === value.effect)
        || typeof value.light !== 'string' || !ASTRAL_LIGHTS.some(light => light === value.light)
        || typeof value.intensity !== 'number' || !Number.isFinite(value.intensity) || value.intensity < 0 || value.intensity > 1) {
        throw new Error('Invalid astral decision; no substitute was made.');
      }
      if (!current(turn) || phase !== 'thinking') {
        console.warn('EVA astral decision arrived late; dropped.');
        return;
      }
      options.onDecision?.({ effect: value.effect as AstralReply['effect'], intensity: value.intensity, light: value.light as AstralReply['light'] });
    } catch (error) {
      console.warn('EVA astral decision dropped without retry.', error instanceof Error ? error.message : error);
    }
  }
  async function answer(turn: Turn) {
    const { signal } = turn.controller;
    const body = JSON.stringify({ utterance: turn.utterance, history });
    if (options.onDecision) void decide(turn, body);
    const timer = setTimeout(() => failed(turn, 'Astral reply timed out locally; charges may still apply.'), 35000);
    try {
      const response = await fetchResponse(globalThis.fetch, '/api/astral-reply', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
      }, signal);
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        failed(turn, `Astral reply route returned HTTP ${response.status}.`, [403, 404, 409, 429, 503].includes(response.status));
        return;
      }
      const reply = validateAstralReply(await responseJson(response, signal));
      if (!history.length && reply.room === null) throw new Error('First astral reply omitted its room.');
      if (!current(turn)) return;
      clearTimeout(timer);
      turn.reply = reply;
      turn.stage = 'speech';
      if (!await speech.speak(reply.reply) && current(turn)) failed(turn, 'Speech did not start.');
    } catch (error) { failed(turn, error); }
    finally { clearTimeout(timer); }
  }
  async function listen(turn: Turn) {
    const { signal } = turn.controller;
    const timer = setTimeout(() => failed(turn, 'Local route status timed out.', true), 5000);
    try {
      const availability = await readSpeechAvailability(signal);
      if (!current(turn)) return;
      if (availability.phase !== 'ready' || (availability.remaining ?? 0) < 2) {
        failed(turn, `Speech unavailable: ${availability.phase}; a turn needs two shared attempts.`, true);
        return;
      }
      const response = await fetchResponse(globalThis.fetch, '/api/astral-reply', { method: 'GET' }, signal);
      const value = await responseJson(response, signal);
      if (!record(value) || Object.keys(value).length !== 4 || value.available !== true || value.reason !== null
        || value.model !== 'claude-opus-5-5' || !Number.isInteger(value.remainingRequests) || typeof value.remainingRequests !== 'number'
        || value.remainingRequests < 1 || value.remainingRequests > 100 || response.status !== 200) {
        failed(turn, `Astral reply unavailable or invalid status (HTTP ${response.status}).`, true);
        return;
      }
      if (!current(turn)) return;
      clearTimeout(timer);
      turn.stage = 'listening';
      if (!await speech.startListening() && current(turn)) failed(turn, 'Microphone or transcription did not start.');
    } catch (error) { failed(turn, error, true); }
    finally { clearTimeout(timer); }
  }
  options.onPhase('idle');
  options.onVoiceLevel(0);
  return {
    startListening() {
      if (disposed || active) return;
      const turn: Turn = { controller: new AbortController(), stage: 'checking', announced: false };
      active = turn;
      void listen(turn);
    },
    finishListening() {
      const turn = active;
      if (!turn || turn.stage === 'committing' || turn.stage === 'reply' || turn.stage === 'speech') return;
      if (speech.getState().phase !== 'listening') { failed(turn, 'Listening ended before the speech connection was ready.'); return; }
      turn.stage = 'committing';
      setPhase('thinking');
      if (current(turn) && !speech.finishListening()) failed(turn, 'No audio was committed.');
    },
    stop() { if (!disposed) end(phase === 'unavailable' ? 'unavailable' : 'idle'); },
    dispose() {
      if (disposed) return;
      end();
      disposed = true;
      history = [];
      speech.dispose();
    },
  };
}
