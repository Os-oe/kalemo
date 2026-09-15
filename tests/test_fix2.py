"""Iteration-2-Suite (Fresh-Eyes-Review 2): je Aufgabe ein Abschnitt. Gezielt: python3 test_fix2.py t1 t3  (oder FIX2_ONLY=t1,t3)"""
import json, os, sys, time, re, datetime
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT, WORDS, CLIP_SPY, UA_IG, UA_LI, UA_SAFARI, play_daily_hooks, play_slot_hooks, word_forms, leaks

S = Suite('fix2')
ONLY = {x.lower() for x in (sys.argv[1:] or os.environ.get('FIX2_ONLY', '').split(',')) if x}
on = lambda k: not ONLY or k in ONLY
EX = json.load(open(os.path.join(ROOT, 'data/examples.json')))
DESK = {'viewport': {'width': 1280, 'height': 800}, 'locale': 'de-DE'}
PHONE = {'viewport': {'width': 390, 'height': 844}, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True, 'locale': 'de-DE', 'user_agent': UA_SAFARI}
SETUP = '(p) => window.__settings(Object.assign({native: "de", learn: "tr", airOffered: true, chosenPair: true}, p || {}))'

# Tinten-Bounding-Box auf einem Canvas (optional nur in einem Rechteck) → Füllgrad = größere Ausdehnung / Kachel
INK_FILL = '''([sel, box, mode]) => { const c = typeof sel === 'string' ? document.querySelector(sel) : sel; const x = c.getContext('2d');
  const B = box || { x: 0, y: 0, w: c.width, h: c.height }; const d = x.getImageData(Math.round(B.x), Math.round(B.y), Math.round(B.w), Math.round(B.h)).data; const W = Math.round(B.w), H = Math.round(B.h);
  let mx = 1e9, my = 1e9, Mx = -1, My = -1; for (let y = 0; y < H; y += 2) for (let i = 0; i < W; i += 2) { const k = (y * W + i) * 4; const s = d[k] + d[k + 1] + d[k + 2];
    const ink = mode === 'bright' ? (d[k + 3] > 60 && s > 380) : mode === 'paper' ? s < 500 : mode === 'ink' ? (d[k + 3] > 120 && s < 600) : (d[k + 3] > 200 && s < 330);
    if (ink) { if (i < mx) mx = i; if (i > Mx) Mx = i; if (y < my) my = y; if (y > My) My = y; } }
  if (Mx < 0) return { fill: 0, W, H }; return { fill: +Math.max((Mx - mx) / W, (My - my) / H).toFixed(3), fx: +((Mx - mx) / W).toFixed(2), fy: +((My - my) / H).toFixed(2), W, H }; }'''


def fresh(b, **kw):
    c = b.new_context(**{**DESK, **kw}); pg = c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    return c, pg, errs


def start_round(pg, base, date, learn='tr', native='de', slot_idx=0):
    pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
    pg.evaluate(SETUP, {'native': native, 'learn': learn}); pg.evaluate('(d) => window.__setDate(d)', date)
    plan = pg.evaluate('() => window.__plan()')
    pg.evaluate('() => window.__startDaily()')
    return plan


