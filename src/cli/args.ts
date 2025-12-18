/**
 * Zero-dependency argument parser
 */

export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, boolean>;
  options: Record<string, string>;
}

export interface ArgDefinition {
  name: string;
  alias?: string;
  type: 'boolean' | 'string';
  default?: boolean | string;
  description?: string;
}

const GLOBAL_FLAGS: ArgDefinition[] = [
  { name: 'help', alias: 'h', type: 'boolean', description: 'Show help' },
  { name: 'version', alias: 'v', type: 'boolean', description: 'Show version' },
  { name: 'verbose', type: 'boolean', description: 'Verbose output' },
  { name: 'silent', alias: 's', type: 'boolean', description: 'Silent mode' },
  { name: 'color', type: 'boolean', default: true, description: 'Use colors' },
  { name: 'no-color', type: 'boolean', description: 'Disable colors' },
  { name: 'cwd', alias: 'C', type: 'string', description: 'Working directory' },
  { name: 'config', alias: 'c', type: 'string', description: 'Config file path' },
];

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // Remove node and script path
  
  const result: ParsedArgs = {
    command: '',
    positionals: [],
    flags: {},
    options: {},
  };

  // Apply defaults
  for (const def of GLOBAL_FLAGS) {
    if (def.type === 'boolean' && def.default !== undefined) {
      result.flags[def.name] = def.default as boolean;
    } else if (def.type === 'string' && def.default !== undefined) {
      result.options[def.name] = def.default as string;
    }
  }

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--') {
      // Everything after -- is positional
      result.positionals.push(...args.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      // Long option
      const [key, value] = arg.slice(2).split('=');
      const def = findDefinition(key, GLOBAL_FLAGS);
      
      if (key.startsWith('no-')) {
        // Handle --no-* flags
        const actualKey = key.slice(3);
        result.flags[actualKey] = false;
      } else if (value !== undefined) {
        // --key=value
        result.options[key] = value;
      } else if (def?.type === 'boolean') {
        result.flags[key] = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        // --key value
        result.options[key] = args[++i];
      } else {
        result.flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short option(s)
      const chars = arg.slice(1);
      
      for (let j = 0; j < chars.length; j++) {
        const char = chars[j];
        const def = findDefinitionByAlias(char, GLOBAL_FLAGS);
        const name = def?.name || char;

        if (def?.type === 'string') {
          // String option takes rest of chars or next arg
          if (j + 1 < chars.length) {
            result.options[name] = chars.slice(j + 1);
          } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            result.options[name] = args[++i];
          }
          break;
        } else {
          result.flags[name] = true;
        }
      }
    } else {
      // Positional argument
      if (!result.command) {
        result.command = arg;
      } else {
        result.positionals.push(arg);
      }
    }

    i++;
  }

  // Handle --no-color
  if (result.flags['no-color']) {
    result.flags['color'] = false;
  }

  return result;
}

function findDefinition(name: string, defs: ArgDefinition[]): ArgDefinition | undefined {
  return defs.find(d => d.name === name);
}

function findDefinitionByAlias(alias: string, defs: ArgDefinition[]): ArgDefinition | undefined {
  return defs.find(d => d.alias === alias);
}

/**
 * Check if help was requested
 */
export function isHelpRequested(args: ParsedArgs): boolean {
  return args.flags.help || args.command === 'help';
}

/**
 * Check if version was requested
 */
export function isVersionRequested(args: ParsedArgs): boolean {
  return args.flags.version && !args.command;
}

/**
 * Get flag value
 */
export function getFlag(args: ParsedArgs, name: string, defaultValue = false): boolean {
  return args.flags[name] ?? defaultValue;
}

/**
 * Get option value
 */
export function getOption(args: ParsedArgs, name: string, defaultValue?: string): string | undefined {
  return args.options[name] ?? defaultValue;
}

