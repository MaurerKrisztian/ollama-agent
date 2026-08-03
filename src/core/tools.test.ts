import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ToolExecutor, getToolDefinitions } from './tools.js';
import { categorizeError } from './types.js';
import { stripAnsiCodes } from './terminalManager.js';
import { buildPatchFileDiff } from './tools/fileTools.js';


async function withWorkspace(run: (workspace: string, executor: ToolExecutor) => Promise<void>) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-tools-'));
  try {
    await run(workspace, new ToolExecutor(workspace));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

test('read_file returns content formatted with 1-indexed line numbers', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'app.js'), 'const value = 1;\nconst next = 2;\n');

    const result = await executor.executeTool('read_file', { relative_path: 'app.js' });

    assert.match(result.content, /Showing lines 1 to 3 of 3 in app\.js/);
    assert.match(result.content, /1: const value = 1;/);
    assert.match(result.content, /2: const next = 2;/);
    assert.equal(result.line_count, 3);
  });
});

test('read_file supports start_line and end_line slice ranges', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'app.js'), 'line 1\nline 2\nline 3\nline 4\nline 5\n');

    const result = await executor.executeTool('read_file', {
      relative_path: 'app.js',
      start_line: 2,
      end_line: 4,
    });

    assert.match(result.content, /Showing lines 2 to 4 of 6 in app\.js/);
    assert.match(result.content, /2: line 2/);
    assert.match(result.content, /3: line 3/);
    assert.match(result.content, /4: line 4/);
    assert.doesNotMatch(result.content, /1: line 1/);
    assert.doesNotMatch(result.content, /5: line 5/);
  });
});

test('edit_file supports start_line and end_line range bounded edits', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'web.js'), 'const name = "first";\nconst name = "target";\nconst name = "last";\n');

    const result = await executor.executeTool('edit_file', {
      relative_path: 'web.js',
      start_line: 2,
      end_line: 2,
      target_text: 'const name = "target";',
      replacement_text: 'const name = "updated";',
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'web.js'), 'utf-8');
    assert.equal(updated, 'const name = "first";\nconst name = "updated";\nconst name = "last";\n');
  });
});

test('edit_file replaces line range directly when target_text is omitted', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(
      path.join(workspace, 'verbose.ts'),
      'line 1\nline 2\nline 3\nline 4\nline 5\n'
    );

    const result = await executor.executeTool('edit_file', {
      relative_path: 'verbose.ts',
      start_line: 2,
      end_line: 4,
      replacement_text: 'line updated',
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'verbose.ts'), 'utf-8');
    assert.equal(updated, 'line 1\nline updated\nline 5\n');
  });
});

test('previewFileDiff generates diff preview for edit_file when target_text is omitted', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(
      path.join(workspace, 'range_test.ts'),
      'line 1\nline 2\nline 3\nline 4\nline 5\n'
    );

    const diff = await executor.previewFileDiff('edit_file', {
      relative_path: 'range_test.ts',
      start_line: 2,
      end_line: 4,
      replacement_text: 'line updated',
    });

    assert.ok(diff);
    assert.equal(diff?.path, 'range_test.ts');
    const removed = diff?.lines.filter((l) => l.type === 'remove');
    const added = diff?.lines.filter((l) => l.type === 'add');
    assert.equal(removed?.length, 3);
    assert.equal(added?.length, 1);
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

test('grep_search supports regex mode, case sensitivity, and file pattern filtering', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'service.ts'), 'function ProcessData() { return "SUCCESS"; }\n');
    await fs.writeFile(path.join(workspace, 'config.json'), '{"processData": true}\n');
    await fs.writeFile(path.join(workspace, 'readme.md'), 'processdata is enabled.\n');

    // Test 1: Regex search
    const regexRes = await executor.executeTool('grep_search', {
      query: 'Process[A-Z]\\w+',
      is_regex: true,
      case_sensitive: true,
    });
    assert.equal(regexRes.total_matches, 1);
    assert.equal(regexRes.matches[0].file, 'service.ts');

    // Test 2: Case-sensitive search
    const caseRes = await executor.executeTool('grep_search', {
      query: 'ProcessData',
      case_sensitive: true,
    });
    assert.equal(caseRes.total_matches, 1);
    assert.equal(caseRes.matches[0].file, 'service.ts');

    // Test 3: File pattern filter (*.json)
    const patRes = await executor.executeTool('grep_search', {
      query: 'processData',
      file_pattern: '*.json',
    });
    assert.equal(patRes.returned_matches, 1);
    assert.equal(patRes.matches[0].file, 'config.json');

    // Test 4: Whole word boundary (\b)
    const wordRes = await executor.executeTool('grep_search', {
      query: 'processdata',
      whole_word: true,
      case_sensitive: true,
    });
    assert.equal(wordRes.returned_matches, 1);
    assert.equal(wordRes.matches[0].file, 'readme.md');

    // Test 5: Context lines & highlighting
    const gherkinFile = path.join(workspace, 'feature.feature');
    await fs.writeFile(
      gherkinFile,
      'Feature: User Authentication\n  Background:\n    Given server is running\n  Scenario: Login\n    When user submits credentials\n    Then user is logged in\n'
    );

    const ctxRes = await executor.executeTool('grep_search', {
      query: 'Login',
      context_lines: 2,
      file_pattern: '*.feature',
    });
    assert.equal(ctxRes.returned_matches, 1);
    assert.ok(ctxRes.matches[0].context);
    assert.ok(ctxRes.matches[0].context.length >= 3);
    assert.match(ctxRes.matches[0].content, />>>Login<<</);
  });
});

