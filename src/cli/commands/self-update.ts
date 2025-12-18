/**
 * Self-update command - updates vex to latest version
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import { CommandContext } from '../index';
import { logger } from '../../utils/logger';
import { Spinner } from '../../utils/progress';

const REPO = 'michailElsikora/vex-pm';
const VERSION = '1.0.9';

export function getVersion(): string {
  return VERSION;
}

export async function selfUpdateCommand(ctx: CommandContext): Promise<number> {
  const spinner = new Spinner('Checking for updates...', ctx.silent);
  spinner.start();

  try {
    // Get latest release info
    const latestVersion = await getLatestVersion();
    
    if (!latestVersion) {
      spinner.fail('Could not fetch latest version');
      return 1;
    }

    const currentVersion = VERSION;
    
    if (latestVersion === `v${currentVersion}` || latestVersion === currentVersion) {
      spinner.success(`vex is already at the latest version (${currentVersion})`);
      return 0;
    }

    spinner.update(`Updating vex ${currentVersion} -> ${latestVersion}...`);

    // Detect platform
    const platform = detectPlatform();
    if (!platform) {
      spinner.fail('Unsupported platform');
      return 1;
    }

    // Download new binary
    const downloadUrl = `https://github.com/${REPO}/releases/download/${latestVersion}/vex-${platform}`;
    const tempPath = path.join(os.tmpdir(), `vex-${latestVersion}`);
    
    await downloadFile(downloadUrl, tempPath);

    // Find current vex binary location
    // Resolve symlinks to find actual binary path
    let targetPath: string;
    
    // Check common installation paths
    const possiblePaths = [
      path.join(os.homedir(), '.vex-store', 'bin', 'vex'),
      path.join(os.homedir(), '.vex', 'bin', 'vex'),
      '/usr/local/bin/vex',
      path.join(os.homedir(), '.local', 'bin', 'vex'),
    ];

    // Find first existing path
    const foundPath = possiblePaths.find(p => fs.existsSync(p));
    
    if (foundPath) {
      // Check if it's a symlink to a dev version
      try {
        const realPath = fs.realpathSync(foundPath);
        // If symlink points to a .ts or node script, use the symlink path itself
        // as we want to replace the symlink target
        if (realPath.includes('/Desktop/') || realPath.endsWith('.ts')) {
          // This is a dev version via vex link - use the symlink location
          targetPath = foundPath;
          // Remove symlink and replace with binary
          fs.unlinkSync(foundPath);
        } else {
          targetPath = foundPath;
        }
      } catch {
        targetPath = foundPath;
      }
    } else {
      // Default to .vex-store
      targetPath = path.join(os.homedir(), '.vex-store', 'bin', 'vex');
      // Ensure directory exists
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Make executable and replace
    fs.chmodSync(tempPath, 0o755);
    
    // Backup old version
    const backupPath = targetPath + '.backup';
    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, backupPath);
    }

    // Replace with new version
    fs.copyFileSync(tempPath, targetPath);
    fs.unlinkSync(tempPath);

    spinner.success(`Updated vex to ${latestVersion}`);
    logger.info(`\nRestart your terminal to use the new version.`);
    
    return 0;
  } catch (error) {
    spinner.fail(`Update failed: ${error}`);
    return 1;
  }
}

async function getLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: {
        'User-Agent': 'vex-pm',
      },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.tag_name || null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    const request = (url: string) => {
      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            request(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

function detectPlatform(): string | null {
  const platform = os.platform();
  const arch = os.arch();

  let os_name: string;
  let arch_name: string;

  switch (platform) {
    case 'darwin':
      os_name = 'darwin';
      break;
    case 'linux':
      os_name = 'linux';
      break;
    case 'win32':
      os_name = 'win';
      break;
    default:
      return null;
  }

  switch (arch) {
    case 'x64':
      arch_name = 'x64';
      break;
    case 'arm64':
      arch_name = 'arm64';
      break;
    default:
      return null;
  }

  if (os_name === 'win') {
    return `${os_name}-${arch_name}.exe`;
  }

  return `${os_name}-${arch_name}`;
}

