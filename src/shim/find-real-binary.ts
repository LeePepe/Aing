import { constants } from 'node:fs';
import { accessSync } from 'node:fs';
import { join } from 'node:path';

export type ExistsFn = (fullPath: string) => boolean;

function defaultExists(fullPath: string): boolean {
  try {
    accessSync(fullPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function findRealBinary(
  name: string,
  pathEnv: string,
  shimDir: string,
  exists: ExistsFn = defaultExists
): string | null {
  const dirs = pathEnv.split(':').filter(Boolean);

  for (const dir of dirs) {
    const normalized = dir.replace(/\/+$/, '');
    if (shimDir && normalized === shimDir.replace(/\/+$/, '')) {
      continue;
    }

    const full = join(normalized, name);
    if (exists(full)) {
      return full;
    }
  }

  return null;
}
