import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../../week4/node_modules/typescript/lib/typescript.js');
// Exercise the reviewable patch, without relying on an ignored local worktree.
const patch = await readFile(new URL('./eva-room-bridge-v2.patch', import.meta.url), 'utf8');
function addedFile(name) {
  const section = patch.split(`diff --git a/${name} b/${name}\n`)[1]?.split('\ndiff --git ')[0];
  assert.ok(section?.includes('new file mode 100644'), `Missing new source ${name}`);
  return section.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
}
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const grantsUrl = moduleUrl(addedFile('src/server/eva-room-grant.mjs'));
const grants = await import(grantsUrl);
const authority = await import(moduleUrl(addedFile('src/server/eva-room-authority.mjs').replace("'./eva-room-grant.mjs'", JSON.stringify(grantsUrl))));
const source = addedFile('src/app/api/eva-room-bridge/route.ts');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const asset = { sourceId: 'photo-1', version: 'v1', sha256: 'a'.repeat(64), size: 1024, mimeType: 'image/jpeg' };
const project = '{"project":"fixture"}', recipe = { inputs: [{ ...asset, kind: 'image' }], modelId: 'fixture-video' };
const recipeHash = 'b'.repeat(64), secret = 'synthetic-route-test-secret'.repeat(2);
const clerk = { id: 'user_test1', sessionId: 'sess_test1', organizationId: 'org_test1', role: 'member' };
const identity = { ownerId: clerk.id, scopeKey: 'clerk:org_test1:user_test1', role: 'member' };
function route({ sealed = false, existingTask = null } = {}) {
  const calls = [], exports = {};
  class ServiceError extends Error { constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); } }
  const sameOrigin = request => {
    calls.push('authenticate');
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new ServiceError('invalid_origin', 'Rejected', 403);
    return clerk;
  };
  const mocks = {
    '@/server/eva-room-grant.mjs': grants, '@/server/eva-room-authority.mjs': authority,
    '@/server/auth': { requireBillingIdentity: async request => { sameOrigin(request); return identity; } },
    '@/server/clerk': { requireClerkIdentity: async request => sameOrigin(request), clerkAccess: async () => ({ require: async () => clerk }) },
    '@/server/clerk-config': { configuredClerk: () => ({ organizationId: clerk.organizationId }) },
    '@/server/terms-provider': { clerkTermsAcceptance: async () => ({ require: async () => {} }) },
    '@/server/management-policy': { organizationOwner: () => identity.ownerId },
    '@/server/errors': { ServiceError, identifier: value => value, objectValue: value => value, readBody: request => request.json(),
      errorResponse: error => Response.json({ ok: false, error: { code: error.code } }, { status: error.status ?? 500 }) },
    '@/lib/project-store': { parseProject: () => ({ id: 'project-1' }) },
    '@/lib/generation-client': { prepareGeneration: async () => ({ recipe }) },
    '@/lib/model-catalog': { getModelDefinition: () => ({ outputKind: 'video' }) },
    '@/server/generation': { parseRecipe: value => value, recipeHash: () => recipeHash },
    '@/server/media': { generationMediaRequest: async () => { calls.push('media'); return { asset: { ...asset, sealed } }; } },
    '@/server/workspace-media-deletion-store': { assertWorkspaceMediaAvailable: async () => {} },
    '@/server/runtime': { requireStore: () => ({}) },
    '@/server/server-quotes': { createServerQuote: async () => {
      calls.push('quote'); if (!sealed) throw new ServiceError('pricing_inputs_pending', 'Pending', 409);
      return { id: 'quote-1', pricing: { amountMicros: 500_000 }, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    } },
    '@/server/public-generation-quote': { publicGenerationQuote: value => value },
    '@/server/eva-room-proposal': { createEvaRoomProposal: async () => ({ project, recipe }) },
    '@/server/balance': {}, '@/server/billing-read': {}, '@/server/generation-tasks': {},
    '@/server/generation-task-runtime': { requireGenerationTasks: () => ({ tasks: { get: async (ownerId, taskId) => {
      calls.push('existing-task'); assert.equal(ownerId, identity.ownerId); assert.equal(taskId, 'task-1'); return existingTask;
    } } }) },
  };
  vm.runInNewContext(javascript, { exports, require: id => {
    if (!(id in mocks)) throw Error(`Unexpected dependency ${id}`); return mocks[id];
  }, Buffer, Response, Date, process: { env: { SHADO_EVA_BRIDGE_SECRET: secret } } });
  const post = (body, headers = { origin: 'https://shado.example' }) => exports.POST(new Request('https://shado.example/api/eva-room-bridge',
    { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  return { calls, post };
}
const body = phase => ({ operation: 'grant', phase, quoteId: phase === 'generation' ? 'quote-1' : null, taskId: 'task-1',
  project, nodeId: 'node-1', assets: [asset], approved: true, maximumMicros: phase === 'generation' ? 500_000 : 0 });
test('actual route proposal and upload-grant do not quote missing media', async () => {
  const api = route();
  const proposal = await api.post({ operation: 'proposal', packet: {} });
  assert.equal(proposal.status, 200); assert.equal((await proposal.json()).next, 'upload-authorization');
  const uploaded = await api.post(body('upload')), result = await uploaded.json();
  assert.equal(uploaded.status, 200); assert.equal(result.phase, 'upload');
  assert.equal(grants.verifyGrant(result.token, secret).maximumMicros, 0);
  assert.equal(api.calls.includes('media'), false); assert.equal(api.calls.includes('quote'), false);
});
test('actual route cannot issue generation permission before originals are sealed', async () => {
  const api = route(), result = await api.post(body('generation'));
  assert.equal(result.status, 403); assert.equal(api.calls.includes('media'), true); assert.equal(api.calls.includes('quote'), false);
});
test('actual route binds generation to current sealed-input quote and rejects cross-origin issuance', async () => {
  const api = route({ sealed: true }), response = await api.post(body('generation')), result = await response.json();
  assert.equal(response.status, 200);
  const grant = grants.verifyGrant(result.token, secret);
  assert.equal(grant.phase, 'generation'); assert.equal(grant.quoteId, 'quote-1');
  assert.ok(api.calls.indexOf('media') < api.calls.indexOf('quote'));
  assert.equal((await api.post({ ...body('generation'), quoteId: 'stale' })).status, 403);
  assert.equal((await api.post(body('upload'), { origin: 'https://other.example' })).status, 403);
});
test('actual route rejects upload bearer submission before task admission', async () => {
  const api = route(), issued = await (await api.post(body('upload'))).json();
  const result = await api.post({ operation: 'submit' }, { authorization: `Bearer ${issued.token}` });
  assert.equal(result.status, 403);
});
test('actual route recovers only existing task with no upload quote or generation authority', async () => {
  assert.equal((await route().post(body('recovery'))).status, 403);
  const existingTask = { id: 'task-1', ownerId: identity.ownerId, projectId: 'project-1',
    state: { status: 'failed' }, manifest: { scopeKey: identity.scopeKey, count: 1,
      quotes: [{ nodeId: 'node-1', recipeHash }] } };
  const api = route({ existingTask }), response = await api.post(body('recovery')), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.phase, 'recovery'); assert.equal(result.maximumMicros, 0);
  assert.equal(api.calls.includes('media'), false); assert.equal(api.calls.includes('quote'), false);
  assert.equal((await api.post({ operation: 'submit' }, { authorization: `Bearer ${result.token}` })).status, 403);
  assert.equal((await route({ existingTask: { ...existingTask, ownerId: 'someone-else' } }).post(body('recovery'))).status, 403);
  assert.equal((await api.post({ ...body('recovery'), role: 'manager' })).status, 403);
});
