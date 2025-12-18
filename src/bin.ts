#!/usr/bin/env node
/**
 * vex - Fast, disk-efficient package manager for Node.js
 * Entry point
 */

import { run } from './cli';

run(process.argv)
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

