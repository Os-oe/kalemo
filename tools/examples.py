#!/usr/bin/env python3
"""„So malen andere" nach Lesbarkeit kuratieren (Iteration 1, Review P3-5) → data/examples.json
Braucht tools/data/quickdraw.json (tools/fetch-quickdraw.mjs). Aufruf: python3 tools/examples.py [--sheet out.png]"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8796
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools/serve.py'), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={**os.environ, 'KALEMO_NO_CSP': '1'})  # Werkzeug-Seite hat Inline-Modul
try:
    for _ in range(50):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/tools/examples.html', timeout=1); break
        except Exception:
            time.sleep(0.2)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
        pg = b.new_page()
        pg.goto(f'http://127.0.0.1:{PORT}/tools/examples.html')
        pg.wait_for_function('typeof window.runExamples === "function"', timeout=30000)
        res = pg.evaluate('async () => await window.runExamples()')
        b.close()
    json.dump(res['out'], open(os.path.join(ROOT, 'data/examples.json'), 'w'), separators=(',', ':'))
    print('backend', res['backend'], '| Wörter', len(res['out']), '| ohne 3:', [k for k, v in res['out'].items() if len(v) < 3])
    for k in ('bicycle', 'sandwich', 'frog', 'cat', 'hospital', 'spoon'):
        print(k, res['stats'].get(k))
finally:
    srv.terminate()
