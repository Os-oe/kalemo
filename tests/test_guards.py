"""Querschnitts-Wächter (Iteration 2): damit ein Fix kein anderes Versprechen bricht.
G1 Spoiler · G2 Erstes Bild · G3 Fremder Dritter · G4 Fortschritt · G5 keine immer-wahren Checks.
Gezielt: python3 test_guards.py G1 G4   (oder GUARDS_ONLY=g1,g4)  · Report tests/reports/guards.jsonl
Jede Teilprüfung läuft in eigenem S.run mit eigenem Kontext — eine Ausnahme verschluckt keine späteren Checks."""
import ast, base64, glob, json, os, re, struct, sys
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT, WORDS, CLIP_SPY, UA_IG, play_daily_hooks, play_slot_hooks, word_forms, leaks

S = Suite('guards')
ONLY = {x.lower() for x in (sys.argv[1:] or os.environ.get('GUARDS_ONLY', '').split(',')) if x}
on = lambda k: not ONLY or k in ONLY
DESK = {'viewport': {'width': 1280, 'height': 800}, 'locale': 'de-DE'}
SETUP = '() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})'

# Launch-Tage #1–#14 (kuratiert) — das Attract-Motiv darf keins davon sein
CURATED = set(m.group(1) for m in re.finditer(r"\['([a-z ]+)', '(?:new|review|plural)'", open(os.path.join(ROOT, 'js/core/plan.js')).read()))


def png_text_chunks(data):
    """tEXt/zTXt/iTXt-Chunks einer PNG-Datei (Metadaten, die mitgeteilt würden)"""
    out, i = [], 8
    while i + 8 <= len(data):
        n, typ = struct.unpack('>I4s', data[i:i + 8]); body = data[i + 8:i + 8 + n]
        if typ in (b'tEXt', b'zTXt', b'iTXt'):
            out.append(body.decode('latin-1', 'replace'))
        i += 12 + n
    return out


