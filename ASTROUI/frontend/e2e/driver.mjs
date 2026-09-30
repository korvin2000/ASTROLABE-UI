/**
 * A small browser driver for the end-to-end checks: headless Edge or Chrome over the DevTools protocol, with Node's
 * built-in WebSocket. It adds no dependency to the project.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const BROWSERS = [
  process.env.E2E_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export const delay = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1440, height = 900, port = 9444, dark = false, reducedMotion = false } = {}) {
  const browser = BROWSERS.find(p => existsSync(p));
  if (!browser) throw new Error('No Chrome or Edge found. Set E2E_BROWSER to the path of one.');
  const profile = resolve(tmpdir(), `astrolabe-e2e-${process.pid}-${port}`);
  const child = spawn(browser, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await delay(150);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch { /* the browser is still starting */ }
  }
  if (!target) { child.kill(); throw new Error('the browser did not start'); }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];
  socket.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.fail(new Error(m.error.message)); else p.ok(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++nextId;
    pending.set(id, { ok, fail });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
    { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
  ] });

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  /** Waits until [expression] is truthy in the page and returns its value. */
  async function until(expression, { timeout = 15000, what = expression } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      let v;
      try { v = await evaluate(expression); } catch { v = null; }
      if (v) return v;
      if (Date.now() > end) throw new Error('timed out waiting for: ' + what);
      await delay(100);
    }
  }

  const find = `(sel, text) => [...document.querySelectorAll(sel)].find(e => !text || (e.textContent || '').replace(/\\s+/g, ' ').trim().includes(text))`;

  const page = {
    send, evaluate, until, consoleErrors,
    async goto(url) {
      await send('Page.navigate', { url });
      await until(`document.readyState === 'complete'`, { what: 'page load' });
    },
    /** Waits for an element that matches the selector (and contains the text). */
    see(selector, text = '', options = {}) {
      return until(`!!(${find})(${JSON.stringify(selector)}, ${JSON.stringify(text)})`, { what: `${selector} ${text}`, ...options });
    },
    gone(selector, text = '', options = {}) {
      return until(`!(${find})(${JSON.stringify(selector)}, ${JSON.stringify(text)})`, { what: `no ${selector} ${text}`, ...options });
    },
    async click(selector, text = '') {
      await page.see(selector, text);
      await evaluate(`(${find})(${JSON.stringify(selector)}, ${JSON.stringify(text)}).click()`);
      await delay(60);
    },
    /** Types into an input or textarea the way a user would: the value, then the input event Angular listens to. */
    async type(selector, value) {
      await page.see(selector);
      await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus();
        const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await delay(60);
    },
    async press(key, { ctrl = false, shift = false } = {}) {
      const modifiers = (ctrl ? 2 : 0) | (shift ? 8 : 0);
      const code = key.length === 1 ? 'Key' + key.toUpperCase() : key;
      const vk = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
      const text = key === 'Enter' ? '\r' : key.length === 1 && !ctrl ? key : undefined;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
      await delay(60);
    },
    text(selector = 'body') { return evaluate(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '')`); },
    async resize(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await delay(150); },
    async media({ dark: d = dark, reducedMotion: rm = reducedMotion } = {}) {
      await send('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-color-scheme', value: d ? 'dark' : 'light' },
        { name: 'prefers-reduced-motion', value: rm ? 'reduce' : 'no-preference' },
      ] });
    },
    async shot(file) {
      const out = resolve(file);
      mkdirSync(dirname(out), { recursive: true });
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(out, Buffer.from(data, 'base64'));
      return out;
    },
    async close() {
      try { await send('Browser.close'); } catch { /* already gone */ }
      socket.close();
      child.kill();
      await delay(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* the profile is in the temp folder */ }
    },
  };
  return page;
}

/** A check that names itself; the run fails with every failed check listed. */
export function checker() {
  const failed = [];
  let passed = 0;
  return {
    ok(condition, what) {
      if (condition) { passed++; console.log('  ok   ' + what); } else { failed.push(what); console.log('  FAIL ' + what); }
    },
    done() {
      console.log(`${passed} passed, ${failed.length} failed`);
      if (failed.length) process.exitCode = 1;
      return failed;
    },
  };
}
