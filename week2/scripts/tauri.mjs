import { fileURLToPath } from "node:url";
import { run } from "./toolchain.mjs";

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "dev") {
  console.error("E1 native launch is quarantined after a reported system-wide graphics failure. Do not run an older eva-e1.exe. Use npm run dev for the procedural browser preview.");
  process.exit(1);
}

run(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url)),
    ...process.argv.slice(2),
  ],
  fileURLToPath(new URL("..", import.meta.url)),
);
