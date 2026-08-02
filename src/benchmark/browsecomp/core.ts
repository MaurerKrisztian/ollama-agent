import { createHash } from 'node:crypto';

export const BROWSECOMP_DATASET_URL =
  'https://openaipublic.blob.core.windows.net/simple-evals/browse_comp_test_set.csv';

export const BROWSECOMP_QUERY_TEMPLATE = `
{Question}

Your response should be in the following format:

Explanation: {your explanation for your final answer}

Exact Answer: {your succinct, final answer}

Confidence: {your confidence score between 0% and 100% for your answer}
`.trim();

export const BROWSECOMP_GRADER_TEMPLATE = `
Judge whether the following [response] to [question] is correct or not based on the precise and unambiguous [correct_answer] below.

[question]: {question}

[response]: {response}

Your judgement must be in the format and criteria specified below:
extracted_final_answer: The final exact answer extracted from the [response]. Put the extracted answer as 'None' if there is no exact, final answer to extract from the response.

[correct_answer]: {correct_answer}
reasoning: Explain why the extracted_final_answer is correct or incorrect based on [correct_answer], focusing only on if there are meaningful differences between [correct_answer] and the extracted_final_answer. Do not comment on any background to the problem, do not attempt to solve the problem, do not argue for any answer different than [correct_answer], focus only on whether the answers match.
correct: Answer 'yes' if extracted_final_answer matches the [correct_answer] given above, or is within a small margin of error for numerical problems. Answer 'no' otherwise, i.e. if there is any inconsistency, ambiguity, non-equivalency, or if the extracted answer is incorrect.

confidence: The extracted confidence score between 0% and 100% from [response]. Put 100 if there is no confidence score available.
`.trim();

export interface BrowseCompEncryptedRow {
  problem: string;
  answer: string;
  canary: string;
}

export function parseCsv(input: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('Invalid CSV: unterminated quoted field.');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1)
    .filter((values) => values.some((value) => value.length > 0))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function deriveKey(password: string, length: number): Buffer {
  const digest = createHash('sha256').update(password).digest();
  const key = Buffer.alloc(length);
  for (let index = 0; index < length; index++) key[index] = digest[index % digest.length];
  return key;
}

export function decryptBrowseComp(ciphertextBase64: string, password: string): string {
  const encrypted = Buffer.from(ciphertextBase64, 'base64');
  const key = deriveKey(password, encrypted.length);
  const decrypted = Buffer.alloc(encrypted.length);
  for (let index = 0; index < encrypted.length; index++) {
    decrypted[index] = encrypted[index] ^ key[index];
  }
  return decrypted.toString('utf8');
}

export function readBrowseCompRows(csv: string): BrowseCompEncryptedRow[] {
  return parseCsv(csv).map((row, index) => {
    if (!row.problem || !row.answer || !row.canary) {
      throw new Error(`BrowseComp CSV row ${index + 2} is missing problem, answer, or canary.`);
    }
    return { problem: row.problem, answer: row.answer, canary: row.canary };
  });
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectBrowseCompIndices(total: number, count: number, seed: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > total) {
    throw new Error(`count must be an integer from 1 to ${total}.`);
  }
  const indices = Array.from({ length: total }, (_, index) => index);
  const random = seededRandom(seed);
  for (let index = indices.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [indices[index], indices[other]] = [indices[other], indices[index]];
  }
  return indices.slice(0, count);
}

export function buildBrowseCompPrompt(question: string, useDeepResearch = true): string {
  const browsingInstruction = useDeepResearch
    ? 'Research the public web deeply and persistently to solve this benchmark question. Use the deep_research tool before answering.'
    : 'Search the public web deeply and persistently to solve this benchmark question. Use web_search repeatedly, open promising results with read_web_page, and verify the final answer from inspected pages.';
  return `${browsingInstruction}\n\n${BROWSECOMP_QUERY_TEMPLATE.replace('{Question}', question)}`;
}

export function buildBrowseCompGraderPrompt(question: string, correctAnswer: string, response: string): string {
  return BROWSECOMP_GRADER_TEMPLATE
    .replace('{question}', question)
    .replace('{response}', response)
    .replaceAll('{correct_answer}', correctAnswer);
}

export function parseBrowseCompGrade(response: string): boolean | null {
  const match = response.match(/(?:^|\n)\s*correct:\s*(yes|no)\b/i);
  return match ? match[1].toLowerCase() === 'yes' : null;
}

export function questionHash(question: string): string {
  return createHash('sha256').update(question).digest('hex');
}
