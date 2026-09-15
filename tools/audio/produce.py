#!/usr/bin/env python3
"""Kalemo Sprach-Clips — Produktion + Verifikation (fortsetzbar).

Ablauf je Clip-Gruppe (Sprache × Stil):
  Runde B  Bündel (≤20 Einträge, ~1-s-Pausen) → silencedetect → Segmentzahl muss exakt stimmen,
           sonst Bündel halbieren + anderes Prompt-Format, neu erzeugen (bis 3 Einträge).
  Runde S  Fehlschläge einzeln („exakt dieses Wort, nichts davor/danach“), dann Trägersatz + Schnitt,
           abwechselnd, bis MAX_ATTEMPTS.
Jeder Kandidat: Schnitt (~40 ms Rand) → −16 LUFS / ≤ −1 dBTP / MP3 mono 48 kbps → blinde STT
(Zweitlesung mit umgekehrter Teil-Reihenfolge nur bei Fehlschlag) → Vergleich mit Normalisierung.
Nur verifizierte Clips landen in audio/v1/; Stand in work/state.json.

  python3 produce.py            # produzieren/fortsetzen
  python3 produce.py --report   # nur verify-report.json + manifest.json schreiben
"""
import math
import os
import re
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

from common import (AUDIO, WORK, RAW, SR, BUDGET_GUARD, TTS_MODEL, STT_MODEL, USD_EUR, PRICE, AUDIO_TOK_PER_S,
                    NORMALIZATION_RULES, QuotaExhausted, log, tts, stt, save_flac, segment, silences,
                    speech_intervals, cut, render, compare, bundle_prompt, single_prompt, carrier_texts,
                    load_inventory, load_json, save_json, usage_summary, budget_check, now_iso, frames_db)

VOICE = {'de': 'Kore', 'en': 'Aoede', 'tr': 'Laomedeia'}
# Prompt-Formate je (Sprache, Stil): erstes = Standard, weitere = Ausweichformat beim Neuerzeugen
FORMATS = {('de', 'neutral'): ['ellipsis', 'lines'],
           ('en', 'neutral'): ['lines', 'ellipsis'],
           ('tr', 'neutral'): ['lines', 'ellipsis']}
LINE_FORMATS = ['lines']                 # KI-Präfixe tragen selbst „…“ → nur Zeilenformat
SEC_PER_ENTRY = {'de': 2.0, 'en': 1.7, 'tr': 3.0}   # aus dem Stimmentest (Schätzung für Budget)
BUNDLE_MAX = 20
MIN_SPLIT = 3
MAX_ATTEMPTS = 12
# Nur für Einzel-Neuversuche: Aussprache-Schreibung (TTS-Eingabe) bzw. Hinweis; der Erwartungstext bleibt das Original.
TTS_TEXT = {
    'tr/x/hard.mp3': 'Hımm, zor …',      # „Hmm“ wurde von der TR-Stimme 6× verschluckt → türkische Schreibung
}
# (de/x/hit2 „Jetzt hab ich’s!“: 12 Versuche inkl. Hinweis + „hab’“ ergaben stets „habe“ → Text vom
#  Build-Orchestrator auf „Jetzt habe ich’s!“ geändert, Hinweise entfernt)
TTS_HINT = {
    'tr/x/hard.mp3': 'önce düşünür gibi uzun bir „hımm“ sesi, sonra „zor“',
}
SINGLE_SECONDS = 1.3   # gemessen (en-p, 147 Einzelanfragen): Ø 1,27 s Audio ≈ 0,0003 €/Anfrage
# Trägersatz-Neuversuche ab Etappe de-w abgeschaltet: Ø 8,6 s Audio (≈ 7× Einzelanfrage), in en-p ein
# Drittel der Etappenkosten bei 3 von 16 Treffern — mit dem Rest-Budget nicht vertretbar.
USE_CARRIER = '--carrier' in sys.argv
# --rounds N: höchstens N Einzelrunden je Lauf (erst alle Erstversuche, Neuversuche in eigener Etappe,
# damit ein Budget-Stopp möglichst viele Clips abgedeckt zurücklässt)
MAX_ROUNDS = int(sys.argv[sys.argv.index('--rounds') + 1]) if '--rounds' in sys.argv else 99
REBUNDLE = int(sys.argv[sys.argv.index('--rebundle') + 1]) if '--rebundle' in sys.argv else 0
DAY_CAP_EUR = 1.00
SAFETY_EUR = 0.02

