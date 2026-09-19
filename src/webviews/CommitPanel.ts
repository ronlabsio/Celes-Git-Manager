import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import { GitError } from '../utils/errors';
import { CELES_ICONS, CELES_STRIP_CSS, celesStripHtml, cspMeta, createNonce } from './branding';

export class CommitPanel {
  public static readonly viewType = 'celes.commitPanel';
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly gitService: GitService,
    private readonly refreshAll: () => void,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      CommitPanel.viewType,
      'Celes: Commit',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'refresh':
          await this.refresh();
          break;
        case 'stage':
          await this.stagePaths(message.paths);
          break;
        case 'unstage':
          await this.unstagePaths(message.paths);
          break;
        case 'commit':
          await this.commit(message.message, message.pushAfterCommit);
          break;
        case 'getDiff':
          await this.sendDiff(message.path, message.staged);
          break;
        case 'openFile':
          await this.openFile(message.path);
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      const changes = await this.gitService.getChanges();
      const files = [
        ...changes.staged.map((c) => ({ path: c.path, status: 'staged' as const, selected: true })),
        ...changes.unstaged.map((c) => ({ path: c.path, status: 'unstaged' as const, selected: false })),
        ...changes.untracked.map((c) => ({ path: c.path, status: 'untracked' as const, selected: false }))
      ];

