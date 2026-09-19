import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import { GitError } from '../utils/errors';
import { log } from '../utils/logger';
import { confirmStagedOutsideScope } from '../utils/scopeGuard';
import { CELES_DIFF_SCHEME } from '../views/CelesDiffContentProvider';
import { CELES_ICONS, CELES_STRIP_CSS, celesStripHtml, cspMeta, createNonce } from './branding';

interface WebviewFile {
  path: string;
  status: 'staged' | 'unstaged' | 'untracked';
}

export class ChangesWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'celesChanges';
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly gitService: GitService,
    private readonly refreshAll: () => void,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
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
        case 'discard':
          await this.discardPaths(message.paths);
          break;
        case 'openDiff':
          await this.openDiff(message.path, message.staged);
          break;
        case 'openFile':
          await this.openFile(message.path);
          break;
        case 'stageAll':
          await this.stageAll();
          break;
        case 'unstageAll':
          await this.unstageAll();
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
      const changes = await this.gitService.getChanges();
      const status = await this.gitService.getRepositoryStatus().catch(() => undefined);
      const files: WebviewFile[] = [
        ...changes.staged.map((c) => ({ path: c.path, status: 'staged' as const })),
        ...changes.unstaged.map((c) => ({ path: c.path, status: 'unstaged' as const })),
        ...changes.untracked.map((c) => ({ path: c.path, status: 'untracked' as const }))
      ];

      this.view.webview.postMessage({
        type: 'state',
        files,
        branch: status?.currentBranch ?? 'unknown',
        scopePath: this.gitService.getScopePath(),
        ahead: status?.ahead ?? 0,
        behind: status?.behind ?? 0
      });
    } catch (err) {
      this.logError('refresh', err);
      this.view.webview.postMessage({ type: 'error', message: this.errorMessage(err) });
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

  private async stageAll(): Promise<void> {
    try {
      await this.gitService.stageAll();
      await this.refresh();
      this.refreshAll();
    } catch (err) {
      this.logError('stageAll', err);
      this.sendError(err);
    }
  }

  private async unstageAll(): Promise<void> {
    try {
      await this.gitService.unstageAll();
      await this.refresh();
      this.refreshAll();
    } catch (err) {
      this.logError('unstageAll', err);
      this.sendError(err);
    }
  }

  private async discardPaths(paths: string[]): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      `Discard changes in ${paths.length} file(s)? This cannot be undone.`,
      { modal: true },
      'Discard',
      'Cancel'
    );
    if (choice !== 'Discard') {
      return;
    }

    try {
      const changes = await this.gitService.getChanges();
      const untrackedPaths = paths.filter((p) => changes.untracked.some((u) => u.path === p));
      const trackedPaths = paths.filter((p) => !untrackedPaths.includes(p));

      for (const p of trackedPaths) {
        await this.gitService.discardFile(p);
      }
      for (const p of untrackedPaths) {
        await this.gitService.discardUntracked(p);
      }

      await this.refresh();
      this.refreshAll();
    } catch (err) {
      this.logError('discard', err);
      this.sendError(err);
    }
  }

  private async commit(message: string, pushAfterCommit: boolean): Promise<void> {
    if (!message.trim()) {
      this.view?.webview.postMessage({ type: 'error', message: 'Please provide a commit message.' });
      return;
    }

    try {
      const changes = await this.gitService.getChanges();
      if (changes.staged.length === 0) {
        this.view?.webview.postMessage({
          type: 'error',
          message: 'No staged changes. Select at least one file before committing.'
        });
        return;
      }

      if (!(await confirmStagedOutsideScope(this.gitService))) {
        return;
      }

      await this.gitService.commit(message.trim());
      this.refreshAll();
      this.view?.webview.postMessage({
        type: 'committed',
        message: `Committed ${changes.staged.length} file(s).`,
        pushAfterCommit
      });

      if (pushAfterCommit) {
        await this.gitService.push();
        this.refreshAll();
        this.view?.webview.postMessage({ type: 'pushed' });
      }

      await this.refresh();
    } catch (err) {
      this.logError('commit', err);
      this.sendError(err);
    }
  }

  private async openDiff(filePath: string, _staged: boolean): Promise<void> {
    try {
      const absolute = await this.gitService.getAbsolutePath(filePath);
      const uri = vscode.Uri.file(absolute);
      const title = `${filePath} (Working Tree)`;

      await vscode.commands.executeCommand(
        'vscode.diff',
        uri.with({ scheme: CELES_DIFF_SCHEME, query: JSON.stringify({ path: filePath, ref: 'HEAD' }) }),
        uri,
        title,
        { renderSideBySide: true, preview: false }
      );
    } catch (err) {
      this.logError('openDiff', err);
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

  private logError(operation: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    log(this.outputChannel, 'error', `[changesWebview:${operation}] ${message}`);
    if (err instanceof GitError && err.stderr) {
      log(this.outputChannel, 'error', err.stderr);
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof GitError ? err.userMessage : err instanceof Error ? err.message : String(err);
  }

  private sendError(err: unknown): void {
    this.view?.webview.postMessage({ type: 'error', message: this.errorMessage(err) });
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
  <title>Celes Changes</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, var(--vscode-editor-background, #1e1e1e));
      --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground, #cccccc));
      --border: var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border, #333333));
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --button-bg: var(--vscode-button-background, #0e639c);
      --button-fg: var(--vscode-button-foreground, #ffffff);
      --button-hover: var(--vscode-button-hoverBackground, #1177bb);
      --secondary-bg: var(--vscode-button-secondaryBackground, #3c3c3c);
      --secondary-fg: var(--vscode-button-secondaryForeground, #cccccc);
      --accent: var(--vscode-focusBorder, #007acc);
      --added: var(--vscode-gitDecoration-addedResourceForeground, #73c991);
      --modified: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
      --deleted: var(--vscode-gitDecoration-deletedResourceForeground, #f85149);
      --untracked: var(--vscode-gitDecoration-untrackedResourceForeground, #73c991);
      --staged: var(--vscode-gitDecoration-stageModifiedResourceForeground, #73c991);
      --success: #3fb950;
      --warning: #d29922;
      --radius: 4px;
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: 12px;
      background: var(--bg);
      color: var(--fg);
      margin: 0;
      padding: 10px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .commit-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 10px;
    }
    textarea {
      width: 100%;
      min-height: 56px;
      resize: vertical;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px;
      font-family: inherit;
      font-size: 12px;
      outline: none;
    }
    textarea:focus { border-color: var(--accent); }
    .commit-meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      opacity: 0.8;
    }
    .commit-actions {
      display: flex;
      gap: 6px;
    }
    .commit-actions button { flex: 1; }
    button {
      border: none;
      border-radius: var(--radius);
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
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
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      cursor: pointer;
    }
    .checkbox-row input { accent-color: var(--button-bg); }
    .toolbar {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      align-items: center;
    }
    .toolbar button {
      padding: 4px 8px;
      font-size: 11px;
      flex: 1;
    }
    .toolbar .toggle {
      flex: 0 0 auto;
      min-width: 28px;
    }
    .section {
      margin-bottom: 8px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 2px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      opacity: 0.9;
    }
    .section-header span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .section-header .chevron::before { content: '▾'; }
    .section-header.collapsed .chevron::before { content: '▸'; }
    .section-action {
      width: 18px;
      height: 18px;
      padding: 0;
      margin-left: 6px;
      font-size: 14px;
      line-height: 1;
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 3px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .section-action:hover { background: var(--input-bg); color: var(--accent); border-color: var(--accent); }
    #sections {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    .file-list {
      flex: 1;
    }
    .file-list:not(.expanded) { display: none; }
    .file-item, .folder-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 4px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .file-item:hover, .folder-item:hover { background: var(--input-bg); }
    .file-item.active { background: var(--input-bg); outline: 1px solid var(--accent); }
    .file-item .dot, .folder-item .chevron {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }
    .dot.staged { color: var(--staged); }
    .dot.unstaged { color: var(--modified); }
    .dot.untracked { color: var(--untracked); }
    .file-item .path, .folder-item .path {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
    }
    .file-item .badge {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 600;
      opacity: 0.9;
    }
    .badge.staged { color: var(--staged); background: rgba(115, 201, 145, 0.15); }
    .badge.unstaged { color: var(--modified); background: rgba(226, 192, 141, 0.15); }
    .badge.untracked { color: var(--untracked); background: rgba(115, 201, 145, 0.15); }
    .file-actions {
      display: none;
      gap: 2px;
      align-items: center;
    }
    .file-item:hover .file-actions { display: flex; }
    .file-actions button {
      width: 18px;
      height: 18px;
      padding: 0;
      font-size: 14px;
      line-height: 1;
      background: transparent;
      color: var(--fg);
      border: none;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .file-actions button:hover { background: var(--input-bg); color: var(--accent); }
    .folder-actions {
      display: none;
      gap: 2px;
      align-items: center;
    }
    .folder-item:hover .folder-actions { display: flex; }
    .folder-actions button {
      width: 18px;
      height: 18px;
      padding: 0;
      font-size: 14px;
      line-height: 1;
      background: transparent;
      color: var(--fg);
      border: none;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .folder-actions button:hover { background: var(--input-bg); color: var(--accent); }
    .folder-children {
      padding-left: 20px;
      display: none;
    }
    .folder-children.expanded { display: block; }
    .folder-item .chevron::before { content: '▸'; }
    .folder-item.expanded .chevron::before { content: '▾'; }
    .empty-state {
      padding: 20px 10px;
      text-align: center;
      opacity: 0.7;
      font-size: 12px;
    }
    .toast {
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 10px 14px;
      border-radius: var(--radius);
      background: var(--success);
      color: #fff;
      font-weight: 600;
      transform: translateY(80px);
      opacity: 0;
      transition: transform 0.25s, opacity 0.25s;
      z-index: 100;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.error { background: var(--warning); }
${CELES_STRIP_CSS}
  </style>
</head>
<body>
${celesStripHtml({ badgeId: 'branchBadge' })}

  <div class="commit-box">
    <textarea id="message" placeholder="Message (required)"></textarea>
    <div class="commit-meta">
      <span id="charCount">0 chars</span>
      <span id="stagedCount">0 staged</span>
    </div>
    <div class="commit-actions">
      <button class="primary" id="commitBtn">Commit</button>
      <button class="secondary" id="commitPushBtn">Commit & Push</button>
    </div>

  </div>

  <div class="toolbar">
    <button class="secondary toggle icon-btn" id="treeToggle" title="Switch to list view" aria-label="Toggle tree view">${CELES_ICONS.tree}</button>
    <button class="secondary icon-btn" id="refreshBtn" title="Refresh" aria-label="Refresh">${CELES_ICONS.refresh}</button>
  </div>

  <div id="sections"></div>

  <div class="toast" id="toast"></div>

  <script nonce="${nonce}">
    const ICONS = ${JSON.stringify(CELES_ICONS)};
    const vscode = acquireVsCodeApi();
    let state = { files: [], branch: 'unknown', treeView: true, collapsedFolders: new Set() };

    function send(command, data) {
      vscode.postMessage({ command, ...data });
    }

    function escapeHtml(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function buildTree(files) {
      const root = { name: '', relativePath: '', children: new Map(), files: [] };
      for (const file of files) {
        const segments = file.path.split('/');
        let current = root;
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          const isLeaf = i === segments.length - 1;
          if (isLeaf) {
            current.files.push({ ...file, displayName: segment });
          } else {
            let next = current.children.get(segment);
            if (!next) {
              next = { name: segment, relativePath: segments.slice(0, i + 1).join('/'), children: new Map(), files: [] };
              current.children.set(segment, next);
            }
            current = next;
          }
        }
      }
      root.files.sort((a, b) => a.displayName.localeCompare(b.displayName));
      root.children = sortNodes([...root.children.values()]);
      return root;
    }

    function sortNodes(nodes) {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      for (const node of nodes) {
        node.files.sort((a, b) => a.displayName.localeCompare(b.displayName));
        node.children = sortNodes([...node.children.values()]);
      }
      return nodes;
    }

    function renderFile(file) {
      const el = document.createElement('div');
      el.className = 'file-item';
      const isStaged = file.status === 'staged';
      const isUntracked = file.status === 'untracked';
      const dotSymbol = isStaged ? '●' : isUntracked ? '+' : '●';
      el.innerHTML =
        '<span class="dot ' + file.status + '">' + dotSymbol + '</span>' +
        '<span class="path" title="' + escapeHtml(file.path) + '">' + escapeHtml(state.treeView ? file.displayName : file.path) + '</span>' +
        '<span class="badge ' + file.status + '">' + file.status + '</span>' +
        '<span class="file-actions">' +
          (isStaged
            ? '<button class="unstage-one icon-btn" title="Unstage" aria-label="Unstage">' + ICONS.minus + '</button>'
            : '<button class="stage-one icon-btn" title="Stage" aria-label="Stage">' + ICONS.plus + '</button>') +
          '<button class="discard-one icon-btn" title="Discard" aria-label="Discard">' + ICONS.trash + '</button>' +
        '</span>';

      const stageOne = el.querySelector('.stage-one');
      if (stageOne) {
        stageOne.addEventListener('click', function(e) {
          e.stopPropagation();
          send('stage', { paths: [file.path] });
        });
      }

      const unstageOne = el.querySelector('.unstage-one');
      if (unstageOne) {
        unstageOne.addEventListener('click', function(e) {
          e.stopPropagation();
          send('unstage', { paths: [file.path] });
        });
      }

      const discardOne = el.querySelector('.discard-one');
      if (discardOne) {
        discardOne.addEventListener('click', function(e) {
          e.stopPropagation();
          send('discard', { paths: [file.path] });
        });
      }

      el.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        document.querySelectorAll('.file-item').forEach(function(i) { i.classList.remove('active'); });
        el.classList.add('active');
        if (isUntracked) {
          send('openFile', { path: file.path });
        } else {
          send('openDiff', { path: file.path, staged: isStaged });
        }
      });

      return el;
    }


    function collectFiles(node) {
      const files = [];
      for (const file of node.files) files.push(file);
      for (const child of node.children) files.push(...collectFiles(child));
      return files;
    }

    function renderFolder(node) {
      const container = document.createElement('div');
      const isExpanded = !state.collapsedFolders.has(node.relativePath);
      const header = document.createElement('div');
      header.className = 'folder-item' + (isExpanded ? ' expanded' : '');
      const folderFiles = collectFiles(node);
      const hasStaged = folderFiles.some(function(f) { return f.status === 'staged'; });
      const hasUnstaged = folderFiles.some(function(f) { return f.status !== 'staged' && f.status !== 'untracked'; });
      const folderActions = (hasStaged ? '<button class="folder-action unstage" title="Unstage all in folder">−</button>' : '') +
                            (hasUnstaged ? '<button class="folder-action stage" title="Stage all in folder">+</button>' : '');
      header.innerHTML = '<span class="chevron"></span><span class="path">' + escapeHtml(node.name) + '</span>' +
                         (folderActions ? '<span class="folder-actions">' + folderActions + '</span>' : '');

      const children = document.createElement('div');
      children.className = 'folder-children' + (isExpanded ? ' expanded' : '');

      const stageBtn = header.querySelector('.folder-action.stage');
      if (stageBtn) {
        stageBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          const paths = folderFiles.filter(function(f) { return f.status !== 'staged' && f.status !== 'untracked'; }).map(function(f) { return f.path; });
          if (paths.length) send('stage', { paths: paths });
        });
      }
      const unstageBtn = header.querySelector('.folder-action.unstage');
      if (unstageBtn) {
        unstageBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          const paths = folderFiles.filter(function(f) { return f.status === 'staged'; }).map(function(f) { return f.path; });
          if (paths.length) send('unstage', { paths: paths });
        });
      }

      for (const child of node.children) {
        children.appendChild(renderFolder(child));
      }
      for (const file of node.files) {
        children.appendChild(renderFile(file));
      }

      header.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        const expanded = header.classList.contains('expanded');
        header.classList.toggle('expanded', !expanded);
        children.classList.toggle('expanded', !expanded);
        if (expanded) {
          state.collapsedFolders.add(node.relativePath);
        } else {
          state.collapsedFolders.delete(node.relativePath);
        }
      });

      container.appendChild(header);
      container.appendChild(children);
      return container;
    }

    function renderSection(key, files) {
      const section = document.createElement('div');
      section.className = 'section';
      const title = key === 'staged' ? 'Staged' : key === 'unstaged' ? 'Changes' : 'Untracked';
      const actionButton = key === 'staged'
        ? '<button class="section-action" data-action="unstageAll" title="Unstage all">−</button>'
        : key === 'unstaged'
        ? '<button class="section-action" data-action="stageAll" title="Stage all">+</button>'
        : '';
      section.innerHTML = '<div class="section-header" style="cursor:pointer"><span><span class="chevron"></span>' + title + '</span><span>' + files.length + actionButton + '</span></div>';

      const header = section.querySelector('.section-header');
      header.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        const isExpanded = list.classList.contains('expanded');
        list.classList.toggle('expanded', !isExpanded);
        header.classList.toggle('collapsed', isExpanded);
      });

      const actionBtn = header.querySelector('.section-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          send(actionBtn.dataset.action);
        });
      }

      const list = document.createElement('div');
      list.className = 'file-list';
      list.classList.add('expanded');

      if (state.treeView) {
        const root = buildTree(files);
        for (const node of root.children) {
          list.appendChild(renderFolder(node));
        }
        for (const file of root.files) {
          list.appendChild(renderFile(file));
        }
      } else {
        for (const file of files) {
          list.appendChild(renderFile(file));
        }
      }

      section.appendChild(list);
      return section;
    }

    function render() {
      const container = document.getElementById('sections');
      const stagedCount = document.getElementById('stagedCount');
      const staged = state.files.filter(function(f) { return f.status === 'staged'; });
      stagedCount.textContent = staged.length + ' staged';

      if (state.files.length === 0) {
        container.innerHTML = '<div class="empty-state">No changes. Working tree is clean.</div>';
        return;
      }

      const groups = {
        staged: state.files.filter(function(f) { return f.status === 'staged'; }),
        unstaged: state.files.filter(function(f) { return f.status === 'unstaged'; }),
        untracked: state.files.filter(function(f) { return f.status === 'untracked'; })
      };

      container.innerHTML = '';
      Object.keys(groups).forEach(function(key) {
        const list = groups[key];
        if (list.length === 0) return;
        container.appendChild(renderSection(key, list));
      });
    }

    function showToast(message, isError) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast show' + (isError ? ' error' : '');
      setTimeout(function() { toast.className = 'toast'; }, 3000);
    }

    const messageInput = document.getElementById('message');
    messageInput.addEventListener('input', function() {
      document.getElementById('charCount').textContent = messageInput.value.length + ' chars';
    });

    document.getElementById('commitBtn').addEventListener('click', function() {
      send('commit', { message: messageInput.value, pushAfterCommit: false });
    });
    document.getElementById('commitPushBtn').addEventListener('click', function() {
      send('commit', { message: messageInput.value, pushAfterCommit: true });
    });

    document.getElementById('refreshBtn').addEventListener('click', function() { send('refresh'); });

    const treeToggle = document.getElementById('treeToggle');
    treeToggle.addEventListener('click', function() {
      state.treeView = !state.treeView;
      treeToggle.title = state.treeView ? 'Switch to list view' : 'Switch to tree view';
      treeToggle.innerHTML = state.treeView ? ICONS.tree : ICONS.list;
      render();
    });

    window.addEventListener('message', function(event) {
      const msg = event.data;
      switch (msg.type) {
        case 'state':
          state.files = msg.files;
          state.branch = msg.branch;
          document.getElementById('branchBadge').lastElementChild.textContent = msg.branch;
          document.getElementById('branchBadge').title = msg.scopePath
            ? 'Branch ' + msg.branch + ' · scope: ' + msg.scopePath
            : 'Current branch';
          render();
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
