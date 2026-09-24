import { fileURLToPath } from "node:url";
import { run } from "./toolchain.mjs";

run("cargo", process.argv.slice(2), fileURLToPath(new URL("../src-tauri", import.meta.url)));
