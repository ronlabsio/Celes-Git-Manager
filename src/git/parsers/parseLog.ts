import { GitCommit, GitCommitDetails, GitCommitFile } from '../../models';

const FIELD_DELIMITER = '\u0001';
const RECORD_DELIMITER = '\u0002';
const STAT_DELIMITER = '\u0003';

export function parseLog(output: string): GitCommit[] {
  if (!output.trim()) {
    return [];
  }

  return output
    .split(RECORD_DELIMITER)
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const fields = record.split(FIELD_DELIMITER);
      const sha = fields[0]?.trim() || '';
      const shortSha = fields[1]?.trim() || '';
      const authorName = fields[2]?.trim() || '';
      const authorEmail = fields[3]?.trim() || '';
      const date = fields[4] ? new Date(fields[4].trim()) : new Date();
      const parents = fields[5]?.trim().split(' ').filter(Boolean) || [];
      const message = fields[6]?.trim() || '';

      return {
        sha,
        shortSha,
        message,
        authorName,
        authorEmail,
        date,
        parents
      };
    });
}

export function parseCommitDetails(output: string): GitCommitDetails {
  const parts = output.split(FIELD_DELIMITER);

  const sha = parts[0]?.trim() || '';
  const shortSha = parts[1]?.trim() || '';
  const authorName = parts[2]?.trim() || '';
  const authorEmail = parts[3]?.trim() || '';
  const date = parts[4] ? new Date(parts[4].trim()) : new Date();
  const parents = parts[5]?.trim().split(' ').filter(Boolean) || [];
  const message = parts[6]?.trim() || '';
  const body = parts[7]?.trim() || '';

  const statsStart = output.indexOf(STAT_DELIMITER);
  const statsSection = statsStart >= 0 ? output.substring(statsStart + 1) : '';

  let insertions = 0;
  let deletions = 0;
  const changedFiles: GitCommitFile[] = [];

  for (const line of statsSection.split(/\r?\n/).filter((l) => l.trim())) {
    const statMatch = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (statMatch) {
      const ins = parseInt(statMatch[1], 10) || 0;
      const del = parseInt(statMatch[2], 10) || 0;
      const filePath = statMatch[3].trim();
      insertions += ins;
      deletions += del;
      changedFiles.push({
        path: filePath,
        status: 'modified',
        insertions: ins,
        deletions: del
      });
    }
  }

  return {
    sha,
    shortSha,
    message,
    authorName,
    authorEmail,
    date,
    parents,
    body,
    changedFiles,
    insertions,
    deletions
  };
}

export function parseCommitNamesStatus(output: string): GitCommitFile[] {
  const result: GitCommitFile[] = [];
  for (const line of output.split(/\r?\n/).filter((l) => l.trim())) {
    const parts = line.split('\t');
    if (parts.length < 2) {
      continue;
    }
    const statusCode = parts[0].trim();
    const code = statusCode[0];

    let status: GitCommitFile['status'] = 'modified';
    if (code === 'A') status = 'added';
    else if (code === 'D') status = 'deleted';
    else if (code === 'R') status = 'renamed';
    else if (code === 'C') status = 'copied';

    if ((code === 'R' || code === 'C') && parts.length >= 3) {
      result.push({ path: parts[2], status, insertions: 0, deletions: 0, oldPath: parts[1] });
    } else {
      result.push({ path: parts[1], status, insertions: 0, deletions: 0 });
    }
  }
  return result;
}
