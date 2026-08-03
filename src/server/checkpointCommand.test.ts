import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

type FileSnapshot = { path: string; before: string | null };
type CheckpointEntry = {
  promptId: string;
  promptText: string;
  timestamp: number;
  snapshots: FileSnapshot[];
};

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'command-checkpoint-test-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function captureSnapshotByPath(
  absPath: string,
  snapshotCache: Map<string, string | null>,
  checkpoint: CheckpointEntry
): Promise<void> {
  if (snapshotCache.has(absPath)) return;
  let before: string | null = null;
  try {
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(absPath, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(entry.path || (entry as any).parentPath || absPath, entry.name);
          await captureSnapshotByPath(filePath, snapshotCache, checkpoint);
        }
      }
      return;
    }
    before = await fs.readFile(absPath, 'utf8');
  } catch (_) {
    before = null;
  }
  snapshotCache.set(absPath, before);
  checkpoint.snapshots.push({ path: absPath, before });
}

async function captureCommandSnapshot(
  command: string,
  workingDir: string,
  snapshotCache: Map<string, string | null>,
  checkpoint: CheckpointEntry
): Promise<void> {
  if (!command) return;
  const tokens = command.split(/\s+/).filter((t) => t && !t.startsWith('-'));
  for (const token of tokens) {
    const cleanToken = token.replace(/^['"]|['"]$/g, '');
    if (!cleanToken) continue;
    const absPath = path.isAbsolute(cleanToken) ? cleanToken : path.join(workingDir, cleanToken);
    try {
      await fs.access(absPath);
      await captureSnapshotByPath(absPath, snapshotCache, checkpoint);
    } catch (_) {
      // file didn't exist yet
    }
  }
}

async function revertCheckpoint(checkpoint: CheckpointEntry): Promise<void> {
  for (const snap of checkpoint.snapshots) {
    if (snap.before === null) {
      await fs.unlink(snap.path).catch(() => {});
    } else {
      await fs.mkdir(path.dirname(snap.path), { recursive: true });
      await fs.writeFile(snap.path, snap.before, 'utf8');
    }
  }
}

test('captureCommandSnapshot captures file before rm command and reverts deletion', async () => {
  await withTempDir(async (dir) => {
    const testFile = path.join(dir, 'to_be_deleted.txt');
    await fs.writeFile(testFile, 'important content', 'utf8');

    const checkpoint: CheckpointEntry = { promptId: 'p1', promptText: 'delete file', timestamp: Date.now(), snapshots: [] };
    const cache = new Map<string, string | null>();

    // Simulate running `rm to_be_deleted.txt`
    await captureCommandSnapshot(`rm ${testFile}`, dir, cache, checkpoint);

    // Assert checkpoint captured original content
    assert.equal(checkpoint.snapshots.length, 1);
    assert.equal(checkpoint.snapshots[0].path, testFile);
    assert.equal(checkpoint.snapshots[0].before, 'important content');

    // Perform actual deletion
    await fs.unlink(testFile);
    assert.equal(await fs.access(testFile).then(() => true).catch(() => false), false);

    // Revert checkpoint
    await revertCheckpoint(checkpoint);

    // Assert file is fully restored
    const restoredContent = await fs.readFile(testFile, 'utf8');
    assert.equal(restoredContent, 'important content');
  });
});

test('captureCommandSnapshot recursively captures directories before rm -rf', async () => {
  await withTempDir(async (dir) => {
    const subDir = path.join(dir, 'subfolder');
    await fs.mkdir(subDir, { recursive: true });
    const file1 = path.join(subDir, 'a.txt');
    const file2 = path.join(subDir, 'b.txt');
    await fs.writeFile(file1, 'hello', 'utf8');
    await fs.writeFile(file2, 'world', 'utf8');

    const checkpoint: CheckpointEntry = { promptId: 'p2', promptText: 'rm -rf subfolder', timestamp: Date.now(), snapshots: [] };
    const cache = new Map<string, string | null>();

    await captureCommandSnapshot(`rm -rf ${subDir}`, dir, cache, checkpoint);

    assert.equal(checkpoint.snapshots.length, 2);

    // Delete folder
    await fs.rm(subDir, { recursive: true, force: true });

    // Revert
    await revertCheckpoint(checkpoint);

    assert.equal(await fs.readFile(file1, 'utf8'), 'hello');
    assert.equal(await fs.readFile(file2, 'utf8'), 'world');
  });
});

test('unchanged files (before === after) are filtered out from checkpoints', async () => {
  await withTempDir(async (dir) => {
    const untouchedFile = path.join(dir, 'read_only.txt');
    await fs.writeFile(untouchedFile, 'same content', 'utf8');

    const checkpoint: CheckpointEntry = { promptId: 'p3', promptText: 'cat read_only.txt', timestamp: Date.now(), snapshots: [] };
    const cache = new Map<string, string | null>();

    // Simulate snapshotting read_only.txt
    await captureCommandSnapshot(`cat ${untouchedFile}`, dir, cache, checkpoint);
    assert.equal(checkpoint.snapshots.length, 1);

    // Filter out unchanged files (where before === current disk content)
    const verified: FileSnapshot[] = [];
    for (const snap of checkpoint.snapshots) {
      let after: string | null = null;
      try { after = await fs.readFile(snap.path, 'utf8'); } catch (_) {}
      if (snap.before !== after) {
        verified.push(snap);
      }
    }

    assert.equal(verified.length, 0, 'Untouched file should be filtered out from checkpoint');
  });
});
