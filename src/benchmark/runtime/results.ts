import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BenchmarkAgentConfig,
  BenchmarkReport,
  BenchmarkRunBundle,
  SavedBenchmarkRun,
} from '../types.js';

function findProjectRoot(startDirectory: string): string {
  let current = path.resolve(startDirectory);
  while (true) {
    if (
      fsSync.existsSync(path.join(current, 'package.json')) &&
      fsSync.existsSync(path.join(current, 'Dockerfile.benchmark'))
    ) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

export const BENCHMARK_PROJECT_ROOT = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
export const DEFAULT_BENCHMARK_OUTPUT_DIR = path.join(BENCHMARK_PROJECT_ROOT, 'benchmark_runs');

const safeName = (value: string, maxLength = 48) => value
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, maxLength) || 'model';

const jsonForHtml = (value: unknown) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

export function createStandaloneBenchmarkHtml(bundle: BenchmarkRunBundle): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Benchmark ${bundle.runId}</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#e5edf8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#172554 0,#07111f 42%);min-height:100vh}.page{max-width:1180px;margin:auto;padding:36px 20px 72px}h1{margin:0 0 8px;font-size:clamp(1.55rem,4vw,2.4rem)}.muted{color:#94a3b8}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:24px 0}.card,.case,details{background:rgba(15,23,42,.88);border:1px solid #293548;border-radius:12px}.card{padding:18px}.value{font-size:1.8rem;font-weight:800;margin-top:5px}.good{color:#34d399}.bad{color:#fb7185}.cases{display:grid;gap:10px}.case{padding:14px 16px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center}.badge{font-size:.72rem;border-radius:999px;padding:3px 8px;background:#263449}.status{font-weight:750}details{margin-top:18px;padding:14px}summary{cursor:pointer;font-weight:700}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:520px;overflow:auto;background:#050b14;border-radius:8px;padding:14px;color:#cbd5e1}@media(max-width:620px){.case{grid-template-columns:1fr}.page{padding-top:22px}}
</style></head><body><main class="page"><h1>Benchmark result</h1><div class="muted" id="subtitle"></div><section class="cards" id="cards"></section><h2>Test results</h2><section class="cases" id="cases"></section><details><summary>Model and agent configuration</summary><pre id="config"></pre></details><details><summary>Complete portable JSON result</summary><pre id="raw"></pre></details></main>
<script type="application/json" id="benchmark-data">${jsonForHtml(bundle)}</script><script>
const b=JSON.parse(document.getElementById('benchmark-data').textContent),r=b.report;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.getElementById('subtitle').textContent=(b.runName?b.runName+' • ':'')+r.model+' • '+new Date(b.runDate).toLocaleString()+' • '+b.runId;
document.getElementById('cards').innerHTML=[['Accuracy',r.accuracyPercentage+'%',r.accuracyPercentage===100?'good':''],['Passed',r.passCount+' / '+r.totalTests,'good'],['Failed',r.failCount,r.failCount?'bad':''],['Duration',(r.totalDurationMs/1000).toFixed(2)+'s','']].map(x=>'<div class="card"><div class="muted">'+x[0]+'</div><div class="value '+x[2]+'">'+x[1]+'</div></div>').join('');
document.getElementById('cases').innerHTML=r.results.map(t=>'<article class="case"><div><strong>'+esc(t.testName)+'</strong> <span class="badge">'+esc(t.category)+'</span><div class="muted">'+esc(t.reason)+'</div></div><span class="status '+(t.passed?'good':'bad')+'">'+(t.passed?'PASS':'FAIL')+'</span><span class="muted">'+t.durationMs+'ms</span></article>').join('');
document.getElementById('config').textContent=JSON.stringify(b.modelConfig,null,2);document.getElementById('raw').textContent=JSON.stringify(b,null,2);
</script></body></html>`;
}

function summarize(bundle: BenchmarkRunBundle, directory: string): SavedBenchmarkRun {
  const report = bundle.report;
  return {
    runId: bundle.runId,
    runName: bundle.runName || '',
    runDate: bundle.runDate,
    outputDirectory: path.dirname(directory),
    directory,
    reportPath: path.join(directory, 'report.json'),
    htmlPath: path.join(directory, 'index.html'),
    model: report.model,
    modelConfig: bundle.modelConfig,
    totalTests: report.totalTests,
    passCount: report.passCount,
    failCount: report.failCount,
    accuracyPercentage: report.accuracyPercentage,
    totalDurationMs: report.totalDurationMs,
    results: report.results.map(({ testId, testName, category, passed, reason, durationMs }) => ({
      testId, testName, category, passed, reason, durationMs,
    })),
  };
}

export async function saveBenchmarkReport(
  report: BenchmarkReport,
  outputDirectory: string = DEFAULT_BENCHMARK_OUTPUT_DIR,
  requestedConfig: BenchmarkAgentConfig & { model: string; ollamaHost: string },
  runName = '',
): Promise<SavedBenchmarkRun> {
  const root = path.resolve(outputDirectory);
  await fs.mkdir(root, { recursive: true });
  const runDate = report.runDate || new Date(report.timestamp).toISOString();
  const normalizedRunName = runName.trim().slice(0, 100);
  const nameSegment = normalizedRunName ? `-${safeName(normalizedRunName, 64)}` : '';
  const prefix = `${runDate.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}-${safeName(report.model)}${nameSegment}-`;
  const directory = await fs.mkdtemp(path.join(root, prefix));
  const runId = path.basename(directory);
  const effectiveConfig = report.results[0]?.agentConfig;
  const bundle: BenchmarkRunBundle = {
    schemaVersion: 1,
    runId,
    ...(normalizedRunName ? { runName: normalizedRunName } : {}),
    runDate,
    modelConfig: { ...requestedConfig, ...effectiveConfig, model: report.model },
    report: { ...report, runDate },
  };
  try {
    await fs.writeFile(path.join(directory, 'report.json'), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(directory, 'index.html'), createStandaloneBenchmarkHtml(bundle), 'utf8');
    return summarize(bundle, directory);
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function listSavedBenchmarkRuns(
  outputDirectory: string = DEFAULT_BENCHMARK_OUTPUT_DIR,
): Promise<SavedBenchmarkRun[]> {
  const root = path.resolve(outputDirectory);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const runs = await Promise.all(entries.filter((entry) => entry.isDirectory()).slice(0, 1000).map(async (entry) => {
    const directory = path.join(root, entry.name);
    try {
      const bundle = JSON.parse(await fs.readFile(path.join(directory, 'report.json'), 'utf8')) as BenchmarkRunBundle;
      if (bundle.schemaVersion !== 1 || !bundle.report || !bundle.runId || !bundle.runDate) return null;
      return summarize(bundle, directory);
    } catch (_) {
      return null;
    }
  }));
  return runs.filter((run): run is SavedBenchmarkRun => run !== null)
    .sort((a, b) => b.runDate.localeCompare(a.runDate));
}

export async function deleteSavedBenchmarkRun(
  runId: string,
  outputDirectory: string = DEFAULT_BENCHMARK_OUTPUT_DIR,
): Promise<string> {
  if (!runId || path.basename(runId) !== runId || runId === '.' || runId === '..') {
    throw new Error('Invalid benchmark run ID.');
  }
  const root = path.resolve(outputDirectory);
  const directory = path.join(root, runId);
  const reportPath = path.join(directory, 'report.json');
  let bundle: BenchmarkRunBundle;
  try {
    bundle = JSON.parse(await fs.readFile(reportPath, 'utf8')) as BenchmarkRunBundle;
  } catch (_) {
    throw new Error('Benchmark run not found or its report is invalid.');
  }
  if (bundle.schemaVersion !== 1 || bundle.runId !== runId) {
    throw new Error('Refusing to delete a directory that is not the requested benchmark run.');
  }
  await fs.rm(directory, { recursive: true, force: false });
  return directory;
}
