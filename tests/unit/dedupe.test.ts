import { describe, expect, it } from 'vitest';
import { Deduper } from '../../src/dedupe.js';

describe('Deduper', () => {
  it('dedupes keys inside ttl', () => {
    const d = new Deduper(8_000, () => 1_000);
    expect(d.shouldNotify('k')).toBe(true);
    expect(d.shouldNotify('k')).toBe(false);
  });

  it('allows event again after ttl', () => {
    let now = 1_000;
    const d = new Deduper(100, () => now);
    expect(d.shouldNotify('k')).toBe(true);
    now = 1_050;
    expect(d.shouldNotify('k')).toBe(false);
    now = 1_200;
    expect(d.shouldNotify('k')).toBe(true);
  });
});
