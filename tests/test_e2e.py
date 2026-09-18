"""Phase-5-Gate: E2E gegen Live-URL (KALEMO_URL) oder lokal — Desktop + mobil, Duell-Link-Roundtrip, Teilen-Fallback,
Performance ≤ 3,5 MB bis spielbar (Bildschirm-Modus), erster Treffer < 60 s, keine externen Requests, Luft-Modus unter CSP."""
import json, os, time
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT

S = Suite('e2e-live' if os.environ.get('KALEMO_URL') else 'e2e-local')
MJPEG = os.path.join(ROOT, 'tools/fixtures/pointing.mjpeg')
WORDS = {w['id']: w for w in json.load(open(os.path.join(ROOT, 'data/words.json')))}


def play_slot(page, slot, learn):
    wid = slot['id']
    if learn == 'de' and slot['kind'] != 'plural' and slot.get('article', True):  # Launch-Tage #1/#2 ohne Artikel-Schritt
        page.wait_for_selector('.art-card', timeout=20000)
        page.evaluate('(a) => window.__chooseArticle(a)', WORDS[wid]['de']['art'])
    base = wait_state(page, f's.round && s.round.target === {json.dumps(wid)}', 30000)['drawCount']
    for k in range(slot['n'] if slot['kind'] == 'plural' else 1):
        wait_state(page, f's.round && s.drawCount === {base + k}', 40000)
        page.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 12, gapMs: 160})', FIX[wid][k % 2])
    return wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(wid)} && s.overlay', 45000)['lastResult']


