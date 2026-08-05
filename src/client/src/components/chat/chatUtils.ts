export const compactValue = (value: unknown, maxLength = 64): string => {
  if (value === undefined || value === null || value === '') return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return `"${singleLine.length > maxLength ? `${singleLine.slice(0, maxLength - 1)}…` : singleLine}"`;
};

export interface CategorizedError {
  code: string;
  reason: string;
}

export const categorizeError = (error: unknown, result?: any): CategorizedError => {
  const msg = typeof error === 'string' 
    ? error 
    : (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string'
      ? (error as any).message 
      : '');

  const text = (msg + ' ' + (result?.error || '') + ' ' + (result?.reason || '')).trim();

  if (/ENOENT|no such file or directory|File not found/i.test(text)) {
    return { code: 'FILE_NOT_FOUND', reason: 'File or directory not found' };
  }
  if (/ungrounded|The runtime read|required automatic read failed/i.test(text) || result?.read_required) {
    return { code: 'READ_REQUIRED', reason: 'Must read file before editing' };
  }
  if (/repeating an identical failed|repeated_call/i.test(text) || result?.repeated_call) {
    return { code: 'REPEATED_CALL', reason: 'Identical failed call blocked' };
  }
  if (/was not found in file|not found in/i.test(text)) {
    return { code: 'TARGET_NOT_FOUND', reason: 'Target text not found in file' };
  }
  if (/produced no change|no changes were made/i.test(text)) {
    return { code: 'NO_CHANGES', reason: 'Edit produced no changes' };
  }
  if (/is a directory, not a file|is not a directory/i.test(text)) {
    return { code: 'PATH_TYPE_MISMATCH', reason: 'Path type mismatch (dir vs file)' };
  }
  if (/exceeds .* limit|too large/i.test(text)) {
    return { code: 'FILE_TOO_LARGE', reason: 'File exceeds size limit' };
  }
  if (/is required|Parameters .* required|missing argument/i.test(text)) {
    return { code: 'MISSING_ARGS', reason: 'Missing required parameters' };
  }
  if (/rejected by user|EACCES|permission denied/i.test(text)) {
    return { code: 'PERMISSION_DENIED', reason: 'Operation rejected or permission denied' };
  }
  if (/MCP tool .* is disabled|MCP execution error/i.test(text)) {
    return { code: 'MCP_ERROR', reason: 'MCP tool execution failed' };
  }
  if (/web search failed|web page read failed|deep research failed|private network/i.test(text)) {
    return { code: 'WEB_ERROR', reason: 'Web request failed' };
  }
  if (result?.exitCode !== undefined && result.exitCode !== 0) {
    return { code: 'COMMAND_FAILED', reason: `Command exited with code ${result.exitCode}` };
  }

  if (msg) {
    const clean = msg.replace(/[\r\n]+/g, ' ').trim();
    const match = clean.match(/^([^.!?]+[.!?]?)/);
    let shortText = match ? match[1].trim() : clean;
    if (shortText.length > 60) {
      const truncated = shortText.slice(0, 57);
      const lastSpace = truncated.lastIndexOf(' ');
      shortText = (lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated) + '…';
    }
    return { code: 'ERROR', reason: shortText };
  }

  return { code: 'FAILED', reason: 'Operation failed' };
};

export const getToolResultSummary = (
  name: string | undefined,
  args: Record<string, any>,
  result: any,
): string => {
  const target = compactValue(
    args.relative_path || args.absolute_path || args.query || args.command || args.url ||
    result?.file_path || result?.relative_path || result?.working_directory,
  );

  const isFailed = !!(
    result?.error ||
    result?.failed ||
    result?.success === false ||
    (result?.exitCode !== undefined && result.exitCode !== 0)
  );

  if (isFailed) {
    const { code, reason } = categorizeError(result?.error || result?.reason, result);
    return `${target} ([${code}] ${reason})`.trim();
  }

  switch (name) {
    case 'list_directory': {
      const entries = Array.isArray(result?.entries) ? result.entries : [];
      const directories = entries.filter((entry: any) => entry?.type === 'directory').length;
      const files = entries.filter((entry: any) => entry?.type === 'file').length;
      const other = Math.max(0, entries.length - directories - files);
      const counts = [
        `${directories} ${directories === 1 ? 'dir' : 'dirs'}`,
        `${files} ${files === 1 ? 'file' : 'files'}`,
        ...(other ? [`${other} other`] : []),
      ].join(', ');
      return `${target || '"."'} (${counts})`;
    }
    case 'read_file': {
      const lineCount = typeof result?.content === 'string'
        ? (result.content ? result.content.split('\n').length : 0)
        : 0;
      return `${target} (${lineCount} ${lineCount === 1 ? 'line' : 'lines'}, ${result?.size_bytes ?? 0} bytes)`.trim();
    }
    case 'edit_file':
    case 'replace_file':
      return `${target} (${result?.changed === false ? 'unchanged' : 'updated'}, ${result?.size_bytes ?? 0} bytes)`.trim();
    case 'create_file':
      return `${target} (created, ${result?.size_bytes ?? 0} bytes)`.trim();
    case 'grep_search': {
      const count = result?.total_matches ?? (Array.isArray(result?.matches) ? result.matches.length : 0);
      return `${target} (${count} ${count === 1 ? 'match' : 'matches'})`.trim();
    }
    case 'execute_command':
      return `${target} (exit ${result?.exitCode ?? '?'})`.trim();
    case 'web_search':
      return `${target} (${result?.result_count ?? 0} results)`.trim();
    case 'read_web_page':
      return `${compactValue(result?.title) || target} (${result?.markdown?.length ?? 0} chars)`.trim();
    case 'deep_research':
      return `${target} (${result?.searches_completed ?? 0} searches, ${result?.pages_read ?? 0} pages, ${result?.images?.length ?? 0} images)`.trim();
    case 'get_working_directory':
      return `${target}`.trim();
    case 'set_working_directory':
      return `${target} (${result?.success ? 'changed' : 'failed'})`.trim();
    default: {
      if (Array.isArray(result)) return `${target} (${result.length} items)`.trim();
      const keyCount = result && typeof result === 'object' ? Object.keys(result).length : 0;
      return `${target}${keyCount ? ` (${keyCount} fields)` : ''}`.trim();
    }
  }
};
