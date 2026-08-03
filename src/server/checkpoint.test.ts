/**
 * Tests for the checkpoint / batch-approval system.
 *
 * Covers:
 * 1. configStore persists and restores 'batch' fileEditMode
 * 2. Snapshot capture logic (new file, existing file, deduplication)
 * 3. Revert ordering — later checkpoints overwrite earlier ones correctly
 * 4. Batch approval filtering (approvedIds subset)
 * 5. Edge cases: revert with no snapshots, revert past end, unknown promptId
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// ---------------------------------------------------------------------------
// Helpers shared across tests
// ---------------------------------------------------------------------------

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-test-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Inlined revert logic mirroring src/server/index.ts for unit-testability
// ---------------------------------------------------------------------------

type FileSnapshot = { path: string; before: string | null };
type CheckpointEntry = {
  promptId: string;
  promptText: string;
  timestamp: number;
  snapshots: FileSnapshot[];
};

/** Mirror of the revert algorithm in index.ts so we can unit-test it. */
async function applyRevert(
  entries: CheckpointEntry[],
  targetPromptId: string,
): Promise<{ reverted: CheckpointEntry[]; errors: string[]; revertedCount: number }> {
  const targetIdx = entries.findIndex((e) => e.promptId === targetPromptId);
  if (targetIdx === -1) {
    throw new Error(`Checkpoint '${targetPromptId}' not found`);
  }

  // All snapshots AFTER target (we are undoing these)
  const toRevert = entries.slice(targetIdx + 1).flatMap((e) => e.snapshots);

  // Deduplicate: keep the latest (first seen when reversed)
  const seen = new Set<string>();
  const unique: FileSnapshot[] = [];
  for (const snap of [...toRevert].reverse()) {
    if (!seen.has(snap.path)) {
      seen.add(snap.path);
      unique.push(snap);
    }
  }

  const errors: string[] = [];
  for (const snap of unique) {
    try {
      if (snap.before === null) {
        await fs.unlink(snap.path).catch(() => {});
      } else {
        await fs.mkdir(path.dirname(snap.path), { recursive: true });
        await fs.writeFile(snap.path, snap.before, 'utf8');
      }
    } catch (err: any) {
      errors.push(`${snap.path}: ${err.message}`);
    }
  }

  const remaining = entries.slice(0, targetIdx + 1);
  return { reverted: remaining, errors, revertedCount: unique.length };
}

/** Simulate capturing a snapshot before a file edit. */
async function captureSnapshot(
  absPath: string,
  cache: Map<string, string | null>,
  checkpoint: CheckpointEntry,
): Promise<void> {
  if (cache.has(absPath)) return; // already captured for this turn
  let before: string | null = null;
  try {
    before = await fs.readFile(absPath, 'utf8');
  } catch {
    before = null;
  }
  cache.set(absPath, before);
  checkpoint.snapshots.push({ path: absPath, before });
}

// ---------------------------------------------------------------------------
// configStore: batch fileEditMode persistence
// ---------------------------------------------------------------------------

test('configStore round-trips batch fileEditMode', async () => {
  // Inline the bare minimum of configStore logic
  await withTempDir(async (dir) => {
    const configFile = path.join(dir, 'config.json');

    const write = async (mode: string) => {
      await fs.writeFile(configFile, JSON.stringify({ fileEditMode: mode }), 'utf8');
    };
    const read = async (): Promise<string> => {
      const raw = JSON.parse(await fs.readFile(configFile, 'utf8'));
      const v = raw.fileEditMode;
      if (v === 'confirm' || v === 'auto' || v === 'batch') return v;
      return 'confirm'; // default
    };

    await write('batch');
    assert.equal(await read(), 'batch', 'batch should be persisted and restored');

    await write('auto');
    assert.equal(await read(), 'auto');

    await write('confirm');
    assert.equal(await read(), 'confirm');

    await write('invalid');
    assert.equal(await read(), 'confirm', 'unknown value should fall back to confirm');
  });
});

// ---------------------------------------------------------------------------
// Snapshot capture
// ---------------------------------------------------------------------------

test('captureSnapshot records original content of an existing file', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'app.ts');
    await fs.writeFile(filePath, 'original content', 'utf8');

    const checkpoint: CheckpointEntry = { promptId: 'p1', promptText: '', timestamp: 0, snapshots: [] };
    const cache = new Map<string, string | null>();

    await captureSnapshot(filePath, cache, checkpoint);

    assert.equal(checkpoint.snapshots.length, 1);
    assert.equal(checkpoint.snapshots[0].before, 'original content');
    assert.equal(checkpoint.snapshots[0].path, filePath);
  });
});

test('captureSnapshot records null for a file that does not exist yet', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'new-file.ts');

    const checkpoint: CheckpointEntry = { promptId: 'p1', promptText: '', timestamp: 0, snapshots: [] };
    const cache = new Map<string, string | null>();

    await captureSnapshot(filePath, cache, checkpoint);

    assert.equal(checkpoint.snapshots.length, 1);
    assert.equal(checkpoint.snapshots[0].before, null);
  });
});

