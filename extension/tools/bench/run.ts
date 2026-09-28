/**
 * The agent benchmark: does Shield finish a task on a page, and how fast.
 *
 * WHAT IT RUNS
 *
 * The extension's own code at every step that decides what leaves the laptop:
 * the DOM reader and the executor inside the page (tools/bench/page-entry.ts),
 * and in Node the DOM rules, the placeholder redaction and the payload sealer,
 * including its zero-leak checks. The request goes to a real Shield server,
 * so the model, the prompt, the allowlist and the row-evidence check are the
 * shipping ones. What it leaves out is the pixel layer — faces and text in
 * images — so a run here is DOM-only on the redaction side; with --frame the
 * screenshot is sent with every flagged region painted black.
 *
 * WHY IT EXISTS
 *
 * Two jobs. Choosing a server model on evidence (TASKS.md S1): the same tasks,
 * the same viewport, several models, correctness and latency side by side.
 * And the finale (S6): the use cases arrive on the day, and a new case is one
 * entry in a JSON file.
 *
 * USAGE (from extension/)
 *
 *   npm run bench -- --models gemma-4-31b-it,gemma-4-26b-a4b-it --repeat 3
 *   npm run bench -- --server http://127.0.0.1:8787 --only kyc,payroll
 *   npm run bench -- --models qwen2.5vl:7b@http://127.0.0.1:11434/v1/chat/completions
 *   --pace 30   wait 30s before each request (free-tier token limits)
 *   --frame     send the screenshot, flagged regions painted black
 *
 * --models spawns one server per model (key and endpoint from the repo's .env
 * unless given as name@endpoint), with the backup model switched off so a
 * fallback cannot pass for the model's own answer. --server uses a running one.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Browser, type Page } from './cdp.ts';
import { detectDomPii } from '../../src/lib/pii/dom-rules';
import { buildManifest, redactDomElements } from '../../src/lib/redaction/placeholders';
import { buildSanitizedPayload } from '../../src/lib/redaction/payload';
import { isFinalClick } from '../../src/lib/committing';
import type { DomElement, SensitiveRegion, ShieldAction } from '../../src/lib/types';
import type { ExtractDomResult } from '../../src/lib/messages';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION = resolve(HERE, '..', '..');
const REPO = resolve(EXTENSION, '..');
const SERVER_DIR = join(REPO, 'server');
const PYTHON = join(SERVER_DIR, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

/** A 1×1 transparent PNG, sent when the frame is off so the schema is met. */
const BLANK_FRAME =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface Expectation {
  type: 'click' | 'type';
  /** Every string must appear in the target's label, value or selector. */
  target: string[];
  /** The target must share a row with an element containing this text. */
  sameRowAs?: string;
}

interface Case {
  name: string;
  url: string;
  task: string;
  expect: Expectation[];
  /** Steps before the task: log in, open a tab. */
  setup?: Array<{ goto?: string; eval?: string; wait?: number }>;
  viewport?: [number, number];
}

interface StepRecord {
  step: number;
  hidden: number;
  elements: number;
  localMs: number;
  serverMs: number;
  path: string;
  status: string;
  action: string;
  verdict: 'right' | 'wrong' | 'none' | 'scroll';
}

interface RunRecord {
  model: string;
  case: string;
  attempt: number;
  passed: boolean;
  steps: StepRecord[];
  error?: string;
}

// --- Arguments ---------------------------------------------------------------

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const list = process.argv.slice(2);
  for (let index = 0; index < list.length; index += 1) {
    const key = list[index];
    if (!key?.startsWith('--')) continue;
    const next = list[index + 1];
    if (next === undefined || next.startsWith('--')) out[key.slice(2)] = 'true';
    else {
      out[key.slice(2)] = next;
      index += 1;
    }
  }
  return out;
}

// --- Servers ------------------------------------------------------------------

