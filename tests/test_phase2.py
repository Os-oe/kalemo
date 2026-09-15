"""Phase-2-Gate: __feedLandmarks-Suite (Hysterese, Strich-Ende, Hand verloren, Artikel 1/2/3, Daumen, kleiner Finger)
+ Fake-Kamera-Rauchtest (mjpeg, CPU) inkl. Onboarding-Kette + Kamera-abgelehnt-Pfad + Artikel per Tippen."""
import json, os
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT
from hands import seq, POINT, OPEN, FIST, C1, C2, C2_THUMB, C3, C3_THUMB, FOUR, WOLF, NONE

S = Suite('phase2')
MJPEG = os.path.join(ROOT, 'tools/fixtures/pointing.mjpeg')
OUT = os.path.join(ROOT, 'tests/out'); os.makedirs(OUT, exist_ok=True)


def feed(page, frames, **kw):
    return page.evaluate('([f, o]) => window.__feedLandmarks(f, o)', [frames, kw])


def pens(res):
    return [x['pen'] for x in res['trace']]


def play_first_hit(page, ids_expected=None):
    plan = page.evaluate('() => window.__plan()')
    page.evaluate('() => window.__startDaily()')
    w = plan['slots'][0]['id']
    wait_state(page, f's.round && s.round.target === {json.dumps(w)}', 20000)
    page.evaluate('(st) => window.__feedStrokes(st, {timing: "real"})', FIX[w][0])
    st = wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(w)} && s.overlay', 25000)
    S.check(f'1. Treffer ({w})', st['lastResult']['result'] == 'hit', (st['lastResult']['result'], st['overlayClass'], st['settings'].get('airOffered'), st['mode']))
    return plan


def play_to_dayend(page):
    """Iteration 1 (Review P3-1): das Luft-Angebot kommt erst am Tagesende → Tagesskizze komplett spielen (Lernsprache ohne Artikel)."""
    plan = page.evaluate('() => window.__plan()')
    page.evaluate('() => window.__startDaily()')
    for i, slot in enumerate(plan['slots']):
        w = slot['id']
        base_n = wait_state(page, f's.round && s.round.target === {json.dumps(w)}', 20000)['drawCount']
        for k in range(slot['n'] if slot['kind'] == 'plural' else 1):
            wait_state(page, f's.round && s.drawCount === {base_n + k}', 30000)
            page.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 8, gapMs: 120})', FIX[w][k % 2])
        st = wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(w)} && s.overlay', 40000)
        if i == 0:
            S.check(f'1. Treffer ({w}) — danach KEIN Luft-Angebot mitten in der Tagesskizze', st['lastResult']['result'] == 'hit', st['lastResult']['result'])
        page.evaluate('() => window.__next()')
        if i == 0:
            page.wait_for_timeout(500)
            S.check('Desktop: nach Treffer 1 keine „Jetzt in die Luft?"-Karte (P3-1)', page.query_selector('#round-overlay [data-k="yes"]') is None)
    wait_state(page, 's.screen === "dayend"', 20000)
    return plan


