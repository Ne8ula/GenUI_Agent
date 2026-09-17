import { invoke, isTauri } from "@tauri-apps/api/core";
import markdown from "../../../fixtures/vault/preferences/weather-units.md?raw";
import { parseDemoMemory, validateDemoMemory, type DemoMemory } from "./memory-contract";
export type MemoryLookup = { record: DemoMemory; transport: "tauri" | "browser-fixture" };
export async function getDemoMemory(recordId = "weather-units"): Promise<MemoryLookup> {
  try {
    if (!isTauri()) {
      if (recordId !== "weather-units") throw new Error("unknown_record");
      return { record: parseDemoMemory(markdown), transport: "browser-fixture" };
    }
    const reply = await invoke<unknown>("get_demo_memory", { request: { recordId } });
    return { record: validateDemoMemory(reply), transport: "tauri" };
  } catch {
    // A later view can display this without leaking paths or backend diagnostics.
    throw new Error("Demo memory unavailable");
  }
}

