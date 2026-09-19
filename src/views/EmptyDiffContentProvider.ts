import * as vscode from 'vscode';

export const EMPTY_DIFF_SCHEME = 'celes-empty';

export class EmptyDiffContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(): string {
    return '';
  }
}