STATE_FILE = f'{WORK}/state.json'
CAND = f'{WORK}/cand'
REPORT = f'{AUDIO}/verify-report.json'
MANIFEST = f'{AUDIO}/manifest.json'

_state_lock = threading.Lock()
_stop = threading.Event()
_stop_reason = []
_bid_lock = threading.Lock()
_bid = [0]


class BudgetStop(Exception):
    pass


# ---------------------------------------------------------------- budget
def day_recorded_eur():
    """Heute bereits im Studio-Kostenlog verbuchte Audio-Kosten (z. B. Musik)."""
    p = subprocess.run(['node', BUDGET_GUARD, 'status'], capture_output=True, text=True)
    m = re.search(r'^audio\s+([\d.]+)/([\d.]+)', p.stdout, re.M)
    return float(m.group(1)) if m else 0.0


DAY_BASE = None


RECORDED_FILE = f'{WORK}/budget-recorded.json'


def unrecorded_eur():
    """Pipeline-Kosten aus usage.jsonl, die noch nicht per budget-guard record verbucht sind."""
    return usage_summary()['eur'] - load_json(RECORDED_FILE, {'recorded_eur': 0.0})['recorded_eur']


def guard(est_eur):
    """Interner Harddeckel: verbucht (Studio) + unverbucht (usage.jsonl) + Schätzung ≤ Cap − Reserve."""
    open_eur = unrecorded_eur()
    if DAY_BASE + open_eur + est_eur > DAY_CAP_EUR - SAFETY_EUR:
        raise BudgetStop(f'Tages-Cap Audio: verbucht {DAY_BASE:.2f} € + unverbucht {open_eur:.3f} € + '
                         f'nächster Aufruf ~{est_eur:.3f} € > {DAY_CAP_EUR - SAFETY_EUR:.2f} €')


def tts_eur(seconds):
    return seconds * AUDIO_TOK_PER_S * PRICE['tts_audio_out'] / 1e6 * USD_EUR


# ---------------------------------------------------------------- state
def load_state(inventory):
    st = load_json(STATE_FILE, {'clips': {}})
    for c in inventory:
        rec = st['clips'].get(c['file'])
        if rec and rec.get('expected') != c['expected']:
            log(f"Text geändert: {c['file']} „{rec.get('expected')}“ → „{c['expected']}“ — Clip wird neu erzeugt")
            if os.path.exists(f"{AUDIO}/{c['file']}"):
                os.remove(f"{AUDIO}/{c['file']}")
            rec = {'previous': {k: v for k, v in rec.items() if k != 'previous'}}
            st['clips'][c['file']] = rec
        if not rec:
            rec = st['clips'][c['file']] = {}
        rec.setdefault('attempts', [])
        rec.update({'lang': c['lang'], 'expected': c['expected'], 'group': c['group'], 'style': c['style']})
        rec.setdefault('status', 'pending')
        if rec['status'] == 'ok' and not os.path.exists(f"{AUDIO}/{c['file']}"):
            rec['status'] = 'pending'
    return st


def save_state(st):
    with _state_lock:
        save_json(STATE_FILE, st)


