"""Gemeinsame Test-Helfer (Python Playwright): Dev-Server, Browser, Checks, Report."""
import json, os, subprocess, sys, time, urllib.request, contextlib, traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = json.load(open(os.path.join(ROOT, 'tests/fixtures/strokes.json')))
BASE = os.environ.get('KALEMO_URL')  # gesetzt → gegen Live/andere URL testen


@contextlib.contextmanager
def server(port=8799):
    if BASE:
        yield BASE.rstrip('/')
        return
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools/serve.py'), str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html', timeout=1); break
            except Exception:
                time.sleep(0.15)
        yield f'http://127.0.0.1:{port}'
    finally:
        p.terminate(); p.wait(3)


class Suite:
    def __init__(self, name):
        self.name, self.results, self.t0 = name, [], time.time()

    def check(self, label, ok, detail=''):
        self.results.append({'check': label, 'ok': bool(ok), 'detail': detail if isinstance(detail, (str, int, float, list, dict)) else str(detail)})
        print(('  PASS ' if ok else '  FAIL ') + label + (f' — {detail}' if detail != '' else ''), flush=True)
        return ok

    def run(self, label, fn):
        try:
            fn()
        except Exception as e:
            self.check(label + ' (Ausnahme)', False, f'{type(e).__name__}: {str(e)[:300]}')
            traceback.print_exc(limit=2)

    def finish(self):
        passed = sum(r['ok'] for r in self.results)
        out = {'suite': self.name, 'passed': passed, 'total': len(self.results), 'green': passed == len(self.results) and passed > 0,
               'seconds': round(time.time() - self.t0, 1), 'when': time.strftime('%Y-%m-%d %H:%M:%S'), 'base': BASE or 'local', 'results': self.results}
        os.makedirs(os.path.join(ROOT, 'tests/reports'), exist_ok=True)
        runs = os.path.join(ROOT, 'tests/reports', f'{self.name}.jsonl')
        with open(runs, 'a') as f:
            f.write(json.dumps({k: v for k, v in out.items()}, ensure_ascii=False) + '\n')
        print(f'{self.name}: {passed}/{len(self.results)} {"GRÜN" if out["green"] else "ROT"} ({out["seconds"]} s)')
        return out


def wait_state(page, pred_js, timeout=30000):
    page.wait_for_function(f'() => {{ const s = window.__state && window.__state(); return s && ({pred_js}); }}', timeout=timeout)
    return page.evaluate('() => window.__state()')


def launch(p, mobile=False, **kw):
    args = ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] + kw.pop('args', [])
    b = p.chromium.launch(headless=True, args=args)
    if mobile:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', **kw)
    else:
        ctx = b.new_context(viewport={'width': 1280, 'height': 800}, **kw)
    return b, ctx
