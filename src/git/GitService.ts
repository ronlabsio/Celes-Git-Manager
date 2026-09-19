import * as path from 'path';
import { GitCommandRunner } from './GitCommandRunner';
import { parseStatus } from './parsers/parseStatus';
import { parseBranches, parseRemoteBranches } from './parsers/parseBranches';
import { parseLog, parseCommitDetails, parseCommitNamesStatus } from './parsers/parseLog';
import { parseStash } from './parsers/parseStash';
import { parseRemotes } from './parsers/parseRemote';
import {
  GitBranch,
  GitChanges,
  GitCommit,
  GitCommitDetails,
  GitCommitFile,
  GitRemote,
  GitStash,
  RepositoryStatus
} from '../models';
import { findGitRoot } from '../utils/paths';
import { GitError } from '../utils/errors';

export interface GitServiceOptions {
  gitPath?: string;
  workspaceRoot: string;
  scope?: GitScopeMode;
}

export type GitScopeMode = 'repository' | 'workspace';

export class GitService {
  private runner: GitCommandRunner;
  private repositoryRoot: string | undefined;
  private initialCommit = false;
  private scopeMode: GitScopeMode;
  private scopePath: string | undefined;

  constructor(private readonly options: GitServiceOptions) {
    this.runner = new GitCommandRunner(options.gitPath);
    this.scopeMode = options.scope ?? 'workspace';
  }

  async detectRepository(): Promise<boolean> {
    this.repositoryRoot = await findGitRoot(this.options.workspaceRoot);
    this.updateScopePath();
    return this.repositoryRoot !== undefined;
  }

  getRepositoryRoot(): string | undefined {
    return this.repositoryRoot;
  }

  getScopePath(): string | undefined {
    return this.scopePath;
  }

  getScopeMode(): GitScopeMode {
    return this.scopeMode;
  }

  setScopeMode(mode: GitScopeMode): void {
    this.scopeMode = mode;
    this.updateScopePath();
  }

  private updateScopePath(): void {
    if (!this.repositoryRoot || this.scopeMode === 'repository') {
      this.scopePath = undefined;
      return;
    }

    const relative = path.relative(this.repositoryRoot, this.options.workspaceRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      this.scopePath = undefined;
      return;
    }

    this.scopePath = relative.split(path.sep).join('/');
  }

  private withScope(args: string[]): string[] {
    return this.scopePath ? [...args, '--', this.scopePath] : args;
  }

  async initializeRepository(): Promise<void> {
    await this.runner.run(['init'], { cwd: this.options.workspaceRoot });
    this.repositoryRoot = this.options.workspaceRoot;
    this.updateScopePath();
  }

  private async run(args: string[], cwd?: string) {
    const effectiveCwd = cwd ?? this.repositoryRoot ?? this.options.workspaceRoot;
    return this.runner.run(args, { cwd: effectiveCwd });
  }

