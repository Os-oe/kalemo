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
        S.check('Heute-Karte 1080×1350 + Zitat der lustigsten KI-Rate auf Karte UND im Teilen-Text („dachte … erst an")', lc['w'] == 1080 and lc['h'] == 1350 and lc['quote'] and 'dachte' in lc['quote'] and 'erst an' in lc['quote'] and len(lines) == 2 and lc['quote'] in lines[1] and lines[1].startswith('„'), lc['text'])
        S.check('Genau EINE Zeichnung scharf (die zum Zitat), übrige 4 als abstrakte Leuchtspuren mit Spoiler-Gate', lc['hero'] == fz['target'] and len(lc['gates']) == 4 and lc['hero'] not in [g['id'] for g in lc['gates']] and all(g['ok'] and g['id'] not in (g['top'] or []) for g in lc['gates']), (lc['hero'], [(g['id'], g['level'], g['top']) for g in lc['gates']]))
        # Pixel-Probe: Heldenkarte hell (Papier), Spur-Kacheln dunkel (Navy) mit Licht
        probe = pg.evaluate('''async () => { const app = window.__kalemo; const m = await import('/js/game/cards.js'); const card = await m.todayCard(app, app.lastSummary);
          const ctx = card.canvas.getContext('2d'); const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
          const tile = ctx.getImageData(72, 1040, 219, 190).data; let lit = 0, dark = 0; for (let i = 0; i < tile.length; i += 4) { const l = tile[i] + tile[i + 1] + tile[i + 2]; if (l > 600) lit++; else if (l < 200) dark++; }
          return { heroPaper: px(300, 700), lit, dark, n: tile.length / 4 }; }''')
        S.check('Spur-Kachel: Navy mit Leuchtspur (Langzeitbelichtung, nicht verwaschen) · Heldenkarte auf Papier', probe['heroPaper'][0] > 230 and probe['dark'] > probe['n'] * 0.3 and probe['lit'] > 150, probe)
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
        box = pg.evaluate("() => { const t = document.querySelector('#today-tile').getBoundingClientRect(), d = document.querySelector('#btn-daily').getBoundingClientRect(); return t.bottom <= d.top + 1; }")
        S.check('Kachel steht über „Noch mal üben"', box and 'üben' in (pg.text_content('#daily-label') or ''))
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
    V1_LIVE = 'AdUCyAEGEwDwAqYDiAIAIB84CSqLARJHDSdjD0sWGwojHhUoBRYfKAJgIhIiIBQUJAEoAyHBAZMCaQ2dAWJwAxF9RAFYawWYAQIeMocCggGFAR0CFC2CAUKBARgCDhakAzlaE3U'
    MK_LINK = '''async ([st, senderMs, score, cls]) => { const c = await import('/js/core/codec.js'); let t = 0;
      const strokes = st.map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 70); t += xs.length * 70 + 500; return [xs.map(x => x + 20), ys.map(y => y + 20), ts]; });
      return { code: c.encode({ classIdx: window.__kalemo.clf.classNames.indexOf(cls), senderMs, strokes, score }), dur: t }; }'''

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
            const code = c.encode({ classIdx: idx, senderMs: 7300, strokes, score }); lens.push(('https://kalemo.demo.osai.solutions/#d=' + code).length);
            const dec = c.decode(code); total++; if (dec.version === 2 && dec.classIdx === idx && dec.score[0] === score[0] && dec.score[1] === score[1] && JSON.stringify(dec.strokes) === JSON.stringify(c.quantize(strokes).map(([x, y]) => [x, y]))) same++;
          }
          lens.sort((a, b) => a - b); const old = c.decode(v1);
          return { same, total, p90: lens[Math.floor(lens.length * 0.9)], v1: { version: old.version, score: old.score, cls: names[old.classIdx], n: old.strokes.length } }; }''', [FIX, V1_LIVE])
        S.check('Duell-Code v2: Roundtrip identisch inkl. Stand, URL p90 < 300', r['same'] == r['total'] and r['p90'] < 300, r)
        S.check('Alte v1-Links (live erzeugt) bleiben lesbar, Stand 0:0', r['v1']['version'] == 1 and r['v1']['score'] == [0, 0] and r['v1']['n'] > 0, r['v1'])
        o = pg.evaluate('''async () => { const m = await import('/js/core/duelscore.js'); const f = (ok, y, th, s) => { const x = m.duelOutcome({ ok, youMs: y, themMs: th, score: s }); return [x.key, x.you, x.them]; };
          return [f(true, 2000, 9000, [0, 0]), f(true, 8500, 9000, [2, 1]), f(true, 9800, 9000, [0, 0]), f(true, 15000, 9000, [0, 3]), f(false, 1000, 9000, [1, 1])]; }''')
        S.check('Wertung: schneller · knapp gewonnen · knapp verloren · langsamer · falsch (Stand wird fortgeschrieben)', o == [['faster', 1, 0], ['closeWin', 2, 2], ['closeLose', 0, 1], ['slower', 3, 1], ['wrong', 1, 2]], o)
        link = pg.evaluate(MK_LINK, [FIX['cat'][0], 9000, [0, 0], 'cat'])
        # Empfänger: frischer Kontext
        c2 = b.new_context(viewport={'width': 1280, 'height': 800}, locale='de-DE'); p2 = c2.new_page(); e2 = []
        p2.on('pageerror', lambda e: e2.append(str(e)))
        p2.goto(base + '/?test=1#d=' + link['code'])
        p2.wait_for_selector('#duel-body [data-act=go]', timeout=30000)
        p2.click('#duel-body [data-act=go]')
        t_go = p2.evaluate('() => performance.now()')
        st = wait_state(p2, 's.duelState && s.duelState.phase === "options"', 15000)
        after = st['duelState']['shownAt'] - t_go
        S.check(f'Antworten nach ~3 s eingeblendet, Wiedergabe läuft weiter (Replay {link["dur"] / 1000:.1f} s)', 2500 <= after <= 5000 and st['duelState']['replaying'] and len(st['duelState']['options']) == 4 and 'cat' in st['duelState']['options'], (round(after), st['duelState']['replaying']))
        p2.wait_for_timeout(700)
        clock = p2.text_content('#round-overlay .duel-clock') or ''
        S.check('Stoppuhr läuft ab Einblendung + Absender-Zeit sichtbar', 'Absender: 9,0 s' in clock and not clock.startswith('0,0'), clock)
        p2.click('.answer[data-id="cat"]', force=True)
        st = wait_state(p2, 's.duelState && s.duelState.phase === "reveal"', 10000)
        p2.wait_for_selector('#round-overlay .duel-result', timeout=5000)
        title = p2.text_content('#round-overlay .duel-result'); ds = st['duelState']
        S.check('Klares Ergebnis „Du warst schneller!" + Stand 1:0 (Zeit ab Einblendung)', ds['outcome'] == 'faster' and ds['youMs'] < 3000 and ds['score'] == {'you': 1, 'them': 0} and 'schneller' in title and ds['replaying'] is False, (title, ds['youMs'], ds['score']))
        p2.click('#round-overlay [data-act=back]')
        st = wait_state(p2, 's.screen === "duel" && s.duelPicks && s.duelPicks.length === 3', 10000)
        wid = st['duelPicks'][0]
        p2.click(f'.word-pick[data-id="{wid}"]', force=True)
        wait_state(p2, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        p2.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 10, gapMs: 150})', FIX[wid][0])
        st = wait_state(p2, f's.lastDuel && s.lastDuel.id === {json.dumps(wid)}', 30000)
        dec = p2.evaluate('async (code) => { const c = await import("/js/core/codec.js"); return c.decode(code).score; }', st['lastDuel']['code'])
        S.check('Rückspiel-Link trägt den Stand (1:0 aus Sicht des neuen Absenders), URL < 300', dec == [1, 0] and st['lastDuel']['length'] < 300 and pg is not None, (dec, st['lastDuel']['length']))
        # zurück beim ersten Absender: sieht „Rückspiel — Stand 0:1"
        p3 = c.new_page(); p3.goto(st['lastDuel']['url'].replace('/#d=', '/?test=1#d='))
        p3.wait_for_selector('#duel-body [data-act=go]', timeout=30000); p3.click('#duel-body [data-pair="swap"]'); p3.click('#duel-body [data-act=go]')
        wait_state(p3, 's.duelState && s.duelState.phase === "replay"', 30000)
        sub = p3.text_content('#word-sub') or ''
        S.check('Rückspiel beim ursprünglichen Absender: „Rückspiel — Stand 0:1"', 'Stand 0:1' in sub, sub)
        # Knapp: Antwort per Hook mit fester Zeit
        wait_state(p3, 's.duelState && s.duelState.phase === "options"', 15000)
        p3.evaluate('(id) => window.__answer(id, { ms: (window.__state().duelState ? 0 : 0) + 99999 })', 'x-wrong-id')
        st3 = wait_state(p3, 's.duelState && s.duelState.phase === "reveal"', 10000)
        S.check('Falsch geraten → Punkt an den Absender (Stand 2:0 aus dessen Sicht)', st3['duelState']['outcome'] == 'wrong' and st3['duelState']['score'] == {'you': 0, 'them': 2}, st3['duelState']['score'])
        link2 = pg.evaluate(MK_LINK, [FIX['sun'][0], 1000, [0, 0], 'sun'])
        p4 = c2.new_page(); p4.goto(base + '/?test=1#d=' + link2['code'])
        wait_state(p4, 's.duelState && s.duelState.phase === "options"', 20000)
        p4.evaluate('() => window.__answer("sun", { ms: 1600 })')
        st4 = wait_state(p4, 's.duelState && s.duelState.phase === "reveal"', 10000)
        p4.wait_for_selector('#round-overlay .duel-result', timeout=5000)
        S.check('„Knapp!" bei ≤ 1 s Abstand', st4['duelState']['outcome'] == 'closeLose' and 'Knapp' in (p4.text_content('#round-overlay .duel-result') or ''), st4['duelState']['outcome'])
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
        first7 = plans[:7]
        S.check('Tag #1 beginnt mit der Katze · Tage #1–#7 kuratiert', first7[0]['number'] == 1 and first7[0]['slots'][0]['id'] == 'cat' and all(p.get('curated') for p in first7) and not plans[7].get('curated'), [s['id'] for s in first7[0]['slots']])
        ids7 = {s['id'] for p in first7 for s in p['slots']}
        low = [(i, rep[i]['air']['top3']) for i in ids7 if rep[i]['air']['top3'] < 0.85]
        S.check('Keine Wörter mit Top-3 < 85 % (accuracy-report) in #1–#7, kein Sandwich', not low and 'sandwich' not in ids7, (low, sorted(ids7)))
        early_ok = all(s.get('article') is False and s['kind'] != 'plural' for p in first7[:2] for s in p['slots'])
        later_ok = all(s.get('article', True) is not False for p in first7[2:] for s in p['slots']) and all(p['slots'][4]['kind'] == 'plural' for p in first7[2:])
        S.check('Artikel-Schritt + Mehrzahl frühestens ab Tag #3', early_ok and later_ok, [[s['kind'] + ('' if s.get('article', True) else '/noArt') for s in p['slots']] for p in first7[:3]])
        uniq = all(len({s['id'] for s in p['slots']}) == 5 for p in plans)
        new_of = lambda p: [s['id'] for s in p['slots'] if s['kind'] == 'new']
        rev_ok = all(p['slots'][2]['kind'] == 'review' and p['slots'][2]['id'] in new_of(plans[i - 2]) for i, p in enumerate(plans) if i >= 7)
        plu_ok = all(p['slots'][4]['kind'] == 'plural' and p['slots'][4]['n'] in (2, 3) for p in plans[7:])
        S.check('Ab Tag #8 deterministischer Plan: neu/neu/Wdh(Tag−2)/neu/Mehrzahl, keine Dopplung', uniq and rev_ok and plu_ok, (uniq, rev_ok, plu_ok))
        cur_new = {s['id'] for p in first7 for s in p['slots'] if s['kind'] == 'new'}
        rep_new = [s['id'] for p in plans[7:45] for s in p['slots'] if s['kind'] == 'new' and s['id'] in cur_new]
        S.check('Launch-Wörter kommen im ersten Umlauf nicht erneut als „neu"', not rep_new, rep_new)
        S.check('Tag #8: Mehrzahl aus der Launch-Woche (Tag−7)', plans[7]['slots'][4]['id'] in new_of(plans[0]), plans[7]['slots'][4])
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

    b.close()
S.finish()
