/** Backend authoring contract. Never accept renderer-provided speech or policy. */
export type PromptPolicy = {
  version: number; modelId: string; targetMinCharacters: number; maxCharacters: number;
  maxStackedTags: number; allowedTags: string[]; quietTags: string[]; loudTags: string[];
  shortFormExceptions: Record<string, string>;
};
export function validateNarrationPrompt(text: string, policy: PromptPolicy, shortReason?: string): void {
  if (policy.version !== 1 || typeof text !== "string" || text.length > policy.maxCharacters || /[<>]/.test(text)) throw new Error("invalid_speech_prompt");
  if (text.length < policy.targetMinCharacters && !shortReason?.trim()) throw new Error("short_prompt_needs_review");
  if (!text.startsWith("[")) throw new Error("missing_delivery_tag");
  const tags: string[] = []; let index = 0, stacked = 0, spoken = "";
  while (index < text.length) {
    if (text[index] === "[") {
      const end = text.indexOf("]", index), tag = text.slice(index + 1, end);
      if (end < 0 || !policy.allowedTags.includes(tag) || ++stacked > policy.maxStackedTags) throw new Error("invalid_delivery_tag");
      tags.push(tag); index = end + 1;
    } else {
      if (text[index] === "]") throw new Error("invalid_delivery_tag");
      if (text[index].trim()) stacked = 0;
      spoken += text[index++];
    }
  }
  if (!/[a-zA-Z]/.test(spoken)) throw new Error("missing_spoken_text");
  if (tags.some(t => policy.quietTags.includes(t)) && tags.some(t => policy.loudTags.includes(t))) throw new Error("split_extreme_delivery_into_clips");
}
export function groundedNarration(phase: string, text: string, weather: unknown): string {
  if (phase !== "present" && phase !== "wind-present") return text;
  if (!weather || typeof weather !== "object") throw new Error("speech_source_unavailable");
  const data = weather as { id?: string; source?: string; location?: string; days?: { date: string; condition: string }[] };
  if (data.id !== "weather-ithaca-week" || data.source !== "synthetic" || data.location !== "Ithaca, New York") throw new Error("speech_source_unavailable");
  if (phase === "wind-present") return text;
  // Day names are bound to these exact fixture dates, never inferred as live weather.
  if (!Array.isArray(data.days) || data.days[0]?.date !== "2026-09-17" || data.days[1]?.date !== "2026-09-18") throw new Error("speech_source_unavailable");
  const labels: Record<string, string> = { "partly-cloudy": "partly cloudy", clear: "clear", cloudy: "cloudy", rain: "rainy" };
  for (const [index, token] of ["thursday", "friday"].entries()) {
    const condition = data.days[index].condition;
    if (!Object.hasOwn(labels, condition)) throw new Error("speech_source_unavailable");
    text = text.replace(`{${token}}`, labels[condition]);
  }
  if (/[{}]/.test(text)) throw new Error("speech_source_unavailable");
  return text;
}
export function narrationPayload(phase: string, lines: Record<string, string>, profile: { model_id: string; voice_settings: { stability: number } }, policy: PromptPolicy, weather?: unknown) {
  if (!Object.hasOwn(lines, phase)) throw new Error("invalid_request");
  if (profile.model_id !== "eleven_v3" || policy.modelId !== profile.model_id ||
      Object.keys(profile).sort().join() !== "model_id,voice_settings" ||
      Object.keys(profile.voice_settings).join() !== "stability" || profile.voice_settings.stability !== 0.5) throw new Error("invalid_voice_profile");
  const text = groundedNarration(phase, lines[phase], weather);
  validateNarrationPrompt(text, policy, Object.hasOwn(policy.shortFormExceptions, phase) ? policy.shortFormExceptions[phase] : undefined);
  return { ...profile, text };
}
