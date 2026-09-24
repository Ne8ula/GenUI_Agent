import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { voiceKey } from "../../../week1/scripts/voice-key.mjs";

// Reuse Week 1's private runtime configuration without copying credentials or
// exposing settings through frontend defines. The archive stays unchanged.
export function run(command, args, cwd) {
  const env = {
    ...process.env,
    PATH: join(homedir(), ".cargo", "bin") + delimiter + (process.env.PATH ?? ""),
    OPENAI_API_KEY: voiceKey("OPENAI_API_KEY"),
    ELEVENLABS_API_KEY: voiceKey("ELEVENLABS_API_KEY"),
    ELEVENLABS_VOICE_ID: voiceKey("ELEVENLABS_VOICE_ID"),
  };
  const child = spawn(command, args, { cwd, env, stdio: "inherit" });
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
