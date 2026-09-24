import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

// Adapted from week1/scripts/toolchain.mjs at source revision
// 9cb84746d97e0d5f1a441c196cfb05a3ed235d18. It retains only the child-local
// Cargo PATH refresh; E1 deliberately has no voice/provider credential loader.
export function run(command, args, cwd) {
  const env = {
    ...process.env,
    PATH: join(homedir(), ".cargo", "bin") + delimiter + (process.env.PATH ?? ""),
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