# ---------------------------------------------------------------- verify one candidate
def judge(data, c):
    """Lesung 1 passt → verifiziert. Sonst Lesung 2; passt die, entscheidet Lesung 3 (Mehrheit 2 von 3).
    Alle Lesungen blind."""
    f, lang = c['file'], c['lang']
    reads = [stt(data, lang, f'verify-{f}')]
    ok, rule = compare(c['expected'], reads[0], lang)
    if ok:
        return True, rule, reads
    reads.append(stt(data, lang, f'verify-{f}', variant=1))
    ok1, rule1 = compare(c['expected'], reads[1], lang)
    if not ok1:
        return False, None, reads
    reads.append(stt(data, lang, f'verify-{f}', variant=2))
    ok2, _ = compare(c['expected'], reads[2], lang)
    return (True, f'{rule1}+mehrheit-2/3', reads) if ok2 else (False, None, reads)


def reverify(st, only=None):
    """Nur STT (keine TTS): Fehlschläge mit vorhandenem Kandidaten und Zweitlesungs-Treffer nach
    geänderter Prüfregel erneut bewerten."""
    inv = {c['file']: c for c in load_inventory()}
    todo = []
    for f, rec in st['clips'].items():
        c = inv.get(f)
        if not c or (only and not any(c['group'] == g or c['group'].startswith(g + '-') for g in only)):
            continue
        if rec['status'] == 'fail' and os.path.exists(f'{CAND}/{f}'):
            todo.append((c, f'{CAND}/{f}'))
        elif rec['status'] == 'ok' and 'zweitlesung' in (rec.get('matchRule') or ''):
            todo.append((c, f'{AUDIO}/{f}'))

    def one(item):
        c, path = item
        with open(path, 'rb') as fh:
            data = fh.read()
        ok, rule, reads = judge(data, c)
        f = c['file']
        with _state_lock:
            rec = st['clips'][f]
            last = rec['attempts'][-1] if rec['attempts'] else {}
            last.setdefault('reverify', []).append({'transcripts': reads, 'match': ok, 'rule': rule})
            rec['transcript'] = reads[-1]
            if ok:
                if path != f'{AUDIO}/{f}':
                    os.makedirs(os.path.dirname(f'{AUDIO}/{f}'), exist_ok=True)
                    os.replace(path, f'{AUDIO}/{f}')
                rec.update({'status': 'ok', 'matchRule': rule})
            else:
                if path == f'{AUDIO}/{f}':
                    os.makedirs(os.path.dirname(f'{CAND}/{f}'), exist_ok=True)
                    os.replace(path, f'{CAND}/{f}')
                rec.update({'status': 'fail', 'matchRule': None})
        save_state(st)
        log(f"  reverify {'OK ' if ok else 'XX '}{f:26s} „{c['expected']}“ → {reads}")

    with ThreadPoolExecutor(3) as ex:
        list(ex.map(one, todo))


def retrim(st, only=None):
    """Einzel-Clips, die vor der trim_single-Korrektur (d=0,3 → 0,05) entstanden sind, aus dem Roh-FLAC
    neu schneiden (nur Stille fällt weg), neu rendern und erneut blind prüfen. Fällt die Prüfung durch,
    bleibt der bisherige verifizierte Clip stehen (im State vermerkt)."""
    from common import load_pcm
    inv = {c['file']: c for c in load_inventory()}
    todo = []
    for f, rec in st['clips'].items():
        c = inv.get(f)
        if not c or rec['status'] != 'ok' or not (rec.get('method') or '').startswith('single:'):
            continue
        if only and not any(c['group'] == g or c['group'].startswith(g + '-') for g in only):
            continue
        raw = f"{RAW}/{rec['method'].split(':', 1)[1]}.flac"
        if not os.path.exists(raw):
            continue
        pcm = load_pcm(raw)
        clip = trim_single(pcm)
        if clip is None:
            continue
        if rec['durationMs'] - len(clip) / 2 / SR * 1000 > 60:
            todo.append((c, clip))
    log(f'retrim: {len(todo)} Clips mit Vorlauf/Nachlauf-Stille > 60 ms')

    def one(item):
        c, clip = item
        f = c['file']
        try:
            guard(0.00025)
        except BudgetStop as e:
            log(f'  retrim übersprungen {f}: {e}')
            return
        tmp = f'{CAND}/retrim/{f}'
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        info = render(clip, tmp)
        with open(tmp, 'rb') as fh:
            data = fh.read()
        ok, rule, reads = judge(data, c)
        with _state_lock:
            rec = st['clips'][f]
            rec.setdefault('retrim', []).append({'transcripts': reads, 'match': ok, 'rule': rule,
                                                 'durationMsBefore': rec['durationMs'], 'durationMs': info['durationMs']})
            if ok:
                os.replace(tmp, f'{AUDIO}/{f}')
                rec.update({'transcript': reads[-1], 'matchRule': rule, 'durationMs': info['durationMs'],
                            'lufs': info['lufs'], 'truePeak': info['truePeak']})
        save_state(st)
        log(f"  retrim {'OK ' if ok else 'XX '}{f:26s} {rec['retrim'][-1]['durationMsBefore']}→{info['durationMs']} ms {reads}")

    with ThreadPoolExecutor(3) as ex:
        list(ex.map(one, todo))