with server() as base, sync_playwright() as p:
    # ---------------- A/B: __feedLandmarks ----------------
    b, ctx = launch(p)
    page = ctx.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base + '/?test=1'); wait_state(page, 's.clfReady', 60000)

    def hysteresis():
        fr = seq(OPEN, 5, 0) + seq(POINT, 2, 5 * 33.3) + seq(OPEN, 1, 7 * 33.3) + seq(POINT, 3, 8 * 33.3) + seq(POINT, 4, 11 * 33.3) + seq(OPEN, 2, 15 * 33.3) + seq(OPEN, 3, 17 * 33.3)
        r = feed(page, fr); pp = pens(r)
        S.check('Hysterese: 2 Stift-Frames reichen nicht', pp[6] == 'up', pp[:8])
        S.check('Hysterese: Unterbrechung setzt Zähler zurück, 3. stabiler Frame → Stift runter', pp[9] == 'up' and pp[10] == 'down', pp[8:11])
        S.check('Hysterese: 2 offene Frames halten den Stift unten, der 3. hebt ihn', pp[14] == 'down' and pp[15] == 'down' and pp[16] == 'down' and pp[17] == 'up', pp[14:18])
    S.run('Hysterese', hysteresis)

    def lost():
        fr = seq(POINT, 6, 0) + [{'lm': None, 't': 200 + i * 33.3} for i in range(8)]
        r = feed(page, fr); tr = r['trace']
        down_at = next(i for i, x in enumerate(tr) if x['pen'] == 'down')
        up_idx = next(i for i, x in enumerate(tr) if 'lost' in x['events'])
        t_last_hand = fr[5]['t']; t_up = tr[up_idx]['t']
        S.check('Hand verloren: nach > 150 ms Stift hoch (nicht früher)', tr[up_idx]['pen'] == 'up' and 150 < t_up - t_last_hand <= 190 and all(x['pen'] == 'down' for x in tr[down_at:up_idx]), f'{t_up - t_last_hand:.0f} ms')
    S.run('Hand verloren', lost)

    def article():
        def sel(frames):
            r = feed(page, frames, article=True)
            last = [x['article'] for x in r['trace'] if x['article']]
            return last[-1]['selected'], last
        s1, _ = sel(seq(C1, 36, 0))
        s2, _ = sel(seq(C2_THUMB, 36, 0))
        s3, _ = sel(seq(C3, 36, 0))
        s3t, _ = sel(seq(C3_THUMB, 36, 0))
        s4, l4 = sel(seq(FOUR, 45, 0))
        sw, _ = sel(seq(WOLF, 45, 0))
        sshort, _ = sel(seq(C2, 25, 0) + seq(C3, 12, 25 * 33.3))
        S.check('Artikel 1 Finger (Zeigefinger) → der', s1 == 1, s1)
        S.check('Artikel 2 Finger, Daumen gestreckt zählt nicht → 2', s2 == 2, s2)
        S.check('Artikel 3 Finger → 3 (auch mit Daumen)', s3 == 3 and s3t == 3, (s3, s3t))
        S.check('kleiner Finger gestreckt (4 Finger) = ungültig', s4 is None and all(x['count'] is None for x in l4), s4)
        S.check('Zeigefinger + kleiner Finger = ungültig', sw is None, sw)
        S.check('Wechsel vor 1 s → keine Auswahl', sshort is None, sshort)
    S.run('Artikel', article)

    def in_round():
        page.evaluate('() => window.__settings({native: "de", learn: "en", airOffered: true, air: false})')
        page.evaluate('() => window.__setDate("2026-09-18")')
        plan = page.evaluate('() => window.__plan()')
        page.evaluate('() => window.__startDaily()')
        wait_state(page, f's.round && s.round.target === {json.dumps(plan["slots"][0]["id"])}', 20000)
        page.evaluate('() => window.__mode("airsim")')
        mv = lambda i: (0.3 + i * 0.012, 0.4 + (i % 10) * 0.004)
        fr = seq(OPEN, 3, 0) + seq(POINT, 30, 100, move=mv) + seq(OPEN, 4, 1100, move=lambda i: (0.66 + i * 0.012, 0.45))
        r = feed(page, fr)
        tr = r['trace']; up_i = next(i for i, x in enumerate(tr) if 'up' in x['events'])
        last_move_t = max(x['t'] for x in tr[:up_i] if 'move' in x['events'] or 'down' in x['events'])
        st = r['strokes'][-1]
        S.check('Strich-Ende: letzte ~100 ms abgeschnitten', st['t1'] <= last_move_t - 95 and st['t1'] >= last_move_t - 170, f'Strich endet {last_move_t - st["t1"]:.0f} ms vor letzter Bewegung')
        n_before = len(r['strokes'])
        fr2 = seq(POINT, 12, 2000, move=lambda i: (0.3, 0.7 - i * 0.01)) + [{'lm': None, 't': 2400 + i * 33.3} for i in range(7)] + seq(POINT, 12, 2650, move=lambda i: (0.8, 0.3 + i * 0.01))
        r2 = feed(page, fr2, fresh=False)
        strokes = r2['strokes'][n_before:]
        S.check('Hand verloren im Strich: zwei getrennte Striche, keine Linie quer übers Bild', len(strokes) == 2 and strokes[0]['t1'] < 2400 and strokes[1]['t0'] >= 2650, strokes)
        page.evaluate('() => window.__mode("screen")')
        page.click('#round-close')
    S.run('In-Runde', in_round)

    def article_tap():
        page.evaluate('() => window.__settings({native: "tr", learn: "de", airOffered: true})')
        page.evaluate('() => window.__setDate("2026-09-19")')
        plan = page.evaluate('() => window.__plan()')
        wid = plan['slots'][0]['id']
        page.evaluate('() => window.__startDaily()')
        page.wait_for_selector('.art-card', timeout=15000)
        words = json.load(open(os.path.join(ROOT, 'data/words.json')))
        art = next(w for w in words if w['id'] == wid)['de']['art']
        wrong = next(a for a in ['der', 'die', 'das'] if a != art)
        page.click(f'.art-card[data-a="{wrong}"]')
        page.wait_for_timeout(300)
        hint = page.text_content('.article-card .hint')
        st = wait_state(page, f's.round && s.round.target === {json.dumps(wid)}', 8000)
        color = page.evaluate('() => window.__kalemo.stage.color')
        cols = {'der': '#3B82F6', 'die': '#EF4444', 'das': '#22C55E'}
        S.check('Artikel antippen (andere Wahl) → richtige Farbe + Hinweis, KI-Schuld-freie Formulierung', st['lastArticle']['ok'] is False and art in (hint or '') and color == cols[art], (hint, color))
        page.click('#round-close')
    S.run('Artikel Tippen', article_tap)
    S.check('keine Seitenfehler (A/B)', not errors, errors[:3])
    b.close()

    # ---------------- C: Kamera abgelehnt ----------------
    def denied():
        b2, c2 = launch(p)
        c2.add_init_script("navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));")
        pg = c2.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: false, air: false, airDenied: false})')
        pg.evaluate('() => window.__setDate("2026-09-21")')
        plan = play_to_dayend(pg)
        pg.wait_for_selector('#dayend-air [data-k="yes"]', timeout=5000)
        S.check('Desktop: Angebot „Jetzt in die Luft?" am Tagesende', True)
        pg.click('#dayend-air [data-k="yes"]')
        pg.wait_for_selector('.precam-card [data-k="go"]', timeout=5000)
        S.check('Vorab-Karte mit Datenschutz-Satz', 'verlässt nie' in (pg.text_content('.precam-card') or ''))
        pg.click('.precam-card [data-k="go"]')
        st = wait_state(pg, 's.screen === "dayend" && s.toast', 20000)
        S.check('Kamera abgelehnt → Bildschirm-Modus, freundlicher Hinweis, zurück zum Tagesende', st['mode'] == 'screen' and (st['toast'] or '').startswith('Kein Problem') and st['settings']['airDenied'] is True, (st['mode'], st['toast']))
        S.check('abgelehnt: kein Modell-Download (Handerkennung nicht geladen)', pg.evaluate('() => !window.__kalemo.air || window.__kalemo.air.state === "off"'))
        S.check('keine Seitenfehler (abgelehnt)', not errs, errs[:3])
        b2.close()
    S.run('Kamera abgelehnt', denied)

    # ---------------- D: Fake-Kamera + Onboarding-Kette ----------------
    def fake_cam():
        b3, c3 = launch(p, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={MJPEG}'])
        c3.grant_permissions(['camera'])
        pg = c3.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/?test=1&delegate=CPU'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "en", airOffered: false, air: false, airDenied: false})')
        pg.evaluate('() => window.__setDate("2026-09-22")')
        plan = play_to_dayend(pg)
        pg.click('#dayend-air [data-k="yes"]', timeout=5000)
        pg.click('.precam-card [data-k="go"]', timeout=5000)
        pg.wait_for_selector('.clear-card', timeout=90000)
        S.check('Onboarding: Hand-Check erscheint nach Kamera-Freigabe + Modell-Laden', True)
        pg.wait_for_selector('.clear-card.ok', timeout=30000)
        S.check('Hand-Check wird grün (Hand im Fake-Kamera-Video erkannt)', True)
        # Iteration 1, Zusatz 23: Stift-Kalibrierung (10 s) mit dem Fake-Kamera-Video durchlaufen
        pg.click('.calib-card [data-k="go"]', timeout=10000)
        stc = wait_state(pg, 's.settings.penCalib && s.settings.penCalib.choice', 25000)
        S.check('Stift-Kalibrierung: Zeigefinger-Video → Zeigefinger gewählt (Pose-Anteil gemessen)', stc['settings']['penCalib']['choice'] == 'index' and stc['settings']['penCalib']['index']['pose'] > 0.5 and stc['settings']['pinch'] is False, stc['settings']['penCalib'])
        st = wait_state(pg, f's.round && s.round.target === {json.dumps(plan["slots"][0]["id"])}', 20000)
        S.check('Übungsrunde startet im Luft-Modus', st['mode'] == 'air', st['mode'])
        pg.wait_for_timeout(4000)
        a = pg.evaluate('() => window.__airStats()')
        S.check('Fake-Kamera (mjpeg, CPU): Landmarken kommen an', a['frames'] > 30 and a['handFrames'] > 10 and a['delegate'] == 'CPU', a)
        S.check('Fake-Kamera: Stift-Pose (Zeigefinger) erkannt', a['poseFrames'] > 0, a['poseFrames'])
        pg.screenshot(path=f'{OUT}/phase2-fakecam.png')
        # Hol es echt: Detektor lädt erst jetzt, Suche endet ohne Fund sauber
        od_before = pg.evaluate('() => !!window.__kalemo.air.objectDetector')
        r = pg.evaluate('async () => { await window.__kalemo.air.loadObjectDetector(); const x = await window.__kalemo.air.hunt("cup", {windowMs: 2500}); return {found: x.found, od: !!window.__kalemo.air.objectDetector}; }')
        S.check('Hol es echt: EfficientDet lazy geladen, Suche endet (kein Fund)', not od_before and r['od'] and r['found'] is False, r)
        S.check('Hol es echt: Messer/Schere/Toilette gesperrt', pg.evaluate('async () => (await window.__kalemo.air.hunt("knife")).reason === "blocked"'))
        S.check('keine Seitenfehler (Fake-Kamera)', not errs, errs[:3])
        b3.close()
    S.run('Fake-Kamera', fake_cam)

    # ---------------- E: Handy — kein Luft-Angebot ----------------
    def mobile():
        b4, c4 = launch(p, mobile=True)
        pg = c4.new_page(); pg.goto(base + '/?test=1'); wait_state(pg, 's.clfReady', 60000)
        pg.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: false})')
        pg.evaluate('() => window.__setDate("2026-09-23")')
        plan = play_first_hit(pg)
        pg.evaluate('() => window.__next()')
        st = wait_state(pg, f's.round && s.round.target === {json.dumps(plan["slots"][1]["id"])}', 15000)
        S.check('Handy: nach 1. Treffer kein Luft-Angebot, Bildschirm bleibt Standard', st['mode'] == 'screen' and not st['settings'].get('airOffered'), st['mode'])
        pg.evaluate('() => window.__kalemo.showDayEnd({ number: 9, date: "2026-09-23", hits: 5, points: 400, scored: false, learn: "tr", results: [] })')
        S.check('Handy: auch am Tagesende kein Luft-Angebot', pg.is_hidden('#dayend-air'))
        b4.close()
    S.run('Handy', mobile)
S.finish()