with server(8797) as base, sync_playwright() as p:
    origin = base.split('/')[0] + '//' + base.split('/')[2]

    # ---------------- Desktop ----------------
    def desktop():
        b, ctx = launch(p)
        page = ctx.new_page(); errors = []; ext = []; bytes_ = {'total': 0}
        page.on('pageerror', lambda e: errors.append(str(e)))
        def on_resp(r):
            if not r.url.startswith(origin) and not r.url.startswith('data:') and not r.url.startswith('blob:'):
                ext.append(r.url)
        page.on('response', on_resp)
        def on_fin(rq):
            try:
                sz = rq.sizes(); bytes_['total'] += (sz.get('responseBodySize', 0) or 0) + (sz.get('responseHeadersSize', 0) or 0)
            except Exception:
                pass
        page.on('requestfinished', on_fin)
        t0 = time.time()
        page.goto(base + '/?test=1')
        st = wait_state(page, 's.clfReady', 90000)
        page.wait_for_timeout(1500)  # Tages-Audio + Fonts nachladen lassen
        playable = bytes_['total']
        S.check('Performance: Bildschirm-Modus spielbar mit ≤ 3,5 MB Transfer (inkl. Tages-Audio)', playable <= 3.5e6, f'{playable / 1e6:.2f} MB, {time.time() - t0:.1f} s')
        S.check('Luft-Modus lädt erst auf Wunsch (kein MediaPipe/Modell beim Start)', page.evaluate('() => !window.__kalemo.air'))
        page.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: false, air: false})')
        plan = page.evaluate('() => window.__plan()')
        page.mouse.click(10, 10)
        page.click('#btn-daily')
        lr = play_slot(page, plan['slots'][0], 'tr')
        first_hit_s = time.time() - t0
        S.check('Erster Treffer < 60 s nach Aufruf', lr['result'] == 'hit' and first_hit_s < 60, f'{first_hit_s:.1f} s')
        page.evaluate('() => window.__next()')
        page.wait_for_timeout(500)
        S.check('Kein Luft-Angebot mitten in der Tagesskizze (Review P3-1)', page.query_selector('#round-overlay [data-k="yes"]') is None)
        t_day = time.time()
        for slot in plan['slots'][1:]:
            play_slot(page, slot, 'tr'); page.evaluate('() => window.__next()')
        st = wait_state(page, 's.screen === "dayend" && s.summary', 30000)
        S.check('Tagesskizze komplett durchgespielt (Desktop)', st['summary']['hits'] >= 4, st['summary']['hits'])
        page.wait_for_selector('#dayend-air [data-k="no"]', timeout=8000)
        S.check('Onboarding: Angebot „Jetzt in die Luft?" am Tagesende (Desktop)', True)
        page.click('#dayend-air [data-k="no"]')
        # Tagesende → Jemanden herausfordern → Link-Karte auf dem Tagesende (Review P1-2)
        page.click('#btn-challenge'); page.wait_for_selector('#sheet .pick', timeout=5000); page.locator('#sheet .pick').first.click(force=True)
        st = wait_state(page, 's.lastDuel && s.sheet && s.lastLinkShare', 15000)
        S.check('Tagesende → Herausfordern: Link-Karte auf dem Tagesende, Satz + Link kopiert', st['screen'] == 'dayend' and page.is_visible('#sheet .link-card') and st['lastLinkShare']['mode'] in ('copied', 'shared', 'shown'), st['lastLinkShare'])
        page.click('#sheet [data-act=done]', force=True)
        page.click('#btn-share')
        st = wait_state(page, 's.lastCard && s.sheet', 40000)
        S.check('Heute-Karte-Teilen-Fallback (Bild + Speichern + Textreihe je Wort)', page.query_selector('#sheet img.share-img') is not None and page.query_selector('#sheet a[download]') is not None and len(st['lastCard']['rows']) >= 4, st['lastCard']['text'])
        page.click('#sheet [data-act=close]')
        # Duell erstellen über die Oberfläche
        page.evaluate('() => window.__home()')
        page.click('#btn-duel')
        st = wait_state(page, 's.screen === "duel" && s.duelPicks', 10000)
        wid = st['duelPicks'][0]
        page.click(f'.word-pick[data-id="{wid}"]', force=True)
        wait_state(page, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        page.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 12, gapMs: 160})', FIX[wid][0])
        st = wait_state(page, f's.lastDuel && s.lastDuel.id === {json.dumps(wid)}', 40000)
        url = st['lastDuel']['url']
        S.check('Duell-Link zeigt auf dieselbe Origin + #d=', url.startswith(origin) and '#d=' in url, url[:80])
        # Empfänger: frischer Kontext, echte URL (Hash) + ?test=1 vor dem Hash
        c2 = b.new_context(viewport={'width': 1280, 'height': 800})
        pg2 = c2.new_page(); pg2.goto(url.replace('/#d=', '/?test=1#d='))
        pg2.wait_for_selector('#duel-body [data-act=go]', timeout=30000); pg2.click('#duel-body [data-act=go]')
        st2 = wait_state(pg2, 's.duelState && s.duelState.phase === "options"', 60000)
        pg2.click(f'.answer[data-id="{wid}"]', force=True)
        st2 = wait_state(pg2, 's.duelState && s.duelState.phase === "reveal"', 10000)
        S.check('Duell-Link-Roundtrip auf der URL: Replay → Optionen → richtig aufgelöst', st2['duelState']['ok'] and st2['duelState']['target'] == wid, st2['duelState']['target'])
        c2.close()
        for pth, must in (('impressum.html', 'Karolingerstraße'), ('datenschutz.html', 'verlässt nie'), ('credits.html', 'CC BY 4.0')):
            r = page.goto(base + '/' + pth); S.check(f'{pth} erreichbar', r.status == 200 and must in page.content(), r.status)
        S.check('Keine externen Requests (Desktop-Lauf)', not ext, ext[:3])
        S.check('Keine Seitenfehler (Desktop)', not errors, errors[:3])
        b.close()
    S.run('Desktop', desktop)

    # ---------------- Mobil ----------------
    def mobile():
        b, ctx = launch(p, mobile=True)
        page = ctx.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + '/?test=1'); wait_state(page, 's.clfReady', 90000)
        page.evaluate('() => window.__settings({native: "tr", learn: "de", airOffered: false})')
        page.evaluate('() => window.__setDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10))')
        plan = page.evaluate('() => window.__plan()')
        page.tap('#btn-daily')
        for i, slot in enumerate(plan['slots']):
            lr = play_slot(page, slot, 'de')
            page.evaluate('() => window.__next()')
            if i == 0:
                page.wait_for_timeout(600)
                S.check('Handy: kein Luft-Angebot, Bildschirm-Modus', page.query_selector('.overlay [data-k="yes"]') is None and page.evaluate('() => window.__state().mode') == 'screen')
        st = wait_state(page, 's.screen === "dayend" && s.summary', 30000)
        S.check('Tagesskizze komplett (mobil, TR → DE mit Artikel-Schritt)', st['summary']['hits'] >= 4, st['summary']['hits'])
        page.tap('#btn-share')
        st = wait_state(page, 's.lastCard && s.sheet', 40000)
        S.check('Teilen-Fallback mobil mit „Lange drücken"-Hinweis', 'Kaydetmek' in (page.text_content('#sheet') or '') or 'basılı' in (page.text_content('#sheet') or ''), (page.text_content('#sheet .hint') or '')[:60])
        page.tap('#sheet [data-act=close]')
        page.tap('#btn-dayend-dict')
        st = wait_state(page, 's.screen === "dict" && s.dictEntries && s.dictEntries.length >= 4', 15000)
        S.check('Bildwörterbuch mobil gefüllt', len(st['dictEntries']) >= 4, len(st['dictEntries']))
        vw = page.evaluate('() => [document.documentElement.scrollWidth, window.innerWidth]')
        S.check('Mobil: kein horizontales Scrollen', vw[0] <= vw[1] + 1, vw)
        S.check('Keine Seitenfehler (mobil)', not errors, errors[:3])
        b.close()
    S.run('Mobil', mobile)

    # ---------------- Leichter Start (Iteration 1, Review P3-13) ----------------
    def light():
        b, ctx = launch(p)
        page = ctx.new_page(); tot = {'b': 0, 'heavy': []}
        def on_fin(rq):
            try:
                sz = rq.sizes(); tot['b'] += (sz.get('responseBodySize', 0) or 0) + (sz.get('responseHeadersSize', 0) or 0)
                if any(k in rq.url for k in ('tf.min.js', 'doodlenet', '/audio/v1/de/w/', '/audio/v1/tr/w/', '/audio/v1/en/w/', 'manifest.json')): tot['heavy'].append(rq.url.rsplit('/', 1)[-1])
            except Exception:
                pass
        page.on('requestfinished', on_fin)
        t0 = time.time()
        page.goto(base + '/?test=1&lazy=1'); page.wait_for_function('() => window.__kalemo && window.__kalemo.ready', timeout=60000)
        page.wait_for_load_state('networkidle'); page.wait_for_timeout(2000)
        S.check('Leichter Start: < 400 KB Transfer, keine Mal-KI/Wort-Clips vor der Absicht', tot['b'] < 400_000 and not tot['heavy'], f"{tot['b'] / 1000:.0f} KB {tot['heavy'][:3]}")
        page.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        plan = page.evaluate('() => window.__plan()')
        page.click('#btn-daily')
        wait_state(page, f's.round && s.round.target === {json.dumps(plan["slots"][0]["id"])}', 60000)
        ms = page.evaluate('() => window.__kalemo.loadingMs ?? 0')
        lr = play_slot(page, plan['slots'][0], 'tr')
        S.check('Nach Klick: Ladeanzeige ≤ 1 s (Vorladen beim Zeigen), erster Treffer < 60 s', ms <= 1000 and lr['result'] == 'hit' and time.time() - t0 < 60, f'{ms} ms, {time.time() - t0:.1f} s')
        b.close()
    S.run('Leichter Start', light)

    # ---------------- In-App-Browser (Instagram-UA) — Iteration 1, Review P1-1 ----------------
    def inapp():
        b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.18.110')
        page = ctx.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + '/?test=1'); wait_state(page, 's.clfReady', 90000)
        hit = '''(sel) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)); }'''
        pos = page.evaluate("() => getComputedStyle(document.querySelector('#inapp')).position")
        S.check('In-App: Hinweis als Layout-Zeile im Start (nicht fixed), Logo frei', page.is_visible('#inapp') and pos != 'fixed' and page.evaluate(hit, '#title'), pos)
        page.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, chosenPair: true})')
        page.tap('#btn-daily')
        wait_state(page, 's.round && s.screen === "round"', 30000); page.wait_for_timeout(400)
        oks = {sel: page.evaluate(hit, sel) for sel in ('#word', '#timer', '#round-close', '#round-speaker', '#mode-toggle .chip.locked')}
        S.check('In-App-Runde: Wort, Timer, ×, Lautsprecher, Chip „nur im Browser" frei antippbar', all(oks.values()), oks)
        S.check('Keine Seitenfehler (In-App)', not errors, errors[:3])
        b.close()
    S.run('In-App', inapp)

    # ---------------- Luft-Modus unter echter CSP (Fake-Kamera) ----------------
    def air():
        b, ctx = launch(p, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={MJPEG}'])
        ctx.grant_permissions(['camera'])
        page = ctx.new_page(); errors = []; csp = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: csp.append(m.text) if 'Content Security Policy' in m.text or 'Refused' in m.text else None)
        page.goto(base + '/?test=1&delegate=CPU'); wait_state(page, 's.clfReady', 90000)
        page.evaluate('() => window.__settings({native: "de", learn: "en", airOffered: true})')
        page.evaluate('() => { window.__kalemo.show("round"); }')
        ok = page.evaluate('async () => await window.__enableAir()')
        page.wait_for_timeout(4000)
        a = page.evaluate('() => window.__airStats()')
        S.check('Luft-Modus auf der URL: MediaPipe lädt (CSP ok), Landmarken + Stift-Pose', ok and a and a['frames'] > 20 and a['poseFrames'] > 0, a)
        S.check('Keine CSP-Verstöße', not csp, csp[:2])
        S.check('Keine Seitenfehler (Luft)', not errors, errors[:3])
        b.close()
    S.run('Luft', air)
S.finish()
