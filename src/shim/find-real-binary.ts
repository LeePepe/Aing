import { constants, realpathSync } from 'node:fs';
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

function trimTrailingSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

function canonicalPath(p: string): string {
  const trimmed = trimTrailingSlash(p);
  if (!trimmed) return trimmed;
  try {
    return realpathSync(trimmed);
  } catch {
    return trimmed;
  }
}

function parseSkipDirs(skipDirsEnv?: string): Set<string> {
  const dirs = (skipDirsEnv ?? '')
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean);

  return new Set(dirs.map(canonicalPath));
}

function collectPrefixDirsBeforeShim(pathDirs: string[], shimCanonical: string): Set<string> {
  const prefixDirs = new Set<string>();
  if (!shimCanonical) return prefixDirs;

  for (const dir of pathDirs) {
    const canonicalDir = canonicalPath(dir);
    if (canonicalDir === shimCanonical) {
      break;
    }
    prefixDirs.add(canonicalDir);
  }

  return prefixDirs;
}

export function findRealBinary(
  name: string,
  pathEnv: string,
  shimDir: string,
  exists: ExistsFn = defaultExists,
  skipDirsEnv?: string,
  skipBeforeShimInPath = false
): string | null {
  const dirs = pathEnv
    .split(':')
    .map((dir) => trimTrailingSlash(dir))
    .filter(Boolean);
  const shimCanonical = shimDir ? canonicalPath(shimDir) : '';
  const skipDirs = parseSkipDirs(skipDirsEnv);
  const prefixSkipDirs = skipBeforeShimInPath ? collectPrefixDirsBeforeShim(dirs, shimCanonical) : new Set<string>();

  for (const dir of dirs) {
    const canonicalDir = canonicalPath(dir);

    if (shimCanonical && canonicalDir === shimCanonical) {
      continue;
    }
    if (skipDirs.has(canonicalDir)) {
      continue;
    }
    if (prefixSkipDirs.has(canonicalDir)) {
      continue;
    }

    const full = join(dir, name);
    if (exists(full)) {
      return full;
    }
  }

  return null;
}
