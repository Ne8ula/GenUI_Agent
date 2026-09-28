# Provider check — blocked preflight

`w3-20260927-provider-01`, 2026-09-27. Owner acceptance remains pending.

The owner authorized up to ten short voice turns and explicitly permitted reuse of the previous nonsecret Week 1 voice ID. A native process was launched with that ID and a **two-turn process allowance**; API keys stayed in its environment. A synthetic English input was prepared using local Windows speech synthesis, outside the repository. This was never a fallback presented as live microphone interaction.

The automated harness failed its `ready === true` precondition before creating its own conversation or submitting synthetic audio. [Original failure output](checks.json). Subsequent real IPC inspection returned `ready:false`, missing `turnAllowance`, and `remainingTurns:0`. The two process turn slots had already been consumed; the harness did not observe those attempts or establish successful STT, reply generation, TTS, playback or acoustic interruption. Charges are not measured. **Count both slots against the authorized ten, leaving at most eight.** Do not reset the total by restarting a process.

A separate non-billable IPC check did confirm rejection of `w3_status({model:'untrusted'})` with `w3_invalid_request` in the hardened native backend.

No real microphone was activated by this harness, no provider audio was saved, and no transcript appears in the evidence. The synthetic PCM input was held only in the temporary session directory and deleted after the subsequent checks. This record is a **failed precondition**, not a passing live-loop test. Request/record an owner voice observation and rerun within the remaining allowance before claiming the planned full vertical slice.
