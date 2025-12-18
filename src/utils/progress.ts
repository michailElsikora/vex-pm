/**
 * Progress tracking for parallel operations
 */

import { COLORS } from './logger';

export interface ProgressTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message?: string;
}

export class ProgressTracker {
  private tasks: Map<string, ProgressTask> = new Map();
  private totalBytes = 0;
  private downloadedBytes = 0;
  private startTime = Date.now();
  private silent = false;
  private lastRender = 0;
  private renderThrottle = 100; // ms

  constructor(silent = false) {
    this.silent = silent;
  }

  addTask(id: string, name: string): void {
    this.tasks.set(id, { id, name, status: 'pending' });
    this.render();
  }

  startTask(id: string, message?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'running';
      task.message = message;
      this.render();
    }
  }

  completeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'done';
      this.render();
    }
  }

  failTask(id: string, message?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'error';
      task.message = message;
      this.render();
    }
  }

  setTotalBytes(bytes: number): void {
    this.totalBytes = bytes;
  }

  addDownloadedBytes(bytes: number): void {
    this.downloadedBytes += bytes;
    this.render();
  }

  private render(): void {
    if (this.silent) return;
    
    const now = Date.now();
    if (now - this.lastRender < this.renderThrottle) return;
    this.lastRender = now;

    const completed = Array.from(this.tasks.values()).filter(t => t.status === 'done').length;
    const total = this.tasks.size;
    const running = Array.from(this.tasks.values()).filter(t => t.status === 'running');
    const errors = Array.from(this.tasks.values()).filter(t => t.status === 'error').length;

    // Clear previous lines
    process.stdout.write('\x1b[K');

    // Progress bar
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const barWidth = 25;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = `${COLORS.green}${'█'.repeat(filled)}${COLORS.gray}${'░'.repeat(barWidth - filled)}${COLORS.reset}`;

    // Stats
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    let status = `${bar} ${completed}/${total}`;
    
    if (this.totalBytes > 0) {
      const downloadedMB = (this.downloadedBytes / 1024 / 1024).toFixed(1);
      const totalMB = (this.totalBytes / 1024 / 1024).toFixed(1);
      status += ` | ${downloadedMB}/${totalMB} MB`;
    }

    status += ` | ${elapsed}s`;

    if (errors > 0) {
      status += ` | ${COLORS.red}${errors} errors${COLORS.reset}`;
    }

    // Current tasks
    const currentTasks = running.slice(0, 3).map(t => t.name).join(', ');
    if (currentTasks) {
      status += ` | ${COLORS.cyan}${currentTasks}${COLORS.reset}`;
    }

    process.stdout.write(`\r${status}`);
  }

  finish(): void {
    if (this.silent) return;
    
    const completed = Array.from(this.tasks.values()).filter(t => t.status === 'done').length;
    const errors = Array.from(this.tasks.values()).filter(t => t.status === 'error').length;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);

    process.stdout.write('\n');
    
    if (errors === 0) {
      console.log(`${COLORS.green}✓${COLORS.reset} Completed ${completed} tasks in ${elapsed}s`);
    } else {
      console.log(`${COLORS.yellow}⚠${COLORS.reset} Completed ${completed} tasks with ${errors} errors in ${elapsed}s`);
    }
  }

  getErrors(): ProgressTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'error');
  }
}

/**
 * Simple spinner for single operations
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string;
  private silent: boolean;

  constructor(message: string, silent = false) {
    this.message = message;
    this.silent = silent;
  }

  start(): void {
    if (this.silent) return;
    
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      process.stdout.write(`\r${COLORS.cyan}${frame}${COLORS.reset} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  update(message: string): void {
    this.message = message;
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    if (!this.silent) {
      process.stdout.write('\r\x1b[K');
      if (finalMessage) {
        console.log(finalMessage);
      }
    }
  }

  success(message?: string): void {
    this.stop(`${COLORS.green}✓${COLORS.reset} ${message || this.message}`);
  }

  fail(message?: string): void {
    this.stop(`${COLORS.red}✗${COLORS.reset} ${message || this.message}`);
  }
}

