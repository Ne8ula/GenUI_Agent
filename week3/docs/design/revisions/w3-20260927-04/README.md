# Candidate 04 — matrix refinement

2026-09-27, Week 3, accepted baseline **none**. Source: `fc33b6b` plus then-uncommitted changes; no exact intermediate source digest. **Rejected direction / superseded by the owner's Week 1 identity clarification.**

Main enlarged the invented eye, added annular shading and multiscale connected boxes, and replaced solid processing bands with fine RGB scanline smears. [Processing](processing.png), [celebration](congratulatory-2.png), [motion](page@d41da21be9c417e2c6a073bb8eb5befc.webm). This is preserved, not presented as the requested original eye.

Owner feedback after this direction: the eye should still be based on Week 1, with more different forms consistent with it. Clarifications selected its silhouette/square pupil, dithering and cursor response; transformation of the eye itself; broader response colors. See [the recorded refinement](../../REFERENCE_REFINEMENT.md).

Checks: **89 frontend tests passed**, TypeScript/Vite build passed, fixture capture passed. A first geometry test incorrectly measured overlay-box corners as the eye contour; the final assertion checks the actual contour mapping instead. [Browser results/seeds](checks.json). Windows 11, Chrome 153, 1400×900/DPR 1; phone 390×844. Three variations per stance, interruption, reduced/End staticness and keyboard/overflow checks retained.

[Native capture](native-processing.png) and [native results](native-checks.json): actual WebView2, synthetic processing fixture, software rendering requested, no mic/providers. These scheduling samples are not live voice-load, acoustic or GPU measurements. Author routes: Astra integration/refinement and native Sonnet 5 UI worker. Tools: shell/npm, native Tauri, Playwright. No cloud visual generation or copied reference frames. Owner acceptance remains pending.
