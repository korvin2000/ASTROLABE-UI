/**
 * Scenario A-1 of Studio 2 (the five-minute test) against the demo backend: from an empty data folder to a result
 * with changes, through the screens a new user meets. The scripted model stands in for a signed-in account.
 *
 *   node e2e/a1.mjs            starts the Studio jar with an empty data folder, runs, stops it
 *   E2E_URL=http://127.0.0.1:8740 node e2e/a1.mjs     uses a Studio that runs already (empty data folder, security off)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checker, delay, launch } from './driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JAR = resolve(HERE, '../../backend/server/build/libs/astrolabe-studio.jar');
const PORT = Number(process.env.E2E_PORT ?? 8745);
const SHOTS = process.env.E2E_SHOTS;

async function healthy(url) {
  try { return (await (await fetch(url + '/api/v1/health')).json()).status === 'ok'; } catch { return false; }
}

async function startStudio() {
  if (!existsSync(JAR)) throw new Error(`No jar at ${JAR}. Build it first: ./gradlew studio`);
  const data = mkdtempSync(join(tmpdir(), 'astrolabe-e2e-data-'));
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
  const child = spawn(java, ['--enable-native-access=ALL-UNNAMED', '-jar', JAR], {
    stdio: 'ignore',
    env: { ...process.env, STUDIO_PORT: String(PORT), STUDIO_DATA_DIR: data, STUDIO_SECURITY: 'false', STUDIO_ENV_KEYS: 'false', STUDIO_FIXTURE_LATENCY: '150', STUDIO_OPEN_BROWSER: 'false' },
  });
  const url = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 90; i++) {
    if (await healthy(url)) return { url, stop: async () => { child.kill(); await delay(1500); try { rmSync(data, { recursive: true, force: true }); } catch { /* temp folder */ } } };
    await delay(1000);
  }
  child.kill();
  throw new Error('Studio did not start');
}

const studio = process.env.E2E_URL ? { url: process.env.E2E_URL.replace(/\/$/, ''), stop: async () => {} } : await startStudio();
const page = await launch({ width: 1440, height: 900 });
const check = checker();
const shot = async name => { if (SHOTS) await page.shot(join(SHOTS, name + '.png')); };

