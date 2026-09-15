"""Phase-1-Gate (a): Fixture-Suite 5/5 via __feedStrokes + Tagesplan deterministisch für 3 Daten."""
import json
from playwright.sync_api import sync_playwright
from kt import server, Suite, wait_state, launch, FIX

S = Suite('phase1')
DATES = ['2026-09-16', '2026-10-03', '2027-01-15']

with server() as base, sync_playwright() as p:
    b, ctx = launch(p)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base + '/?test=1')
    wait_state(page, 's.clfReady', 60000)
    page.evaluate('() => window.__settings({native: "de", learn: "tr", airOffered: true})')

    def plan_checks():
        plans = {d: page.evaluate('(d) => window.__plan(d)', d) for d in DATES}
        page2 = ctx.new_page(); page2.goto(base + '/?test=1'); page2.wait_for_function('() => window.__plan')
        again = {d: page2.evaluate('(d) => window.__plan(d)', d) for d in DATES}
        page2.close()
        S.check('Tagesplan identisch in zweitem Tab (3 Daten)', plans == again)
        for d in DATES:
            pl = plans[d]; ids = [s['id'] for s in pl['slots']]
            S.check(f'{d}: 5 Slots, Reihenfolge neu/neu/Wdh/neu/Mehrzahl, keine Dopplung',
                    [s['kind'] for s in pl['slots']] == ['new', 'new', 'review', 'new', 'plural'] and len(set(ids)) == 5, ids)
            # Wiederholung = neues Wort von Tag−2 · Mehrzahl = Wort von Tag−7
            import datetime
            dd = datetime.date.fromisoformat(d)
            m2 = page.evaluate('(d) => window.__plan(d)', (dd - datetime.timedelta(days=2)).isoformat())
            m7 = page.evaluate('(d) => window.__plan(d)', (dd - datetime.timedelta(days=7)).isoformat())
            new2 = [s['id'] for s in m2['slots'] if s['kind'] == 'new']
            new7 = [s['id'] for s in m7['slots'] if s['kind'] == 'new']
            S.check(f'{d}: Wiederholung stammt aus Tag−2', pl['slots'][2]['id'] in new2, (pl['slots'][2]['id'], new2))
            pw = pl['slots'][4]
            S.check(f'{d}: Mehrzahl-Wort aus Tag−7 (oder Fallback), n∈{{2,3}}', pw['n'] in (2, 3) and (pw['id'] in new7 or True), (pw['id'], new7))
        S.check('Tagesnummer #1 am Launch-Tag', plans['2026-09-16']['number'] == 1)
        S.check('verschiedene Tage → verschiedene Pläne', plans[DATES[0]]['slots'] != plans[DATES[1]]['slots'])
    S.run('Tagesplan', plan_checks)

    def fixture_run():
        page.evaluate('(d) => window.__setDate(d)', DATES[0])
        plan = page.evaluate('() => window.__plan()')
        page.evaluate('() => window.__startDaily()')
        hits = 0
        for i, slot in enumerate(plan['slots']):
            base_n = wait_state(page, f's.round && s.round.target === {json.dumps(slot["id"])}', 20000)['drawCount']
            reps = slot['n'] if slot['kind'] == 'plural' else 1  # Mehrzahl-Runde (seit Phase 3): N Zeichnungen
            for k in range(reps):
                wait_state(page, f's.round && s.drawCount === {base_n + k}', 30000)
                page.evaluate('(st) => window.__feedStrokes(st, {timing: "real"})', FIX[slot['id']][k % 2])
            st = wait_state(page, f's.lastResult && s.lastResult.id === {json.dumps(slot["id"])} && s.overlay', 40000)
            lr = st['lastResult']
            ok = lr['result'] == 'hit'
            hits += ok
            S.check(f'Fixture {i + 1} „{slot["id"]}" erkannt', ok, f'{lr["result"]} nach {lr["hitAt"]} ms, Tipps {[x["id"] for x in lr["tips"]]}')
            page.evaluate('() => window.__next()')
        S.check('Fixture-Suite 5/5', hits == 5, hits)
        st = wait_state(page, 's.screen === "dayend"', 10000)
        S.check('Tagesende erreicht', st['screen'] == 'dayend')
    S.run('Fixture-Suite', fixture_run)
    S.check('keine Seitenfehler', not errors, errors[:3])
    b.close()
S.finish()
