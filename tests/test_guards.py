"""Querschnitts-Wächter (Iteration 2): laufen nach JEDEM Fix mit, damit ein Fix kein anderes Versprechen bricht.
G1 Spoiler · G2 Erstes Bild · G3 Fremder Dritter · G4 Fortschritt · G5 keine immer-wahren Checks.
Gezielt: GUARDS_ONLY=g1,g4 python3 test_guards.py  (Report tests/reports/guards.jsonl)"""
import base64, json, os, re, struct, glob
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT, WORDS, CLIP_SPY, UA_IG, play_daily_hooks, play_slot_hooks, word_forms, leaks

S = Suite('guards')
ONLY = [x for x in os.environ.get('GUARDS_ONLY', '').split(',') if x]
on = lambda k: not ONLY or k in ONLY
DESK = {'viewport': {'width': 1280, 'height': 800}, 'locale': 'de-DE'}

# Launch-Tage #1–#14 (kuratiert) — das Attract-Motiv darf keins davon sein
CURATED = set()
for m in re.finditer(r"\['([a-z ]+)', '(?:new|review|plural)'", open(os.path.join(ROOT, 'js/core/plan.js')).read()):
    CURATED.add(m.group(1))


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

    # ---------------- G1 Spoiler ----------------
    def g1():
        c = b.new_context(**DESK); c.add_init_script(CLIP_SPY)
        try:
            c.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
        except Exception:
            pass
        pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        plan = pg.evaluate('() => window.__plan()'); ids = [s['id'] for s in plan['slots']]; forms = word_forms(ids)
        # (c) Attract-Loop vor dem Spielen: je Lernsprache eine volle Schleife abtasten
        for native, learn in (('de', 'tr'), ('tr', 'de'), ('de', 'en')):
            pg.evaluate('(p) => window.__settings(p)', {'native': native, 'learn': learn})
            texts = []
            for k in range(0, 40):
                pg.evaluate('(s) => window.__kalemo.attract.at(s)', k * 0.3); pg.wait_for_timeout(35)
                texts.append((pg.text_content('#attract-bubble') or '').strip())
            info = pg.evaluate('() => window.__kalemo.attract.info || null')
            motif_ids = ([info['motif']] + list(info.get('tips', []))) if info else []
            bad = sorted({l for t in texts for l in leaks(t, forms)})
            S.check(f'G1 Attract {native}→{learn}: keine Wortform der heutigen Tagesskizze in Blase/Karte, Motiv + Tipps kein Tageswort', not bad and info and not (set(motif_ids) & set(ids)), (bad, info))
            S.check(f'G1 Attract {native}→{learn}: Motiv kein Wort der kuratierten Tage #1–#14', info and info['motif'] not in CURATED, info)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr"})')
        # (Gestern) Gestern-Kachel/-Karte vor dem Spielen: enthält ein heutiges Wort → nie scharf/benannt
        y_iso = pg.evaluate('async () => { const p = await import("/js/core/plan.js"); return p.addDays(window.__kalemo.today(), -1); }')
        ysum = {'number': 7, 'date': y_iso, 'hits': 5, 'points': 400, 'scored': True, 'learn': 'tr', 'native': 'de',
                'results': [{'id': i, 'kind': 'new', 'result': 'hit', 'hitAt': 3000, 'points': 80, 'strokes': FIX[i][0] if i in FIX else FIX['cat'][0], 'tips': [{'id': 'moon', 'p': 0.6}]} for i in [ids[1], 'apple', 'car', 'flower', 'star']],
                'funniest': {'target': ids[1], 'id': 'moon', 'p': 0.6}}
        pg.evaluate('([iso, sum]) => { localStorage.setItem("kalemo.day." + iso, JSON.stringify(sum)); window.__home(); return 1; }', [y_iso, ysum])
        pg.wait_for_selector('#btn-yesterday:not([hidden])', timeout=5000)
        ytile = pg.evaluate('() => window.__kalemo.yesterdayTileId ?? null')
        S.check('G1 Gestern-Kachel auf dem Start zeigt kein Tageswort als Zeichnung', ytile is not None and ytile not in ids, ytile)
        pg.click('#btn-yesterday', force=True)
        st = wait_state(pg, 's.lastCard && s.lastCard.kind === "yesterday"', 30000)
        S.check('G1 Gestern-Karte (Teilen-Text) nennt kein Wort der heutigen Tagesskizze', not leaks(st['lastCard']['text'], forms), (st['lastCard']['text'], leaks(st['lastCard']['text'], forms)))
        pg.evaluate('(iso) => { localStorage.removeItem("kalemo.day." + iso); const s = document.getElementById("sheet"); s.hidden = true; s.innerHTML = ""; window.__home(); return 1; }', y_iso)
        # (a) echte Tagesskizze → Teilen: Text, Zwischenablage, PNG-Metadaten
        plan, st = play_daily_hooks(pg, 'tr')
        pg.click('#btn-share', force=True)
        st = wait_state(pg, 's.lastCard && s.lastCard.gates && s.sheet', 40000)
        copy_btn = pg.query_selector('#sheet [data-act=copytext]')
        if copy_btn:
            pg.click('#sheet [data-act=copytext]', force=True); pg.wait_for_timeout(300)
        clip = pg.evaluate('() => window.__clip || null')
        txt = st['lastCard']['text']
        S.check('G1 Heute-Karte: Teilen-Text ohne Wortform der Tagesskizze', not leaks(txt, forms), (txt, leaks(txt, forms)))
        S.check('G1 Heute-Karte: Zwischenablage ohne Wortform der Tagesskizze', clip is not None and not leaks(clip, forms), (clip, leaks(clip or '', forms)))
        S.check('G1 Heute-Karte: keine scharfe Zeichnung (nur abstrakte Spuren mit Gate)', st['lastCard'].get('hero') is None and len(st['lastCard']['gates']) == 5 and all(g['ok'] for g in st['lastCard']['gates']), (st['lastCard'].get('hero'), len(st['lastCard']['gates'])))
        png = pg.evaluate('''async () => { const app = window.__kalemo; const m = await import('/js/game/cards.js'); const card = await m.todayCard(app, app.lastSummary);
          const buf = new Uint8Array(await card.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return btoa(s); }''')
        meta = png_text_chunks(base64.b64decode(png))
        S.check('G1 Heute-Karte-PNG: keine Text-Metadaten mit Wörtern', not any(leaks(x, forms) for x in meta), meta[:3])
        # Gegenprobe: lustigster Tipp, dessen Rateversuch selbst ein Tageswort ist → darf nicht auf die Karte
        adv = pg.evaluate('''async (ids) => { const app = window.__kalemo; const m = await import('/js/game/cards.js');
          const sum = JSON.parse(JSON.stringify(app.lastSummary)); sum.funniest = { target: ids[2], id: ids[0], p: 0.95, idx: 2 };
          sum.results[2].tips = [{ id: ids[0], p: 0.95 }]; sum.results[2].bestWrong = { id: ids[0], p: 0.95 };
          const card = await m.todayCard(app, sum); return { text: card.text, quote: card.quote }; }''', ids)
        S.check('G1 Heute-Karte: Rateversuch = anderes Tageswort wird nie zitiert', not leaks(adv['text'], forms), adv)
        pg.click('#sheet [data-act=close]', force=True)
        S.check('G1: keine Seitenfehler', not errs, errs[:2])
        # (e) Duell aus dem Tagesende beim Empfänger, der heute noch nicht gespielt hat
        pg.click('#btn-challenge', force=True); pg.wait_for_selector('#sheet .pick', timeout=5000)
        pg.locator('#sheet .pick').nth(1).click(force=True)
        st = wait_state(pg, 's.lastDuel && s.sheet', 15000)
        dwid, url = st['lastDuel']['id'], st['lastDuel']['url']
        rc = b.new_context(**DESK); rp = rc.new_page(); rerr = []
        rp.on('pageerror', lambda e: rerr.append(str(e)))
        rp.goto(url.replace('/#d=', '/?test=1#d=')); rp.wait_for_selector('#duel-body button', timeout=30000); rp.wait_for_timeout(1500)
        land = rp.text_content('#duel-body') or ''
        rst = rp.evaluate('() => window.__state()')
        gate = rp.query_selector('#duel-body [data-act=daily-first]')
        S.check('G1 Duell aus dem Tagesende → Empfänger (heute ungespielt): Landeseite nennt kein Tageswort, Replay startet nicht von selbst', dwid in ids and not leaks(land, forms) and not rst['duelState'] and rst['screen'] == 'duel', (dwid, leaks(land, forms), rst['duelState'] and rst['duelState'].get('phase')))
        S.check('G1 Duell-Empfänger: Hauptknopf „Erst Tagesskizze … dann das Duell" + „Direkt ansehen"', gate is not None and rp.query_selector('#duel-body [data-act=go]') is not None and ('Tagesskizze' in (gate.text_content() or '')), land[:160])
        S.check('G1 Duell-Empfänger: keine Seitenfehler', not rerr, rerr[:2])
        rc.close(); c.close()
    if on('g1'):
        S.run('G1 Spoiler', g1)

    # ---------------- G2 Erstes Bild ----------------
    def g2():
        played = '''(() => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }); const iso = f.format(new Date());
          if (localStorage.getItem('kalemo.g2init')) return; localStorage.setItem('kalemo.g2init', '1');
          const sum = { number: 1, date: iso, hits: 4, points: 380, scored: true, learn: 'tr', native: 'de', results: ['cat', 'house', 'sun', 'tree', 'fish'].map((id, i) => ({ id, kind: 'new', result: i === 3 ? 'timeout' : 'hit', hitAt: 3000, points: 80, strokes: [[[10, 200, 120, 10], [10, 30, 220, 10]]] })), funniest: null };
          localStorage.setItem('kalemo.day.' + iso, JSON.stringify(sum)); localStorage.setItem('kalemo.streak', JSON.stringify({ count: 1, last: iso })); })();'''
        for vw, vh in ((1366, 657), (1280, 720), (390, 844)):
            mob = vw < 500
            for state in ('frisch', 'gespielt', 'Instagram', 'Instagram+gespielt'):
                if state == 'Instagram+gespielt' and not mob:
                    continue
                kw = {'viewport': {'width': vw, 'height': vh}, 'locale': 'de-DE', 'is_mobile': mob, 'has_touch': mob}
                if 'Instagram' in state:
                    kw['user_agent'] = UA_IG
                c = b.new_context(**kw)
                if 'gespielt' in state:
                    c.add_init_script(played)
                pg = c.new_page()
                pg.goto(base + '/?test=1&lazy=1'); pg.wait_for_function('() => window.__kalemo && window.__kalemo.ready', timeout=60000); pg.wait_for_timeout(900)
                m = pg.evaluate('''() => { const b = document.querySelector('#btn-daily').getBoundingClientRect(); const t = document.querySelector('#today-tile'); const i = document.querySelector('#inapp');
                  return { top: Math.round(b.top), bottom: Math.round(b.bottom), ih: innerHeight, tile: !t.hidden, inapp: !i.hidden, scroll: document.querySelector('#screen-start').scrollTop, label: document.querySelector('#daily-label').textContent }; }''')
                ok = m['top'] >= 0 and m['bottom'] <= m['ih'] and m['scroll'] == 0 and (('gespielt' not in state) or m['tile']) and (('Instagram' not in state) or m['inapp'])
                S.check(f'G2 {vw}×{vh} {state}: Hauptknopf „{m["label"]}" im ersten Bild', ok, m)
                c.close()
    if on('g2'):
        S.run('G2 Erstes Bild', g2)

    # ---------------- G3 Fremder Dritter ----------------
    def g3():
        mk = b.new_context(**DESK); mp = mk.new_page(); mp.goto(base + '/?test=1'); wait_state(mp, 's.clfReady', 60000)
        A, B, C = 1111, 2222, 3333

        def link(frm, to, score, version=None):
            return mp.evaluate('''async ([st, frm, to, score]) => { const c = await import('/js/core/codec.js'); let t = 0;
              const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 30); t += xs.length * 30 + 200; return [xs.map(x => x + 20), ys.map(y => y + 20), ts]; });
              return c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf('cat'), senderMs: 4200, strokes, score, from: frm, to }); }''', [FIX['cat'][0], frm, to, score])
        rematch = link(B, A, [1, 0])  # B schickt A das Rückspiel, B führt 1:0

        def open_as(player, code, label):
            c = b.new_context(**DESK)
            init = "localStorage.setItem('kalemo.settings', JSON.stringify({native: 'de', learn: 'tr', chosenPair: true, airOffered: true}));"
            if player:
                init += f"localStorage.setItem('kalemo.player', '{player}');"
            c.add_init_script(f"if (!sessionStorage.getItem('g3')) {{ sessionStorage.setItem('g3', '1'); {init} }}")
            pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + '/?test=1#d=' + code)
            pg.wait_for_function('() => window.__state && window.__state() && (document.querySelector("#duel-body [data-act=go]") || (window.__state().duelState && window.__state().duelState.phase))', timeout=30000)
            go = pg.query_selector('#duel-body [data-act=go]')
            land = pg.text_content('#duel-body') or ''
            if go:
                go.click()
            wait_state(pg, 's.duelState && s.duelState.phase === "replay"', 30000)
            sub = pg.text_content('#word-sub') or ''
            wait_state(pg, 's.duelState && s.duelState.phase === "options"', 30000)
            pg.evaluate('() => window.__answer("cat")')
            wait_state(pg, 's.duelState && s.duelState.phase === "reveal"', 15000); pg.wait_for_timeout(900)
            card = pg.text_content('#round-overlay') or ''
            return c, pg, errs, land, sub, card
        SCORE = re.compile(r'Stand|Rückspiel|führt|Gleichstand|\b\d+\s*:\s*\d+\b')
        c1, p1, e1, land, sub, card = open_as(C, rematch, 'C')
        S.check('G3 Rückspiel-Link (B→A) bei fremdem Dritten C: kein Stand, kein „Rückspiel" (Landeseite, Replay, Auflösung)', not SCORE.search(land + ' ' + sub + ' ' + card), (land[:80], sub, SCORE.findall(land + sub + card)))
        S.check('G3 Dritter: keine Seitenfehler', not e1, e1[:2])
        c1.close()
        c2, p2, e2, land, sub, card = open_as(A, rematch, 'A')
        S.check('G3 Gegenprobe: der echte Empfänger A sieht den Stand „Rückspiel — Stand"', 'Stand' in (sub + land), (sub, land[:80]))
        c2.close()
        # Link mit Stand, aber ohne Empfänger-Kennung (alter v2-Link bzw. weitergeleitet) → kein Absender-Stand beim Öffner
        V2 = link(0, 0, [2, 1])
        c3, p3, e3, land, sub, card = open_as(C, V2, 'C')
        S.check('G3 Link ohne passende Empfänger-Kennung (alt/weitergeleitet) mit Stand 2:1 → Öffner sieht keinen fremden Stand', not SCORE.search(land + ' ' + sub + ' ' + card), (sub, SCORE.findall(land + sub + card)))
        c3.close(); mk.close()
    if on('g3'):
        S.run('G3 Fremder Dritter', g3)

    # ---------------- G4 Fortschritt ----------------
    def g4():
        c = b.new_context(**DESK); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => { localStorage.removeItem("kalemo.progress"); window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true}); return 1; }')
        plan = pg.evaluate('() => window.__plan()'); s0, s1, s2 = plan['slots'][0], plan['slots'][1], plan['slots'][2]
        pg.click('#btn-daily')
        play_slot_hooks(pg, s0, 'tr'); pg.evaluate('() => window.__next()')
        wait_state(pg, f's.round && s.round.target === {json.dumps(s1["id"])} && !s.overlay', 20000)
        # × → Rückfrage, „Weitermachen" → gleiche Runde
        pg.click('#round-close', force=True); pg.wait_for_timeout(300)
        dlg = pg.query_selector('.quit-card [data-k=stay]')
        st = pg.evaluate('() => window.__state()')
        S.check('G4 × in laufender Tagesskizze → Rückfrage statt Abbruch (Uhr steht)', dlg is not None and st['screen'] == 'round' and st['round'] and st['round']['paused'], (st['screen'], dlg is not None))
        if dlg:
            dlg.click(); pg.wait_for_timeout(250)
        st = pg.evaluate('() => window.__state()')
        S.check('G4 „Weitermachen" → dieselbe Runde läuft weiter', st['screen'] == 'round' and st['round'] and st['round']['target'] == s1['id'] and not st['round']['paused'], st['round'])
        # Esc → Rückfrage → Abbrechen → Start zeigt Wiederaufnahme → weiter bei Wort 2
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        quit_btn = pg.query_selector('.quit-card [data-k=quit]')
        S.check('G4 Esc in laufender Tagesskizze → Rückfrage', quit_btn is not None and pg.evaluate('() => window.__state().screen') == 'round')
        if quit_btn:
            quit_btn.click()
        else:
            pg.evaluate('() => window.__home()')
        wait_state(pg, 's.screen === "start"', 5000)
        label = pg.text_content('#daily-label') or ''
        pg.click('#btn-daily')
        st = wait_state(pg, 's.round', 20000)
        S.check('G4 Abbrechen → Start bietet Weiter bei Wort 2 → Runde = Wort 2, Wort 1 bleibt gezählt', st['round']['target'] == s1['id'] and st['daily'] and len(st['daily']['results']) == 1 and '2' in label, (label, st['round']['target'], st['daily']))
        # Reload mitten in Wort 2 → Fortschritt überlebt
        pg.reload(); wait_state(pg, 's.clfReady', 60000)
        label = pg.text_content('#daily-label') or ''
        pg.click('#btn-daily'); st = wait_state(pg, 's.round', 20000)
        S.check('G4 Reload während Wort 2 → Wiederaufnahme bei Wort 2', st['round']['target'] == s1['id'] and len(st['daily']['results']) == 1 and '2' in label, (label, st['round']['target']))
        # Zurück-Taste (history.back) → Rückfrage statt Verlust
        play_slot_hooks(pg, s1, 'tr'); pg.evaluate('() => window.__next()')
        wait_state(pg, f's.round && s.round.target === {json.dumps(s2["id"])} && !s.overlay', 20000)
        pg.evaluate('() => history.back()'); pg.wait_for_timeout(600)
        st = pg.evaluate('() => window.__state()')
        dlg = pg.query_selector('.quit-card [data-k=stay]')
        if st['screen'] == 'round' and dlg:
            ok_back = True; dlg.click()
        else:
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            lab = pg.text_content('#daily-label') or ''
            ok_back = '3' in lab
        S.check('G4 Zurück-Taste in laufender Tagesskizze → Rückfrage (oder Wiederaufnahme bei Wort 3)', ok_back, st['screen'])
        # Übung (Tag schon gewertet) schließt ohne Rückfrage
        pg.evaluate('() => window.__home()')
        today = pg.evaluate('() => window.__state().date')
        pg.evaluate('(iso) => { localStorage.removeItem("kalemo.progress"); localStorage.setItem("kalemo.day." + iso, JSON.stringify({ number: 1, date: iso, hits: 5, points: 400, scored: true, learn: "tr", native: "de", results: [], funniest: null })); window.__home(); return 1; }', today)
        pg.click('#btn-daily'); wait_state(pg, 's.round', 20000); pg.wait_for_timeout(200)
        pg.click('#round-close', force=True); pg.wait_for_timeout(300)
        st = pg.evaluate('() => window.__state()')
        S.check('G4 „Noch mal üben" schließt ohne Rückfrage', st['screen'] == 'start', st['screen'])
        S.check('G4: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if on('g4'):
        S.run('G4 Fortschritt', g4)

    # ---------------- G5 keine immer-wahren Checks ----------------
    def g5():
        pats = [' or ' + 'True', 'assert ' + 'True']
        hits = []
        for f in sorted(glob.glob(os.path.join(ROOT, 'tests', '*.py'))):
            for n, line in enumerate(open(f), 1):
                if any(pt in line for pt in pats):
                    hits.append(f'{os.path.basename(f)}:{n}')
        S.check('G5 tests/: keine immer-wahren Oder-/Assert-Konstanten (Scheinchecks)', not hits, hits)
    if on('g5'):
        S.run('G5 Scheinchecks', g5)

    b.close()
S.finish()
