# EVA

The successful Week 1 desktop demo is isolated in **[week1/](week1/README.md)**, including its application, Rust backend, fixtures, tests, setup notes and design history.

From this repository root, existing commands still work:

```powershell
npm.cmd run desktop:dev
npm.cmd run build
npm.cmd test
```

On a fresh checkout, first run `npm.cmd ci --prefix week1`. Private voice settings belong in `week1/.env.local`; see the [Week 1 README](week1/README.md).

Shared project sources remain here: [product planning](PLANNING.md), [design system](DESIGN.md), [development instructions](AGENTS.md), [independent-study proposal](docs/research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md), and [creative-tool workflow](docs/design/HIGGSFIELD.md). The `output/` exports and research concepts are shared project artifacts. Week 1 success does not imply completion of later study or product milestones.
