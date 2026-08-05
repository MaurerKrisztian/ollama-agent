import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareRepositoryCache } from '../runtime/repositoryCache.js';

test('prepareRepositoryCache creates host snapshot and reuses cached directory', async () => {
  const mockRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-repo-git-'));
  try {
    execSync('git init && git config user.email "test@example.com" && git config user.name "Test"', { cwd: mockRepoDir });
    await fs.writeFile(path.join(mockRepoDir, 'package.json'), JSON.stringify({ name: 'mock-repo', version: '1.0.0' }));
    execSync('git add . && git commit -m "initial commit"', { cwd: mockRepoDir });

    const spec = {
      url: mockRepoDir,
      branch: 'main',
    };

    const cacheDir = await prepareRepositoryCache(spec);
    assert.ok(fsSync.existsSync(cacheDir));
    assert.ok(fsSync.existsSync(path.join(cacheDir, 'package.json')));

    // Second call should return instantly from cache
    const secondCacheDir = await prepareRepositoryCache(spec);
    assert.equal(secondCacheDir, cacheDir);
  } finally {
    await fs.rm(mockRepoDir, { recursive: true, force: true });
  }
});
