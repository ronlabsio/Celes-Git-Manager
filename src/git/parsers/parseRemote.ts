import { GitRemote } from '../../models';

export function parseRemotes(output: string): GitRemote[] {
  const seen = new Set<string>();
  const remotes: GitRemote[] = [];

  for (const line of output.split(/\r?\n/).filter((l) => l.trim())) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }

    const [name, url, kind] = parts;
    const key = `${name}|${url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    remotes.push({
      name,
      url,
      fetch: kind === '(fetch)'
    });
  }

  return remotes;
}