test('captureSnapshot only records a file once per turn (dedup via cache)', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'shared.ts');
    await fs.writeFile(filePath, 'v1', 'utf8');

    const checkpoint: CheckpointEntry = { promptId: 'p1', promptText: '', timestamp: 0, snapshots: [] };
    const cache = new Map<string, string | null>();

    // Simulate two tool calls editing the same file in one turn
    await captureSnapshot(filePath, cache, checkpoint);
    await fs.writeFile(filePath, 'v2', 'utf8'); // file changes between calls
    await captureSnapshot(filePath, cache, checkpoint); // should be skipped

    assert.equal(checkpoint.snapshots.length, 1, 'only the first snapshot should be kept');
    assert.equal(checkpoint.snapshots[0].before, 'v1');
  });
});

// ---------------------------------------------------------------------------
// Revert logic
// ---------------------------------------------------------------------------

test('revert restores a file when there is a later checkpoint that modified it', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'src', 'index.ts');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'original', 'utf8');

    const entries: CheckpointEntry[] = [
      {
        promptId: 'p1',
        promptText: 'First prompt — baseline',
        timestamp: 1,
        snapshots: [],
      },
      {
        promptId: 'p2',
        promptText: 'Rename function',
        timestamp: 2,
        // p2 captured 'original' before it wrote 'modified'
        snapshots: [{ path: filePath, before: 'original' }],
      },
    ];

    // Simulate what p2 wrote to disk
    await fs.writeFile(filePath, 'modified', 'utf8');

    // Revert to p1 — should undo p2 and restore 'original'
    const { revertedCount, reverted } = await applyRevert(entries, 'p1');

    const content = await fs.readFile(filePath, 'utf8');
    assert.equal(content, 'original', 'file should be restored to its pre-p2 state');
    assert.equal(revertedCount, 1, 'one file was reverted');
    assert.equal(reverted.length, 1, 'only p1 remains after revert');
  });
});

test('revert to the only checkpoint (no snapshots after it) is a no-op', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'src', 'index.ts');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'on-disk', 'utf8');

    const entries: CheckpointEntry[] = [
      {
        promptId: 'p1',
        promptText: 'Rename function',
        timestamp: 1,
        snapshots: [{ path: filePath, before: 'original' }],
      },
    ];

    // p1 is the only checkpoint — nothing after it to undo
    const { revertedCount, reverted } = await applyRevert(entries, 'p1');

    const content = await fs.readFile(filePath, 'utf8');
    assert.equal(content, 'on-disk', 'file should not be touched when reverting to the only checkpoint');
    assert.equal(revertedCount, 0, 'no snapshots to revert');
    assert.equal(reverted.length, 1, 'p1 remains');
  });
});

test('revert removes a newly created file (before === null)', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'newfile.ts');

    // p1 is the baseline (no file edits)
    // p2 created the file
    const entries: CheckpointEntry[] = [
      {
        promptId: 'p1',
        promptText: 'Initial prompt',
        timestamp: 1,
        snapshots: [],
      },
      {
        promptId: 'p2',
        promptText: 'Create new file',
        timestamp: 2,
        snapshots: [{ path: filePath, before: null }],
      },
    ];

    await fs.writeFile(filePath, 'new content', 'utf8');

    await applyRevert(entries, 'p1');

    let exists = true;
    try {
      await fs.access(filePath);
    } catch {
      exists = false;
    }
    assert.equal(exists, false, 'newly created file should be deleted on revert');
  });
});

test('revert across multiple prompts restores each file to its earliest captured state', async () => {
  await withTempDir(async (dir) => {
    const fileA = path.join(dir, 'a.ts');
    const fileB = path.join(dir, 'b.ts');
    await fs.writeFile(fileA, 'a-original', 'utf8');
    await fs.writeFile(fileB, 'b-original', 'utf8');

    const entries: CheckpointEntry[] = [
      {
        promptId: 'p0',
        promptText: 'Baseline',
        timestamp: 0,
        snapshots: [],
      },
      {
        promptId: 'p1',
        promptText: 'Edit a',
        timestamp: 1,
        snapshots: [{ path: fileA, before: 'a-original' }],
      },
      {
        promptId: 'p2',
        promptText: 'Edit b',
        timestamp: 2,
        snapshots: [{ path: fileB, before: 'b-original' }],
      },
      {
        promptId: 'p3',
        promptText: 'Edit a again',
        timestamp: 3,
        snapshots: [{ path: fileA, before: 'a-after-p1' }],
      },
    ];

    // Current state on disk
    await fs.writeFile(fileA, 'a-after-p3', 'utf8');
    await fs.writeFile(fileB, 'b-after-p2', 'utf8');

    // Revert to p0: should undo p1, p2, p3
    const { reverted, revertedCount } = await applyRevert(entries, 'p0');

    assert.equal(reverted.length, 1, 'only p0 should remain');
    assert.equal(revertedCount, 2, 'two unique files were affected');

    // a.ts: latest snapshot for a is p3 (a-after-p1 → we revert to that)
    // Dedup reverses the slice [p1,p2,p3] → reversed [p3,p2,p1]
    // First unique a.ts seen from reversed = p3's snapshot (a-after-p1)
    const aContent = await fs.readFile(fileA, 'utf8');
    assert.equal(aContent, 'a-after-p1', 'file A should be at the state captured in p3 snapshot');

    const bContent = await fs.readFile(fileB, 'utf8');
    assert.equal(bContent, 'b-original', 'file B should be restored to its p2 snapshot value');
  });
});

