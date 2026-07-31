import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { LspManager } from './lsp.js';

test('LspManager AST & LSP tools', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lsp-test-'));
  const testFile = path.join(tmpDir, 'sample.ts');
  const fileContent = `
export interface User {
  id: string;
  name: string;
}

export function getUserName(user: User): string {
  return user.name;
}

const currentUser: User = { id: '1', name: 'Alice' };
getUserName(currentUser);
`;
  await fs.writeFile(testFile, fileContent, 'utf-8');

  const lsp = new LspManager(tmpDir);

  await t.test('getDocumentSymbols', () => {
    const res = lsp.getDocumentSymbols('sample.ts');
    assert.equal(res.success, true);
    assert.ok(res.symbols);
    const names = res.symbols.map((s) => s.name);
    assert.ok(names.includes('User'));
    assert.ok(names.includes('getUserName'));
  });

  await t.test('getDefinition', () => {
    // Line 12, column 5 is getUserName call target definition
    const res = lsp.getDefinition('sample.ts', 12, 5);
    assert.equal(res.success, true);
    assert.ok(res.definitions);
    assert.ok(res.definitions.length > 0);
  });

  await t.test('findReferences', () => {
    // Line 7, column 17 is getUserName function declaration
    const res = lsp.findReferences('sample.ts', 7, 17);
    assert.equal(res.success, true);
    assert.ok(res.references);
    assert.ok(res.references.length >= 2);
  });

  await t.test('getDiagnostics', () => {
    const res = lsp.getDiagnostics('sample.ts');
    assert.equal(res.success, true);
    assert.ok(res.diagnostics);
  });

  await t.test('getHover', () => {
    // Line 7, column 17 is getUserName
    const res = lsp.getHover('sample.ts', 7, 17);
    assert.equal(res.success, true);
    assert.ok(res.hover);
    assert.ok(res.hover.contents.includes('getUserName'));
  });

  await t.test('getModuleDependencies', async () => {
    const depFile = path.join(tmpDir, 'consumer.ts');
    await fs.writeFile(depFile, `import { User, getUserName } from './sample';\ngetUserName({ id: '2', name: 'Bob' });\n`, 'utf-8');

    const res = lsp.getModuleDependencies('sample.ts');
    assert.equal(res.success, true);
    assert.ok(res.dependencies);
    assert.equal(res.dependencies.file, 'sample.ts');
    assert.ok(res.dependencies.exports.includes('User'));
    assert.ok(res.dependencies.exports.includes('getUserName'));
    assert.ok(res.dependencies.imported_by.includes('consumer.ts'));
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});
