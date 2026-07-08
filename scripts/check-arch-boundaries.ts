#!/usr/bin/env tsx
/**
 * Architecture boundary gate script.
 *
 * Quick grep-based rule checker that verifies layer isolation rules within
 * @szybko/host and @szybko/desktop.
 *
 * Rules:
 *   domain/                    — must NOT import electron, drizzle-orm, node:fs, node:path, ipcMain, infrastructure
 *   ipc/ (except registrars)   — must NOT import schema, repositories, presentation
 *   app/                       — must NOT import ipcMain or SQLite schema
 *   infrastructure/sqlite/     — is the ONLY path that may import schema.ts
 *   apps/desktop main          — must NOT import CommandCatalog, PluginCatalog, RuntimeManager directly
 *
 * Usage:
 *   pnpm check:boundaries
 *   tsx scripts/check-arch-boundaries.ts
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

/** Run grep with given args, return matching lines (empty if no matches). */
function grep(...args: string[]): string {
  const result = spawnSync('grep', args, {
    encoding: 'utf-8',
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // grep exits 0 when matches found, 1 when none found
  if (result.status === 0) return result.stdout;
  return '';
}

type Rule = {
  name: string;
  grepArgs: string[][]; // multiple grep invocations, OR'd together
  expectEmpty: boolean;
  message: string;
};

const HOST_SRC = resolve(repoRoot, 'packages/host/src');
const DESKTOP_MAIN = resolve(repoRoot, 'apps/desktop/src/main/index.ts');

const rules: Rule[] = [
  // Rule 1: domain/ must NOT import electron, drizzle-orm, node:fs, node:path, ipcMain, infrastructure
  {
    name: 'domain-no-infra',
    grepArgs: [
      ['-rn', '-e', "from 'electron'", '-e', 'from "electron"', resolve(HOST_SRC, 'domain'), '--include=*.ts'],
      ['-rn', '-e', "from 'drizzle-orm'", '-e', 'from "drizzle-orm"', resolve(HOST_SRC, 'domain'), '--include=*.ts'],
      ['-rn', '-e', "from 'node:fs'", '-e', 'from "node:fs"', resolve(HOST_SRC, 'domain'), '--include=*.ts'],
      ['-rn', '-e', "from 'node:path'", '-e', 'from "node:path"', resolve(HOST_SRC, 'domain'), '--include=*.ts'],
      ['-rn', '-e', "from 'ipcMain'", '-e', 'from "ipcMain"', resolve(HOST_SRC, 'domain'), '--include=*.ts'],
      ['-rn', '-e', "from '../infrastructure'", '-e', 'from "../infrastructure"', resolve(HOST_SRC, 'domain'), '--include=*.ts'],
    ],
    expectEmpty: true,
    message:
      'domain/ must not import electron, drizzle-orm, node:fs, node:path, ipcMain, or infrastructure',
  },

  // Rule 2: ipc/ (except register-handlers.ts) must NOT import schema, repositories, presentation
  {
    name: 'ipc-no-repos',
    grepArgs: [
      ['-rn', '-e', "from '../infrastructure/sqlite/schema'", '-e', 'from "../infrastructure/sqlite/schema"', resolve(HOST_SRC, 'ipc'), '--include=*.ts', '--exclude=register-handlers.ts'],
      ['-rn', '-e', "from '../infrastructure/sqlite'", '-e', 'from "../infrastructure/sqlite"', resolve(HOST_SRC, 'ipc'), '--include=*.ts', '--exclude=register-handlers.ts'],
      ['-rn', '-e', "from '../presentation/window'", '-e', 'from "../presentation/window"', resolve(HOST_SRC, 'ipc'), '--include=*.ts', '--exclude=register-handlers.ts'],
      ['-rn', '-e', "from '../presentation/runtime-host'", '-e', 'from "../presentation/runtime-host"', resolve(HOST_SRC, 'ipc'), '--include=*.ts', '--exclude=register-handlers.ts'],
    ],
    expectEmpty: true,
    message:
      'ipc/ (except register-handlers.ts) must not import schema, repositories, or presentation',
  },

  // Rule 3: app/ must NOT import ipcMain or SQLite schema
  {
    name: 'app-no-ipc',
    grepArgs: [
      ['-rn', '-e', "from 'ipcMain'", '-e', 'from "ipcMain"', resolve(HOST_SRC, 'app'), '--include=*.ts'],
      ['-rn', '-e', "from '../infrastructure/sqlite/schema'", '-e', 'from "../infrastructure/sqlite/schema"', resolve(HOST_SRC, 'app'), '--include=*.ts'],
    ],
    expectEmpty: true,
    message: 'app/ must not import ipcMain or SQLite schema',
  },

  // Rule 4: Only infrastructure/sqlite/ may import schema — but we just check
  //         that no files OUTSIDE infrastructure/sqlite/ import schema.
  {
    name: 'sqlite-schema-boundary',
    grepArgs: [
      // Look for import of schema from paths that are NOT infrastructure/sqlite/
      ['-rn', '-e', "from '\\.\\./infrastructure/sqlite/schema'", '-e', 'from "../infrastructure/sqlite/schema"', resolve(HOST_SRC), '--include=*.ts'],
      ['-rn', '-e', "from '\\.\\./\\.\\./sqlite/schema'", '-e', 'from "../../sqlite/schema"', resolve(HOST_SRC), '--include=*.ts'],
    ],
    expectEmpty: false,
    message: 'Must find schema imports (report below)',
  },

  // Rule 5: apps/desktop main must NOT import CommandCatalog, PluginCatalog, RuntimeManager
  {
    name: 'desktop-main-no-gods',
    grepArgs: [
      ['-n', '-E', 'CommandCatalog|PluginCatalog|RuntimeManager', DESKTOP_MAIN],
    ],
    expectEmpty: true,
    message:
      'apps/desktop/src/main/index.ts must not import CommandCatalog, PluginCatalog, or RuntimeManager directly',
  },
];

let failures = 0;

for (const rule of rules) {
  let allOutput = '';
  for (const args of rule.grepArgs) {
    allOutput += grep(...args);
  }

  const cleaned = allOutput.trim();

  if (rule.name === 'sqlite-schema-boundary') {
    // For this rule, filter out infrastructure/sqlite/ results
    const outsideSqlite = cleaned
      .split('\n')
      .filter(l => l.trim() && !l.includes('infrastructure/sqlite/'))
      .join('\n')
      .trim();

    if (outsideSqlite) {
      console.error(`\n❌ ${rule.name}: Only infrastructure/sqlite/ may import schema.ts`);
      console.error(outsideSqlite);
      failures++;
    } else {
      console.log(`✅ ${rule.name}: OK`);
    }
    continue;
  }

  if (cleaned && rule.expectEmpty) {
    console.error(`\n❌ ${rule.name}: ${rule.message}`);
    console.error(cleaned);
    failures++;
  } else {
    console.log(`✅ ${rule.name}: OK`);
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} architecture boundary violation(s) found`);
  process.exit(1);
} else {
  console.log('\n✅ All architecture boundaries clean');
}
