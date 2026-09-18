#!/usr/bin/env python3
"""Kontaktbögen für die visuelle Abnahme (Iteration 2/3): mehrere Frames eines Moments nebeneinander in einem PNG.
Aufruf: python3 tools/contact.py <base-url> <out-dir> [szene …]
Szenen: hit (Treffer-Moment mit „fertig malen", Desktop + Handy, 4 s) · card (Heute-Karte) · ycard (Gestern gemalt) ·
        landing (Empfänger-Landeseite) · partial (Mehrzahl-Teilerfolg)
Iteration 3: hit12 (Fertigmalen über 12 s, Desktop + Handy) · card3 (neue Teilen-Karte, mit und ohne Held) ·
        attract (Startseite über 25 s — Bandbreite der Motive)"""
import io, json, os, sys, base64
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1].rstrip('/'), sys.argv[2]
SCENES = sys.argv[3:] or ['hit', 'card', 'ycard', 'landing', 'partial']
FIXP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests/fixtures/strokes.json')
FIX = json.load(open(FIXP)) if os.path.exists(FIXP) else {}
SETUP = '() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})'
os.makedirs(OUT, exist_ok=True)
DESK = {'viewport': {'width': 1280, 'height': 800}, 'locale': 'de-DE'}
PHONE = {'viewport': {'width': 390, 'height': 844}, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True, 'locale': 'de-DE'}


