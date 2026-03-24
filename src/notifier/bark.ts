export interface BarkInput {
  key: string;
  title: string;
  body: string;
}

export interface BarkDeps {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

export async function sendBarkNotification(input: BarkInput, deps: BarkDeps = {}): Promise<void> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    await fetchFn('https://api.day.app/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_key: input.key,
        title: input.title,
        body: input.body,
      }),
      signal: controller.signal,
    });
  } catch {
    // Silent failure – notifications are best-effort
  } finally {
    clearTimeout(timer);
  }
}
