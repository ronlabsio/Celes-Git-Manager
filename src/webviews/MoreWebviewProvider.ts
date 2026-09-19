import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import { GitError } from '../utils/errors';
import { RepositoryStatus } from '../models';
import { CELES_ICONS } from './branding';

export class MoreWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'celesMore';
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly gitService: GitService,
    private readonly _refreshAll: () => void,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    void this._refreshAll;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'refresh':
          await this.refresh();
          break;
        case 'createBranch':
          await vscode.commands.executeCommand('celes.createBranch');
          break;
        case 'checkoutBranch':
          await vscode.commands.executeCommand('celes.checkoutBranch', { name: message.name });
          break;
        case 'renameBranch':
          await vscode.commands.executeCommand('celes.renameBranch', { name: message.name });
          break;
        case 'deleteBranch':
          await vscode.commands.executeCommand('celes.deleteBranch', { name: message.name });
          break;
        case 'createStash':
          await vscode.commands.executeCommand('celes.createStash');
          break;
        case 'applyStash':
          await vscode.commands.executeCommand('celes.applyStash', { index: message.index });
          break;
        case 'popStash':
          await vscode.commands.executeCommand('celes.popStash', { index: message.index });
          break;
        case 'deleteStash':
          await vscode.commands.executeCommand('celes.deleteStash', { index: message.index });
          break;
        case 'fetch':
          await vscode.commands.executeCommand('celes.fetch');
          break;
        case 'pull':
          await vscode.commands.executeCommand('celes.pull');
          break;
        case 'push':
          await vscode.commands.executeCommand('celes.push');
          break;
        case 'publishBranch':
          await vscode.commands.executeCommand('celes.publishBranch');
          break;
        case 'toggleScope':
          await vscode.commands.executeCommand('celes.toggleScope');
          await this.refresh();
          break;
        case 'openCommitFileDiff':
          await vscode.commands.executeCommand('celes.openCommitFileDiff', message.sha, message.path);
          break;
        case 'showCommitDiff':
          await vscode.commands.executeCommand('celes.showCommitDiff', message.sha);
          break;
        case 'copySha':
          await vscode.env.clipboard.writeText(String(message.sha ?? ''));
          break;
        case 'renameCommit':
          await vscode.commands.executeCommand('celes.renameCommit', message.sha);
          await this.refresh();
          break;
        case 'undoCommit':
          await vscode.commands.executeCommand('celes.undoCommit', message.sha);
          await this.refresh();
          break;
        case 'getCommitFiles':
          try {
            const files = await this.gitService.getCommitFiles(message.sha);
            this.view?.webview.postMessage({ type: 'commitFiles', sha: message.sha, files });
          } catch (err) {
            this.logError('getCommitFiles', err);
            this.view?.webview.postMessage({
              type: 'commitFilesError',
              sha: message.sha,
              message: this.errorMessage(err)
            });
          }
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.refresh();
      }
    });

    void this.refresh();
  }

  refresh(): void {
    void this.doRefresh();
  }

  private async doRefresh(): Promise<void> {
    if (!this.view?.webview) {
      return;
    }

    try {
      const [status, branches, stashes, history] = await Promise.all([
        this.gitService.getRepositoryStatus().catch(() => undefined),
        this.gitService.getBranches().catch(() => []),
        this.gitService.getStashes().catch(() => []),
        this.gitService.getHistory(50).catch(() => [])
      ]);

      this.view.webview.postMessage({
        type: 'state',
        status: status ? this.serializeStatus(status) : undefined,
        branches,
        stashes,
        history: history.map((c) => ({ ...c, date: c.date.toISOString() }))
      });
    } catch (err) {
      this.logError('refresh', err);
      this.view.webview.postMessage({ type: 'error', message: this.errorMessage(err) });
    }
  }

  private serializeStatus(status: RepositoryStatus): object {
    return {
      isGitRepository: status.isGitRepository,
      repositoryName: status.repositoryName,
      repositoryRoot: status.repositoryRoot,
      currentBranch: status.currentBranch,
      ahead: status.ahead,
      behind: status.behind,
      initialCommit: status.initialCommit,
      remoteName: status.remotes.find((r) => r.fetch)?.name || 'No remote',
      scopePath: this.gitService.getScopePath(),
      scopeMode: this.gitService.getScopeMode(),
      changesSummary: {
        staged: status.changes.staged.length,
        unstaged: status.changes.unstaged.length,
        untracked: status.changes.untracked.length
      }
    };
  }

  private logError(operation: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.outputChannel.appendLine(`[moreWebview:${operation}] ${message}`);
    if (err instanceof GitError && err.stderr) {
      this.outputChannel.appendLine(err.stderr);
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof GitError ? err.userMessage : err instanceof Error ? err.message : String(err);
  }

  getHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Celes More</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, var(--vscode-editor-background, #1e1e1e));
      --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground, #cccccc));
      --border: var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border, #333333));
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --button-bg: var(--vscode-button-background, #0e639c);
      --button-fg: var(--vscode-button-foreground, #ffffff);
      --button-hover: var(--vscode-button-hoverBackground, #1177bb);
      --secondary-bg: var(--vscode-button-secondaryBackground, #3c3c3c);
      --secondary-fg: var(--vscode-button-secondaryForeground, #cccccc);
      --accent: var(--vscode-focusBorder, #007acc);
      --staged: var(--vscode-gitDecoration-stageModifiedResourceForeground, #73c991);
      --modified: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
      --radius: 4px;
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: 12px;
      background: var(--bg);
      color: var(--fg);
      margin: 0;
      padding: 8px;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      margin-bottom: 10px;
    }
    .tab {
      flex: 1;
      padding: 8px 4px;
      text-align: center;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      font-weight: 600;
      font-size: 11px;
      opacity: 0.7;
      transition: all 0.15s;
    }
    .tab:hover { opacity: 1; }
    .tab.active {
      opacity: 1;
      border-bottom-color: var(--accent);
      color: var(--accent);
    }
    .panel {
      flex: 1;
      overflow-y: auto;
      display: none;
    }
    .panel.active { display: block; }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 2px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      opacity: 0.9;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 4px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .item:hover { background: var(--input-bg); }
    .item .icon { flex-shrink: 0; display: inline-flex; align-items: center; opacity: 0.8; }
    .celes-icon { vertical-align: -2px; flex-shrink: 0; }
    button .celes-icon { pointer-events: none; }
    .item .label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item .meta {
      font-size: 10px;
      opacity: 0.7;
    }
    .actions {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    button {
      border: none;
      border-radius: var(--radius);
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      flex: 1;
    }
    button.primary {
      background: var(--button-bg);
      color: var(--button-fg);
    }
    button.primary:hover { background: var(--button-hover); }
    button.secondary {
      background: var(--secondary-bg);
      color: var(--secondary-fg);
    }
    button.secondary:hover { filter: brightness(1.15); }
    .overview-card {
      background: var(--input-bg);
      border-radius: var(--radius);
      padding: 10px;
      margin-bottom: 10px;
    }
    .overview-card .row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid var(--border);
    }
    .overview-card .row:last-child { border-bottom: none; }
    .overview-card .label { opacity: 0.8; }
    .overview-card .value { font-weight: 600; }
    .empty-state {
      padding: 20px 10px;
      text-align: center;
      opacity: 0.7;
    }
    .stash-actions, .branch-actions {
      display: none;
      gap: 4px;
    }
    .item:hover .stash-actions, .item:hover .branch-actions { display: flex; }
    .stash-actions button, .branch-actions button {
      padding: 1px 4px;
      font-size: 10px;
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--border);
      flex: none;
    }
    .commit-item { margin-bottom: 2px; }
    .commit-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 4px;
      cursor: pointer;
      border-radius: 3px;
    }
    .commit-header:hover { background: var(--input-bg); }
    .commit-header .chevron::before { content: '▸'; }
    .commit-header.expanded .chevron::before { content: '▾'; }
    .commit-message { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
    .commit-meta { font-size: 10px; opacity: 0.7; flex-shrink: 0; }
    .commit-details { display: none; padding: 4px 4px 8px 24px; }
    .commit-info { font-size: 10px; opacity: 0.7; margin-bottom: 4px; }
    .commit-file {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 4px;
      cursor: pointer;
      border-radius: 3px;
    }
    .commit-file:hover { background: var(--input-bg); }
    .file-status { font-size: 9px; font-weight: 700; width: 16px; text-align: center; }
    .file-status.added { color: var(--added); }
    .file-status.deleted { color: var(--deleted); }
    .file-status.renamed { color: var(--modified); }
    .file-status.copied { color: var(--added); }
    .file-status.modified { color: var(--modified); }
    .file-path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .context-menu {
      position: fixed;
      z-index: 200;
      min-width: 210px;
      background: var(--vscode-menu-background, var(--input-bg));
      color: var(--vscode-menu-foreground, var(--fg));
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 4px 0;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    }
    .context-menu-item {
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    .context-menu-item:hover {
      background: var(--vscode-menu-selectionBackground, var(--accent));
      color: var(--vscode-menu-selectionForeground, #ffffff);
    }
    .context-menu-item.disabled { opacity: 0.45; cursor: default; }
    .context-menu-item.disabled:hover { background: transparent; color: inherit; }
    .context-menu-separator { height: 1px; background: var(--border); margin: 4px 0; }
  </style>
</head>
<body>
  <div class="tabs">
    <div class="tab active" data-tab="history">History</div>
    <div class="tab" data-tab="branches">Branches</div>
    <div class="tab" data-tab="stashes">Stashes</div>
    <div class="tab" data-tab="overview">Overview</div>
  </div>

  <div id="history" class="panel active">
    <div id="historyList"></div>
  </div>

  <div id="branches" class="panel">
    <div class="actions">
      <button class="secondary" id="createBranchBtn">+ Branch</button>
      <button class="secondary" id="refreshBranchesBtn" title="Refresh" aria-label="Refresh">${CELES_ICONS.refresh}</button>
    </div>
    <div id="branchesList"></div>
  </div>

  <div id="stashes" class="panel">
    <div class="actions">
      <button class="secondary" id="createStashBtn">+ Stash</button>
      <button class="secondary" id="refreshStashesBtn" title="Refresh" aria-label="Refresh">${CELES_ICONS.refresh}</button>
    </div>
    <div id="stashesList"></div>
  </div>

  <div id="overview" class="panel">
    <div class="actions">
      <button class="secondary" id="fetchBtn">Fetch</button>
      <button class="secondary" id="pullBtn">Pull</button>
      <button class="secondary" id="pushBtn">Push</button>
      <button class="secondary" id="scopeBtn" title="Toggle folder scope">Scope</button>
    </div>
    <div id="overviewCard"></div>
  </div>

  <div id="commitMenu" class="context-menu" style="display:none"></div>

  <script>
    const ICONS = ${JSON.stringify(CELES_ICONS)};
    const vscode = acquireVsCodeApi();
    let state = { status: undefined, branches: [], stashes: [], history: [], expandedCommits: new Set(), pendingCommits: new Set(), failedCommits: new Set() };

    function send(command, data = {}) {
      vscode.postMessage({ command, ...data });
    }

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderBranches() {
      const container = document.getElementById('branchesList');
      const local = state.branches.filter(function(b) { return !b.isRemote; });
      const remote = state.branches.filter(function(b) { return b.isRemote; });

      if (local.length === 0 && remote.length === 0) {
        container.innerHTML = '<div class="empty-state">No branches found.</div>';
        return;
      }

      let html = '';
      if (local.length > 0) {
        html += '<div class="section-header"><span>Local</span></div>';
        local.forEach(function(b) {
          const upstream = b.upstream ? ' → ' + escapeHtml(b.upstream) : '';
          const sync = (b.ahead ? ' ↑' + b.ahead : '') + (b.behind ? ' ↓' + b.behind : '');
          html +=
            '<div class="item" data-name="' + escapeHtml(b.name) + '">' +
              '<span class="icon">' + ICONS.branch + '</span>' +
              '<span class="label" title="' + escapeHtml(b.name + upstream + sync) + '">' + escapeHtml(b.name) + '</span>' +
              '<span class="meta">' + (b.isCurrent ? 'current' : sync) + '</span>' +
              '<span class="branch-actions">' +
                '<button class="checkout" title="Checkout" aria-label="Checkout">' + ICONS.check + '</button>' +
                '<button class="rename" title="Rename" aria-label="Rename">' + ICONS.pencil + '</button>' +
                '<button class="delete" title="Delete" aria-label="Delete">' + ICONS.trash + '</button>' +
              '</span>' +
            '</div>';
        });
      }
      if (remote.length > 0) {
        html += '<div class="section-header"><span>Remote</span></div>';
        remote.forEach(function(b) {
          html +=
            '<div class="item" data-name="' + escapeHtml(b.name) + '">' +
              '<span class="icon">' + ICONS.cloud + '</span>' +
              '<span class="label">' + escapeHtml(b.name) + '</span>' +
            '</div>';
        });
      }
      container.innerHTML = html;

      container.querySelectorAll('.item').forEach(function(el) {
        const name = el.dataset.name;
        el.querySelector('.checkout')?.addEventListener('click', function(e) {
          e.stopPropagation();
          send('checkoutBranch', { name });
        });
        el.querySelector('.rename')?.addEventListener('click', function(e) {
          e.stopPropagation();
          send('renameBranch', { name });
        });
        el.querySelector('.delete')?.addEventListener('click', function(e) {
          e.stopPropagation();
          send('deleteBranch', { name });
        });
      });
    }

    function renderStashes() {
      const container = document.getElementById('stashesList');
      if (state.stashes.length === 0) {
        container.innerHTML = '<div class="empty-state">No stashes saved.</div>';
        return;
      }

      container.innerHTML = state.stashes.map(function(s) {
        return '<div class="item" data-index="' + s.index + '">' +
          '<span class="icon">' + ICONS.archive + '</span>' +
          '<span class="label" title="' + escapeHtml(s.message) + '">' + escapeHtml(s.message) + '</span>' +
          '<span class="stash-actions">' +
            '<button class="apply" title="Apply" aria-label="Apply">' + ICONS.arrowDown + '</button>' +
            '<button class="pop" title="Pop" aria-label="Pop">' + ICONS.arrowUp + '</button>' +
            '<button class="delete" title="Delete" aria-label="Delete">' + ICONS.trash + '</button>' +
          '</span>' +
        '</div>';
      }).join('');

      container.querySelectorAll('.item').forEach(function(el) {
        const index = parseInt(el.dataset.index, 10);
        el.querySelector('.apply')?.addEventListener('click', function(e) {
          e.stopPropagation();
          send('applyStash', { index });
        });
        el.querySelector('.pop')?.addEventListener('click', function(e) {
          e.stopPropagation();
          send('popStash', { index });
        });
        el.querySelector('.delete')?.addEventListener('click', function(e) {
          e.stopPropagation();
          send('deleteStash', { index });
        });
      });
    }

    function renderOverview() {
      const container = document.getElementById('overviewCard');
      if (!state.status || !state.status.isGitRepository) {
        container.innerHTML = '<div class="empty-state">No Git repository found.</div>';
        return;
      }

      const s = state.status;
      const changes = s.changesSummary;
      const changesText = changes.staged + changes.unstaged + changes.untracked === 0
        ? 'Working tree is clean'
        : (changes.staged ? changes.staged + ' staged ' : '') +
          (changes.unstaged ? changes.unstaged + ' modified ' : '') +
          (changes.untracked ? changes.untracked + ' untracked' : '');
      const sync = (s.ahead ? '↑ ' + s.ahead + ' ahead ' : '') + (s.behind ? '↓ ' + s.behind + ' behind' : '');
      const scopeText = s.scopePath ? s.scopePath + ' (opened folder)' : 'whole repository';

      container.innerHTML =
        '<div class="overview-card">' +
          '<div class="row"><span class="label">Repository</span><span class="value">' + escapeHtml(s.repositoryName || 'Unknown') + '</span></div>' +
          '<div class="row"><span class="label">Branch</span><span class="value">' + escapeHtml(s.currentBranch || 'Unknown') + '</span></div>' +
          '<div class="row"><span class="label">Changes</span><span class="value">' + escapeHtml(changesText.trim()) + '</span></div>' +
          '<div class="row"><span class="label">Scope</span><span class="value" title="' + escapeHtml(scopeText) + '">' + escapeHtml(scopeText) + '</span></div>' +
          '<div class="row"><span class="label">Remote</span><span class="value">' + escapeHtml(s.remoteName) + '</span></div>' +
          (sync ? '<div class="row"><span class="label">Sync</span><span class="value">' + escapeHtml(sync.trim()) + '</span></div>' : '') +
        '</div>';
    }

    function render() {
      renderHistory();
      renderBranches();
      renderStashes();
      renderOverview();
    }

    function formatDate(dateString) {
      const d = new Date(dateString);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function fileStatusIcon(status) {
      switch (status) {
        case 'added': return 'A';
        case 'deleted': return 'D';
        case 'renamed': return 'R';
        case 'copied': return 'C';
        default: return 'M';
      }
    }

    function renderHistory() {
      const container = document.getElementById('historyList');
      if (!state.history || state.history.length === 0) {
        container.innerHTML = '<div class="empty-state">No commits yet.</div>';
        return;
      }

      container.innerHTML = '';
      state.history.forEach(function(commit, index) {
        const isExpanded = state.expandedCommits.has(commit.sha);
        const el = document.createElement('div');
        el.className = 'commit-item';
        el.innerHTML =
          '<div class="commit-header" data-sha="' + escapeHtml(commit.sha) + '">' +
            '<span class="chevron"></span>' +
            '<span class="commit-message" title="' + escapeHtml(commit.message) + '">' + escapeHtml(commit.message.split('\\n')[0]) + '</span>' +
            '<span class="commit-meta">' + escapeHtml(commit.shortSha) + ' · ' + escapeHtml(commit.authorName) + '</span>' +
          '</div>' +
          '<div class="commit-details"' + (isExpanded ? ' style="display:block"' : '') + '>' +
            '<div class="commit-info">' + escapeHtml(commit.authorName) + ' · ' + formatDate(commit.date) + '</div>' +
            '<div class="commit-files">Loading...</div>' +
          '</div>';

        const header = el.querySelector('.commit-header');
        const details = el.querySelector('.commit-details');
        header.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          e.stopPropagation();
          openCommitMenu(e, commit, index === 0);
        });
        header.addEventListener('click', function() {
          const expanded = details.style.display === 'block';
          details.style.display = expanded ? 'none' : 'block';
          header.classList.toggle('expanded', !expanded);
          if (expanded) {
            state.expandedCommits.delete(commit.sha);
          } else {
            state.expandedCommits.add(commit.sha);
            if (!commit.files) {
              send('getCommitFiles', { sha: commit.sha });
            }
          }
        });

        if (isExpanded) {
          header.classList.add('expanded');
          if (!commit.files && !state.pendingCommits.has(commit.sha) && !state.failedCommits.has(commit.sha)) {
            state.pendingCommits.add(commit.sha);
            send('getCommitFiles', { sha: commit.sha });
          }
        }

        const filesContainer = el.querySelector('.commit-files');
        if (!commit.files && state.failedCommits.has(commit.sha) && isExpanded) {
          filesContainer.innerHTML = '<div class="empty-state">Could not load files for this commit.</div>';
        }

        if (commit.files) {
          if (commit.files.length === 0) {
            filesContainer.innerHTML = '<div class="empty-state">No file changes.</div>';
          } else {
            filesContainer.innerHTML = commit.files.map(function(f) {
              return '<div class="commit-file" data-sha="' + escapeHtml(commit.sha) + '" data-path="' + escapeHtml(f.path) + '">' +
                '<span class="file-status ' + f.status + '">' + fileStatusIcon(f.status) + '</span>' +
                '<span class="file-path">' + escapeHtml(f.path) + '</span>' +
              '</div>';
            }).join('');
            filesContainer.querySelectorAll('.commit-file').forEach(function(fileEl) {
              fileEl.addEventListener('click', function() {
                send('openCommitFileDiff', { sha: fileEl.dataset.sha, path: fileEl.dataset.path });
              });
            });
          }
        }

        container.appendChild(el);
      });
    }

    function closeCommitMenu() {
      const menu = document.getElementById('commitMenu');
      if (menu) {
        menu.style.display = 'none';
        menu.innerHTML = '';
      }
      document.removeEventListener('click', closeCommitMenu);
      document.removeEventListener('contextmenu', closeCommitMenu);
      document.removeEventListener('keydown', onCommitMenuKey);
      window.removeEventListener('scroll', closeCommitMenu, true);
    }

    function onCommitMenuKey(e) {
      if (e.key === 'Escape') {
        closeCommitMenu();
      }
    }

    function openCommitMenu(event, commit, isLatest) {
      closeCommitMenu();
      const menu = document.getElementById('commitMenu');
      if (!menu) {
        return;
      }

      const entries = [
        {
          label: 'Show Changes (Side by Side)',
          run: function() { send('showCommitDiff', { sha: commit.sha }); }
        },
        {
          label: 'Copy Commit SHA',
          run: function() { send('copySha', { sha: commit.sha }); }
        },
        { separator: true },
        {
          label: 'Rename Commit Message',
          disabled: !isLatest,
          hint: 'Only available for the latest commit',
          run: function() { send('renameCommit', { sha: commit.sha }); }
        },
        {
          label: 'Undo Commit (Keep Changes)',
          disabled: !isLatest,
          hint: 'Only available for the latest commit',
          run: function() { send('undoCommit', { sha: commit.sha }); }
        }
      ];

      entries.forEach(function(entry) {
        if (entry.separator) {
          const sep = document.createElement('div');
          sep.className = 'context-menu-separator';
          menu.appendChild(sep);
          return;
        }
        const item = document.createElement('div');
        item.className = 'context-menu-item' + (entry.disabled ? ' disabled' : '');
        item.textContent = entry.label;
        if (entry.disabled) {
          item.title = entry.hint || '';
        } else {
          item.addEventListener('click', function(e) {
            e.stopPropagation();
            closeCommitMenu();
            entry.run();
          });
        }
        menu.appendChild(item);
      });

      menu.style.display = 'block';
      menu.style.left = '0px';
      menu.style.top = '0px';
      const rect = menu.getBoundingClientRect();
      const x = Math.min(event.clientX, window.innerWidth - rect.width - 6);
      const y = Math.min(event.clientY, window.innerHeight - rect.height - 6);
      menu.style.left = Math.max(4, x) + 'px';
      menu.style.top = Math.max(4, y) + 'px';

      window.setTimeout(function() {
        document.addEventListener('click', closeCommitMenu);
        document.addEventListener('contextmenu', closeCommitMenu);
        document.addEventListener('keydown', onCommitMenuKey);
        window.addEventListener('scroll', closeCommitMenu, true);
      }, 0);
    }

    window.addEventListener('message', function(event) {
      const msg = event.data;
      console.log('[MoreWebview] message received:', msg.type, msg);
      if (msg.type === 'state') {
        state.status = msg.status;
        state.branches = msg.branches;
        state.stashes = msg.stashes;
        const loadedFiles = new Map();
        state.history.forEach(function(c) { if (c.files) loadedFiles.set(c.sha, c.files); });
        state.history = (msg.history || []).map(function(c) {
          const files = loadedFiles.get(c.sha);
          return files ? Object.assign({}, c, { files: files }) : c;
        });
        console.log('[MoreWebview] state updated - history:', state.history.length, 'branches:', state.branches.length, 'stashes:', state.stashes.length);
        render();
        return;
      }
      if (msg.type === 'commitFiles') {
        const commit = state.history.find(function(c) { return c.sha === msg.sha; });
        if (commit) {
          commit.files = msg.files;
          state.pendingCommits.delete(msg.sha);
          state.failedCommits.delete(msg.sha);
          renderHistory();
        }
        return;
      }
      if (msg.type === 'commitFilesError') {
        state.pendingCommits.delete(msg.sha);
        state.failedCommits.add(msg.sha);
        renderHistory();
        return;
      }
    });

    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    document.getElementById('createBranchBtn').addEventListener('click', function() { send('createBranch'); });
    document.getElementById('refreshBranchesBtn').addEventListener('click', function() { send('refresh'); });
    document.getElementById('createStashBtn').addEventListener('click', function() { send('createStash'); });
    document.getElementById('refreshStashesBtn').addEventListener('click', function() { send('refresh'); });
    document.getElementById('fetchBtn').addEventListener('click', function() { send('fetch'); });
    document.getElementById('pullBtn').addEventListener('click', function() { send('pull'); });
    document.getElementById('pushBtn').addEventListener('click', function() { send('push'); });
    document.getElementById('scopeBtn').addEventListener('click', function() { send('toggleScope'); });



    send('refresh');
  </script>
</body>
</html>
    `;
  }
}
