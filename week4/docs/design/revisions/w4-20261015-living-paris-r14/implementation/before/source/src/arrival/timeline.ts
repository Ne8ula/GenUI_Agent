export const CONSTRUCTION_SECONDS = 30
export const CHECKPOINTS = [0, 2, 7, 14, 21, 30] as const
export type ArrivalPlayback = 'idle' | 'playing' | 'paused' | 'settled'
export interface ArrivalState { seconds: number; playback: ArrivalPlayback; submitted: boolean }
export const initialArrival = (): ArrivalState => ({ seconds: 0, playback: 'idle', submitted: false })
export function clampTime(value: number) { return Number.isFinite(value) ? Math.max(0, Math.min(CONSTRUCTION_SECONDS, value)) : 0 }
export function phaseAt(seconds: number) {
  const t = clampTime(seconds)
  return t < 2 ? 'EVA eye' : t < 7 ? 'Detection anchors' : t < 14 ? 'Surface islands' : t < 21 ? 'Local flow' : t < 30 ? 'Material reconstruction' : 'Paris'
}
export function startArrival(reduced: boolean): ArrivalState {
  return { seconds: reduced ? CONSTRUCTION_SECONDS : 0, playback: reduced ? 'settled' : 'playing', submitted: true }
}
export function seekArrival(seconds: number, reduced = false): ArrivalState {
  const t = reduced ? CONSTRUCTION_SECONDS : clampTime(seconds)
  return { seconds: t, playback: t === CONSTRUCTION_SECONDS ? 'settled' : 'paused', submitted: true }
}
export function advanceArrival(state: ArrivalState, delta: number): ArrivalState {
  if (state.playback !== 'playing') return state
  const step = Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0
  const seconds = clampTime(state.seconds + step)
  return { ...state, seconds, playback: seconds === CONSTRUCTION_SECONDS ? 'settled' : 'playing' }
}
