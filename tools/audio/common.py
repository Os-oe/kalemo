#!/usr/bin/env python3
"""Kalemo audio pipeline — shared helpers.

Nur Python-Standardbibliothek + ffmpeg. Der API-Key wird aus der Studio-.env
gelesen, nur als HTTP-Header gesendet und nie ausgegeben.
"""
import base64
import json
import math
import os
import re
import subprocess
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from array import array
from datetime import datetime, timezone

REPO = '/Users/Osman/Desktop/APPS/kalemo'
AUDIO = f'{REPO}/audio/v1'
TOOLS = f'{REPO}/tools/audio'
WORK = f'{TOOLS}/work'
RAW = f'{WORK}/raw'
ENV_FILE = '/Users/Osman/Desktop/APPS/agent-studio/.env'
BUDGET_GUARD = '/Users/Osman/Desktop/APPS/agent-studio/commandcenter/scripts/lib/budget-guard.js'

API = 'https://generativelanguage.googleapis.com/v1beta/models'
TTS_MODEL = 'gemini-2.5-flash-preview-tts'
STT_MODEL = 'gemini-2.5-flash'
SR = 24000
FFMPEG = 'ffmpeg'

# Preise in US$ je 1 Mio. Tokens (Vorgabe Konzept; STT-Text-/Ausgabe = Listenpreis gemini-2.5-flash)
USD_EUR = 0.92
PRICE = {
    'tts_text_in': 0.50,
    'tts_audio_out': 10.0,
    'stt_audio_in': 1.0,
    'stt_text_in': 0.30,
    'stt_out': 2.50,
}

TARGET_LUFS = -16.0
TP_MAX = -1.0
MARGIN_S = 0.040

os.makedirs(RAW, exist_ok=True)

_log_lock = threading.Lock()


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def log(msg):
    line = f'[{datetime.now().strftime("%H:%M:%S")}] {msg}'
    with _log_lock:
        print(line, flush=True)
        with open(f'{WORK}/run.log', 'a', encoding='utf-8') as f:
            f.write(line + '\n')


# ---------------------------------------------------------------- API key / HTTP
_key = None