def sheet(frames, labels, path, cols=4, scale=0.42):
    ims = [Image.open(io.BytesIO(f)).convert('RGB') for f in frames]
    w, h = int(ims[0].width * scale), int(ims[0].height * scale)
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (cols * (w + 8) + 8, rows * (h + 30) + 8), '#1b2233')
    d = ImageDraw.Draw(out)
    for i, (im, lab) in enumerate(zip(ims, labels)):
        x, y = 8 + (i % cols) * (w + 8), 8 + (i // cols) * (h + 30)
        out.paste(im.resize((w, h)), (x, y + 22)); d.text((x, y + 4), lab, fill='#FFC857')
    out.save(path)
    return path


with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    for name in SCENES:
        if name == 'hit':
            for label, kw in (('desktop', DESK), ('phone', PHONE)):
                c = b.new_context(**kw); pg = c.new_page()
                pg.goto(BASE + '/?demo=1&scene=hit&word=cat&nomusic=1')
                pg.wait_for_function('() => window.__kalemo && window.__kalemo.round && window.__kalemo.round.active && window.__kalemo.round.active.finishing', timeout=60000)
                frames, labels = [], []
                for k in range(12):
                    frames.append(pg.screenshot()); labels.append(f'+{k * 0.35:.2f} s')
                    pg.wait_for_timeout(350)
                print(sheet(frames, labels, os.path.join(OUT, f'sheet-hit-finish-{label}.png'), cols=4, scale=0.34 if label == 'desktop' else 0.28))
                c.close()
        elif name in ('card', 'ycard'):
            for label, kw in (('desktop', DESK), ('phone', PHONE)):
                c = b.new_context(**kw); pg = c.new_page()
                pg.goto(BASE + ('/?demo=1&scene=dayend&cardAt=800&nomusic=1' if name == 'card' else '/?test=1&scene=ycard'))
                pg.wait_for_selector('#sheet img.share-img', timeout=60000); pg.wait_for_timeout(900)
                frames = [pg.screenshot()]; pg.wait_for_timeout(1150); frames.append(pg.screenshot())
                src = pg.evaluate("() => document.querySelector('#sheet img.share-img').src")
                png = pg.evaluate('''async (src) => { const r = await fetch(src); const b = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); }''', src)
                open(os.path.join(OUT, f'{name}-full.png'), 'wb').write(base64.b64decode(png))
                print(sheet(frames, ['Vorschau', '+1,2 s (Rand-Glanz)'], os.path.join(OUT, f'sheet-{name}-{label}.png'), cols=2, scale=0.5 if label == 'desktop' else 0.35))
                c.close()
        elif name == 'landing':
            for label, kw in (('desktop', DESK), ('phone', PHONE)):
                c = b.new_context(**kw); pg = c.new_page()
                pg.goto(BASE + '/?demo=1&scene=landing&nomusic=1')
                pg.wait_for_selector('#duel-body [data-act=go]', timeout=60000)
                frames, labels = [], []
                for k in range(4):
                    frames.append(pg.screenshot()); labels.append(f'+{k * 0.8:.1f} s'); pg.wait_for_timeout(800)
                print(sheet(frames, labels, os.path.join(OUT, f'sheet-landing-{label}.png'), cols=4, scale=0.3 if label == 'desktop' else 0.25))
                c.close()
        elif name == 'hit12':
            # Iteration 3 (R3-P2-1): nach dem Erkennen 10 Striche über ~10 s weitermalen — der Deckel zählt nur Ruhe
            for label, kw in (('desktop', DESK), ('phone', PHONE)):
                c = b.new_context(**kw); pg = c.new_page()
                pg.goto(BASE + '/?test=1')
                pg.wait_for_function('() => { const s = window.__state && window.__state(); return s && s.clfReady; }', timeout=90000)
                pg.evaluate(SETUP)
                plan = pg.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']
                pg.evaluate('() => window.__startDaily()')
                pg.wait_for_function(f'() => {{ const s = window.__state(); return s.round && s.round.target === {json.dumps(wid)}; }}', timeout=60000)
                pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[wid][0])
                pg.wait_for_function('() => { const s = window.__state(); return s.round && s.round.finishing; }', timeout=60000)
                pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 16, gapMs: 600})',
                            [[[30, 120, 210], [40 + 18 * k, 40 + 18 * k, 40 + 18 * k]] for k in range(10)])
                frames, labels = [], []
                for k in range(12):
                    frames.append(pg.screenshot()); labels.append(f'+{k * 1.2:.1f} s nach dem Treffer')
                    pg.wait_for_timeout(1200)
                print(sheet(frames, labels, os.path.join(OUT, f'sheet-hit12-{label}.png'), cols=4, scale=0.34 if label == 'desktop' else 0.28))
                c.close()
        elif name == 'card3':
            # Iteration 3 (R3-P1-1): neue Teilen-Karte — einmal mit Held (fremdes Wort im Bildwörterbuch), einmal ohne
            c = b.new_context(**DESK); pg = c.new_page()
            pg.goto(BASE + '/?test=1')
            pg.wait_for_function('() => { const s = window.__state && window.__state(); return s && s.clfReady; }', timeout=90000)
            pg.evaluate(SETUP)
            soon = pg.evaluate('''async (n) => { const pl = await import('/js/core/plan.js'); const app = window.__kalemo; const out = [];
              for (let k = 0; k <= n; k++) out.push(...pl.planFor(pl.addDays(app.today(), k), app.words).slots.map(s => s.id)); return out; }''', 2)
            pick = next(x for x in ('spider', 'octopus', 'key', 'crown', 'cake') if x not in soon and x in FIX)
            for tag, hero in (('ohne-held', False), ('mit-held', True)):
                png = pg.evaluate('''async ([hero, pick, strokes]) => {
                  const app = window.__kalemo; const m = await import('/js/game/cards.js'); const ds = await import('/js/core/dictstore.js');
                  const plan = window.__plan();
                  if (hero) await ds.put(pick, { strokes, date: '2026-01-01' });
                  const sum = { number: plan.number, date: app.today(), hits: 4, points: 320, scored: true, learn: 'tr', native: 'de', streak: 3,
                    results: plan.slots.map((s, i) => ({ id: s.id, kind: s.kind, n: s.n, parts: s.kind === 'plural' ? s.n : undefined,
                      result: i === 3 ? 'timeout' : 'hit', hitAt: 3400 + i * 1400, points: 80, strokes: [],
                      tips: i === 1 ? [{ id: 'moon', p: 0.62 }] : [] })),
                    funniest: { target: plan.slots[1].id, id: 'moon', p: 0.62, idx: 1 } };
                  const card = await m.todayCard(app, sum);
                  const buf = new Uint8Array(await card.blob.arrayBuffer()); let s = '';
                  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
                  return btoa(s); }''', [hero, pick, FIX[pick][0]])
                open(os.path.join(OUT, f'card3-{tag}.png'), 'wb').write(base64.b64decode(png))
                print(os.path.join(OUT, f'card3-{tag}.png'))
            c.close()
        elif name == 'attract':
            # Iteration 3 (R3-P2-4): 25 s Startseite — wechseln die Motive, ist die Mal-Phase die längste?
            for label, kw in (('desktop', DESK), ('phone', PHONE)):
                c = b.new_context(**kw); pg = c.new_page()
                pg.goto(BASE + '/?test=1')
                pg.wait_for_function('() => { const s = window.__state && window.__state(); return s && s.ready; }', timeout=90000)
                pg.wait_for_timeout(600)
                frames, labels = [], []
                for k in range(12):
                    frames.append(pg.screenshot())
                    info = pg.evaluate('() => (window.__kalemo.attract.info || {}).motif || "?"')
                    labels.append(f'{k * 2.1:.1f} s · {info}')
                    pg.wait_for_timeout(2100)
                print(sheet(frames, labels, os.path.join(OUT, f'sheet-attract-{label}.png'), cols=4, scale=0.3 if label == 'desktop' else 0.25))
                c.close()
        elif name == 'partial':
            for label, kw in (('desktop', DESK), ('phone', PHONE)):
                c = b.new_context(**kw); pg = c.new_page()
                pg.goto(BASE + '/?test=1&scene=partial')
                pg.wait_for_selector('#round-overlay canvas.alive', timeout=60000)
                frames, labels = [], []
                for k in range(4):
                    frames.append(pg.screenshot()); labels.append(f'+{k * 0.7:.1f} s'); pg.wait_for_timeout(700)
                print(sheet(frames, labels, os.path.join(OUT, f'sheet-partial-{label}.png'), cols=4, scale=0.3 if label == 'desktop' else 0.25))
                c.close()
    b.close()
