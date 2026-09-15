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

    b.close()
S.finish()
