import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import {
  LspSymbolInformation,
  LspLocation,
  LspDiagnosticItem,
  LspHoverInformation,
} from './types.js';

export class LspManager {
  private workingDir: string;
  private service: ts.LanguageService | null = null;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = path.resolve(workingDir);
    this.initService();
  }

  public updateWorkingDir(dir: string): void {
    this.workingDir = path.resolve(dir);
    this.initService();
  }

  private initService(): void {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowJs: true,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    };

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => {
        try {
          return this.getProjectFiles(this.workingDir);
        } catch {
          return [];
        }
      },
      getScriptVersion: (fileName) => {
        try {
          const stat = fs.statSync(fileName);
          return stat.mtimeMs.toString();
        } catch {
          return '0';
        }
      },
      getScriptSnapshot: (fileName) => {
        if (!fs.existsSync(fileName)) return undefined;
        try {
          const content = fs.readFileSync(fileName, 'utf-8');
          return ts.ScriptSnapshot.fromString(content);
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => this.workingDir,
      getCompilationSettings: () => options,
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  private getProjectFiles(dir: string, maxFiles = 300): string[] {
    const files: string[] = [];
    const walk = (currentDir: string) => {
      if (files.length >= maxFiles) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/i.test(entry.name)) {
          files.push(fullPath);
        }
      }
    };
    walk(dir);
    return files;
  }

  private resolvePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(this.workingDir, filePath);
  }

  public getDocumentSymbols(filePath: string): { success: boolean; symbols?: LspSymbolInformation[]; error?: string } {
    const absPath = this.resolvePath(filePath);
    if (!fs.existsSync(absPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    try {
      const code = fs.readFileSync(absPath, 'utf-8');
      const sourceFile = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true);
      const symbols: LspSymbolInformation[] = [];

      const visit = (node: ts.Node, containerName?: string) => {
        let name = '';
        let kind = '';

        if (ts.isFunctionDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'Function';
        } else if (ts.isClassDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'Class';
        } else if (ts.isInterfaceDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'Interface';
        } else if (ts.isTypeAliasDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'TypeAlias';
        } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
          name = node.name.text;
          kind = 'Method';
        } else if (ts.isPropertyDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
          name = node.name.text;
          kind = 'Property';
        } else if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              const start = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile));
              const end = sourceFile.getLineAndCharacterOfPosition(decl.getEnd());
              symbols.push({
                name: decl.name.text,
                kind: 'Variable',
                containerName,
                line: start.line + 1,
                character: start.character + 1,
                endLine: end.line + 1,
                endCharacter: end.character + 1,
              });
            }
          }
        }

        if (name && kind) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
          symbols.push({
            name,
            kind,
            containerName,
            line: start.line + 1,
            character: start.character + 1,
            endLine: end.line + 1,
            endCharacter: end.character + 1,
          });
        }

        const nextContainer = name || containerName;
        ts.forEachChild(node, (child) => visit(child, nextContainer));
      };

      visit(sourceFile);
      return { success: true, symbols };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getDefinition(filePath: string, line: number, character: number): { success: boolean; definitions?: LspLocation[]; error?: string } {
    if (!this.service) return { success: false, error: 'LSP service unavailable' };
    const absPath = this.resolvePath(filePath);
    if (!fs.existsSync(absPath)) return { success: false, error: `File not found: ${filePath}` };

    try {
      const code = fs.readFileSync(absPath, 'utf-8');
      const sourceFile = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true);
      const pos = ts.getPositionOfLineAndCharacter(sourceFile, Math.max(0, line - 1), Math.max(0, character - 1));

      let defs = this.service.getDefinitionAndBoundSpan(absPath, pos);
      let foundDefs = defs?.definitions || [];

      if (foundDefs.length === 0) {
        let targetIdentifier = '';
        const findId = (node: ts.Node) => {
          if (ts.isIdentifier(node) && pos >= node.getStart(sourceFile) && pos <= node.getEnd()) {
            targetIdentifier = node.text;
          }
          ts.forEachChild(node, findId);
        };
        findId(sourceFile);

        if (targetIdentifier) {
          const fallbackLocs: LspLocation[] = [];
          const findDecl = (node: ts.Node) => {
            let declName = '';
            if (
              (ts.isFunctionDeclaration(node) ||
                ts.isClassDeclaration(node) ||
                ts.isInterfaceDeclaration(node) ||
                ts.isTypeAliasDeclaration(node)) &&
              node.name
            ) {
              declName = node.name.text;
            } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
              declName = node.name.text;
            }

            if (declName === targetIdentifier) {
              const lc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
              const lines = code.split('\n');
              fallbackLocs.push({
                filePath: path.relative(this.workingDir, absPath) || absPath,
                line: lc.line + 1,
                character: lc.character + 1,
                preview: lines[lc.line]?.trim() || '',
              });
            }
            ts.forEachChild(node, findDecl);
          };
          findDecl(sourceFile);
          if (fallbackLocs.length > 0) return { success: true, definitions: fallbackLocs };
        }

        return { success: true, definitions: [] };
      }

      const locations: LspLocation[] = foundDefs.map((def) => {
        const defFile = def.fileName;
        let preview = '';
        let defLine = 1;
        let defChar = 1;

        if (fs.existsSync(defFile)) {
          const defCode = fs.readFileSync(defFile, 'utf-8');
          const defSource = ts.createSourceFile(defFile, defCode, ts.ScriptTarget.Latest, true);
          const lc = defSource.getLineAndCharacterOfPosition(def.textSpan.start);
          defLine = lc.line + 1;
          defChar = lc.character + 1;
          const lines = defCode.split('\n');
          preview = lines[lc.line]?.trim() || '';
        }

        return {
          filePath: path.relative(this.workingDir, defFile) || defFile,
          line: defLine,
          character: defChar,
          preview,
        };
      });

      return { success: true, definitions: locations };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public findReferences(filePath: string, line: number, character: number): { success: boolean; references?: LspLocation[]; error?: string } {
    if (!this.service) return { success: false, error: 'LSP service unavailable' };
    const absPath = this.resolvePath(filePath);
    if (!fs.existsSync(absPath)) return { success: false, error: `File not found: ${filePath}` };

    try {
      const code = fs.readFileSync(absPath, 'utf-8');
      const sourceFile = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true);
      const pos = ts.getPositionOfLineAndCharacter(sourceFile, Math.max(0, line - 1), Math.max(0, character - 1));

      const refs = this.service.getReferencesAtPosition(absPath, pos);
      if (!refs || refs.length === 0) {
        return { success: true, references: [] };
      }

      const locations: LspLocation[] = refs.map((ref) => {
        const refFile = ref.fileName;
        let preview = '';
        let refLine = 1;
        let refChar = 1;

        if (fs.existsSync(refFile)) {
          const refCode = fs.readFileSync(refFile, 'utf-8');
          const refSource = ts.createSourceFile(refFile, refCode, ts.ScriptTarget.Latest, true);
          const lc = refSource.getLineAndCharacterOfPosition(ref.textSpan.start);
          refLine = lc.line + 1;
          refChar = lc.character + 1;
          const lines = refCode.split('\n');
          preview = lines[lc.line]?.trim() || '';
        }

        return {
          filePath: path.relative(this.workingDir, refFile) || refFile,
          line: refLine,
          character: refChar,
          preview,
        };
      });

      return { success: true, references: locations };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getDiagnostics(filePath?: string): { success: boolean; diagnostics?: LspDiagnosticItem[]; error?: string } {
    if (!this.service) return { success: false, error: 'LSP service unavailable' };

    try {
      const targetFiles = filePath
        ? [this.resolvePath(filePath)]
        : this.getProjectFiles(this.workingDir, 50);

      const items: LspDiagnosticItem[] = [];

      for (const file of targetFiles) {
        if (!fs.existsSync(file)) continue;
        const syntactic = this.service.getSyntacticDiagnostics(file);
        const semantic = this.service.getSemanticDiagnostics(file);
        const allDiags = [...syntactic, ...semantic];

        const code = fs.readFileSync(file, 'utf-8');
        const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

        for (const diag of allDiags) {
          let line = 1;
          let character = 1;
          if (diag.file && diag.start !== undefined) {
            const lc = sourceFile.getLineAndCharacterOfPosition(diag.start);
            line = lc.line + 1;
            character = lc.character + 1;
          }

          let severity: LspDiagnosticItem['severity'] = 'error';
          if (diag.category === ts.DiagnosticCategory.Warning) severity = 'warning';
          else if (diag.category === ts.DiagnosticCategory.Message) severity = 'info';
          else if (diag.category === ts.DiagnosticCategory.Suggestion) severity = 'hint';

          items.push({
            filePath: path.relative(this.workingDir, file) || file,
            line,
            character,
            severity,
            message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
            code: diag.code,
          });
        }
      }

      return { success: true, diagnostics: items };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getHover(filePath: string, line: number, character: number): { success: boolean; hover?: LspHoverInformation; error?: string } {
    if (!this.service) return { success: false, error: 'LSP service unavailable' };
    const absPath = this.resolvePath(filePath);
    if (!fs.existsSync(absPath)) return { success: false, error: `File not found: ${filePath}` };

    try {
      const code = fs.readFileSync(absPath, 'utf-8');
      const sourceFile = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true);
      const pos = ts.getPositionOfLineAndCharacter(sourceFile, Math.max(0, line - 1), Math.max(0, character - 1));

      const info = this.service.getQuickInfoAtPosition(absPath, pos);
      if (!info) {
        return { success: true, hover: { contents: 'No hover information available.', line, character } };
      }

      const display = ts.displayPartsToString(info.displayParts || []);
      const documentation = ts.displayPartsToString(info.documentation || []);
      const contents = [display, documentation].filter(Boolean).join('\n\n');

      return {
        success: true,
        hover: {
          contents,
          line,
          character,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
