import type { Capture, Playback, SessionView, VoiceTransport } from './contracts';
import { clearTimings, noteTiming } from './timing';

const initial = (): SessionView => ({ ended: false, active: false, starting: false, muted: false, state: 'idle', stance: 'attentive', intensity: .35, seed: 1, transcript: '', reply: '', message: 'Ready when you are.' });

/** Owns local cancellation; provider cancellation is deliberately never on the stop path. */
export class Conversation {
  private view = initial();
  private listeners = new Set<() => void>();
  private epoch = 0;
  private generation = 0;
  private sessionId: string | null = null;
  private advanceChain: Promise<void> = Promise.resolve();
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private submitted = -1;
  private speechPending = false;
  private rawBuffers = new Set<Uint8Array>();
  private clearRawBuffers() { this.rawBuffers.forEach(buffer => buffer.fill(0)); this.rawBuffers.clear(); }
  constructor(private transport: VoiceTransport, private capture: Capture, private playback: Playback) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<SessionView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach(listener => listener());
  }
  async start() {
    if (this.view.active || this.view.starting) return;
    const epoch = ++this.epoch;
    this.update({ ...initial(), starting: true, message: 'Waiting for microphone permission…' });
    try {
      await this.playback.unlock();
      if (epoch !== this.epoch) return;
      await this.capture.start(this.onset, this.utterance, this.captureFailed);
      if (epoch !== this.epoch) return;
      const { sessionId } = await this.transport.start();
      if (epoch !== this.epoch) { await this.transport.end(sessionId); return; }
      this.sessionId = sessionId;
      this.generation = 0;
      await this.transport.advance(sessionId, 0);
      if (epoch !== this.epoch) return;
      this.submitted = -1;
      this.advanceChain = Promise.resolve();
      this.capture.discard();
      this.update({ active: true, starting: false, state: 'listening', message: 'Listening. You can speak over me to interrupt.' });
      this.expiry = setTimeout(() => { this.end(); this.update({ message: 'Ten-minute limit reached. Session ended.' }); }, 10 * 60_000);
    } catch {
      if (epoch !== this.epoch) return;
      this.end();
      this.update({ state: 'unavailable', message: 'Conversation unavailable. Check microphone permission and backend provider configuration, then try again.' });
    }
  }
  private captureFailed = () => {
    this.end();
    this.update({ state: 'unavailable', message: 'Microphone disconnected or audio capture stopped. Session ended; reconnect and start again.' });
  };
  private invalidate() {
    this.playback.stop();
    this.clearRawBuffers();
    this.speechPending = false;
    const generation = ++this.generation;
    const sessionId = this.sessionId;
    const epoch = this.epoch;
    if (sessionId) {
      this.advanceChain = this.advanceChain.catch(() => {}).then(async () => {
        if (epoch !== this.epoch) return;
        await this.transport.advance(sessionId, generation);
      });
      // The utterance path awaits this too; avoid an unhandled rejection after Stop.
      void this.advanceChain.catch(() => {
        if (epoch === this.epoch && generation === this.generation) {
          this.end();
          this.update({ state: 'unavailable', message: 'Backend cancellation failed. Session ended safely; restart to reconnect.' });
        }
      });
    }
    return generation;
  }
  private onset = () => {
    if (!this.view.active || this.view.muted) return;
    const detected = performance.now();
    this.invalidate();
    noteTiming('detected-onset-to-local-stop-ms', performance.now() - detected);
    this.speechPending = true;
    this.update({ state: 'listening', stance: 'attentive', intensity: .3, transcript: '', reply: '', message: 'Listening…' });
  };
  private utterance = (wav: Uint8Array) => {
    if (!this.view.active || this.view.muted || !this.speechPending || !this.sessionId) { wav.fill(0); return; }
    this.rawBuffers.add(wav);
    this.speechPending = false;
    const generation = this.generation;
    if (this.submitted === generation) { wav.fill(0); this.rawBuffers.delete(wav); return; }
    this.submitted = generation;
    const epoch = this.epoch;
    const sessionId = this.sessionId;
    const current = () => epoch === this.epoch && generation === this.generation && sessionId === this.sessionId;
    const turnEnded = performance.now();
    this.update({ state: 'processing', message: 'Preparing a response…' });
    void (async () => {
      try {
        await this.advanceChain;
        if (!current()) return;
        const reply = await this.transport.turn(sessionId, generation, wav);
        if (!current() || reply.sessionId !== sessionId || reply.generation !== generation) return;
        this.update({ transcript: reply.transcript });
        await this.playback.play(reply, () => {
          if (!current()) { this.playback.stop(); return; }
          noteTiming('turn-end-to-playback-ms', performance.now() - turnEnded);
          this.update({ state: 'speaking', stance: reply.stance, intensity: reply.intensity, seed: crypto.getRandomValues(new Uint32Array(1))[0], reply: reply.reply, message: 'Speaking. Interrupt whenever you need.' });
        });
        if (!current()) return;
        await this.transport.delivered(sessionId, generation);
        if (current()) this.update({ state: 'listening', message: this.view.muted ? 'Microphone muted.' : 'Listening…' });
      } catch {
        if (current()) {
          this.playback.stop();
          this.update({ state: 'unavailable', reply: '', message: 'This turn could not finish. Check connection or rehearsal allowance. Speak to try a new turn, or end the session.' });
        }
      } finally {
        wav.fill(0);
        this.rawBuffers.delete(wav);
      }
    })();
  };
  mute() {
    if (!this.view.active) return;
    const muted = !this.view.muted;
    this.capture.mute(muted);
    this.speechPending = false;
    this.update({ muted, message: muted ? 'Microphone muted. An existing response may finish.' : 'Microphone on. Listening…' });
  }
  stop() {
    if (!this.view.active) return;
    this.invalidate();
    this.capture.discard();
    this.update({ state: 'interrupted', stance: 'attentive', intensity: .2, reply: '', message: this.view.muted ? 'Response stopped. Microphone muted.' : 'Response stopped. Still listening.' });
  }
  end = () => {
    const wasEnded = this.view.ended;
    const hadSession = this.view.active || this.view.starting;
    const frozen = { stance: this.view.stance, intensity: this.view.intensity, seed: this.view.seed };
    const epoch = ++this.epoch;
    const sessionId = this.sessionId;
    this.clearRawBuffers();
    clearTimings();
    this.sessionId = null;
    this.speechPending = false;
    this.playback.close();
    this.capture.stop();
    clearTimeout(this.expiry);
    this.update(hadSession ? { ...initial(), ...frozen, ended: true, message: 'Session ended. Microphone off; local conversation cleared.' } : { ...initial(), ended: wasEnded });
    if (sessionId) void this.transport.end(sessionId).catch(() => {
      if (epoch !== this.epoch) return;
      this.update({ message: 'Microphone and playback stopped locally. Backend disconnect was not confirmed; close the app to clear its context.' });
    });
  };
}