def source_cut(rec):
    """Rekonstruiert den ursprünglichen Schnitt eines Clips aus dem Roh-FLAC (für Neu-Rendern ohne neue TTS).
    Einzelclips wurden je nach Lauf mit unterschiedlichen Trim-Regeln geschnitten → die Regel, deren
    Länge zur gespeicherten Clipdauer passt (±30 ms = ~1 MP3-Frame), gewinnt."""
    from common import load_pcm
    kind, rest = rec['method'].split(':', 1)
    bid = rest.split('#')[0]
    raw = f'{RAW}/{bid}.flac'
    if not os.path.exists(raw):
        return None
    pcm = load_pcm(raw)
    total = len(pcm) / 2 / SR
    cands = []
    if kind == 'bundle':
        i, n = [int(x) for x in rest.split('#')[1].split('/')]
        segs, _ = segment(pcm, n)
        if segs:
            cands.append(cut(pcm, segs[i - 1]))
    elif kind == 'carrier':
        segs, _ = segment(pcm, 3)
        if segs:
            cands.append(cut(pcm, segs[1]))
    else:
        cands.append(trim_single(pcm))
        for noise, d in ((-45, 0.3), (-45, 0.05), (-55, 0.05)):
            iv = [s for s in speech_intervals(total, *silences(pcm, noise, d)) if s[1] - s[0] >= 0.07]
            if iv:
                cands.append(cut(pcm, (iv[0][0], iv[-1][1])))
    cands = [c for c in cands if c]
    if not cands:
        return None
    best = min(cands, key=lambda c: abs(len(c) / 2 / SR * 1000 - rec['durationMs']))
    return best if abs(len(best) / 2 / SR * 1000 - rec['durationMs']) <= 30 else None


def rerender(st):
    """Clips mit Lautheit < −17 LUFS oder True Peak > −1 dBTP aus dem rekonstruierten Schnitt mit dem
    verbesserten render() neu erzeugen und erneut blind prüfen; nur bei Treffer ersetzen."""
    inv = {c['file']: c for c in load_inventory()}
    todo = [(inv[f], rec) for f, rec in st['clips'].items()
            if f in inv and rec['status'] == 'ok' and (rec['lufs'] < -17.0 or rec['truePeak'] > -1.0)]
    log(f'rerender: {len(todo)} Clips')

    def one(item):
        c, rec = item
        f = c['file']
        pcm = source_cut(rec)
        if pcm is None:
            log(f'  rerender ?? {f}: Schnitt nicht rekonstruierbar')
            return
        try:
            guard(0.00025)
        except BudgetStop as e:
            log(f'  rerender übersprungen {f}: {e}')
            return
        tmp = f'{CAND}/rerender/{f}'
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        info = render(pcm, tmp)
        with open(tmp, 'rb') as fh:
            data = fh.read()
        ok, rule, reads = judge(data, c)
        better = info['truePeak'] <= -1.0 and abs(info['lufs'] + 16) < abs(rec['lufs'] + 16)
        with _state_lock:
            rec.setdefault('rerender', []).append({'transcripts': reads, 'match': ok, 'rule': rule, 'before': {
                'lufs': rec['lufs'], 'truePeak': rec['truePeak']}, 'after': {'lufs': info['lufs'], 'truePeak': info['truePeak']}})
            if ok and better:
                os.replace(tmp, f'{AUDIO}/{f}')
                rec.update({'transcript': reads[-1], 'matchRule': rule, 'durationMs': info['durationMs'],
                            'lufs': info['lufs'], 'truePeak': info['truePeak']})
        save_state(st)
        log(f"  rerender {'OK ' if ok and better else 'XX '}{f:26s} {rec['rerender'][-1]['before']} → "
            f"{info['lufs']}/{info['truePeak']} {reads}")

    with ThreadPoolExecutor(3) as ex:
        list(ex.map(one, todo))


