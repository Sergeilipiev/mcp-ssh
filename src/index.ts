#!/usr/bin/env node

import { SshMCP } from './tools/ssh.js';
import { config } from 'dotenv';
import { ProcessManager } from './process-manager.js';
import { Logger } from './utils/logger.js';

// Load environment variables
config();

// Main function
async function main() {
  // Initialize process manager
  const processManager = new ProcessManager();
  if (!await processManager.checkAndCreateLock()) {
    Logger.error('Failed to create process lock, exiting');
    process.exit(1);
  }

  // Initialize SSH MCP
  const sshMCP = new SshMCP();

  // Handle process exit
  process.on('SIGINT', async () => {
    Logger.info('Shutting down SSH MCP service...');
    await sshMCP.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    Logger.info('Shutting down SSH MCP service...');
    await sshMCP.close();
    process.exit(0);
  });

  // Handle uncaught exceptions to avoid crashes
  process.on('uncaughtException', (err) => {
    Logger.error('Uncaught exception:', err);
    // Don't exit, keep SSH service running
  });

  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled promise rejection:', reason);
    // Don't exit, keep SSH service running
  });

  Logger.success('SSH MCP service started');
}

// Start application
main().catch(error => {
  Logger.error('Startup failed:', error);
  process.exit(1);
}); 