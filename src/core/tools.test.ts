import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ToolExecutor } from './tools.js';

async function withWorkspace(run: (workspace: string, executor: ToolExecutor) => Promise<void>) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-tools-'));
  try {
    await run(workspace, new ToolExecutor(workspace));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

test('read_file returns raw content without display line numbers', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'app.js'), 'const value = 1;\nconst next = 2;\n');

    const result = await executor.executeTool('read_file', { relative_path: 'app.js' });

    assert.equal(result.content, 'const value = 1;\nconst next = 2;\n');
    assert.equal(result.line_count, 3);
  });
});

test('edit_file recovers when a model collapses multiline whitespace', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(
      path.join(workspace, 'styles.css'),
      'button {\n  color: white;\n  background: green;\n}\n'
    );

    const result = await executor.executeTool('edit_file', {
      relative_path: 'styles.css',
      target_text: 'button { color: white; background: green; }',
      replacement_text: 'button {\n  color: white;\n  background: purple;\n}',
    });

    assert.equal(result.success, true);
    assert.match(await fs.readFile(path.join(workspace, 'styles.css'), 'utf-8'), /background: purple/);
  });
});

test('edit_file reports a no-op as a failure', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'status.txt'), 'ready\n');

    const result = await executor.executeTool('edit_file', {
      relative_path: 'status.txt',
      target_text: 'ready',
      replacement_text: 'ready',
    });

    assert.equal(result.changed, false);
    assert.match(result.error, /produced no change/);
  });
});

test('replace_file supports broad rewrites of an existing file', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'styles.css'), 'body { background: white; }\n');

    const result = await executor.executeTool('replace_file', {
      relative_path: 'styles.css',
      content: 'body { background: rebeccapurple; color: white; }\n',
    });

    assert.equal(result.success, true);
    assert.equal(
      await fs.readFile(path.join(workspace, 'styles.css'), 'utf-8'),
      'body { background: rebeccapurple; color: white; }\n'
    );
  });
});