def verify(st, c, pcm, method):
    f = c['file']
    lang = c['lang']
    tmp = f'{CAND}/{f}'
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    info = render(pcm, tmp)
    with open(tmp, 'rb') as fh:
        data = fh.read()
    ok, rule, reads = judge(data, c)
    with _state_lock:
        rec = st['clips'][f]
        n = len(rec['attempts']) + 1
        rec['attempts'].append({'n': n, 'method': method, 'transcripts': reads, 'match': ok, 'rule': rule,
                                'durationMs': info['durationMs'], 'lufs': info['lufs'], 'truePeak': info['truePeak']})
        rec.update({'transcript': reads[-1], 'durationMs': info['durationMs'], 'lufs': info['lufs'],
                    'truePeak': info['truePeak'], 'voice': VOICE[lang], 'method': method})
        if ok:
            dst = f'{AUDIO}/{f}'
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            os.replace(tmp, dst)
            rec.update({'status': 'ok', 'matchRule': rule})
        else:
            rec.update({'status': 'fail', 'matchRule': None})
    save_state(st)
    mark = 'OK ' if ok else 'XX '
    log(f"  {mark}{f:26s} „{c['expected']}“ → {reads} ({method})")
    return ok


RUN_ID = __import__('time').strftime('%H%M%S')


def next_bid(prefix):
    with _bid_lock:
        _bid[0] += 1
        return f'{prefix}-{RUN_ID}-{_bid[0]:04d}'


# ---------------------------------------------------------------- bundle job
def bundle_job(st, clips, fmt_idx):
    """→ (Clips für neue kleinere Bündel | None, fmt_idx, Fehlschläge für Einzelrunde)."""
    if _stop.is_set():
        return None, fmt_idx, []
    lang, style = clips[0]['lang'], clips[0]['style']
    fmts = FORMATS.get((lang, style), LINE_FORMATS)
    fmt = fmts[fmt_idx % len(fmts)]
    n = len(clips)
    bid = next_bid(f'{lang}-{clips[0]["group"]}-b{n}-{fmt}')
    try:
        guard(tts_eur(n * SEC_PER_ENTRY[lang] * 1.5))
        pcm = tts(bundle_prompt(lang, style, [c['text'] for c in clips], fmt), VOICE[lang], bid,
                  min_seconds=0.35 * n, max_seconds=n * 4.0 + 6, tries=1)
    except (BudgetStop, QuotaExhausted) as e:
        _stop.set()
        _stop_reason.append(str(e))
        return None, fmt_idx, []
    except RuntimeError as e:
        log(f'  Bündel {bid}: {str(e)[:160]}')
        pcm = None
    segs = None
    if pcm:
        save_flac(pcm, f'{RAW}/{bid}.flac')
        segs, params = segment(pcm, n)
    if not segs:
        log(f'  Bündel {bid}: Segmentzahl ≠ {n} ({(len(pcm) / 2 / SR) if pcm else 0:.1f} s) → verkleinern/neu')
        with _state_lock:
            for c in clips:
                st['clips'][c['file']].setdefault('bundleRejects', []).append(bid)
        save_state(st)
        if n > MIN_SPLIT:
            return clips, fmt_idx + 1, []
        return None, fmt_idx, clips
    fails = []
    for i, (c, seg) in enumerate(zip(clips, segs)):
        if _stop.is_set():
            break
        try:
            if not verify(st, c, cut(pcm, seg), f'bundle:{bid}#{i + 1}/{n}'):
                fails.append(c)
        except QuotaExhausted as e:
            _stop.set()
            _stop_reason.append(str(e))
    return None, fmt_idx, fails


