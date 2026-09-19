import * as vscode from 'vscode';
import { GitService } from '../git/GitService';

const MAX_LISTED = 8;

/**
 * Under folder scope the panel only shows files inside the opened folder, but a
 * commit takes the whole index. Surface anything staged outside the scope so it
 * is never committed invisibly.
 *
 * Returns true when the commit may proceed.
 */
export async function confirmStagedOutsideScope(gitService: GitService): Promise<boolean> {
  const outside = await gitService.getStagedOutsideScope();
  if (outside.length === 0) {
    return true;
  }

  const scope = gitService.getScopePath();
  const listed = outside.slice(0, MAX_LISTED).join('\n');
  const rest = outside.length > MAX_LISTED ? `\n…and ${outside.length - MAX_LISTED} more` : '';

  const choice = await vscode.window.showWarningMessage(
    `${outside.length} staged file(s) outside ${scope} will also be committed.`,
    {
      modal: true,
      detail: `These are staged but hidden by the current folder scope:\n\n${listed}${rest}\n\nUnstage them first to commit only ${scope}.`
    },
    'Commit anyway',
    'Cancel'
  );

  return choice === 'Commit anyway';
}
