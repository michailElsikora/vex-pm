/**
 * Progress tracking utilities
 */

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
      process.stdout.write(`\r${frame} ${this.message}`);
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
    this.stop(`✓ ${message}`);
  }

  fail(message: string): void {
    this.stop(`✗ ${message}`);
  }
}

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  error?: string;
}

export class ProgressTracker {
  private tasks: Map<string, Task> = new Map();
  private silent: boolean;
  private spinner: Spinner | null = null;

  constructor(silent = false) {
    this.silent = silent;
  }

  addTask(id: string, name: string): void {
    this.tasks.set(id, { id, name, status: 'pending' });
  }

  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'running';
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

  private updateDisplay(): void {
    if (this.silent) return;

    const total = this.tasks.size;
    const complete = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'complete' || t.status === 'failed'
    ).length;

    const running = Array.from(this.tasks.values())
      .filter((t) => t.status === 'running')
      .map((t) => t.name);

    const message = running.length > 0
      ? `[${complete}/${total}] ${running.slice(0, 3).join(', ')}${running.length > 3 ? '...' : ''}`
      : `[${complete}/${total}]`;

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