# ---------------------------------------------------------------- single / carrier job
def trim_single(pcm):
    """Stille vorn/hinten weg (~40 ms Rand). d=0,05 s, damit auch die ~0,2–0,3 s Vorlauf-Stille der
    Einzelanfragen erkannt wird (mit d=0,3 blieb sie stehen); Mini-Intervalle < 70 ms (Klicks) zählen nicht."""
    # Anfang: −45 dB (bei −55 dB zählten TTS-Störblips im Vorlauf als Sprache, +100–380 ms).
    # Ende: −45 dB, dann Ausklang bis max. 150 ms verlängern, solange Frames > −55 dB
    # (bei „die Gitarre“ schnitt reines −45 dB das leise End-e an). Diagnose 15.09.
    total = len(pcm) / 2 / SR
    iv = [s for s in speech_intervals(total, *silences(pcm, -45, 0.05)) if s[1] - s[0] >= 0.07]
    if not iv:
        return None
    db = frames_db(pcm)
    end_i = int(iv[-1][1] / 0.010)
    k = 0
    while end_i + k < len(db) and k < 15 and db[end_i + k] > -55:
        k += 1
    return cut(pcm, (iv[0][0], min(total, iv[-1][1] + k * 0.010)))


def single_job(st, c):
    if _stop.is_set():
        return False
    lang, style, f = c['lang'], c['style'], c['file']
    k = sum(1 for a in st['clips'][f]['attempts'] if a['method'].startswith(('single', 'carrier')))
    # erst einzeln, dann abwechselnd Trägersatz/einzeln; Clips mit Aussprache-Hinweis immer einzeln
    carrier = USE_CARRIER and k % 2 == 1 and f not in TTS_HINT and f not in TTS_TEXT
    kind = 'carrier' if carrier else 'single'
    bid = next_bid(f"{lang}-{kind}-{os.path.basename(f)[:-4]}")
    try:
        if carrier:
            texts = [t.rstrip(':') for t in carrier_texts(lang, c['text'])]
            guard(tts_eur(12 * 1.5))
            pcm = tts(bundle_prompt(lang, style, texts, 'lines'), VOICE[lang], bid, min_seconds=1.0, max_seconds=16, tries=1)
            save_flac(pcm, f'{RAW}/{bid}.flac')
            segs, _ = segment(pcm, 3)
            clip = cut(pcm, segs[1]) if segs else None
        else:
            guard(tts_eur(6 * 1.5))
            pcm = tts(single_prompt(lang, style, TTS_TEXT.get(f, c['text']), TTS_HINT.get(f)), VOICE[lang], bid,
                      min_seconds=0.25, max_seconds=10, tries=1)
            save_flac(pcm, f'{RAW}/{bid}.flac')
            clip = trim_single(pcm)
    except (BudgetStop, QuotaExhausted) as e:
        _stop.set()
        _stop_reason.append(str(e))
        return False
    except RuntimeError as e:
        log(f'  {bid}: {str(e)[:160]}')
        clip = None
    if clip is None:
        with _state_lock:
            rec = st['clips'][f]
            rec['attempts'].append({'n': len(rec['attempts']) + 1, 'method': f'{kind}:{bid}', 'transcripts': [],
                                    'match': False, 'rule': None, 'error': 'kein/zu wenig Audio oder Schnitt unmöglich'})
        save_state(st)
        return False
    try:
        return verify(st, c, clip, f'{kind}:{bid}')
    except QuotaExhausted as e:
        _stop.set()
        _stop_reason.append(str(e))
        return False


