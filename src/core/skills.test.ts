import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildSelectedSkillPrompt,
  formatProjectSkillList,
  listProjectSkills,
  loadProjectSkill,
  parseSkillCommand,
} from './skills.js';

async function writeSkill(root: string, base: '.agent' | '.agents', folder: string, document: string) {
  const directory = path.join(root, base, 'skills', folder);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'SKILL.md'), document);
}

test('project skill registry validates metadata and applies directory precedence', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-skills-'));
  try {
    const primary = '---\nname: verify-sources\ndescription: Primary workflow.\n---\n\nPrimary instructions.\n';
    const fallback = '---\nname: verify-sources\ndescription: Fallback workflow.\n---\n\nFallback instructions.\n';
    await writeSkill(workspace, '.agent', 'verify-sources', primary);
    await writeSkill(workspace, '.agents', 'verify-sources', fallback);
    await writeSkill(workspace, '.agent', 'wrong-folder', '---\nname: another-name\ndescription: Invalid.\n---\n');
    await writeSkill(workspace, '.agent', 'missing-description', '---\nname: missing-description\n---\n');

    const skills = await listProjectSkills(workspace, { includeBundled: false });
    assert.deepEqual(skills, [{
      name: 'verify-sources',
      description: 'Primary workflow.',
      path: '.agent/skills/verify-sources/SKILL.md',
    }]);

    const loaded = await loadProjectSkill(workspace, 'verify-sources', { includeBundled: false });
    assert.equal(loaded?.instructions, primary);
    assert.equal(await loadProjectSkill(workspace, '../verify-sources'), null);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('bundled skills remain available outside the application workspace and workspace skills override them', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-workspace-'));
  const application = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-bundled-'));
  try {
    const bundled = '---\nname: research-official-sources\ndescription: Bundled workflow.\n---\n\nBundled instructions.\n';
    await writeSkill(application, '.agent', 'research-official-sources', bundled);

    const bundledList = await listProjectSkills(workspace, { bundledRoot: application });
    assert.deepEqual(bundledList, [{
      name: 'research-official-sources',
      description: 'Bundled workflow.',
      path: 'bundled:.agent/skills/research-official-sources/SKILL.md',
    }]);
    assert.equal(
      (await loadProjectSkill(workspace, 'research-official-sources', { bundledRoot: application }))?.instructions,
      bundled
    );

    const workspaceVersion = '---\nname: research-official-sources\ndescription: Workspace workflow.\n---\n\nWorkspace instructions.\n';
    await writeSkill(workspace, '.agent', 'research-official-sources', workspaceVersion);
    const overridden = await loadProjectSkill(workspace, 'research-official-sources', {
      bundledRoot: application,
    });
    assert.equal(overridden?.description, 'Workspace workflow.');
    assert.equal(overridden?.instructions, workspaceVersion);
    assert.equal(overridden?.path, '.agent/skills/research-official-sources/SKILL.md');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.rm(application, { recursive: true, force: true });
  }
});

test('skill slash commands parse listing and explicit invocation', () => {
  assert.deepEqual(parseSkillCommand('/skills'), { kind: 'list' });
  assert.deepEqual(parseSkillCommand('/skill VERIFY-SOURCES Check this price'), {
    kind: 'invoke',
    name: 'verify-sources',
    request: 'Check this price',
  });
  assert.deepEqual(parseSkillCommand('/skill verify-sources'), {
    kind: 'invalid',
    error: 'Usage: /skill <name> <request>',
  });
  assert.deepEqual(parseSkillCommand('ordinary request'), { kind: 'none' });
});

test('skill formatting provides discoverable usage and bounded prompt framing', () => {
  const skill = {
    name: 'verify-sources',
    description: 'Verify claims.',
    path: '.agent/skills/verify-sources/SKILL.md',
    instructions: '---\nname: verify-sources\ndescription: Verify claims.\n---\n\nUse official pages.',
  };
  assert.match(formatProjectSkillList([skill]), /\/skill <name> <request>/);
  const prompt = buildSelectedSkillPrompt(skill);
  assert.match(prompt, /Explicitly selected skill: verify-sources/);
  assert.match(prompt, /Use official pages\./);
});
