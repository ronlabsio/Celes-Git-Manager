import * as vscode from 'vscode';

export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

const VERBOSITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  info: 2,
  debug: 3
};

function configuredLevel(): LogLevel {
  const level = vscode.workspace.getConfiguration('celes').get<LogLevel>('logLevel');
  return level && level in VERBOSITY ? level : 'info';
}

export function isLogEnabled(level: Exclude<LogLevel, 'silent'>): boolean {
  return VERBOSITY[level] <= VERBOSITY[configuredLevel()];
}

/**
 * Diagnostic logging, filtered by celes.logLevel. Output the user explicitly
 * asked for (Show command, commit details) is written directly instead.
 */
export function log(
  channel: vscode.OutputChannel,
  level: Exclude<LogLevel, 'silent'>,
  message: string
): void {
  if (isLogEnabled(level)) {
    channel.appendLine(message);
  }
}
