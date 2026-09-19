import * as assert from 'assert';
import { parseStatus } from '../git/parsers/parseStatus';
import { parseBranches, parseRemoteBranches } from '../git/parsers/parseBranches';
import { parseLog, parseCommitNamesStatus } from '../git/parsers/parseLog';
import { parseStash } from '../git/parsers/parseStash';
import { parseRemotes } from '../git/parsers/parseRemote';
import { normalizeGitError } from '../utils/errors';

describe('Parsers', () => {
  describe('parseStatus', () => {
    it('parses staged, unstaged and untracked files', () => {
      const output = [
        'M  README.md',
        ' M src/auth.ts',
        'A  src/config.ts',
        '?? tests/api.test.ts',
        'R  old.txt -> new.txt'
      ].join('\n');

      const status = parseStatus(output, 'main', false);
      assert.strictEqual(status.changes.staged.length, 3);
      assert.ok(status.changes.staged.some((f) => f.path === 'README.md'));
      assert.ok(status.changes.unstaged.some((f) => f.path === 'src/auth.ts'));
      assert.strictEqual(status.changes.untracked.length, 1);
    });
  });

  describe('parseBranches', () => {
    it('parses local branches with current and upstream', () => {
      const output = [
        '* main                a1b2c3d [origin/main: ahead 2, behind 1] latest commit',
        '  feature             e4f5g6h work in progress'
      ].join('\n');

      const branches = parseBranches(output, 'main');
      assert.strictEqual(branches.length, 2);
      const main = branches.find((b) => b.name === 'main');
      assert.ok(main?.isCurrent);
      assert.strictEqual(main?.ahead, 2);
      assert.strictEqual(main?.behind, 1);
      assert.strictEqual(main?.upstream, 'origin/main: ahead 2, behind 1');
    });
  });

  describe('parseRemoteBranches', () => {
    it('parses remote branches', () => {
      const output = [
        '  origin/main',
        '  origin/feature'
      ].join('\n');

      const branches = parseRemoteBranches(output);
      assert.strictEqual(branches.length, 2);
      assert.ok(branches.every((b) => b.isRemote));
    });
  });

  describe('parseLog', () => {
    it('parses commits with delimiter format', () => {
      const sha = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t';
      const output = `${sha}\u0001${sha.substring(0, 7)}\u0001Ronald\u0001ronald@example.com\u00012025-01-01T00:00:00Z\u0001\u0001fix: handle token\u0002`;

      const commits = parseLog(output);
      assert.strictEqual(commits.length, 1);
      assert.strictEqual(commits[0].message, 'fix: handle token');
      assert.strictEqual(commits[0].authorName, 'Ronald');
    });
  });

  describe('parseCommitNamesStatus', () => {
    it('parses added, modified and deleted files', () => {
      const output = ['A\tsrc/new.ts', 'M\tsrc/existing.ts', 'D\tsrc/old.ts'].join('\n');
      const files = parseCommitNamesStatus(output);

      assert.strictEqual(files.length, 3);
      assert.strictEqual(files[0].status, 'added');
      assert.strictEqual(files[1].status, 'modified');
      assert.strictEqual(files[2].status, 'deleted');
    });

    it('parses renamed files with old and new paths', () => {
      const output = 'R100\told-name.ts\tnew-name.ts';
      const files = parseCommitNamesStatus(output);

      assert.strictEqual(files.length, 1);
      assert.strictEqual(files[0].status, 'renamed');
      assert.strictEqual(files[0].path, 'new-name.ts');
      assert.strictEqual(files[0].oldPath, 'old-name.ts');
    });

    it('parses copied files with old and new paths', () => {
      const output = 'C75\tsrc.ts\tsrc-copy.ts';
      const files = parseCommitNamesStatus(output);

      assert.strictEqual(files.length, 1);
      assert.strictEqual(files[0].status, 'copied');
      assert.strictEqual(files[0].path, 'src-copy.ts');
      assert.strictEqual(files[0].oldPath, 'src.ts');
    });

    it('returns empty for empty output (merge commits)', () => {
      const files = parseCommitNamesStatus('');
      assert.strictEqual(files.length, 0);
    });
  });

  describe('parseStash', () => {
    it('parses stash list', () => {
      const output = 'stash@{0}: On main: my stash';
      const stashes = parseStash(output);
      assert.strictEqual(stashes.length, 1);
      assert.strictEqual(stashes[0].index, 0);
      assert.strictEqual(stashes[0].message, 'my stash');
      assert.strictEqual(stashes[0].branch, 'main');
    });
  });

  describe('parseRemotes', () => {
    it('parses remotes', () => {
      const output = 'origin  https://github.com/user/repo.git (fetch)\norigin  https://github.com/user/repo.git (push)';
      const remotes = parseRemotes(output);
      assert.strictEqual(remotes.length, 1);
      assert.strictEqual(remotes[0].name, 'origin');
      assert.strictEqual(remotes[0].url, 'https://github.com/user/repo.git');
      assert.strictEqual(remotes[0].fetch, true);
    });
  });

  describe('normalizeGitError', () => {
    it('normalizes not a git repository', () => {
      const normalized = normalizeGitError('fatal: not a git repository', 'git status');
      assert.strictEqual(normalized.userMessage, 'This workspace is not a Git repository.');
    });

    it('normalizes checkout conflict', () => {
      const normalized = normalizeGitError(
        'Your local changes would be overwritten by checkout',
        'git checkout feature'
      );
      assert.ok(normalized.userMessage.includes('local changes'));
    });
  });
});
