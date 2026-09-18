# EVA

EVA explores **expressive responses that users can revise**: ordinary information answered through readable facts, movement, spatial composition, timing, and explicit intervention. The current research asks when a composition's response to correction or redirection is experienced as attention and meaningful influence. See the [research entry point](docs/research/INDEX.md), [canonical plan](PLANNING.md), and [design grammar](DESIGN.md).

The proposed next experiment is [a revisable synthetic NYC weather response](docs/design/experiments/E1_REVISABLE_WEATHER.md). Research/documentation are authorized; the next implementation and study phase remain pending. Personal relationship development and an exhibit are separate later tracks.

Development is orchestrated by **Astra inside Claude Code**, as specified in [AGENTS.md](AGENTS.md) and the [development workflow](docs/development/AGENT_WORKFLOW.md). This harness choice is separate from EVA's application runtime and research conditions.

The successful Week 1 desktop demo is isolated in **[week1/](week1/README.md)**, including its application, Rust backend, fixtures, tests, setup notes and design history.

From this repository root, existing commands still work:

```powershell
npm.cmd run desktop:dev
npm.cmd run build
npm.cmd test
```

On a fresh checkout, first run `npm.cmd ci --prefix week1`. Private voice settings belong in `week1/.env.local`; see the [Week 1 README](week1/README.md).

Shared project sources remain here: [product planning](PLANNING.md), [design system](DESIGN.md), [development instructions](AGENTS.md), [independent-study proposal](docs/research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md), and [creative-tool workflow](docs/design/HIGGSFIELD.md). The `output/` exports and research concepts are shared project artifacts. Week 1 success does not imply completion of later study or product milestones.
