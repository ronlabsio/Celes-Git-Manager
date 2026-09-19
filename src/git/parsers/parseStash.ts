import { GitStash } from '../../models';

export function parseStash(output: string): GitStash[] {
  const result: GitStash[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const indexMatch = line.match(/^stash@\{(\d+)\}\s*:\s*/);
    if (!indexMatch) {
      continue;
    }

    const index = parseInt(indexMatch[1], 10);
    const raw = line.substring(indexMatch[0].length).trim();

    // Modern format: "On branch-name: message" or legacy "WIP on branch-name: sha message"
    const modernMatch = raw.match(/^On\s+(.+?):\s+(.+)$/i);
    const legacyMatch = raw.match(/^WIP on\s+(.+?):\s+([0-9a-f]+)\s+(.+)$/i);

    let branch: string | undefined;
    let message: string;

    if (modernMatch) {
      branch = modernMatch[1];
      message = modernMatch[2];
    } else if (legacyMatch) {
      branch = legacyMatch[1];
      message = legacyMatch[3];
    } else {
      message = raw;
    }

    result.push({
      index,
      message,
      date: new Date(),
      branch
    });
  }

  return result;
}