def api_key():
    global _key
    if _key is None:
        with open(ENV_FILE, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('GOOGLE_AI_STUDIO_KEY='):
                    v = line.split('=', 1)[1].strip()
                    if len(v) >= 2 and v[0] in '"\'' and v[-1] == v[0]:
                        v = v[1:-1]
                    _key = v
        if not _key:
            raise SystemExit('GOOGLE_AI_STUDIO_KEY fehlt in .env')
    return _key


class QuotaExhausted(Exception):
    pass


_http_sem = threading.BoundedSemaphore(3)   # höchstens 3 parallele Anfragen


def post_json(model, body, timeout=240, max_tries=8):
    url = f'{API}/{model}:generateContent'
    data = json.dumps(body).encode('utf-8')
    delay = 5
    last = ''
    for attempt in range(max_tries):
        req = urllib.request.Request(url, data=data, method='POST', headers={
            'Content-Type': 'application/json', 'x-goog-api-key': api_key()})
        try:
            with _http_sem:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return json.load(r)
        except urllib.error.HTTPError as e:
            txt = e.read().decode('utf-8', 'replace')[:1500]
            last = f'HTTP {e.code}: {txt}'
            if e.code == 429:
                if re.search(r'PerDay|per day', txt, re.I):
                    raise QuotaExhausted(last[:600])
                m = re.search(r'"retryDelay":\s*"(\d+)(?:\.\d+)?s"', txt)
                wait = max(delay, int(m.group(1)) + 2) if m else delay
            elif e.code in (500, 502, 503, 504):
                wait = delay
            else:
                raise RuntimeError(last[:600])
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            last = f'net: {e}'
            wait = delay
        log(f'  backoff {attempt + 1}/{max_tries}: warte {wait}s ({last[:140]!r})')
        time.sleep(wait)
        delay = min(delay * 2, 120)
    raise RuntimeError(f'aufgegeben: {last[:600]}')


# ---------------------------------------------------------------- usage / cost
_usage_lock = threading.Lock()
USAGE_FILE = f'{WORK}/usage.jsonl'


def _mod(details, modality):
    return sum(d.get('tokenCount', 0) for d in (details or []) if d.get('modality') == modality)


def record_usage(kind, model, um, tag, extra=None):
    um = um or {}
    prompt = um.get('promptTokenCount', 0)
    cand = um.get('candidatesTokenCount', 0)
    thoughts = um.get('thoughtsTokenCount', 0)
    if kind == 'tts':
        audio_out = _mod(um.get('candidatesTokensDetails'), 'AUDIO') or cand
        usd = prompt * PRICE['tts_text_in'] / 1e6 + audio_out * PRICE['tts_audio_out'] / 1e6
        rec = {'text_in': prompt, 'audio_out': audio_out}
    else:
        audio_in = _mod(um.get('promptTokensDetails'), 'AUDIO')
        text_in = prompt - audio_in
        out = cand + thoughts
        usd = (audio_in * PRICE['stt_audio_in'] + text_in * PRICE['stt_text_in'] + out * PRICE['stt_out']) / 1e6
        rec = {'audio_in': audio_in, 'text_in': text_in, 'out': out}
    rec.update({'ts': now_iso(), 'kind': kind, 'model': model, 'tag': tag,
                'usd': round(usd, 8), 'eur': round(usd * USD_EUR, 8)})
    if extra:
        rec.update(extra)
    with _usage_lock:
        with open(USAGE_FILE, 'a', encoding='utf-8') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    return rec


def usage_summary():
    tot = {'eur': 0.0, 'usd': 0.0, 'tts_calls': 0, 'stt_calls': 0, 'tts_eur': 0.0, 'stt_eur': 0.0,
           'audio_out_tokens': 0, 'audio_in_tokens': 0}
    if not os.path.exists(USAGE_FILE):
        return tot
    with open(USAGE_FILE, encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            tot['eur'] += r['eur']
            tot['usd'] += r['usd']
            tot[f"{r['kind']}_calls"] += 1
            tot[f"{r['kind']}_eur"] += r['eur']
            tot['audio_out_tokens'] += r.get('audio_out', 0)
            tot['audio_in_tokens'] += r.get('audio_in', 0)
    return tot


def budget_check(estimate_eur):
    p = subprocess.run(['node', BUDGET_GUARD, 'check', 'audio', f'{estimate_eur:.3f}'],
                       capture_output=True, text=True)
    log(f'budget-guard check audio {estimate_eur:.3f} → exit {p.returncode} {p.stdout.strip()} {p.stderr.strip()}')
    return p.returncode == 0


# ---------------------------------------------------------------- Gemini TTS / STT
AUDIO_TOK_PER_S = 25


def tts(prompt, voice, tag, min_seconds=0.0, max_seconds=60.0, tries=4):
    """max_seconds wird als maxOutputTokens (25 Audio-Tokens/s) erzwungen — Schutz vor
    Endlos-Ausgaben (Diagnose 15.09.: ein Test-Bündel lief auf 655 s = 0,15 € aus)."""
    body = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'maxOutputTokens': int(max_seconds * AUDIO_TOK_PER_S),
            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}},
        },
    }
    paid, text400 = 0, 0
    while paid < tries:
        try:
            d = post_json(TTS_MODEL, body, timeout=max(60, int(max_seconds * 1.5)), max_tries=5)
        except RuntimeError as e:
            # bekannter, zufälliger Fehler des TTS-Modells: „Model tried to generate text“ → erneut
            # (kostenlos, zählt nicht gegen `tries`)
            if 'generate text' in str(e) and text400 < 3:
                text400 += 1
                log(f'  TTS 400 „tried to generate text“ ({tag}) — Versuch {text400}')
                record_usage('tts', TTS_MODEL, {}, tag, {'voice': voice, 'seconds': 0, 'error': 'text-generation-400'})
                continue
            raise
        paid += 1
        attempt = paid - 1
        pcm = b''
        for c in d.get('candidates', [])[:1]:
            for p in (c.get('content') or {}).get('parts', []) or []:
                inl = p.get('inlineData')
                if inl and inl.get('data'):
                    mt = inl.get('mimeType', '')
                    m = re.search(r'rate=(\d+)', mt)
                    if m and int(m.group(1)) != SR:
                        raise RuntimeError(f'unerwartete Samplerate {mt}')
                    pcm += base64.b64decode(inl['data'])
        secs = len(pcm) / 2 / SR
        record_usage('tts', TTS_MODEL, d.get('usageMetadata'), tag, {'voice': voice, 'seconds': round(secs, 2)})
        if len(pcm) % 2:
            pcm = pcm[:-1]
        if pcm and secs >= min_seconds:
            return pcm
        fr = [c.get('finishReason') for c in d.get('candidates', [])]
        log(f'  TTS ohne/zu kurzes Audio ({tag}) {secs:.2f}s < {min_seconds:.1f}s finish={fr} — Versuch {attempt + 1}')
    raise RuntimeError(f'TTS lieferte kein Audio: {tag}')


