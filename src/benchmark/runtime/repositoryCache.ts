import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { BenchmarkRepositorySpec } from '../cases/types.js';

const execAsync = promisify(exec);

export const REPOSITORY_CACHE_BASE = path.join(os.homedir(), '.cache', 'benchrig', 'repos');

function sanitizeRepoKey(url: string): string {
  return url.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function prepareRepositoryCache(
  repoSpec: BenchmarkRepositorySpec,
): Promise<string> {
  const repoKey = sanitizeRepoKey(repoSpec.url);
  const refKey = repoSpec.commit || repoSpec.tag || repoSpec.branch || 'head';
  const targetCacheDir = path.join(REPOSITORY_CACHE_BASE, repoKey, refKey);

  // 1. Instant hit if cache already exists
  if (fsSync.existsSync(targetCacheDir)) {
    return targetCacheDir;
  }

  const tempDir = `${targetCacheDir}.tmp.${process.pid}.${Date.now()}`;
  await fs.mkdir(path.dirname(targetCacheDir), { recursive: true });

  try {
    // 2. Clone repository into temporary directory
    if (repoSpec.commit || repoSpec.tag || repoSpec.branch) {
      const ref = repoSpec.commit || repoSpec.tag || repoSpec.branch;
      await execAsync(`git clone --depth 1 ${repoSpec.url} "${tempDir}"`);
      await execAsync(`git fetch --depth 1 origin ${ref}`, { cwd: tempDir }).catch(() => {});
      await execAsync(`git checkout ${ref}`, { cwd: tempDir }).catch(() => {});
    } else {
      await execAsync(`git clone --depth 1 ${repoSpec.url} "${tempDir}"`);
    }

    // 3. Pre-install dependencies once into cache
    if (repoSpec.installCommand) {
      await execAsync(repoSpec.installCommand, { cwd: tempDir });
    } else if (fsSync.existsSync(path.join(tempDir, 'package.json'))) {
      await execAsync('npm ci --prefer-offline --no-audit', { cwd: tempDir }).catch(async () => {
        await execAsync('npm install --prefer-offline --no-audit', { cwd: tempDir });
      });
    }

    // 4. Atomically move into place
    await fs.rename(tempDir, targetCacheDir);
    return targetCacheDir;
  } catch (error: any) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`Failed to prepare repository cache for ${repoSpec.url}: ${error.message}`);
  }
}