# ---------------------------------------------------------------- orchestration
def chunks(items, size):
    k = max(1, math.ceil(len(items) / size))
    q, r = divmod(len(items), k)          # gleichmäßig: 153 → 8 × 19/20
    out, i = [], 0
    for j in range(k):
        n = q + (1 if j < r else 0)
        out.append(items[i:i + n])
        i += n
    return out


def produce(only=None, single_mode=False):
    """single_mode: Bündelrunde überspringen, jeder Clip als Einzelanfrage. Grund (Messung Etappe en-w,
    15.09.): Bündel mit ~1-s-Pausenanweisung kamen auf 72–84 s Audio je 19 Einträge (≈3–4 s bezahlte
    Pause je Eintrag, ~0,0009 €/Clip) — Einzelclips ≈0,0002 €/Clip. Mit Bündeln hätte der Rest das
    Tages-Cap Audio (1 €) überschritten."""
    global DAY_BASE
    os.makedirs(CAND, exist_ok=True)
    inv = load_inventory()
    st = load_state(inv)
    save_state(st)
    DAY_BASE = day_recorded_eur()
    pending = [c for c in inv if st['clips'][c['file']]['status'] != 'ok'
               and (not only or any(c['group'] == g or c['group'].startswith(g + '-') for g in only))]
    if single_mode:
        est = (tts_eur(SINGLE_SECONDS) + 0.0001) * len(pending) * 1.3
    else:
        est = sum(tts_eur(SEC_PER_ENTRY[c['lang']]) for c in pending) * 1.3 + len(pending) * 0.0001
    open_eur = unrecorded_eur()
    log(f'Etappe {only or "alle"} ({"einzeln" if single_mode else "Bündel"}) · Inventar {len(inv)} · offen {len(pending)} · '
        f'unverbucht {open_eur:.3f} € · verbucht heute {DAY_BASE:.2f} € · Schätzung Etappe {est:.3f} €')
    if pending and not budget_check(open_eur + est):
        _stop_reason.append('budget-guard check audio → exit 1 (Cap erreicht)')
        return st

    # Runde B: Bündel (bzw. mit --rebundle N: Fehlschläge in kleinen Bündeln neu — Listenkontext
    # artikuliert besser als Einzelwort-Anfragen, siehe Protokoll)
    if REBUNDLE:
        fresh = [c for c in pending if st['clips'][c['file']]['status'] == 'fail'
                 and len(st['clips'][c['file']]['attempts']) < MAX_ATTEMPTS]
    else:
        fresh = [] if single_mode else [c for c in pending if not st['clips'][c['file']]['attempts']]
    groups = {}
    for c in fresh:
        groups.setdefault(c['group'], []).append(c)
    singles = [c for c in pending if c not in fresh]
    with ThreadPoolExecutor(3) as ex:
        futs = [ex.submit(bundle_job, st, ch, 0) for g in groups.values() for ch in chunks(g, REBUNDLE or BUNDLE_MAX)]
        while futs:
            done = [f for f in futs if f.done()]
            if not done:
                _wait_any(futs)
                continue
            for f in done:
                futs.remove(f)
                resplit, fmt_idx, fails = f.result()
                singles.extend(fails)
                if resplit and not _stop.is_set():
                    half = math.ceil(len(resplit) / 2)
                    for part in (resplit[:half], resplit[half:]):
                        futs.append(ex.submit(bundle_job, st, part, fmt_idx))
    log(f'Runde B fertig · Fehlschläge für Einzelrunde: {len(singles)}')

    # Runde S: einzeln / Trägersatz
    rnd = 0
    while singles and not _stop.is_set() and rnd < MAX_ROUNDS:
        rnd += 1
        todo = [c for c in singles if st['clips'][c['file']]['status'] != 'ok'
                and len(st['clips'][c['file']]['attempts']) < MAX_ATTEMPTS]
        if not todo:
            break
        log(f'Runde S{rnd}: {len(todo)} Clips')
        with ThreadPoolExecutor(3) as ex:
            list(ex.map(lambda c: single_job(st, c), todo))
        singles = todo
    return st


