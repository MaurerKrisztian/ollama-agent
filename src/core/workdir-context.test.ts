import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildWorkingDirectoryContext } from './workdir-context.js';

test('working directory context includes project files, package info, and agent instructions', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-context-'));
  try {
    await fs.mkdir(path.join(workspace, '.agent'));
    await fs.mkdir(path.join(workspace, '.agent', 'skills', 'release-helper'), { recursive: true });
    await fs.mkdir(path.join(workspace, 'src'));
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'demo-project', version: '1.2.3', scripts: { test: 'node --test' } })
    );
    await fs.writeFile(path.join(workspace, 'src', 'index.ts'), 'export {};\n');
    await fs.writeFile(path.join(workspace, '.agent', 'AGENTS.md'), 'Use TypeScript.\n');
    await fs.writeFile(
      path.join(workspace, '.agent', 'skills', 'release-helper', 'SKILL.md'),
      '---\nname: release-helper\ndescription: Prepare and verify project releases.\n---\n\n# Release workflow\n'
    );

    const context = await buildWorkingDirectoryContext(workspace);

    assert.match(context, new RegExp(`Working directory: ${workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(context, /Node package: name=demo-project; version=1\.2\.3; scripts=test/);
    assert.match(context, /- src\/index\.ts/);
    assert.match(context, /Project instructions from \.agent\/AGENTS\.md/);
    assert.match(context, /complete project instructions are already included/);
    assert.match(context, /Use TypeScript\./);
    assert.match(context, /Available project skills from \.agent\/skills/);
    assert.match(context, /release-helper: Prepare and verify project releases\./);
    assert.match(context, /instructions: \.agent\/skills\/release-helper\/SKILL\.md/);
    assert.doesNotMatch(context, /# Release workflow/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
