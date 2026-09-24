# EVA brain workspace

Headless TypeScript workspace for EVA's orchestration, memory and personality track. See [PLANNING.md](PLANNING.md) for scope and stages, [docs/decisions.md](docs/decisions.md) for the decision log, and [docs/acceptance/brain.md](docs/acceptance/brain.md) for the (pending) owner acceptance record.

Requires Node >= 24.14. From this directory:

```sh
npm ci
npm run check          # validators --check, tsc --noEmit, node --test
npm run generate:validators
```

This workspace imports nothing from `experiments/e1` or `week1/` until Stage B9.
