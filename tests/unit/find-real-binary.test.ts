import { chmod, mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRealBinary } from '../../src/shim/find-real-binary.js';

describe('findRealBinary', () => {
  it('skips shim dir even when PATH uses a symlink alias', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-find-real-'));
    const shimRealDir = join(root, 'shim-real');
    const shimAliasDir = join(root, 'shim-alias');
    const realDir = join(root, 'real');

    await mkdir(shimRealDir, { recursive: true });
    await mkdir(realDir, { recursive: true });
    await symlink(shimRealDir, shimAliasDir);

    const shimBinary = join(shimRealDir, 'claude');
    const realBinary = join(realDir, 'claude');

    await writeFile(shimBinary, '#!/bin/sh\n');
    await writeFile(realBinary, '#!/bin/sh\n');
    await chmod(shimBinary, 0o755);
    await chmod(realBinary, 0o755);

    const result = findRealBinary('claude', `${shimAliasDir}:${realDir}`, shimRealDir);
    expect(result).toBe(realBinary);
  });

  it('skips directories listed in AING_NOTIFY_SKIP_BIN_DIRS style value', () => {
    const result = findRealBinary(
      'claude',
      '/superset:/real:/other',
      '/shim',
      (p) => p === '/real/claude',
      '/superset'
    );
    expect(result).toBe('/real/claude');
  });

  it('can skip PATH directories before shim dir to avoid wrapper bounce', () => {
    const result = findRealBinary(
      'claude',
      '/superset:/shim:/real',
      '/shim',
      (p) => p === '/superset/claude' || p === '/real/claude',
      undefined,
      true
    );

    expect(result).toBe('/real/claude');
  });
});
