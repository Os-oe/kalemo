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

    b.close()
S.finish()
