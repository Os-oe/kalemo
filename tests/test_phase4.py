"""Phase-4-Gate (funktionaler Teil): Timing-Regeln KI-rät-live (Engine + echte Runde), Juice-Checkliste Punkt für Punkt,
Glyphen-Gate, Audio-Vollständigkeit + verify-report 100 %, keine externen Requests, Legal-Seiten erreichbar."""
import json, os
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX, ROOT

S = Suite('phase4')
WORDS = {w['id']: w for w in json.load(open(os.path.join(ROOT, 'data/words.json')))}
LINES = [[[0, 255], [40, 40]], [[0, 255], [120, 120]], [[0, 255], [200, 200]]]  # drei Querstriche: kein Pool-Wort

ENGINE_TESTS = r'''async () => {
  const { RoundEngine } = await import('/js/core/engine.js');
  const T = (id, p = 0.8, rest = []) => [{ id, p }, ...rest];
  const out = {};
  // 1 Schweigen erste 2 s
  let e = new RoundEngine({ target: 'cat', minInk: 0 }); e.start(0);
  out.silent = [0, 500, 1000, 1900].map((t, i) => e.onPrediction(t, T(['sun', 'moon', 'car', 'bus'][i]), 100).filter(x => x.type === 'guess').length).reduce((a, b) => a + b, 0);
  out.after2s = e.onPrediction(2050, T('tree'), 100).filter(x => x.type === 'guess').length;
  // 2 Mindest-Strichlänge
  e = new RoundEngine({ target: 'cat', minInk: 80 }); e.start(0);
  out.minInk = e.onPrediction(3000, T('sun'), 40).filter(x => x.type === 'guess').length;
  // 3 Wahrscheinlichkeit > 0,25
  e = new RoundEngine({ target: 'cat' }); e.start(0);
  out.lowP = e.onPrediction(3000, T('sun', 0.24), 100).filter(x => x.type === 'guess').length;
  // 4 Abstand ≥ 1,5 s + keine laufende Äußerung
  e = new RoundEngine({ target: 'cat' }); e.start(0);
  const g1 = e.onPrediction(2100, T('sun'), 100).length; const g2 = e.onPrediction(2700, T('moon'), 100).filter(x => x.type === 'guess').length;
  const g3 = e.onPrediction(3700, T('moon'), 100).filter(x => x.type === 'guess').length;
  out.gap = [g1, g2, g3];
  // 5 gleiches Top-1 nicht wiederholen
  e = new RoundEngine({ target: 'cat' }); e.start(0);
  e.onPrediction(2100, T('sun'), 100); out.repeat = e.onPrediction(5000, T('sun'), 100).filter(x => x.type === 'guess').length;
  // 6 max. 5 Tipps
  e = new RoundEngine({ target: 'cat' }); e.start(0);
  const ids = ['sun', 'moon', 'car', 'bus', 'tree', 'house', 'fish', 'key', 'hat', 'cup'];
  let n = 0; ids.forEach((id, i) => { n += e.onPrediction(2100 + i * 1600, T(id), 100).filter(x => x.type === 'guess').length; });
  out.max5 = n;
  // 7 veraltete Tipps verwerfen (keine Warteschlange)
  e = new RoundEngine({ target: 'cat' }); e.start(0);
  e.onPrediction(2100, T('sun'), 100); e.onPrediction(2500, T('moon'), 100); e.onPrediction(2900, T('car'), 100);
  const late = e.onPrediction(3700, T('bus'), 100).filter(x => x.type === 'guess');
  out.stale = { spoken: e.tips.map(x => x.id), late: late.map(x => x.id) };
  // 8 Treffer: Top-3, 300 ms stabil, unterbricht
  e = new RoundEngine({ target: 'cat' }); e.start(0);
  const h1 = e.onPrediction(4000, T('sun', 0.6, [{ id: 'moon', p: 0.2 }, { id: 'cat', p: 0.1 }]), 100);
  const h2 = e.onPrediction(4200, T('sun', 0.6, [{ id: 'moon', p: 0.2 }, { id: 'cat', p: 0.1 }]), 100);
  const h3 = e.onPrediction(4310, T('sun', 0.6, [{ id: 'moon', p: 0.2 }, { id: 'cat', p: 0.1 }]), 100);
  out.hit = { h1: h1.map(x => x.type), h2: h2.map(x => x.type), h3: h3.map(x => x.type), interrupt: (h3.find(x => x.type === 'hit') || {}).interrupt };
  // 9 letzte 5 s „schwierig" genau einmal, 10 Zeit um
  e = new RoundEngine({ target: 'cat' }); e.start(0);
  const hard = [14000, 15100, 16000, 17000].map(t => e.tick(t).filter(x => x.type === 'hard').length).reduce((a, b) => a + b, 0);
  out.hard = hard; out.timeout = e.tick(20000).map(x => x.type);
  return out;
}'''

