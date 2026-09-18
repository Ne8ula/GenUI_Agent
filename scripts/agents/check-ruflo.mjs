// Read-only MCP handshake/tool-schema check. Never dispatches work or calls a model.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../../.mcp.json', import.meta.url)));
const server = config.mcpServers['claude-flow'];
const child = spawn(server.command, server.args, {
  cwd: root, env: { ...process.env, ...server.env }, windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buffer = '';
let nextId = 0;
const pending = new Map();
let stderr = '';
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
child.on('error', error => { for (const p of pending.values()) p.reject(error); });
child.on('exit', code => {
  for (const p of pending.values()) p.reject(new Error(`MCP exited ${code}: ${stderr}`));
});
child.stdout.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const timeout = setTimeout(() => {
  for (const p of pending.values()) p.reject(new Error(`Ruflo MCP did not respond within 30 seconds. ${stderr}`));
}, 30_000);
try {
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'eva-agent-config-check', version: '1.0.0' },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const { tools } = await request('tools/list', {});
  const required = ['hooks_route', 'swarm_init', 'swarm_status', 'agent_spawn', 'memory_search'];
  const missing = required.filter(name => !tools.some(tool => tool.name === name));
  if (missing.length) throw new Error(`Missing tools: ${missing.join(', ')}`);
  const agent = tools.find(tool => tool.name === 'agent_spawn');
  console.log(JSON.stringify({
    status: 'passed', server: initialized.serverInfo, toolCount: tools.length,
    requiredTools: required, agentModelEnum: agent.inputSchema.properties.model?.enum,
    note: 'Handshake and schemas only; no agent execution or model-access claim.',
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  pending.clear();
  child.stdin.end();
  // EOF ends the stdio server; this timeout only terminates this check's direct child.
  const cleanup = setTimeout(() => child.kill(), 2000);
  cleanup.unref();
}
