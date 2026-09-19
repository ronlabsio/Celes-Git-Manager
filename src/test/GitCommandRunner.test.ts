import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitCommandRunner } from '../git/GitCommandRunner';
import { GitError } from '../utils/errors';

describe('GitCommandRunner', () => {
  let runner: GitCommandRunner;

  beforeEach(() => {
    runner = new GitCommandRunner();
  });

  it('should resolve git path', async () => {
    const gitPath = await runner.resolveGitPath();
    assert.ok(gitPath.length > 0, 'git path should not be empty');
  });

  it('should run git --version successfully', async () => {
    const result = await runner.version();
    assert.ok(result.startsWith('git version'), `unexpected version output: ${result}`);
  });

  it('should return success for git version in repo root', async () => {
    const result = await runner.run(['--version'], { cwd: path.resolve(__dirname, '../../') });
    assert.strictEqual(result.success, true);
    assert.ok(result.stdout.length >= 0);
  });

  it('should throw GitError on invalid repository', async () => {
    // A temp dir, not src/: src/ lives inside this repository, so git reported
    // success there and the assertion failure was caught as the "error".
    const invalidCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'celes-not-a-repo-'));
    let caught: unknown;
    try {
      await runner.run(['rev-parse', '--is-inside-work-tree'], { cwd: invalidCwd });
    } catch (err) {
      caught = err;
    } finally {
      fs.rmSync(invalidCwd, { recursive: true, force: true });
    }
    assert.ok(caught instanceof GitError, `expected GitError but got ${caught}`);
  });

  it('should throw GitError when git executable is not found', async () => {
    const badRunner = new GitCommandRunner('/nonexistent/path/to/git');
    try {
      await badRunner.version();
      assert.fail('expected error');
    } catch (err) {
      assert.ok(err instanceof GitError);
    }
  });
});
