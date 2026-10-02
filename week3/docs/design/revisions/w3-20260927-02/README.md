# Candidate 02 — intermediate geometry

> **Week 3 cleanup:** the screenshots and recordings linked below were removed. Recover them from git commit `7c44235`.

2026-09-27, Week 3, accepted baseline **none**. Source: `53203fa` / concurrent `fc33b6b` plus then-uncommitted changes; an exact source digest was not recorded for this intermediate. **Superseded, not owner accepted.**

Astra integrated Sonnet's first framing/shading refinement. Main inspected [attention](attentive-1.png): the result remained a small, opaque, pinched shape, not the requested reference treatment. Later work corrected the hex/RGB alpha bug and replaced this approach. The owner's subsequent clarification requires the original Week 1 eye; this candidate does not satisfy it.

Executed: `npm --prefix week3 test`, `run build`, and `run capture`. **Tests: 67 passed, 1 failed** (interrupted box-opacity settling); build and browser capture passed. The original command chain continued after that failed test, so its final shell exit zero is not a suite-pass claim. Later source fixes the settling behavior.

[Checks/seeds](checks.json), [processing](processing.png), [reduced motion](reduced-motion.png), [motion recording](page@4b8bfd4dd91529bf7b35bc4f7bc073b1.webm). Three independently seeded occurrences per grammar are retained as `*-1.png` through `*-3.png`.

Windows 11, headless Chrome 153.0.8010.53, 1400×900/DPR 1; additional 390×844 resize. Synthetic fixtures only, no microphone/providers. Static reduced/End, overflow, keyboard and browser live-disable checks passed. rAF intervals are scheduling observations, not native/voice-load measurements. Models/tools: Gateway-observed Astra/Sonnet 5; native Agent, shell/npm and Playwright. Original procedural material; font licenses bundled. Owner review and all phase acceptance remain pending.
