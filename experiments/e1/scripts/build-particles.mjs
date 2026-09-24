import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Pure Rust CPU simulation only. This never launches Tauri, a GPU test or a provider.
const manifest = fileURLToPath(new URL("../particles/Cargo.toml", import.meta.url));
const cargoHome = join(homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo");
const cargo = process.env.CARGO || (existsSync(cargoHome) ? cargoHome : "cargo");
const result = spawnSync(cargo, ["build", "--manifest-path", manifest, "--target", "wasm32-unknown-unknown", "--release", "--locked"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) {
  console.error("Particle build failed. The Rust wasm32-unknown-unknown target is required; no renderer was launched.");
  process.exit(result.status ?? 1);
}
copyFileSync(
  fileURLToPath(new URL("../particles/target/wasm32-unknown-unknown/release/e1_particles.wasm", import.meta.url)),
  fileURLToPath(new URL("../public/particles.wasm", import.meta.url)),
);
console.log("Built public/particles.wasm: procedural CPU particle state, no recorded frames.");
