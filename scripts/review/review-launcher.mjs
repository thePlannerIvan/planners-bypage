import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sessionScript = resolve(here, 'review-session.mjs');

function archiveExistingFeedback(reviewDir, feedbackPath) {
  if (!existsSync(feedbackPath)) return;
  const historyDir = join(reviewDir, 'history');
  mkdirSync(historyDir, { recursive: true });
  const serialized = readFileSync(feedbackPath, 'utf8');
  const rounds = readdirSync(historyDir)
    .map(name => ({ name, match: name.match(/^round-(\d+)\.json$/) }))
    .filter(item => item.match)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  const last = rounds.at(-1);
  const alreadyArchived = last && readFileSync(join(historyDir, last.name), 'utf8') === serialized;
  if (!alreadyArchived) {
    const round = last ? Number(last.match[1]) + 1 : 1;
    writeFileSync(join(historyDir, `round-${String(round).padStart(2, '0')}.json`), serialized);
  }
  unlinkSync(feedbackPath);
}

export function launchReviewSession({
  reviewDir, feedbackPath, port = 0, assetsDir = null, finalMdPath = null,
}) {
  const readyPath = join(reviewDir, 'review-session.json');
  if (existsSync(readyPath)) unlinkSync(readyPath);
  archiveExistingFeedback(reviewDir, feedbackPath);
  const logPath = join(reviewDir, 'review-session.log');
  if (existsSync(logPath)) unlinkSync(logPath);
  const sessionArgs = [
    sessionScript,
    '--dir', reviewDir,
    '--feedback', feedbackPath,
    '--history-dir', join(reviewDir, 'history'),
    '--ready-file', readyPath,
    '--port', String(port),
  ];
  if (assetsDir) sessionArgs.push('--assets-dir', assetsDir);
  if (finalMdPath) sessionArgs.push('--final-md', finalMdPath);
  const logFd = openSync(logPath, 'a');
  const child = spawn(process.execPath, sessionArgs, { detached: true, stdio: ['ignore', logFd, logFd] });
  closeSync(logFd);
  child.unref();

  for (let index = 0; index < 80 && !existsSync(readyPath); index++) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (!existsSync(readyPath)) {
    const details = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim() : '';
    throw new Error(`审阅服务未就绪${details ? `：${details}` : ''}`);
  }
  const session = JSON.parse(readFileSync(readyPath, 'utf8'));
  if (process.env.REVIEW_TEST_NO_OPEN !== '1') {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const commandArgs = process.platform === 'win32' ? ['/c', 'start', '', session.url] : [session.url];
    const opened = spawnSync(command, commandArgs, { encoding: 'utf8' });
    if (opened.status !== 0) throw new Error(`无法自动打开审阅页面：${opened.stderr || opened.stdout}`);
  }
  return session;
}
