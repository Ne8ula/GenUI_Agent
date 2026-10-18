// Process reminder only: no upload, generation, spending or permission grant.
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const event = input.hook_event_name;
if (['SessionStart', 'SubagentStart', 'PreToolUse'].includes(event)) {
  const additionalContext = [
    'EVA midterm: read AGENTS.md and PLANNING.md; historical Paris/Cloud prompts are retired.',
    'Before every frontend/UI edit or visual pass, follow docs/design/FIGMA_WEAVE.md:',
    'fresh change-specific Weave images, plus video for motion, through direct models or reusable workflows.',
    'Inspect outputs and record actual route/model/run IDs, settings, finite cost approval and guidance.',
    'Use REVIEW.md, references/images, references/videos, contact sheet, implementation/before and after, and provenance.json.',
    'One packet covers its bounded pass. No inherited spending or historical reference exception.',
    'Missing prerequisites block UI work, not independent non-UI work. Preserve owner acceptance gates.',
  ].join(' ');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext },
  }));
}