with server(8791) as base, sync_playwright() as p:
    b, _ = launch(p)

    def fresh(**kw):
        c = b.new_context(**{**DESK, **kw}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        return c, pg, errs

    # ---------------- G1 Spoiler ----------------
    def g1_attract():
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            ids = [s['id'] for s in pg.evaluate('() => window.__plan()')['slots']]; forms = word_forms(ids)
            for native, learn in (('de', 'tr'), ('tr', 'de'), ('de', 'en')):
                pg.evaluate('(p) => window.__settings(p)', {'native': native, 'learn': learn})
                texts = []
                for k in range(0, 40):
                    pg.evaluate('(s) => window.__kalemo.attract.at(s)', k * 0.3); pg.wait_for_timeout(35)
                    texts.append((pg.text_content('#attract-bubble') or '').strip())
                info = pg.evaluate('() => window.__kalemo.attract.info || null')
                shown = ([info['motif']] + list(info.get('tips', []))) if info else []
                bad = sorted({l for t in texts for l in leaks(t, forms)})
                S.check(f'G1 Attract {native}→{learn}: keine Wortform der heutigen Tagesskizze in Blase/Karte, Motiv + Tipps kein Tageswort', not bad and info and not (set(shown) & set(ids)), (bad, info))
                S.check(f'G1 Attract {native}→{learn}: Motiv kein Wort der kuratierten Tage #1–#14', bool(info) and info['motif'] not in CURATED, info)
            S.check('G1 Attract: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def g1_yesterday():
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            ids = [s['id'] for s in pg.evaluate('() => window.__plan()')['slots']]; forms = word_forms(ids)
            y_iso = pg.evaluate('async () => { const p = await import("/js/core/plan.js"); return p.addDays(window.__kalemo.today(), -1); }')
            ysum = {'number': 7, 'date': y_iso, 'hits': 5, 'points': 400, 'scored': True, 'learn': 'tr', 'native': 'de',
                    'results': [{'id': i, 'kind': 'new', 'result': 'hit', 'hitAt': 3000, 'points': 80, 'strokes': FIX[i][0] if i in FIX else FIX['cat'][0], 'tips': [{'id': 'moon', 'p': 0.6}]} for i in [ids[1], 'apple', 'car', 'flower', 'star']],
                    'funniest': {'target': ids[1], 'id': 'moon', 'p': 0.6}}
            pg.evaluate('([iso, sum]) => { localStorage.setItem("kalemo.day." + iso, JSON.stringify(sum)); window.__home(); return 1; }', [y_iso, ysum])
            pg.wait_for_selector('#btn-yesterday:not([hidden])', timeout=5000)
            ytile = pg.evaluate('() => window.__kalemo.yesterdayTileId ?? null')
            S.check('G1 Gestern-Kachel auf dem Start zeigt kein Tageswort als Zeichnung', ytile is not None and ytile not in ids, ytile)
            pg.evaluate('() => { document.querySelector("#btn-yesterday").click(); return 1; }')
            st = wait_state(pg, 's.lastCard && s.lastCard.kind === "yesterday"', 30000)
            S.check('G1 Gestern-Karte (Teilen-Text) nennt kein Wort der heutigen Tagesskizze', not leaks(st['lastCard']['text'], forms), (st['lastCard']['text'], leaks(st['lastCard']['text'], forms)))
            S.check('G1 Gestern: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def g1_share():
        c, pg, errs = fresh(); c.add_init_script(CLIP_SPY)
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            ids = [s['id'] for s in pg.evaluate('() => window.__plan()')['slots']]; forms = word_forms(ids)
            play_daily_hooks(pg, 'tr')
            pg.click('#btn-share', force=True)
            st = wait_state(pg, 's.lastCard && s.lastCard.gates && s.sheet', 40000)
            if pg.query_selector('#sheet [data-act=copytext]'):
                pg.click('#sheet [data-act=copytext]', force=True); pg.wait_for_timeout(300)
            clip = pg.evaluate('() => window.__clip || null')
            txt = st['lastCard']['text']
            S.check('G1 Heute-Karte: Teilen-Text ohne Wortform der Tagesskizze', not leaks(txt, forms), (txt, leaks(txt, forms)))
            S.check('G1 Heute-Karte: Zwischenablage ohne Wortform der Tagesskizze', clip is not None and not leaks(clip, forms), (clip, leaks(clip or '', forms)))
            S.check('G1 Heute-Karte: keine scharfe Zeichnung (5 abstrakte Spuren mit Gate)', st['lastCard'].get('hero') is None and len(st['lastCard']['gates']) == 5 and all(g['ok'] for g in st['lastCard']['gates']), (st['lastCard'].get('hero'), len(st['lastCard']['gates'])))
            png = pg.evaluate('''async () => { const app = window.__kalemo; const m = await import('/js/game/cards.js'); const card = await m.todayCard(app, app.lastSummary);
              const buf = new Uint8Array(await card.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return btoa(s); }''')
            meta = png_text_chunks(base64.b64decode(png))
            S.check('G1 Heute-Karte-PNG: keine Text-Metadaten mit Wörtern', not any(leaks(x, forms) for x in meta), meta[:3])
            adv = pg.evaluate('''async (ids) => { const app = window.__kalemo; const m = await import('/js/game/cards.js');
              const sum = JSON.parse(JSON.stringify(app.lastSummary)); sum.funniest = { target: ids[2], id: ids[0], p: 0.95, idx: 2 };
              sum.results[2].tips = [{ id: ids[0], p: 0.95 }]; sum.results[2].bestWrong = { id: ids[0], p: 0.95 };
              const card = await m.todayCard(app, sum); return { text: card.text, quote: card.quote }; }''', ids)
            S.check('G1 Heute-Karte: Rateversuch = anderes Tageswort wird nie zitiert', not leaks(adv['text'], forms), adv)
            S.check('G1 Teilen: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def g1_duel():
        mk, mp, _ = fresh()
        rc, rp, rerr = fresh()
        try:
            mp.goto(base + '/?test=1'); wait_state(mp, 's.clfReady', 60000)
            ids = [s['id'] for s in mp.evaluate('() => window.__plan()')['slots']]; forms = word_forms(ids); wid = ids[1]
            code = mp.evaluate('''async ([st, cls]) => { const c = await import('/js/core/codec.js'); let t = 0;
              const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 30); t += xs.length * 30 + 200; return [xs, ys, ts]; });
              return c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf(cls), senderMs: 4200, strokes, from: 4444, to: 0 }); }''', [FIX[wid][0], WORDS[wid]['cls']])
            rp.goto(base + '/?test=1#d=' + code); rp.wait_for_selector('#duel-body button', timeout=30000); rp.wait_for_timeout(1500)
            land = rp.text_content('#duel-body') or ''
            rst = rp.evaluate('() => window.__state()')
            gate = rp.query_selector('#duel-body [data-act=daily-first]')
            S.check('G1 Duell mit Tageswort → Empfänger (heute ungespielt): Landeseite nennt kein Tageswort, Replay startet nicht von selbst', not leaks(land, forms) and not rst['duelState'] and rst['screen'] == 'duel', (leaks(land, forms), rst['duelState'] and rst['duelState'].get('phase')))
            S.check('G1 Duell-Empfänger: Hauptknopf „Erst Tagesskizze … dann das Duell" + „Direkt ansehen"', gate is not None and rp.query_selector('#duel-body [data-act=go]') is not None and 'Tagesskizze' in (gate.text_content() or ''), land[:160])
            S.check('G1 Duell-Empfänger: keine Seitenfehler', not rerr, rerr[:2])
        finally:
            rc.close(); mk.close()

    if on('g1'):
        S.run('G1 Attract', g1_attract); S.run('G1 Gestern', g1_yesterday); S.run('G1 Teilen', g1_share); S.run('G1 Duell-Empfänger', g1_duel)

    # ---------------- G2 Erstes Bild ----------------
    PLAYED = '''(() => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }); const iso = f.format(new Date());
      if (localStorage.getItem('kalemo.g2init')) return; localStorage.setItem('kalemo.g2init', '1');
      const sum = { number: 1, date: iso, hits: 4, points: 380, scored: true, learn: 'tr', native: 'de', results: ['cat', 'house', 'sun', 'tree', 'fish'].map((id, i) => ({ id, kind: 'new', result: i === 3 ? 'timeout' : 'hit', hitAt: 3000, points: 80, strokes: [[[10, 200, 120, 10], [10, 30, 220, 10]]] })), funniest: null };
      localStorage.setItem('kalemo.day.' + iso, JSON.stringify(sum)); localStorage.setItem('kalemo.streak', JSON.stringify({ count: 1, last: iso })); })();'''

    def g2_case(vw, vh, state):
        mob = vw < 500
        kw = {'viewport': {'width': vw, 'height': vh}, 'locale': 'de-DE', 'is_mobile': mob, 'has_touch': mob}
        if 'Instagram' in state:
            kw['user_agent'] = UA_IG
        c = b.new_context(**kw)
        try:
            if 'gespielt' in state:
                c.add_init_script(PLAYED)
            pg = c.new_page()
            pg.goto(base + '/?test=1&lazy=1'); pg.wait_for_function('() => window.__kalemo && window.__kalemo.ready', timeout=60000); pg.wait_for_timeout(900)
            m = pg.evaluate('''() => { const b = document.querySelector('#btn-daily').getBoundingClientRect(); const t = document.querySelector('#today-tile'); const i = document.querySelector('#inapp');
              return { top: Math.round(b.top), bottom: Math.round(b.bottom), ih: innerHeight, tile: !t.hidden, inapp: !i.hidden, scroll: document.querySelector('#screen-start').scrollTop, label: document.querySelector('#daily-label').textContent }; }''')
            ok = m['top'] >= 0 and m['bottom'] <= m['ih'] and m['scroll'] == 0 and (('gespielt' not in state) or m['tile']) and (('Instagram' not in state) or m['inapp'])
            S.check(f'G2 {vw}×{vh} {state}: Hauptknopf „{m["label"]}" im ersten Bild', ok, m)
        finally:
            c.close()

    if on('g2'):
        for vw, vh in ((1366, 657), (1280, 720), (390, 844)):
            for state in ('frisch', 'gespielt', 'Instagram') + (('Instagram+gespielt',) if vw < 500 else ()):
                S.run(f'G2 {vw}×{vh} {state}', lambda vw=vw, vh=vh, state=state: g2_case(vw, vh, state))

    # ---------------- G3 Fremder Dritter ----------------
    SCORE = re.compile(r'Stand|Rückspiel|führt|Gleichstand|\b\d+\s*:\s*\d+\b')
    A, B, C = 1111, 2222, 3333

    def g3_link(frm, to, score):
        mk, mp, _ = fresh()
        try:
            mp.goto(base + '/?test=1'); wait_state(mp, 's.clfReady', 60000)
            return mp.evaluate('''async ([st, frm, to, score]) => { const c = await import('/js/core/codec.js'); let t = 0;
              const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 30); t += xs.length * 30 + 200; return [xs.map(x => x + 20), ys.map(y => y + 20), ts]; });
              return c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf('cat'), senderMs: 4200, strokes, score, from: frm, to }); }''', [FIX['cat'][0], frm, to, score])
        finally:
            mk.close()

    def g3_open(player, code):
        """Öffnet den Link als Spieler (lokale Kennung), spielt Replay → Antwort. Liefert (Landeseite, Unterzeile, Auflösung, Fehler)."""
        c = b.new_context(**DESK)
        try:
            init = "localStorage.setItem('kalemo.settings', JSON.stringify({native: 'de', learn: 'tr', chosenPair: true, airOffered: true}));"
            if player:
                init += f"localStorage.setItem('kalemo.player', '{player}');"
            c.add_init_script(f"if (!sessionStorage.getItem('g3')) {{ sessionStorage.setItem('g3', '1'); {init} }}")
            pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + '/?test=1#d=' + code)
            pg.wait_for_function('() => window.__state && window.__state() && (document.querySelector("#duel-body [data-act=go]") || (window.__state().duelState && window.__state().duelState.phase))', timeout=30000)
            land = pg.text_content('#duel-body') or ''
            go = pg.query_selector('#duel-body [data-act=go]')
            if go:
                go.click()
            wait_state(pg, 's.duelState && s.duelState.phase === "replay"', 30000)
            sub = pg.text_content('#word-sub') or ''
            wait_state(pg, 's.duelState && s.duelState.phase === "options"', 30000)
            pg.evaluate('() => window.__answer("cat")')
            wait_state(pg, 's.duelState && s.duelState.phase === "reveal"', 15000); pg.wait_for_timeout(900)
            return land, sub, pg.text_content('#round-overlay') or '', errs
        finally:
            c.close()

    def g3_third():
        land, sub, card, errs = g3_open(C, g3_link(B, A, [1, 0]))
        S.check('G3 Rückspiel-Link (B→A) bei fremdem Dritten C: kein Stand, kein „Rückspiel" (Landeseite, Replay, Auflösung)', not SCORE.search(land + ' ' + sub + ' ' + card), (land[:80], sub, SCORE.findall(land + sub + card)))
        S.check('G3 Dritter: keine Seitenfehler', not errs, errs[:2])

    def g3_owner():
        land, sub, card, errs = g3_open(A, g3_link(B, A, [1, 0]))
        S.check('G3 Gegenprobe: der echte Empfänger A sieht „Rückspiel — Stand"', 'Stand' in (sub + land), (sub, land[:80]))

    def g3_unaddressed():
        land, sub, card, errs = g3_open(C, g3_link(0, 0, [2, 1]))
        S.check('G3 Link mit Stand, aber ohne Empfänger-Kennung (alt/weitergeleitet) → Öffner sieht keinen fremden Stand', not SCORE.search(land + ' ' + sub + ' ' + card), (sub, SCORE.findall(land + sub + card)))

    if on('g3'):
        S.run('G3 Dritter', g3_third); S.run('G3 Empfänger', g3_owner); S.run('G3 ohne Kennung', g3_unaddressed)

    # ---------------- G4 Fortschritt ----------------
    def g4_setup():
        """Frischer Kontext → Tagesskizze über den Knopf → Wort 1 getroffen → Wort 2 läuft."""
        c, pg, errs = fresh()
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate(SETUP)
        plan = pg.evaluate('() => window.__plan()')
        pg.click('#btn-daily')
        play_slot_hooks(pg, plan['slots'][0], 'tr'); pg.evaluate('() => window.__next()')
        wait_state(pg, f's.round && s.round.target === {json.dumps(plan["slots"][1]["id"])} && !s.overlay', 20000)
        return c, pg, errs, plan

    def g4_close_stay():
        c, pg, errs, plan = g4_setup()
        try:
            pg.click('#round-close', force=True); pg.wait_for_timeout(300)
            dlg = pg.query_selector('.quit-card [data-k=stay]'); st = pg.evaluate('() => window.__state()')
            S.check('G4 × in laufender Tagesskizze → Rückfrage statt Abbruch (Uhr steht)', dlg is not None and st['screen'] == 'round' and bool(st['round']) and st['round']['paused'], (st['screen'], dlg is not None))
            if dlg:
                dlg.click(); pg.wait_for_timeout(250)
            st = pg.evaluate('() => window.__state()')
            S.check('G4 „Weitermachen" → dieselbe Runde läuft weiter', st['screen'] == 'round' and bool(st['round']) and st['round']['target'] == plan['slots'][1]['id'] and not st['round']['paused'], st['round'])
            S.check('G4 ×: keine Seitenfehler', not errs, errs[:2])
        finally:
            c.close()

    def g4_esc_resume():
        c, pg, errs, plan = g4_setup()
        try:
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            quit_btn = pg.query_selector('.quit-card [data-k=quit]')
            S.check('G4 Esc in laufender Tagesskizze → Rückfrage', quit_btn is not None and pg.evaluate('() => window.__state().screen') == 'round')
            if quit_btn:
                quit_btn.click()
            else:
                pg.evaluate('() => window.__home()')
            wait_state(pg, 's.screen === "start"', 5000)
            label = pg.text_content('#daily-label') or ''
            pg.click('#btn-daily'); st = wait_state(pg, 's.round', 20000)
            S.check('G4 Abbrechen → Start bietet „weiter bei Wort 2" → Runde = Wort 2, Wort 1 bleibt gezählt', st['round']['target'] == plan['slots'][1]['id'] and bool(st['daily']) and len(st['daily']['results']) == 1 and 'Wort 2' in label, (label, st['round']['target'], st['daily']))
        finally:
            c.close()

    def g4_reload():
        c, pg, errs, plan = g4_setup()
        try:
            pg.reload(); wait_state(pg, 's.clfReady', 60000)
            label = pg.text_content('#daily-label') or ''
            pg.click('#btn-daily'); st = wait_state(pg, 's.round', 20000)
            S.check('G4 Reload während Wort 2 → Wiederaufnahme bei Wort 2', st['round']['target'] == plan['slots'][1]['id'] and len(st['daily']['results']) == 1 and 'Wort 2' in label, (label, st['round']['target']))
        finally:
            c.close()

    def g4_back():
        c, pg, errs, plan = g4_setup()
        try:
            pg.evaluate('() => { history.back(); return 1; }'); pg.wait_for_timeout(700)
            st = pg.evaluate('() => window.__state()')
            dlg = pg.query_selector('.quit-card [data-k=stay]')
            if st['screen'] == 'round' and dlg:
                ok = True; dlg.click()
            else:
                pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
                ok = 'Wort 2' in (pg.text_content('#daily-label') or '')
            S.check('G4 Zurück-Taste in laufender Tagesskizze → Rückfrage (oder Wiederaufnahme bei Wort 2)', ok, st['screen'])
        finally:
            c.close()

    def g4_practice():
        c, pg, errs = fresh()
        try:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.evaluate(SETUP)
            today = pg.evaluate('() => window.__state().date')
            pg.evaluate('(iso) => { localStorage.setItem("kalemo.day." + iso, JSON.stringify({ number: 1, date: iso, hits: 5, points: 400, scored: true, learn: "tr", native: "de", results: [], funniest: null })); window.__home(); return 1; }', today)
            pg.click('#btn-daily'); wait_state(pg, 's.round', 20000); pg.wait_for_timeout(200)
            pg.click('#round-close', force=True); pg.wait_for_timeout(300)
            st = pg.evaluate('() => window.__state()')
            S.check('G4 „Noch mal üben" schließt ohne Rückfrage', st['screen'] == 'start' and not pg.query_selector('.quit-card'), st['screen'])
        finally:
            c.close()

    if on('g4'):
        for name, fn in (('×', g4_close_stay), ('Esc', g4_esc_resume), ('Reload', g4_reload), ('Zurück', g4_back), ('Üben', g4_practice)):
            S.run(f'G4 {name}', fn)

    # ---------------- G5 keine immer-wahren Checks (AST, nur ausführbarer Code) ----------------
    def g5():
        hits = []
        for f in sorted(glob.glob(os.path.join(ROOT, 'tests', '*.py'))):
            tree = ast.parse(open(f).read(), f)
            for node in ast.walk(tree):
                if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or) and any(isinstance(v, ast.Constant) and v.value is True for v in node.values):
                    hits.append(f'{os.path.basename(f)}:{node.lineno} (… or True)')
                elif isinstance(node, ast.Assert) and isinstance(node.test, ast.Constant) and bool(node.test.value):
                    hits.append(f'{os.path.basename(f)}:{node.lineno} (assert True)')
        S.check('G5 tests/: kein Oder mit Konstante True, kein assert True (AST, Kommentare/Strings ausgenommen)', not hits, hits)
    if on('g5'):
        S.run('G5 Scheinchecks', g5)

    b.close()
S.finish()