      this.panel.webview.postMessage({
        type: 'state',
        files,
        branch: await this.getCurrentBranch(),
        ahead: await this.getAhead()
      });
    } catch (err) {
      this.logError('refresh', err);
      this.panel.webview.postMessage({ type: 'error', message: this.errorMessage(err) });
    }
  }

  private async stagePaths(paths: string[]): Promise<void> {
    try {
      await this.gitService.stageFiles(paths);
      await this.refresh();
      this.refreshAll();
    } catch (err) {
      this.logError('stage', err);
      this.sendError(err);
    }
  }

  private async unstagePaths(paths: string[]): Promise<void> {
    try {
      await this.gitService.unstageFiles(paths);
      await this.refresh();
      this.refreshAll();
    } catch (err) {
      this.logError('unstage', err);
      this.sendError(err);
    }
  }

  private async commit(message: string, pushAfterCommit: boolean): Promise<void> {
    if (!message.trim()) {
      this.panel?.webview.postMessage({ type: 'error', message: 'Please provide a commit message.' });
      return;
    }

    try {
      const changes = await this.gitService.getChanges();
      if (changes.staged.length === 0) {
        this.panel?.webview.postMessage({
          type: 'error',
          message: 'No staged changes. Select at least one file before committing.'
        });
        return;
      }

      await this.gitService.commit(message.trim());
      this.refreshAll();
      this.panel?.webview.postMessage({
        type: 'committed',
        message: `Committed ${changes.staged.length} file(s).`,
        pushAfterCommit
      });

      if (pushAfterCommit) {
        await this.gitService.push();
        this.refreshAll();
        this.panel?.webview.postMessage({ type: 'pushed' });
      }

      await this.refresh();
    } catch (err) {
      this.logError('commit', err);
      this.sendError(err);
    }
  }

  private async sendDiff(filePath: string, staged: boolean): Promise<void> {
    try {
      const diff = await this.gitService.getDiffForFile(filePath, staged);
      this.panel?.webview.postMessage({ type: 'diff', path: filePath, diff });
    } catch (err) {
      this.logError('diff', err);
      this.sendError(err);
    }
  }

  private async openFile(filePath: string): Promise<void> {
    try {
      const absolute = await this.gitService.getAbsolutePath(filePath);
      const doc = await vscode.workspace.openTextDocument(absolute);
      await vscode.window.showTextDocument(doc);
    } catch (err) {
      this.logError('openFile', err);
      this.sendError(err);
    }
  }

  private async getCurrentBranch(): Promise<string> {
    const status = await this.gitService.getRepositoryStatus().catch(() => undefined);
    return status?.currentBranch ?? 'unknown';
  }

  private async getAhead(): Promise<number> {
    const status = await this.gitService.getRepositoryStatus().catch(() => undefined);
    return status?.ahead ?? 0;
  }

  private logError(operation: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.outputChannel.appendLine(`[commitPanel:${operation}] ${message}`);
    if (err instanceof GitError && err.stderr) {
      this.outputChannel.appendLine(err.stderr);
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof GitError ? err.userMessage : err instanceof Error ? err.message : String(err);
  }

  private sendError(err: unknown): void {
    this.panel?.webview.postMessage({ type: 'error', message: this.errorMessage(err) });
  }

  getHtml(webview?: vscode.Webview): string {
    const nonce = createNonce();
    const cspSource = webview?.cspSource ?? "";
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta(cspSource, nonce)}
  <title>Celes Commit</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-foreground, #cccccc);
      --border: var(--vscode-panel-border, #333333);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --button-bg: var(--vscode-button-background, #0e639c);
      --button-fg: var(--vscode-button-foreground, #ffffff);
      --button-hover: var(--vscode-button-hoverBackground, #1177bb);
      --secondary-button-bg: var(--vscode-button-secondaryBackground, #3c3c3c);
      --secondary-button-fg: var(--vscode-button-secondaryForeground, #cccccc);
      --accent: var(--vscode-focusBorder, #007acc);
      --added: var(--vscode-gitDecoration-addedResourceForeground, #73c991);
      --modified: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
      --deleted: var(--vscode-gitDecoration-deletedResourceForeground, #f85149);
      --untracked: var(--vscode-gitDecoration-untrackedResourceForeground, #73c991);
      --staged: var(--vscode-gitDecoration-stageModifiedResourceForeground, #73c991);
      --success: #3fb950;
      --warning: #d29922;
      --radius: 6px;
      --shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: 13px;
      background: var(--bg);
      color: var(--fg);
      margin: 0;
      padding: 20px;
      --celes-pad: 20px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    h1 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }

    ${CELES_STRIP_CSS}
  </style>
</head>
<body>
${celesStripHtml({ badgeId: 'branch' })}

  <div class="main">
    <div class="panel">
      <div class="panel-header">
        <span>Changed files <small id="fileCount">(0)</small></span>
        <button class="secondary" id="refreshBtn" title="Refresh" aria-label="Refresh">${CELES_ICONS.refresh}</button>
      </div>
      <div class="toolbar">
        <button class="secondary" id="selectAllBtn">Select all</button>
        <button class="secondary" id="selectNoneBtn">Select none</button>
      </div>
      <div class="file-list" id="fileList">
        <div class="empty-state">No changes to commit.</div>
      </div>
      <div class="commit-area">
        <textarea id="message" placeholder="Summary (required)"></textarea>
        <div class="commit-meta">
          <span id="charCount">0 chars</span>
          <span id="stagedCount">0 staged</span>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" id="pushAfterCommit">
          <span>Push after commit</span>
        </label>
        <div class="actions">
          <button class="primary" id="commitBtn">Commit</button>
          <button class="secondary" id="commitPushBtn">Commit & Push</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span id="diffTitle">Diff preview</span>
        <button class="secondary" id="openFileBtn" disabled>Open file</button>
      </div>
      <div class="diff-view" id="diffView">
        <div class="empty-state">Select a file to preview changes.</div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = { files: [], branch: 'unknown', selectedPath: null };

    function send(command, data = {}) {
      vscode.postMessage({ command, ...data });
    }

    function render() {
      const list = document.getElementById('fileList');
      const fileCount = document.getElementById('fileCount');
      const stagedCount = document.getElementById('stagedCount');

      fileCount.textContent = '(' + state.files.length + ')';
      const staged = state.files.filter(function(f) { return f.status === 'staged' || f.selected; });
      stagedCount.textContent = staged.length + ' staged';

      if (state.files.length === 0) {
        list.innerHTML = '<div class="empty-state">No changes to commit.</div>';
        return;
      }

      list.innerHTML = '';
      state.files.forEach(function(file) {
        const el = document.createElement('div');
        el.className = 'file-item' + (file.path === state.selectedPath ? ' active' : '');
        el.innerHTML = '<input type="checkbox" ' + (file.selected ? 'checked' : '') + ' title="Stage for commit">' +
          '<span class="status ' + file.status + '"></span>' +
          '<span class="path" title="' + escapeHtml(file.path) + '">' + escapeHtml(file.path) + '</span>' +
          '<span class="badge ' + file.status + '">' + file.status + '</span>';
        el.querySelector('input').addEventListener('change', function(e) {
          file.selected = e.target.checked;
          updateStaging();
        });
        el.addEventListener('click', function(e) {
          if (e.target.tagName === 'INPUT') return;
          state.selectedPath = file.path;
          render();
          send('getDiff', { path: file.path, staged: file.status === 'staged' || file.selected });
        });
        list.appendChild(el);
      });
    }

    function updateStaging() {
      const toStage = state.files.filter(function(f) { return f.selected && f.status !== 'staged'; }).map(function(f) { return f.path; });
      const toUnstage = state.files.filter(function(f) { return !f.selected && f.status === 'staged'; }).map(function(f) { return f.path; });
      if (toStage.length) send('stage', { paths: toStage });
      if (toUnstage.length) send('unstage', { paths: toUnstage });
    }

    function escapeHtml(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderDiff(diff, path) {
      const view = document.getElementById('diffView');
      const title = document.getElementById('diffTitle');
      const openBtn = document.getElementById('openFileBtn');
      title.textContent = path ? 'Diff: ' + path : 'Diff preview';
      openBtn.disabled = !path;
      openBtn.onclick = function() { send('openFile', { path: path }); };

      if (!diff) {
        view.innerHTML = '<div class="empty-state">No diff available for this file.</div>';
        return;
      }

      const lines = diff.split('\\n').map(function(line) {
        if (line.indexOf('+') === 0 && line.indexOf('+++') !== 0) return '<div class="diff-line add">' + escapeHtml(line) + '</div>';
        if (line.indexOf('-') === 0 && line.indexOf('---') !== 0) return '<div class="diff-line del">' + escapeHtml(line) + '</div>';
        if (line.indexOf('@@') === 0) return '<div class="diff-line info">' + escapeHtml(line) + '</div>';
        return '<div class="diff-line">' + escapeHtml(line) + '</div>';
      }).join('');
      view.innerHTML = lines;
    }

    function showToast(message, isError) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast show' + (isError ? ' error' : '');
      setTimeout(function() { toast.className = 'toast'; }, 3000);
    }

    document.getElementById('refreshBtn').addEventListener('click', function() { send('refresh'); });
    document.getElementById('selectAllBtn').addEventListener('click', function() {
      state.files.forEach(function(f) { f.selected = true; });
      render();
      updateStaging();
    });
    document.getElementById('selectNoneBtn').addEventListener('click', function() {
      state.files.forEach(function(f) { f.selected = false; });
      render();
      updateStaging();
    });

    const messageInput = document.getElementById('message');
    messageInput.addEventListener('input', function() {
      document.getElementById('charCount').textContent = messageInput.value.length + ' chars';
    });

    function doCommit(pushAfter) {
      send('commit', { message: messageInput.value, pushAfterCommit: pushAfter });
    }

    document.getElementById('commitBtn').addEventListener('click', function() { doCommit(false); });
    document.getElementById('commitPushBtn').addEventListener('click', function() { doCommit(true); });

    window.addEventListener('message', function(event) {
      const msg = event.data;
      switch (msg.type) {
        case 'state':
          state.files = msg.files;
          state.branch = msg.branch;
          document.getElementById('branch').textContent = msg.branch;
          render();
          break;
        case 'diff':
          state.selectedPath = msg.path;
          renderDiff(msg.diff, msg.path);
          break;
        case 'error':
          showToast(msg.message, true);
          break;
        case 'committed':
          messageInput.value = '';
          document.getElementById('charCount').textContent = '0 chars';
          showToast(msg.message, false);
          break;
        case 'pushed':
          showToast('Pushed to remote', false);
          break;
      }
    });

    send('refresh');
  </script>
</body>
</html>
    `;
  }
}
