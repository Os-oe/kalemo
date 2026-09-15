"""Phase-3-Gate (Systemsuite): Duell-Roundtrip identisch, URL-Länge p90 < 300, Heute-Karte + Spoiler-Gate,
Gestern-Karte, Wörterbuch überlebt Reload, alle 6 Sprachrichtungen komplett (Tagesskizze via Hooks),
Mehrzahl-Tipp je Paar, Duell empfangen → Replay → 4 Optionen → Auflösung → Mal zurück → neuer Link, In-App-Banner, Serie."""
import json, os, re, datetime
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT

S = Suite('phase3')
WORDS = {w['id']: w for w in json.load(open(os.path.join(ROOT, 'data/words.json')))}
PAIRS = [('de', 'tr'), ('de', 'en'), ('en', 'de'), ('en', 'tr'), ('tr', 'de'), ('tr', 'en')]
DAY_TITLE = {'de': 'Tagesskizze', 'en': 'Daily Sketch', 'tr': 'Günün Çizimi'}
RECOG = {'de': 'KI erkannte', 'en': 'AI recognised', 'tr': 'Yapay zekâ'}
NUM = {'de': ['', 'eins', 'zwei', 'drei'], 'en': ['', 'one', 'two', 'three'], 'tr': ['', 'bir', 'iki', 'üç']}


def expected_tip(w, learn, n):
    if learn == 'tr':
        return f"{NUM['tr'][n]} {'tane ' if w['tr'].get('tane') else ''}{w['tr']['word']}"
    if learn == 'de':
        return f"→ die {w['de']['pl']}"
    return w['en']['pl']


def play_daily(page, native, learn, date, S, label):
    page.evaluate('(p) => window.__settings(p)', {'native': native, 'learn': learn, 'airOffered': True, 'chosenPair': True})
    page.evaluate('(d) => window.__setDate(d)', date)
    plan = page.evaluate('() => window.__plan()')
    page.evaluate('() => window.__startDaily()')
    hits = 0
    for i, slot in enumerate(plan['slots']):
        wid = slot['id']; w = WORDS[wid]
        if learn == 'de' and slot['kind'] != 'plural':
            page.wait_for_selector('.art-card', timeout=15000)
            page.evaluate('(a) => window.__chooseArticle(a)', w['de']['art'])
        base = wait_state(page, f's.round && s.round.target === {json.dumps(wid)}', 20000)['drawCount']
        reps = slot['n'] if slot['kind'] == 'plural' else 1
        for k in range(reps):
            wait_state(page, f's.round && s.round.target === {json.dumps(wid)} && s.drawCount === {base + k}', 30000)
            page.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 10, gapMs: 150})', FIX[wid][k % 2])
            if k < reps - 1:
                wait_state(page, f'(s.drawCount === {base + k + 1} && s.round) || s.overlay', 30000)
        st = wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 40000)
        lr = st['lastResult']; hits += lr['result'] == 'hit'
        if slot['kind'] == 'plural':
            tip = page.text_content('#round-overlay .tipcard') if page.query_selector('#round-overlay .tipcard') else ''
            exp = expected_tip(w, learn, slot['n'])
            S.check(f'{label}: Mehrzahl-Tipp passt zur Lernsprache ({wid}, n={slot["n"]})', exp in (tip or ''), (tip, exp))
        page.evaluate('() => window.__next()')
    st = wait_state(page, 's.screen === "dayend" && s.summary', 20000)
    title = page.text_content('#dayend-title') or ''; recog = page.text_content('#dayend-recog') or ''
    S.check(f'{label}: Tagesskizze komplett, Tagesende in UI-Sprache', DAY_TITLE[native] in title and RECOG[native] in recog, (title, recog, f'{hits}/5 Treffer'))
    return plan, st


