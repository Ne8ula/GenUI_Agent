import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe,it,expect } from "vitest";

describe("native launch quarantine",()=>{
  it("refuses desktop dev before invoking Tauri or a GPU process",()=>{
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/tauri.mjs',import.meta.url)),"dev"],{encoding:"utf8",timeout:5000});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("quarantined");
    expect(result.stdout).toBe("");
  });
});
