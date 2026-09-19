import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../git/GitService';
import { GitError } from '../utils/errors';

async function setupRepo(name: string): Promise<{ repo: GitService; root: string }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  const service = new GitService({ workspaceRoot: root });
  await service.initializeRepository();
  // A fresh machine or CI runner has no global git identity, and every commit
  // below would fail with "Author identity unknown".
  execFileSync('git', ['config', 'user.email', 'tests@celes.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Celes Tests'], { cwd: root });
  // init.defaultBranch differs per machine and git version, so pin the branch
  // instead of asserting against whatever `git init` happened to pick.
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: root });
  return { repo: service, root };
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

async function commitFile(service: GitService, root: string, filename: string, content: string, message: string): Promise<void> {
  const filePath = path.join(root, filename);
  fs.writeFileSync(filePath, content);
  await service.stageFile(filename);
  await service.commit(message);
}

describe('GitService integration', () => {
  let root: string | undefined;
  let service: GitService | undefined;

  afterEach(() => {
    if (root) {
      cleanup(root);
      root = undefined;
      service = undefined;
    }
  });

  it('should initialize a repository', async () => {
    const { repo, root: r } = await setupRepo('celes-init-');
    root = r;
    service = repo;

    const detected = await service.detectRepository();
    assert.strictEqual(detected, true);
  });

  it('should stage, commit and show history', async () => {
    const { repo, root: r } = await setupRepo('celes-commit-');
    root = r;
    service = repo;

    await commitFile(service, root, 'hello.txt', 'hello world', 'initial commit');

    const history = await service.getHistory(10);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].message, 'initial commit');

    const status = await service.getRepositoryStatus();
    assert.strictEqual(status.isGitRepository, true);
    assert.strictEqual(status.currentBranch, 'main');
  });

  it('should create and switch branches', async () => {
    const { repo, root: r } = await setupRepo('celes-branch-');
    root = r;
    service = repo;

    await commitFile(service, root, 'base.txt', 'base', 'base commit');
    await service.createBranch('feature');
    await service.checkoutBranch('feature');

    const status = await service.getRepositoryStatus();
    assert.strictEqual(status.currentBranch, 'feature');

    const branches = await service.getBranches();
    const feature = branches.find((b) => b.name === 'feature' && !b.isRemote);
    assert.ok(feature, 'feature branch should exist');
  });

  it('should rename and delete branches safely', async () => {
    const { repo, root: r } = await setupRepo('celes-rename-');
    root = r;
    service = repo;

    await commitFile(service, root, 'a.txt', 'a', 'commit a');
    await service.createBranch('old-name');
    await service.renameBranch('old-name', 'new-name');

    const branches = await service.getBranches();
    assert.ok(branches.some((b) => b.name === 'new-name'));
    assert.ok(!branches.some((b) => b.name === 'old-name'));

    await service.deleteBranch('new-name');
    const afterDelete = await service.getBranches();
    assert.ok(!afterDelete.some((b) => b.name === 'new-name'));
  });

  it('should create, apply and pop stash', async () => {
    const { repo, root: r } = await setupRepo('celes-stash-');
    root = r;
    service = repo;

    await commitFile(service, root, 'stash-base.txt', 'base', 'stash base');
    fs.writeFileSync(path.join(root, 'new-file.txt'), 'work in progress');
    await service.stageFile('new-file.txt');
    await service.createStash('my stash', false);

    let stashes = await service.getStashes();
    assert.strictEqual(stashes.length, 1);
    assert.strictEqual(stashes[0].message, 'my stash');

    await service.applyStash(0);
    stashes = await service.getStashes();
    assert.strictEqual(stashes.length, 1);

    // Pop after applying a new file should succeed because the file was restored and is still staged.
    await service.discardFile('new-file.txt');
    await service.popStash(0);
    stashes = await service.getStashes();
    assert.strictEqual(stashes.length, 0);
  });

  it('should refuse to commit without staged changes', async () => {
    const { repo, root: r } = await setupRepo('celes-empty-commit-');
    root = r;
    service = repo;

    await commitFile(service, root, 'x.txt', 'x', 'base');
    try {
      await service.commit('empty');
      assert.fail('expected commit to fail');
    } catch (err) {
      assert.ok(err instanceof GitError, 'expected GitError');
    }
  });

  it('should detect uncommitted changes', async () => {
    const { repo, root: r } = await setupRepo('celes-changes-');
    root = r;
    service = repo;

    await commitFile(service, root, 'clean.txt', 'clean', 'clean');
    fs.writeFileSync(path.join(root, 'dirty.txt'), 'dirty');

    const changes = await service.getChanges();
    assert.strictEqual(changes.untracked.length, 1);
    assert.strictEqual(changes.untracked[0].path, 'dirty.txt');
  });

  it('should scope changes and history to the opened workspace folder', async () => {
    const { repo, root: r } = await setupRepo('celes-scope-');
    root = r;
    service = repo;

    fs.mkdirSync(path.join(root, 'pkg-a'), { recursive: true });
    fs.mkdirSync(path.join(root, 'pkg-b'), { recursive: true });
    await commitFile(service, root, 'pkg-a/inside.txt', 'a', 'pkg-a only');
    await commitFile(service, root, 'pkg-b/outside.txt', 'b', 'pkg-b only');

    // Opening the pkg-a subfolder should limit Celes to that folder.
    const scoped = new GitService({ workspaceRoot: path.join(root, 'pkg-a'), scope: 'workspace' });
    assert.strictEqual(await scoped.detectRepository(), true);
    assert.strictEqual(scoped.getScopePath(), 'pkg-a');

    const scopedHistory = await scoped.getHistory(10);
    assert.strictEqual(scopedHistory.length, 1);
    assert.strictEqual(scopedHistory[0].message, 'pkg-a only');

    const scopedFiles = await scoped.getCommitFiles(scopedHistory[0].sha);
    assert.deepStrictEqual(
      scopedFiles.map((f) => f.path),
      ['pkg-a/inside.txt']
    );

    fs.writeFileSync(path.join(root, 'pkg-a', 'new.txt'), 'new');
    fs.writeFileSync(path.join(root, 'pkg-b', 'other.txt'), 'other');

    const scopedChanges = await scoped.getChanges();
    assert.deepStrictEqual(
      scopedChanges.untracked.map((c) => c.path),
      ['pkg-a/new.txt']
    );

    // Switching back to repository scope restores the whole repo.
    scoped.setScopeMode('repository');
    assert.strictEqual(scoped.getScopePath(), undefined);
    assert.strictEqual((await scoped.getHistory(10)).length, 2);
    assert.deepStrictEqual(
      (await scoped.getChanges()).untracked.map((c) => c.path).sort(),
      ['pkg-a/new.txt', 'pkg-b/other.txt']
    );
  });

  it('should keep the whole repository in scope when the workspace is the repo root', async () => {
    const { repo, root: r } = await setupRepo('celes-scope-root-');
    root = r;
    service = repo;

    await commitFile(service, root, 'root.txt', 'root', 'root commit');
    assert.strictEqual(service.getScopePath(), undefined);
    assert.strictEqual((await service.getHistory(10)).length, 1);
  });
});
