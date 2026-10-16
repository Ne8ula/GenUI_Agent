export const CONSTRUCTION_SECONDS = 30
export const IDLE_PERIOD_SECONDS = 120
export const CHECKPOINTS = [0, 2, 7, 14, 21, 30] as const
export type ArrivalPlayback = 'idle' | 'playing' | 'paused' | 'settled'
export interface ArrivalState { seconds: number; idleSeconds: number; playback: ArrivalPlayback; submitted: boolean }
export const initialArrival = (): ArrivalState => ({ seconds: 0, idleSeconds: 0, playback: 'idle', submitted: false })
export function clampTime(value: number) { return Number.isFinite(value) ? Math.max(0, Math.min(CONSTRUCTION_SECONDS, value)) : 0 }
export function idlePhase(value: number) { return Number.isFinite(value) ? Math.max(0, value) % IDLE_PERIOD_SECONDS : 0 }
export function phaseAt(seconds: number) {
  const t = clampTime(seconds)
  return t < 2 ? 'EVA eye' : t < 7 ? 'Detection anchors' : t < 14 ? 'Surface islands' : t < 21 ? 'Local flow' : t < 30 ? 'Material reconstruction' : 'Paris'
}
export function startArrival(reduced: boolean): ArrivalState {
  return { seconds: reduced ? CONSTRUCTION_SECONDS : 0, idleSeconds: 0, playback: reduced ? 'paused' : 'playing', submitted: true }
}
export function seekArrival(seconds: number, reduced = false, idleSeconds = 0): ArrivalState {
  const t = reduced ? CONSTRUCTION_SECONDS : clampTime(seconds)
  const life = !reduced && t === CONSTRUCTION_SECONDS && Number.isFinite(idleSeconds) ? Math.max(0, idleSeconds) : 0
  return { seconds: t, idleSeconds: life, playback: 'paused', submitted: true }
}
export function resumeArrival(state: ArrivalState): ArrivalState {
  if (!state.submitted) return state
  return { ...state, playback: state.seconds === CONSTRUCTION_SECONDS ? 'settled' : 'playing' }
}
export function advanceArrival(state: ArrivalState, delta: number): ArrivalState {
  if (state.playback !== 'playing' && state.playback !== 'settled') return state
  const step = Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0
  if (step === 0) return state
  if (state.playback === 'settled') return { ...state, idleSeconds: state.idleSeconds + step }
  const seconds = clampTime(state.seconds + step)
  return { ...state, seconds, playback: seconds === CONSTRUCTION_SECONDS ? 'settled' : 'playing' }
}
