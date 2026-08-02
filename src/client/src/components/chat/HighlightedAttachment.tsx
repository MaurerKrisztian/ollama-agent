import React from 'react';
import { TextAttachment } from '../../types';

export const EXTENSION_LANGUAGES: Record<string, { label: string; color: string; keywords: string[] }> = {
  js: { label: 'JavaScript', color: '#f7df1e', keywords: ['const', 'let', 'var', 'function', 'return', 'async', 'await', 'if', 'else', 'for', 'while', 'class', 'new', 'import', 'export', 'from', 'default', 'throw', 'try', 'catch', 'true', 'false', 'null', 'undefined'] },
  jsx: { label: 'JSX', color: '#61dafb', keywords: ['const', 'let', 'function', 'return', 'async', 'await', 'if', 'else', 'class', 'new', 'import', 'export', 'from', 'default', 'true', 'false', 'null'] },
  ts: { label: 'TypeScript', color: '#3178c6', keywords: ['const', 'let', 'function', 'return', 'async', 'await', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'extends', 'implements', 'new', 'import', 'export', 'from', 'default', 'public', 'private', 'readonly', 'string', 'number', 'boolean', 'unknown', 'any', 'true', 'false', 'null', 'undefined'] },
  tsx: { label: 'TSX', color: '#3178c6', keywords: ['const', 'let', 'function', 'return', 'async', 'await', 'if', 'else', 'class', 'interface', 'type', 'extends', 'import', 'export', 'from', 'default', 'string', 'number', 'boolean', 'true', 'false', 'null'] },
  py: { label: 'Python', color: '#3776ab', keywords: ['def', 'return', 'async', 'await', 'if', 'elif', 'else', 'for', 'while', 'class', 'from', 'import', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'in', 'is', 'and', 'or', 'not', 'True', 'False', 'None'] },
  json: { label: 'JSON', color: '#facc15', keywords: ['true', 'false', 'null'] },
  css: { label: 'CSS', color: '#663399', keywords: ['var', 'calc', 'inherit', 'initial', 'unset', 'transparent', 'important'] },
  html: { label: 'HTML', color: '#e34f26', keywords: ['doctype', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class', 'id'] },
  htm: { label: 'HTML', color: '#e34f26', keywords: ['doctype', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class', 'id'] },
  md: { label: 'Markdown', color: '#60a5fa', keywords: [] },
  sql: { label: 'SQL', color: '#e38c00', keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'JOIN', 'ON', 'AS', 'AND', 'OR', 'NULL', 'VALUES', 'GROUP', 'ORDER', 'BY', 'LIMIT'] },
  sh: { label: 'Shell', color: '#4eaa25', keywords: ['if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'in', 'export'] },
  bash: { label: 'Bash', color: '#4eaa25', keywords: ['if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'in', 'export'] },
  yaml: { label: 'YAML', color: '#cb171e', keywords: ['true', 'false', 'null'] },
  yml: { label: 'YAML', color: '#cb171e', keywords: ['true', 'false', 'null'] },
  xml: { label: 'XML', color: '#f97316', keywords: [] },
};

export const getAttachmentLanguage = (name: string) => {
  const extension = name.toLowerCase().split('.').pop() || '';
  return EXTENSION_LANGUAGES[extension] || { label: extension ? extension.toUpperCase() : 'Text', color: '#94a3b8', keywords: [] };
};

export const HighlightedAttachment: React.FC<{ file: TextAttachment }> = ({ file }) => {
  const language = getAttachmentLanguage(file.name);
  const keywords = new Set(language.keywords.map((keyword) => keyword.toLowerCase()));
  const tokenPattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|<!--[\s\S]*?-->|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of file.content.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(file.content.slice(lastIndex, index));
    const token = match[0];
    let color: string | undefined;
    if (/^(?:\/[/*]|#|<!--)/.test(token)) color = '#64748b';
    else if (/^["'`]/.test(token)) color = '#86efac';
    else if (/^\d/.test(token)) color = '#fbbf24';
    else if (keywords.has(token.toLowerCase())) color = '#c084fc';
    nodes.push(color ? <span key={`${index}-${token.length}`} style={{ color }}>{token}</span> : token);
    lastIndex = index + token.length;
  }
  if (lastIndex < file.content.length) nodes.push(file.content.slice(lastIndex));
  return <>{nodes}</>;
};
