export interface CommitPanelState {
  changes: CommitPanelFile[];
  message: string;
  amend: boolean;
  pushAfterCommit: boolean;
}

export interface CommitPanelFile {
  path: string;
  status: 'staged' | 'unstaged' | 'untracked';
  selected: boolean;
  label: string;
  diff?: string;
}
