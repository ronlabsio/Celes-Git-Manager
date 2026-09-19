import { GitBranch } from '../../models';

function sanitizeLine(line: string, isRemote: boolean): string {
  let sanitized = line.replace(/^\*\s*/, '');
  if (isRemote) {
    sanitized = sanitized.replace(/^remotes\//, '');
  }
  return sanitized.trim();
}

export function parseBranches(output: string, currentBranchName: string): GitBranch[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const isRemote = line.trim().startsWith('remotes/');
      const sanitized = sanitizeLine(line, isRemote);

      // Extract branch name: everything before first bracket or whitespace cluster
      const nameMatch = sanitized.match(/^([^\s[]+)/);
      const name = nameMatch ? nameMatch[1].trim() : sanitized;
      const isCurrent = !isRemote && name === currentBranchName;

      const upstreamMatch = sanitized.match(/\[(.+?)\]/);
      const upstream = upstreamMatch ? upstreamMatch[1] : undefined;

      const aheadMatch = upstream?.match(/ahead\s+(\d+)/);
      const behindMatch = upstream?.match(/behind\s+(\d+)/);
      const ahead = aheadMatch ? parseInt(aheadMatch[1], 10) : 0;
      const behind = behindMatch ? parseInt(behindMatch[1], 10) : 0;

      const afterUpstream = upstream ? sanitized.substring(sanitized.indexOf(']') + 1) : sanitized.substring(name.length);
      const refMatch = afterUpstream.match(/^\s+([0-9a-f]{7,40})\s+(.*)$/);
      const lastCommitRef = refMatch ? refMatch[1] : undefined;
      const lastCommitSubject = refMatch ? refMatch[2].trim() : undefined;

      return {
        name,
        isCurrent,
        isRemote,
        upstream,
        ahead,
        behind,
        lastCommitRef,
        lastCommitSubject
      };
    });
}

export function parseRemoteBranches(output: string): GitBranch[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const sanitized = line.replace(/^\s+/, '');
      const nameMatch = sanitized.match(/^([^\s]+)/);
      const name = nameMatch ? nameMatch[1] : sanitized;

      return {
        name,
        isCurrent: false,
        isRemote: true,
        ahead: 0,
        behind: 0
      };
    });
}
