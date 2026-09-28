/**
 * A minimal Chrome DevTools Protocol driver: launch a browser, open a page,
 * send commands, wait for events. Node 24's built-in WebSocket and nothing
 * else — no Puppeteer, in keeping with the rest of the toolchain having no
 * runtime dependencies.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type Listener = { method: string; sessionId: string | undefined; resolve: (params: unknown) => void };

export class Browser {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners: Listener[] = [];
  private process: ChildProcess;
  private profile: string;

  private constructor(socket: WebSocket, process: ChildProcess, profile: string) {
    this.socket = socket;
    this.process = process;
    this.profile = profile;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
        method?: string;
        params?: unknown;
        sessionId?: string;
      };
      if (message.id !== undefined) {
        const waiting = this.pending.get(message.id);
        if (!waiting) return;
        this.pending.delete(message.id);
        if (message.error) waiting.reject(new Error(message.error.message));
        else waiting.resolve(message.result);
        return;
      }
      if (message.method) {
        this.listeners = this.listeners.filter((listener) => {
          const matches =
            listener.method === message.method &&
            (listener.sessionId === undefined || listener.sessionId === message.sessionId);
          if (matches) listener.resolve(message.params);
          return !matches;
        });
      }
    });
  }

  static async launch(options: { headless?: boolean } = {}): Promise<Browser> {
    const chrome = process.env['CHROME'] ?? DEFAULT_CHROME.find((path) => existsSync(path));
    if (!chrome) throw new Error('Chrome not found. Set CHROME to its path.');

    const profile = mkdtempSync(join(tmpdir(), 'shield-bench-'));
    const args = [
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      'about:blank',
    ];
    if (options.headless !== false) args.unshift('--headless=new');
    const child = spawn(chrome, args, { stdio: 'ignore' });

    // Chrome writes the port it chose to this file once it is listening.
    const portFile = join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 20_000;
    while (!existsSync(portFile)) {
      if (Date.now() > deadline) throw new Error('Chrome did not start within 20s.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new Browser(socket, child, profile);
  }

  send<T = unknown>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++;
    const message: Record<string, unknown> = { id, method, params };
    if (sessionId) message['sessionId'] = sessionId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  waitFor<T = unknown>(method: string, sessionId?: string, timeoutMs = 30_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const listener: Listener = { method, sessionId, resolve: resolve as (params: unknown) => void };
      this.listeners.push(listener);
      setTimeout(() => {
        this.listeners = this.listeners.filter((candidate) => candidate !== listener);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
    });
  }

  async newPage(): Promise<Page> {
    const { targetId } = await this.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
    });
    const { sessionId } = await this.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const page = new Page(this, sessionId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return page;
  }

  async close(): Promise<void> {
    try {
      await this.send('Browser.close');
    } catch {
      // Already gone.
    }
    this.process.kill();
    this.socket.close();
    // Chrome releases the profile a moment after it exits.
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      rmSync(this.profile, { recursive: true, force: true });
    } catch {
      // A locked temp folder is not worth failing a run over.
    }
  }
}

export class Page {
  // Plain fields rather than parameter properties: Node runs this file by
  // stripping types, and parameter properties are not type-only syntax.
  private browser: Browser;
  readonly sessionId: string;

  constructor(browser: Browser, sessionId: string) {
    this.browser = browser;
    this.sessionId = sessionId;
  }

  send<T = unknown>(method: string, params: object = {}): Promise<T> {
    return this.browser.send<T>(method, params, this.sessionId);
  }

  async viewport(width: number, height: number): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async goto(url: string, settleMs = 600): Promise<void> {
    const loaded = this.browser.waitFor('Page.loadEventFired', this.sessionId, 45_000);
    await this.send('Page.navigate', { url });
    await loaded;
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }

  /** Evaluate an expression in the page and return its value. */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{
      result: { value?: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value as T;
  }

  /** A PNG of the viewport, as a data URL. */
  async screenshot(): Promise<string> {
    const { data } = await this.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
    });
    return `data:image/png;base64,${data}`;
  }
}
