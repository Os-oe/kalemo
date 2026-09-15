#!/usr/bin/env python3
"""Genauigkeits-Gate (Phase 1b): startet Dev-Server, führt tools/accuracy.html in Chromium aus und schreibt
tools/accuracy-report.json · data/words.json (Pool) · data/others.json (So malen andere) · tests/fixtures/strokes.json
Aufruf: python3 tools/accuracy.py"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8791
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools/serve.py'), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/tools/accuracy.html', timeout=1); break
        except Exception:
            time.sleep(0.2)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
        pg = b.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(f'http://127.0.0.1:{PORT}/tools/accuracy.html')
        pg.wait_for_function('typeof window.runAccuracy === "function"', timeout=30000)
        res = pg.evaluate('async () => await window.runAccuracy({})')
        b.close()
    rep = res['report']
    json.dump(rep, open(os.path.join(ROOT, 'tools/accuracy-report.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(res['pool'], open(os.path.join(ROOT, 'data/words.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    # Striche kompakt: ganzzahlig (Datensatz ist bereits ganzzahlig)
    json.dump(res['curated'], open(os.path.join(ROOT, 'data/others.json'), 'w'), separators=(',', ':'))
    os.makedirs(os.path.join(ROOT, 'tests/fixtures'), exist_ok=True)
    json.dump(res['fixtures'], open(os.path.join(ROOT, 'tests/fixtures/strokes.json'), 'w'), separators=(',', ':'))
    print('backend-log errors:', errs[:3])
    print('GATE', 'PASS' if rep['gate']['pass'] else 'FAIL', '| pool', rep['poolSize'], '| air', rep['final']['air'], '| clean', rep['final']['clean'], '| unrec(info)', rep['final']['airUnrecognizedInfo'])
    print('iterations', json.dumps(rep['iterations'], ensure_ascii=False))
    print('removed', [(r['id'], r['top3'], r['confusions']) for r in rep['removed']])
    low = sorted(rep['perWord'].items(), key=lambda kv: kv[1]['air']['top3'])[:12]
    print('schwächste im Pool', [(k, v['air']['top3'], v['air']['conf']) for k, v in low])
    print('curated ohne 3:', [k for k, v in res['curated'].items() if len(v) < 3], '| fixtures ohne 2:', [k for k, v in res['fixtures'].items() if len(v) < 2])
    print('ms', rep['ms'])
finally:
    srv.terminate()
