// Mirrors week3/scripts/browser-options.mjs. Local Windows/macOS keeps the existing Chrome route;
// Linux uses the installed Playwright Chromium. Override with EVA_BROWSER_CHANNEL.
export function browserOptions(env = process.env, platform = process.platform) {
  const channel = env.EVA_BROWSER_CHANNEL ?? (platform === 'linux' ? 'chromium' : 'chrome');
  if (!['chromium', 'chrome', 'msedge'].includes(channel)) {
    throw new Error('EVA_BROWSER_CHANNEL must be chromium, chrome or msedge');
  }
  return { headless: true, ...(channel === 'chromium' ? {} : { channel }) };
}
