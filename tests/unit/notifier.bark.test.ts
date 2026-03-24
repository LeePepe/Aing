import { describe, expect, it, vi } from 'vitest';
import { sendBarkNotification } from '../../src/notifier/bark.js';

describe('sendBarkNotification', () => {
  it('sends POST to bark API with correct payload', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true });
    await sendBarkNotification(
      { key: 'test-key', title: 'Hello', body: 'World' },
      { fetch }
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.day.app/push');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      device_key: 'test-key',
      title: 'Hello',
      body: 'World',
    });
  });

  it('handles special characters in title and body', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true });
    await sendBarkNotification(
      { key: 'k', title: 'He said "hi"', body: 'line1\nline2' },
      { fetch }
    );

    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body.title).toBe('He said "hi"');
    expect(body.body).toBe('line1\nline2');
  });

  it('does not throw when fetch rejects', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('network error'));
    await expect(
      sendBarkNotification({ key: 'k', title: 't', body: 'b' }, { fetch })
    ).resolves.toBeUndefined();
  });

  it('does not throw when fetch returns non-ok status', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(
      sendBarkNotification({ key: 'k', title: 't', body: 'b' }, { fetch })
    ).resolves.toBeUndefined();
  });
});
