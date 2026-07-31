import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ToolExecutor } from './tools.js';
import { categorizeError } from './types.js';
import { stripAnsiCodes } from './terminalManager.js';

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

test('edit_file matches target text with tab and space differences', async () => {
  await withWorkspace(async (workspace, executor) => {
    // Disk content uses tab indentation
    await fs.writeFile(
      path.join(workspace, 'app.ts'),
      'function main() {\n\tconst port = 3000;\n\treturn port;\n}\n'
    );

    // Target text uses spaces for indentation
    const result = await executor.executeTool('edit_file', {
      relative_path: 'app.ts',
      target_text: '  const port = 3000;\n  return port;',
      replacement_text: '\tconst port = 8080;\n\treturn port;',
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'app.ts'), 'utf-8');
    assert.match(updated, /const port = 8080;/);
  });
});

test('edit_file matches target text with operator spacing differences', async () => {
  await withWorkspace(async (workspace, executor) => {
    const originalCode = `if (failedCount > 0) {\n    console.error(\`\\nCore test execution finished with \${failedCount} failing profile(s).\`);\n    process.exit(1);\n}`;
    await fs.writeFile(path.join(workspace, 'runner.js'), originalCode);

    // Model target text omits space around > and alters indentation
    const targetText = `if (failedCount>0) {\n console.error(\`\\nCore test execution finished with \${failedCount} failing profile(s).\`);`;
    const replacementText = `if (failedCount > 0) {\n    console.error('Test failed');`;

    const result = await executor.executeTool('edit_file', {
      relative_path: 'runner.js',
      target_text: targetText,
      replacement_text: replacementText,
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'runner.js'), 'utf-8');
    assert.match(updated, /console\.error\('Test failed'\);/);
    assert.match(updated, /process\.exit\(1\);/);
  });
});

test('categorizeError accurately maps error messages to codes and reasons', () => {
  const ungrounded = categorizeError('The runtime read "todo.html" instead of executing this ungrounded edit_file call.');
  assert.equal(ungrounded.code, 'READ_REQUIRED');
  assert.equal(ungrounded.reason, 'Must read file before editing');

  const targetNotFound = categorizeError('Literal target_text "foo" was not found in file "app.js".');
  assert.equal(targetNotFound.code, 'TARGET_NOT_FOUND');
  assert.equal(targetNotFound.reason, 'Target text not found in file');

  const noChanges = categorizeError('replace_file produced no change in "status.txt".');
  assert.equal(noChanges.code, 'NO_CHANGES');
  assert.equal(noChanges.reason, 'Edit produced no changes');

  const fileNotFound = categorizeError('ENOENT: no such file or directory, open "missing.txt"');
  assert.equal(fileNotFound.code, 'FILE_NOT_FOUND');
  assert.equal(fileNotFound.reason, 'File or directory not found');

  const fileNotFoundReadReq = categorizeError('Refusing to edit_file "missing.txt" because the required automatic read failed: Failed to read file: ENOENT: no such file or directory', { read_required: true });
  assert.equal(fileNotFoundReadReq.code, 'FILE_NOT_FOUND');
  assert.equal(fileNotFoundReadReq.reason, 'File or directory not found');

  const cmdFail = categorizeError(undefined, { exitCode: 1 });
  assert.equal(cmdFail.code, 'COMMAND_FAILED');
  assert.equal(cmdFail.reason, 'Command exited with code 1');
});

test('stripAnsiCodes strips standard ESC codes and orphaned color brackets', () => {
  const rawInput = '\u001b[36m- And I fill "currencies-rate" with "380"\u001b[39m # [90mcucumber/click-button.ts:189\u001b[39m';
  assert.equal(stripAnsiCodes(rawInput), '- And I fill "currencies-rate" with "380" # cucumber/click-button.ts:189');

  const orphanedInput = ' [36m- And I fill "currencies-rate" with "380"[39m # [90mcucumber/click-button.ts:189[39m';
  assert.equal(stripAnsiCodes(orphanedInput).trim(), '- And I fill "currencies-rate" with "380" # cucumber/click-button.ts:189');
});