with server() as base, sync_playwright() as p:
    b, ctx = launch(p)
    page = ctx.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base + '/?test=1'); wait_state(page, 's.clfReady', 60000)

    # ---------- Codec ----------
    def codec():
        r = page.evaluate('''async (fix) => {
          const c = await import('/js/core/codec.js'); const R = await import('/js/core/raster.js');
          const names = window.__kalemo.clf.classNames; const lens = []; let identical = 0, total = 0; const bad = [];
          for (const [id, list] of Object.entries(fix)) for (const [k, d] of list.entries()) {
            const rng = R.makeRng(11 + k * 7 + id.length);
            const air = R.jitter(d, 2, rng).map(([xs, ys]) => [xs.map(x => x * 2.6 + 180), ys.map(y => y * 2.6 + 90)]);
            let t = 1000; const strokes = air.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 33); t += xs.length * 33 + 280; return [xs, ys, ts]; });
            const idx = names.indexOf(window.__kalemo.byId.get(id).cls);
            const code = c.encode({ classIdx: idx, senderMs: 7300, strokes });
            const url = 'https://kalemo.demo.osai.solutions/#d=' + code; lens.push(url.length);
            const dec = c.decode(code); const q = c.quantize(strokes); const tim = c.timingOf(strokes);
            const same = dec.classIdx === idx && dec.senderMs === 7300 && JSON.stringify(dec.strokes) === JSON.stringify(q.map(([x, y]) => [x, y]))
              && dec.timing.every((tt, i) => Math.abs(tt.gap - tim[i].gap) <= 10 && Math.abs(tt.dur - tim[i].dur) <= 10);
            total++; if (same) identical++; else if (bad.length < 3) bad.push(id);
          }
          lens.sort((a, b) => a - b);
          let broken = 0; const code = c.encode({ classIdx: 5, senderMs: 1000, strokes: [[[1, 50, 90], [2, 60, 10], [0, 30, 60]]] });
          for (const cut of [code.slice(0, -3), code.slice(0, 4), code.replace(/.$/, code.endsWith('A') ? 'B' : 'A')]) { try { c.decode(cut); } catch { broken++; } }
          return { total, identical, bad, p50: lens[Math.floor(lens.length * .5)], p90: lens[Math.floor(lens.length * .9)], max: lens[lens.length - 1], broken };
        }''', FIX)
        S.check('Duell-Roundtrip identisch (Striche, Timing ±10 ms, Wort, Absender-Zeit)', r['identical'] == r['total'], r)
        S.check('URL-Länge p90 < 300 Zeichen (Luft-Simulation über alle Fixtures)', r['p90'] < 300, f"p50 {r['p50']} · p90 {r['p90']} · max {r['max']} (n={r['total']})")
        S.check('defekte/abgeschnittene Duell-Codes werden erkannt', r['broken'] == 3, r['broken'])
    S.run('Codec', codec)

    def streak_logic():
        r = page.evaluate('''async () => { const s = await import('/js/core/store.js'); localStorage.removeItem('kalemo.streak');
          const a = s.bumpStreak('2026-10-01', '2026-09-30').count, b = s.bumpStreak('2026-10-02', '2026-10-01').count, c = s.bumpStreak('2026-10-02', '2026-10-01').count, d = s.bumpStreak('2026-10-05', '2026-10-04').count;
          localStorage.removeItem('kalemo.streak'); return [a, b, c, d]; }''')
        S.check('Serie: +1 je gespieltem Tag, doppelt zählt nicht, Lücke → 1', r == [1, 2, 2, 1], r)
    S.run('Serie', streak_logic)

    # ---------- 6 Sprachrichtungen ----------
    first = {}
    for pi, (native, learn) in enumerate(PAIRS):
        def run_pair(native=native, learn=learn, pi=pi):
            c2 = b.new_context(viewport={'width': 1280, 'height': 800})
            pg = c2.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            date = (datetime.date(2026, 9, 24) + datetime.timedelta(days=pi * 3)).isoformat()
            plan, st = play_daily(pg, native, learn, date, S, f'{native.upper()}→{learn.upper()}')
            if pi == 0:
                # Heute-Karte + Spoiler-Gate
                pg.click('#btn-share')
                st2 = wait_state(pg, 's.lastCard && s.sheet', 30000)
                gates = st2['lastCard']['gates']
                S.check('Heute-Karte-PNG erzeugt (1080×1350) + Fallback-Sheet mit Bild', st2['lastCard']['bytes'] > 20000 and pg.query_selector('#sheet img.share-img') is not None, st2['lastCard']['bytes'])
                S.check('Spoiler-Gate: Luftspur-Grafik → Zielwort nicht in Top-3 (alle Wörter)', len(gates) >= 4 and all(g['ok'] and g['id'] not in (g['top'] or []) for g in gates), [(g['id'], g['level'], g['top']) for g in gates])
                teeth = pg.evaluate('''async (ids) => { const out = []; const sum = window.__kalemo.lastSummary; for (const r of sum.results) { if (!ids.includes(r.id) || !r.strokes.length) continue; const res = await window.__kalemo.clf.classify(r.strokes); out.push([r.id, res.top.slice(0, 3).map(x => x.id).includes(r.id)]); } return out; }''', [g['id'] for g in gates])
                S.check('Spoiler-Gate hat Zähne: dieselben Zeichnungen als Striche werden erkannt', sum(1 for _, ok in teeth if ok) >= len(teeth) - 1, teeth)
                # Iteration 1 (P2-1): zweite Zeile = Zitat der lustigsten KI-Rate (verrät höchstens dieses eine Wort, in der Muttersprache)
                head = st2['lastCard']['text'].split('\n')[0]
                S.check('Teilen-Text: Kopfzeile spoilerfrei (#, Paar, x/5, Serie — keine Wörter) + ggf. Zitat', not any(WORDS[s['id']]['tr']['word'] in head or WORDS[s['id']]['de']['noun'] in head for s in plan['slots']) and re.search(r'#\d+ · DE → TR · \d/5', head) and (not st2['lastCard']['quote'] or st2['lastCard']['quote'] in st2['lastCard']['text']), st2['lastCard']['text'])
                pg.click('#sheet [data-act=close]')
                # Wörterbuch + Reload
                pg.click('#btn-dayend-dict')
                d1 = wait_state(pg, 's.screen === "dict" && s.dictEntries', 10000)['dictEntries']
                pg.reload(); wait_state(pg, 's.clfReady', 60000)
                pg.evaluate('() => window.__kalemo.openDict()')
                d2 = wait_state(pg, 's.screen === "dict" && s.dictEntries', 10000)['dictEntries']
                S.check('Bildwörterbuch überlebt Reload (IndexedDB)', len(d1) >= 3 and sorted(d1) == sorted(d2), (len(d1), len(d2)))
                pg.click('.dict-cell')
                pg.wait_for_selector('#sheet .dict-detail .others canvas', timeout=8000)
                n_langs = len(pg.query_selector_all('#sheet .dict-detail .lang-line')); n_oth = len(pg.query_selector_all('#sheet .dict-detail .others canvas'))
                S.check('Wörterbuch-Detail: 3 Sprachen + „So malen andere" (3 kuratierte)', n_langs == 3 and n_oth == 3, (n_langs, n_oth))
                pg.click('#sheet [data-act=close]')
                pg.click('[data-act=poster]')
                st3 = wait_state(pg, 's.lastPoster && s.sheet', 15000)
                S.check('Poster-PNG 1240×1754', st3['lastPoster']['w'] == 1240 and st3['lastPoster']['h'] == 1754, st3['lastPoster'])
                pg.click('#sheet [data-act=close]')
                # Gestern-Karte am Folgetag
                nxt = (datetime.date.fromisoformat(date) + datetime.timedelta(days=1)).isoformat()
                pg.evaluate('(d) => window.__setDate(d)', nxt); pg.evaluate('() => window.__home()')
                pg.wait_for_selector('#btn-yesterday:not([hidden])', timeout=5000)
                pg.click('#btn-yesterday')
                st4 = wait_state(pg, 's.lastCard && s.lastCard.kind === "yesterday" && s.sheet', 20000)
                S.check('Gestern-Kachel auf Start → Gestern-Karte (echte Zeichnungen)', st4['lastCard']['bytes'] > 20000, st4['lastCard'])
                first['url_ctx'] = True
            S.check(f'{native.upper()}→{learn.upper()}: keine Seitenfehler', not errs, errs[:2])
            c2.close()
        S.run(f'Paar {native}-{learn}', run_pair)

    # ---------- Duell empfangen → Mal zurück → neuer Link ----------
    def duel_flow():
        code = page.evaluate('''async (st) => { const c = await import('/js/core/codec.js'); let t = 0; const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 40); t += xs.length * 40 + 300; return [xs.map(x => x + 20), ys.map(y => y + 20), ts]; });
          return c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf('cat'), senderMs: 11000, strokes }); }''', FIX['cat'][0])
        c3 = b.new_context(viewport={'width': 1280, 'height': 800})
        pg = c3.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1#d=' + code)
        pg.wait_for_selector('#duel-body [data-act=go]', timeout=20000)
        S.check('Duell-Link, erster Besuch: Sprachpaar-Wahl vor dem Replay', True)
        pg.click('#duel-body [data-l="tr"][data-k="learn"]')
        pg.click('#duel-body [data-act=go]')
        st = wait_state(pg, 's.duelState && s.duelState.phase === "options"', 60000)
        opts = st['duelState']['options']
        S.check('Replay mit Original-Timing → 4 Antwort-Optionen inkl. Lösung', len(opts) == 4 and 'cat' in opts and len(set(opts)) == 4, opts)
        labels = [pg.text_content(f'.answer[data-id="{o}"]') for o in opts]
        S.check('Optionen in der eigenen Lernsprache (TR)', WORDS['cat']['tr']['word'] in labels, labels)
        pg.click('.answer[data-id="cat"]', force=True)
        st = wait_state(pg, 's.duelState && s.duelState.phase === "reveal"', 10000)
        pg.wait_for_selector('#round-overlay .times', timeout=5000)
        times = pg.text_content('#round-overlay .times'); langs = len(pg.query_selector_all('#round-overlay .lang-line'))
        S.check('Auflösung: richtig + 3 Sprachen + Zeitvergleich du/Absender', st['duelState']['ok'] and langs == 3 and '11' in (times or ''), (times, langs))
        pg.click('#round-overlay [data-act=back]')
        st = wait_state(pg, 's.screen === "duel" && s.duelPicks && s.duelPicks.length === 3', 10000)
        S.check('„Mal zurück" → 3 Wörter zur Auswahl', True, st['duelPicks'])
        wid = st['duelPicks'][0]
        pg.click(f'.word-pick[data-id="{wid}"]', force=True)
        wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 10, gapMs: 150})', FIX[wid][0])
        st = wait_state(pg, 's.lastDuel && s.lastDuel.id === ' + json.dumps(wid), 30000)
        url = st['lastDuel']['url']
        S.check('neuer Duell-Link erzeugt (#d=…, kein Server-Pfad)', '#d=' in url and st['lastDuel']['length'] < 400, st['lastDuel']['length'])
        pg2 = c3.new_page(); pg2.goto(url.replace('http://127.0.0.1', base.split(':')[0] + ':' if False else 'http://127.0.0.1').replace('/#d=', '/?test=1#d='))
        st2 = wait_state(pg2, 's.duelState && s.duelState.phase === "options"', 60000)
        S.check('Rück-Link öffnet dasselbe Wort (Roundtrip im Browser)', st2['duelState']['target'] == wid, st2['duelState']['target'])
        S.check('Duell: keine Seitenfehler', not errs, errs[:2])
        c3.close()
    S.run('Duell', duel_flow)

    # ---------- In-App-Browser ----------
    def inapp():
        c4 = b.new_context(viewport={'width': 390, 'height': 844}, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0', has_touch=True, is_mobile=True)
        pg = c4.new_page(); pg.goto(base + '/?test=1'); st = wait_state(pg, 's.clfReady', 60000)
        S.check('In-App-Browser (Instagram-UA): Banner „Für die Kamera im Browser öffnen", Bildschirm-Modus', st['inapp'] and st['mode'] == 'screen', st['inapp'])
        c4.close()
    S.run('In-App', inapp)
    S.check('keine Seitenfehler (Hauptseite)', not errors, errors[:3])
    b.close()
S.finish()