def _wait_any(futs):
    import concurrent.futures as cf
    cf.wait(futs, return_when=cf.FIRST_COMPLETED)


# ---------------------------------------------------------------- report
def write_report(st):
    inv = load_inventory()
    clips, manifest = [], {}
    for c in inv:
        rec = st['clips'].get(c['file'], {})
        ok = rec.get('status') == 'ok' and os.path.exists(f"{AUDIO}/{c['file']}")
        clips.append({'file': c['file'], 'lang': c['lang'], 'expected': c['expected'],
                      'transcript': rec.get('transcript'), 'match': ok, 'attempts': len(rec.get('attempts', [])),
                      'durationMs': rec.get('durationMs') if ok else None, 'lufs': rec.get('lufs') if ok else None,
                      'truePeak': rec.get('truePeak') if ok else None, 'matchRule': rec.get('matchRule') if ok else None,
                      'method': rec.get('method')})
        if ok:
            manifest[c['file']] = rec['durationMs']
    matched = sum(1 for x in clips if x['match'])
    report = {
        'generated': now_iso(),
        'model': TTS_MODEL,
        'sttModel': STT_MODEL,
        'voices': VOICE,
        'normalization': NORMALIZATION_RULES,
        'verification': ('Blinde STT je finalem MP3 (dekodiert, 0,4 s Stille-Polster, WAV inline); Erwartungstext wird '
                         'dem Modell nie gezeigt. Bei Fehlschlag eine Zweitlesung mit umgekehrter Teil-Reihenfolge '
                         '(matchRule „…+zweitlesung“). DE-Wortclips: Artikel muss als eigenes Token übereinstimmen.'),
        'total': len(clips),
        'matched': matched,
        'rate': round(matched / len(clips), 4) if clips else 0,
        'clips': clips,
    }
    save_json(MANIFEST, manifest)
    save_json(REPORT, report)
    log(f'Report: {matched}/{len(clips)} verifiziert ({report["rate"] * 100:.1f} %) → {REPORT}')
    return report


if __name__ == '__main__':
    if '--report' in sys.argv:
        write_report(load_state(load_inventory()))
        sys.exit(0)
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1].split(',')
    if '--rerender' in sys.argv:
        st0 = load_state(load_inventory())
        DAY_BASE = day_recorded_eur()
        rerender(st0)
        sys.exit(0)
    if '--retrim' in sys.argv:
        st0 = load_state(load_inventory())
        DAY_BASE = day_recorded_eur()
        retrim(st0, only)
        sys.exit(0)
    if '--reverify' in sys.argv:
        st0 = load_state(load_inventory())
        reverify(st0, only)
        log(f"reverify fertig · offen {sum(1 for r in st0['clips'].values() if r['status'] != 'ok')}")
        sys.exit(0)
    state = produce(only, single_mode='--single' in sys.argv)
    u = usage_summary()
    left = [f for f, r in state['clips'].items() if r['status'] != 'ok']
    log(f"ENDE Etappe {only or 'alle'} · offen gesamt {len(left)} · Kosten Pipeline gesamt {u['eur']:.4f} € "
        f"(TTS {u['tts_calls']} Aufrufe {u['tts_eur']:.4f} €, STT {u['stt_calls']} Aufrufe {u['stt_eur']:.4f} €)")
    if _stop_reason:
        log(f'STOPP: {_stop_reason[0][:400]}')
    # Report bewusst separat (--report), damit wartende Prozesse erst den Endstand sehen
