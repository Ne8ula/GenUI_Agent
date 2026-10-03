import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SETUP_SOURCE = join(TEST_DIR, 'cloud-setup.sh');

function toBashPath(value) {
  if (process.platform !== 'win32') {
    return value;
  }

  const normalized = value.replaceAll('\\', '/');
  const drivePath = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  return drivePath
    ? `/${drivePath[1].toLowerCase()}/${drivePath[2]}`
    : normalized;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function writeExecutable(path, contents) {
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

function createFixture({ requiredDocs = true, rustTools = false } = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'eva-cloud-setup-'));
  const repoRoot = join(fixtureRoot, 'repo');
  const week4Dir = join(repoRoot, 'week4');
  const scriptsDir = join(week4Dir, 'scripts');
  const mockBin = join(fixtureRoot, 'mock-bin');
  const setupPath = join(scriptsDir, 'cloud-setup.sh');
  const npmLog = join(fixtureRoot, 'npm-args.log');
  const cargoLog = join(fixtureRoot, 'cargo-args.log');

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(mockBin, { recursive: true });
  copyFileSync(SETUP_SOURCE, setupPath);
  chmodSync(setupPath, 0o755);

  if (requiredDocs) {
    writeFileSync(join(repoRoot, 'AGENTS.md'), '# Synthetic test policy\n', 'utf8');
    writeFileSync(join(week4Dir, 'planning.md'), '# Synthetic test plan\n', 'utf8');
    writeFileSync(join(week4Dir, 'DESIGN_PROMPT.md'), '# Synthetic test design brief\n', 'utf8');
  }

  writeExecutable(
    join(mockBin, 'node'),
    `#!/bin/bash\nexec ${shellQuote(toBashPath(process.execPath))} "$@"\n`,
  );
  writeExecutable(
    join(mockBin, 'npm'),
    `#!/bin/bash\nif [[ "\${1-}" == "--version" ]]; then\n  printf '10.9.0\\n'\n  exit 0\nfi\nprintf '%s\\n' "$@" > "$MOCK_NPM_LOG"\n`,
  );

  if (rustTools) {
    writeExecutable(
      join(mockBin, 'cargo'),
      `#!/bin/bash\nif [[ "\${1-}" == "--version" ]]; then\n  printf 'cargo 1.90.0 (synthetic)\\n'\n  exit 0\nfi\nprintf '%s\\n' "$@" > "$MOCK_CARGO_LOG"\n`,
    );
    writeExecutable(
      join(mockBin, 'rustc'),
      "#!/bin/bash\nprintf 'rustc 1.90.0 (synthetic)\\n'\n",
    );
  }

  return {
    repoRoot,
    week4Dir,
    setupPath,
    mockBin,
    npmLog,
    cargoLog,
    cleanup() {
      rmSync(fixtureRoot, { force: true, recursive: true });
    },
  };
}

function writeNodePackage(fixture, { scripts = { test: 'node --test' }, lock = true } = {}) {
  writeFileSync(
    join(fixture.week4Dir, 'package.json'),
    `${JSON.stringify({ name: 'eva-week4-test', private: true, scripts }, null, 2)}\n`,
    'utf8',
  );
  if (lock) {
    writeFileSync(
      join(fixture.week4Dir, 'package-lock.json'),
      `${JSON.stringify({ name: 'eva-week4-test', lockfileVersion: 3, packages: {} }, null, 2)}\n`,
      'utf8',
    );
  }
}

function writeRustPackage(fixture, { lock = true } = {}) {
  writeFileSync(
    join(fixture.week4Dir, 'Cargo.toml'),
    '[package]\nname = "eva-week4-test"\nversion = "0.0.0"\n',
    'utf8',
  );
  if (lock) {
    writeFileSync(join(fixture.week4Dir, 'Cargo.lock'), '# synthetic lock\n', 'utf8');
  }
}

function runSetup(fixture, overrides = {}) {
  const env = { ...process.env };
  delete env.EVA_CLOUD_INSTALL_NODE_DEPS;
  delete env.EVA_CLOUD_NPM_LIFECYCLE_SCRIPTS;
  delete env.EVA_CLOUD_FETCH_RUST_DEPS;

  Object.assign(env, overrides, {
    MOCK_NPM_LOG: toBashPath(fixture.npmLog),
    MOCK_CARGO_LOG: toBashPath(fixture.cargoLog),
  });

  const result = spawnSync(
    'bash',
    [
      '--noprofile',
      '--norc',
      '-c',
      'PATH="$1"; export PATH; exec /bin/bash "$2"',
      'eva-cloud-setup-test',
      toBashPath(fixture.mockBin),
      toBashPath(fixture.setupPath),
    ],
    {
      encoding: 'utf8',
      env,
      timeout: 15_000,
    },
  );

  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function readArgumentLog(path) {
  if (!existsSync(path)) {
    return [];
  }

  return readFileSync(path, 'utf8').trimEnd().split('\n');
}

function assertSucceeded(result) {
  assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
}

test('fails clearly when the required repository documents are absent', (t) => {
  const fixture = createFixture({ requiredDocs: false });
  t.after(fixture.cleanup);

  const result = runSetup(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGENTS\.md/);
  assert.match(result.stderr, /week4[\\/]planning\.md/);
  assert.match(result.stderr, /week4[\\/]DESIGN_PROMPT\.md/);
  assert.match(result.stderr, /Publish\/upload the chosen source branch/);
  assert.deepEqual(readArgumentLog(fixture.npmLog), []);
});

test('treats an absent Week 4 manifest as deferred and never invokes npm ci', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  const result = runSetup(fixture);

  assertSucceeded(result);
  assert.match(result.stdout, /Node dependencies deferred: week4\/package\.json is absent/);
  assert.match(result.stdout, /No application server was started/);
  assert.deepEqual(readArgumentLog(fixture.npmLog), []);
});

