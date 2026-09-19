export interface GitRemote {
  name: string;
  url: string;
  fetch: boolean;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  lastCommitRef?: string;
  lastCommitSubject?: string;
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: Date;
  parents: string[];
}

export interface GitCommitDetails extends GitCommit {
  body: string;
  changedFiles: GitCommitFile[];
  insertions: number;
  deletions: number;
}

export interface GitCommitFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  insertions: number;
  deletions: number;
  oldPath?: string;
}

export interface GitFileChange {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  originalPath?: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitChanges {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
}

export interface GitStash {
  index: number;
  message: string;
  date: Date;
  branch?: string | undefined;
}

export interface RepositoryStatus {
  isGitRepository: boolean;
  repositoryName?: string;
  repositoryRoot?: string;
  currentBranch?: string;
  branches: GitBranch[];
  remotes: GitRemote[];
  changes: GitChanges;
  ahead: number;
  behind: number;
  initialCommit: boolean;
}
