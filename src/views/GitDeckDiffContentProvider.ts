import * as vscode from 'vscode';
import { GitService } from '../git/GitService';

export const GITDECK_DIFF_SCHEME = 'gitdeck-diff';

export class GitDeckDiffContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly gitService: GitService) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      const query = JSON.parse(uri.query) as { path: string; ref: string };
      if (!query.ref || query.ref === 'EMPTY') {
        return '';
      }
      return await this.gitService.showFileAtRef(query.path, query.ref);
    } catch (err) {
      return '';
    }
  }
}
