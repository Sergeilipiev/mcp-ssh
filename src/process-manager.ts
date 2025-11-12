import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './utils/logger.js';

// Lock file path configuration
const LOCK_FILE = path.join(process.cwd(), '.mcp-ssh.lock');

export class ProcessManager {
  private instanceId: string;

  constructor() {
    // 生成唯一实例ID
    this.instanceId = Date.now().toString();
    
    // 注册进程退出处理
    this.registerCleanup();
  }

  private registerCleanup(): void {
    // 注册多个信号以确保清理
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());
  }

  private cleanup(): void {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        // 只清理自己的锁文件
        if (lockData.instanceId === this.instanceId) {
          fs.unlinkSync(LOCK_FILE);
        }
      }
    } catch (error) {
      console.error('Error cleaning up lock file:', error);
    }
  }

  private async waitForProcessExit(pid: number, maxWaitTime: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      try {
        process.kill(pid, 0);
        // 如果进程还在运行，等待100ms后再次检查
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        // 进程已经退出
        return true;
      }
    }
    return false;
  }

  public async checkAndCreateLock(): Promise<boolean> {
    try {
      // 检查锁文件是否存在
      if (fs.existsSync(LOCK_FILE)) {
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        
        try {
          // Check if process is still running
          process.kill(lockData.pid, 0);
          Logger.info('Found existing MCP-SSH instance, terminating old process...');

          // Send termination signal to old process
          process.kill(lockData.pid, 'SIGTERM');
          
          // 等待旧进程退出
          const exited = await this.waitForProcessExit(lockData.pid);
          if (!exited) {
            console.error('等待旧进程退出超时');
            return false;
          }
          
          // 删除旧的锁文件
          fs.unlinkSync(LOCK_FILE);
        } catch (e) {
          // Process doesn't exist, delete old lock file
          Logger.info('Found stale lock file, cleaning up...');
          fs.unlinkSync(LOCK_FILE);
        }
      }

      // Create new lock file
      fs.writeFileSync(LOCK_FILE, JSON.stringify({
        pid: process.pid,
        instanceId: this.instanceId,
        timestamp: Date.now()
      }));

      Logger.success('Process lock created successfully');
      return true;
    } catch (error) {
      console.error('处理锁文件时出错:', error);
      return false;
    }
  }
} 