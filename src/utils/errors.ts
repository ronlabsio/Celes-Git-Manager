export class GitError extends Error {
  constructor(
    message: string,
    readonly exitCode?: number,
    readonly stderr: string = '',
    readonly gitCommand: string = '',
    readonly userMessage: string = message
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export function normalizeGitError(stderr: string, gitCommand: string): { message: string; userMessage: string } {
  const lower = stderr.toLowerCase();

  if (lower.includes('not a git repository')) {
    return {
      message: 'Not a git repository',
      userMessage: 'This workspace is not a Git repository.'
    };
  }

  if (lower.includes('your local changes would be overwritten by checkout')) {
    return {
      message: 'Local changes would be overwritten by checkout',
      userMessage: 'Git prevented the branch switch because you have local changes that would be overwritten.'
    };
  }

  if (lower.includes('authentication failed') || lower.includes('could not authenticate')) {
    return {
      message: 'Authentication failed',
      userMessage: 'Could not authenticate with the remote. Check your credentials.'
    };
  }

  if (lower.includes('could not resolve host') || lower.includes('failed to connect')) {
    return {
      message: 'Could not connect to remote',
      userMessage: 'Could not connect to the remote. Check your network connection.'
    };
  }

  if (lower.includes('updates were rejected')) {
    return {
      message: 'Push rejected',
      userMessage: 'Push rejected. The remote has new commits. Try pulling first.'
    };
  }

  if (lower.includes('the branch') && lower.includes('is not fully merged')) {
    return {
      message: 'Branch is not fully merged',
      userMessage: 'This branch is not fully merged. If you delete it, commits that exist only on this branch may become difficult to recover.'
    };
  }

  if (lower.includes('nothing to commit')) {
    return {
      message: 'Nothing to commit',
      userMessage: 'There are no changes to commit.'
    };
  }

  return {
    message: stderr.trim() || 'Git command failed',
    userMessage: stderr.trim() || `Git command failed: ${gitCommand}`
  };
}