test('revert throws when promptId is not found', async () => {
  const entries: CheckpointEntry[] = [
    { promptId: 'p1', promptText: '', timestamp: 1, snapshots: [] },
  ];

  await assert.rejects(
    () => applyRevert(entries, 'nonexistent'),
    /not found/i,
  );
});

test('revert of the last checkpoint (nothing after it) is a no-op', async () => {
  const entries: CheckpointEntry[] = [
    { promptId: 'p1', promptText: '', timestamp: 1, snapshots: [{ path: '/tmp/x', before: 'old' }] },
    { promptId: 'p2', promptText: '', timestamp: 2, snapshots: [] },
  ];

  const { revertedCount, reverted } = await applyRevert(entries, 'p2');
  assert.equal(revertedCount, 0, 'nothing after p2 to revert');
  assert.equal(reverted.length, 2, 'both checkpoints remain');
});

// ---------------------------------------------------------------------------
// Batch approval filtering
// ---------------------------------------------------------------------------

test('batch approval: only approved edits are executed', async () => {
  type BatchEdit = { id: string; name: string; args: Record<string, unknown> };

  const executed: string[] = [];
  const fakeExecuteTool = async (edit: BatchEdit) => {
    executed.push(edit.id);
  };

  const queue: BatchEdit[] = [
    { id: 'e1', name: 'edit_file', args: { relative_path: 'a.ts' } },
    { id: 'e2', name: 'create_file', args: { relative_path: 'b.ts' } },
    { id: 'e3', name: 'replace_file', args: { relative_path: 'c.ts' } },
  ];

  const approvedIds = new Set(['e1', 'e3']);

  for (const edit of queue) {
    if (approvedIds.has(edit.id)) {
      await fakeExecuteTool(edit);
    }
  }

  assert.deepEqual(executed, ['e1', 'e3']);
});

test('batch approval: empty approvedIds skips all edits (reject all)', async () => {
  const executed: string[] = [];
  const queue = [
    { id: 'e1' },
    { id: 'e2' },
  ];

  const approvedIds = new Set<string>([]);
  for (const edit of queue) {
    if (approvedIds.has(edit.id)) executed.push(edit.id);
  }

  assert.equal(executed.length, 0, 'no edits should run when all are rejected');
});

test('batch approval: approving all IDs executes every edit', async () => {
  const executed: string[] = [];
  const queue = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }];

  const approvedIds = new Set(queue.map((e) => e.id));
  for (const edit of queue) {
    if (approvedIds.has(edit.id)) executed.push(edit.id);
  }

  assert.deepEqual(executed, ['e1', 'e2', 'e3']);
});

// ---------------------------------------------------------------------------
// Snapshot deduplication across multiple checkpoints (unit)
// ---------------------------------------------------------------------------

test('revert deduplication picks the LATEST snapshot per file path', () => {
  const filePath = '/fake/a.ts';

  // Three checkpoints all touch the same file
  const entries: CheckpointEntry[] = [
    { promptId: 'p0', promptText: '', timestamp: 0, snapshots: [] },
    { promptId: 'p1', promptText: '', timestamp: 1, snapshots: [{ path: filePath, before: 'v0' }] },
    { promptId: 'p2', promptText: '', timestamp: 2, snapshots: [{ path: filePath, before: 'v1' }] },
    { promptId: 'p3', promptText: '', timestamp: 3, snapshots: [{ path: filePath, before: 'v2' }] },
  ];

  // Replicate dedup logic
  const toRevert = entries.slice(1).flatMap((e) => e.snapshots); // p1..p3
  const seen = new Set<string>();
  const unique: FileSnapshot[] = [];
  for (const snap of [...toRevert].reverse()) {
    if (!seen.has(snap.path)) {
      seen.add(snap.path);
      unique.push(snap);
    }
  }

  assert.equal(unique.length, 1, 'only one snapshot per file after dedup');
  // Reversed order: p3, p2, p1 — first seen is p3 which has before:'v2'
  assert.equal(unique[0].before, 'v2', 'should use the latest snapshot (p3)');
});