test('grep_replace batch search and replace with dry_run', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(path.join(workspace, 'a.ts'), 'const oldName = 1;\nconsole.log(oldName);\n');
    await fs.writeFile(path.join(workspace, 'b.ts'), 'export function oldName() { return "oldName"; }\n');

    // Test 1: Dry run preview
    const dryRunRes = await executor.executeTool('grep_replace', {
      query: 'oldName',
      replacement: 'newName',
      dry_run: true,
    });
    assert.equal(dryRunRes.dry_run, true);
    assert.equal(dryRunRes.files_modified, 2);
    assert.equal(dryRunRes.total_replacements, 4);

    // Verify files were not modified during dry run
    assert.match(await fs.readFile(path.join(workspace, 'a.ts'), 'utf-8'), /oldName/);

    // Test 2: Live batch replacement
    const liveRes = await executor.executeTool('grep_replace', {
      query: 'oldName',
      replacement: 'newName',
      dry_run: false,
    });
    assert.equal(liveRes.dry_run, false);
    assert.equal(liveRes.files_modified, 2);
    assert.equal(liveRes.total_replacements, 4);

    // Verify files modified on disk
    assert.match(await fs.readFile(path.join(workspace, 'a.ts'), 'utf-8'), /newName/);
    assert.match(await fs.readFile(path.join(workspace, 'b.ts'), 'utf-8'), /newName/);
  });
});

test('getToolDefinitions generates single schema profile based on complexity level', () => {
  const simpleTools = getToolDefinitions('simple');
  const simpleGrep = simpleTools.find((t) => t.name === 'grep_search');
  assert.ok(simpleGrep);
  assert.ok(simpleGrep.parameters.properties.query);
  assert.ok(simpleGrep.parameters.properties.relative_path);
  assert.equal(simpleGrep.parameters.properties.is_regex, undefined);
  assert.equal(simpleGrep.parameters.properties.whole_word, undefined);
  const deepResearch = simpleTools.find((t) => t.name === 'deep_research');
  assert.deepEqual(Object.keys(deepResearch?.parameters.properties || {}), [
    'query',
    'image_count',
    'search_queries',
    'search_count',
    'page_count',
    'linked_page_count',
    'link_depth',
    'semantic_link_classification',
    'link_relevance_threshold',
    'evidence_char_budget',
    'preset',
  ]);
  assert.equal(deepResearch?.parameters.properties.image_count.minimum, 0);
  assert.equal(deepResearch?.parameters.properties.image_count.maximum, 60);

  const mediumTools = getToolDefinitions('medium');
  const mediumGrep = mediumTools.find((t) => t.name === 'grep_search');
  assert.ok(mediumGrep);
  assert.ok(mediumGrep.parameters.properties.is_regex);
  assert.equal(mediumGrep.parameters.properties.whole_word, undefined);

  const advTools = getToolDefinitions('advanced');
  const advGrep = advTools.find((t) => t.name === 'grep_search');
  assert.ok(advGrep);
  assert.ok(advGrep.parameters.properties.whole_word);
  assert.ok(advGrep.parameters.properties.context_lines);
});

test('apply_patch applies unified diff patch with context matching', async () => {
  await withWorkspace(async (workspace, executor) => {
    const initialContent = 'line 1\nline 2\nconst count = 0;\nline 4\nline 5\n';
    await fs.writeFile(path.join(workspace, 'index.ts'), initialContent);

    const patchText = `@@ -2,3 +2,3 @@
 line 2
-const count = 0;
+const count = 1;
 line 4`;

    const result = await executor.executeTool('apply_patch', {
      relative_path: 'index.ts',
      patch: patchText,
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'index.ts'), 'utf-8');
    assert.equal(updated, 'line 1\nline 2\nconst count = 1;\nline 4\nline 5\n');
  });
});

