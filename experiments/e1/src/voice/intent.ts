export type VoiceIntent =
  | { readonly type: "weather"; readonly day: "today" | "tomorrow"; readonly location: "NYC" | null }
  | { readonly type: "unsupported-location"; readonly location: string }
  | { readonly type: "dismiss" | "stop" | "microphone-off" | "plain" | "reduced-motion" | "unknown" };

/** Deliberately bounded command grammar, not a model or a general-purpose assistant. */
export function parseVoiceIntent(input: string): VoiceIntent {
  if (input.length > 500) return { type: "unknown" };
  const text = input.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim().replace(/^eva\s+/, "").replace(/^please\s+/, "").replace(/\s+please$/, "");
  if (/^(?:(?:turn|switch) (?:the )?(?:microphone|mic) off|(?:turn|switch) off (?:the )?(?:microphone|mic)|(?:microphone|mic) off|stop listening)$/.test(text)) return { type: "microphone-off" };
  if (/^(?:dismiss|hide|close) (?:the )?weather$/.test(text)) return { type: "dismiss" };
  if (/^(?:stop|stop speaking|stop (?:the )?(?:animation|motion)|pause (?:the )?(?:animation|motion))$/.test(text)) return { type: "stop" };
  if (/^(?:just (?:the )?(?:numbers|facts)|(?:show )?(?:a )?plain answer)$/.test(text)) return { type: "plain" };
  if (/^(?:less motion|reduce (?:the )?motion|reduced motion)$/.test(text)) return { type: "reduced-motion" };

  const weather = /\bweather\b/.test(text);
  const followUp = /^(?:what|how) about (?:today|tomorrow)(?:\s|$)/.test(text) || /^(?:today|tomorrow)$/.test(text);
  if (!weather && !followUp) return { type: "unknown" };
  if (/\b(?:not|dont|never|yesterday|week|friday|saturday|sunday|monday|tuesday|wednesday|thursday)\b/.test(text)) return { type: "unknown" };
  if (/\btoday\b/.test(text) && /\btomorrow\b/.test(text)) return { type: "unknown" };
  const day = /\btomorrow\b/.test(text) ? "tomorrow" : "today";
  const locationMatch = text.match(/\b(?:in|for)\s+(.+)$/);
  const namedLocation = locationMatch?.[1].replace(/\s+(?:today|tomorrow)$/, "").trim();
  if (namedLocation && !/^(?:nyc|new york(?: city)?)$/.test(namedLocation)) {
    return { type: "unsupported-location", location: namedLocation.slice(0, 80) };
  }
  const nyc = /\b(?:nyc|new york(?: city)?)\b/.test(text);
  const remainder = text.replace(/\bnew york city\b|\bnew york\b|\bnyc\b/g, " ")
    .replace(/\b(?:whats|what|is|hows|how|the|weather|today|tomorrow|in|for|about|show|me|tell|forecast)\b/g, " ").trim();
  if (remainder) return { type: "unknown" };
  return { type: "weather", day, location: nyc ? "NYC" : null };
}
