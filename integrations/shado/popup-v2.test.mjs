import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../../week4/node_modules/typescript/lib/typescript.js');
const patch = await readFile(new URL('./eva-room-bridge-v2.patch', import.meta.url), 'utf8');
function addedFile(name) {
  const section = patch.split(`diff --git a/${name} b/${name}\n`)[1]?.split('\ndiff --git ')[0];
  assert.ok(section?.includes('new file mode 100644'), `Missing new source ${name}`);
  return section.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
}
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const handoffUrl = moduleUrl(addedFile('src/lib/eva-room-handoff.mjs'));
const controllerUrl = moduleUrl(addedFile('src/lib/eva-room-authorization.mjs')
  .replace("'./eva-room-handoff.mjs'", JSON.stringify(handoffUrl)));
await import(moduleUrl(addedFile('src/lib/eva-room-authorization.test.mjs')
  .replace("'./eva-room-authorization.mjs'", JSON.stringify(controllerUrl))));
test('reviewable popup TSX parses without errors; full Shado application build remains separate', () => {
  const source = addedFile('src/app/eva-room-authorize/authorize-room.tsx');
  const result = ts.transpileModule(source, { fileName: 'authorize-room.tsx', reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), []);
});
