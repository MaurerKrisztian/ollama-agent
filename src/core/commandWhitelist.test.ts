import test from 'node:test';
import assert from 'node:assert/strict';
import { isCommandWhitelisted, normalizeCommandName } from './commandWhitelist.js';

test('normalizeCommandName cleans up binary names', () => {
  assert.equal(normalizeCommandName('ls'), 'ls');
  assert.equal(normalizeCommandName('/usr/bin/ls'), 'ls');
  assert.equal(normalizeCommandName('./select-reader'), 'select-reader');
  assert.equal(normalizeCommandName('select-reader.exe'), 'select-reader');
  assert.equal(normalizeCommandName('  "PWD"  '), 'pwd');
});

test('isCommandWhitelisted matches simple single commands', () => {
  const whitelist = ['ls', 'pwd', 'select-reader'];

  assert.equal(isCommandWhitelisted('ls', whitelist), true);
  assert.equal(isCommandWhitelisted('ls -la /tmp', whitelist), true);
  assert.equal(isCommandWhitelisted('pwd', whitelist), true);
  assert.equal(isCommandWhitelisted('select-reader "some text with spaces"', whitelist), true);
  assert.equal(isCommandWhitelisted('rm file.txt', whitelist), false);
  assert.equal(isCommandWhitelisted('cat README.md', whitelist), false);
});

test('isCommandWhitelisted handles environment variable prefixes', () => {
  const whitelist = ['ls', 'select-reader'];

  assert.equal(isCommandWhitelisted('FOO=bar BAR=baz select-reader "text"', whitelist), true);
  assert.equal(isCommandWhitelisted('ENV=prod ls -l', whitelist), true);
  assert.equal(isCommandWhitelisted('ENV=prod rm -rf /', whitelist), false);
});

test('isCommandWhitelisted verifies multipart commands safely', () => {
  const whitelist = ['ls', 'pwd', 'select-reader'];

  // All parts whitelisted
  assert.equal(isCommandWhitelisted('ls && pwd', whitelist), true);
  assert.equal(isCommandWhitelisted('select-reader "hello" ; pwd', whitelist), true);
  assert.equal(isCommandWhitelisted('select-reader "first" | select-reader "second"', whitelist), true);

  // Mixed whitelisted and unwhitelisted
  assert.equal(isCommandWhitelisted('select-reader "text" && rm file', whitelist), false);
  assert.equal(isCommandWhitelisted('cat file | select-reader "text"', whitelist), false);
  assert.equal(isCommandWhitelisted('ls; touch test.txt', whitelist), false);
  assert.equal(isCommandWhitelisted('pwd || echo done', whitelist), false);
});

test('isCommandWhitelisted ignores operators inside quotes', () => {
  const whitelist = ['select-reader', 'ls'];

  // Quotation contains operator symbols like ;, &&, |, newline
  assert.equal(
    isCommandWhitelisted('select-reader "This is text with ; and && and | inside"', whitelist),
    true
  );
  assert.equal(
    isCommandWhitelisted("select-reader 'Text with && and ; and rm file'", whitelist),
    true
  );
});

test('isCommandWhitelisted detects subshells', () => {
  const whitelist = ['ls', 'pwd', 'select-reader'];

  // Whitelisted subshell
  assert.equal(isCommandWhitelisted('select-reader $(pwd)', whitelist), true);
  assert.equal(isCommandWhitelisted('ls `pwd`', whitelist), true);

  // Unwhitelisted subshell
  assert.equal(isCommandWhitelisted('select-reader $(cat file)', whitelist), false);
  assert.equal(isCommandWhitelisted('ls `rm file`', whitelist), false);
});
