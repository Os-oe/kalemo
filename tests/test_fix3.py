"""Iteration 3 (Fix-Session nach Review 3). Ein Block je Befund — gezielt: python3 test_fix3.py R3-P1-1
Report: tests/reports/fix3.jsonl"""
import json, os, re, sys
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT, WORDS, play_daily_hooks, play_slot_hooks, word_forms, leaks

S = Suite('fix3')
ONLY = {x.upper() for x in (sys.argv[1:] or os.environ.get('FIX3_ONLY', '').split(',')) if x}
on = lambda k: not ONLY or k.upper() in ONLY
DESK = {'viewport': {'width': 1280, 'height': 800}, 'locale': 'de-DE'}
SETUP = '() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})'

with server(8796) as base, sync_playwright() as p:
    b, _ = launch(p)

    def fresh(**kw):
        c = b.new_context(**{**DESK, **kw}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        return c, pg, errs

    # ---------------- R3-P1-1 Teilen-Karte: spoilerfrei UND vorzeigbar ----------------
    def p1_1():
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            plan, _ = play_daily_hooks(pg, 'tr')
            ids = [s['id'] for s in plan['slots']]; forms = word_forms(ids)
            pg.click('#btn-share', force=True)
            st = wait_state(pg, 's.lastCard && s.lastCard.rows && s.sheet', 40000)
            lc = st['lastCard']
            S.check('R3-P1-1 PNG 1080×1350 und postbar groß (> 60 KB)', lc['w'] == 1080 and lc['h'] == 1350 and lc['bytes'] > 60000, (lc['w'], lc['h'], lc['bytes']))
            S.check('R3-P1-1 je gespieltem Wort genau eine Textzeile', len(lc['rows']) == len(st['summary']['results'][:5]) and [r['i'] for r in lc['rows']] == list(range(len(lc['rows']))), lc['rows'])
            # Wortlaut der Zeilen: Fehltipp / sofort erkannt / gerätselt / Zeit um — nie das Zielwort
            texts = [r['text'] for r in lc['rows']]
            S.check('R3-P1-1 Zeilentexte aus dem festen Satzvorrat', all(re.match(r'^(die KI dachte: |sofort erkannt$|die KI hat gerätselt$|Zeit um$|Fast! \d+ von \d+$)', x) for x in texts), texts)
            S.check('R3-P1-1 (G1) keine Wortform des Tages in Zeilen, Zitat oder Teilen-Text', not leaks(' '.join(texts) + ' ' + (lc['quote'] or '') + ' ' + lc['text'], forms), (texts, lc['quote']))
            S.check('R3-P1-1 ✓/✗ und Sekunden je Zeile stimmen mit dem Ergebnis', all((r['secs'] != '') == r['ok'] for r in lc['rows']), lc['rows'])
            # Held-Regel: nur Wörter, die heute und in den nächsten 2 Tagen NICHT drankommen
            soon = pg.evaluate('''async (n) => { const p = await import('/js/core/plan.js'); const app = window.__kalemo; const out = [];
              for (let k = 0; k <= n; k++) out.push(...p.planFor(p.addDays(app.today(), k), app.words).slots.map(s => s.id)); return out; }''', 2)
            S.check('R3-P1-1 Held (falls vorhanden) kommt heute und in den nächsten 2 Tagen nicht dran', lc['hero'] is None or lc['hero']['id'] not in soon, (lc['hero'], soon))
            # Held erzwingen: eine fremde, scharfe Zeichnung ins Bildwörterbuch legen → muss Held werden
            pick = next(x for x in ('spider', 'octopus', 'key', 'crown', 'cake', 'guitar', 'bee', 'camel') if x not in soon and x in FIX)
            hero = pg.evaluate('''async ([pick, strokes]) => { const ds = await import('/js/core/dictstore.js'); const m = await import('/js/game/cards.js'); const app = window.__kalemo;
              await ds.put(pick, { strokes, date: '2026-01-01' });
              const card = await m.todayCard(app, app.lastSummary);
              return { want: pick, hero: card.hero, box: card.heroBox ? { w: Math.round(card.heroBox.w), h: Math.round(card.heroBox.h) } : null }; }''', [pick, FIX[pick][0]])
            S.check('R3-P1-1 Held-Regel greift: scharfe fremde Zeichnung wird Held und bekommt Platz', hero['hero'] and hero['hero']['id'] == hero['want'] and hero['box'] and hero['box']['w'] > 400 and hero['box']['h'] > 180, hero)
            # Gegenprobe: ein Wort aus dem heutigen/nächsten Plan wird NIE Held, auch wenn es scharf im Wörterbuch liegt
            blocked = pg.evaluate('''async ([id, strokes]) => { const ds = await import('/js/core/dictstore.js'); const m = await import('/js/game/cards.js'); const app = window.__kalemo;
              await ds.put(id, { strokes, date: '2030-01-01' });
              const card = await m.todayCard(app, app.lastSummary); return card.hero; }''', [soon[5], FIX[soon[5]][0]])
            S.check('R3-P1-1 Gegenprobe: Wort aus einem der nächsten Tagespläne wird nie Held', blocked is None or blocked['id'] != soon[5], (blocked, soon[5]))
            S.check('R3-P1-1: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def p1_1_nohero():
        """Frischer Kontext ohne Bildwörterbuch-Einträge: Karte muss auch ohne Held gut aussehen (Papier, Zeilen, Zitat)."""
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            r = pg.evaluate('''async () => { const app = window.__kalemo; const m = await import('/js/game/cards.js');
              const ds = await import('/js/core/dictstore.js'); const plan = window.__plan();
              const sum = { number: plan.number, date: app.today(), hits: 4, points: 320, scored: true, learn: 'tr', native: 'de', streak: 2,
                results: plan.slots.map((s, i) => ({ id: s.id, kind: s.kind, n: s.n, result: i === 3 ? 'timeout' : 'hit', hitAt: 3000 + i * 900,
                  points: 80, strokes: [], tips: i === 1 ? [{ id: 'moon', p: 0.6 }] : [] })), funniest: { target: plan.slots[1].id, id: 'moon', p: 0.6, idx: 1 } };
              const card = await m.todayCard(app, sum);
              const ctx = card.canvas.getContext('2d'); const d = ctx.getImageData(60, 300, 960, 900).data;
              let s2 = 0; for (let i = 0; i < d.length; i += 4) s2 += (d[i] + d[i + 1] + d[i + 2]) / 3;
              return { hero: card.hero, rows: card.rows, avg: Math.round(s2 / (d.length / 4)), bytes: card.blob.size, quote: card.quote }; }''')
            S.check('R3-P1-1 ohne Held: 5 Zeilen, Zitat, Papier bleibt hell (kein Wollknäuel)', r['hero'] is None and len(r['rows']) == 5 and r['quote'] and r['avg'] > 200, {k: v for k, v in r.items() if k != 'rows'})
            S.check('R3-P1-1 ohne Held: Zeilen ohne Fehltipp sagen „sofort erkannt" bzw. „Zeit um"', r['rows'][0]['text'] == 'sofort erkannt' and r['rows'][3]['text'] in ('Zeit um', 'Fast! 0 von 2'), [x['text'] for x in r['rows']])
            S.check('R3-P1-1 ohne Held: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    if on('R3-P1-1'):
        S.run('R3-P1-1 Teilen-Karte', p1_1); S.run('R3-P1-1 ohne Held', p1_1_nohero)

    b.close()
S.finish()
