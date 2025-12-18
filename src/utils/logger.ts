/**
 * Logger utility for console output with colors and formatting
 */

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
} as const;

const ICONS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  arrow: '→',
  package: '📦',
  download: '↓',
  link: '🔗',
} as const;

class Logger {
  private verbose = false;
  private silent = false;

  setVerbose(value: boolean): void {
    this.verbose = value;
  }

  setSilent(value: boolean): void {
    this.silent = value;
  }

  private format(color: string, ...args: unknown[]): string {
    return `${color}${args.join(' ')}${COLORS.reset}`;
  }

  info(...args: unknown[]): void {
    if (this.silent) return;
    console.log(this.format(COLORS.cyan, ICONS.info, ...args));
  }

  success(...args: unknown[]): void {
    if (this.silent) return;
    console.log(this.format(COLORS.green, ICONS.success, ...args));
  }

  warn(...args: unknown[]): void {
    if (this.silent) return;
    console.log(this.format(COLORS.yellow, ICONS.warning, ...args));
  }

  error(...args: unknown[]): void {
    console.error(this.format(COLORS.red, ICONS.error, ...args));
  }

  debug(...args: unknown[]): void {
    if (!this.verbose || this.silent) return;
    console.log(this.format(COLORS.gray, '[debug]', ...args));
  }

  log(...args: unknown[]): void {
    if (this.silent) return;
    console.log(...args);
  }

  newline(): void {
    if (this.silent) return;
    console.log();
  }

  // Styled outputs
  packageName(name: string): string {
    return `${COLORS.bold}${COLORS.cyan}${name}${COLORS.reset}`;
  }

  version(ver: string): string {
    return `${COLORS.green}${ver}${COLORS.reset}`;
  }

  path(p: string): string {
    return `${COLORS.dim}${p}${COLORS.reset}`;
  }

  command(cmd: string): string {
    return `${COLORS.yellow}${cmd}${COLORS.reset}`;
  }

  // Progress output
  progress(current: number, total: number, message: string): void {
    if (this.silent) return;
    const percent = Math.round((current / total) * 100);
    const bar = this.createProgressBar(percent);
    process.stdout.write(`\r${bar} ${percent}% ${message}`);
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  private createProgressBar(percent: number): string {
    const width = 20;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return `${COLORS.green}${'█'.repeat(filled)}${COLORS.gray}${'░'.repeat(empty)}${COLORS.reset}`;
  }

  // Table output
  table(headers: string[], rows: string[][]): void {
    if (this.silent) return;
    
    const colWidths = headers.map((h, i) => {
      const maxRow = Math.max(...rows.map(r => (r[i] || '').length));
      return Math.max(h.length, maxRow);
    });

    const formatRow = (cells: string[]): string => {
      return cells.map((c, i) => c.padEnd(colWidths[i])).join('  ');
    };

    console.log(this.format(COLORS.bold, formatRow(headers)));
    console.log(COLORS.dim + '─'.repeat(colWidths.reduce((a, b) => a + b + 2, 0)) + COLORS.reset);
    rows.forEach(row => console.log(formatRow(row)));
  }

  // Timer for operations
  timer(): () => string {
    const start = Date.now();
    return () => {
      const ms = Date.now() - start;
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };
  }

  // Clear line for progress updates
  clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }
}

export const logger = new Logger();
export { COLORS, ICONS };

