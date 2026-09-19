import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../git/GitService';
import { GitError } from '../utils/errors';
import { log } from '../utils/logger';
import { explain } from '../utils/gitExplain';
import { GitFileChange } from '../models';
import { CommitPanel } from '../webviews/CommitPanel';
import { EMPTY_DIFF_SCHEME } from '../views/EmptyDiffContentProvider';
import { CELES_DIFF_SCHEME } from '../views/CelesDiffContentProvider';

function logError(outputChannel: vscode.OutputChannel, operation: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  log(outputChannel, 'error', `[${operation}] ${message}`);
  if (err instanceof GitError) {
    if (err.stderr) {
      log(outputChannel, 'error', err.stderr);
    }
    if (err.gitCommand) {
      log(outputChannel, 'debug', `[${operation}] ${err.gitCommand}`);
    }
  }
}

function notifyError(err: unknown, outputChannel: vscode.OutputChannel): void {
  if (err instanceof GitError) {
    const items = ['Show details'];
    const explanation = explain(err.gitCommand.split(' ')[1] || '');
    if (explanation) {
      items.push('What does this do?');
    }

    vscode.window.showErrorMessage(err.userMessage, ...items).then((selection) => {
      if (selection === 'Show details') {
        outputChannel.show();
      } else if (selection === 'What does this do?' && explanation) {
        vscode.window.showInformationMessage(
          `${explanation.title}: ${explanation.description} Equivalent: ${explanation.command}`
        );
      }
    });
  } else {
    vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
  }
}

async function withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title
    },
    () => task()
  );
}

async function leftDiffUri(gitService: GitService, filePath: string, sha: string): Promise<vscode.Uri> {
  const isRoot = await gitService.isRootCommit(sha);
  const absolute = await gitService.getAbsolutePath(filePath);
  const uri = vscode.Uri.file(absolute);
  if (isRoot) {
    return uri.with({ scheme: EMPTY_DIFF_SCHEME });
  }
  return uri.with({ scheme: CELES_DIFF_SCHEME, query: JSON.stringify({ path: filePath, ref: `${sha}^` }) });
}

async function rightDiffUri(gitService: GitService, filePath: string, sha: string): Promise<vscode.Uri> {
  const absolute = await gitService.getAbsolutePath(filePath);
  return vscode.Uri.file(absolute).with({ scheme: CELES_DIFF_SCHEME, query: JSON.stringify({ path: filePath, ref: sha }) });
}

