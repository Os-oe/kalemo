#!/usr/bin/env python3
"""Canabalt-Selbsttest (Phase 1c): Greybox ohne Look — macht Malen-und-Raten Spaß?
Spielt 6 Runden mit menschlich langsamem Timing (echte Datensatz-Striche, teils nicht erkannte Zeichnungen),
protokolliert Tipp-Abfolge + Zeit bis Treffer, macht Screenshots. Ausgabe: tools/out/canabalt.json + PNGs."""
import json, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests'))
from playwright.sync_api import sync_playwright
from kt import server, wait_state, launch, ROOT

QD = json.load(open(os.path.join(ROOT, 'tools/data/quickdraw.json')))
OUT = os.path.join(ROOT, 'tools/out'); os.makedirs(OUT, exist_ok=True)
log = []
with server(8798) as base, sync_playwright() as p:
    b, ctx = launch(p)
    page = ctx.new_page(); page.goto(base + '/?test=1'); wait_state(page, 's.clfReady', 60000)
    page.evaluate('() => window.__setDate("2026-09-20")')
    plan = page.evaluate('() => window.__plan()')
    page.evaluate('() => window.__startDaily()')
    for i, slot in enumerate(plan['slots']):
        wid = slot['id']
        wait_state(page, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        # Runde 3 + 5: nicht erkannte Datensatz-Zeichnung (realistisches Scheitern)
        src = 'unrecognizedEval' if i in (2, 4) else 'eval'
        strokes = QD[wid][src][7]
        t0 = time.time()
        page.evaluate('(st) => { window.__feedStrokes(st, {timing: "real", ptMs: 45, gapMs: 650}); }', strokes)
        shot = False
        while True:
            s = page.evaluate('() => window.__state()')
            if not shot and s['round'] and s['round']['tips']:
                page.screenshot(path=f'{OUT}/canabalt-r{i + 1}-tip.png'); shot = True
            if s['overlay'] and s['lastResult'] and s['lastResult']['id'] == wid:
                break
            time.sleep(0.25)
        page.wait_for_timeout(400)
        page.screenshot(path=f'{OUT}/canabalt-r{i + 1}-{s["lastResult"]["result"]}.png')
        lr = s['lastResult']
        log.append({'round': i + 1, 'word': wid, 'source': src, 'result': lr['result'], 'hitAtMs': lr['hitAt'],
                    'tips': [(x['id'], x['p'], x['t']) for x in lr['tips']], 'bestWrong': lr['bestWrong'], 'wallS': round(time.time() - t0, 1)})
        print(log[-1], flush=True)
        page.evaluate('() => window.__next()')
    b.close()
json.dump(log, open(f'{OUT}/canabalt.json', 'w'), indent=1)
