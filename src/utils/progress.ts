/**
 * Progress tracking utilities
 */

// ANSI color codes
const colors = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
};

export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private current = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;
  private silent: boolean;

  constructor(message: string, silent = false) {
    this.message = message;
    this.silent = silent;
  }

  start(): void {
    if (this.silent) return;
    
    process.stdout.write('\x1B[?25l'); // Hide cursor
    this.interval = setInterval(() => {
      const frame = this.frames[this.current];
      process.stdout.write(`\r\x1B[K${colors.cyan}${frame}${colors.reset} ${this.message}`);
      this.current = (this.current + 1) % this.frames.length;
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
      process.stdout.write('\r\x1B[K'); // Clear line
      if (finalMessage) {
        console.log(finalMessage);
      }
      process.stdout.write('\x1B[?25h'); // Show cursor
    }
  }

  success(message: string): void {
    this.stop(`${colors.green}✓${colors.reset} ${message}`);
  }

  fail(message: string): void {
    this.stop(`${colors.yellow}✗${colors.reset} ${message}`);
  }
}

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  error?: string;
  startTime?: number;
}

export class ProgressTracker {
  private tasks: Map<string, Task> = new Map();
  private silent: boolean;
  private spinner: Spinner | null = null;
  private startTime: number = Date.now();
  private lastPkg: string = '';

  constructor(silent = false) {
    this.silent = silent;
    this.startTime = Date.now();
  }

  addTask(id: string, name: string): void {
    this.tasks.set(id, { id, name, status: 'pending' });
  }

  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'running';
      task.startTime = Date.now();
      this.updateDisplay();
    }
  }

  completeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'complete';
      this.updateDisplay();
    }
  }

  failTask(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'failed';
      task.error = error;
      this.updateDisplay();
    }
  }

  private createProgressBar(complete: number, total: number, width: number = 20): string {
    const percent = total > 0 ? complete / total : 0;
    const filled = Math.round(width * percent);
    const empty = width - filled;
    
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    
    return `${colors.green}${filledBar}${colors.dim}${emptyBar}${colors.reset}`;
  }

  private truncateName(name: string, maxLen: number = 35): string {
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 3) + '...';
  }

  private updateDisplay(): void {
    if (this.silent) return;

    const total = this.tasks.size;
    const complete = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'complete' || t.status === 'failed'
    ).length;

    const running = Array.from(this.tasks.values())
      .filter((t) => t.status === 'running')
      .map((t) => t.name);

    // Get the most recent running package
    const currentPkg = running.length > 0 ? running[running.length - 1] : this.lastPkg;
    if (running.length > 0) {
      this.lastPkg = currentPkg;
    }

    // Build progress display
    const progressBar = this.createProgressBar(complete, total);
    const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
    const stats = `${colors.cyan}${complete}${colors.reset}/${colors.dim}${total}${colors.reset}`;
    
    let message: string;
    if (running.length > 0) {
      const pkgDisplay = this.truncateName(currentPkg);
      const parallelInfo = running.length > 1 ? ` ${colors.dim}(+${running.length - 1})${colors.reset}` : '';
      message = `${progressBar} ${stats} ${colors.dim}${percent}%${colors.reset} ${colors.magenta}${pkgDisplay}${colors.reset}${parallelInfo}`;
    } else {
      message = `${progressBar} ${stats} ${colors.dim}${percent}%${colors.reset}`;
    }

    if (!this.spinner) {
      this.spinner = new Spinner(message, this.silent);
      this.spinner.start();
    } else {
      this.spinner.update(message);
    }

    if (complete === total && this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  finish(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  getErrors(): Array<{ id: string; name: string; message: string }> {
    return Array.from(this.tasks.values())
      .filter((t) => t.status === 'failed')
      .map((t) => ({ id: t.id, name: t.name, message: t.error || 'Unknown error' }));
  }
}

