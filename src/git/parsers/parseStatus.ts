import { GitChanges, GitFileChange, RepositoryStatus } from '../../models';

function parsePorcelainV1(line: string): GitFileChange | undefined {
  if (line.length < 3) {
    return undefined;
  }

  const indexStatus = line[0] === ' ' ? '' : line[0];
  const worktreeStatus = line[1] === ' ' ? '' : line[1];
  const rest = line.substring(3);

  let path = rest;
  let originalPath: string | undefined;

  const renameMarker = /^(.*?) -> (.*?)$/;
  const match = renameMarker.exec(rest);
  if (match) {
    originalPath = match[1];
    path = match[2];
  }

  const staged = indexStatus !== '' && indexStatus !== '?';
  const untracked = indexStatus === '?' || worktreeStatus === '?';
  const unstaged = !untracked && worktreeStatus !== '';

  return {
    path,
    indexStatus,
    worktreeStatus,
    originalPath,
    staged,
    unstaged,
    untracked
  };
}

export function parseStatus(output: string, currentBranch: string, initialCommit: boolean): RepositoryStatus {
  const lines = output.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const changes: GitChanges = {
    staged: [],
    unstaged: [],
    untracked: []
  };

  for (const line of lines) {
    if (line.startsWith('#')) {
      // ignore branch status lines for now; captured separately
      continue;
    }

    const change = parsePorcelainV1(line);
    if (!change) {
      continue;
    }

    if (change.untracked) {
      changes.untracked.push(change);
    } else if (change.staged) {
      changes.staged.push(change);
    }

    if (change.unstaged) {
      changes.unstaged.push(change);
    }
  }

  return {
    isGitRepository: true,
    currentBranch,
    ahead: 0,
    behind: 0,
    branches: [],
    remotes: [],
    changes,
    initialCommit
  };
}
