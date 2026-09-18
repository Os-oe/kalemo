"""Iteration 3 (Fix-Session nach Review 3). Ein Block je Befund — gezielt: python3 test_fix3.py R3-P1-1
Report: tests/reports/fix3.jsonl"""
import json, os, re, sys
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT, WORDS, CLIP_SPY, UA_IG, play_daily_hooks, play_slot_hooks, word_forms, leaks

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

    # ---------------- R3-P2-1 Fertigmal-Fenster: Deckel zählt nur Ruhe ----------------
    def line(y, x0=30, x1=210):
        return [[x0, (x0 + x1) // 2, x1], [y, y, y]]

    def start_round(pg):
        """Frischer Kontext, Wort 1 der Tagesskizze bis zum Erkennen malen. Liefert (plan, Zustand nach dem Treffer)."""
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
        plan = pg.evaluate('() => window.__plan()')
        pg.evaluate('() => window.__startDaily()')
        wid = plan['slots'][0]['id']
        wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 30000)
        pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[wid][0])
        return plan, wait_state(pg, 's.round && s.round.finishing', 40000)

    def p2_1_strokes():
        c, pg, errs = fresh()
        try:
            plan, st = start_round(pg)
            after = [line(60), line(90), line(120), line(150), line(180)]
            before = pg.evaluate('() => window.__kalemo.stage.strokes.length')
            t0 = pg.evaluate('() => performance.now()')
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 16, gapMs: 700})', after)
            t1 = pg.evaluate('() => performance.now()')
            res = wait_state(pg, 's.lastResult && s.overlay', 20000)
            t2 = pg.evaluate('() => performance.now()')
            lr = res['lastResult']
            S.check('R3-P2-1 fünf Striche nach dem Erkennen (≈ 5 s Malzeit) landen alle in der Zeichnung', lr['strokes'] - before == 5, (lr['strokes'], before, round(t1 - t0)))
            pause = (t2 - t1) + 700  # __feedStrokes wartet nach dem letzten Strich noch gapMs = 700 ms
            S.check('R3-P2-1 Karte kommt ~1,2 s nach dem letzten Strich (nicht mitten im Malen)', t1 - t0 > 3800 and 1000 <= pause <= 3200, (round(t1 - t0), round(pause)))
            S.check('R3-P2-1 Striche: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def p2_1_hard():
        c, pg, errs = fresh()
        try:
            plan, st = start_round(pg)
            rec = st['round']['recognizedAt']  # der absolute Deckel zählt ab dem Erkennen, nicht ab dem Teststart
            before = pg.evaluate('() => window.__kalemo.stage.strokes.length')
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 20, gapMs: 250})', [line(40 + 6 * k) for k in range(30)])
            res = wait_state(pg, 's.lastResult && s.overlay', 30000)
            dt = pg.evaluate('() => performance.now()') - rec
            S.check('R3-P2-1 Dauer-Malen endet nach dem absoluten Deckel von 12 s ab dem Erkennen', 11500 <= dt <= 17000, round(dt))
            S.check('R3-P2-1 Dauer-Malen: die bis dahin gemalten Striche sind gespeichert (mehr als der alte 4-s-Deckel zuließ)', res['lastResult']['strokes'] - before >= 8, (res['lastResult']['strokes'], before))
            S.check('R3-P2-1 Deckel: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def p2_1_finish_btn():
        c, pg, errs = fresh()
        try:
            plan, st = start_round(pg)
            btn = pg.evaluate('() => { const b = document.getElementById("round-done"); return { hidden: b.hidden, text: b.textContent }; }')
            pg.click('#round-done', force=True)
            res = wait_state(pg, 's.lastResult && s.overlay', 10000)
            S.check('R3-P2-1 „Fertig" bleibt: Knopf sichtbar und beendet sofort', btn['hidden'] is False and btn['text'] == 'Fertig' and res['lastResult']['result'] == 'hit', btn)
        finally:
            c.close()

    if on('R3-P2-1'):
        S.run('R3-P2-1 Striche nach dem Treffer', p2_1_strokes); S.run('R3-P2-1 absoluter Deckel', p2_1_hard); S.run('R3-P2-1 Fertig-Knopf', p2_1_finish_btn)

    # ---------------- R3-P2-2 Widerspruch auf der Treffer-Karte ----------------
    def p2_2():
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            r = pg.evaluate('''async () => { const m = await import('/js/game/round.js'); const i = await import('/js/core/i18n.js'); const a = window.__kalemo;
              const names = a.clf.classNames, idx = (x) => names.indexOf(x);
              const tree = a.byId.get('tree'), fish = a.byId.get('fish'), snail = a.byId.get('snail');
              const sib = m.nearMiss(tree, { top: [{ id: 'tree', p: 0.7, sub: idx('palm_tree'), subP: 0.6, ownP: 0.1 }] }, names);
              const wordish = m.nearMiss(fish, { top: [{ id: 'whale', p: 0.8 }, { id: 'fish', p: 0.15 }] }, names);
              const plain = m.nearMiss(snail, { top: [{ id: 'snail', p: 0.95 }] }, names);
              return { sib: sib && sib.kind, sibLine: sib && i.nearMissLine(sib, 'de'), wordish, plain }; }''')
            S.check('R3-P2-2 Nachbar-Klasse (Palme für Baum) → Hinweis', r['sib'] == 'sibling' and r['sibLine'] == 'Fast — das ist eher eine Palme. Zählt trotzdem!', r)
            S.check('R3-P2-2 „anderes Pool-Wort liegt vorn" (Wal statt Fisch) → kein Hinweis mehr', r['wordish'] is None, r['wordish'])
            S.check('R3-P2-2 klarer Treffer → kein Hinweis', r['plain'] is None, r['plain'])
            # echte Runde: Treffer-Karte darf sich nicht selbst widersprechen
            plan = pg.evaluate('() => window.__plan()')
            pg.evaluate('() => window.__startDaily()')
            st = play_slot_hooks(pg, plan['slots'][0], 'tr')
            card = pg.text_content('#round-overlay') or ''
            S.check('R3-P2-2 normaler Treffer: Karte sagt „Erkannt!" ohne „Fast — das ist eher …"', 'Erkannt' in card and 'Fast —' not in card and pg.query_selector('#round-overlay .tipcard.near') is None, card[:160])
            S.check('R3-P2-2: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    if on('R3-P2-2'):
        S.run('R3-P2-2 Nachbar-Hinweis', p2_2)

    # ---------------- R3-P2-3 Treffer-Karte am Desktop ----------------
    def p2_3():
        for vw, vh, tall in ((1440, 900, True), (1280, 800, True), (1366, 657, False)):
            c, pg, errs = fresh(viewport={'width': vw, 'height': vh})
            try:
                pg.goto(base + '/?test=1&scene=hit&word=cat&k=0')
                pg.wait_for_selector('#round-overlay canvas.alive', timeout=40000); pg.wait_for_timeout(900)
                m = pg.evaluate('''() => { const a = document.querySelector('#round-overlay canvas.alive').getBoundingClientRect();
                  const k = document.querySelector('#round-overlay .card').getBoundingClientRect();
                  const l = document.querySelector('#round-overlay .langs').getBoundingClientRect();
                  const cs = getComputedStyle(document.querySelector('#round-overlay .card'));
                  return { aw: Math.round(a.width), ah: Math.round(a.height), ab: Math.round(a.bottom), kw: Math.round(k.width), kh: Math.round(k.height),
                    kt: Math.round(k.top), kb: Math.round(k.bottom), lt: Math.round(l.top), ih: innerHeight, cols: cs.gridTemplateColumns }; }''')
                fill = m['aw'] / m['kw']
                if tall:
                    S.check(f'R3-P2-3 {vw}×{vh}: hochkant (Karte ≤ 600 px), Sprachen unter der Zeichnung, Füllgrad {fill:.0%} ≥ 70 %', m['kw'] <= 600 and fill >= 0.7 and m['lt'] >= m['ab'] - 4, m)
                else:
                    S.check(f'R3-P2-3 {vw}×{vh}: flaches Fenster bleibt zweispaltig, Zeichnung groß ({m["aw"]} px)', m['kw'] > 700 and m['aw'] >= 455 and m['lt'] < m['ab'], m)
                S.check(f'R3-P2-3 {vw}×{vh}: Karte vollständig im ersten Bild', m['kt'] >= 0 and m['kb'] <= m['ih'], m)
            finally:
                c.close()

    if on('R3-P2-3'):
        S.run('R3-P2-3 Treffer-Karte Desktop', p2_3)

    # ---------------- R3-P2-4 Attract-Loop mit Bandbreite ----------------
    def p2_4():
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            plan_ids = [s['id'] for s in pg.evaluate('() => window.__plan()')['slots']]
            curated = set(m.group(1) for m in re.finditer(r"\['([a-z ]+)', '(?:new|review|plural)'", open(os.path.join(ROOT, 'js/core/plan.js')).read()))
            for native, learn in (('de', 'tr'), ('tr', 'de'), ('de', 'en')):
                pg.evaluate('(p) => window.__settings(p)', {'native': native, 'learn': learn, 'chosenPair': True})
                pg.evaluate('() => window.__kalemo.attract.refresh()')
                seen = []
                loop = pg.evaluate('''async () => { const a = await import('/js/game/attract.js'); return a.LOOP; }''')
                # 25 s Beobachtung wie im Review — in Schleifen-Zeit abgetastet, damit der Test nicht 25 s wartet
                for k in range(0, int(25 / 0.5)):
                    pg.evaluate('(s) => window.__kalemo.attract.at(s)', k * 0.5); pg.wait_for_timeout(22)
                    seen.append(pg.evaluate('() => window.__kalemo.attract.info.motif'))
                uniq = sorted(set(seen))
                S.check(f'R3-P2-4 {native}→{learn}: in 25 s mindestens 2 verschiedene Motive', len(uniq) >= 2, (uniq, round(loop, 1)))
                S.check(f'R3-P2-4 {native}→{learn}: 3–4 Motive vorgesehen, keins aus den Launch-Tagen oder dem Tagesplan', 3 <= len(pg.evaluate('() => window.__kalemo.attract.info.motifs')) <= 4 and not (set(pg.evaluate('() => window.__kalemo.attract.info.motifs')) & (curated | set(plan_ids))), pg.evaluate('() => window.__kalemo.attract.info.motifs'))
            times = pg.evaluate('''async () => { const a = await import('/js/game/attract.js'); return a.LOOP; }''')
            phases = pg.evaluate('''async () => { const src = await fetch('/js/game/attract.js').then(r => r.text());
              const m = src.match(/const DRAW_START = ([\\d.]+), DRAW_END = ([\\d.]+), HIT_AT = ([\\d.]+), CARD_AT = ([\\d.]+), FADE = ([\\d.]+)/);
              return m ? m.slice(1).map(Number) : null; }''')
            draw = phases[1] - phases[0]; card = (times - phases[4] - 0.35) - phases[3]
            S.check('R3-P2-4 Malen ≥ 50 % der Schleife und länger als die Auflösungskarte', draw >= times * 0.5 and draw > card, {'loop': times, 'malen': round(draw, 2), 'karte': round(card, 2)})
            S.check('R3-P2-4: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    if on('R3-P2-4'):
        S.run('R3-P2-4 Attract-Loop', p2_4)

    # ---------------- R3-P2-5 schwache Wörter aus den Launch-Tagen ----------------
    def p2_5_plan():
        src = open(os.path.join(ROOT, 'js/core/plan.js')).read()
        days = re.search(r'export const CURATED = \[(.*?)\n\];', src, re.S).group(1)
        rows = [re.findall(r"\['([a-z_ ]+)', '(new|review|plural)'", d) for d in days.strip().split('\n')]
        ids = {i for row in rows for i, _ in row}
        S.check('R3-P2-5 „eye/göz" und „foot/ayak" stehen in keinem der kuratierten Tage #1–#14', 'eye' not in ids and 'foot' not in ids, sorted(ids))
        S.check('R3-P2-5 Tag #4 hat Ersatz statt „eye": 5 Slots, Wort 4 ist „tooth"', len(rows) == 14 and len(rows[3]) == 5 and rows[3][3][0] == 'tooth', rows[3])
        bad = [(i, WORDS[i]['acc'], WORDS[i]['acc1']) for i in sorted(ids) if not (WORDS[i]['acc'] >= 0.90 and WORDS[i]['acc1'] >= 0.80)]
        S.check('R3-P2-5 Genauigkeitsregel gilt für alle kuratierten Wörter (Top-3 ≥ 90 % UND Top-1 ≥ 80 %)', not bad, bad)
        S.check('R3-P2-5 Ersatzwort erfüllt die Regel deutlich', WORDS['tooth']['acc'] >= 0.90 and WORDS['tooth']['acc1'] >= 0.80, (WORDS['tooth']['acc'], WORDS['tooth']['acc1']))

    def p2_5_sibling():
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            r = pg.evaluate('''async ([footS, legS]) => { const a = window.__kalemo; const m = await import('/js/game/round.js'); const i = await import('/js/core/i18n.js');
              const cl = await import('/js/core/classifier.js');
              const f = await a.clf.classify(footS), l = await a.clf.classify(legS);
              const near = m.nearMiss(a.byId.get('foot'), f, a.clf.classNames);
              return { foot: f.top.slice(0, 3).map(x => x.id), leg: l.top.slice(0, 3).map(x => x.id),
                syn: cl.SYNONYMS.foot || null, near: near && near.kind, line: near && i.nearMissLine(near, 'de') }; }''', [FIX['foot'][0], FIX['leg'][0]])
            S.check('R3-P2-5 „Bein" zählt beim Fuß als Nachbar-Klasse (Treffer statt Fehlschlag)', r['syn'] == ['leg'] and 'foot' in r['foot'], r)
            S.check('R3-P2-5 „Bein" selbst wird weiterhin erkannt (Top-3)', 'leg' in r['leg'], r['leg'])
            if r['near']:
                S.check('R3-P2-5 ehrlicher Hinweis, wenn der Treffer über „Bein" kam', r['near'] == 'sibling' and r['line'] == 'Fast — das ist eher ein Bein. Zählt trotzdem!', r)
            else:
                S.check('R3-P2-5 kein Hinweis, weil der Fuß direkt erkannt wurde (kein Nachbar-Treffer)', r['foot'][0] == 'foot', r)
            S.check('R3-P2-5: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    if on('R3-P2-5'):
        S.run('R3-P2-5 Launch-Tage', p2_5_plan); S.run('R3-P2-5 Fuß/Bein', p2_5_sibling)

    # ---------------- P3-Feinschliff ----------------
    def p3_2_6():
        """R3-P3-2 Rückmeldung „Text kopiert." · R3-P3-6 Gestern-Kachel heißt „Ansehen" und öffnet die Karte."""
        c, pg, errs = fresh(); c.add_init_script(CLIP_SPY)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            play_daily_hooks(pg, 'tr')
            pg.click('#btn-share', force=True)
            wait_state(pg, 's.lastCard && s.sheet', 40000)
            pg.click('#sheet [data-act=copytext]', force=True); pg.wait_for_timeout(400)
            st = pg.evaluate('() => window.__state()')
            hint = pg.query_selector('#sheet .share-copied')
            S.check('R3-P3-2 „Text kopieren" meldet zurück (Toast wie beim Link + Zeile im Blatt)', st['toast'] == 'Text kopiert.' and hint is not None and not hint.is_hidden() and (pg.evaluate('() => window.__clip || null') or ''), (st['toast'], hint is not None))
            pg.click('#sheet [data-act=close]', force=True)
            # Gestern-Kachel am Folgetag
            y_iso = pg.evaluate('async () => { const p = await import("/js/core/plan.js"); return p.addDays(window.__kalemo.today(), -1); }')
            ids = [s['id'] for s in pg.evaluate('() => window.__plan()')['slots']]
            free = [x for x in ('spider', 'octopus', 'key', 'crown', 'cake') if x not in ids][:5]
            ysum = {'number': 7, 'date': y_iso, 'hits': 5, 'points': 400, 'scored': True, 'learn': 'tr', 'native': 'de',
                    'results': [{'id': i, 'kind': 'new', 'result': 'hit', 'hitAt': 3000, 'points': 80, 'strokes': FIX[i][0], 'tips': []} for i in free],
                    'funniest': None}
            pg.evaluate('([iso, sum]) => { localStorage.setItem("kalemo.day." + iso, JSON.stringify(sum)); window.__home(); return 1; }', [y_iso, ysum])
            pg.wait_for_selector('#btn-yesterday:not([hidden])', timeout=8000)
            label = pg.text_content('#btn-yesterday')
            # Der Toast von eben liegt noch über der Kachel — er darf den Tipp nicht schlucken (pointer-events: none)
            hit = pg.evaluate('''() => { const t = document.querySelector('#yesterday-tile').getBoundingClientRect();
              const el = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return el ? el.closest('#yesterday-tile') !== null : false; }''')
            S.check('R3-P3-2 Toast schluckt keinen Tipp (liegt über der Gestern-Kachel)', hit, hit)
            pg.click('#yesterday-tile', force=True)
            st2 = wait_state(pg, 's.lastCard && s.lastCard.kind === "yesterday" && s.sheet', 40000)
            S.check('R3-P3-6 Kachel heißt „Ansehen" und öffnet direkt die Gestern-Karte', label == 'Ansehen' and pg.query_selector('#sheet img.share-img') is not None, (label, st2['lastCard']['bytes']))
            S.check('R3-P3-2/6: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def p3_5_7():
        """R3-P3-5 Miss-Blasen zweisprachig · R3-P3-7 Übersetzung eines Fehltipps nur, wenn er nicht nah am Zielwort liegt."""
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            r = pg.evaluate('''async () => { const a = window.__kalemo; a.show('round'); a.round.showWord(a.byId.get('foot'));
              const p = a.round.draw({ id: 'foot', durationMs: 1400 });
              await new Promise(r => setTimeout(r, 150));
              a.round._handle(a.round.active, [{ type: 'hard' }]);
              const hard = document.getElementById('bubble').innerHTML;
              a.round.showBubble('Hmm… bacak?', a.byId.get('leg'));      // naher Nachbar → keine Übersetzung
              const near = document.getElementById('bubble').innerHTML;
              a.round.showBubble('Hmm… aslan?', a.byId.get('lion'));     // weit weg → Übersetzung hilft
              const far = document.getElementById('bubble').innerHTML;
              await p; await new Promise(r => setTimeout(r, 200));
              const up = document.getElementById('bubble').innerHTML;
              return { hard, near, far, up }; }''')
            S.check('R3-P3-5 „Hmm, zor…" zweisprachig', 'Hmm, zor' in r['hard'] and 'bubble-sub' in r['hard'] and 'Hmm, schwierig' in r['hard'], r['hard'])
            S.check('R3-P3-5 „Süre doldu." zweisprachig', 'Süre doldu' in r['up'] and 'bubble-sub' in r['up'] and 'Zeit ist um' in r['up'], r['up'])
            S.check('R3-P3-7 naher Fehltipp (bacak bei ayak) ohne Übersetzung', 'bubble-sub' not in r['near'], r['near'])
            S.check('R3-P3-7 weit entfernter Fehltipp (aslan) weiterhin mit Übersetzung', 'bubble-sub' in r['far'] and 'Löwe' in r['far'], r['far'])
            S.check('R3-P3-5/7: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def p3_3():
        """R3-P3-3 Rückspiel-Link bietet auch „Erst Tagesskizze"."""
        mk, mp, _ = fresh()
        rc, rp, rerr = fresh()
        try:
            mp.goto(base + '/?test=1'); wait_state(mp, 's.clfReady', 60000)
            ids = [s['id'] for s in mp.evaluate('() => window.__plan()')['slots']]
            free = next(x for x in ('spider', 'octopus', 'key', 'crown', 'cake') if x not in ids)
            code = mp.evaluate('''async ([st, cls]) => { const c = await import('/js/core/codec.js'); let t = 0;
              const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 30); t += xs.length * 30 + 200; return [xs, ys, ts]; });
              return c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf(cls), senderMs: 3200, strokes, score: [1, 0], from: 2222, to: 3333 }); }''', [FIX[free][0], WORDS[free]['cls']])
            rp.goto(base + '/?test=1#d=' + code)
            rp.wait_for_selector('#duel-body [data-act=go]', timeout=30000); rp.wait_for_timeout(600)
            gate = rp.query_selector('#duel-body [data-act=daily-first]')
            land = rp.text_content('#duel-body') or ''
            S.check('R3-P3-3 Rückspiel-Link (kein Tageswort): „Schau zu …" UND „Erst Tagesskizze #N"', gate is not None and 'Tagesskizze' in (gate.text_content() or '') and 'Schau zu' in land, land[:200])
            S.check('R3-P3-3 Hauptweg bleibt das Duell (Zuschauen zuerst)', 'primary' in (rp.get_attribute('#duel-body [data-act=go]', 'class') or ''), rp.get_attribute('#duel-body [data-act=go]', 'class'))
            S.check('R3-P3-3: keine Seitenfehler', not rerr, rerr[:2])
        finally:
            rc.close(); mk.close()

    def p3_1():
        """R3-P3-1 1366×657: Duell + Wörterbuch nicht mehr angeschnitten."""
        c, pg, errs = fresh(viewport={'width': 1366, 'height': 657})
        try:
            pg.goto(base + '/?test=1&lazy=1'); pg.wait_for_function('() => window.__kalemo && window.__kalemo.ready', timeout=60000); pg.wait_for_timeout(900)
            m = pg.evaluate('''() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
              return { daily: r('#btn-daily'), duel: r('#btn-duel'), dict: r('#btn-dict'), foot: r('.foot'), ih: innerHeight, scroll: document.querySelector('#screen-start').scrollTop }; }''')
            inside = lambda k: m[k][0] >= 0 and m[k][1] <= m['ih']
            S.check('R3-P3-1 1366×657: Tagesskizze, Luft-Duell und Bildwörterbuch vollständig im ersten Bild', inside('daily') and inside('duel') and inside('dict') and m['scroll'] == 0, m)
            S.check('R3-P3-1 1366×657: auch die Fußzeile liegt im Bild', inside('foot'), m['foot'])
            S.check('R3-P3-1: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def p3_8():
        """R3-P3-8 App-Browser: „Im Browser öffnen" prominenter als der Lange-drücken-Hinweis."""
        c = b.new_context(**{**DESK, 'viewport': {'width': 390, 'height': 844}, 'user_agent': UA_IG, 'is_mobile': True, 'has_touch': True}); pg = c.new_page()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            play_daily_hooks(pg, 'tr')
            pg.click('#btn-share', force=True)
            wait_state(pg, 's.lastCard && s.sheet', 40000)
            m = pg.evaluate('''() => { const ob = document.querySelector('#sheet [data-act=openbrowser]'); const ct = document.querySelector('#sheet [data-act=copytext]');
              if (!ob) return null; const a = ob.getBoundingClientRect(), b2 = ct.getBoundingClientRect();
              return { cls: ob.className, h: Math.round(a.height), other: Math.round(b2.height), save: !!document.querySelector('#sheet [data-act=save]'), press: !!document.querySelector('#sheet .share-press') }; }''')
            S.check('R3-P3-8 im App-Browser ist „Im Browser öffnen" der große Hauptknopf (kein Download-Knopf)', m and 'big' in m['cls'] and m['h'] > m['other'] and not m['save'] and m['press'], m)
        finally:
            c.close()

    if on('R3-P3'):
        for name, fn in (('R3-P3-2/6 Rückmeldung + Gestern', p3_2_6), ('R3-P3-5/7 Blasen', p3_5_7), ('R3-P3-3 Rückspiel-Link', p3_3), ('R3-P3-1 Laptop 1366×657', p3_1), ('R3-P3-8 App-Browser', p3_8)):
            S.run(name, fn)

    b.close()
S.finish()
