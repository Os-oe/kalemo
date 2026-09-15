"""Iteration-1-Suite (Fresh-Eyes-Review 1): je Befund ein Abschnitt. Gezielt: FIX1_ONLY=p1_1,p1_2 python3 test_fix1.py"""
import json, os, datetime
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT

S = Suite('fix1')
WORDS = {w['id']: w for w in json.load(open(os.path.join(ROOT, 'data/words.json')))}
ONLY = [x for x in os.environ.get('FIX1_ONLY', '').split(',') if x]
UA_IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.18.110 (iPhone15,2; iOS 17_5; de_DE; de-DE; scale=3.00; 1179x2556)'
UA_LI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.2144'


def section(key):
    return not ONLY or key in ONLY


HIT_TEST = '''(sel) => { const el = document.querySelector(sel); if (!el) return { sel, ok: false, why: 'fehlt' };
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return { sel, ok: false, why: 'unsichtbar' };
  const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y);
  return { sel, ok: !!hit && (hit === el || el.contains(hit)), hit: hit ? (hit.id || hit.className || hit.tagName).toString().slice(0, 40) : null, x: Math.round(x), y: Math.round(y) }; }'''


def play_daily(pg, learn, via_button=False, stop_before=None):
    """Tagesskizze komplett per Hooks (Fixture-Striche). Liefert (plan, state am Tagesende)."""
    plan = pg.evaluate('() => window.__plan()')
    if via_button:
        pg.click('#btn-daily')
    else:
        pg.evaluate('() => window.__startDaily()')
    for i, slot in enumerate(plan['slots']):
        if stop_before is not None and i == stop_before:
            return plan, None
        wid = slot['id']; w = WORDS[wid]
        if learn == 'de' and slot['kind'] != 'plural' and slot.get('article', True):
            pg.wait_for_selector('.art-card', timeout=20000)
            pg.evaluate('(a) => window.__chooseArticle(a)', w['de']['art'])
        base_n = wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 30000)['drawCount']
        for k in range(slot['n'] if slot['kind'] == 'plural' else 1):
            wait_state(pg, f's.round && s.round.target === {json.dumps(wid)} && s.drawCount === {base_n + k}', 30000)
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[wid][k % 2])
        wait_state(pg, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 45000)
        pg.evaluate('() => window.__next()')
    return plan, wait_state(pg, 's.screen === "dayend" && s.summary', 30000)


def mobile_ctx(b, ua, **kw):
    return b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua, **kw)