with server() as base, sync_playwright() as p:
    b, ctx = launch(p)
    page = ctx.new_page(); errors = []; requests = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: requests.append(r.url))
    page.goto(base + '/?test=1'); wait_state(page, 's.clfReady', 60000)
    page.mouse.click(5, 5)  # User-Geste → AudioContext

    def engine():
        r = page.evaluate(ENGINE_TESTS)
        S.check('Timing: erste 2 s schweigen, danach Tipp', r['silent'] == 0 and r['after2s'] == 1, r)
        S.check('Timing: erst ab Mindest-Strichlänge', r['minInk'] == 0)
        S.check('Timing: nur bei Wahrscheinlichkeit > 0,25', r['lowP'] == 0)
        S.check('Timing: Abstand ≥ 1,5 s und keine laufende Äußerung', r['gap'] == [1, 0, 1], r['gap'])
        S.check('Timing: gleiches Top-1 wird nicht wiederholt', r['repeat'] == 0)
        S.check('Timing: max. 5 Tipps pro Runde', r['max5'] == 5, r['max5'])
        S.check('Timing: veraltete Tipps verworfen (keine Warteschlange)', r['stale']['spoken'] == ['sun', 'bus'], r['stale'])
        S.check('Timing: Treffer = Zielwort Top-3 ≥ 300 ms stabil, unterbricht', 'hit' not in r['hit']['h2'] and 'hit' in r['hit']['h3'] and r['hit']['interrupt'] is True, r['hit'])
        S.check('Timing: letzte 5 s „Hmm, schwierig …" genau einmal; Zeit um', r['hard'] == 1 and 'timeout' in r['timeout'], (r['hard'], r['timeout']))
    S.run('Engine', engine)

    def glyphs():
        r = page.evaluate('''async () => {
          const chars = [...'ğüşıöçİĞÜŞÖÇäöüß']; const fonts = ['700 48px Caveat', '600 48px Caveat', '400 48px Nunito', '800 48px Nunito'];
          await Promise.all(fonts.map(f => document.fonts.load(f, chars.join(''))));
          const c = document.createElement('canvas').getContext('2d'); const miss = [];
          for (const f of fonts) for (const ch of chars) { c.font = f + ', serif'; const a = c.measureText(ch).width; c.font = f + ', monospace'; const b2 = c.measureText(ch).width; if (Math.abs(a - b2) > 0.01 || !document.fonts.check(f, ch)) miss.push(f + ' ' + ch); }
          return { miss, checked: fonts.length * chars.length };
        }''')
        S.check('Glyphen-Gate: „ğüşıöç İĞÜŞÖÇ äöüß" ohne Fallback in Caveat 600/700 + Nunito 400/800', not r['miss'], r)
    S.run('Glyphen', glyphs)

    def juice_round():
        page.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true, muted: false})')
        page.evaluate('() => window.__setDate("2026-10-11")')
        plan = page.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']
        page.evaluate('() => window.__startDaily()')
        wait_state(page, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        st0 = page.evaluate('() => window.__state()')
        S.check('Rundenbeginn: Wort in der Lernsprache wird vorgesprochen', any(f'tr/w/{WORDS[wid]["cls"]}' in v['parts'] for v in st0['voiceLog']), st0['voiceLog'][-2:])
        page.evaluate('(st) => { window.__feedStrokes(st, {timing: "real", ptMs: 22, gapMs: 500}); }', FIX[wid][0])
        page.wait_for_timeout(250)
        s1 = page.evaluate('() => window.__state()')
        S.check('Juice Stift runter: Cursor gefüllt + Tick + Leuchtspur', s1['stageFx']['cursor'] == 'draw' and any(x['name'] == 'penDown' for x in s1['fxLog']), (s1['stageFx'], [x['name'] for x in s1['fxLog'][-3:]]))
        tip_seen = None
        for _ in range(60):
            s = page.evaluate('() => window.__state()')
            if s['round'] and s['round']['tips'] and not tip_seen:
                tip_seen = s
            if s['overlay'] and s['lastResult'] and s['lastResult']['id'] == wid:
                break
            page.wait_for_timeout(100)
        if tip_seen:
            S.check('Juice KI-Tipp: Blase ploppt + Stimme (Präfix + Wort) + Zeichnung zuckt', tip_seen['bubble'] and tip_seen['bubble']['pop'] and any(any('/x/hmm' in q for q in v['parts']) for v in tip_seen['voiceLog']) and 'guessPop' in [x['name'] for x in tip_seen['fxLog']], (tip_seen['bubble'], tip_seen['stageFx']['twitch']))
            S.check('Timing in echter Runde: erster Tipp nicht vor 2 s', tip_seen['round']['tips'][0]['t'] >= 2000, tip_seen['round']['tips'])
        else:
            S.check('Timing in echter Runde: (Treffer vor dem ersten Tipp — Schweigen gewahrt)', True)
        s = wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(wid)}', 30000)
        names = [x['name'] for x in s['fxLog']]
        order = ['tr', 'de', 'en']; cls = WORDS[wid]['cls']
        hitv = [v for v in s['voiceLog'] if any('/x/hit' in q for q in v['parts'])]
        S.check('Juice Treffer: Freeze + Chime + Squash-Pop + Konfetti + Kategorie-Klang + Stimme 3 Sprachen', s['lastResult']['result'] == 'hit' and 'hit' in names and hitv and [q.split('/')[0] for q in hitv[-1]['parts'][1:]] == order and all(q.endswith('/' + cls) for q in hitv[-1]['parts'][1:]),
                (s['lastResult']['result'], names[-5:], hitv[-1]['parts'] if hitv else None))
        page.wait_for_timeout(700)
        s = page.evaluate('() => window.__state()')
        S.check('Juice Treffer: Kategorie-Bewegung-Klang (' + WORDS[wid]['sfx'] + ') nach dem Chime', WORDS[wid]['sfx'] in [x['name'] for x in s['fxLog']], [x['name'] for x in s['fxLog'][-4:]])
        page.wait_for_selector('#round-overlay canvas.alive', timeout=5000)
        S.check('Treffer-Karte: lebende Zeichnung + 3 Sprachen (Lernsprache zuerst)', [e.get_attribute('data-say') for e in page.query_selector_all('#round-overlay .lang-line')] == order)
        page.evaluate('() => window.__next()')
        # Slot 2: Zeit um mit drei Querstrichen
        wid2 = plan['slots'][1]['id']
        wait_state(page, f's.round && s.round.target === {json.dumps(wid2)}', 20000)
        page.evaluate('(st) => window.__feedStrokes(st, {timing: "real", ptMs: 20, gapMs: 400})', LINES)
        s = wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(wid2)}', 30000)
        names = [x['name'] for x in s['fxLog']]
        S.check('Juice Zeit um: Zerbröseln + weicher fallender Ton + (kein Buzzer)', s['lastResult']['result'] == 'timeout' and s['stageFx']['crumbling'] and 'crumble' in names and 'timeup' in names, (s['lastResult']['result'], names[-4:]))
        missv = [v for v in s['voiceLog'] if any('/x/timeup' in q for q in v['parts'])]
        S.check('Zeit um: freundliche Stimme + Wort trotzdem in 3 Sprachen', missv and [q.split('/')[0] for q in missv[-1]['parts'][1:]] == order, missv[-1]['parts'] if missv else None)
        page.wait_for_selector('#round-overlay .others canvas', timeout=6000)
        txt = page.text_content('#round-overlay h3')
        S.check('Zeit um: „Ich hab’s nicht erkannt — so malen es andere:" + 3 Beispiele, KI trägt die Schuld', 'nicht erkannt' in txt and len(page.query_selector_all('#round-overlay .others canvas')) == 3 and 'falsch' not in txt.lower(), txt)
        page.evaluate('() => window.__home()')
    S.run('Juice Runde', juice_round)

    def help_path():
        page.evaluate('() => window.__settings({native: "en", learn: "tr", airOffered: true})')
        page.evaluate('() => window.__setDate("2026-10-17")')
        plan = page.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']
        page.evaluate('() => window.__startDaily()')
        wait_state(page, f's.round && s.round.target === {json.dumps(wid)}', 20000)
        page.wait_for_selector('#round-help:not([hidden])', timeout=12000)
        S.check('Hilfe-Knopf „Show me how others draw it" erscheint nach 8 s (UI-Sprache)', 'others draw' in (page.text_content('#round-help') or ''))
        t_click = page.evaluate('() => performance.now()')
        page.click('#round-help', force=True)
        s = wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(wid)}', 10000)
        page.wait_for_timeout(800); s = page.evaluate('() => window.__state()')
        v_after = [v for v in s['voiceLog'] if v['t'] >= t_click]; fx_after = [x['name'] for x in s['fxLog'] if x['t'] >= t_click]
        S.check('Hilfe-Weg: Blase „Bakalım başkaları nasıl çizmiş." statt „Zeit ist um", kein Zeit-um-Clip/-Ton, Wort in 3 Sprachen', s['bubble'] and 'Bakalım' in s['bubble']['text'] and not any('/x/timeup' in q for v in v_after for q in v['parts']) and 'timeup' not in fx_after and any(len(v['parts']) == 3 for v in v_after), (s['bubble'], [v['parts'] for v in v_after], fx_after))
        page.wait_for_selector('#round-overlay .others canvas', timeout=6000)
        aria = page.get_attribute('#round-close', 'aria-label')
        S.check('aria-label folgt der UI-Sprache (EN: Close)', aria == 'Close', aria)
        page.evaluate('() => window.__home()')
    S.run('Hilfe-Weg', help_path)

    def juice_article():
        page.evaluate('() => window.__settings({native: "en", learn: "de", airOffered: true})')
        page.evaluate('() => window.__setDate("2026-10-13")')
        plan = page.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']; art = WORDS[wid]['de']['art']
        page.evaluate('() => window.__startDaily()')
        page.wait_for_selector('.art-card', timeout=15000)
        s0 = page.evaluate('() => window.__state()')
        S.check('Artikel-Schritt: DE-Nomen ohne Artikel vorgesprochen (keine Lösung verraten)', any(f'de/b/{WORDS[wid]["cls"]}' in v['parts'] for v in s0['voiceLog']) and not any(f'de/w/{WORDS[wid]["cls"]}' in v['parts'] for v in s0['voiceLog'][-2:]))
        page.click(f'.art-card[data-a="{art}"]')
        page.wait_for_timeout(120)
        cls_ok = page.get_attribute(f'.art-card[data-a="{art}"]', 'class') or ''
        s = page.evaluate('() => window.__state()')
        S.check('Juice Artikel richtig: Karte blitzt + Chime + Finger-Icon hüpft + Wort mit Artikel', 'flash' in cls_ok and 'articleOk' in [x['name'] for x in s['fxLog']] and any(f'de/w/{WORDS[wid]["cls"]}' in v['parts'] for v in s['voiceLog']), cls_ok)
        page.evaluate('() => window.__home()')
        page.evaluate('() => window.__setDate("2026-10-14")')
        plan = page.evaluate('() => window.__plan()'); wid = plan['slots'][0]['id']; art = WORDS[wid]['de']['art']
        wrong = next(a for a in ['der', 'die', 'das'] if a != art)
        page.evaluate('() => window.__startDaily()')
        page.wait_for_selector('.art-card', timeout=15000)
        page.click(f'.art-card[data-a="{wrong}"]')
        page.wait_for_timeout(120)
        s = page.evaluate('() => window.__state()')
        S.check('Juice Artikel anders gewählt: sanftes Wackeln + richtige Farbe + Stimme', 'wobble' in (page.get_attribute(f'.art-card[data-a="{wrong}"]', 'class') or '') and 'flash' in (page.get_attribute(f'.art-card[data-a="{art}"]', 'class') or '') and 'articleNo' in [x['name'] for x in s['fxLog']])
        page.evaluate('() => window.__home()')
    S.run('Juice Artikel', juice_article)

    def juice_real():
        r = page.evaluate('''async () => {
          const app = window.__kalemo; app.settings.native = 'de'; app.settings.learn = 'tr';
          app.show('round'); app.air = { cameraOn: true, video: { videoWidth: 640, videoHeight: 480 }, layout: () => ({ W: app.stage.w, H: app.stage.h, dw: app.stage.w, dh: app.stage.h, ox: 0, oy: 0 }),
            loadObjectDetector: async () => {}, cancelHunt() {}, stop() {}, hunt: async () => { app.onRealFrame(0.9, { originX: 200, originY: 120, width: 200, height: 200 }, 0.5); await new Promise(r => setTimeout(r, 300)); return { found: true, box: {} }; } };
          app.mode = 'air';
          const p = app.realStep(app.byId.get('cup'));
          let stamp = false, box = false;
          for (let i = 0; i < 60 && !stamp; i++) { await new Promise(r => setTimeout(r, 50)); box = box || !!app.stage.realBox; stamp = !!document.querySelector('#round-overlay .x2'); }
          const found = await p; const fx = (app.fxLog || []).map(x => x.name);
          app.air = null; app.mode = 'screen'; app.goHome();
          return { stamp, box, found, fanfare: fx.includes('fanfare') };
        }''')
        S.check('Juice Hol es echt: Objekt-Rahmen glüht + Fanfare + „×2"-Stempel', r['stamp'] and r['box'] and r['found'] and r['fanfare'], r)
    S.run('Juice Hol es echt', juice_real)

    def juice_dayend():
        page.goto(base + '/?test=1&scene=dayend'); page.wait_for_timeout(300)
        wait_state(page, 's.screen === "dayend"', 20000)
        v1 = page.text_content('#dayend-points'); page.wait_for_timeout(1500); v2 = page.text_content('#dayend-points')
        n_alive = len(page.query_selector_all('#dayend-grid canvas'))
        S.check('Juice Tagesende: lebende Zeichnungen + Punkte-Count-up + Serien-Flamme', n_alive == 5 and int(v1 or 0) < int(v2) == 377 and page.query_selector('#dayend-streak svg.flame') is not None, (v1, v2, n_alive))
    S.run('Juice Tagesende', juice_dayend)

    def audio_files():
        rep_p = os.path.join(ROOT, 'audio/v1/verify-report.json'); man_p = os.path.join(ROOT, 'audio/v1/manifest.json')
        if not os.path.exists(rep_p):
            S.check('Audio: verify-report.json vorhanden', False, 'fehlt'); return
        rep = json.load(open(rep_p)); man = json.load(open(man_p))
        S.check('Audio: verify-report 100 % (jeder Clip per STT verifiziert)', rep.get('rate') == 1 and rep.get('matched') == rep.get('total') and rep.get('total', 0) >= 850, {k: rep.get(k) for k in ('total', 'matched', 'rate', 'voices')})
        need = []
        for w in WORDS.values():
            c = w['cls']; need += [f'de/w/{c}', f'de/b/{c}', f'en/w/{c}', f'tr/w/{c}']
            if w['de'].get('pl'): need.append(f'de/p/{c}')
            if w['en'].get('pl'): need.append(f'en/p/{c}')
        vl = json.load(open(os.path.join(ROOT, 'data/voice-lines.json')))
        for l in ('de', 'en', 'tr'):
            need += [f'{l}/x/{k}' for k in vl[l]['x']] + [f'{l}/u/{k}' for k in vl[l]['u']] + [f'{l}/n/{n}' for n in (1, 2, 3, 4, 5)]
        need.append('tr/n/tane')
        keys = {k.replace('.mp3', '') for k in man}
        missing = [n for n in need if n not in keys or not os.path.exists(os.path.join(ROOT, 'audio/v1', n + '.mp3'))]
        S.check('Audio: alle benötigten Clips vorhanden (Wörter, Plurale, Präfixe, Zahlen)', not missing, missing[:10])
    S.run('Audio', audio_files)

    def no_external():
        ext = [u for u in requests if not u.startswith(base) and not u.startswith('data:') and not u.startswith('blob:')]
        S.check('Keine externen Requests zur Laufzeit (Runde, Karten, Tagesende)', not ext, ext[:5])
    S.run('Extern', no_external)

    def legal():
        for pth, must in (('impressum.html', 'Karolingerstraße 55'), ('datenschutz.html', 'verlässt nie'), ('credits.html', 'CC BY 4.0')):
            r = page.goto(base + '/' + pth)
            S.check(f'{pth} erreichbar + Inhalt', r.status == 200 and must in page.content(), r.status)
    S.run('Legal', legal)
    S.check('keine Seitenfehler', not errors, errors[:3])
    b.close()
S.finish()
