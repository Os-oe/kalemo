// Headless-Chromium mit Fake-Kamera aus Datei -> test.html -> window.__result
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve('web');
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'image/jpeg' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = srv.address().port;
const CACHE = `${process.env.HOME}/Library/Caches/ms-playwright`;
const exe = {
  shell: `${CACHE}/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  chromium: `${CACHE}/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
};
const mode = process.argv[2] || 'shell';          // shell = alter Headless-Shell, chromium = "new headless"
const video = process.argv[3] || 'pointing.y4m';
const delegate = process.argv[4] || 'CPU';
const browser = await chromium.launch({
  executablePath: exe[mode], headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${path.join(ROOT, video)}`, ...(mode === 'chromium' ? ['--headless=new'] : [])],
});
const page = await browser.newPage();
const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
const t0 = Date.now();
await page.goto(`http://localhost:${port}/test.html?delegate=${delegate}`);
try { await page.waitForFunction(() => window.__result?.done, null, { timeout: 120000 }); } catch (e) { console.log('TIMEOUT'); }
const r = await page.evaluate(() => window.__result);
console.log(JSON.stringify({ mode, video, delegate, totalMs: Date.now() - t0, browserVersion: browser.version(), ...r, consoleErrors: [...new Set(errs)].slice(0, 5) }, null, 1));
await browser.close(); srv.close();
