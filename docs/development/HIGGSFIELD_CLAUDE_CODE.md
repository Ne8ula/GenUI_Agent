# Higgsfield in Claude Code

Connection update, 2026-09-17, following the owner's report that only ComfyUI was visible. This updates the connection status described in [the visual authoring guide](../design/HIGGSFIELD.md) without modifying that concurrently edited guide.

## What was missing

Higgsfield was installed as a command-line tool with companion skills in the Codex skills directory. That installation does not register a Claude Code MCP server. The existing global `comfy-cloud@comfy-skills` plugin explains why ComfyUI was visible in Claude Code.

The owner-requested Claude Code connection is now registered at project scope in `.mcp.json`:

```json
"higgsfield": {
  "type": "http",
  "url": "https://mcp.higgsfield.ai/mcp"
}
```

This is Higgsfield's [official MCP endpoint](https://higgsfield.ai/mcp). MCP makes the provider's tools visible to Astra in Claude Code; the existing CLI remains a shell-accessible route. Use one route for each job. No API key or authentication token was added to the repository.

## Finish activation

1. Start a new Claude Code process from this repository (`claude`, or `./scripts/agents/start-astra.ps1`).
2. Review and approve the project `higgsfield` server when Claude Code presents its MCP trust prompt.
3. Open `/mcp`, select `higgsfield`, and authenticate if requested. Alternatively, after approving the project server, run `claude mcp login higgsfield` in PowerShell and complete the provider's sign-in.
4. Use `/mcp` to confirm the connection, then ask Astra to list Higgsfield's available tools without generating anything.

Claude Code's [MCP documentation](https://code.claude.com/docs/en/mcp) describes connection management and authentication. The CLI account login and MCP OAuth connection are separate; successful CLI status does not establish MCP authorization.

## Verified status

- `higgsfield.cmd account status` succeeded under the owning Windows user. An active Plus account was reported; no credential files were read.
- The `higgsfield` HTTP entry was added to the project `.mcp.json`, preserving `claude-flow`.
- `claude mcp login higgsfield` refused to start OAuth while the project server was awaiting approval. This is Claude Code's project trust gate, not evidence of an invalid Higgsfield account.
- Authenticated MCP tool discovery and generation remain untested until that approval and sign-in are complete. No generation credits were spent by these checks.
- Existing Codex skills and the global ComfyUI plugin were left intact. Other-instance edits to planning/design/research files were not changed by this connection update.

For visual authoring, follow AGENTS.md, DESIGN.md, and the Higgsfield guide. Connection setup is not authorization to generate a concept, provision a hosted site, or start the optional ComfyUI experiment.