with server(8792) as base, sync_playwright() as p:
    b, _ = launch(p)

    # ---------- Aufgabe 1 (R2-P2-1): fertig malen + große Zeichnung ----------
    def t1_finish():
        c, pg, errs = fresh(b)
        try:
            # Wort mit vielen Strichen, das die KI früh erkennt → danach weiter malen
            found = None
            for wid, k in (('bicycle', 0), ('bicycle', 1), ('house', 0), ('cat', 0), ('fish', 0), ('sun', 0), ('car', 0)):
                pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
                pg.evaluate('''async ([id]) => { const a = window.__kalemo; a.show('round'); a.round.showWord(a.byId.get(id)); a._t1 = a.round.draw({ id }).then((o) => { a._t1out = { result: o.result, strokes: o.strokes.length, hitAt: o.hitAt, drawMs: o.drawMs, recognizedStrokes: o.recognizedStrokes }; a._t1at = performance.now(); }); return 1; }''', [wid])
                strokes = EX[wid][k]['strokes']; n = len(strokes)
                # schnell genug, dass der Rest innerhalb des 4-s-Deckels fertig wird (echte Malpausen 150 ms)
                pg.evaluate('''(st) => { const s = window.__kalemo.stage, orig = s.endStroke.bind(s); s.endStroke = (...a) => { window.__lastUp = performance.now(); return orig(...a); };
                  window.__feedStrokes(st, {timing: "real", ptMs: 4, gapMs: 120}).then(() => { window.__feedEnd = window.__lastUp; }); return 1; }''', strokes)
                rec = None
                for _ in range(300):
                    s = pg.evaluate('() => ({ r: window.__state().round, ov: window.__state().overlay, fx: window.__state().stageFx, b: window.__state().bubble, done: !document.querySelector("#round-done").hidden, feedEnd: window.__feedEnd || null })')
                    if s['r'] and s['r']['recognized'] and rec is None:
                        rec = s
                    if s['feedEnd']:
                        break
                    pg.wait_for_timeout(40)
                t_feed_end = pg.evaluate('() => window.__feedEnd || performance.now()')
                if rec and rec['fx']['strokes'] < n - 1 and t_feed_end - rec["r"]["recognizedAt"] < 2600:
                    found = (wid, k, n, rec, t_feed_end); break
            S.check('Test greift: KI erkennt vor dem letzten Strich (sonst wäre „weiter malen" nicht geprüft)', found is not None, found and found[:3])
            if not found:
                return
            wid, k, n, rec, t_end = found
            S.check(f'{wid}: beim Erkennen Blase „Ich weiß es! Mal ruhig fertig …" + „Fertig"-Knopf, noch keine Karte, Bühne malt weiter', rec['b'] and 'fertig' in (rec['b']['hint'] or '') and rec['done'] and not rec['ov'] and rec['r']['finishing'], rec['b'])
            pg.wait_for_function('() => performance.now() - window.__feedEnd >= 700', timeout=5000)
            mid = pg.evaluate('() => ({ ov: window.__state().overlay, out: window.__kalemo._t1out || null })')
            S.check(f'{wid}: 0,7 s nach dem letzten Strich noch keine Karte (Stift-Pause 1,2 s)', not mid['ov'] and mid['out'] is None, mid)
            pg.wait_for_function('() => window.__kalemo._t1out', timeout=4000)
            out = pg.evaluate('() => ({ ...window.__kalemo._t1out, after: window.__kalemo._t1at })')
            pause = out['after'] - t_end
            S.check(f'{wid}: Runde endet ~1,2 s nach dem Absetzen des letzten Strichs ({pause:.0f} ms)', 1150 <= pause <= 1800, pause)
            S.check(f'{wid}: alle {n} Striche in der gespeicherten Zeichnung (erkannt bei {out["recognizedStrokes"]})', out['strokes'] == n and out['result'] == 'hit', out)
            S.check(f'{wid}: Tempo-Wertung = Erkennungszeitpunkt (hitAt vor Ende), Malzeit ab erstem Strich', out['hitAt'] is not None and out['drawMs'] is not None and 0 < out['drawMs'] <= out['hitAt'], out)
            S.check('Fertig malen: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def t1_cap_and_tap():
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            for variant in ('cap', 'tap'):
                pg.evaluate('''async () => { const a = window.__kalemo; a.show('round'); a.round.showWord(a.byId.get('cat')); a._o = null; a.round.draw({ id: 'cat' }).then((o) => { a._o = { strokes: o.strokes.length, at: performance.now() }; }); return 1; }''')
                pg.evaluate('(st) => window.__feedStrokes(st, {timing: "instant"})', FIX['cat'][0])  # Striche sofort, dann erkennt die KI bei ruhendem Stift
                t_rec = wait_state(pg, 's.round && s.round.recognized', 10000)['round']['recognizedAt']
                if variant == 'cap':
                    # ununterbrochen weitermalen (Stift nie oben) → Karte spätestens nach 4 s
                    pg.evaluate('''() => { const st = window.__kalemo.stage; st.beginStroke(st.w * 0.2, st.h * 0.8); let i = 0; const iv = setInterval(() => { if (!st.active || i > 400) { clearInterval(iv); return; } st.addPoint(st.w * (0.2 + 0.3 * Math.sin(i / 9)), st.h * (0.8 - 0.1 * Math.cos(i / 7))); i++; }, 16); return 1; }''')
                    pg.wait_for_function('() => window.__kalemo._o', timeout=7000)
                    dt = pg.evaluate('() => window.__kalemo._o.at') - t_rec
                    S.check(f'Dauer-Malen nach dem Erkennen → Karte nach dem 4-s-Deckel ({dt:.0f} ms ab Erkennen)', 3800 <= dt <= 4600, dt)
                else:
                    pg.evaluate('() => { const st = window.__kalemo.stage; st.beginStroke(10, 10); st.addPoint(30, 30); return 1; }')
                    pg.click('#round-done', force=True)
                    pg.wait_for_function('() => window.__kalemo._o', timeout=2000)
                    dt = pg.evaluate('() => window.__kalemo._o.at') - t_rec
                    S.check(f'Tipp auf „Fertig" → sofort weiter ({dt:.0f} ms), laufender Strich gehört dazu', dt < 1500 and pg.evaluate('() => window.__kalemo._o.strokes') == len(FIX['cat'][0]) + 1, dt)
            S.check('Deckel/Fertig: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def t1_air():
        from hands import seq, POINT, OPEN
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            pg.evaluate('''async () => { const a = window.__kalemo; await a.getAir(); a.show('round'); a.setMode('air'); a.round.showWord(a.byId.get('cat')); a._o = null; a.round.draw({ id: 'cat' }).then((o) => { a._o = { strokes: o.strokes.length, at: performance.now() }; }); return 1; }''')
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX['cat'][0])
            wait_state(pg, 's.round && s.round.recognized', 10000)
            t0 = pg.evaluate('() => performance.now()')
            fr = [dict(f, t=f['t'] + t0) for f in seq(OPEN, 3, 0) + seq(POINT, 24, 100, move=lambda i: (0.3 + i * 0.01, 0.4)) + seq(OPEN, 6, 900)]
            pg.evaluate('([f]) => window.__feedLandmarks(f, { fresh: true })', [fr])
            t_up = pg.evaluate('() => performance.now()')
            pg.wait_for_timeout(600)
            early = pg.evaluate('() => window.__kalemo._o')
            pg.wait_for_function('() => window.__kalemo._o', timeout=4000)
            o = pg.evaluate('() => window.__kalemo._o')
            S.check('Luft-Modus: Stift-Pause (offene Hand) → Karte nach ~1,2 s, Luft-Strich gehört zur Zeichnung', early is None and o['strokes'] == len(FIX['cat'][0]) + 1 and 800 <= o['at'] - t_up <= 2200, (early, o, o and round(o['at'] - t_up)))
            S.check('Luft-Modus fertig malen: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def t1_sizes():
        for (vw, vh), old in (((1280, 800), 427), ((1440, 900), 460), ((1366, 657), 350)):
            c, pg, errs = fresh(b, viewport={'width': vw, 'height': vh})
            try:
                pg.goto(base + '/?test=1&scene=hit&word=cat&k=0'); pg.wait_for_selector('#round-overlay canvas.alive', timeout=30000); pg.wait_for_timeout(900)
                m = pg.evaluate('() => { const r = document.querySelector("#round-overlay canvas.alive").getBoundingClientRect(), k = document.querySelector("#round-overlay .card").getBoundingClientRect(); return { w: Math.round(r.width), cardTop: Math.round(k.top), cardBottom: Math.round(k.bottom), ih: innerHeight }; }')
                S.check(f'Desktop {vw}×{vh}: Treffer-Zeichnung ≥ 1,3× so groß wie vorher ({m["w"]} px statt {old} px), Karte passt ins Bild', m['w'] >= old * 1.3 and m['cardTop'] >= 0 and m['cardBottom'] <= m['ih'], m)
            finally:
                c.close()
        c, pg, errs = fresh(b, **PHONE)
        try:
            pg.goto(base + '/?test=1&scene=hit&word=cat&k=0'); pg.wait_for_selector('#round-overlay canvas.alive', timeout=30000); pg.wait_for_timeout(900)
            w = pg.evaluate('() => Math.round(document.querySelector("#round-overlay canvas.alive").getBoundingClientRect().width)')
            S.check(f'Handy 390×844: Treffer-Karte bleibt groß ({w} px)', w >= 330, w)
        finally:
            c.close()

    def t1_fill():
        fills = {}
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1&scene=hit&word=bicycle&k=1'); pg.wait_for_selector('#round-overlay canvas.alive', timeout=30000); pg.wait_for_timeout(1200)
            fills['Treffer-Karte'] = [pg.evaluate(INK_FILL, ['#round-overlay canvas.alive', None, 'dark'])['fill']]
            pg.goto(base + '/?test=1&scene=dayend'); wait_state(pg, 's.screen === "dayend"', 30000); pg.wait_for_timeout(1800)
            fills['Tagesende'] = [pg.evaluate(INK_FILL, [f'#dayend-grid figure:nth-child({i}) canvas', None, 'ink'])['fill'] for i in range(1, 6)]
            pg.goto(base + '/?test=1&scene=dict&detail=1'); pg.wait_for_selector('#sheet .dict-detail canvas.big', timeout=15000); pg.wait_for_timeout(900)
            fills['Wörterbuch-Detail'] = [pg.evaluate(INK_FILL, ['#sheet .dict-detail canvas.big', None, 'dark'])['fill']]
            pg.evaluate('() => { const s = document.getElementById("sheet"); s.hidden = true; s.innerHTML = ""; return 1; }')
            fills['Wörterbuch-Raster'] = pg.evaluate('([f]) => [...document.querySelectorAll(".dict-cell canvas")].slice(0, 6).map(c => (new Function("return " + f)())([c, null, "dark"]).fill)', [INK_FILL])
            r = pg.evaluate('''async () => { const app = window.__kalemo; const o = await app.others(); const m = await import('/js/game/cards.js'); const ids = ['cat', 'apple', 'sun', 'bicycle', 'fish'];
              const p = await m.poster(app, ids.map((id) => ({ id, strokes: o[id][0].strokes }))); window.__posterCanvas = p.canvas; return p.tiles; }''')
            fills['Poster'] = [pg.evaluate('([f, t]) => (new Function("return " + f)())([window.__posterCanvas, t, "paper"]).fill', [INK_FILL, t]) for t in r]
            ok = {k: min(v) >= 0.7 for k, v in fills.items()}
            for k, v in fills.items():
                S.check(f'Füllgrad ≥ 70 % — {k}', ok[k], v)
            S.check('Füllgrad-Messung: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()
        # Duell-Replay (Bühne) + Auflösung
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1&scene=duelopts'); wait_state(pg, 's.duelState && s.duelState.phase === "options"', 40000)
            pg.wait_for_function('() => window.__state().duelState.replaying === false', timeout=20000)
            st = pg.evaluate('() => ({ h: window.__kalemo.stage.h, w: window.__kalemo.stage.w, n: window.__kalemo.stage.strokes.length })')
            bb = pg.evaluate('''() => { const s = window.__kalemo.stage.strokes; let mx = 1e9, Mx = -1e9, my = 1e9, My = -1e9; for (const [xs, ys] of s) { for (const x of xs) { mx = Math.min(mx, x); Mx = Math.max(Mx, x); } for (const y of ys) { my = Math.min(my, y); My = Math.max(My, y); } }
              return Math.max(Mx - mx, My - my) / Math.min(window.__kalemo.stage.w, window.__kalemo.stage.h); }''')
            S.check(f'Duell-Replay: Zeichnung ≥ 70 % der kurzen Bühnenseite ({bb:.2f}; vorher 0,62)', bb >= 0.7, bb)
            pg.evaluate('() => window.__answer("cat")')
            pg.wait_for_selector('#round-overlay canvas.alive', timeout=10000); pg.wait_for_timeout(900)
            f = pg.evaluate(INK_FILL, ['#round-overlay canvas.alive', None, 'dark'])
            S.check('Füllgrad ≥ 70 % — Duell-Auflösung', f['fill'] >= 0.7, f)
        finally:
            c.close()

    if on('t1'):
        S.run('1 Fertig malen', t1_finish); S.run('1 Deckel + Fertig', t1_cap_and_tap); S.run('1 Luft-Modus', t1_air)
        S.run('1 Karten-Größe', t1_sizes); S.run('1 Füllgrad', t1_fill)

    # ---------- Aufgabe 2 (R2-P2-4, R2-P3-2, R2-P3-1): spoilerfreies Teilen ----------
    def t2_units():
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            r = pg.evaluate('''async () => { const f = await import('/js/core/funny.js'); const i = await import('/js/core/i18n.js'); const a = await import('/js/game/attract.js'); const w = window.__kalemo.byId;
              const res = [{ id: 'cat', tips: [{ id: 'leg', p: 0.7 }, { id: 'house', p: 0.9 }] }, { id: 'sun', tips: [{ id: 'moon', p: 0.6 }] }, { id: 'tree', tips: [] }];
              return {
                excl: f.pickFunniest(res, { exclude: ['cat', 'house', 'sun', 'tree'] }),
                brake: f.pickFunniest(res, { exclude: ['house'], recent: ['leg', 'leg'] }),
                none: f.pickFunniest([{ id: 'cat', tips: [] }], {}),
                quiz: [i.funnyQuiz(3, w.get('leg'), 'de'), i.funnyQuiz(2, w.get('lion'), 'de'), i.funnyQuiz(1, w.get('owl'), 'de'), i.funnyQuiz(3, w.get('leg'), 'en'), i.funnyQuiz(4, w.get('apple'), 'en'), i.funnyQuiz(3, w.get('leg'), 'tr')],
                motif: { tr: a.pickMotif('tr', [], w), de: a.pickMotif('de', [], w), en: a.pickMotif('en', [], w), clash: a.pickMotif('tr', ['mushroom', 'hat'], w) },
              }; }''')
            S.check('Lustigster Tipp: nie ein Wort der heutigen Tagesskizze (hier „house" ausgeschlossen → „moon"/„leg")', r['excl'] and r['excl']['id'] not in ('cat', 'house', 'sun', 'tree'), r['excl'])
            S.check('Lustigster Tipp: Wiederholungs-Bremse — „leg" zweimal zuletzt zitiert → anderer Tipp gewinnt', r['brake'] and r['brake']['id'] == 'moon' and r['brake']['idx'] == 1, r['brake'])
            S.check('Lustigster Tipp: ohne gezeigte Blase kein Zitat', r['none'] is None, r['none'])
            S.check('Neugier-Satz ohne Zielwort DE/EN/TR (Akkusativ, n-Deklination, Frage)', r['quiz'] == ['Die KI hielt Wort 3 erst für ein Bein. Was hab ich gemalt?', 'Die KI hielt Wort 2 erst für einen Löwen. Was hab ich gemalt?', 'Die KI hielt Wort 1 erst für eine Eule. Was hab ich gemalt?', 'At first, the AI thought word 3 was a leg. What did I draw?', 'At first, the AI thought word 4 was an apple. What did I draw?', 'Yapay zekâ 3. kelimeyi önce bacak sandı. Ne çizdim?'], r['quiz'])
            m = r['motif']
            S.check('Attract: eigenes Motiv je Lernsprache (TR Pilz · DE Fußball · EN Glühbirne), Fallback bei Überschneidung mit dem Tagesplan', m['tr']['id'] == 'mushroom' and m['de']['id'] == 'soccer ball' and m['en']['id'] == 'light bulb' and m['clash']['id'] != 'mushroom' and 'hat' not in m['clash']['tips'] and len(m['clash']['tips']) == 3, m)
            S.check('Einheiten: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def t2_card_and_source():
        c, pg, errs = fresh(b); c.add_init_script(CLIP_SPY)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            pg.evaluate('() => { localStorage.removeItem("kalemo.funnyRecent"); window.__setDate("2026-10-06"); return 1; }')
            plan, st = play_daily_hooks(pg, 'tr')
            ids = [s['id'] for s in plan['slots']]; forms = word_forms(ids)
            sm = pg.evaluate('() => window.__kalemo.lastSummary')
            log = pg.evaluate('() => window.__kalemo.bubbleLog || []')
            f = sm.get('funniest')
            cands = [x for x in log if x.get('guess') and x['guess'] not in ids and x['guess'] != x['target']]
            if f:
                g = WORDS[f['id']]['tr']['word']
                shown = [x['text'] for x in log if x['target'] == f['target'] and x.get('guess') == f['id']]
                S.check(f'Zitat-Quelle = protokollierte Blase: „{g}" stand beim Wort „{f["target"]}" wirklich in der Sprechblase', any(g in x for x in shown) and f['id'] not in ids, (g, shown[:3], len(log)))
            else:
                S.check('Kein Zitat, weil keine zitierbare Rate-Blase gezeigt wurde', not cands, cands[:3])
            pg.click('#btn-share', force=True)
            st = wait_state(pg, 's.lastCard && s.lastCard.gates && s.sheet', 40000)
            lc = st['lastCard']
            clip_before = pg.evaluate('() => window.__clip || null')
            S.check('Heute-Karte: 5 abstrakte Leuchtspuren mit Gate, keine scharfe Zeichnung, Text ohne Tageswort', lc['hero'] is None and len(lc['gates']) == 5 and all(g_['ok'] for g_ in lc['gates']) and not leaks(lc['text'], forms), (lc['hero'], len(lc['gates']), lc['text']))
            if lc['quote']:
                S.check('Heute-Karte: Zitat als Neugier-Lücke („Wort N … Was hab ich gemalt?") auf Karte UND im Text', 'Wort ' in lc['quote'] and 'Was hab ich gemalt?' in lc['quote'] and lc['quote'] in lc['text'], lc['text'])
            S.check('R2-P3-4: Öffnen des Teilen-Dialogs überschreibt die Zwischenablage nicht', clip_before is None, clip_before)
            pg.click('#sheet [data-act=copytext]', force=True); pg.wait_for_timeout(300)
            clip = pg.evaluate('() => window.__clip || null')
            S.check('R2-P3-4: erst „Text kopieren" schreibt den Teilen-Text', clip == lc['text'] + '\nhttp://127.0.0.1:8792/' or (clip or '').startswith(lc['text']), clip)
            S.check('Karte + Quelle: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def t2_yesterday():
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            pg.evaluate('() => window.__setDate("2026-10-06")')
            ids = [s['id'] for s in pg.evaluate('() => window.__plan()')['slots']]
            prev = ['apple', 'car', 'flower', ids[2], 'star']  # Wort 4 von gestern ist heute die Wiederholung
            ysum = {'number': 21, 'date': '2026-10-05', 'hits': 5, 'points': 400, 'scored': True, 'learn': 'tr', 'native': 'de',
                    'results': [{'id': i, 'kind': 'new', 'result': 'hit', 'hitAt': 3000, 'points': 80, 'strokes': EX[i][0]['strokes'], 'tips': [{'id': 'moon', 'p': 0.6}]} for i in prev],
                    'funniest': {'target': 'apple', 'id': 'moon', 'p': 0.6, 'idx': 0}}
            r = pg.evaluate('''async (sum) => { const app = window.__kalemo; const m = await import('/js/game/cards.js'); const card = await m.yesterdayCard(app, sum); return { tiles: card.tiles, text: card.text, quote: card.quote, q: card.quoteRect }; }''', ysum)
            tl = r['tiles']
            S.check('Gestern-Karte: Zitat MIT Wort („Die KI dachte bei meinem Apfel erst an einen Mond")', r['quote'] and 'Apfel' in r['quote'] and 'Mond' in r['quote'], r['quote'])
            S.check('Gestern-Karte: scharfe Zeichnungen mit Wort — außer dem Wort, das heute wieder dran ist (abstrakt, „?")', [t_['hidden'] for t_ in tl] == [False, False, False, True, False] and tl[3]['label'] == '?' and tl[0]['label'] == WORDS['apple']['tr']['word'], [(t_['id'], t_['hidden'], t_['label']) for t_ in tl])
            S.check('Gestern-Karte: Teilen-Text nennt kein heutiges Wort', not leaks(r['text'], word_forms(ids)), r['text'])
            S.check('Gestern-Kachel: Start zeigt eine eigene „Teilen"-Schaltfläche', pg.evaluate('() => !!document.querySelector("#yesterday-tile #btn-yesterday.btn")'))
            S.check('Gestern: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    if on('t2'):
        S.run('2 Einheiten', t2_units); S.run('2 Karte + Zitat-Quelle', t2_card_and_source); S.run('2 Gestern-Karte', t2_yesterday)

    # ---------- Aufgabe 3 (R2-P2-5 + R2-P3-10): Duell fair — Malzeit gegen Malzeit, Stand nur für Beteiligte ----------
    MK = '''async ([st, cls, senderMs, score, from, to]) => { const c = await import('/js/core/codec.js'); let t = 0;
      const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 25); t += xs.length * 25 + 180; return [xs.map(x => x + 20), ys.map(y => y + 20), ts]; });
      return c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf(cls), senderMs, strokes, score, from, to }); }'''

    def t3_units():
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            o = pg.evaluate('''async () => { const m = await import('/js/core/duelscore.js'); const f = (ok, y, th, s) => { const x = m.duelOutcome({ ok, youMs: y, themMs: th, score: s }); return [x.key, x.you, x.them]; };
              return [f(true, 3100, 4200, [0, 0]), f(true, 4300, 4200, [1, 0]), f(true, 4100, 4500, [0, 0]), f(true, 6000, 4200, [2, 2]), f(false, 900, 9000, [0, 0]), f(true, null, 4200, [0, 0]), f(true, 3000, 20000, [0, 0]), f(true, null, 20000, [1, 1])]; }''')
            S.check('Wertung Malzeit gegen Malzeit: schneller · knapp verloren (<0,5 s) · knapp gewonnen · langsamer · falsch geraten = Punkt Absender (egal wie schnell) · nicht erkannt · Absender nicht erkannt · beide nicht erkannt',
                    o == [['faster', 1, 0], ['closeLose', 0, 2], ['closeWin', 1, 0], ['slower', 2, 3], ['wrong', 0, 1], ['slower', 0, 1], ['faster', 1, 0], ['tie', 1, 1]], o)
            r = pg.evaluate('''async ([fix, v1]) => { const c = await import('/js/core/codec.js'); const R = await import('/js/core/raster.js'); const names = window.__kalemo.clf.classNames;
              const lens = []; let same = 0, total = 0;
              for (const [id, list] of Object.entries(fix)) for (const [k, d] of list.entries()) {
                const rng = R.makeRng(11 + k * 7 + id.length); const air = R.jitter(d, 2, rng).map(([xs, ys]) => [xs.map(x => x * 2.6 + 180), ys.map(y => y * 2.6 + 90)]);
                let t = 1000; const strokes = air.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 33); t += xs.length * 33 + 280; return [xs, ys, ts]; });
                const idx = names.indexOf(window.__kalemo.byId.get(id).cls); const score = [(k * 7) % 13, (id.length * 3) % 11]; const from = 1 + (k * 99991) % 2097151, to = (id.length * 7919) % 2097151;
                const code = c.encode({ classIdx: idx, senderMs: 7300, strokes, score, from, to }); lens.push(('https://kalemo.demo.osai.solutions/#d=' + code).length);
                const dec = c.decode(code); total++; if (dec.version === 3 && dec.classIdx === idx && dec.from === from && dec.to === to && dec.score[0] === score[0] && dec.score[1] === score[1] && JSON.stringify(dec.strokes) === JSON.stringify(c.quantize(strokes).map(([x, y]) => [x, y]))) same++;
              }
              lens.sort((a, b) => a - b); const old = c.decode(v1);
              return { same, total, p90: lens[Math.floor(lens.length * 0.9)], v1: { version: old.version, score: old.score, from: old.from, to: old.to, n: old.strokes.length } }; }''', [FIX, 'AdUCyAEGEwDwAqYDiAIAIB84CSqLARJHDSdjD0sWGwojHhUoBRYfKAJgIhIiIBQUJAEoAyHBAZMCaQ2dAWJwAxF9RAFYawWYAQIeMocCggGFAR0CFC2CAUKBARgCDhakAzlaE3U'])
            S.check('Duell-Code v3 (Kennung Absender/Empfänger): Roundtrip identisch, URL p90 < 300', r['same'] == r['total'] and r['p90'] < 300, r)
            S.check('Alte v1-Links (live) öffnen weiter — ohne Kennung, Stand 0:0', r['v1']['version'] == 1 and r['v1']['score'] == [0, 0] and r['v1']['to'] == 0 and r['v1']['n'] > 0, r['v1'])
        finally:
            c.close()

    def duel_open(ctxkw, player, code, answer, draw_word_speed=None):
        """Öffnet einen Duell-Link als Spieler, rät (answer), malt zurück (Fixture, Tempo ptMs) → (Ergebnis-State, Link-Karte, Rückspiel-Code)"""
        c = b.new_context(**{**DESK, **ctxkw})
        c.add_init_script(f"if (!sessionStorage.getItem('dp')) {{ sessionStorage.setItem('dp', '1'); localStorage.setItem('kalemo.player', '{player}'); localStorage.setItem('kalemo.settings', JSON.stringify({{native: 'de', learn: 'tr', chosenPair: true, airOffered: true}})); }}")
        pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1#d=' + code)
        pg.wait_for_function('() => window.__state && window.__state() && (document.querySelector("#duel-body [data-act=go]") || (window.__state().duelState && window.__state().duelState.phase))', timeout=30000)
        land = pg.text_content('#duel-body') or ''
        if pg.query_selector('#duel-body [data-act=go]'):
            pg.click('#duel-body [data-act=go]')
        sub = wait_state(pg, 's.duelState && s.duelState.phase === "replay"', 30000) and (pg.text_content('#word-sub') or '')
        st = wait_state(pg, 's.duelState && s.duelState.phase === "options"', 30000)
        target = st['duelState']['target']
        pick = target if answer else next(x for x in st['duelState']['options'] if x != target)
        pg.evaluate('(id) => window.__answer(id)', pick)
        rev = wait_state(pg, 's.duelState && s.duelState.phase === "reveal"', 15000)
        pg.wait_for_selector('#round-overlay [data-act=back]', timeout=8000)
        reveal = pg.text_content('#round-overlay .card') or ''
        pg.click('#round-overlay [data-act=back]')
        st = wait_state(pg, 's.screen === "duel" && s.duelPicks && s.duelPicks.length === 3', 10000)
        wid = next((x for x in st['duelPicks'] if x in FIX), st['duelPicks'][0])
        pg.click(f'.word-pick[data-id="{wid}"]', force=True)
        wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        if draw_word_speed is None:
            pg.wait_for_timeout(20500)  # nichts malen → nicht erkannt
        else:
            pg.wait_for_timeout(draw_word_speed[0])  # Reaktionszeit vor dem ersten Strich zählt NICHT zur Malzeit
            pg.evaluate('([st, ms]) => window.__feedStrokes(st, {timing: "real", ptMs: ms, gapMs: 120})', [FIX[wid][0], draw_word_speed[1]])
        res = wait_state(pg, 's.duelState && s.duelState.phase === "result" && s.lastDuel', 40000)
        pg.wait_for_selector('#round-overlay .duel-lead', timeout=8000)
        card = pg.text_content('#round-overlay .card') or ''
        return c, pg, errs, {'land': land, 'sub': sub, 'reveal': reveal, 'revealState': rev['duelState'], 'result': res['duelState'], 'card': card, 'link': res['lastDuel']}

    def t3_roundtrips():
        mk, mp, _ = fresh(b)
        try:
            mp.goto(base + '/?test=1'); wait_state(mp, 's.clfReady', 60000)
            ids = [s['id'] for s in mp.evaluate('() => window.__plan()')['slots']]
            word = next(w for w in ('owl', 'snail', 'umbrella', 'star', 'apple') if w not in ids)
            A, B = 1111, 2222
            cases = [('Absender langsam (9,0 s), Empfänger malt zügig → Empfänger gewinnt', 9000, True, (1500, 8), 'faster', {'you': 1, 'them': 0}),
                     ('Absender schnell (1,2 s), Empfänger braucht länger → Absender gewinnt', 1200, True, (300, 30), 'slower', {'you': 0, 'them': 1}),
                     ('Empfänger rät falsch, malt aber blitzschnell → Runde an den Absender', 9000, False, (200, 6), 'wrong', {'you': 0, 'them': 1})]
            for label, sender_ms, answer, speed, key, score in cases:
                code = mp.evaluate(MK, [FIX[word][0], WORDS[word]['cls'], sender_ms, [0, 0], A, 0])
                c, pg, errs, r = duel_open({}, B, code, answer, speed)
                try:
                    res = r['result']
                    S.check(f'{label}: Ergebnis erst nach der eigenen Zeichnung = {key}, Stand {score}', res['outcome'] == key and res['score'] == score and 'schneller als' not in r['reveal'][:0], (res['outcome'], res['score'], res['youMs'], res['themMs']))
                    you = res['youMs']
                    S.check(f'{label}: Malzeit ab erstem Strich (Reaktionszeit {speed[0]} ms zählt nicht) + Text „Du hast in … gemalt — Absender … s." + Führung', you is not None and you < 20000 and 'gemalt' in r['card'] and ('Absender 9,0 s' in r['card'] or 'Absender 1,2 s' in r['card']) and any(x in r['card'] for x in ('führst', 'führt', 'Gleichstand')), (you, r['card'][:220]))
                    S.check(f'{label}: Auflösung vor dem Malen zeigt ✓/✗ ohne Stand/Sieger', not re.search(r'schneller!|führ|Gleichstand|\b\d+\s*:\s*\d+\b', r['reveal']) and r['revealState']['ok'] == answer, r['reveal'][:160])
                    dec = pg.evaluate('async (code) => { const c = await import("/js/core/codec.js"); const d = c.decode(code); return { score: d.score, from: d.from, to: d.to }; }', r['link']['code'])
                    S.check(f'{label}: Rückspiel-Link an den Absender adressiert, Stand aus Sicht des neuen Absenders', dec['to'] == A and dec['from'] == B and dec['score'] == [score['you'], score['them']], dec)
                    if key == 'faster':
                        back = r['link']['code']
                    S.check(f'{label}: keine Seitenfehler', not errs, errs[:2])
                finally:
                    c.close()
            # Rückspiel beim ursprünglichen Absender A: Stand sichtbar, nächste Runde schreibt weiter
            c, pg, errs, r = duel_open({}, A, back, True, (400, 8))
            try:
                S.check('Rückspiel beim ursprünglichen Absender: „Rückspiel — Stand 0:1" (A ist Teil des Duells)', 'Stand 0:1' in (r['sub'] + r['land']), (r['sub'], r['land'][:80]))
                S.check('Rückspiel: Stand wird fortgeschrieben (A holt auf oder B baut aus)', r['result']['score']['you'] + r['result']['score']['them'] == 2, r['result']['score'])
            finally:
                c.close()
        finally:
            mk.close()

    if on('t3'):
        S.run('3 Einheiten', t3_units); S.run('3 Drei Roundtrips', t3_roundtrips)

    # ---------- Aufgabe 4 (R2-P2-6) + 2e: Empfänger-Landeseite ----------
    def t4_landing():
        mk, mp, _ = fresh(b)
        try:
            mp.goto(base + '/?test=1'); wait_state(mp, 's.clfReady', 60000)
            ids = [s['id'] for s in mp.evaluate('() => window.__plan()')['slots']]
            word = next(w for w in ('owl', 'snail', 'umbrella', 'star', 'apple') if w not in ids)
            code = mp.evaluate(MK, [FIX[word][0], WORDS[word]['cls'], 4200, [0, 0], 5555, 0])
        finally:
            mk.close()
        for label, kw in (('Desktop 1280×800', {}), ('Handy 390×844', PHONE)):
            c, pg, errs = fresh(b, **kw)
            try:
                pg.goto(base + '/?test=1#d=' + code, wait_until='commit')
                pg.wait_for_selector('#duel-body .landing-logo', state='visible', timeout=5000)
                t_logo = pg.evaluate('() => performance.now()')
                pg.wait_for_selector('#duel-body [data-act=go]', timeout=30000); pg.wait_for_timeout(700)
                m = pg.evaluate('''() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom) }; };
                  return { logo: r('.landing-logo'), lead: r('.landing-lead'), art: r('.landing-art'), go: r('[data-act=go]'), pair: r('#duel-pair'), box: r('.landing'), vw: innerWidth, vh: innerHeight, lead_t: document.querySelector('.landing-lead').textContent, tag: document.querySelector('.landing .tagline').textContent }; }''')
                S.check(f'{label}: Logo „Kalemo" sichtbar nach ≤ 1 s ({t_logo:.0f} ms)', t_logo <= 1000, t_logo)
                inside = all(m[k] and m[k]['y'] >= 0 and m[k]['b'] <= m['vh'] for k in ('logo', 'lead', 'art', 'go', 'pair'))
                S.check(f'{label}: Logo, Einzeiler, Teaser, großer Knopf, Sprachwahl — alles im ersten Bild', inside and 'Rate, was es ist' in m['lead_t'] and m['tag'] == 'Mal’s in die Luft.' and m['go']['h'] >= 60, m)
                order = m['logo']['y'] < m['art']['y'] < m['lead']['y'] < m['go']['y'] < m['pair']['y']
                if kw:
                    S.check(f'{label}: Fläche genutzt (gestalteter Bereich ≥ 70 % der Höhe), Reihenfolge Logo → Teaser → Satz → Knopf → Sprachwahl', (m['pair']['b'] - m['logo']['y']) >= 0.7 * m['vh'] and order, (m['pair']['b'] - m['logo']['y'], m['vh']))
                else:
                    S.check(f'{label}: zentrierte Karte (Mitte ±20 px, Breite ≤ 640 px), Reihenfolge stimmt', abs(m['box']['x'] + m['box']['w'] / 2 - m['vw'] / 2) <= 20 and m['box']['w'] <= 640 and order, m['box'])
                f1 = pg.evaluate('() => document.querySelector(".landing-art canvas").toDataURL().length'); pg.wait_for_timeout(400); f2 = pg.evaluate('() => document.querySelector(".landing-art canvas").toDataURL().length')
                S.check(f'{label}: Glow-Teaser bewegt sich (abstrakt, keine Zeichnung)', f1 != f2, (f1, f2))
                pg.screenshot(path=os.path.join(ROOT, f'passes/fix2/landing-{"phone" if kw else "desktop"}.png'))
                pg.click('#duel-body [data-act=go]')
                wait_state(pg, 's.duelState && s.duelState.phase === "replay"', 30000)
                S.check(f'{label}: „Schau zu …" startet das Replay; keine Seitenfehler', not errs, errs[:2])
            finally:
                c.close()

    def t4_daily_first():
        mk, mp, _ = fresh(b)
        try:
            mp.goto(base + '/?test=1'); wait_state(mp, 's.clfReady', 60000)
            plan = mp.evaluate('() => window.__plan()'); wid = plan['slots'][1]['id']
            code = mp.evaluate(MK, [FIX[wid][0], WORDS[wid]['cls'], 4200, [0, 0], 6666, 0])
        finally:
            mk.close()
        c, pg, errs = fresh(b)
        try:
            pg.goto(base + '/?test=1#d=' + code); pg.wait_for_selector('#duel-body [data-act=daily-first]', timeout=30000)
            txt = pg.text_content('#duel-body [data-act=daily-first]') or ''
            S.check('2e: Tageswort im Duell → Hauptknopf „Erst Tagesskizze #N (2 Min) — dann das Duell"', f'#{plan["number"]}' in txt and 'dann das Duell' in txt, txt)
            pg.click('#duel-body [data-act=daily-first]')
            st = wait_state(pg, 's.screen === "round" && s.round', 30000)
            S.check('2e: Tagesskizze startet (Link bleibt im Hash)', st['round']['target'] == plan['slots'][0]['id'] and '#d=' in pg.url, pg.url[-30:])
            for i, slot in enumerate(plan['slots']):
                play_slot_hooks(pg, slot, 'tr'); pg.evaluate('() => window.__next()')
            wait_state(pg, 's.screen === "dayend"', 30000)
            pg.wait_for_selector('#btn-dayend-duel:not([hidden])', timeout=5000)
            pg.click('#btn-dayend-duel')
            st = wait_state(pg, 's.duelState && (s.duelState.phase === "replay" || s.duelState.phase === "options")', 30000)
            S.check('2e: nach dem Tagesende führt „Zurück zum Duell" direkt ins Duell (ohne erneute Sperre)', st['duelState']['target'] == wid, st['duelState'])
            S.check('2e: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    if on('t4'):
        os.makedirs(os.path.join(ROOT, 'passes/fix2'), exist_ok=True)
        S.run('4 Landeseite', t4_landing); S.run('4 Erst Tagesskizze', t4_daily_first)

    b.close()
S.finish()
