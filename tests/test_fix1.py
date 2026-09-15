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

    b.close()
S.finish()
