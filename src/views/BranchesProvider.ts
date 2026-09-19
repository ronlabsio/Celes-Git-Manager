import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import { GitBranch } from '../models';

export class BranchesProvider implements vscode.TreeDataProvider<BranchTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BranchTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private branches: GitBranch[] = [];

  constructor(
    private readonly gitService: GitService,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(element?: BranchTreeItem): Promise<BranchTreeItem[]> {
    if (!element) {
      try {
        this.branches = await this.gitService.getBranches();
      } catch (err) {
        this.outputChannel.appendLine(`Error loading branches: ${err instanceof Error ? err.message : String(err)}`);
        this.branches = [];
      }

      const local = this.branches.filter((b) => !b.isRemote);
      const remote = this.branches.filter((b) => b.isRemote);

      const localSection = new BranchTreeItem('Local', 'section', undefined, []);
      localSection.children = local.map((branch) => new BranchTreeItem(branch.name, 'localBranch', branch));
      localSection.iconPath = new vscode.ThemeIcon('git-branch');

      const remoteSection = new BranchTreeItem('Remote', 'section', undefined, []);
      remoteSection.children = remote.map((branch) => new BranchTreeItem(branch.name, 'remoteBranch', branch));
      remoteSection.iconPath = new vscode.ThemeIcon('cloud');

      return [localSection, remoteSection];
    }

    if (element.children) {
      return element.children;
    }

    return [];
  }

  getTreeItem(element: BranchTreeItem): vscode.TreeItem {
    return element;
  }
}

class BranchTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly kind: 'section' | 'localBranch' | 'remoteBranch',
    public readonly branch?: GitBranch,
    public children?: BranchTreeItem[]
  ) {
    super(
      label,
      kind === 'section' && children
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    if (kind === 'localBranch' && branch) {
      this.contextValue = branch.isCurrent ? 'gitdeckCurrentBranch' : 'gitdeckLocalBranch';
      this.description = branch.isCurrent ? 'current' : branch.upstream || '';
      this.iconPath = new vscode.ThemeIcon(
        branch.isCurrent ? 'git-branch' : 'git-compare',
        branch.isCurrent ? new vscode.ThemeColor('gitDecoration.modifiedResourceForeground') : undefined
      );
      this.tooltip = `${branch.name}${branch.upstream ? ` → ${branch.upstream}` : ''}${branch.ahead ? ` ↑${branch.ahead}` : ''}${branch.behind ? ` ↓${branch.behind}` : ''}`;
    } else if (kind === 'remoteBranch') {
      this.contextValue = 'gitdeckRemoteBranch';
      this.iconPath = new vscode.ThemeIcon('cloud');
    }
  }
}
