import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { voiceServer } from "./voice-server.ts";
import { narrationServer } from "./narration-server.ts";
export default defineConfig({
  plugins: [react(), voiceServer(), narrationServer()],
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
});