interface Server {
  label: string;
  url: string;
  process?: ChildProcess;
}

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server at ${url} did not come up.`);
}

async function startServer(spec: string, port: number, frame: boolean): Promise<Server> {
  const [name, endpoint] = spec.split('@');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    SHIELD_MODEL_NAME: name ?? spec,
    SHIELD_MODEL_BACKUP_NAME: '',
    SHIELD_MODEL_VISION: frame ? '1' : '0',
    SHIELD_MODEL_TIMEOUT: process.env['SHIELD_MODEL_TIMEOUT'] ?? '30',
    // Reports go nowhere during a benchmark.
    SHIELD_FLEET_FILE: join(HERE, '.out', 'fleet-scratch.json'),
  };
  if (endpoint) {
    env['SHIELD_MODEL_ENDPOINT'] = endpoint;
    env['SHIELD_MODEL_KEY'] = env['SHIELD_MODEL_KEY'] || 'local';
  }
  // The server's own log, kept per model: when a model's answers are refused,
  // the reason is in here and nowhere else. It names paths and reasons, never
  // page content (main.py logs no payload).
  mkdirSync(join(HERE, '.out'), { recursive: true });
  const log = openSync(join(HERE, '.out', `server-${(name ?? spec).replace(/[^a-z0-9.-]/gi, '_')}.log`), 'w');
  const child = spawn(PYTHON, ['-m', 'uvicorn', 'main:app', '--port', String(port), '--log-level', 'info'], {
    cwd: SERVER_DIR,
    env,
    stdio: ['ignore', log, log],
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url);
  return { label: name ?? spec, url, process: child };
}

// --- One step -----------------------------------------------------------------

function describe(element: DomElement | undefined): string {
  if (!element) return '(unknown element)';
  return [element.label, element.value, element.selector].filter(Boolean).join(' | ');
}

function matches(
  expectation: Expectation,
  action: ShieldAction,
  target: DomElement | undefined,
  elements: readonly DomElement[],
): boolean {
  if (action.type !== expectation.type || !target) return false;
  const text = describe(target).toLowerCase();
  if (!expectation.target.every((needle) => text.includes(needle.toLowerCase()))) return false;
  if (expectation.sameRowAs) {
    const anchor = elements.find((element) =>
      describe(element).toLowerCase().includes(expectation.sameRowAs!.toLowerCase()),
    );
    if (!anchor || anchor.row == null || anchor.row !== target.row) return false;
  }
  return true;
}

async function paintFrame(page: Page, regions: readonly SensitiveRegion[]): Promise<string> {
  // Black boxes drawn over every flagged region, then a screenshot, then the
  // boxes removed — the frame the model sees, without the canvas pipeline.
  const boxes = regions.map((region) => region.position);
  await page.evaluate(`(() => {
    const layer = document.createElement('div');
    layer.id = '__shield_bench_boxes';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    for (const box of ${JSON.stringify(boxes)}) {
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;background:#000;left:' + box.x + 'px;top:' + box.y + 'px;width:' + box.width + 'px;height:' + box.height + 'px';
      layer.append(b);
    }
    document.documentElement.append(layer);
  })()`);
  const shot = await page.screenshot();
  await page.evaluate(`document.getElementById('__shield_bench_boxes')?.remove()`);
  return shot;
}

async function runCase(
  page: Page,
  testCase: Case,
  server: Server,
  options: { frame: boolean; viewport: [number, number]; paceMs: number },
): Promise<{ steps: StepRecord[]; passed: boolean }> {
  const [width, height] = testCase.viewport ?? options.viewport;
  await page.viewport(width, height);
  const url = /^[a-z]+:\/\//i.test(testCase.url)
    ? testCase.url
    : pathToFileURL(join(REPO, testCase.url)).href;

  for (const step of testCase.setup ?? []) {
    if (step.goto) await page.goto(step.goto);
    if (step.eval) await page.evaluate(step.eval);
    if (step.wait) await new Promise((resolve) => setTimeout(resolve, step.wait));
  }
  await page.goto(url);

  const bundle = readFileSync(join(HERE, '.out', 'page.js'), 'utf8');
  const steps: StepRecord[] = [];
  let expected = 0;
  const maxSteps = testCase.expect.length + 3;

  for (let step = 1; step <= maxSteps && expected < testCase.expect.length; step += 1) {
    const hasBundle = await page.evaluate<boolean>('typeof window.__shieldBench === "object"');
    if (!hasBundle) await page.evaluate(bundle);

    const localStarted = performance.now();
    const map = await page.evaluate<ExtractDomResult>('window.__shieldBench.extract()');
    const regions = detectDomPii(map.elements);
    const redactedDom = redactDomElements(map.elements, regions);
    const frame = options.frame ? await paintFrame(page, regions) : BLANK_FRAME;
    const payload = buildSanitizedPayload({
      requestId: crypto.randomUUID(),
      taskQuery: testCase.task,
      redactedFrame: frame,
      redactedDom,
      manifest: buildManifest(regions),
      regions,
      flaggedRawValues: regions
        .map((region) => map.elements.find((element) => element.elementId === region.elementId)?.value ?? null)
        .filter((value): value is string => value !== null),
    });
    const localMs = performance.now() - localStarted;
    // The sealed payload, kept for replaying against a model by hand. It is
    // the redacted request — what left the laptop — so it is safe to keep.
    writeFileSync(join(HERE, '.out', `payload-${testCase.name}-step${step}.json`), JSON.stringify(payload));

    // Free tiers limit tokens per minute, and a request refused for quota is
    // a fallback the benchmark would score as the model being wrong.
    if (options.paceMs > 0) await new Promise((resolve) => setTimeout(resolve, options.paceMs));
    const serverStarted = performance.now();
    const response = await fetch(`${server.url}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as {
      status: string;
      action?: ShieldAction;
      reasoning_summary?: string;
    };
    const serverMs = performance.now() - serverStarted;
    const path = response.headers.get('x-shield-path') ?? '?';

    const record: StepRecord = {
      step,
      hidden: regions.length,
      elements: map.elements.length,
      localMs: Math.round(localMs),
      serverMs: Math.round(serverMs),
      path,
      status: body.status,
      action: '',
      verdict: 'none',
    };
    steps.push(record);

    if (body.status !== 'action_ready' || !body.action) {
      record.action = (body.reasoning_summary ?? '').slice(0, 90);
      break;
    }

    const action = body.action;
    const target = map.elements.find(
      (element) => element.elementId === action.selector || element.selector === action.selector,
    );
    record.action = `${action.type} ${(target?.label ?? target?.value ?? action.selector).slice(0, 60)}`;

    if (action.type === 'scroll') {
      record.verdict = 'scroll';
    } else if (matches(testCase.expect[expected]!, action, target, map.elements)) {
      record.verdict = 'right';
      expected += 1;
    } else {
      record.verdict = 'wrong';
      break;
    }

    if (!target) break;
    const typeValue =
      action.type === 'type' && action.value && !action.value.startsWith('[') ? action.value : null;
    const request = {
      action,
      expectedSelector: target.selector,
      expectedType: target.elementType,
      expectedLabel: target.label,
      typeValue,
    };
    const executed = await page.evaluate<{ ok: boolean; message: string }>(
      `window.__shieldBench.execute(${JSON.stringify(request)})`,
    );
    if (!executed.ok) {
      record.verdict = 'wrong';
      record.action += ` (failed: ${executed.message})`;
      break;
    }
    // The shipping agent stops after a final click; so does the benchmark.
    if (action.type === 'click' && isFinalClick(action, target)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { steps, passed: expected === testCase.expect.length };
}