with server() as base, sync_playwright() as p:
    b, _ctx = launch(p)

    # ---------- P1-1: In-App-Browser-Balken nie über Inhalt ----------
    def p1_1():
        for name, ua in (('Instagram', UA_IG), ('LinkedInApp', UA_LI)):
            c = mobile_ctx(b, ua); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            st = pg.evaluate('() => window.__state()')
            pos = pg.evaluate("() => getComputedStyle(document.querySelector('#inapp')).position")
            inside = pg.evaluate("() => !!document.querySelector('.start-wrap #inapp')")
            logo = pg.evaluate(HIT_TEST, '#title'); x = pg.evaluate(HIT_TEST, '#inapp-close')
            S.check(f'{name}: Start — Hinweis als eigene Layout-Zeile (nicht fixed), Logo + × frei antippbar', st['inapp'] and pos != 'fixed' and inside and logo['ok'] and x['ok'], (pos, logo, x))
            # Runde: Wort, Timer, ×, Lautsprecher treffen das eigene Element
            pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
            pg.evaluate('() => window.__setDate("2026-10-02")')
            pg.evaluate('() => window.__startDaily()')
            wait_state(pg, 's.round && s.screen === "round"', 20000)
            pg.wait_for_timeout(300)
            hits = [pg.evaluate(HIT_TEST, sel) for sel in ('#word', '#timer', '#round-close', '#round-speaker')]
            vis = pg.evaluate("() => { const el = document.querySelector('#inapp'); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }")
            S.check(f'{name} 390×844: Runde — elementFromPoint trifft Wort, Timer, ×, Lautsprecher; kein Balken sichtbar', all(h['ok'] for h in hits) and not vis, hits)
            chip = pg.evaluate(HIT_TEST, '#mode-toggle .chip.locked')
            chip_txt = pg.text_content('#mode-toggle .chip.locked') or ''
            S.check(f'{name}: Runde — nur kleiner Chip am „In die Luft"-Schalter („nur im Browser")', chip['ok'] and 'Browser' in chip_txt, (chip, chip_txt))
            pg.click('#mode-toggle .chip.locked')
            st = wait_state(pg, 's.toast', 3000)
            S.check(f'{name}: Tipp auf Chip erklärt „im Browser öffnen", Modus bleibt Bildschirm', 'Browser' in st['toast'] and st['mode'] == 'screen', st['toast'])
            pg.evaluate('() => window.__home()')
            if name == 'Instagram':
                pg.click('#inapp-close')
                pg.reload(); wait_state(pg, 's.clfReady', 60000)
                st = pg.evaluate('() => window.__state()')
                S.check('Instagram: × schließt den Hinweis dauerhaft (überlebt Reload, localStorage)', not st['inapp'] and st['settings'].get('inAppDismissed') is True, st['inapp'])
            S.check(f'{name}: keine Seitenfehler', not errs, errs[:2])
            c.close()
    if section('p1_1'):
        S.run('P1-1 In-App', p1_1)

    # ---------- P1-2: Tagesende → Jemanden herausfordern → Link-Karte auf dem Tagesende + Teilen ----------
    CLIP_SPY = "(() => { const c = navigator.clipboard; if (c && c.writeText) { const o = c.writeText.bind(c); c.writeText = (s) => { window.__clip = s; return o(s); }; } })();"
    SHARE_MOCK = "navigator.share = async (d) => { window.__shared = { url: d.url, text: d.text }; }; navigator.share.__mock = true;"

    def read_clip(pg):
        try:
            txt = pg.evaluate('async () => { try { return await navigator.clipboard.readText(); } catch (e) { return null; } }')
        except Exception:
            txt = None
        return txt if txt else pg.evaluate('() => window.__clip || null')

    def p1_2():
        for label, mobile in (('Desktop', False), ('Handy', True)):
            for with_share in (False, True):
                c = mobile_ctx(b, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1') if mobile else b.new_context(viewport={'width': 1280, 'height': 800})
                try:
                    c.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
                except Exception:
                    pass
                c.add_init_script(CLIP_SPY)
                if with_share:
                    c.add_init_script(SHARE_MOCK)
                pg = c.new_page(); errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)))
                pg.goto(base + '/?test=1&scene=dayend'); wait_state(pg, 's.screen === "dayend" && s.summary', 30000)
                pg.click('#btn-challenge', force=True)
                pg.wait_for_selector('#sheet .pick', timeout=5000)
                pg.locator('#sheet .pick').first.click(force=True)
                st = wait_state(pg, 's.lastDuel && s.sheet && s.lastLinkShare', 10000)
                code_txt = pg.text_content('#sheet .link-card code') or ''
                box = pg.evaluate("() => { const r = document.querySelector('#sheet .link-card').getBoundingClientRect(); return r.width > 100 && r.height > 100 && r.top >= 0 && r.bottom <= innerHeight + 1; }")
                sentence = 'Jemand hat dir etwas in die Luft gemalt!'
                tag = f'{label} {"mit" if with_share else "ohne"} navigator.share'
                S.check(f'{tag}: Tipp auf Zeichnung → Link-Karte auf dem Tagesende sichtbar (Link = Duell-Link)', st['screen'] == 'dayend' and box and code_txt == st['lastDuel']['url'] and '#d=' in code_txt, (st['screen'], box, code_txt[:60]))
                if with_share:
                    shared = pg.evaluate('() => window.__shared')
                    S.check(f'{tag}: startet direkt navigator.share mit Satz + Link', shared and shared['url'] == st['lastDuel']['url'] and shared['text'] == sentence and st['lastLinkShare']['mode'] == 'shared', shared)
                else:
                    clip = read_clip(pg)
                    S.check(f'{tag}: Fallback kopiert sofort Satz + Link, Karte meldet „Link kopiert."', clip and sentence in clip and st['lastDuel']['url'] in clip and 'kopiert' in (pg.text_content('#sheet .link-status') or ''), clip)
                pg.evaluate('() => { window.__clip = null; }')
                pg.click('#sheet [data-act=copy]', force=True)
                pg.wait_for_function('() => window.__clip', timeout=5000)
                clip = read_clip(pg)
                S.check(f'{tag}: „Link kopieren" nimmt den Satz mit (P3-11)', clip and clip.startswith(sentence) and clip.endswith(st['lastDuel']['url']), clip)
                pg.click('#sheet [data-act=done]', force=True)
                pg.wait_for_timeout(200)
                st = pg.evaluate('() => window.__state()')
                S.check(f'{tag}: „Fertig" schließt nur die Karte, Tagesende bleibt', st['screen'] == 'dayend' and not st['sheet'] and not errs, (st['screen'], errs[:2]))
                c.close()
    if section('p1_2'):
        S.run('P1-2 Herausfordern', p1_2)

    # ---------- P1-3: Hilfe = Hinweis statt Aufgeben ----------
    def p1_3():
        for native, learn, date in (('en', 'tr', '2026-10-17'), ('tr', 'de', '2026-10-20')):
            c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            pg.evaluate('(p) => window.__settings(p)', {'native': native, 'learn': learn, 'airOffered': True, 'chosenPair': True})
            pg.evaluate('(d) => window.__setDate(d)', date)
            plan = pg.evaluate('() => window.__plan()'); slot = next(s for s in plan['slots'] if s['kind'] != 'plural'); wid = slot['id']; w = WORDS[wid]
            # bis zum ersten Einzelwort vorspulen (Mehrzahl hat keine Hilfe)
            pg.evaluate('() => window.__startDaily()')
            idx = plan['slots'].index(slot)
            for k in range(idx):
                s2 = plan['slots'][k]
                if learn == 'de' and s2['kind'] != 'plural':
                    pg.wait_for_selector('.art-card', timeout=15000); pg.evaluate('(a) => window.__chooseArticle(a)', WORDS[s2['id']]['de']['art'])
                base_n = wait_state(pg, f's.round && s.round.target === {json.dumps(s2["id"])}', 20000)['drawCount']
                for r_ in range(s2['n'] if s2['kind'] == 'plural' else 1):
                    wait_state(pg, f's.round && s.drawCount === {base_n + r_}', 30000)
                    pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[s2['id']][r_ % 2])
                wait_state(pg, f's.lastResult && s.lastResult.id === {json.dumps(s2["id"])} && s.overlay', 40000); pg.evaluate('() => window.__next()')
            if learn == 'de':
                pg.wait_for_selector('.art-card', timeout=15000); pg.evaluate('(a) => window.__chooseArticle(a)', w['de']['art'])
            wait_state(pg, f's.round && s.round.target === {json.dumps(wid)} && !s.overlay', 20000)
            pg.wait_for_selector('#round-help:not([hidden])', timeout=12000)
            pg.click('#round-help', force=True)
            pg.wait_for_selector('#round-overlay .card.help .others canvas', timeout=6000)
            card_txt = pg.text_content('#round-overlay .card.help') or ''
            n_ex = len(pg.query_selector_all('#round-overlay .card.help .others canvas'))
            words_all = [w['tr']['word'], w['en']['word'], w['de']['noun']]
            leak = [x for x in words_all if x.lower() in card_txt.lower()]
            title_ok = {'en': 'your turn', 'tr': 'şimdi sen'}[native] in card_txt.lower()
            S.check(f'{native}→{learn}: Hilfe zeigt „So malen es andere — jetzt du!" + 2–3 Beispiele OHNE Übersetzung', title_ok and 2 <= n_ex <= 3 and not leak and not pg.query_selector('#round-overlay .lang-line'), (card_txt[:80], n_ex, leak))
            S.check(f'{native}→{learn}: nie „nicht erkannt" als Hilfe-Text', not any(x in card_txt for x in ('nicht erkannt', 'couldn’t tell', 'Anlayamadım')), card_txt[:80])
            s1 = pg.evaluate('() => window.__state()'); t1 = pg.text_content('#timer-s'); pg.wait_for_timeout(1600); s2_ = pg.evaluate('() => window.__state()'); t2 = pg.text_content('#timer-s')
            S.check(f'{native}→{learn}: Timer pausiert während der Hilfe (Runde läuft nicht weiter)', s1['round']['paused'] and abs(s2_['round']['elapsedMs'] - s1['round']['elapsedMs']) < 60 and t1 == t2 and not s2_['round']['enabled'], (s1['round']['elapsedMs'], s2_['round']['elapsedMs'], t1, t2))
            pg.click('#round-overlay [data-act=help-go]', force=True)
            s3 = wait_state(pg, 's.round && !s.round.paused && !s.overlay', 5000)
            left = int(pg.text_content('#timer-s') or 0)
            S.check(f'{native}→{learn}: „Jetzt du!" → dieselbe Runde mit Restzeit, Malen wieder an', s3['round']['target'] == wid and s3['round']['enabled'] and 5 <= left <= 13, (left, s3['round']['target']))
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 10, gapMs: 140})', FIX[wid][0])
            st = wait_state(pg, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 30000)
            lr = st['lastResult']; exp = 60 + (20 if learn == 'de' else 0)
            S.check(f'{native}→{learn}: Treffer nach Hilfe zählt — Punkte ohne Tempo-Bonus ({exp})', lr['result'] == 'hit' and lr['helped'] and lr['points'] == exp, (lr['result'], lr['points'], lr['helped']))
            S.check(f'{native}→{learn}: keine Seitenfehler', not errs, errs[:2])
            c.close()
    if section('p1_3'):
        S.run('P1-3 Hilfe', p1_3)

    # ---------- P2-1: Teilen-Karte mit Pointe ----------
    def p2_1():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1&scene=dayend'); wait_state(pg, 's.screen === "dayend" && s.summary', 30000)
        pg.click('#btn-share', force=True)
        st = wait_state(pg, 's.lastCard && s.lastCard.gates && s.sheet', 30000); lc = st['lastCard']; fz = st['summary']['funniest']
        lines = lc['text'].split('\n')
        # Iteration 2 (Orchestrator-Entscheidung Punkt 2a, ersetzt Iteration-1-Punkt „genau EINE Zeichnung scharf"): Zitat OHNE Zielwort
        S.check('Heute-Karte 1080×1350 + Zitat als Neugier-Lücke auf Karte UND im Teilen-Text („hielt Wort N erst für … Was hab ich gemalt?")', lc['w'] == 1080 and lc['h'] == 1350 and lc['quote'] and 'hielt Wort ' in lc['quote'] and 'Was hab ich gemalt?' in lc['quote'] and len(lines) == 2 and lc['quote'] in lines[1] and lines[1].startswith('„'), lc['text'])
        S.check('Keine scharfe Zeichnung mehr: alle 5 als abstrakte Leuchtspuren mit Spoiler-Gate (Iteration 2)', lc['hero'] is None and len(lc['gates']) == 5 and all(g['ok'] and g['id'] not in (g['top'] or []) for g in lc['gates']), (lc['hero'], [(g['id'], g['level'], g['top']) for g in lc['gates']]))
        probe = pg.evaluate('''async () => { const app = window.__kalemo; const m = await import('/js/game/cards.js'); const card = await m.todayCard(app, app.lastSummary);
          const ctx = card.canvas.getContext('2d');
          const tile = ctx.getImageData(72, 610, 300, 150).data; let lit = 0, dark = 0; for (let i = 0; i < tile.length; i += 4) { const l = tile[i] + tile[i + 1] + tile[i + 2]; if (l > 600) lit++; else if (l < 200) dark++; }
          return { lit, dark, n: tile.length / 4 }; }''')
        S.check('Spur-Kachel: Navy mit Leuchtspur (Langzeitbelichtung, nicht verwaschen)', probe['dark'] > probe['n'] * 0.3 and probe['lit'] > 150, probe)
        # ohne lustigen Tipp: keine scharfe Zeichnung, 5 Spuren, einzeiliger Text
        r = pg.evaluate('''async () => { const app = window.__kalemo; const m = await import('/js/game/cards.js'); const sum = { ...app.lastSummary, funniest: null };
          const card = await m.todayCard(app, sum); return { gates: card.gates.map(g => g.ok), hero: card.hero, text: card.text, quote: card.quote }; }''')
        S.check('Ohne lustigen Tipp: alle 5 Spuren abstrakt (Gate je Spur), kein Zitat, Text einzeilig', r['hero'] is None and len(r['gates']) == 5 and all(r['gates']) and r['quote'] is None and '\n' not in r['text'], r)
        # EN/TR-Sätze
        s2 = pg.evaluate('''async () => { const i = await import('/js/core/i18n.js'); const w = window.__kalemo.byId; return [i.funnyLine(w.get('hospital'), w.get('leg'), 'de'), i.funnyLine(w.get('hospital'), w.get('leg'), 'en'), i.funnyLine(w.get('hospital'), w.get('leg'), 'tr'), i.funnyLine(w.get('lion'), w.get('owl'), 'de'), i.funnyLine(w.get('cat'), w.get('eyeglasses'), 'en'), i.funnyLine(w.get('stairs'), w.get('apple'), 'en')]; }''')
        S.check('Zitat-Sätze DE/EN/TR („erst an", n-Deklination, Plural-only)', s2 == ['Die KI dachte bei meinem Krankenhaus erst an ein Bein.', 'At first, the AI thought my hospital was a leg.', 'Yapay zekâ hastane yerine önce bacak dedi.', 'Die KI dachte bei meinem Löwen erst an eine Eule.', 'At first, the AI thought my cat was a pair of glasses.', 'At first, the AI thought my stairs were an apple.'], s2)
        S.check('P2-1: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p2_1'):
        S.run('P2-1 Teilen-Karte', p2_1)

    # ---------- P2-2: Startseite nach dem Spielen: Ergebnis-Kachel + Countdown ----------
    def p2_2():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        S.check('Frischer Start: keine Ergebnis-Kachel', pg.is_hidden('#today-tile'))
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        today = pg.evaluate('() => window.__state().date')
        plan, st = play_daily(pg, 'tr')
        hits = st['summary']['hits']
        pg.click('#btn-dayend-home', force=True)
        pg.wait_for_selector('#today-tile:not([hidden])', timeout=5000)
        import zoneinfo
        now = datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Berlin'))
        mid = (now + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        hours = int((mid - now).total_seconds() // 3600)
        score = pg.text_content('#today-score'); nxt = pg.text_content('#today-next')
        exp_next = f'Neue Skizze in {hours} h' if hours >= 1 else 'Neue Skizze in'
        S.check('Start nach dem Spielen: Kachel „Heute x/5" + Teilen + Herausfordern + „Neue Skizze in N h" (Mitternacht Berlin)', score == f'Heute {hits}/5' and nxt.startswith(exp_next) and pg.is_visible('#today-share') and pg.is_visible('#today-challenge'), (score, nxt, hours))
        pg.wait_for_timeout(700)  # Einblend-Animation (translateY) abwarten, sonst misst die Bounding-Box den Zwischenstand
        box = pg.evaluate("() => { const t = document.querySelector('#today-tile').getBoundingClientRect(), d = document.querySelector('#btn-daily').getBoundingClientRect(); return [Math.round(t.bottom), Math.round(d.top)]; }")
        S.check('Kachel steht über „Noch mal üben"', box[0] <= box[1] + 1 and 'üben' in (pg.text_content('#daily-label') or ''), (box, pg.text_content('#daily-label')))
        pg.reload(); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate(f'() => window.__setDate("{today}")'); pg.evaluate('() => window.__home()')
        S.check('Kachel überlebt Reload (localStorage)', pg.is_visible('#today-tile') and pg.text_content('#today-score') == f'Heute {hits}/5')
        pg.click('#today-share')
        st = wait_state(pg, 's.lastCard && s.sheet', 30000)
        S.check('Kachel → Teilen: Heute-Karte (gleiche Tagesnummer, Gates ok)', f'#{plan["number"]}' in st['lastCard']['text'] and all(g['ok'] for g in st['lastCard']['gates']) and pg.query_selector('#sheet img.share-img') is not None, st['lastCard']['text'])
        pg.click('#sheet [data-act=close]', force=True)
        pg.click('#today-challenge')
        pg.wait_for_selector('#sheet .pick', timeout=5000); pg.locator('#sheet .pick').first.click(force=True)
        st = wait_state(pg, 's.lastDuel && s.sheet && s.lastLinkShare', 10000)
        S.check('Kachel → Herausfordern: Zeichnung wählen → Link-Karte auf dem Start', st['screen'] == 'start' and pg.is_visible('#sheet .link-card'), st['lastDuel']['url'][:50])
        ms = pg.evaluate('''async () => { const p = await import('/js/core/plan.js'); const at = (iso) => p.msToBerlinMidnight(Date.parse(iso));
          return [at('2026-09-15T12:00:00Z'), at('2026-10-25T00:30:00Z'), at('2027-03-28T00:30:00Z'), at('2026-10-25T12:00:00Z'), at('2026-09-15T21:59:30Z')]; }''')
        S.check('Countdown sommerzeitfest (normal 10 h · 25-h-Tag vor Umstellung 22,5 h · 23-h-Tag vor Umstellung 21,5 h · nach Umstellung 11 h · 30 s vor Mitternacht)', ms == [36000000, 81000000, 77400000, 39600000, 30000], ms)
        S.check('P2-2: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p2_2'):
        S.run('P2-2 Start-Kachel', p2_2)

    # ---------- P2-3: Duell fair + spannend ----------
    # Iteration 2 (R2-P2-5/R2-P3-10, bewusst geänderte Soll-Werte): Wertung Malzeit gegen Malzeit statt Ratezeit gegen Malzeit,
    # Knapp < 0,5 s statt ≤ 1 s, Ergebnis erst nach der eigenen Zeichnung, Code v3 mit Spieler-Kennungen (Detail: test_fix2 t3).
    V1_LIVE = 'AdUCyAEGEwDwAqYDiAIAIB84CSqLARJHDSdjD0sWGwojHhUoBRYfKAJgIhIiIBQUJAEoAyHBAZMCaQ2dAWJwAxF9RAFYawWYAQIeMocCggGFAR0CFC2CAUKBARgCDhakAzlaE3U'
    MK_LINK = '''async ([st, senderMs, score, cls]) => { const c = await import('/js/core/codec.js'); const s = await import('/js/core/store.js'); let t = 0;
      const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 70); t += xs.length * 70 + 500; return [xs.map(x => x + 20), ys.map(y => y + 20), ts]; });
      return { code: c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf(cls), senderMs, strokes, score, from: s.playerId(), to: 0 }), dur: t, me: s.playerId() }; }'''

    def p2_3():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        r = pg.evaluate('''async ([fix, v1]) => { const c = await import('/js/core/codec.js'); const R = await import('/js/core/raster.js'); const names = window.__kalemo.clf.classNames;
          const lens = []; let same = 0, total = 0;
          for (const [id, list] of Object.entries(fix)) for (const [k, d] of list.entries()) {
            const rng = R.makeRng(11 + k * 7 + id.length); const air = R.jitter(d, 2, rng).map(([xs, ys]) => [xs.map(x => x * 2.6 + 180), ys.map(y => y * 2.6 + 90)]);
            let t = 1000; const strokes = air.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 33); t += xs.length * 33 + 280; return [xs, ys, ts]; });
            const idx = names.indexOf(window.__kalemo.byId.get(id).cls); const score = [(k * 7) % 13, (id.length * 3) % 11];
            const code = c.encode({ classIdx: idx, senderMs: 7300, strokes, score, from: 123456, to: 654321 }); lens.push(('https://kalemo.demo.osai.solutions/#d=' + code).length);
            const dec = c.decode(code); total++; if (dec.version === 3 && dec.classIdx === idx && dec.score[0] === score[0] && dec.score[1] === score[1] && dec.to === 654321 && JSON.stringify(dec.strokes) === JSON.stringify(c.quantize(strokes).map(([x, y]) => [x, y]))) same++;
          }
          lens.sort((a, b) => a - b); const old = c.decode(v1);
          return { same, total, p90: lens[Math.floor(lens.length * 0.9)], v1: { version: old.version, score: old.score, cls: names[old.classIdx], n: old.strokes.length } }; }''', [FIX, V1_LIVE])
        S.check('Duell-Code v3: Roundtrip identisch inkl. Stand + Kennungen, URL p90 < 300', r['same'] == r['total'] and r['p90'] < 300, r)
        S.check('Alte v1-Links (live erzeugt) bleiben lesbar, Stand 0:0', r['v1']['version'] == 1 and r['v1']['score'] == [0, 0] and r['v1']['n'] > 0, r['v1'])
        o = pg.evaluate('''async () => { const m = await import('/js/core/duelscore.js'); const f = (ok, y, th, s) => { const x = m.duelOutcome({ ok, youMs: y, themMs: th, score: s }); return [x.key, x.you, x.them]; };
          return [f(true, 2000, 9000, [0, 0]), f(true, 8700, 9000, [2, 1]), f(true, 9300, 9000, [0, 0]), f(true, 15000, 9000, [0, 3]), f(false, 1000, 9000, [1, 1])]; }''')
        S.check('Wertung (Malzeit gegen Malzeit): schneller · knapp gewonnen (< 0,5 s) · knapp verloren · langsamer · falsch geraten', o == [['faster', 1, 0], ['closeWin', 2, 2], ['closeLose', 0, 1], ['slower', 3, 1], ['wrong', 1, 2]], o)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        today_ids = [s_['id'] for s_ in pg.evaluate('() => window.__plan()')['slots']]
        word = next(x for x in ('owl', 'snail', 'umbrella', 'star', 'apple') if x not in today_ids)
        link = pg.evaluate(MK_LINK, [FIX[word][0], 9000, [0, 0], word])
        c2 = b.new_context(viewport={'width': 1280, 'height': 800}, locale='de-DE'); p2 = c2.new_page(); e2 = []
        p2.on('pageerror', lambda e: e2.append(str(e)))
        p2.goto(base + '/?test=1#d=' + link['code'])
        p2.wait_for_selector('#duel-body [data-act=go]', timeout=30000)
        p2.click('#duel-body [data-act=go]')
        t_go = p2.evaluate('() => performance.now()')
        st = wait_state(p2, 's.duelState && s.duelState.phase === "options"', 15000)
        after = st['duelState']['shownAt'] - t_go
        S.check(f'Antworten nach ~3 s eingeblendet, Wiedergabe läuft weiter (Replay {link["dur"] / 1000:.1f} s)', 2500 <= after <= 5000 and st['duelState']['replaying'] and len(st['duelState']['options']) == 4 and word in st['duelState']['options'], (round(after), st['duelState']['replaying']))
        S.check('Raten ohne Stoppuhr (Raten zählt als ✓/✗, Tempo zählt beim Malen)', p2.query_selector('#round-overlay .duel-clock') is None)
        p2.click(f'.answer[data-id="{word}"]', force=True)
        st = wait_state(p2, 's.duelState && s.duelState.phase === "reveal"', 10000)
        p2.wait_for_selector('#round-overlay .duel-result', timeout=5000)
        title = p2.text_content('#round-overlay .duel-result'); ds = st['duelState']
        S.check('Auflösung: „Richtig geraten!" + Absender-Malzeit, noch kein Sieger/Stand', ds['ok'] and 'Richtig' in title and 'Absender hat in 9,0 s gemalt' in (p2.text_content('#round-overlay .times') or '') and not p2.query_selector('#round-overlay .duel-score'), (title, ds))
        p2.click('#round-overlay [data-act=back]')
        st = wait_state(p2, 's.screen === "duel" && s.duelPicks && s.duelPicks.length === 3', 10000)
        wid = next((x for x in st['duelPicks'] if x in FIX), st['duelPicks'][0])
        p2.click(f'.word-pick[data-id="{wid}"]', force=True)
        wait_state(p2, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        p2.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[wid][0])
        st = wait_state(p2, f's.lastDuel && s.lastDuel.id === {json.dumps(wid)} && s.duelState && s.duelState.phase === "result"', 40000)
        dec = p2.evaluate('async (code) => { const c = await import("/js/core/codec.js"); const d = c.decode(code); return [d.score, d.to]; }', st['lastDuel']['code'])
        S.check('Nach der eigenen Zeichnung: Ergebnis „faster" (9,0 s Absender) + Rückspiel-Link mit Stand 1:0 an den Absender, URL < 300', st['duelState']['outcome'] == 'faster' and dec == [[1, 0], link['me']] and st['lastDuel']['length'] < 300, (st['duelState'], dec, st['lastDuel']['length']))
        p3 = c.new_page(); p3.goto(st['lastDuel']['url'].replace('/#d=', '/?test=1#d='))
        wait_state(p3, 's.duelState && s.duelState.phase === "replay"', 30000)
        sub = p3.text_content('#word-sub') or ''
        S.check('Rückspiel beim ursprünglichen Absender: „Rückspiel — Stand 0:1"', 'Stand 0:1' in sub, sub)
        S.check('P2-3: keine Seitenfehler', not errs and not e2, (errs[:2], e2[:2]))
        c2.close(); c.close()
    if section('p2_3'):
        S.run('P2-3 Duell', p2_3)

    # ---------- P2-4: Duell-Wortwahl ----------
    def p2_4():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        pg.click('#btn-duel')
        st = wait_state(pg, 's.screen === "duel" && s.duelPicks', 10000)
        info = pg.evaluate('''() => [...document.querySelectorAll('.word-pick')].map(b => ({ id: b.dataset.id, main: b.querySelector('span').textContent, sub: b.querySelector('small')?.textContent || null,
          subColor: b.querySelector('small') ? getComputedStyle(b.querySelector('small')).color : null, iter: getComputedStyle(b).animationIterationCount }))''')
        grey = lambda col: col and col != 'rgb(30, 42, 58)' and len(set(col[4:-1].split(', '))) <= 3 and max(map(int, col[4:-1].split(', '))) - min(map(int, col[4:-1].split(', '))) < 40
        ok_sub = all(i['sub'] == f"{WORDS[i['id']]['de']['art']} {WORDS[i['id']]['de']['noun']}" and i['main'] == WORDS[i['id']]['tr']['word'] and grey(i['subColor']) for i in info)
        S.check('Unter jedem Lernwort klein die Muttersprache in Grau', len(info) == 3 and ok_sub, info)
        S.check('Wackeln nur einmal beim Öffnen (keine Endlos-Animation)', all(i['iter'] == '1' for i in info), [i['iter'] for i in info])
        pg.wait_for_timeout(900)
        stable = True
        try:
            pg.locator('.word-pick').nth(1).hover(timeout=2000)  # ohne force: Element muss „stable" sein
        except Exception:
            stable = False
        S.check('Wortkarten stehen nach dem Einwackeln still (Playwright „stable")', stable)
        back = pg.text_content('#duel-body [data-act=home]')
        pg.click('#duel-body [data-act=home]')
        st = wait_state(pg, 's.screen === "start"', 5000)
        S.check('Link „Start" heißt jetzt „Zurück" und führt zur Startseite', back == 'Zurück' and st['screen'] == 'start', back)
        S.check('P2-4: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p2_4'):
        S.run('P2-4 Duell-Wortwahl', p2_4)

    # ---------- P2-5: Sprachwahl — aktive Sprache tut nichts, Tauschen nur über ⇄ (+ P3-8 Pfeiltasten) ----------
    def p2_5():
        c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='de-DE'); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        s0 = pg.evaluate('() => window.__state().settings')
        pair0 = (s0['native'], s0['learn'])
        pg.tap(f'#pair-learn [data-l="{s0["learn"]}"]'); pg.tap(f'#pair-native [data-l="{s0["native"]}"]')
        s1 = pg.evaluate('() => window.__state().settings')
        S.check(f'Frischer Besuch {pair0}: Tipp auf aktive Sprache → Paar unverändert, UI bleibt', (s1['native'], s1['learn']) == pair0 and pg.text_content('#pair-native-l') == 'Ich spreche', (s1['native'], s1['learn']))
        pg.tap(f'#pair-learn [data-l="{s0["native"]}"]', force=True)
        s2 =pg.evaluate('() => window.__state().settings')
        locked = pg.get_attribute(f'#pair-learn [data-l="{s0["native"]}"]', 'aria-disabled')
        S.check('Tipp auf die Sprache der anderen Spalte → gesperrt, kein heimliches Tauschen', (s2['native'], s2['learn']) == pair0 and locked == 'true', (s2['native'], s2['learn'], locked))
        pg.tap('#pair-swap')
        s3 = pg.evaluate('() => window.__state().settings')
        S.check('⇄-Knopf tauscht das Paar (UI folgt der neuen Muttersprache)', (s3['native'], s3['learn']) == (pair0[1], pair0[0]) and s3['chosenPair'], (s3['native'], s3['learn'], pg.text_content('#pair-native-l')))
        pg.tap('#pair-swap')
        other = next(l for l in ('de', 'en', 'tr') if l not in pair0)
        pg.tap(f'#pair-learn [data-l="{other}"]')
        s4 = pg.evaluate('() => window.__state().settings')
        S.check('Andere freie Sprache wählbar', (s4['native'], s4['learn']) == (pair0[0], other), (s4['native'], s4['learn']))
        # Tastatur: Pfeile in der Radiogruppe (P3-8), gesperrte Sprache wird übersprungen
        pg.focus(f'#pair-learn [data-l="{other}"]')
        pg.keyboard.press('ArrowRight')
        s5 = pg.evaluate('() => window.__state().settings')
        focused = pg.evaluate('() => document.activeElement && document.activeElement.dataset.l')
        S.check('Pfeiltaste wählt die nächste freie Sprache (gesperrte übersprungen), Fokus bleibt in der Gruppe', s5['learn'] not in (other, s5['native']) and focused == s5['learn'], (s5['native'], s5['learn'], focused))
        tabs = pg.evaluate("() => [...document.querySelectorAll('#pair-learn button')].map(b => b.tabIndex)")
        S.check('Roving tabindex: nur die aktive Sprache ist per Tab erreichbar', sorted(tabs) == [-1, -1, 0], tabs)
        S.check('P2-5: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p2_5'):
        S.run('P2-5 Sprachwahl', p2_5)

    # ---------- P2-6: Luft-Onboarding — Tinte weg + unter der Dialog-Ebene ----------
    def p2_6():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        # Luft-Modus (ohne Kamera) mit großer roter Leuchttinte genau unter der Dialog-Mitte
        pg.evaluate('''async () => { const app = window.__kalemo; app.show('round'); app.setMode('air'); app.stage.clear(); app.stage.enabled = true; app.stage.setColor('#EF4444');
          const st = app.stage; const cx = st.w / 2, cy = st.h / 2; const xs = [], ys = [];
          for (let k = 0; k < 14; k++) { xs.length = 0; ys.length = 0; const y = cy - 170 + k * 26; st.beginStroke(cx - 330, y); for (let x = cx - 330; x <= cx + 330; x += 12) st.addPoint(x, y + Math.sin(x / 30) * 8); st.endStroke(); }
          app.choice('<h3>Test</h3><p>Dialog über Tinte</p>', [['a', 'Auf dem Bildschirm malen', 'primary'], ['b', 'Weiter', 'ghost']]); return 1; }''')
        pg.wait_for_timeout(400)
        hit = pg.evaluate(HIT_TEST, '#round-overlay [data-k="a"]'); hit2 = pg.evaluate(HIT_TEST, '#round-overlay [data-k="b"]')
        z = pg.evaluate("() => [getComputedStyle(document.querySelector('#stage canvas.ink')).zIndex, getComputedStyle(document.querySelector('#round-overlay')).zIndex]")
        box = pg.locator('#round-overlay .card').bounding_box()
        png = pg.screenshot(clip=box)
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(png)).convert('RGB'); px = list(im.getdata())
        red = sum(1 for (r, g, bb) in px if r > 190 and g < 120 and bb < 120) / len(px)
        S.check('Luft-Modus: Dialog-Knöpfe liegen über der Tinte (elementFromPoint + z-index)', hit['ok'] and hit2['ok'] and int(z[1]) > int(z[0] if z[0] != 'auto' else 0), (hit, hit2, z))
        S.check('Pixelprobe über der Dialog-Karte: keine rote Leuchttinte (< 0,3 %)', red < 0.003, f'{red * 100:.2f} % rote Pixel')
        pg.evaluate('() => window.__choose("b")')
        # Onboarding-Kette: nach „Ja, in die Luft" ist die alte Tinte gelöscht
        pg.evaluate('() => { const app = window.__kalemo; app.setMode("screen"); app.settings.airOffered = false; app.offerAir(); return 1; }')
        pg.wait_for_selector('#round-overlay [data-k="yes"]', timeout=5000)
        before = pg.evaluate('() => window.__state().stageFx.strokes')
        pg.click('#round-overlay [data-k="yes"]')
        pg.wait_for_selector('.precam-card [data-k="go"]', timeout=5000)
        after = pg.evaluate('() => window.__state().stageFx.strokes')
        S.check('„Ja, in die Luft" → Tinte der vorigen Zeichnung geleert, bevor Vorab-Karte/Kamera kommen', before >= 10 and after == 0, (before, after))
        S.check('P2-6: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p2_6'):
        S.run('P2-6 Luft-Onboarding', p2_6)

    # ---------- P2-7: Launch-Tage kuratieren ----------
    def p2_7():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        rep = json.load(open(os.path.join(ROOT, 'tools/accuracy-report.json')))['perWord']
        dates = [(datetime.date(2026, 9, 15) + datetime.timedelta(days=i)).isoformat() for i in range(60)]
        plans = pg.evaluate('(ds) => ds.map(d => window.__plan(d))', dates)
        p2 = c.new_page(); p2.goto(base + '/?test=1'); p2.wait_for_function('() => window.__plan')
        again = p2.evaluate('(ds) => ds.map(d => window.__plan(d))', dates); p2.close()
        S.check('Tagesplan deterministisch (60 Tage ab Launch, zweiter Tab identisch)', plans == again)
        first7 = plans[:14]  # Nachtrag 1.1: kuratiert #1–#14
        S.check('Tag #1 beginnt mit der Katze · Tage #1–#14 kuratiert · Tag #15 deterministisch', first7[0]['number'] == 1 and first7[0]['slots'][0]['id'] == 'cat' and all(p.get('curated') for p in first7) and not plans[14].get('curated') and plans[59]['number'] == 60, [s['id'] for s in first7[0]['slots']])
        ids7 = {s['id'] for p in first7 for s in p['slots']}
        low = [(i, rep[i]['air']['top3'], rep[i]['air']['top1']) for i in ids7 if rep[i]['air']['top3'] < 0.9 or rep[i]['air']['top1'] < 0.8]
        amb = [i for i in ids7 if WORDS[i]['ambiguous']]
        S.check('Launch-Tage: nur Top-3 ≥ 90 % + Top-1 ≥ 80 % (accuracy-report), nichts Mehrdeutiges, kein Sandwich', not low and not amb and 'sandwich' not in ids7, (low, amb, len(ids7)))
        anchor = pg.evaluate('''async () => { const p = await import('/js/core/plan.js'); const w = window.__kalemo.words; const a = p.planFor('2026-09-01', w), b = p.planFor('2026-09-14', w), c = p.planFor(p.LAUNCH_DATE, w);
          return { launch: p.LAUNCH_DATE, same: JSON.stringify(a.slots) === JSON.stringify(c.slots) && JSON.stringify(b.slots) === JSON.stringify(c.slots), nums: [a.number, b.number, c.number] }; }''')
        S.check('Ein Anker LAUNCH_DATE; Datum vor dem Anker → Inhalt + Nummer von Tag #1', anchor['launch'] == '2026-09-15' and anchor['same'] and anchor['nums'] == [1, 1, 1], anchor)
        early_ok = all(s.get('article') is False and s['kind'] != 'plural' for p in first7[:2] for s in p['slots'])
        later_ok = all(s.get('article', True) is not False for p in first7[2:] for s in p['slots']) and all(p['slots'][4]['kind'] == 'plural' for p in first7[2:])
        S.check('Artikel-Schritt + Mehrzahl frühestens ab Tag #3 (bis #14 durchgehend ab #3)', early_ok and later_ok, [[s['kind'] + ('' if s.get('article', True) else '/noArt') for s in p['slots']] for p in first7[:3]])
        uniq = all(len({s['id'] for s in p['slots']}) == 5 for p in plans)
        new_of = lambda p: [s['id'] for s in p['slots'] if s['kind'] == 'new']
        rev_ok = all(p['slots'][2]['kind'] == 'review' and p['slots'][2]['id'] in new_of(plans[i - 2]) for i, p in enumerate(plans) if i >= 7)
        plu_ok = all(p['slots'][4]['kind'] == 'plural' and p['slots'][4]['n'] in (2, 3) for p in plans[7:])
        S.check('Ab Tag #8 deterministischer Plan: neu/neu/Wdh(Tag−2)/neu/Mehrzahl, keine Dopplung', uniq and rev_ok and plu_ok, (uniq, rev_ok, plu_ok))
        cur_new = {s['id'] for p in first7 for s in p['slots'] if s['kind'] == 'new'}
        rep_new = [s['id'] for p in plans[14:48] for s in p['slots'] if s['kind'] == 'new' and s['id'] in cur_new]
        S.check('Launch-Wörter kommen im ersten Umlauf nicht erneut als „neu"', not rep_new, rep_new)
        S.check('Tag #15: Wiederholung von Tag #13, Mehrzahl aus Tag #8 (Tag−7)', plans[14]['slots'][2]['id'] in new_of(plans[12]) and plans[14]['slots'][4]['id'] in new_of(plans[7]), (plans[14]['slots'][2], plans[14]['slots'][4]))
        # DE-Lernende am Tag #1: kein Artikel-Schritt, Wort mit Artikel + Artikel-Farbe
        pg.evaluate('() => window.__settings({native: "tr", learn: "de", airOffered: true, chosenPair: true})')
        pg.evaluate('() => window.__setDate("2026-09-15")')
        pg.evaluate('() => window.__startDaily()')
        st = wait_state(pg, 's.round && s.round.target === "cat"', 15000)
        art = pg.query_selector('.art-card'); wtxt = pg.text_content('#word'); col = pg.evaluate('() => window.__kalemo.stage.color')
        S.check('DE-Lernende Tag #1: kein Artikel-Schritt, „die Katze" direkt, Strich in Artikel-Farbe', art is None and wtxt == 'die Katze' and col == '#EF4444', (wtxt, col))
        pg.evaluate('() => window.__home()')
        S.check('P2-7: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p2_7'):
        S.run('P2-7 Launch-Tage', p2_7)

    # ---------- P2-8: Attract-Loop mit Belohnung (+ P3-10 Klebeband, P3-16 Tagline, P3-7 Standbild) ----------
    BRIGHT_BOX = '''() => { const c = document.getElementById('attract'); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data;
      let my = 1e9, My = -1; for (let y = Math.round(c.height * 0.2); y < c.height * 0.85; y += 2) for (let i = Math.round(c.width * 0.2); i < c.width * 0.8; i += 2) { const k = (y * c.width + i) * 4; if (d[k] > 230 && d[k + 1] > 190) { if (y < my) my = y; if (y > My) My = y; } }
      return [my, My, c.height]; }'''

    def p2_8():
        # Iteration 2 (R2-P3-1): Motiv nicht mehr die Katze, sondern je Lernsprache ein Wort außerhalb der Launch-Tage/des Tagesplans → Erwartung aus attract.info
        fw = lambda w, l: f"{w['de']['art']} {w['de']['noun']}" if l == 'de' else w[l]['word']
        for native, learn in (('de', 'tr'), ('tr', 'en')):
            c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
            pg.evaluate('(p) => window.__settings(p)', {'native': native, 'learn': learn, 'chosenPair': True})
            seen = {}
            for sec in (2.4, 3.6, 4.7, 6.0, 8.5):
                pg.evaluate('(s) => window.__kalemo.attract.at(s)', sec); pg.wait_for_timeout(120)
                seen[sec] = (pg.text_content('#attract-bubble') or '').strip()
            info = pg.evaluate('() => window.__kalemo.attract.info')
            mw = WORDS[info['motif']]
            tips = [fw(WORDS[x], learn) + '?' for x in info['tips']]
            ok_tips = all(tip in seen[s] for tip, s in zip(tips, (2.4, 3.6, 4.7)))
            third = next(l for l in ('de', 'en', 'tr') if l not in (native, learn))
            card = seen[8.5]
            S.check(f'{native}→{learn}: Tipps nur in der Lernsprache', ok_tips, [seen[s] for s in (2.4, 3.6, 4.7)])
            S.check(f'{native}→{learn}: Treffer-Ausruf in der Lernsprache', seen[6.0].startswith({'tr': 'Buldum', 'en': 'I know', 'de': 'Ich weiß'}[learn]), seen[6.0])
            S.check(f'{native}→{learn}: Belohnungs-Karte „{fw(mw, learn)} · {fw(mw, native)} · {fw(mw, third)}" (Lern-, Mutter-, dritte Sprache)', card == f'{fw(mw, learn)} · {fw(mw, native)} · {fw(mw, third)}', card)
            pg.evaluate('() => window.__kalemo.attract.at(6.05)'); pg.wait_for_timeout(60); a = pg.evaluate(BRIGHT_BOX)
            ys = []
            for _ in range(8):
                pg.wait_for_timeout(90); ys.append(pg.evaluate(BRIGHT_BOX)[1])
            S.check(f'{native}→{learn}: Motiv bewegt sich nach dem Treffer (Leuchtspur bewegt sich vertikal)', max(ys) - min(ys) > 6, ys)
            tape = pg.evaluate("() => { const a = document.querySelector('.attract'); const cs = getComputedStyle(a, '::before'); return [cs.right, cs.left]; }")
            S.check('Klebeband oben rechts statt über dem Wort oben links (P3-10)', tape[0] == '-16px', tape)
            pg.evaluate('() => window.__kalemo.attract.at(0.1)'); pg.wait_for_timeout(150)
            tl = pg.text_content('#tagline')
            S.check(f'{native}→{learn}: erste Tagline in der Muttersprache (P3-16)', tl == {'de': 'Mal’s in die Luft.', 'en': 'Draw it in the air.', 'tr': 'Havada çiz.'}[native], tl)
            S.check(f'{native}→{learn}: keine Seitenfehler', not errs, errs[:2])
            c.close()
        # prefers-reduced-motion: Standbild mit fertiger Katze + Karte, keine Endlos-Animationen
        c = b.new_context(viewport={'width': 1280, 'height': 800}, reduced_motion='reduce', locale='de-DE'); pg = c.new_page()
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.wait_for_timeout(600)
        f1 = pg.evaluate("() => document.getElementById('attract').toDataURL().length + ':' + document.getElementById('attract').toDataURL().slice(-80)")
        pg.wait_for_timeout(1500)
        f2 = pg.evaluate("() => document.getElementById('attract').toDataURL().length + ':' + document.getElementById('attract').toDataURL().slice(-80)")
        card = (pg.text_content('#attract-bubble') or '').strip()
        anims = pg.evaluate("() => [...document.querySelectorAll('.logo-trail path, .tagline')].map(e => getComputedStyle(e).animationIterationCount)")
        motif = pg.evaluate('() => window.__kalemo.attract.info.motif')
        S.check('prefers-reduced-motion: Demo als Standbild (fertiges Motiv + Karte), keine Endlos-Schleifen', f1 == f2 and card.startswith(WORDS[motif]['tr']['word']) and 'infinite' not in ' '.join(anims), (card, anims))
        c.close()
    if section('p2_8'):
        S.run('P2-8 Attract-Loop', p2_8)

    # ---------- P2-9: Start-Layout skaliert mit der Höhe ----------
    def p2_9():
        for vw, vh, mob in ((1366, 657, False), (1280, 720, False), (1366, 768, False), (1440, 900, False), (390, 844, True), (360, 640, True)):
            c = b.new_context(viewport={'width': vw, 'height': vh}, is_mobile=mob, has_touch=mob, locale='de-DE'); pg = c.new_page()
            pg.goto(base + '/?test=1'); pg.wait_for_function('() => window.__kalemo && window.__kalemo.ready', timeout=60000); pg.wait_for_timeout(300)
            m = pg.evaluate('''() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.height)]; };
              return { daily: r('#btn-daily'), pair: r('#pair'), attract: r('.attract'), ih: innerHeight, scroll: document.querySelector('#screen-start').scrollTop }; }''')
            first_view = m['daily'][1] <= m['ih'] and m['pair'][0] >= 0 and m['pair'][1] <= m['ih']
            cap = m['attract'][2] <= 0.455 * m['ih'] + 1
            need = not (vw == 360 and vh == 640)  # sehr kleines Handy: Knopf darf knapp unter der Kante liegen, Sprachwahl nicht
            S.check(f'{vw}×{vh}: Hauptknopf + Sprachwahl im ersten Bild (Bounding-Box), Demo-Karte ≤ 45vh', (first_view or (not need and m['pair'][1] <= m['ih'])) and cap, m)
            c.close()
    if section('p2_9'):
        S.run('P2-9 Höhe', p2_9)

    # ---------- 13: Treffer-Karte = Money-Shot ----------
    INK_BOX = '''(sel) => { const c = document.querySelector(sel); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data;
      let mx = 1e9, my = 1e9, Mx = -1, My = -1, n = 0; for (let y = 0; y < c.height; y += 2) for (let i = 0; i < c.width; i += 2) { const k = (y * c.width + i) * 4; if (d[k + 3] > 200 && d[k] + d[k + 1] + d[k + 2] < 260) { n++; if (i < mx) mx = i; if (i > Mx) Mx = i; if (y < my) my = y; if (y > My) My = y; } }
      return { mx, my, Mx, My, n, w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width) }; }'''

    def p13():
        for label, kw, old_w in (('Desktop', {'viewport': {'width': 1280, 'height': 800}}, 300), ('Handy', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2}, 0.78 * (358 - 40))):
            for wid in ('bicycle', 'car'):
                c = b.new_context(**kw); pg = c.new_page()
                pg.goto(base + f'/?test=1&scene=hit&word={wid}&k=2'); pg.wait_for_selector('#round-overlay canvas.alive', timeout=30000); pg.wait_for_timeout(700)
                boxes = []
                for _ in range(12):
                    boxes.append(pg.evaluate(INK_BOX, '#round-overlay canvas.alive')); pg.wait_for_timeout(330)
                w0 = boxes[0]
                inside = all(bx['mx'] > bx['w'] * 0.02 and bx['Mx'] < bx['w'] * 0.98 and bx['my'] > bx['h'] * 0.02 and bx['My'] < bx['h'] * 0.98 and bx['n'] > 50 for bx in boxes)
                moved = max(bx['mx'] for bx in boxes) - min(bx['mx'] for bx in boxes) + max(bx['My'] for bx in boxes) - min(bx['My'] for bx in boxes)
                S.check(f'{label} {wid}: Zeichnung ≥ 1,35× so groß wie vorher ({w0["cssW"]} px statt {round(old_w)} px)', w0['cssW'] >= old_w * 1.35, w0['cssW'])
                S.check(f'{label} {wid}: Bewegung bleibt 4 s lang IM Rahmen und ist sichtbar', inside and moved > 4, (moved, [(bx['mx'], bx['Mx']) for bx in boxes[:4]]))
                c.close()
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page()
        pg.goto(base + '/?test=1&scene=dayend'); wait_state(pg, 's.screen === "dayend"', 30000); pg.wait_for_timeout(1600)
        a = [pg.evaluate(INK_BOX, f'#dayend-grid figure:nth-child({i}) canvas') for i in range(1, 6)]
        pg.wait_for_timeout(1200)
        a2 = [pg.evaluate(INK_BOX, f'#dayend-grid figure:nth-child({i}) canvas') for i in range(1, 6)]
        still = all(abs(x['mx'] - y['mx']) <= 6 and abs(x['My'] - y['My']) <= 6 and x['n'] > 30 and x['mx'] > 0 and x['Mx'] < x['w'] - 1 for x, y in zip(a, a2))
        S.check('Tagesende-Kacheln als Standbild: ganze Zeichnung sichtbar, keine Fahr-/Hüpfbewegung', still, [(x['mx'], y['mx']) for x, y in zip(a, a2)])
        c.close()
    if section('p13'):
        S.run('13 Money-Shot', p13)

    # ---------- P3-1: „Jetzt in die Luft?" erst am Tagesende ----------
    def p3_1():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: false, air: false, chosenPair: true})')
        pg.evaluate('() => window.__setDate("2026-10-05")')
        plan, _ = play_daily(pg, 'tr', stop_before=1)
        pg.wait_for_timeout(600)
        S.check('Nach Treffer 1 + Weiter: keine „Jetzt in die Luft?"-Karte, Runde 2 läuft', pg.query_selector('#round-overlay [data-k="yes"]') is None and pg.evaluate('() => window.__state().round?.target') == plan['slots'][1]['id'])
        pg.evaluate('() => window.__home()')
        pg.goto(base + '/?test=1&scene=dayend'); wait_state(pg, 's.screen === "dayend" && s.summary', 30000)
        pg.evaluate('() => { window.__settings({ airOffered: false, air: false }); window.__kalemo.showDayEnd(window.__kalemo.lastSummary); return 1; }')
        pg.wait_for_selector('#dayend-air:not([hidden])', timeout=5000)
        txt = pg.text_content('#dayend-air') or ''
        S.check('Tagesende (Laptop): Angebot „Jetzt in die Luft?" mit „Ja, in die Luft" / „Nicht jetzt"', 'Jetzt in die Luft?' in txt and 'Nicht jetzt' in txt, txt[:80])
        pg.click('#dayend-air [data-k="no"]')
        st = pg.evaluate('() => window.__state()')
        pg.evaluate('() => window.__kalemo.showDayEnd(window.__kalemo.lastSummary)')
        S.check('„Nicht jetzt" → Angebot weg und kommt nicht wieder', pg.is_hidden('#dayend-air') and st['settings']['airOffered'] and st['screen'] == 'dayend')
        c.close()
        m = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pm = m.new_page()
        pm.goto(base + '/?test=1&scene=dayend'); wait_state(pm, 's.screen === "dayend" && s.summary', 30000)
        pm.evaluate('() => { window.__settings({ airOffered: false, air: false }); window.__kalemo.showDayEnd(window.__kalemo.lastSummary); return 1; }')
        S.check('Handy: kein Luft-Angebot am Tagesende', pm.is_hidden('#dayend-air'))
        m.close()
        S.check('P3-1: keine Seitenfehler', not errs, errs[:2])
    if section('p3_1'):
        S.run('P3-1 Luft-Angebot', p3_1)

    # ---------- P3-4: Mehrzahl — Ausruf, Stimme, Treffer-Karte, Tagesende in der Mehrzahl ----------
    def p3_4():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.mouse.click(5, 5)
        pg.evaluate('() => window.__settings({native: "tr", learn: "de", airOffered: true, chosenPair: true, muted: false})')
        pg.evaluate('() => window.__setDate("2026-09-17")')  # Tag #3: Mehrzahl „drei Äpfel"
        plan, _ = play_daily(pg, 'de', stop_before=4)
        slot = plan['slots'][4]; wid = slot['id']; n = slot['n']; w = WORDS[wid]
        base_n = wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 30000)['drawCount']
        bubbles = []
        for k in range(n):
            wait_state(pg, f's.round && s.round.target === {json.dumps(wid)} && s.drawCount === {base_n + k}', 30000)
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[wid][k % 2])
            if k < n - 1:
                st = wait_state(pg, f's.drawCount === {base_n + k + 1} || s.overlay', 30000)
                bubbles.append((st['bubble'] or {}).get('text'))
        st = wait_state(pg, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 40000)
        final = (st['bubble'] or {}).get('text')
        nums = {1: 'Eins', 2: 'Zwei', 3: 'Drei'}
        exp_final = f"Ich weiß! {nums[n]} {w['de']['pl']}!"
        S.check(f'Zwischenstand zählt („Eins!"), Ausruf in der Mehrzahl („{exp_final}")', bubbles[:1] == ['Eins!'] and final == exp_final, (bubbles, final))
        pg.wait_for_timeout(500)
        vl = pg.evaluate('() => window.__state().voiceLog')
        count_v = any(v['parts'] == ['de/n/1'] for v in vl)
        hitv = [v for v in vl if any('/x/hit' in q for q in v['parts']) and f'de/p/{w["cls"]}' in v['parts']]
        S.check('Stimme: Zahl-Clip beim Zwischenstand + Treffer = Ausruf + Zahl-Clip + Plural-Clip (3 Sprachen)', count_v and hitv and f'de/n/{n}' in hitv[-1]['parts'] and f'tr/n/{n}' in hitv[-1]['parts'] and f'en/p/{w["cls"]}' in hitv[-1]['parts'], hitv[-1]['parts'] if hitv else [v['parts'] for v in vl[-4:]])
        groups = pg.evaluate('''() => { const c = document.querySelector('#round-overlay canvas.alive'); if (!c) return null; const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; const cols = [];
          for (let g = 0; g < 3; g++) { let n = 0; for (let y = 0; y < c.height; y += 3) for (let i = Math.floor(g * c.width / 3); i < (g + 1) * c.width / 3; i += 3) { const k = (y * c.width + i) * 4; if (d[k + 3] > 200) n++; } cols.push(n); } return cols; }''')
        S.check(f'Treffer-Karte zeigt {n} Zeichnungen nebeneinander', st['lastResult']['parts'] == n and groups and all(x > 20 for x in groups[:n]), (groups, st['lastResult']['parts']))
        pg.evaluate('() => window.__next()')
        wait_state(pg, 's.screen === "dayend" && s.summary', 20000)
        cap = pg.text_content('#dayend-grid figure:nth-child(5) figcaption') or ''
        S.check(f'Tagesende-Kachel in der Mehrzahl („{nums[n].lower()} {w["de"]["pl"]}")', cap.startswith(f'{nums[n].lower()} {w["de"]["pl"]}') and f'{n}/{n}' in cap, cap)
        S.check('P3-4: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p3_4'):
        S.run('P3-4 Mehrzahl', p3_4)

    # ---------- P3-3: Artikel anders gewählt → rote Schüttel-Karte; Blase beim Rundenwechsel leer ----------
    def p3_3():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "tr", learn: "de", airOffered: true, chosenPair: true})')
        pg.evaluate('() => window.__setDate("2026-10-14")')
        plan = pg.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']; art = WORDS[wid]['de']['art']
        wrong = next(a for a in ('der', 'die', 'das') if a != art)
        pg.evaluate('() => { window.__kalemo.show("round"); window.__kalemo.round.showBubble("Süre doldu."); return 1; }')
        pg.evaluate('() => window.__startDaily()')
        pg.wait_for_selector('.art-card', timeout=15000)
        S.check('Rundenwechsel: Sprechblase der Vorrunde ist weg, wenn die Artikel-Karte kommt', pg.evaluate('() => window.__state().bubble') is None)
        pg.click(f'.art-card[data-a="{wrong}"]')
        pg.wait_for_timeout(150)
        cls = pg.get_attribute(f'.art-card[data-a="{wrong}"]', 'class') or ''
        bg = pg.evaluate(f'''() => getComputedStyle(document.querySelector('.art-card[data-a="{wrong}"]')).borderTopColor''')
        right = pg.get_attribute(f'.art-card[data-a="{art}"]', 'class') or ''
        S.check('Andere Wahl: gewählte Karte schüttelt sich rot, richtige Karte leuchtet', 'wrong' in cls and 'wobble' in cls and bg == 'rgb(220, 38, 38)' and 'flash' in right, (cls, bg, right))
        pg.evaluate('() => window.__home()')
        S.check('P3-3: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p3_3'):
        S.run('P3-3 Artikel', p3_3)

    # ---------- P3-16: KI-Blase mit winziger Muttersprache des geratenen Worts ----------
    def p3_16():
        c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        pg.evaluate('() => window.__setDate("2026-10-08")')
        plan = pg.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']
        pg.evaluate('() => window.__startDaily()')
        wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        guess = 'moon' if wid != 'moon' else 'sun'
        r = pg.evaluate('''([g]) => { const a = window.__kalemo, r = a.round.active; a.round._handle(r, [{ type: 'guess', id: g, p: 0.6 }]);
          const b = document.querySelector('#bubble'); const s = b.querySelector('.bubble-sub'); const main = b.firstChild ? b.childNodes[0].textContent : '';
          const out = { main: b.textContent.replace(s ? s.textContent : '', ''), sub: s ? s.textContent : null, subLang: s?.lang, subSize: s ? parseFloat(getComputedStyle(s).fontSize) : null };
          a.round.showBubble('Test', r.w); out.targetSub = !!document.querySelector('#bubble .bubble-sub'); return out; }''', [guess])
        tw = WORDS[wid]; gw = WORDS[guess]
        S.check('Tipp-Blase: Lernsprache groß, darunter winzig die Muttersprache des GERATENEN Worts', r['main'].startswith('Hmm') and gw['tr']['word'] in r['main'] and r['sub'] == f"{gw['de']['art']} {gw['de']['noun']}" and r['subLang'] == 'de' and r['subSize'] and r['subSize'] < 14, r)
        S.check('Zielwort bekommt nie eine Übersetzungszeile', r['targetSub'] is False and tw['de']['noun'] not in (r['sub'] or ''), r['targetSub'])
        pg.evaluate('() => window.__home()')
        S.check('P3-16: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p3_16'):
        S.run('P3-16 Blase', p3_16)

    # ---------- P3-13: Startseite leicht (Mal-KI + Runden-Audio erst bei Absicht) ----------
    def p3_13():
        import gzip, time as _t
        for label, mob in (('Desktop', False), ('Handy', True)):
            kw = {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True} if mob else {'viewport': {'width': 1280, 'height': 800}}
            c = b.new_context(**kw); pg = c.new_page(); errs = []; got = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            def on_fin(rq):
                try:
                    r = rq.response(); body = r.body() if r else b''
                    ct = (r.headers.get('content-type', '') if r else '')
                    est = len(gzip.compress(body, 6)) if any(x in ct for x in ('javascript', 'css', 'json', 'html', 'text', 'svg')) else len(body)
                    got.append((rq.url.split('/', 3)[-1][:60], len(body), est))
                except Exception:
                    pass
            pg.on('requestfinished', on_fin)
            t0 = _t.time()
            pg.goto(base + '/?test=1&lazy=1'); pg.wait_for_function('() => window.__kalemo && window.__kalemo.ready', timeout=30000)
            pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(2500)
            total = sum(x[2] for x in got); heavy = [x[0] for x in got if any(k in x[0] for k in ('tf.min.js', 'doodlenet', '/w/', '/b/', '/p/', 'manifest.json', 'others.json', 'mediapipe'))]
            S.check(f'{label}: Start ohne Mal-KI/Runden-Audio, Transfer < 400 KB (gzip-geschätzt)', total < 400_000 and not heavy and not pg.evaluate('() => window.__state().clfReady'), f'{total / 1000:.0f} KB, {len(got)} Requests, schwer: {heavy[:3]}')
            pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
            plan = pg.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']
            if mob:
                pg.tap('#btn-daily')
            else:
                pg.click('#btn-daily')
            st = wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 30000)
            load_ms = pg.evaluate('() => window.__kalemo.loadingMs ?? 0')
            S.check(f'{label}: nach Tipp auf Tagesskizze Ladeanzeige ≤ 1 s sichtbar, Runde startet', load_ms <= 1000 and st['clfReady'], f'{load_ms} ms')
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 12, gapMs: 160})', FIX[wid][0])
            st = wait_state(pg, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 40000)
            S.check(f'{label}: erster Treffer < 60 s nach Aufruf', st['lastResult']['result'] == 'hit' and _t.time() - t0 < 60, f'{_t.time() - t0:.1f} s')
            S.check(f'{label}: keine Seitenfehler', not errs, errs[:2])
            c.close()
    if section('p3_13'):
        S.run('P3-13 Leichter Start', p3_13)

    # ---------- P3-14: FPS-Wächter → CPU-Backend + sparsame Bühne ----------
    def p3_14():
        bw = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])  # Software-WebGL wie im Review
        # (a) normale Bildrate: kein Fehlalarm
        cn = b.new_context(viewport={'width': 1280, 'height': 800}); pn = cn.new_page()
        pn.goto(base + '/?test=1'); wait_state(pn, 's.clfReady', 60000); pn.wait_for_timeout(3500)
        normal = pn.evaluate('() => ({ low: !!window.__kalemo.lowPower, fps: window.__kalemo._fpsGuard && window.__kalemo._fpsGuard.lastFps, log: window.__kalemo.log.filter(x => x.startsWith("fps-guard")) })')
        S.check('Normale Bildrate: Wächter misst ≥ 30 fps, kein Wechsel', not normal['low'] and (normal['fps'] or 0) >= 30 and not normal['log'], normal)
        cn.close()
        # (b) Software-WebGL (SwiftShader) wie im Review
        c = bw.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1&backend=webgl'); wait_state(pg, 's.clfReady', 60000)
        b0 = pg.evaluate('() => window.__state().backend')
        pg.wait_for_timeout(5000)
        real = pg.evaluate('() => ({ backend: window.__kalemo.clf.backend, low: !!window.__kalemo.lowPower, samples: window.__kalemo._fpsGuard && window.__kalemo._fpsGuard.samples })')
        if real['low']:
            S.check(f'Software-WebGL real gemessen ({real["samples"]} fps) → Wächter wechselt selbst auf CPU + sparsame Bühne', b0 == 'webgl' and real['backend'] == 'cpu', real)
        else:
            one = pg.evaluate('() => window.__fpsSample(24)')
            two = pg.evaluate('() => window.__fpsSample(13)')
            S.check(f'2 Messfenster < 30 fps (injiziert; real {real["samples"]}) → WebGL → CPU-Backend + sparsame Bühne', b0 == 'webgl' and one['backend'] == 'webgl' and not one['lowPower'] and two['backend'] == 'cpu' and two['lowPower'] and 'cpu' in ' '.join(two['log']), (one, two))
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        pg.evaluate('() => window.__setDate("2026-10-09")')
        plan, _ = play_daily(pg, 'tr', stop_before=1)
        st = pg.evaluate('() => window.__state()')
        S.check('Nach dem Wechsel erkennt die Mal-KI weiter (Treffer auf CPU)', st['lastResult']['result'] == 'hit' and st['backend'] == 'cpu', (st['lastResult']['result'], st['backend']))
        S.check('P3-14: keine Seitenfehler', not errs, errs[:2])
        c.close(); bw.close()
    if section('p3_14'):
        S.run('P3-14 FPS-Wächter', p3_14)

    # ---------- P3-15 Tensor-Warnung · P3-5 lesbare Beispiele ----------
    def p3_15_5():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); cons = []; reqs = []
        pg.on('console', lambda m: cons.append(m.text) if m.type in ('warning', 'error') else None)
        pg.on('request', lambda r: reqs.append(r.url))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000); pg.wait_for_timeout(500)
        S.check('P3-15: keine Tensor-Shape-Warnung beim Laden der Mal-KI', not any('shape of the input tensor' in x for x in cons), [x[:90] for x in cons][:3])
        ex = json.load(open(os.path.join(ROOT, 'data/examples.json'))); old = json.load(open(os.path.join(ROOT, 'data/others.json')))
        per = lambda lst: sum(len(d['strokes']) for d in lst) / max(1, len(lst))
        S.check('P3-5: 3 lesbare Beispiele je Wort (148), erkannt mit p ≥ 0,5', len(ex) == len(WORDS) and all(len(v) == 3 and all(d['p'] >= 0.5 for d in v) for v in ex.values()), [k for k, v in ex.items() if len(v) < 3][:5])
        S.check('P3-5: Fahrrad-Beispiele detailreicher als vorher (Striche je Zeichnung)', per(ex['bicycle']) > per(old['bicycle']) + 2 and min(len(d['strokes']) for d in ex['bicycle']) >= 5, (per(old['bicycle']), per(ex['bicycle'])))
        pg.goto(base + '/?test=1&scene=help'); pg.wait_for_selector('#round-overlay .card.help .others canvas', timeout=15000)
        S.check('Hilfe-Karte + Zeit-um-Karte + Wörterbuch nutzen data/examples.json', any(u.endswith('/data/examples.json') for u in reqs))
        c.close()
    if section('p3_15_5'):
        S.run('P3-15/P3-5', p3_15_5)

    # ---------- P3-6: Poster-Raster passt sich der Wortzahl an ----------
    def p3_6():
        c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page()
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        r = pg.evaluate('''async () => { const app = window.__kalemo; const o = await app.others(); const m = await import('/js/game/cards.js'); const ids = app.words.map(w => w.id);
          const out = {}; for (const n of [1, 5, 12, 20]) { const p = await m.poster(app, ids.slice(0, n).map((id) => ({ id, strokes: o[id][0].strokes }))); out[n] = [p.canvas.width, p.canvas.height, p.fill]; } return out; }''')
        S.check('Poster 1240×1754 bei 1/5/12/20 Wörtern, Rasterfläche gefüllt (≥ 55 % der Zeilen mit Tinte, 1 Wort ≥ 40 %; vorher 5 Wörter ≈ 25 %)', all(v[0] == 1240 and v[1] == 1754 and v[2] >= (0.4 if k == '1' else 0.55) for k, v in r.items()), r)
        c.close()
    if section('p3_6'):
        S.run('P3-6 Poster', p3_6)

    # ---------- P3-8: Tastatur — Fokusringe überall, Esc schließt ----------
    def p3_8():
        c = b.new_context(viewport={'width': 1280, 'height': 800}, locale='de-DE'); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        seen = []
        for _ in range(22):
            pg.keyboard.press('Tab')
            info = pg.evaluate('''() => { const a = document.activeElement; if (!a || a === document.body) return null; const cs = getComputedStyle(a);
              return { el: (a.id || a.className || a.tagName).toString().slice(0, 30), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; }''')
            if info: seen.append(info)
        bad = [s['el'] for s in seen if not s['outline']]
        S.check('Start per Tab: jedes fokussierte Element hat einen sichtbaren Fokusring', seen and not bad, (len(seen), bad))
        pg.focus('#btn-daily'); pg.keyboard.press('Enter')
        wait_state(pg, 's.screen === "round" && s.round', 20000)
        pg.keyboard.press('Escape')
        st = wait_state(pg, 's.screen === "start"', 5000)
        S.check('Esc in der Runde → zurück zum Start', st['screen'] == 'start')
        pg.goto(base + '/?test=1&scene=dict&detail=1'); pg.wait_for_selector('#sheet .dict-detail', timeout=15000)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        s1 = pg.evaluate('() => window.__state()')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        s2 = pg.evaluate('() => window.__state()')
        S.check('Esc im Wörterbuch: erst Detail-Sheet zu, dann zurück zum Start', not s1['sheet'] and s1['screen'] == 'dict' and s2['screen'] == 'start', (s1['sheet'], s1['screen'], s2['screen']))
        S.check('P3-8: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p3_8'):
        S.run('P3-8 Tastatur', p3_8)

    # ---------- P3-9: Grautöne ≥ 4,5:1 ----------
    CONTRAST = '''() => { const lum = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(b) && !/, 0\\)$/.test(b)) return b; } return 'rgb(247, 241, 227)'; };
      const out = []; for (const el of document.querySelectorAll('.daily-hint, .foot a, .foot button, .foot .by, .today-main span, .dict-head .count, .dict-cell small, .hint, .times, .funny small, .art-card .art-n')) {
        const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).visibility === 'hidden') continue; const cs = getComputedStyle(el);
        const fg = lum(cs.color), bg = lum(bgOf(el)); const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05); out.push([el.className || el.tagName, +ratio.toFixed(2), cs.fontSize]); }
      return out; }'''

    def p3_9():
        c = b.new_context(viewport={'width': 1280, 'height': 800}, locale='de-DE'); pg = c.new_page()
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        r1 = pg.evaluate(CONTRAST)
        pg.goto(base + '/?test=1&scene=dict'); pg.wait_for_selector('.dict-cell', timeout=15000)
        r2 = pg.evaluate(CONTRAST)
        low = [x for x in r1 + r2 if x[1] < 4.5]
        S.check('Graue Kleintexte (Start-Hinweis, Footer, Wörterbuch-Zähler/Unterzeilen) ≥ 4,5:1', r1 and r2 and not low, (low, len(r1), len(r2), min(x[1] for x in r1 + r2)))
        c.close()
    if section('p3_9'):
        S.run('P3-9 Kontrast', p3_9)

    # ---------- Zusatz 22: „Üb deine schwachen Wörter" ----------
    def p22():
        c = b.new_context(viewport={'width': 1280, 'height': 800}, locale='de-DE'); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        today = pg.evaluate('() => window.__state().date')
        # Tagesergebnis: Wort 1 per Hilfe, Wort 2 läuft in die Zeit → beide landen in der Liste (recordWeak über echte Runden)
        rec = pg.evaluate('''async () => { const m = await import('/js/game/practice.js'); localStorage.removeItem('kalemo.weak');
          m.recordWeak({ id: 'spoon', result: 'timeout' }, '2026-09-10'); m.recordWeak({ id: 'spoon', result: 'timeout' }, '2026-09-11');
          m.recordWeak({ id: 'frog', result: 'hit', helped: true }, '2026-09-12'); m.recordWeak({ id: 'owl', result: 'timeout' }, '2026-09-12');
          m.recordWeak({ id: 'owl', result: 'hit' }, '2026-09-13'); m.recordWeak({ id: 'cat', result: 'hit' }, '2026-09-13');
          return { weak: JSON.parse(localStorage.getItem('kalemo.weak')), order: m.weakest(window.__kalemo, 5) }; }''')
        S.check('Liste: „Zeit um" zählt stärker als Hilfe, saubere Treffer zählen herunter, fremde Treffer landen nicht drin', rec['order'][:2] == ['spoon', 'owl'] and 'frog' in rec['order'] and 'cat' not in rec['weak'] and rec['weak']['owl']['clean'] == 1, rec)
        pg.evaluate('() => window.__kalemo.openDict()')
        pg.wait_for_selector('[data-act=weak]', timeout=5000)
        label = pg.text_content('[data-act=weak]')
        S.check('Bildwörterbuch: Knopf „Üb deine schwachen Wörter (3)"', label == 'Üb deine schwachen Wörter (3)', label)
        pg.click('[data-act=weak]')
        for wid in rec['order']:
            wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 20000)
            pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[wid][0])
            wait_state(pg, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 30000)
            pg.evaluate('() => window.__next()')
        st = wait_state(pg, 's.lastWeakRun && s.screen === "dict" && s.sheet', 20000)
        day = pg.evaluate(f'() => localStorage.getItem("kalemo.day.{today}")')
        S.check('Übung läuft schwächste zuerst, danach Auswertung im Wörterbuch', st['lastWeakRun']['ids'] == rec['order'] and 'Geübt:' in (pg.text_content('#sheet h3') or ''), (st['lastWeakRun'], pg.text_content('#sheet h3')))
        S.check('Nicht Teil der Tagesskizzen-Wertung (kein Tagesergebnis, keine Serie)', day is None and pg.evaluate('() => localStorage.getItem("kalemo.streak")') is None, day)
        w2 = st['weak']
        S.check('Treffer in der Übung festigen: owl (2. sauberer Treffer) raus, spoon zählt 1 sauber', 'owl' not in w2 and w2.get('spoon', {}).get('clean') == 1, w2)
        # echte Tagesskizze: Wort mit Hilfe landet automatisch in der Liste
        pg.click('#sheet [data-act=close]'); pg.evaluate('() => window.__home()')
        pg.evaluate('() => window.__setDate("2026-10-21")')
        plan = pg.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']
        pg.evaluate('() => window.__startDaily()')
        wait_state(pg, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        pg.wait_for_selector('#round-help:not([hidden])', timeout=12000); pg.click('#round-help', force=True)
        pg.wait_for_selector('#round-overlay [data-act=help-go]', timeout=5000); pg.click('#round-overlay [data-act=help-go]', force=True)
        pg.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[wid][0])
        wait_state(pg, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 30000); pg.evaluate('() => window.__next()')
        st = wait_state(pg, f's.weak && s.weak[{json.dumps(wid)}]', 10000)
        S.check('Tagesskizze: Wort mit Hilfe wird automatisch als schwach gemerkt', st['weak'][wid]['helps'] == 1, st['weak'][wid])
        pg.evaluate('() => window.__home()')
        S.check('Zusatz 22: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p22'):
        S.run('Zusatz 22 Schwache Wörter', p22)

    # ---------- Zusatz 23: Stift-Kalibrierung im Luft-Modus ----------
    def p23():
        import random
        from hands import hand, seq, POINT, OPEN

        def pinch_pose(cx, cy):
            pts = hand(cx, cy, index=True, thumb=True)
            pts[4] = [pts[8][0] + 0.004, pts[8][1] + 0.004, 0.0]  # Daumenspitze an der Zeigefingerspitze
            return pts
        rnd = random.Random(7)
        steady = lambda n, t0, pose: seq(pose, n, t0, move=lambda i: (0.5 + rnd.gauss(0, 0.001), 0.5 + rnd.gauss(0, 0.001)))
        shaky = lambda n, t0: [{'lm': (POINT if (i // 3) % 2 == 0 else OPEN)(0.5 + rnd.gauss(0, 0.02), 0.5 + rnd.gauss(0, 0.02)), 't': t0 + i * 33.3} for i in range(n)]
        c = b.new_context(viewport={'width': 1280, 'height': 800}, locale='de-DE'); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pure = pg.evaluate('''async ([a, b2, cc, d]) => { const m = await import('/js/core/calib.js'); return [m.chooseGesture(a, b2).choice, m.chooseGesture(cc, d).choice, m.gestureStability(a, 'index')]; }''',
                           [steady(40, 0, POINT), steady(40, 2000, POINT), shaky(40, 0), steady(40, 2000, pinch_pose)])
        S.check('Messung: ruhiger Zeigefinger → Zeigefinger; wackliger Zeigefinger + stabiles Zwicken → Zwicken', pure[0] == 'index' and pure[1] == 'pinch' and pure[2]['pose'] > 0.9, pure)

        def run(index_frames, pinch_frames, expect):
            pg.evaluate('async () => { const a = window.__kalemo; await a.getAir(); a.show("round"); a.calibPhase = null; a.calibratePen({ phaseMs: 1500 }); return 1; }')
            pg.click('#round-overlay .calib-card [data-k="go"]', timeout=5000)
            wait_state(pg, 's.calibPhase === "index"', 5000)
            pg.evaluate('([f]) => window.__feedLandmarks(f, { fresh: false })', [index_frames])
            wait_state(pg, 's.calibPhase === "pinch"', 5000)
            pg.evaluate('([f]) => window.__feedLandmarks(f, { fresh: false })', [pinch_frames])
            st = wait_state(pg, 's.calibPhase === "done"', 5000)
            pin = pg.evaluate('() => window.__kalemo.air.pen.pinch')
            return st, pin
        st, pin = run(steady(40, 0, POINT), steady(40, 2000, POINT), 'index')
        S.check('Flow: 2 Phasen mit Karte + Fortschritt → Zeigefinger eingestellt (Einstellungen + Stift-Automat)', st['settings']['penCalib']['choice'] == 'index' and st['settings']['pinch'] is False and pin is False, st['settings']['penCalib'])
        st, pin = run(shaky(40, 0), steady(40, 2000, pinch_pose), 'pinch')
        S.check('Flow: wackliger Zeigefinger + stabiles Zwicken → Zwicken eingestellt', st['settings']['penCalib']['choice'] == 'pinch' and st['settings']['pinch'] is True and pin is True, st['settings']['penCalib'])
        pg.wait_for_timeout(1600)
        # Einstellungen überschreiben die Wahl
        pg.evaluate('() => { window.__kalemo.show("start"); document.querySelector("#btn-settings").click(); return 1; }')
        pg.click('#sheet input[data-k="pinch"]')
        s2 = pg.evaluate('() => window.__state().settings')
        S.check('Einstellungen können die Kalibrierung überschreiben (Zwicken aus)', s2['pinch'] is False and pg.evaluate('() => window.__kalemo.air.pen.pinch') is False, s2['pinch'])
        pg.click('#sheet [data-act=close]')
        # Überspringen
        pg.evaluate('async () => { const a = window.__kalemo; a.show("round"); a.calibratePen({ phaseMs: 1500 }); return 1; }')
        pg.click('#round-overlay .calib-card [data-k="skip"]', timeout=5000)
        st = wait_state(pg, 's.calibPhase === "skipped"', 5000)
        S.check('Optional: „Überspringen" beendet ohne Messung', st['settings']['penCalib'].get('skipped') is True)
        S.check('Zusatz 23: keine Seitenfehler', not errs, errs[:2])
        c.close()
    if section('p23'):
        S.run('Zusatz 23 Stift-Kalibrierung', p23)

    b.close()
S.finish()