export function registerCommands(
  context: vscode.ExtensionContext,
  gitService: GitService,
  outputChannel: vscode.OutputChannel,
  refreshAll: () => void,
  commitPanel?: CommitPanel
): void {
  const register = <Args extends unknown[]>(command: string, handler: (...args: Args) => Promise<void> | void) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler as (...args: unknown[]) => unknown));
  };

  register('celes.open', () => {
    void vscode.commands.executeCommand('celesOverview.focus');
  });

  register('celes.refresh', () => {
    refreshAll();
  });

  register('celes.toggleScope', async () => {
    const config = vscode.workspace.getConfiguration('celes');
    const current = config.get<string>('scope') ?? 'workspace';
    const next = current === 'workspace' ? 'repository' : 'workspace';
    const target = vscode.workspace.workspaceFile
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.WorkspaceFolder;

    try {
      await config.update('scope', next, target);
      gitService.setScopeMode(next === 'repository' ? 'repository' : 'workspace');
      refreshAll();
      vscode.window.showInformationMessage(
        next === 'workspace'
          ? 'Celes now shows only the opened folder.'
          : 'Celes now shows the whole repository.'
      );
    } catch (err) {
      logError(outputChannel, 'toggleScope', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.initializeRepository', async () => {
    const choice = await vscode.window.showInformationMessage(
      'Initialize a Git repository? This creates a .git folder and starts tracking changes in this workspace.',
      'Initialize',
      'Cancel'
    );
    if (choice !== 'Initialize') {
      return;
    }

    try {
      await gitService.initializeRepository();
      await vscode.commands.executeCommand('setContext', 'celes:enabled', true);
      refreshAll();
      vscode.window.showInformationMessage('Git repository initialized.');
    } catch (err) {
      logError(outputChannel, 'initializeRepository', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.fetch', async () => {
    try {
      await withProgress('Fetching from remote...', () => gitService.fetch());
      refreshAll();
      vscode.window.showInformationMessage('Fetched from remote.', 'Show command').then((sel) => {
        if (sel === 'Show command') {
          outputChannel.appendLine('git fetch');
          outputChannel.show();
        }
      });
    } catch (err) {
      logError(outputChannel, 'fetch', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.pull', async () => {
    const info = explain('pull');
    const choice = await vscode.window.showInformationMessage(
      `${info?.description ?? 'Pull remote changes.'}`,
      'Pull',
      'Cancel'
    );
    if (choice !== 'Pull') {
      return;
    }

    try {
      await withProgress('Pulling from remote...', () => gitService.pull());
      refreshAll();
      vscode.window.showInformationMessage('Pulled remote changes.');
    } catch (err) {
      logError(outputChannel, 'pull', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.push', async () => {
    try {
      await withProgress('Pushing to remote...', () => gitService.push());
      refreshAll();
      vscode.window.showInformationMessage('Pushed to remote.');
    } catch (err) {
      logError(outputChannel, 'push', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.publishBranch', async () => {
    const status = await gitService.getRepositoryStatus().catch(() => undefined);
    const branch = status?.currentBranch;
    if (!branch) {
      vscode.window.showWarningMessage('Cannot publish: no current branch found.');
      return;
    }

    const info = explain('publish');
    const choice = await vscode.window.showInformationMessage(
      `${info?.description ?? 'Publish this branch to origin.'} Equivalent: git push -u origin ${branch}`,
      'Publish',
      'Cancel'
    );
    if (choice !== 'Publish') {
      return;
    }

    try {
      await withProgress(`Publishing ${branch}...`, () => gitService.publishBranch(branch));
      refreshAll();
      vscode.window.showInformationMessage(`Published ${branch} to origin.`);
    } catch (err) {
      logError(outputChannel, 'publishBranch', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.openCommitPanel', async () => {
    if (commitPanel) {
      await commitPanel.show();
    }
  });

  register('celes.commit', async () => {
    if (commitPanel) {
      await commitPanel.show();
      return;
    }

    const changes = await gitService.getChanges().catch(() => ({ staged: [], unstaged: [], untracked: [] }));
    if (changes.staged.length === 0) {
      vscode.window.showWarningMessage('No staged changes. Stage at least one file before committing.');
      return;
    }

    const message = await vscode.window.showInputBox({
      prompt: 'Commit message',
      placeHolder: 'Describe your changes',
      validateInput: (value) => (value?.trim() ? undefined : 'Commit message cannot be empty.')
    });

    if (!message?.trim()) {
      return;
    }

    try {
      await gitService.commit(message.trim());
      refreshAll();
      vscode.window.showInformationMessage(`Committed ${changes.staged.length} file(s).`, 'Push').then((sel) => {
        if (sel === 'Push') {
          void vscode.commands.executeCommand('celes.push');
        }
      });
    } catch (err) {
      logError(outputChannel, 'commit', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.amendCommit', async () => {
    const choice = await vscode.window.showInformationMessage(
      'Amend the previous commit to include staged changes?',
      'Amend',
      'Cancel'
    );
    if (choice !== 'Amend') {
      return;
    }

    const message = await vscode.window.showInputBox({
      prompt: 'New commit message (leave empty to keep the previous)',
      placeHolder: 'Optional'
    });

    try {
      await gitService.amendCommit(message || undefined);
      refreshAll();
      vscode.window.showInformationMessage('Previous commit amended.');
    } catch (err) {
      logError(outputChannel, 'amendCommit', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.stageFile', async (file?: GitFileChange) => {
    if (!file?.path) {
      return;
    }
    try {
      await gitService.stageFile(file.path);
      refreshAll();
    } catch (err) {
      logError(outputChannel, 'stageFile', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.unstageFile', async (file?: GitFileChange) => {
    if (!file?.path) {
      return;
    }
    try {
      await gitService.unstageFile(file.path);
      refreshAll();
    } catch (err) {
      logError(outputChannel, 'unstageFile', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.stageAll', async () => {
    try {
      await gitService.stageAll();
      refreshAll();
    } catch (err) {
      logError(outputChannel, 'stageAll', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.unstageAll', async () => {
    try {
      await gitService.unstageAll();
      refreshAll();
    } catch (err) {
      logError(outputChannel, 'unstageAll', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.discardFile', async (file?: GitFileChange) => {
    if (!file?.path) {
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      `Discard changes in ${file.path}? This cannot be undone.`,
      { modal: true },
      'Discard',
      'Cancel'
    );
    if (choice !== 'Discard') {
      return;
    }

    try {
      if (file.untracked) {
        await gitService.discardUntracked(file.path);
      } else {
        await gitService.discardFile(file.path);
      }
      refreshAll();
    } catch (err) {
      logError(outputChannel, 'discardFile', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.openFile', async (filePath?: string) => {
    if (!filePath) {
      return;
    }
    try {
      const absolute = await gitService.getAbsolutePath(filePath);
      const doc = await vscode.workspace.openTextDocument(absolute);
      await vscode.window.showTextDocument(doc);
    } catch (err) {
      logError(outputChannel, 'openFile', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.openDiff', async (file?: GitFileChange) => {
    if (!file?.path) {
      return;
    }
    try {
      const absolute = await gitService.getAbsolutePath(file.path);
      const uri = vscode.Uri.file(absolute);
      const title = `${file.path} (Working Tree)`;

      await vscode.commands.executeCommand(
        'vscode.diff',
        uri.with({ scheme: CELES_DIFF_SCHEME, query: JSON.stringify({ path: file.path, ref: 'HEAD' }) }),
        uri,
        title
      );
    } catch (err) {
      logError(outputChannel, 'openDiff', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.createBranch', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'New branch name',
      validateInput: (value) => (value?.trim() ? undefined : 'Branch name cannot be empty.')
    });
    if (!name?.trim()) {
      return;
    }

    try {
      await gitService.createBranch(name.trim());
      refreshAll();
      vscode.window.showInformationMessage(`Created branch ${name.trim()}.`);
    } catch (err) {
      logError(outputChannel, 'createBranch', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.checkoutBranch', async (branch?: { name: string }) => {
    const target = branch?.name || (await vscode.window.showInputBox({ prompt: 'Branch name' }));
    if (!target?.trim()) {
      return;
    }

    try {
      await gitService.checkoutBranch(target.trim());
      refreshAll();
      vscode.window.showInformationMessage(`Switched to ${target.trim()}.`);
    } catch (err) {
      logError(outputChannel, 'checkoutBranch', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.renameBranch', async (branch?: { name: string }) => {
    const oldName = branch?.name || (await vscode.window.showInputBox({ prompt: 'Branch to rename' }));
    if (!oldName?.trim()) {
      return;
    }
    const newName = await vscode.window.showInputBox({
      prompt: 'New branch name',
      validateInput: (value) => (value?.trim() ? undefined : 'New branch name cannot be empty.')
    });
    if (!newName?.trim()) {
      return;
    }

    try {
      await gitService.renameBranch(oldName.trim(), newName.trim());
      refreshAll();
      vscode.window.showInformationMessage(`Renamed ${oldName.trim()} to ${newName.trim()}.`);
    } catch (err) {
      logError(outputChannel, 'renameBranch', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.deleteBranch', async (branch?: { name: string }) => {
    const name = branch?.name || (await vscode.window.showInputBox({ prompt: 'Branch to delete' }));
    if (!name?.trim()) {
      return;
    }

    const info = explain('deleteBranch');
    const choice = await vscode.window.showWarningMessage(
      `Delete local branch ${name.trim()}? ${info?.description ?? ''}`,
      { modal: true },
      'Delete',
      'Cancel'
    );
    if (choice !== 'Delete') {
      return;
    }

    try {
      await gitService.deleteBranch(name.trim());
      refreshAll();
      vscode.window.showInformationMessage(`Deleted branch ${name.trim()}.`);
    } catch (err) {
      logError(outputChannel, 'deleteBranch', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.createStash', async () => {
    const message = await vscode.window.showInputBox({
      prompt: 'Stash message (optional)',
      placeHolder: 'WIP on current branch'
    });
    const includeUntracked = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Include untracked files?'
    });

    try {
      await gitService.createStash(message || undefined, includeUntracked === 'Yes');
      refreshAll();
      vscode.window.showInformationMessage('Stash created.');
    } catch (err) {
      logError(outputChannel, 'createStash', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.applyStash', async (stash?: { index: number; message?: string }) => {
    if (stash === undefined) {
      return;
    }
    const info = explain('stashApply');
    const choice = await vscode.window.showInformationMessage(
      `${info?.description ?? 'Apply stash.'}`,
      'Apply',
      'Cancel'
    );
    if (choice !== 'Apply') {
      return;
    }

    try {
      await gitService.applyStash(stash.index, stash.message);
      refreshAll();
      vscode.window.showInformationMessage('Stash applied.');
    } catch (err) {
      logError(outputChannel, 'applyStash', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.popStash', async (stash?: { index: number; message?: string }) => {
    if (stash === undefined) {
      return;
    }
    const info = explain('stashPop');
    const choice = await vscode.window.showInformationMessage(
      `${info?.description ?? 'Pop stash.'}`,
      'Pop',
      'Cancel'
    );
    if (choice !== 'Pop') {
      return;
    }

    try {
      await gitService.popStash(stash.index, stash.message);
      refreshAll();
      vscode.window.showInformationMessage('Stash popped.');
    } catch (err) {
      logError(outputChannel, 'popStash', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.deleteStash', async (stash?: { index: number; message?: string }) => {
    if (stash === undefined) {
      return;
    }
    const info = explain('stashDelete');
    const choice = await vscode.window.showWarningMessage(
      `Delete stash? ${info?.description ?? ''}`,
      { modal: true },
      'Delete',
      'Cancel'
    );
    if (choice !== 'Delete') {
      return;
    }

    try {
      await gitService.deleteStash(stash.index, stash.message);
      refreshAll();
      vscode.window.showInformationMessage('Stash deleted.');
    } catch (err) {
      logError(outputChannel, 'deleteStash', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.showCommitDetails', async (sha?: string) => {
    if (!sha) {
      return;
    }
    try {
      const details = await gitService.getCommitDetails(sha);
      const files = details.changedFiles
        .map((f) => `${f.path} (+${f.insertions}/-${f.deletions})`)
        .join('\n');
      const message = [
        `SHA: ${details.sha}`,
        `Author: ${details.authorName} \u003c${details.authorEmail}\u003e`,
        `Date: ${details.date.toLocaleString()}`,
        `Message: ${details.message}`,
        `Parents: ${details.parents.join(', ') || 'none'}`,
        `Files changed: ${details.changedFiles.length}`,
        `Insertions: +${details.insertions}`,
        `Deletions: -${details.deletions}`,
        '',
        files
      ].join('\n');

      vscode.window.showInformationMessage('Commit details copied to output channel.');
      outputChannel.appendLine(message);
      outputChannel.show();
    } catch (err) {
      logError(outputChannel, 'showCommitDetails', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.renameCommit', async (sha?: string) => {
    if (!sha) {
      return;
    }
    const newMessage = await vscode.window.showInputBox({
      prompt: 'New commit message',
      validateInput: (value) => (value?.trim() ? undefined : 'Message cannot be empty.')
    });
    if (!newMessage?.trim()) {
      return;
    }
    try {
      await gitService.renameCommit(sha, newMessage.trim());
      refreshAll();
      vscode.window.showInformationMessage('Commit renamed.');
    } catch (err) {
      logError(outputChannel, 'renameCommit', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.undoCommit', async (sha?: string) => {
    if (!sha) {
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      'Undo the last commit and keep the changes staged?',
      'Undo',
      'Cancel'
    );
    if (choice !== 'Undo') {
      return;
    }
    try {
      await gitService.softUndoCommit(sha);
      refreshAll();
      vscode.window.showInformationMessage('Commit undone. Changes are staged.');
    } catch (err) {
      logError(outputChannel, 'undoCommit', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.showCommitDiff', async (sha?: string) => {
    if (!sha) {
      return;
    }
    try {
      const title = `Changes in ${sha.substring(0, 7)}`;
      const details = await gitService.getCommitDetails(sha);
      for (const file of details.changedFiles) {
        await vscode.commands.executeCommand(
          'vscode.diff',
          await leftDiffUri(gitService, file.path, sha),
          await rightDiffUri(gitService, file.path, sha),
          `${file.path} (${title})`,
          { renderSideBySide: true, preview: false }
        );
      }
    } catch (err) {
      logError(outputChannel, 'showCommitDiff', err);
      notifyError(err, outputChannel);
    }
  });

  register('celes.openCommitFileDiff', async (sha?: string, filePath?: string) => {
    if (!sha || !filePath) {
      return;
    }
    try {
      const title = `${path.basename(filePath)} (${sha.substring(0, 7)})`;
      await vscode.commands.executeCommand(
        'vscode.diff',
        await leftDiffUri(gitService, filePath, sha),
        await rightDiffUri(gitService, filePath, sha),
        title,
        { renderSideBySide: true, preview: false }
      );
    } catch (err) {
      logError(outputChannel, 'openCommitFileDiff', err);
      notifyError(err, outputChannel);
    }
  });
}