test('apply_patch handles 4B model artifacts like unescaped newlines and omitted context space prefixes', async () => {
  await withWorkspace(async (workspace, executor) => {
    const initialContent =
      '// Web pages frequently contain modern or malformed CSS that jsdom does not\n// understand. jsdom reports those non-fatal stylesheet failures to the host\n// console by default, sometimes dumping thousands of lines of CSS. Scripts are\n// not executed here, so page console output and CSS parser diagnostics are not\n// part of the reader\'s result and should remain isolated from CLI output.\n';
    await fs.writeFile(path.join(workspace, 'text.txt'), initialContent);

    const patchFrom4BModel =
      '// Web pages frequently contain modern or malformed CSS that jsdom does not\\n// understand. jsdom reports those non-fatal stylesheet failures to the host\\n// console by default, sometimes dumping thousands of lines of CSS. Scripts are\\n// not executed here, so page console output and CSS parser diagnostics are not\\n// part of the reader\'s result and should remain isolated from CLI output.\\n+ // not executed here test edit, so page console output and CSS2 parser diagnostics are not';

    const result = await executor.executeTool('apply_patch', {
      relative_path: 'text.txt',
      patch: patchFrom4BModel,
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'text.txt'), 'utf-8');
    assert.match(updated, /CSS2 parser diagnostics are not/);
  });
});

test('buildPatchFileDiff produces hunk-level context and edit lines instead of replacing the whole file', () => {
  const original = 'line 1\nline 2\nconst count = 0;\nline 4\nline 5\n';
  const patch = `@@ -2,3 +2,3 @@
 line 2
-const count = 0;
+const count = 1;
 line 4`;

  const diff = buildPatchFileDiff('index.ts', original, patch);
  assert.equal(diff.path, 'index.ts');
  const removed = diff.lines.filter((l) => l.type === 'remove');
  const added = diff.lines.filter((l) => l.type === 'add');
  const context = diff.lines.filter((l) => l.type === 'context');

  assert.equal(removed.length, 1);
  assert.equal(removed[0].content, 'const count = 0;');
  assert.equal(added.length, 1);
  assert.equal(added[0].content, 'const count = 1;');
  assert.ok(context.length >= 2);
});

test('buildPatchFileDiff handles multi-hunk patch diffs correctly', () => {
  const original = 'line 1\nfunction foo() {}\nline 3\nline 4\nfunction bar() {}\nline 6\n';
  const patch = `@@ -1,3 +1,3 @@
 line 1
-function foo() {}
+function foo2() {}
 line 3
@@ -4,3 +4,3 @@
 line 4
-function bar() {}
+function bar2() {}
 line 6`;

  const diff = buildPatchFileDiff('web.ts', original, patch);
  const removed = diff.lines.filter((l) => l.type === 'remove');
  const added = diff.lines.filter((l) => l.type === 'add');

  assert.equal(removed.length, 2);
  assert.equal(added.length, 2);
  assert.equal(removed[0].content, 'function foo() {}');
  assert.equal(added[0].content, 'function foo2() {}');
  assert.equal(removed[1].content, 'function bar() {}');
  assert.equal(added[1].content, 'function bar2() {}');
});

test('edit_file unescapes literal \\n in target_text and replacement_text as fallback', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(
      path.join(workspace, 'app.js'),
      'function render() {\n  todoList.innerHTML = filtered.map(t => `\n    <li>${t.text}</li>\n  `).join("");\n}\n'
    );

    const result = await executor.executeTool('edit_file', {
      relative_path: 'app.js',
      target_text: '  todoList.innerHTML = filtered.map(t => `\\n    <li>${t.text}</li>\\n  `).join("");',
      replacement_text: '  todoList.innerHTML = filtered.map(t => `\\n    <li class="item">${t.text}</li>\\n  `).join("");',
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'app.js'), 'utf-8');
    assert.match(updated, /<li class="item">\${t\.text}<\/li>/);
  });
});

test('edit_file falls back to unbounded search if start_line/end_line bounds fail to match', async () => {
  await withWorkspace(async (workspace, executor) => {
    await fs.writeFile(
      path.join(workspace, 'app.js'),
      'line 1\nline 2\nline 3\nline 4\nline 5\nconst target = "hello";\n'
    );

    const result = await executor.executeTool('edit_file', {
      relative_path: 'app.js',
      start_line: 1,
      end_line: 3, // Target is actually at line 6
      target_text: 'const target = "hello";',
      replacement_text: 'const target = "world";',
    });

    assert.equal(result.success, true);
    const updated = await fs.readFile(path.join(workspace, 'app.js'), 'utf-8');
    assert.match(updated, /const target = "world";/);
  });
});





