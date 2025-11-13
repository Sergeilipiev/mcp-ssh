import { SSHConnection, ConnectionStatus, FileTransferInfo, TerminalSession, TunnelConfig } from '../tools/ssh-service.js';

/**
 * Response formatting utilities for MCP tools
 * Provides both Markdown and JSON output formats
 */
export class ResponseFormatter {
  /**
   * Format connection info as JSON
   */
  static connectionToJSON(connection: SSHConnection): any {
    return {
      id: connection.id,
      name: connection.name || null,
      host: connection.config.host,
      port: connection.config.port || 22,
      username: connection.config.username,
      status: connection.status,
      auth_method: connection.config.privateKey ? 'key' : 'password',
      has_private_key: !!connection.config.privateKey,
      last_used: connection.lastUsed?.toISOString() || null,
      last_error: connection.lastError || null,
      current_directory: connection.currentDirectory || null,
      tags: connection.tags || []
    };
  }

  /**
   * Format multiple connections as JSON
   */
  static connectionsToJSON(connections: SSHConnection[]): any {
    return {
      total: connections.length,
      connections: connections.map(conn => this.connectionToJSON(conn))
    };
  }

  /**
   * Format command result as JSON
   */
  static commandResultToJSON(result: any, command: string, executionTime?: number): any {
    return {
      command,
      exit_code: result.code || result.exit_code || 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      execution_time_ms: executionTime || result.execution_time_ms || 0,
      current_directory: result.currentDirectory || result.current_directory || null,
      success: (result.code || result.exit_code || 0) === 0,
      truncated: result.truncated || false
    };
  }

  /**
   * Format file transfer info as JSON
   */
  static fileTransferToJSON(transfer: FileTransferInfo): any {
    return {
      id: transfer.id,
      connection_id: transfer.connectionId,
      local_path: transfer.localPath,
      remote_path: transfer.remotePath,
      direction: transfer.direction,
      status: transfer.status,
      progress: transfer.progress || 0,
      bytes_transferred: transfer.bytesTransferred || 0,
      total_bytes: transfer.totalBytes || 0,
      speed_bps: transfer.speed || 0,
      start_time: transfer.startTime?.toISOString() || null,
      end_time: transfer.endTime?.toISOString() || null,
      error: transfer.error || null
    };
  }

  /**
   * Format multiple file transfers as JSON
   */
  static fileTransfersToJSON(transfers: FileTransferInfo[]): any {
    return {
      total: transfers.length,
      transfers: transfers.map(t => this.fileTransferToJSON(t))
    };
  }

  /**
   * Format terminal session as JSON
   */
  static terminalSessionToJSON(session: TerminalSession): any {
    return {
      id: session.id,
      connection_id: session.connectionId,
      rows: session.rows,
      cols: session.cols,
      created_at: session.createdAt?.toISOString() || null,
      last_activity: session.lastActivity?.toISOString() || null
    };
  }

  /**
   * Format tunnel config as JSON
   */
  static tunnelToJSON(tunnel: any): any {
    return {
      id: tunnel.id,
      connection_id: tunnel.connectionId,
      local_port: tunnel.localPort,
      remote_host: tunnel.remoteHost,
      remote_port: tunnel.remotePort,
      description: tunnel.description || null,
      created_at: tunnel.createdAt?.toISOString() || null
    };
  }

  /**
   * Format error as JSON
   */
  static errorToJSON(error: Error | string, context?: any): any {
    return {
      error: true,
      message: error instanceof Error ? error.message : String(error),
      context: context || null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format success message as JSON
   */
  static successToJSON(message: string, data?: any): any {
    return {
      success: true,
      message,
      data: data || null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format generic response based on format parameter
   */
  static formatResponse(data: any, format: string = 'markdown', markdownFormatter?: () => string): any {
    if (format === 'json') {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(data, null, 2)
        }]
      };
    } else {
      // Markdown format
      const text = markdownFormatter ? markdownFormatter() : String(data);
      return {
        content: [{
          type: "text",
          text
        }]
      };
    }
  }
}
