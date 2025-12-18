/**
 * CLI entry point and command router
 */

import { parseArgs, isHelpRequested, isVersionRequested, getFlag, getOption } from './args';
import { showMainHelp, showCommandHelp, showVersion } from './help';
import { logger } from '../utils/logger';

// Command handlers
import { installCommand } from './commands/install';
import { addCommand } from './commands/add';
import { removeCommand } from './commands/remove';
import { runCommand } from './commands/run';
import { initCommand } from './commands/init';
import { whyCommand } from './commands/why';
import { listCommand } from './commands/list';
import { linkCommand, unlinkCommand, linksCommand } from './commands/link';
import { publishCommand } from './commands/publish';
import { loginCommand, logoutCommand, whoamiCommand } from './commands/login';
import { configCommand } from './commands/config';

export interface CommandContext {
  cwd: string;
  verbose: boolean;
  silent: boolean;
  color: boolean;
  configPath?: string;
  positionals: string[];
  flags: Record<string, boolean>;
  options: Record<string, string>;
}

type CommandHandler = (ctx: CommandContext) => Promise<number>;

const COMMANDS: Record<string, CommandHandler> = {
  install: installCommand,
  i: installCommand,
  add: addCommand,
  remove: removeCommand,
  rm: removeCommand,
  uninstall: removeCommand,
  run: runCommand,
  init: initCommand,
  why: whyCommand,
  list: listCommand,
  ls: listCommand,
  link: linkCommand,
  unlink: unlinkCommand,
  links: linksCommand,
  publish: publishCommand,
  login: loginCommand,
  logout: logoutCommand,
  whoami: whoamiCommand,
  config: configCommand,
};

const COMMAND_ALIASES: Record<string, string> = {
  i: 'install',
  rm: 'remove',
  uninstall: 'remove',
  ls: 'list',
};

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  // Handle version
  if (isVersionRequested(args)) {
    showVersion();
    return 0;
  }

  // Handle help
  if (isHelpRequested(args)) {
    if (args.positionals.length > 0) {
      showCommandHelp(args.positionals[0]);
    } else if (args.command && args.command !== 'help') {
      showCommandHelp(args.command);
    } else {
      showMainHelp();
    }
    return 0;
  }

  // No command specified
  if (!args.command) {
    showMainHelp();
    return 0;
  }

  // Configure logger
  const verbose = getFlag(args, 'verbose');
  const silent = getFlag(args, 'silent');
  const color = getFlag(args, 'color', true);
  
  logger.setVerbose(verbose);
  logger.setSilent(silent);

  // Resolve working directory
  const cwd = getOption(args, 'cwd') || process.cwd();

  // Create command context
  const ctx: CommandContext = {
    cwd,
    verbose,
    silent,
    color,
    configPath: getOption(args, 'config'),
    positionals: args.positionals,
    flags: args.flags,
    options: args.options,
  };

  // Find and execute command
  const commandName = COMMAND_ALIASES[args.command] || args.command;
  const handler = COMMANDS[commandName];

  if (!handler) {
    logger.error(`Unknown command: ${args.command}`);
    logger.log(`Run 'vex --help' for available commands.`);
    return 1;
  }

  try {
    return await handler(ctx);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
      if (verbose && error.stack) {
        logger.debug(error.stack);
      }
    } else {
      logger.error('An unknown error occurred');
    }
    return 1;
  }
}