try {
  // First run: nothing is connected, the app opens the welcome page.
  await page.goto(studio.url + '/');
  await page.see('h1', 'Welcome to ASTROLABE');
  check.ok(true, 'an empty data folder opens the welcome page');
  await shot('a1-1-welcome');

  // One decision: the demo in place of an account. The demo project comes with it.
  let decisions = 0;
  await page.click('button.lnk', 'Run the demo'); decisions++;
  await page.see('as-new-task textarea', '', { timeout: 20000 });
  check.ok(decisions <= 3, `${decisions} decision before typing (three at most)`);
  check.ok((await page.text('as-new-task')).includes('Demo'), 'the demo says that it is one');
  check.ok(await page.evaluate(`document.activeElement?.tagName === 'TEXTAREA'`), 'the message box has the focus');
  check.ok(await page.evaluate(`document.querySelectorAll('as-new-task .ex button').length === 3`), 'three example requests');
  await shot('a1-2-new-task');

  // The request.
  await page.type('as-new-task textarea', 'Fix the rounding of discounts and explain the cause');
  await page.press('Enter');
  const sent = Date.now();
  await page.see('.msg.user', 'Fix the rounding of discounts', { timeout: 15000 });
  check.ok(true, 'the request opens the task with the message of the user');
  await page.see('as-activity-group .sum', '', { timeout: 10000 });
  const first = Date.now() - sent;
  check.ok(first <= 10000, `the first step shows after ${first} ms (10 s at most)`);
  check.ok((await page.evaluate('location.pathname')).startsWith('/t/'), 'the task has its own address');

  // The side panel follows the work.
  await page.see('as-flow-stage');
  check.ok(await page.evaluate(`document.querySelectorAll('as-flow-stage .fnode').length === 7`), 'the Flow has seven nodes');

  // The result.
  await page.see('as-result-card', 'Review changes', { timeout: 60000 });
  const result = await page.text('as-result-card');
  check.ok(/\d+ files? ·/.test(result), 'the result names the changed files');
  check.ok(result.includes('Verified') && /Tests passed|Reviewed|Build passed/.test(result), 'the result says how it was verified');
  check.ok((await page.text('.head .state')).includes('Done'), 'the task is Done');
  check.ok(await page.evaluate(`!!document.querySelector('as-flow-stage .fnode.passed')`), 'Checks is green in the Flow');
  await shot('a1-3-result');

  // The changes.
  await page.click('as-result-card button.lnk', 'Review changes');
  await page.see('as-changes', 'pricing.py', { timeout: 15000 });
  check.ok(true, 'Changes lists the file the task changed');
  await page.see('as-changes as-diff-view .l.add', '', { timeout: 15000 });
  check.ok(true, 'the diff of the file shows');
  await shot('a1-4-changes');

  // The sidebar knows the task.
  check.ok((await page.text('as-sidebar')).includes('demo-shop'), 'the sidebar lists the project');
  check.ok(await page.evaluate(`document.querySelectorAll('as-sidebar a.task').length === 1`), 'the sidebar lists the task');

  // A reloaded page opens the same task.
  await page.goto(studio.url + (await page.evaluate('location.pathname')));
  await page.see('as-result-card', 'Review changes', { timeout: 15000 });
  check.ok(true, 'a reloaded page shows the same task');

  // A follow-up continues the task; a reloaded page tells the runs in their order.
  await page.type('.composer textarea', 'Explain the change in one sentence');
  await page.press('Enter');
  await page.until(`document.querySelectorAll('as-result-card').length === 2`, { timeout: 60000, what: 'the second result' });
  await page.goto(studio.url + (await page.evaluate('location.pathname')));
  await page.until(`document.querySelectorAll('as-result-card').length === 2`, { timeout: 15000, what: 'both results after the reload' });
  const told = await page.evaluate(`[...document.querySelectorAll('.msg.user')].map(m => m.textContent.trim())`);
  check.ok(told.length === 2 && told[0].startsWith('Fix the rounding') && told[1].startsWith('Explain the change'), 'the runs of a task keep their order after a reload');
  check.ok(await page.evaluate(`[...document.querySelectorAll('.col > *')].at(-1)?.tagName === 'AS-RESULT-CARD'`), 'the latest result ends the conversation');

  // A second task in the same project: the agent asks, and a risky command waits for approval (A-6, A-5).
  await page.click('as-sidebar a.newtask');
  await page.see('as-new-task textarea');
  await page.type('as-new-task textarea', 'Check the rounding of cart totals. Ask me before you decide how to round.');
  await page.press('Enter');
  await page.see('.msg.user', 'Check the rounding of cart totals', { timeout: 15000 });
  // The question of the agent is a card; typing in the message box answers it (A-6).
  await page.see('as-ask-card section.card', 'Question', { timeout: 30000 });
  await page.click('.panel .tabs button', 'Progress');
  const asked = Date.now();
  await page.see('.head .state', 'Needs you', { timeout: 5000 });
  check.ok(true, 'the task says that it needs the user');
  await page.see('as-flow-stage .fnode.waiting', '', { timeout: 5000 });
  check.ok(Date.now() - asked <= 1000, `You turns amber in the Flow (${Date.now() - asked} ms after the card)`);
  await shot('a1-5-question');
  await page.type('.composer textarea', 'Round to cents');
  await page.press('Enter');
  await page.see('as-ask-card .done', 'Round to cents', { timeout: 15000 });
  check.ok(true, 'the typed answer closes the question card');

  // A risky command asks first (A-5).
  await page.see('as-ask-card section.card', 'Approval needed', { timeout: 30000 });
  check.ok((await page.text('as-ask-card .cmd')).length > 0, 'the approval card shows the command');
  await shot('a1-6-approval');
  await page.click('as-ask-card button', 'Allow once');

  await page.see('as-result-card', '', { timeout: 60000 });
  check.ok((await page.text('.head .state')).includes('Done'), 'the second task is Done');
  check.ok(await page.evaluate(`document.querySelectorAll('as-sidebar a.task').length === 2`), 'the sidebar lists both tasks');

  const errors = page.consoleErrors.filter(e => !/favicon/.test(e));
  check.ok(errors.length === 0, 'no error in the browser console' + (errors.length ? ': ' + errors.join(' | ') : ''));
} catch (e) {
  check.ok(false, String(e.message ?? e));
  if (SHOTS) await shot('a1-failure');
  console.log((await page.text()).slice(0, 1500));
} finally {
  await page.close();
  await studio.stop();
  check.done();
}