// --- Main ---------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function main(): Promise<void> {
  const options = args();
  const frame = options['frame'] === 'true';
  const repeat = Number(options['repeat'] ?? '1');
  const [vw, vh] = (options['viewport'] ?? '1000x680').split('x').map(Number) as [number, number];
  const casesFile = options['cases'] ?? join(HERE, 'cases.json');
  const only = options['only']?.split(',');
  const cases = (JSON.parse(readFileSync(casesFile, 'utf8')) as Case[]).filter(
    (testCase) => !only || only.includes(testCase.name),
  );

  if (!existsSync(join(HERE, '.out', 'page.js')) || options['rebuild'] === 'true') {
    await new Promise<void>((resolve, reject) => {
      const vite = spawn(
        process.execPath,
        [join(EXTENSION, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', join(HERE, 'vite.config.ts')],
        { cwd: EXTENSION, stdio: 'inherit' },
      );
      vite.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('bundle build failed'))));
    });
  }

  const servers: Server[] = [];
  if (options['models']) {
    let port = Number(options['port'] ?? '8801');
    for (const spec of options['models'].split(',')) {
      servers.push(await startServer(spec, port, frame));
      port += 1;
    }
  } else {
    servers.push({ label: options['server'] ?? 'http://127.0.0.1:8787', url: options['server'] ?? 'http://127.0.0.1:8787' });
  }

  const browser = await Browser.launch({ headless: options['headed'] !== 'true' });
  const records: RunRecord[] = [];
  try {
    for (const server of servers) {
      for (const testCase of cases) {
        for (let attempt = 1; attempt <= repeat; attempt += 1) {
          const page = await browser.newPage();
          const record: RunRecord = { model: server.label, case: testCase.name, attempt, passed: false, steps: [] };
          try {
            const result = await runCase(page, testCase, server, {
              frame,
              viewport: [vw, vh],
              paceMs: Number(options['pace'] ?? '0') * 1000,
            });
            record.steps = result.steps;
            record.passed = result.passed;
          } catch (error) {
            record.error = (error as Error).message;
          }
          records.push(record);
          const last = record.steps[record.steps.length - 1];
          console.log(
            `${record.passed ? 'PASS' : 'FAIL'}  ${server.label.padEnd(22)} ${testCase.name.padEnd(12)} #${attempt}  ` +
              (record.error
                ? `error: ${record.error}`
                : `${record.steps.length} step(s), last: ${last?.action ?? '-'} via ${last?.path ?? '-'} in ${last?.serverMs ?? 0}ms`),
          );
          await page.send('Page.close').catch(() => undefined);
        }
      }
    }
  } finally {
    await browser.close();
    for (const server of servers) server.process?.kill();
  }

  // Summary: per model, per case — passes, then latency of the model's own steps.
  console.log('\nmodel                  case         pass   server median / worst   local median   paths');
  for (const server of servers) {
    for (const testCase of cases) {
      const runs = records.filter((record) => record.model === server.label && record.case === testCase.name);
      const steps = runs.flatMap((record) => record.steps);
      const serverTimes = steps.map((step) => step.serverMs);
      const paths = [...new Set(steps.map((step) => step.path))].join(',');
      console.log(
        `${server.label.padEnd(22)} ${testCase.name.padEnd(12)} ${`${runs.filter((run) => run.passed).length}/${runs.length}`.padEnd(6)} ` +
          `${`${median(serverTimes)} / ${Math.max(0, ...serverTimes)} ms`.padEnd(23)} ${`${median(steps.map((step) => step.localMs))} ms`.padEnd(14)} ${paths}`,
      );
    }
  }

  mkdirSync(join(HERE, '.out'), { recursive: true });
  const out = join(HERE, '.out', `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(out, JSON.stringify({ frame, viewport: [vw, vh], records }, null, 2));
  console.log(`\nFull record: ${out}`);
}

await main();
