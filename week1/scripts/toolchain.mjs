import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { voiceKey } from "./voice-key.mjs";
export function run(command, args, cwd) {
  // Refresh only the child process: IDEs opened before rustup retain an old PATH.
  const env = { ...process.env, OPENAI_API_KEY: voiceKey(), ELEVENLABS_API_KEY: voiceKey("ELEVENLABS_API_KEY"), ELEVENLABS_VOICE_ID: voiceKey("ELEVENLABS_VOICE_ID"), PATH: join(homedir(), ".cargo", "bin") + delimiter + process.env.PATH };
  const child = spawn(command, args, { cwd, env, stdio: "inherit" });
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
}
