# Candidate 05 — source eye restored

2026-09-27, Week 3, accepted baseline **none**. Source `fc33b6b` plus uncommitted changes. **Intermediate, superseded by candidate 06; not accepted.**

This replaces the rejected invented eye with the real Week 1 equations transferred to bounded CPU rasterization. Main added original gaze/tissue/blink dynamics and a shared triangular mesh for transformed pixels and tracking landmarks, protecting the square pupil. Seeded harmonic variation supplements the five fold/lift/bloom/fan/twist families. Broader colors occur during actual speaking; rest returns red.

[Rest](idle.png), [left](look-left.png), [right](look-right.png), [celebration](congratulatory-2.png), [processing](processing.png), [motion](page@4752dc2598bff5991bf9a45eeec61d32.webm). [Checks/seeds](checks.json) include three variations per stance, gaze in both directions, slower tissue following, blink observation, reduced/End staticness, keyboard and resize checks. Source eye comparison is [separate](../w3-20260927-source-eye/README.md).

Main review found faint triangle-edge seams and a nearly-neutral (rather than exactly zero) resting warp. Candidate 06 fixes those and incorporates a pixel-identical CPU optimization. Build and **112 integrated tests** passed before this capture; this fixture runner passed. Browser: Windows 11 / Chrome 153, 1400×900/DPR 1 plus 390×844. No microphone/providers or voice judgment; timing is browser scheduling/JS drawing only.

Actual author routes: Sol for the source transfer, Sonnet 5 for morphology/feature-overlay integration, Astra for integration, mesh/pupil protection, cursor handling and captures. Tools: native Agent, local file/shell/npm, Playwright. Original Week 1 code and local procedural effects, not artist/reference frames. Owner acceptance remains pending, with Week 1 identity fidelity and genuinely different response forms to be reviewed in the next candidate.