LANG_NAME = {'de': 'Deutsch', 'en': 'Englisch', 'tr': 'Türkisch'}
LANG_EN = {'de': 'German', 'en': 'English', 'tr': 'Turkish'}
STT_PAD_S = 0.4


def stt_audio(mp3_bytes):
    """Finaler MP3-Clip → dekodiert, je 0,4 s digitale Stille davor/danach → WAV.
    Die Stille ändert den Inhalt nicht; ohne sie antwortet das Modell bei <1-s-Clips oft
    „[unverständlich]“ oder rät ein anderes Wort (Diagnose 15.09., 10/10 mit Polster vs. 5/10 ohne)."""
    pcm = run([FFMPEG, '-hide_banner', '-f', 'mp3', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', str(SR), 'pipe:1'],
              inp=mp3_bytes).stdout
    pad = b'\x00\x00' * int(SR * STT_PAD_S)
    return run([FFMPEG, '-hide_banner', *PCM_IN, '-i', 'pipe:0', '-f', 'wav', 'pipe:1'], inp=pad + pcm + pad).stdout


def stt(mp3_bytes, lang, tag, variant=0):
    """Blinde Transkription (der Erwartungstext wird dem Modell nie gezeigt).
    variant 0: Audio vor Prompt · variant 1: Prompt vor Audio · variant 2: Prompt vor Audio, Anweisung
    als Aufzählung (Lesungen 2+3 nur bei Fehlschlag von Lesung 1; Mehrheitsentscheid)."""
    prompt = (f'Transcribe the speech in this audio clip verbatim. The language is {LANG_EN[lang]}. '
              'It is a very short clip (a single word, a noun with or without article, a number word, '
              'a short exclamation or a short sentence). Include interjections and filler sounds '
              '(such as hmm, oh, ooh) exactly as heard, and keep colloquial contractions and elisions as '
              'pronounced instead of converting them to standard spelling. Output only the spoken words, nothing else.')
    if variant == 2:
        prompt = (f'Task: verbatim speech transcription.\n- Language: {LANG_EN[lang]}\n'
                  '- The clip is very short (one word, a noun with or without article, a number word, an exclamation or a short sentence).\n'
                  '- Write interjections/filler sounds (hmm, oh, ooh) as heard.\n'
                  '- Keep colloquial contractions as pronounced.\n'
                  '- Output only the spoken words.')
    audio = {'inlineData': {'mimeType': 'audio/wav', 'data': base64.b64encode(stt_audio(mp3_bytes)).decode()}}
    parts = [audio, {'text': prompt}] if variant == 0 else [{'text': prompt}, audio]
    body = {
        'contents': [{'parts': parts}],
        'generationConfig': {'temperature': 0, 'thinkingConfig': {'thinkingBudget': 0}},
    }
    d = post_json(STT_MODEL, body, timeout=120)
    record_usage('stt', STT_MODEL, d.get('usageMetadata'), tag)
    parts = []
    for c in d.get('candidates', [])[:1]:
        for p in (c.get('content') or {}).get('parts', []) or []:
            if 'text' in p and not p.get('thought'):
                parts.append(p['text'])
    return ''.join(parts).strip()


# ---------------------------------------------------------------- ffmpeg helpers
def run(cmd, inp=None):
    p = subprocess.run(cmd, input=inp, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(f'ffmpeg fehlgeschlagen: {p.stderr.decode("utf-8", "replace")[-600:]}')
    return p


PCM_IN = ['-f', 's16le', '-ar', str(SR), '-ac', '1']


def save_flac(pcm, path):
    run([FFMPEG, '-hide_banner', '-y', *PCM_IN, '-i', 'pipe:0', '-c:a', 'flac', path], inp=pcm)


def load_pcm(path):
    return run([FFMPEG, '-hide_banner', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(SR), 'pipe:1']).stdout


def silences(pcm, noise, d):
    p = run([FFMPEG, '-hide_banner', '-nostats', *PCM_IN, '-i', 'pipe:0',
             '-af', f'silencedetect=noise={noise}dB:d={d}', '-f', 'null', '-'], inp=pcm)
    err = p.stderr.decode('utf-8', 'replace')
    starts = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', err)]
    ends = [float(x) for x in re.findall(r'silence_end: (-?[\d.]+)', err)]
    return starts, ends


def speech_intervals(total, starts, ends):
    segs, cur = [], 0.0
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else total
        s = max(0.0, s)
        if s - cur > 0.001:
            segs.append((cur, s))
        cur = min(total, e)
    if total - cur > 0.001:
        segs.append((cur, total))
    return segs


SWEEP_NOISE = [-45, -40, -50, -35]
SWEEP_DUR = [0.4, 0.3, 0.5, 0.25, 0.6, 0.75]
MICRO_S = 0.07


def segment(pcm, n):
    """Sucht silencedetect-Parameter, bei denen die Segmentzahl exakt n ist."""
    total = len(pcm) / 2 / SR
    cache, tried = {}, []
    for tier in (0, 1):
        for noise in SWEEP_NOISE:
            for d in SWEEP_DUR:
                if (noise, d) not in cache:
                    cache[(noise, d)] = speech_intervals(total, *silences(pcm, noise, d))
                segs = cache[(noise, d)]
                if tier == 1:
                    segs = [s for s in segs if s[1] - s[0] >= MICRO_S]
                if tier == 0:
                    tried.append(f'{noise}/{d}:{len(segs)}')
                if len(segs) == n:
                    return segs, {'noise_db': noise, 'min_silence_s': d, 'micro_filter': bool(tier)}
    return None, {'tried': tried}


def cut(pcm, seg):
    total = len(pcm) // 2
    a = max(0, int(round((seg[0] - MARGIN_S) * SR)))
    b = min(total, int(round((seg[1] + MARGIN_S) * SR)))
    return pcm[a * 2:b * 2]


def measure(pcm):
    """Integrierte Lautheit (LUFS) + True Peak (dBTP). Kurze Clips werden zur Messung
    geloopt (≥2 s), damit das 400-ms-Gating von EBU R128 greift."""
    if not pcm:
        return float('-inf'), float('-inf')
    reps = max(3, math.ceil(2.0 * SR * 2 / len(pcm)))
    p = run([FFMPEG, '-hide_banner', '-nostats', *PCM_IN, '-i', 'pipe:0',
             '-af', 'ebur128=peak=true', '-f', 'null', '-'], inp=pcm * reps)
    err = p.stderr.decode('utf-8', 'replace')
    i_vals = re.findall(r'I:\s+(-?[\d.]+|-?inf|nan) LUFS', err)
    p_vals = re.findall(r'Peak:\s+(-?[\d.]+|-?inf) dBFS', err)
    lufs = float(i_vals[-1]) if i_vals else float('-inf')
    tp = float(p_vals[-1]) if p_vals else float('-inf')
    return lufs, tp


def render(pcm, out_mp3):
    """Pegel auf −16 LUFS, True Peak ≤ −1 dBTP, mono MP3 48 kbps."""
    lufs_in, _ = measure(pcm)
    gain = TARGET_LUFS - lufs_in if math.isfinite(lufs_in) else 0.0
    dur = len(pcm) / 2 / SR
    limit = -1.5   # Start knapp unter −1 dBTP; die Schleife senkt weiter, falls der MP3-True-Peak überschießt
    extra = 0.0    # Zusatz-Gain, wenn der Limiter spitze Clips unter −16,4 LUFS drückt (max. +4 dB)
    os.makedirs(os.path.dirname(out_mp3), exist_ok=True)
    tp_ok = TP_MAX - 0.05   # damit auch der auf 0,1 gerundete Wert ≤ −1,0 bleibt
    best = None
    for i in range(8):
        tmp = f'{out_mp3}.tmp{i}.mp3'
        af = (f'aformat=sample_fmts=flt,volume={gain + extra:.2f}dB,'
              f'alimiter=limit={limit:.2f}dB:attack=1:release=40:level=0:latency=1,'
              f'afade=t=in:d=0.006,afade=t=out:st={max(0.0, dur - 0.006):.3f}:d=0.006')
        run([FFMPEG, '-hide_banner', '-y', *PCM_IN, '-i', 'pipe:0', '-af', af,
             '-c:a', 'libmp3lame', '-b:a', '48k', '-ac', '1', '-f', 'mp3', tmp], inp=pcm)
        dec = load_pcm(tmp)
        lufs, tp = measure(dec)
        cand = {'path': tmp, 'dec': dec, 'lufs': lufs, 'tp': tp, 'gain': gain + extra, 'limit': limit}
        if tp > tp_ok:
            os.remove(tmp)
            limit -= (tp - tp_ok) + 0.2
            continue
        if best is None or abs(lufs - TARGET_LUFS) < abs(best['lufs'] - TARGET_LUFS):
            if best:
                os.remove(best['path'])
            best = cand
        else:
            os.remove(tmp)
        if lufs < TARGET_LUFS - 0.4 and extra < 4.0:
            extra = min(4.0, extra + (TARGET_LUFS - lufs))
            continue
        break
    if best is None:   # sollte nicht vorkommen: letzter Versuch mit deutlich tieferem Limit
        raise RuntimeError(f'True Peak nicht unter {TP_MAX} dBTP: {out_mp3}')
    os.replace(best['path'], out_mp3)
    dec, lufs, tp = best['dec'], best['lufs'], best['tp']
    return {'durationMs': int(round(len(dec) / 2 / SR * 1000)), 'lufs': round(lufs, 1), 'truePeak': round(tp, 1),
            'gainDb': round(best['gain'], 2), 'lufsIn': round(lufs_in, 1), 'limitDb': round(best['limit'], 2)}


def frames_db(pcm, frame_s=0.010):
    a = array('h')
    a.frombytes(pcm)
    n = int(SR * frame_s)
    out = []
    for i in range(0, len(a) - n + 1, n):
        s = 0
        for v in a[i:i + n]:
            s += v * v
        rms = math.sqrt(s / n) / 32768.0
        out.append(20 * math.log10(rms) if rms > 0 else -120.0)
    return out


# ---------------------------------------------------------------- normalisation / compare
NUMBERS = {
    'de': {'1': 'eins', '2': 'zwei', '3': 'drei', '4': 'vier', '5': 'fünf', '100': 'hundert'},
    'en': {'1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '100': 'one hundred'},
    'tr': {'1': 'bir', '2': 'iki', '3': 'üç', '4': 'dört', '5': 'beş', '100': 'yüz'},
}

# Akustisch identische Schreibungen (nur echte Homophone; Treffer werden im Report markiert)
HOMOPHONES = {
    'en': {'pear': ['pair', 'pare'], 'pears': ['pairs'], 'eye': ['i', 'aye'], 'sun': ['son'], 'suns': ['sons'],
           'ant': ['aunt'], 'ants': ['aunts'], 'bee': ['be', 'b'], 'key': ['quay'], 'keys': ['quays'],
           'plane': ['plain'], 'planes': ['plains'], 'whale': ['wail', 'wale'], 'whales': ['wails'],
           'flower': ['flour'], 'flowers': ['flours'], 'feet': ['feat'], 'stairs': ['stares'],
           'tshirt': ['teeshirt'], 'tshirts': ['teeshirts'], 'one': ['won'], 'four': ['for', 'fore'],
           'two': ['to', 'too'], 'rain': ['reign', 'rein'], 'nose': ['knows'], 'buses': ['busses']},
    'de': {'wal': ['wahl'], 'derwal': ['derwahl'], 'hai': ['hi'], 'uhr': ['ur'], 'ohr': ['or']},
    'tr': {},
}

_PUNCT = re.compile(r'[.,!?;:…"„“”«»‚‘()\[\]{}¿¡*/]')
_APOS = re.compile(r"['’ʼ`´]")
_DASH = re.compile(r'[-‐‑‒–—―_]')
_INTERJ = re.compile(r'^(h+m+|m+h+m+|o+h+|a+h+|u+h+|e+h+)$')
_HUM = re.compile(r'^(h+ı*m+|m{2,})$')   # Summlaut: hm/hmm, türkisch hım/hımm, mmm → „hm“


def tr_lower(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


def norm_tokens(s, lang):
    s = unicodedata.normalize('NFC', s or '').strip()
    s = tr_lower(s) if lang == 'tr' else s.lower()
    s = s.replace('i̇', 'i')
    s = s.replace('...', ' ').replace('ß', 'ss')
    s = _APOS.sub('', s)
    s = _PUNCT.sub(' ', s)
    s = _DASH.sub(' ', s)
    toks = []
    for t in s.split():
        if t in NUMBERS.get(lang, {}):
            toks.extend(NUMBERS[lang][t].split())
            continue
        if _HUM.match(t):
            t = 'hm'
        elif _INTERJ.match(t):
            t = re.sub(r'(.)\1+', r'\1', t)
        toks.append(t)
    if lang == 'de' and toks and toks[0] == 'dass' and len(toks) > 1:
        toks[0] = 'das'   # „das“/„dass“ sind lautgleich
    return toks


def norm_key(s, lang):
    return ''.join(norm_tokens(s, lang))


def compare(expected, transcript, lang):
    e, t = norm_key(expected, lang), norm_key(transcript, lang)
    if t and e == t:
        return True, 'exact'
    if t and t in HOMOPHONES.get(lang, {}).get(e, []):
        return True, 'homophone'
    return False, None


NORMALIZATION_RULES = [
    'Unicode NFC; Kleinschreibung (Türkisch sprachgerecht: I→ı, İ→i)',
    'Satzzeichen und Ellipsen (… / ...) entfernt; Anführungszeichen entfernt',
    'Apostrophe entfernt (hab ich’s ≈ hab ichs, Mal’s ≈ Mals, Time’s ≈ Times)',
    'Bindestriche/Gedankenstriche = Leerzeichen; Vergleich ohne Leerzeichen (köpek balığı ≈ köpekbalığı, T-shirt ≈ t shirt ≈ tshirt)',
    'Ziffern ≈ Zahlwörter je Sprache (1…5, 100)',
    'Interjektionen: Buchstabenwiederholung zusammengefasst (ooh ≈ oh); Summlaut-Schreibungen hm ≈ hmm ≈ hmmm ≈ mmm ≈ türkisch hım/hımm (nur als ganzes Token)',
    'ß ≈ ss (reine Schreibvariante)',
    'Deutsch: führendes „dass“ ≈ „das“ (lautgleich, Artikel bleibt Pflicht)',
    'Homophon-Tabelle (vorab festgelegt, nur lautgleiche Schreibungen; Treffer im Report als matchRule=homophone): '
    + '; '.join(f'{lang}: ' + ', '.join(f'{k}≈{"/".join(v)}' for k, v in tab.items()) for lang, tab in HOMOPHONES.items() if tab),
]


# ---------------------------------------------------------------- inventory
STYLE_OF_KEY = {'hmm1': 'curious', 'hmm2': 'curious', 'hmm3': 'curious', 'hard': 'curious',
                'hit1': 'joyful', 'hit2': 'joyful', 'timeup': 'friendly'}
NUMWORDS = {'de': ['eins', 'zwei', 'drei', 'vier', 'fünf'],
            'en': ['one', 'two', 'three', 'four', 'five'],
            'tr': ['bir', 'iki', 'üç', 'dört', 'beş']}


def load_inventory():
    with open(f'{REPO}/data/words.json', encoding='utf-8') as f:
        words = json.load(f)
    with open(f'{REPO}/data/voice-lines.json', encoding='utf-8') as f:
        vl = json.load(f)
    clips = []

    def add(file, lang, text, group, style='neutral'):
        clips.append({'file': file, 'lang': lang, 'text': text, 'expected': text, 'group': group, 'style': style})

    for w in words:
        add(f"de/w/{w['cls']}.mp3", 'de', f"{w['de']['art']} {w['de']['noun']}", 'de-w')
    for w in words:
        add(f"de/b/{w['cls']}.mp3", 'de', w['de']['noun'], 'de-b')
    for w in words:
        if w['de'].get('pl'):
            add(f"de/p/{w['cls']}.mp3", 'de', w['de']['pl'], 'de-p')
    for w in words:
        add(f"en/w/{w['cls']}.mp3", 'en', w['en']['word'], 'en-w')
    for w in words:
        if w['en'].get('pl'):
            add(f"en/p/{w['cls']}.mp3", 'en', w['en']['pl'], 'en-p')
    for w in words:
        add(f"tr/w/{w['cls']}.mp3", 'tr', w['tr']['word'], 'tr-w')
    num_group = {'de': 'de-b', 'en': 'en-w', 'tr': 'tr-w'}
    for lang, nums in NUMWORDS.items():
        for i, n in enumerate(nums, 1):
            add(f'{lang}/n/{i}.mp3', lang, n, num_group[lang])
    add('tr/n/tane.mp3', 'tr', 'tane', 'tr-w')
    for lang in ('de', 'en', 'tr'):
        for kind in ('x', 'u'):
            for key, text in (vl.get(lang, {}).get(kind) or {}).items():
                style = STYLE_OF_KEY.get(key, 'friendly') if kind == 'x' else 'friendly'
                add(f'{lang}/{kind}/{key}.mp3', lang, text, f'{lang}-lines-{style}', style)
    return clips


# ---------------------------------------------------------------- prompts
# Aufbau: eine Regie-Zeile (endet mit Doppelpunkt), Leerzeile, dann nur das Transkript.
# Frühere Fassung mit „Ton: …“-Zeilen löste bei DE/TR „Model tried to generate text“ (HTTP 400) aus.
INSTR = {
    'de': {
        'lead': 'Lies die folgende Liste auf Deutsch vor, {tone}.',
        'once': 'Sprich jeden Eintrag genau einmal, klar und natürlich, mit einer deutlichen Pause von etwa einer Sekunde zwischen den Einträgen. Sprich nichts anderes:',
        'neutral': 'freundlich und neutral, in ruhigem, mittlerem Tempo',
        'curious': 'neugierig und fragend, wie beim lauten Nachdenken kurz bevor man ein Wort errät, mit offen schwebender Stimme am Ende',
        'joyful': 'freudig und begeistert, wie jemand, der gerade die Lösung gefunden hat',
        'friendly': 'freundlich, warm und ermutigend',
        'single': 'Sprich auf Deutsch, {tone}, exakt dieses Wort beziehungsweise diesen Text, klar und natürlich, nichts davor und nichts danach:',
        'carrier': ('Das nächste Wort ist:', 'Danke.'),
    },
    'en': {
        'lead': 'Read the following list aloud in English, {tone}.',
        'once': 'Say each entry exactly once, clearly and naturally, with a distinct pause of about one second between entries. Say nothing else:',
        'neutral': 'in a friendly, neutral tone at a calm, medium pace',
        'curious': 'curiously and questioningly, like thinking out loud just before guessing a word, with the voice staying open at the end',
        'joyful': 'joyfully and excitedly, like someone who has just figured out the answer',
        'friendly': 'warmly, kindly and encouragingly',
        'single': 'Say {tone}, in English, exactly this word or text, clearly and naturally, nothing before it and nothing after it:',
        'carrier': ('The next word is:', 'Thank you.'),
    },
    'tr': {
        'lead': 'Aşağıdaki listeyi Türkçe olarak {tone} sesli oku.',
        'once': 'Her maddeyi yalnızca bir kez, açık ve doğal bir şekilde söyle; maddeler arasında yaklaşık bir saniyelik belirgin bir duraklama bırak. Başka hiçbir şey söyleme:',
        'neutral': 'samimi ve nötr bir tonla, sakin ve orta bir tempoda',
        'curious': 'meraklı ve soru sorar gibi, bir kelimeyi tahmin etmeden hemen önce yüksek sesle düşünüyormuş gibi',
        'joyful': 'neşeyle ve heyecanla, cevabı az önce bulmuş biri gibi',
        'friendly': 'sıcak, samimi ve cesaretlendirici bir tonla',
        'single': 'Türkçe olarak, {tone}, tam olarak bu kelimeyi ya da metni açık ve doğal bir şekilde söyle; öncesinde ve sonrasında hiçbir şey söyleme:',
        'carrier': ('Sıradaki kelime:', 'Teşekkürler.'),
    },
}


def _entry_line(text, style):
    if style == 'neutral' and not re.search(r'[.!?…]$', text):
        return text + '.'
    return text


def bundle_prompt(lang, style, texts, fmt='lines'):
    """fmt 'lines': ein Eintrag je Zeile · fmt 'ellipsis': Einträge in einer Zeile, getrennt durch „ … “.
    Diagnose 15.09. (5er-Bündel): DE-Kore/TR-Sulafat ließen im Zeilenformat Einträge aus bzw.
    brachen ab, im Ellipsen-Format kamen alle 5 (Pausen 0,8 s bzw. 1,7 s). Einträge, die selbst
    Auslassungspunkte tragen (KI-Präfixe), nur im Zeilenformat."""
    I = INSTR[lang]
    if fmt == 'ellipsis':
        body = ' … '.join(t.rstrip('.') for t in texts) + ' …'
    else:
        body = '\n'.join(_entry_line(t, style) for t in texts)
    return f"{I['lead'].format(tone=I[style])} {I['once']}\n\n{body}"


def single_prompt(lang, style, text, hint=None):
    I = INSTR[lang]
    head = I['single'].format(tone=I[style])
    if hint:   # Aussprache-Hinweis vor dem Doppelpunkt, das Transkript bleibt unverändert
        head = head[:-1] + f' ({hint}):'
    return f"{head}\n\n{_entry_line(text, style)}"


def carrier_texts(lang, text):
    a, b = INSTR[lang]['carrier']
    return [a, text, b]


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return default


def save_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
