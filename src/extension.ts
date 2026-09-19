import * as vscode from 'vscode';
import { GitService } from './git/GitService';
import type { GitScopeMode } from './git/GitService';
import { registerCommands } from './commands';
import { debounce } from './utils/debounce';
import { log } from './utils/logger';
import { CommitPanel } from './webviews/CommitPanel';
import { ChangesWebviewProvider } from './webviews/ChangesWebviewProvider';
import { MoreWebviewProvider } from './webviews/MoreWebviewProvider';
import { EmptyDiffContentProvider, EMPTY_DIFF_SCHEME } from './views/EmptyDiffContentProvider';
import { CelesDiffContentProvider, CELES_DIFF_SCHEME } from './views/CelesDiffContentProvider';

let gitService: GitService | undefined;
let changesWebviewProvider: ChangesWebviewProvider | undefined;
let moreWebviewProvider: MoreWebviewProvider | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let commitPanel: CommitPanel | undefined;

export function getScopeMode(): GitScopeMode {
  const config = vscode.workspace.getConfiguration('celes');
  return config.get<GitScopeMode>('scope') ?? 'workspace';
}

export function getGitService(): GitService | undefined {
  return gitService;
}

export function getOutputChannel(): vscode.OutputChannel | undefined {
  return outputChannel;
}

export function refreshAll(): void {
  changesWebviewProvider?.refresh();
  moreWebviewProvider?.refresh();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Celes');
  context.subscriptions.push(outputChannel);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    log(outputChannel, 'info', 'No workspace folder open. Celes will activate when a folder is opened.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const config = vscode.workspace.getConfiguration('celes');
  const gitPath = config.get<string>('gitPath') || undefined;

  gitService = new GitService({ workspaceRoot, gitPath, scope: getScopeMode() });

  const isRepo = await gitService.detectRepository();
  await vscode.commands.executeCommand('setContext', 'celes:enabled', isRepo);

  changesWebviewProvider = new ChangesWebviewProvider(context.extensionUri, gitService, refreshAll, outputChannel);
  moreWebviewProvider = new MoreWebviewProvider(context.extensionUri, gitService, refreshAll, outputChannel);

  const views = [
    vscode.window.registerWebviewViewProvider(ChangesWebviewProvider.viewType, changesWebviewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.registerWebviewViewProvider(MoreWebviewProvider.viewType, moreWebviewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.workspace.registerTextDocumentContentProvider(EMPTY_DIFF_SCHEME, new EmptyDiffContentProvider()),
    vscode.workspace.registerTextDocumentContentProvider(
      CELES_DIFF_SCHEME,
      new CelesDiffContentProvider(gitService)
    )
  ];

  context.subscriptions.push(...views);

  commitPanel = new CommitPanel(context.extensionUri, gitService, refreshAll, outputChannel);

  registerCommands(context, gitService, outputChannel, refreshAll, commitPanel);

  const debouncedRefresh = debounce(() => {
    refreshAll();
  }, 300);

  const fileWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(workspaceRoot), '**/*')
  );
  context.subscriptions.push(
    fileWatcher.onDidChange(debouncedRefresh),
    fileWatcher.onDidCreate(debouncedRefresh),
    fileWatcher.onDidDelete(debouncedRefresh),
    fileWatcher
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      debouncedRefresh();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      debouncedRefresh();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        debouncedRefresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('celes.scope')) {
        gitService?.setScopeMode(getScopeMode());
        refreshAll();
      }
    })
  );

  if (isRepo) {
    refreshAll();
  }
}

export function deactivate(): void {
  gitService = undefined;
  changesWebviewProvider = undefined;
  moreWebviewProvider = undefined;
  outputChannel = undefined;
}
