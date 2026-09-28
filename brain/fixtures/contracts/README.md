# Contract fixtures

One folder per schema in `brain/schemas/`, each with `valid/` and `invalid/`. Everything here is synthetic and public-safe: fictional IDs, no real names, paths, emails, keys or vault content.

- **`valid/*.json`** are complete documents that must pass the schema's generated validator.
- **`invalid/*.json`** are declarative negatives. Each names a valid base document, a JSON Patch (RFC 6902 `add` / `replace` / `remove`) to apply to it, and the Ajv keyword (and optionally the instance path) the result must fail with:

  ```json
  {
    "description": "A candidate cannot set its own review decision.",
    "base": "explicit-preference.json",
    "patch": [{ "op": "add", "path": "/proposal/reviewDecision", "value": "accept" }],
    "expect": { "keyword": "additionalProperties", "instancePath": "/proposal" }
  }
  ```

  The test first checks that the base passes, so each negative differs from a passing document only by the change it describes and fails for the stated reason.

Naming rules checked by `tests/contracts-fixtures.test.ts`:

- every schema has at least one `invalid/unknown-*.json` that only adds a field;
- every label-bearing schema also has an `invalid/unknown-label-*.json` or `invalid/unknown-authority-*.json`.
