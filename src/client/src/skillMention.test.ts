import assert from 'node:assert/strict';
import test from 'node:test';
import { findActiveSkillMention } from './skillMention.js';

test('standalone @ opens skill autocomplete and email-like text does not', () => {
  assert.deepEqual(findActiveSkillMention('@', 1), { start: 0, end: 1, query: '' });
  assert.deepEqual(findActiveSkillMention('Please use @skill:rese', 22), {
    start: 11,
    end: 22,
    query: 'rese',
  });
  assert.equal(findActiveSkillMention('Email k@gmail.com', 17), null);
  assert.equal(findActiveSkillMention('Email k@', 8), null);
});