test('installs only the locked Week 4 package with dev dependencies and scripts disabled', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  writeNodePackage(fixture);

  const result = runSetup(fixture);

  assertSucceeded(result);
  assert.deepEqual(readArgumentLog(fixture.npmLog), [
    '--prefix',
    toBashPath(fixture.week4Dir),
    'ci',
    '--include=dev',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
  ]);
});

test('enables npm lifecycle scripts only through the explicit control', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  writeNodePackage(fixture);

  const result = runSetup(fixture, {
    EVA_CLOUD_NPM_LIFECYCLE_SCRIPTS: '1',
  });

  assertSucceeded(result);
  assert.match(result.stderr, /npm lifecycle scripts are explicitly enabled/);
  assert.equal(readArgumentLog(fixture.npmLog).includes('--ignore-scripts'), false);
});

test('fails rather than generating a missing npm lockfile', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  writeNodePackage(fixture, { lock: false });

  const result = runSetup(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /package\.json exists without week4\/package-lock\.json/);
  assert.deepEqual(readArgumentLog(fixture.npmLog), []);
});

test('rejects package scripts that forward to the repository root or archives', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  writeNodePackage(fixture, {
    scripts: { test: 'npm --prefix ../week1 test' },
  });

  const result = runSetup(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forwards outside the standalone Week 4 package or targets an archive/);
  assert.deepEqual(readArgumentLog(fixture.npmLog), []);
});

test('validates every setup control as a strict Boolean without echoing its value', async (t) => {
  for (const variable of [
    'EVA_CLOUD_INSTALL_NODE_DEPS',
    'EVA_CLOUD_NPM_LIFECYCLE_SCRIPTS',
    'EVA_CLOUD_FETCH_RUST_DEPS',
  ]) {
    await t.test(variable, (subtest) => {
      const fixture = createFixture();
      subtest.after(fixture.cleanup);
      const invalidValue = 'not-a-boolean-secret-shaped-value';

      const result = runSetup(fixture, { [variable]: invalidValue });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(`${variable} must be exactly 0 or 1`));
      assert.equal(result.stderr.includes(invalidValue), false);
      assert.deepEqual(readArgumentLog(fixture.npmLog), []);
    });
  }
});

test('honors Node dependency opt-out without running npm ci', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  writeNodePackage(fixture);

  const result = runSetup(fixture, {
    EVA_CLOUD_INSTALL_NODE_DEPS: '0',
  });

  assertSucceeded(result);
  assert.match(result.stdout, /EVA_CLOUD_INSTALL_NODE_DEPS=0/);
  assert.deepEqual(readArgumentLog(fixture.npmLog), []);
});

test('defers Rust cleanly when no Week 4 Cargo manifest exists', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  const result = runSetup(fixture, {
    EVA_CLOUD_FETCH_RUST_DEPS: '1',
  });

  assertSucceeded(result);
  assert.match(result.stdout, /Rust dependency fetch deferred: week4\/Cargo\.toml is absent/);
  assert.deepEqual(readArgumentLog(fixture.cargoLog), []);
});

test('requires a lockfile when Rust fetching is requested', (t) => {
  const fixture = createFixture({ rustTools: true });
  t.after(fixture.cleanup);
  writeRustPackage(fixture, { lock: false });

  const result = runSetup(fixture, {
    EVA_CLOUD_FETCH_RUST_DEPS: '1',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Rust fetch was requested, but week4\/Cargo\.lock is missing/);
  assert.deepEqual(readArgumentLog(fixture.cargoLog), []);
});

test('fetches only the locked Week 4 Rust manifest when explicitly requested', (t) => {
  const fixture = createFixture({ rustTools: true });
  t.after(fixture.cleanup);
  writeRustPackage(fixture);

  const result = runSetup(fixture, {
    EVA_CLOUD_FETCH_RUST_DEPS: '1',
  });

  assertSucceeded(result);
  assert.deepEqual(readArgumentLog(fixture.cargoLog), [
    'fetch',
    '--locked',
    '--manifest-path',
    toBashPath(join(fixture.week4Dir, 'Cargo.toml')),
  ]);
});

test('fails clearly when a requested Rust fetch has no cargo command', (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  writeRustPackage(fixture);

  const result = runSetup(fixture, {
    EVA_CLOUD_FETCH_RUST_DEPS: '1',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /working cargo command is unavailable on PATH/);
  assert.deepEqual(readArgumentLog(fixture.cargoLog), []);
});
