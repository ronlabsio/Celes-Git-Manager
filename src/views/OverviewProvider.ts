import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import { RepositoryStatus } from '../models';

export class OverviewProvider implements vscode.TreeDataProvider<OverviewItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OverviewItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private status: RepositoryStatus | undefined;

  constructor(
    private readonly gitService: GitService,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(): Promise<OverviewItem[]> {
    try {
      this.status = await this.gitService.getRepositoryStatus();
    } catch (err) {
      this.outputChannel.appendLine(`Error loading overview: ${err instanceof Error ? err.message : String(err)}`);
      this.status = undefined;
    }

    if (!this.status?.isGitRepository) {
      return [
        new OverviewItem('No Git repository found.', '', {
          command: 'gitdeck.initializeRepository',
          title: 'Initialize Repository'
        })
      ];
    }

    const items: OverviewItem[] = [];

    items.push(new OverviewItem('Repository', this.status.repositoryName || 'Unknown'));

    const branchLabel = this.status.initialCommit ? 'No commits yet' : this.status.currentBranch || 'Unknown';
    items.push(new OverviewItem('Branch', branchLabel));

    const statusParts: string[] = [];
    const { staged, unstaged, untracked } = this.status.changes;
    const totalChanges = staged.length + unstaged.length + untracked.length;
    if (totalChanges === 0) {
      statusParts.push('Working tree is clean');
    } else {
      if (staged.length) statusParts.push(`${staged.length} staged`);
      if (unstaged.length) statusParts.push(`${unstaged.length} modified`);
      if (untracked.length) statusParts.push(`${untracked.length} untracked`);
    }

    if (this.status.ahead > 0 || this.status.behind > 0) {
      const syncParts: string[] = [];
      if (this.status.ahead > 0) syncParts.push(`↑ ${this.status.ahead} ahead`);
      if (this.status.behind > 0) syncParts.push(`↓ ${this.status.behind} behind`);
      statusParts.push(syncParts.join('  '));
    }

    items.push(new OverviewItem('Changes', statusParts.join('  ')));

    const remoteName = this.status.remotes.find((r) => r.fetch)?.name || 'No remote';
    items.push(new OverviewItem('Remote', remoteName));

    items.push(
      new OverviewItem('Actions', '', undefined, [
        new OverviewItem('$(cloud-download) Fetch', 'Downloads remote references', { command: 'gitdeck.fetch', title: 'Fetch' }),
        new OverviewItem('$(cloud-download) Pull', 'Integrate remote changes', { command: 'gitdeck.pull', title: 'Pull' }),
        new OverviewItem('$(cloud-upload) Push', 'Upload local commits', { command: 'gitdeck.push', title: 'Push' }),
        new OverviewItem('$(refresh) Refresh', 'Update GitDeck state', { command: 'gitdeck.refresh', title: 'Refresh' })
      ])
    );

    return items;
  }

  getTreeItem(element: OverviewItem): vscode.TreeItem {
    return element;
  }
}

class OverviewItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string = '',
    command?: vscode.Command,
    children?: OverviewItem[]
  ) {
    super(
      label,
      children && children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.description = description;
    this.command = command;
    this.children = children;
    this.contextValue = 'gitdeckOverviewItem';

    if (label === 'Repository') {
      this.iconPath = new vscode.ThemeIcon('repo');
    } else if (label === 'Branch') {
      this.iconPath = new vscode.ThemeIcon('git-branch');
    } else if (label === 'Changes') {
      this.iconPath = new vscode.ThemeIcon('diff');
    } else if (label === 'Remote') {
      this.iconPath = new vscode.ThemeIcon('cloud');
    } else if (label.startsWith('$(refresh) Refresh')) {
      this.iconPath = new vscode.ThemeIcon('refresh');
    }
  }

  children?: OverviewItem[];

  async getChildren(): Promise<OverviewItem[]> {
    return this.children || [];
  }
}
