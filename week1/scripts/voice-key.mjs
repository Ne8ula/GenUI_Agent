import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
// Read exactly this backend secret. Do not inject .env fields into frontend defines.
export function voiceKey(name = "OPENAI_API_KEY") {
  if (!["OPENAI_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"].includes(name)) throw new Error("Unsupported backend setting");
  if (process.env[name]) return process.env[name];
  const file = new URL("../.env.local", import.meta.url);
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8"))[name] || "" : "";
}
