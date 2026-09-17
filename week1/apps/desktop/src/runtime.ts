import { invoke, isTauri } from "@tauri-apps/api/core";
export type RuntimeReply = {
  protocolVersion: 1;
  runtime: "tauri" | "browser-fixture";
  message: string;
  appVersion: string;
};
export const nativeRuntime = isTauri();
export async function checkRuntime(): Promise<RuntimeReply> {
  if (!nativeRuntime) return {
    protocolVersion: 1, runtime: "browser-fixture",
    message: "Browser fixture loaded. No Rust command was called.", appVersion: "0.1.0",
  };
  const reply = await invoke<RuntimeReply>("check_runtime", { request: { protocolVersion: 1 } });
  if (reply.protocolVersion !== 1 || reply.runtime !== "tauri" ||
      typeof reply.message !== "string" || typeof reply.appVersion !== "string") {
    throw new Error("Unexpected runtime response");
  }
  return reply;
}

