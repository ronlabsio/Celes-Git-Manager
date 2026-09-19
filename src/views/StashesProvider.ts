import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import { GitStash } from '../models';

export class StashesProvider implements vscode.TreeDataProvider<StashTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StashTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private stashes: GitStash[] = [];

  constructor(
    private readonly gitService: GitService,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(): Promise<StashTreeItem[]> {
    try {
      this.stashes = await this.gitService.getStashes();
    } catch (err) {
      this.outputChannel.appendLine(`Error loading stashes: ${err instanceof Error ? err.message : String(err)}`);
      this.stashes = [];
    }

    if (this.stashes.length === 0) {
      const empty = new StashTreeItem('No stashes saved.', 'empty');
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    return this.stashes.map((stash) => new StashTreeItem(stash));
  }

  getTreeItem(element: StashTreeItem): vscode.TreeItem {
    return element;
  }
}

class StashTreeItem extends vscode.TreeItem {
  constructor(
    public readonly stash: GitStash | string,
    public readonly kind: 'stash' | 'empty' = 'stash'
  ) {
    super(typeof stash === 'string' ? stash : `stash@{${stash.index}}`, vscode.TreeItemCollapsibleState.None);

    if (typeof stash !== 'string') {
      this.description = stash.message;
      this.tooltip = `${stash.message}\n${stash.date.toLocaleString()}${stash.branch ? ` on ${stash.branch}` : ''}`;
      this.iconPath = new vscode.ThemeIcon('archive');
      this.contextValue = 'celesStash';
    }
  }
}
