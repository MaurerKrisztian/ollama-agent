export const DEFAULT_COMMAND_WHITELIST = [
  'ls',
  'pwd',
  'dir',
  'cd',
  'tree',
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'find',
  'wc',
  'diff',
  'cmp',
  'file',
  'stat',
  'du',
  'df',
  'awk',
  'sed',
  'sort',
  'uniq',
  'cut',
  'tr',
  'tee',
  'jq',
  'yq',
  'bat',
  'echo',
  'printf',
  'whoami',
  'id',
  'hostname',
  'uname',
  'uptime',
  'date',
  'which',
  'whereis',
  'type',
  'env',
  'printenv',
  'ps',
  'top',
  'htop',
  'free',
  'lscpu',
  'lsusb',
  'lspci',
];


/**
 * Normalizes a command/binary name for matching against whitelist.
 * E.g. '/usr/bin/ls' -> 'ls', 'select-reader.exe' -> 'select-reader', '  PWD  ' -> 'pwd'
 */
export function normalizeCommandName(name: string): string {
  let clean = name.trim();
  // Strip quotes if present
  clean = clean.replace(/^['"]|['"]$/g, '');
  // Extract basename from path (/usr/bin/ls -> ls, .\script.sh -> script.sh)
  clean = clean.split(/[\/\\]/).pop() || clean;
  // Strip Windows executable extension (.exe, .cmd, .bat) if present
  clean = clean.replace(/\.(exe|cmd|bat)$/i, '');
  return clean.toLowerCase();
}

/**
 * Parses a shell command string into individual statements and extracts subshells $(...) or `...`.
 * Handles single quotes (which suppress subshells and operator splitting) and double quotes.
 */
export function parseCommandStatements(commandStr: string): { statements: string[]; subshells: string[] } {
  const statements: string[] = [];
  const subshells: string[] = [];

  let currentStmt = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let isEscaped = false;

  let i = 0;
  while (i < commandStr.length) {
    const char = commandStr[i];

    if (isEscaped) {
      currentStmt += char;
      isEscaped = false;
      i++;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      isEscaped = true;
      currentStmt += char;
      i++;
      continue;
    }

    // Toggle quotes
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentStmt += char;
      i++;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentStmt += char;
      i++;
      continue;
    }

    // Subshell extraction: $(...) and `...` (active unless inside single quotes)
    if (!inSingleQuote) {
      // Check for $(...)
      if (char === '$' && commandStr[i + 1] === '(') {
        let depth = 1;
        let j = i + 2;
        let subContent = '';
        let subInSQ = false;
        let subInDQ = false;
        let subEsc = false;

        while (j < commandStr.length && depth > 0) {
          const subChar = commandStr[j];
          if (subEsc) {
            subContent += subChar;
            subEsc = false;
            j++;
            continue;
          }
          if (subChar === '\\' && !subInSQ) {
            subEsc = true;
            subContent += subChar;
            j++;
            continue;
          }
          if (subChar === "'" && !subInDQ) {
            subInSQ = !subInSQ;
          } else if (subChar === '"' && !subInSQ) {
            subInDQ = !subInSQ;
          } else if (!subInSQ && !subInDQ) {
            if (subChar === '(') depth++;
            else if (subChar === ')') depth--;
          }
          if (depth > 0) {
            subContent += subChar;
          }
          j++;
        }

        if (depth === 0) {
          subshells.push(subContent);
          currentStmt += ' __SUBSHELL__ ';
          i = j;
          continue;
        }
      }

      // Check for backticks `...`
      if (char === '`') {
        let j = i + 1;
        let subContent = '';
        let subEsc = false;
        while (j < commandStr.length) {
          const subChar = commandStr[j];
          if (subEsc) {
            subContent += subChar;
            subEsc = false;
            j++;
            continue;
          }
          if (subChar === '\\') {
            subEsc = true;
            j++;
            continue;
          }
          if (subChar === '`') {
            break;
          }
          subContent += subChar;
          j++;
        }
        if (j < commandStr.length && commandStr[j] === '`') {
          subshells.push(subContent);
          currentStmt += ' __SUBSHELL__ ';
          i = j + 1;
          continue;
        }
      }
    }

    // Command operator splitting: ;, &&, ||, &, |, \n (only outside quotes)
    if (!inSingleQuote && !inDoubleQuote) {
      if (
        char === ';' ||
        char === '\n' ||
        (char === '&' && commandStr[i + 1] === '&') ||
        (char === '|' && commandStr[i + 1] === '|') ||
        (char === '|' && commandStr[i + 1] === '&') ||
        char === '&' ||
        char === '|'
      ) {
        if (currentStmt.trim()) {
          statements.push(currentStmt.trim());
        }
        currentStmt = '';
        if (
          (char === '&' && commandStr[i + 1] === '&') ||
          (char === '|' && commandStr[i + 1] === '|') ||
          (char === '|' && commandStr[i + 1] === '&')
        ) {
          i += 2;
        } else {
          i++;
        }
        continue;
      }
    }

    currentStmt += char;
    i++;
  }

  if (currentStmt.trim()) {
    statements.push(currentStmt.trim());
  }

  return { statements, subshells };
}

/**
 * Extracts the base executable command name from a single statement, skipping leading env assignments.
 * E.g. "FOO=1 BAR=2 /usr/bin/select-reader 'hello'" -> "select-reader"
 */
export function extractExecutableFromStatement(statement: string): string | null {
  const trimmed = statement.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null; // Empty or comment
  }

  // Tokenize by whitespace while respecting quotes
  const tokens: string[] = [];
  let currentToken = '';
  let inSQ = false;
  let inDQ = false;
  let esc = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (esc) {
      currentToken += char;
      esc = false;
      continue;
    }
    if (char === '\\' && !inSQ) {
      esc = true;
      continue;
    }
    if (char === "'" && !inDQ) {
      inSQ = !inSQ;
      continue;
    }
    if (char === '"' && !inSQ) {
      inDQ = !inDQ;
      continue;
    }
    if (/\s/.test(char) && !inSQ && !inDQ) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
      continue;
    }
    currentToken += char;
  }
  if (currentToken) {
    tokens.push(currentToken);
  }

  // Skip leading environment variable assignments (e.g. VAR=1, PATH=/foo)
  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      continue;
    }
    return normalizeCommandName(token);
  }

  return null;
}

/**
 * Checks if a given command line string is fully whitelisted.
 * All sub-commands (in multipart executions or subshells) must be in the whitelist.
 */
export function isCommandWhitelisted(commandStr: string, whitelist: string[]): boolean {
  if (!commandStr || typeof commandStr !== 'string') {
    return false;
  }

  const whitelistSet = new Set(whitelist.map(normalizeCommandName));
  if (whitelistSet.size === 0) {
    return false;
  }

  const { statements, subshells } = parseCommandStatements(commandStr);

  if (statements.length === 0 && subshells.length === 0) {
    return false;
  }

  // Verify all statements
  for (const stmt of statements) {
    const exe = extractExecutableFromStatement(stmt);
    if (!exe) continue; // Empty or comment statement
    if (!whitelistSet.has(exe)) {
      return false;
    }
  }

  // Verify all subshells recursively
  for (const sub of subshells) {
    if (!isCommandWhitelisted(sub, whitelist)) {
      return false;
    }
  }

  return true;
}
