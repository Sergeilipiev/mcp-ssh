/**
 * Logger utility for MCP-SSH server
 *
 * IMPORTANT: MCP protocol requires that stdout is ONLY used for JSON-RPC messages.
 * All logging MUST go to stderr to avoid corrupting the protocol stream.
 *
 * This logger ensures all output goes to stderr (console.error) with consistent formatting.
 */

export enum LogLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

export class Logger {
  private static prefix = '[SSH-MCP]';
  private static enabled = true;

  /**
   * Enable or disable logging
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Log informational message
   */
  static info(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.error(`${this.prefix} ℹ️  ${message}`, ...args);
  }

  /**
   * Log success message
   */
  static success(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.error(`${this.prefix} ✅ ${message}`, ...args);
  }

  /**
   * Log warning message
   */
  static warn(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.error(`${this.prefix} ⚠️  ${message}`, ...args);
  }

  /**
   * Log error message
   */
  static error(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    console.error(`${this.prefix} ❌ ${message}`, ...args);
  }

  /**
   * Log debug message (only in development)
   */
  static debug(message: string, ...args: any[]): void {
    if (!this.enabled || process.env.NODE_ENV === 'production') return;
    console.error(`${this.prefix} 🐛 ${message}`, ...args);
  }

  /**
   * Log with custom level
   */
  static log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.enabled) return;

    const emoji = {
      [LogLevel.INFO]: 'ℹ️ ',
      [LogLevel.SUCCESS]: '✅',
      [LogLevel.WARN]: '⚠️ ',
      [LogLevel.ERROR]: '❌',
      [LogLevel.DEBUG]: '🐛'
    };

    console.error(`${this.prefix} ${emoji[level]} ${message}`, ...args);
  }

  /**
   * Log connection event
   */
  static connection(action: string, host: string, username: string): void {
    if (!this.enabled) return;
    console.error(`${this.prefix} 🔗 ${action}: ${username}@${host}`);
  }

  /**
   * Log command execution
   */
  static command(connectionId: string, command: string): void {
    if (!this.enabled) return;
    const truncated = command.length > 50 ? command.substring(0, 50) + '...' : command;
    console.error(`${this.prefix} ⚡ [${connectionId.substring(0, 8)}] ${truncated}`);
  }

  /**
   * Log file transfer
   */
  static transfer(direction: 'upload' | 'download', localPath: string, remotePath: string): void {
    if (!this.enabled) return;
    const arrow = direction === 'upload' ? '⬆️ ' : '⬇️ ';
    console.error(`${this.prefix} ${arrow} ${localPath} → ${remotePath}`);
  }
}
