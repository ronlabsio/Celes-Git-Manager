import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import { GitCommit, GitCommitFile } from '../models';

export class HistoryProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private commits: GitCommit[] = [];
  private fileCache = new Map<string, GitCommitFile[]>();

  constructor(
    private readonly gitService: GitService,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  refresh(): void {
    this.fileCache.clear();
    this._onDidChangeTreeData.fire();
  }

  async getChildren(element?: HistoryTreeItem): Promise<HistoryTreeItem[]> {
    if (!element) {
      try {
        this.commits = await this.gitService.getHistory(50);
      } catch (err) {
        this.outputChannel.appendLine(`Error loading history: ${err instanceof Error ? err.message : String(err)}`);
        this.commits = [];
      }

      if (this.commits.length === 0) {
        const empty = new HistoryTreeItem('No commits yet.', undefined, false, 'empty');
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty];
      }

      return this.commits.map((commit, index) => new HistoryTreeItem(commit, commit, index === 0));
    }

    if (element.kind === 'commit' && element.commit) {
      try {
        const sha = element.commit.sha;
        let files = this.fileCache.get(sha);
        if (!files) {
          files = await this.gitService.getCommitFiles(sha);
          if (files.length === 0) {
            files = [{ path: '(no file changes in this commit)', status: 'modified', insertions: 0, deletions: 0 }];
          }
          this.fileCache.set(sha, files);
        }
        return files.map((file) => new HistoryTreeItem(file, element.commit, false, 'file'));
      } catch (err) {
        this.outputChannel.appendLine(`Error loading commit files: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    }

    return [];
  }

  getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: HistoryTreeItem): vscode.ProviderResult<HistoryTreeItem> {
    if (element.kind === 'file' && element.commit) {
      return new HistoryTreeItem(element.commit, element.commit, false);
    }
    return undefined;
  }
}

class HistoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly item: GitCommit | GitCommitFile | string,
    public readonly commit: GitCommit | undefined,
    public readonly isLatest = false,
    public readonly kind: 'commit' | 'file' | 'empty' = 'commit'
  ) {
    super(
      kind === 'empty'
        ? (item as string)
        : kind === 'commit'
          ? `${(item as GitCommit).message.split('\n')[0]}`
          : (item as GitCommitFile).path,
      kind === 'commit' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    if (kind === 'commit') {
      const commit = item as GitCommit;
      this.description = `${commit.shortSha} · ${commit.authorName}`;
      this.tooltip = `${commit.sha}\n${commit.authorName} <${commit.authorEmail}>\n${commit.date.toLocaleString()}\n\n${commit.message}`;
      this.iconPath = new vscode.ThemeIcon('git-commit');
      this.contextValue = isLatest ? 'gitdeckLatestCommit' : 'gitdeckCommit';
    } else if (kind === 'file') {
      const file = item as GitCommitFile;
      const statusIcon = fileStatusIcon(file.status);
      const statusColor = fileStatusColor(file.status);
      this.description = fileStatusLabel(file.status);
      this.tooltip = `${file.path}\n${fileStatusLabel(file.status)}`;
      this.iconPath = new vscode.ThemeIcon(statusIcon, new vscode.ThemeColor(statusColor));
      this.contextValue = 'gitdeckCommitFile';
      this.command = {
        command: 'gitdeck.openCommitFileDiff',
        title: 'Open Diff',
        arguments: [commit?.sha, file.path]
      };
    }
  }
}

function fileStatusIcon(status: GitCommitFile['status']): string {
  switch (status) {
    case 'added': return 'diff-added';
    case 'deleted': return 'diff-removed';
    case 'renamed': return 'diff-renamed';
    case 'copied': return 'diff-added';
    default: return 'diff-modified';
  }
}

function fileStatusColor(status: GitCommitFile['status']): string {
  switch (status) {
    case 'added': return 'gitDecoration.addedResourceForeground';
    case 'deleted': return 'gitDecoration.deletedResourceForeground';
    case 'renamed': return 'gitDecoration.renamedResourceForeground';
    case 'copied': return 'gitDecoration.addedResourceForeground';
    default: return 'gitDecoration.modifiedResourceForeground';
  }
}

function fileStatusLabel(status: GitCommitFile['status']): string {
  switch (status) {
    case 'added': return 'Added';
    case 'deleted': return 'Deleted';
    case 'renamed': return 'Renamed';
    case 'copied': return 'Copied';
    default: return 'Modified';
  }
}
