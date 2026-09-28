// Local Windows/macOS keeps the existing Chrome route; Linux uses installed Playwright Chromium.
export function browserOptions(env = process.env, platform = process.platform) {
  const channel = env.EVA_BROWSER_CHANNEL ?? (platform === 'linux' ? 'chromium' : 'chrome');
  if (!['chromium', 'chrome', 'msedge'].includes(channel)) {
    throw new Error('EVA_BROWSER_CHANNEL must be chromium, chrome or msedge');
  }
  return { headless: true, ...(channel === 'chromium' ? {} : { channel }) };
}
