import * as path from 'path';
import * as fs from 'fs';

export function resolveSafePath(basePath: string, relativePath: string): string {
  const resolved = path.resolve(basePath, relativePath);
  const relative = path.relative(basePath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Invalid path: ${relativePath}`);
  }
  return resolved;
}

export async function findGitRoot(startPath: string): Promise<string | undefined> {
  let current = startPath;
  const root = path.parse(current).root;

  let searching = true;
  while (searching) {
    const gitDir = path.join(current, '.git');
    try {
      const stat = await fs.promises.stat(gitDir);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // continue searching upward
    }

    if (current === root) {
      searching = false;
    } else {
      current = path.dirname(current);
    }
  }

  return undefined;
}
