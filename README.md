# vex

Fast, disk-efficient package manager for JavaScript.

## Features

- **Fast** - Parallel downloads and intelligent caching
- **Disk efficient** - Content-addressable storage with hardlinks
- **Deterministic** - Lockfile ensures reproducible installs
- **Zero dependencies** - Built with Node.js built-in modules only
- **npm compatible** - Works with existing package.json and npm registry

## Installation

### Using install script (Linux/macOS)

```bash
curl -fsSL https://vex.dev/install.sh | sh
```

### Using install script (Windows PowerShell)

```powershell
irm https://vex.dev/install.ps1 | iex
```

### Manual download

Download the binary for your platform from [GitHub Releases](https://github.com/michailElsikora/vex-pm/releases).

### Build from source

```bash
git clone https://github.com/michailElsikora/vex-pm.git
cd vex-pm
npm install
npm run build
```

## Usage

### Install dependencies

```bash
vex install
vex i                    # shorthand
vex install --production # skip devDependencies
```

### Add packages

```bash
vex add lodash
vex add -D typescript    # devDependency
vex add express@4.18.0   # specific version
```

### Remove packages

```bash
vex remove lodash
vex rm lodash express    # multiple packages
```

### Run scripts

```bash
vex run build
vex run test -- --watch  # pass arguments
```

### Link packages (for development)

```bash
vex link           # link current package globally
vex link my-lib    # link global package to local node_modules
vex unlink         # unlink current package
vex links          # list all linked packages
```

### Publish packages

```bash
vex config set registry http://your-registry.com
vex login
vex publish
```

### Other commands

```bash
vex init           # create package.json
vex why lodash     # show why package is installed
vex list           # list installed packages
vex whoami         # show current user
vex logout         # remove authentication
```

## Configuration

### Global configuration (~/.vexrc)

```json
{
  "registry": "https://registry.npmjs.org",
  "store-dir": "~/.vex-store",
  "concurrency": 16
}
```

### Project configuration (vex.config.ts)

```typescript
import { defineConfig } from 'vex';

export default defineConfig({
  registry: 'http://localhost:4873',
  shamefullyHoist: false,
  autoInstallPeers: true,
});
```

### Config commands

```bash
vex config list                    # show all config
vex config get registry            # get value
vex config set registry http://... # set value
vex config delete registry         # delete value
```

## How it works

1. **Resolution** - Resolves all dependencies from registry with semver matching
2. **Fetching** - Downloads tarballs in parallel to content-addressable store
3. **Linking** - Creates node_modules using hardlinks from store (saves disk space)
4. **Lockfile** - Generates vex-lock.json for deterministic installs

## Performance

vex is designed to be fast:

- Parallel metadata fetching and tarball downloads
- Content-addressable store eliminates duplicate packages
- Hardlinks instead of copying (saves disk and time)
- Intelligent caching with offline support

## License

MIT
