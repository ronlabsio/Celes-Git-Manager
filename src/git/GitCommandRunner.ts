import { execFile } from 'child_process';
import { promisify } from 'util';
import * as process from 'process';
import { GitError, normalizeGitError } from '../utils/errors';

const execFileAsync = promisify(execFile);

export interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
  abortSignal?: AbortSignal;
}

export class GitCommandRunner {
  private cachedPath: string | undefined;

  constructor(private readonly configGitPath?: string) {}

  private useConfigPath(): string | undefined {
    return this.configGitPath;
  }

  async resolveGitPath(): Promise<string> {
    const configPath = this.useConfigPath();
    if (configPath) {
      return configPath;
    }
    if (this.cachedPath) {
      return this.cachedPath;
    }

    const command = process.platform === 'win32' ? 'where' : 'which';
    try {
      const { stdout } = await execFileAsync(command, ['git']);
      const found = stdout.trim().split(/\r?\n/)[0];
      if (!found) {
        throw new GitError('Git executable not found');
      }
      this.cachedPath = found;
      return found;
    } catch (err) {
      throw new GitError(`Git executable not found: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async run(args: string[], options: RunOptions = {}): Promise<GitResult> {
    const git = await this.resolveGitPath();
    const cwd = options.cwd ?? process.cwd();

    return new Promise((resolve, reject) => {
      const child = execFile(git, args, {
        cwd,
        timeout: options.timeoutMs ?? 60000,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      if (options.stdin !== undefined && child.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      options.abortSignal?.addEventListener('abort', () => {
        child.kill();
      });

      child.on('error', (err) => {
        reject(new GitError(`Failed to run git: ${err.message}`));
      });

      child.on('close', (exitCode) => {
        const code = exitCode ?? 0;
        const success = code === 0;

        if (!success) {
          const normalized = normalizeGitError(stderr, `git ${args.join(' ')}`);
          reject(
            new GitError(
              normalized.message,
              code,
              stderr,
              `git ${args.join(' ')}`,
              normalized.userMessage
            )
          );
        } else {
          resolve({ success, stdout, stderr, exitCode: code });
        }
      });
    });
  }

  async version(cwd?: string): Promise<string> {
    const result = await this.run(['--version'], { cwd });
    return result.stdout.trim();
  }
}