  private async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.run(['rev-parse', '--abbrev-ref', 'HEAD']);
      return result.stdout.trim();
    } catch (err) {
      if (err instanceof GitError && err.message.includes('HEAD')) {
        this.initialCommit = true;
        return '';
      }
      throw err;
    }
  }

  private async getAheadBehind(branch: string): Promise<{ ahead: number; behind: number }> {
    if (!branch || this.initialCommit) {
      return { ahead: 0, behind: 0 };
    }

    try {
      const result = await this.run(['rev-list', '--left-right', '--count', `${branch}...@{upstream}`]);
      const [behind, ahead] = result.stdout.trim().split(/\s+/).map((n) => parseInt(n, 10));
      return { ahead: ahead || 0, behind: behind || 0 };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  private async hasInitialCommit(): Promise<boolean> {
    try {
      await this.run(['rev-parse', 'HEAD']);
      return false;
    } catch {
      return true;
    }
  }

  async getRepositoryStatus(): Promise<RepositoryStatus> {
    const isRepo = await this.detectRepository();
    if (!isRepo || !this.repositoryRoot) {
      return {
        isGitRepository: false,
        currentBranch: undefined,
        ahead: 0,
        behind: 0,
        branches: [],
        remotes: [],
        changes: { staged: [], unstaged: [], untracked: [] },
        initialCommit: false
      };
    }

    this.initialCommit = await this.hasInitialCommit();
    const currentBranch = this.initialCommit ? '' : await this.getCurrentBranch();
    const repositoryName = path.basename(this.repositoryRoot);
    const statusResult = await this.run(this.withScope(['status', '--porcelain=1', '-b', '-uall']));
    const status = parseStatus(statusResult.stdout, currentBranch, this.initialCommit);
    const aheadBehind = await this.getAheadBehind(currentBranch);
    const branches = await this.getBranches();
    const remotes = await this.getRemotes();

    return {
      ...status,
      repositoryName,
      repositoryRoot: this.repositoryRoot,
      ahead: aheadBehind.ahead,
      behind: aheadBehind.behind,
      branches,
      remotes
    };
  }

  async getChanges(): Promise<GitChanges> {
    const currentBranch = this.initialCommit ? '' : await this.getCurrentBranch();
    const result = await this.run(this.withScope(['status', '--porcelain=1', '-uall']));
    return parseStatus(result.stdout, currentBranch, this.initialCommit).changes;
  }

  async stageFile(filePath: string): Promise<void> {
    await this.run(['add', '--', filePath]);
  }

  async unstageFile(filePath: string): Promise<void> {
    await this.run(['restore', '--staged', '--', filePath]);
  }

  async stageAll(): Promise<void> {
    await this.run(this.scopePath ? ['add', '--', this.scopePath] : ['add', '.']);
  }

  async unstageAll(): Promise<void> {
    await this.run(
      this.scopePath ? ['restore', '--staged', '--', this.scopePath] : ['restore', '--staged', '.']
    );
  }

  async discardFile(filePath: string): Promise<void> {
    await this.run(['restore', '--', filePath]);
  }

  async discardUntracked(filePath: string): Promise<void> {
    // git rm only handles tracked files; untracked ones need clean.
    await this.run(['clean', '-f', '--', filePath]);
  }

  async commit(message: string): Promise<void> {
    if (!message.trim()) {
      throw new GitError('Commit message is empty', undefined, '', '', 'Please provide a commit message.');
    }
    await this.run(['commit', '-m', message.trim()]);
  }

  async amendCommit(message?: string): Promise<void> {
    const args = ['commit', '--amend', '--no-edit'];
    if (message?.trim()) {
      args.push('--message', message.trim());
      args.splice(args.indexOf('--no-edit'), 1);
    }
    await this.run(args);
  }

  async getBranches(): Promise<GitBranch[]> {
    const currentBranch = this.initialCommit ? '' : await this.getCurrentBranch();
    const [localResult, remoteResult] = await Promise.all([
      this.run(['branch', '-vv']).catch(() => ({ stdout: '' })),
      this.run(['branch', '-r', '--no-abbrev']).catch(() => ({ stdout: '' }))
    ]);

    const local = parseBranches(localResult.stdout, currentBranch);
    const remote = parseRemoteBranches(remoteResult.stdout);

    return [...local, ...remote];
  }

  async createBranch(name: string, base?: string): Promise<void> {
    if (!name.trim()) {
      throw new GitError('Branch name is empty');
    }
    const args = base ? ['branch', name.trim(), base.trim()] : ['branch', name.trim()];
    await this.run(args);
  }

  async checkoutBranch(name: string): Promise<void> {
    if (!name.trim()) {
      throw new GitError('Branch name is empty');
    }
    await this.run(['checkout', name.trim()]);
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    if (!oldName.trim() || !newName.trim()) {
      throw new GitError('Branch name is empty');
    }
    await this.run(['branch', '-m', oldName.trim(), newName.trim()]);
  }

  async deleteBranch(name: string): Promise<void> {
    if (!name.trim()) {
      throw new GitError('Branch name is empty');
    }
    await this.run(['branch', '-d', name.trim()]);
  }

  async fetch(): Promise<void> {
    await this.run(['fetch']);
  }

  async pull(): Promise<void> {
    await this.run(['pull']);
  }

  async push(): Promise<void> {
    await this.run(['push']);
  }

  async publishBranch(branch: string): Promise<void> {
    if (!branch.trim()) {
      throw new GitError('Branch name is empty');
    }
    await this.run(['push', '-u', 'origin', branch.trim()]);
  }

  async getHistory(limit = 50): Promise<GitCommit[]> {
    const format = `%H%x01%h%x01%an%x01%ae%x01%aI%x01%P%x01%B%x02`;
    const result = await this.run(this.withScope(['log', `--format=${format}`, `-${limit}`])).catch(() => ({
      stdout: ''
    }));
    return parseLog(result.stdout);
  }

  async getCommitDetails(sha: string): Promise<GitCommitDetails> {
    const format = `%H%x01%h%x01%an%x01%ae%x01%aI%x01%P%x01%B%x03`;
    const result = await this.run(this.withScope(['show', '--stat', `--format=${format}`, sha]));
    return parseCommitDetails(result.stdout);
  }

  async getCommitFiles(sha: string): Promise<GitCommitFile[]> {
    const result = await this.run(
      this.withScope(['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', '-M', sha])
    );
    return parseCommitNamesStatus(result.stdout);
  }

  async getHeadSha(): Promise<string> {
    const result = await this.run(['rev-parse', 'HEAD']);
    return result.stdout.trim();
  }

  /**
   * Both rewrites below act on HEAD. Callers pass the commit the user picked,
   * so refuse anything else: under folder scope the top of the displayed
   * history is the latest commit touching that folder, not necessarily HEAD.
   */
  private async assertIsHead(sha: string, action: string): Promise<void> {
    if (!sha?.trim()) {
      throw new GitError('Commit not specified');
    }
    const head = await this.getHeadSha();
    if (!head.startsWith(sha.trim()) && !sha.trim().startsWith(head)) {
      throw new GitError(
        `Refusing to ${action}: ${sha.trim().substring(0, 7)} is not the latest commit`,
        undefined,
        '',
        '',
        `Only the latest commit can be ${action === 'amend' ? 'renamed' : 'undone'}. ` +
          `Commit ${sha.trim().substring(0, 7)} is not the latest one on this branch.`
      );
    }
  }

  async renameCommit(sha: string, newMessage: string): Promise<void> {
    if (!newMessage.trim()) {
      throw new GitError('Commit message is empty');
    }
    await this.assertIsHead(sha, 'amend');
    await this.run(['commit', '--amend', '--message', newMessage.trim()]);
  }

  async softUndoCommit(sha: string): Promise<void> {
    await this.assertIsHead(sha, 'undo');
    // Move HEAD back one commit but keep changes staged.
    await this.run(['reset', '--soft', 'HEAD~1']);
  }

  async getCommitParent(sha: string): Promise<string | undefined> {
    const result = await this.run(['rev-parse', `${sha}^`]);
    const parent = result.stdout.trim();
    return parent || undefined;
  }

  async isRootCommit(sha: string): Promise<boolean> {
    try {
      await this.run(['rev-parse', '--verify', '-q', `${sha}^`]);
      return false;
    } catch {
      return true;
    }
  }

  async getRemotes(): Promise<GitRemote[]> {
    const result = await this.run(['remote', '-v']).catch(() => ({ stdout: '' }));
    return parseRemotes(result.stdout);
  }

  async getStashes(): Promise<GitStash[]> {
    const result = await this.run(['stash', 'list']).catch(() => ({ stdout: '' }));
    return parseStash(result.stdout);
  }

  async createStash(message?: string, includeUntracked = false): Promise<void> {
    const args = ['stash', 'push'];
    if (message?.trim()) {
      args.push('-m', message.trim());
    }
    if (includeUntracked) {
      args.push('-u');
    }
    await this.run(args);
  }

  async applyStash(index: number): Promise<void> {
    await this.run(['stash', 'apply', `stash@{${index}}`]);
  }

  async popStash(index: number): Promise<void> {
    await this.run(['stash', 'pop', `stash@{${index}}`]);
  }

  async deleteStash(index: number): Promise<void> {
    await this.run(['stash', 'drop', `stash@{${index}}`]);
  }

  async getDiffForFile(filePath: string, staged = false): Promise<string> {
    const args = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
    const result = await this.run(args);
    return result.stdout;
  }

  async showFileAtRef(filePath: string, ref: string): Promise<string> {
    try {
      const result = await this.run(['show', `${ref}:${filePath}`]);
      return result.stdout;
    } catch {
      return '';
    }
  }

  async stageFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.run(['add', '--', ...paths]);
  }

  async unstageFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.run(['restore', '--staged', '--', ...paths]);
  }

  async getAbsolutePath(relativePath: string): Promise<string> {
    if (!this.repositoryRoot) {
      throw new GitError('Repository root not found');
    }
    const resolved = path.resolve(this.repositoryRoot, relativePath);
    const relative = path.relative(this.repositoryRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new GitError(`Invalid path: ${relativePath}`);
    }
    return resolved;
  }
}
