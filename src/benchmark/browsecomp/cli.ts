import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBrowseComp, type BrowseCompRunOptions } from './run.js';

function help(): string {
  return `Usage: npm run benchmark:browsecomp -- [options]

Runs the local agent against OpenAI BrowseComp using the official encrypted dataset
and official LLM judge prompt. Decrypted reference answers are never written to disk.

Options:
  --model NAME             Agent model (default: qwen3.5:9b)
  --grader-model NAME      Ollama judge model (default: same as --model)
  --host URL               Ollama host (default: OLLAMA_HOST or http://127.0.0.1:11434)
  --count N                Deterministic sample size (default: 20)
  --seed N                 Sample seed (default: 0)
  --concurrency N          Concurrent questions, 1-8 (default: 1)
  --context-window N       Agent and judge context size (default: 32768)
  --max-loops N            Agent loop limit (default: 6)
  --no-thinking            Disable model thinking
  --no-deep-research       Disable deep_research; use web_search/read_web_page instead
  --no-deep-search         Alias for --no-deep-research
  --web-search-ttl N       Expire web outputs after N user turns; 0 disables expiry
  --disable-web-ttl        Alias for --web-search-ttl 0
  --manual-answer TEXT     Skip the agent and grade one manually supplied answer
  --ui-server URL          App server used for observable chat sessions
                            (default: LOCAL_MODEL_CHAT_SERVER or http://127.0.0.1:3001)
  --ui-url URL             Browser-facing UI origin when different from app server
  --no-ui-session          Run directly without creating observable UI sessions
  --dataset PATH           CSV cache/input path (default: .cache/browsecomp/...)
  --output PATH            JSONL checkpoint path (default: benchmark_runs/browsecomp/...)
  --resume                 Continue an existing output with the same configuration
  --help                   Show this help
`;
}

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function integer(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

export function parseBrowseCompArgs(args: string[], cwd = process.cwd()): BrowseCompRunOptions | null {
  if (args.includes('--help')) return null;
  let model = 'qwen3.5:9b';
  let graderModel = '';
  let ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  let count = 20;
  let seed = 0;
  let concurrency = 1;
  let contextWindow = 32768;
  let maxLoops = 6;
  let enableThinking = true;
  let datasetPath = path.join(cwd, '.cache', 'browsecomp', 'browse_comp_test_set.csv');
  let outputPath = '';
  let resume = false;
  let useDeepResearch = true;
  let webOutputTTLTurns = 5;
  let manualAnswer: string | undefined;
  let uiServerUrl: string | undefined = process.env.LOCAL_MODEL_CHAT_SERVER || 'http://127.0.0.1:3001';
  let uiUrl: string | undefined = process.env.LOCAL_MODEL_CHAT_UI || uiServerUrl;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--no-thinking') enableThinking = false;
    else if (arg === '--no-deep-research' || arg === '--no-deep-search') useDeepResearch = false;
    else if (arg === '--disable-web-ttl') webOutputTTLTurns = 0;
    else if (arg === '--no-ui-session') {
      uiServerUrl = undefined;
      uiUrl = undefined;
    }
    else if (arg === '--resume') resume = true;
    else if (arg === '--model') model = valueAfter(args, index++, arg);
    else if (arg === '--grader-model') graderModel = valueAfter(args, index++, arg);
    else if (arg === '--host') ollamaHost = valueAfter(args, index++, arg);
    else if (arg === '--count') count = integer(valueAfter(args, index++, arg), arg);
    else if (arg === '--seed') seed = integer(valueAfter(args, index++, arg), arg);
    else if (arg === '--concurrency') concurrency = integer(valueAfter(args, index++, arg), arg);
    else if (arg === '--context-window') contextWindow = integer(valueAfter(args, index++, arg), arg);
    else if (arg === '--max-loops') maxLoops = integer(valueAfter(args, index++, arg), arg);
    else if (arg === '--web-search-ttl') webOutputTTLTurns = integer(valueAfter(args, index++, arg), arg);
    else if (arg === '--manual-answer') manualAnswer = valueAfter(args, index++, arg).trim();
    else if (arg === '--ui-server') uiServerUrl = valueAfter(args, index++, arg);
    else if (arg === '--ui-url') uiUrl = valueAfter(args, index++, arg);
    else if (arg === '--dataset') datasetPath = path.resolve(cwd, valueAfter(args, index++, arg));
    else if (arg === '--output') outputPath = path.resolve(cwd, valueAfter(args, index++, arg));
    else throw new Error(`Unknown option: ${arg}`);
  }

  graderModel ||= model;
  if (webOutputTTLTurns < 0) throw new Error('--web-search-ttl must be zero or greater.');
  if (manualAnswer !== undefined && count !== 1) {
    throw new Error('--manual-answer requires --count 1.');
  }
  if (!outputPath) {
    const timestamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
    const safeModel = model.replace(/[^a-z0-9._-]+/gi, '-');
    outputPath = path.join(cwd, 'benchmark_runs', 'browsecomp', `${timestamp}-${safeModel}.jsonl`);
  }
  return {
    model,
    graderModel,
    ollamaHost,
    count,
    seed,
    concurrency,
    contextWindow,
    maxLoops,
    enableThinking,
    datasetPath,
    outputPath,
    resume,
    useDeepResearch,
    webOutputTTLTurns,
    manualAnswer,
    uiServerUrl,
    uiUrl,
  };
}

async function main(): Promise<void> {
  const options = parseBrowseCompArgs(process.argv.slice(2));
  if (!options) {
    process.stdout.write(help());
    return;
  }
  process.stdout.write(
    `BrowseComp: ${options.count} questions, model=${options.model}, grader=${options.graderModel}, concurrency=${options.concurrency}\n` +
    `Results: ${options.outputPath}\n`,
  );
  const summary = await runBrowseComp(options);
  process.stdout.write(
    `Completed ${summary.completedCount}/${summary.requestedCount}; ` +
    `accuracy=${summary.accuracy === null ? 'n/a' : `${(summary.accuracy * 100).toFixed(2)}%`}; ` +
    `errors=${summary.failedCount}; unparsed_grades=${summary.graderParseFailureCount}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: any) => {
    process.stderr.write(`BrowseComp failed: ${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
