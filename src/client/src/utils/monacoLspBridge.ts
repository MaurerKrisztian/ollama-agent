/**
 * monacoLspBridge.ts
 * Registers Monaco language providers (hover, completion, go-to-definition,
 * find-references) that proxy to the backend /api/editor/lsp/* endpoints.
 * Call registerLspProviders(monaco, workingDir) once on editor mount.
 */

import type * as Monaco from 'monaco-editor';

const LSP_LANGS = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

async function lspPost(endpoint: string, body: object): Promise<any> {
  const res = await fetch(`/api/editor/lsp/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function monacoPosition(pos: Monaco.Position) {
  return { line: pos.lineNumber, character: pos.column };
}

function getFilePath(model: Monaco.editor.ITextModel, workingDir: string): string {
  const uri = model.uri.toString();
  const prefix = 'file://';
  let absPath = uri.startsWith(prefix) ? uri.slice(prefix.length) : uri;
  try { absPath = decodeURIComponent(absPath); } catch { /* noop */ }
  if (workingDir && absPath.startsWith(workingDir)) {
    return absPath.slice(workingDir.length).replace(/^\//, '');
  }
  return absPath.replace(/^\/+/, '');
}

let registered = false;

export function registerLspProviders(monaco: typeof Monaco, workingDir: string): void {
  if (registered) return;
  registered = true;

  // ── Hover ──────────────────────────────────────────────────────────────────
  monaco.languages.registerHoverProvider(LSP_LANGS, {
    async provideHover(model, position) {
      try {
        const result = await lspPost('hover', {
          path: getFilePath(model, workingDir),
          ...monacoPosition(position),
        });
        if (!result?.success || !result.hover?.contents) return null;
        return {
          contents: [{ value: '```typescript\n' + result.hover.contents + '\n```' }],
        };
      } catch {
        return null;
      }
    },
  });

  // ── Completion ─────────────────────────────────────────────────────────────
  const kindMap: Record<string, Monaco.languages.CompletionItemKind> = {
    Text: monaco.languages.CompletionItemKind.Text,
    Keyword: monaco.languages.CompletionItemKind.Keyword,
    Function: monaco.languages.CompletionItemKind.Function,
    Method: monaco.languages.CompletionItemKind.Method,
    Property: monaco.languages.CompletionItemKind.Property,
    Field: monaco.languages.CompletionItemKind.Field,
    Variable: monaco.languages.CompletionItemKind.Variable,
    Class: monaco.languages.CompletionItemKind.Class,
    Interface: monaco.languages.CompletionItemKind.Interface,
    Module: monaco.languages.CompletionItemKind.Module,
    TypeParameter: monaco.languages.CompletionItemKind.TypeParameter,
    Enum: monaco.languages.CompletionItemKind.Enum,
    EnumMember: monaco.languages.CompletionItemKind.EnumMember,
    Constructor: monaco.languages.CompletionItemKind.Constructor,
    Snippet: monaco.languages.CompletionItemKind.Snippet,
  };

  monaco.languages.registerCompletionItemProvider(LSP_LANGS, {
    triggerCharacters: ['.', '(', '<', '"', "'", '/', '@'],
    async provideCompletionItems(model, position) {
      try {
        const result = await lspPost('completion', {
          path: getFilePath(model, workingDir),
          ...monacoPosition(position),
        });
        if (!result?.success || !result.items) return { suggestions: [] };
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
        const suggestions: Monaco.languages.CompletionItem[] = result.items.map((item: any) => ({
          label: item.label,
          kind: kindMap[item.kind] ?? monaco.languages.CompletionItemKind.Text,
          detail: item.detail,
          insertText: item.insertText ?? item.label,
          sortText: item.sortText,
          range,
        }));
        return { suggestions };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  // ── Go-to-definition ───────────────────────────────────────────────────────
  monaco.languages.registerDefinitionProvider(LSP_LANGS, {
    async provideDefinition(model, position) {
      try {
        const result = await lspPost('definition', {
          path: getFilePath(model, workingDir),
          ...monacoPosition(position),
        });
        if (!result?.success || !result.definitions?.length) return null;
        return result.definitions.map((def: any) => ({
          uri: monaco.Uri.file(workingDir + '/' + def.filePath),
          range: {
            startLineNumber: def.line,
            startColumn: def.character,
            endLineNumber: def.line,
            endColumn: def.character + 1,
          },
        }));
      } catch {
        return null;
      }
    },
  });

  // ── Find references ────────────────────────────────────────────────────────
  monaco.languages.registerReferenceProvider(LSP_LANGS, {
    async provideReferences(model, position) {
      try {
        const result = await lspPost('references', {
          path: getFilePath(model, workingDir),
          ...monacoPosition(position),
        });
        if (!result?.success || !result.references?.length) return [];
        return result.references.map((ref: any) => ({
          uri: monaco.Uri.file(workingDir + '/' + ref.filePath),
          range: {
            startLineNumber: ref.line,
            startColumn: ref.character,
            endLineNumber: ref.line,
            endColumn: ref.character + 1,
          },
        }));
      } catch {
        return [];
      }
    },
  });
}

/** Reset the registration flag (useful for HMR in dev). */
export function resetLspRegistration(): void {
  registered = false;
}
