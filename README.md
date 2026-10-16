# EVA for Dreamatorium

**EVA is Dreamatorium's agent.** GenUI_Agent is aligned with **Track C: genuine 3D reconstruction plus expressive rendering and spatial experience**, combining Dreamatorium Systems B and C. Video-model creation remains upstream in Track A; revisions are supporting functionality, not the primary research contribution. See the [canonical plan](PLANNING.md), [research proposal](docs/research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md), and [full implementation plan](docs/research/EVA_RESEARCH_IMPLEMENTATION_PLAN.md).

**Repository and paper split:** Shado owns flowchart Steps 1–5 and the model/geometric-learning paper. GenUI_Agent owns Steps 6–7 and an HCI paper about spatial understanding, exploration behavior, and evidence interpretation. The [seven-step flowchart](docs/research/figures/dreamatorium-seven-step-flow.png) is embedded in both plans and the proposal. Benefits from Shado's outputs require a matched upstream-to-human study; better geometry alone does not establish better interaction.

Weeks 1–4 provide implemented eye, particle, voice, control, and browser-rendering foundations with different validation and acceptance states. Source-derived Paris graphics are not yet evidence of a genuine reconstruction pipeline. The [capability audit](docs/research/EVA_IMPLEMENTATION_STATUS.md) separates implemented work, recorded checks, concurrent integration, and proposals. The next new technical milestone is reconstruction → scene import → navigation → an anchored expressive layer.

Development is orchestrated by **Astra inside Claude Code**, as specified in [AGENTS.md](AGENTS.md) and the [development workflow](docs/development/AGENT_WORKFLOW.md). This harness choice is separate from EVA's application runtime and research conditions.

The successful Week 1 desktop demo is isolated in **[week1/](week1/README.md)**, including its application, Rust backend, fixtures, tests, setup notes and design history.

Week 2's weather experiment (E1) lives in **[week2/](week2/README.md)**, with its screenshots, recording and design history. Run it with `npm.cmd --prefix week2 run dev`.

From this repository root, existing commands still work:

```powershell
npm.cmd run desktop:dev
npm.cmd run build
npm.cmd test
```

On a fresh checkout, first run `npm.cmd ci --prefix week1`. Private voice settings belong in `week1/.env.local`; see the [Week 1 README](week1/README.md).

Shared project sources remain here: [product planning](PLANNING.md), [design system](DESIGN.md), [development instructions](AGENTS.md), [independent-study proposal](docs/research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md), and [creative-tool workflow](docs/design/FIGMA_WEAVE.md). The `output/` exports and research concepts are shared project artifacts. Week 1 success does not imply completion of later study or product milestones.
