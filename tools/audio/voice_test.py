#!/usr/bin/env python3
"""A/B-Stimmentest je Sprache: dieselben 5 Beispielwörter, gleiche Bündel-Methode wie die Produktion.

Wertet alle vorhandenen Takes unter work/voicetest/<lang>-<voice>/take-<format>.flac aus
(Takes der Vorgänger-Session + Prompt-Diagnose vom 15.09.) — erzeugt nur dann neu, wenn eine
Stimme noch gar keinen Take hat (`--generate`).

Misst je Stimme: Vollständigkeit (Takes mit exakt 5 Segmenten), STT-Treffer je Clip, Sprechtempo
(Silben/s), Ausklang/Anlaut (ms), Lautheitsstabilität (Std.-Abw. der Roh-LUFS), Pausenlänge (Kostenfaktor).
Ergebnis: work/voicetest/results.json
"""
import glob
import os
import statistics
import sys
from concurrent.futures import ThreadPoolExecutor

from common import (WORK, SR, log, tts, stt, save_flac, load_pcm, segment, cut, measure, render, frames_db,
                    compare, bundle_prompt, save_json, usage_summary, budget_check)

OUT = f'{WORK}/voicetest'
CANDIDATES = {'de': ['Kore', 'Leda'], 'en': ['Aoede', 'Achernar'], 'tr': ['Sulafat', 'Laomedeia']}
WORDS = {
    'de': [('die Katze', 3), ('das Eichhörnchen', 4), ('der Schmetterling', 4), ('die Zahnbürste', 4), ('der Heißluftballon', 5)],
    'en': [('cat', 1), ('squirrel', 2), ('butterfly', 3), ('toothbrush', 2), ('hot air balloon', 4)],
    'tr': [('kedi', 2), ('sincap', 2), ('kelebek', 3), ('diş fırçası', 4), ('sıcak hava balonu', 7)],
}


def word_metrics(pcm):
    db = frames_db(pcm)
    peak = max(db)
    core = [i for i, v in enumerate(db) if v >= peak - 25]
    audible = [i for i, v in enumerate(db) if v >= peak - 45]
    core_ms = (core[-1] - core[0] + 1) * 10
    tail_ms = (audible[-1] - core[-1]) * 10
    head_ms = (core[0] - audible[0]) * 10
    return {'core_ms': core_ms, 'tail_ms': tail_ms, 'head_ms': head_ms, 'peak_frame_db': round(peak, 1)}


def eval_take(lang, voice, path):
    tag = f'voicetest-{lang}-{voice}'
    take = os.path.basename(path)[5:-5]
    pcm = load_pcm(path)
    total = len(pcm) / 2 / SR
    res = {'take': take, 'bundle_s': round(total, 2)}
    if total > 120:
        res.update(complete=False, error=f'Endlos-Ausgabe {total:.0f} s')
        return res
    segs, params = segment(pcm, 5)
    res['segmentation'] = params
    if not segs:
        res.update(complete=False, error='nicht exakt 5 Segmente (Eintrag ausgelassen/abgebrochen)')
        return res
    res['complete'] = True
    gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
    res['mean_gap_s'] = round(statistics.mean(gaps), 2)
    res['s_per_entry'] = round(total / 5, 2)
    d = f'{OUT}/{lang}-{voice}/clips-{take}'
    os.makedirs(d, exist_ok=True)
    words = []
    for i, ((text, syl), seg) in enumerate(zip(WORDS[lang], segs)):
        clip = cut(pcm, seg)
        lufs_raw, tp_raw = measure(clip)
        m = word_metrics(clip)
        info = render(clip, f'{d}/{i + 1}.mp3')
        with open(f'{d}/{i + 1}.mp3', 'rb') as f:
            transcript = stt(f.read(), lang, tag)
        ok, rule = compare(text, transcript, lang)
        words.append({'text': text, 'syllables': syl, 'seg_ms': int((seg[1] - seg[0]) * 1000),
                      'lufs_raw': lufs_raw, 'tp_raw': tp_raw, **m, 'final': info,
                      'transcript': transcript, 'match': ok, 'rule': rule})
    res['words'] = words
    res['stt_hits'] = sum(1 for w in words if w['match'])
    res['syl_per_s_core'] = round(sum(w['syllables'] for w in words) / (sum(w['core_ms'] for w in words) / 1000), 2)
    res['mean_tail_ms'] = round(statistics.mean(w['tail_ms'] for w in words), 1)
    res['mean_head_ms'] = round(statistics.mean(w['head_ms'] for w in words), 1)
    res['lufs_raw_std'] = round(statistics.pstdev(w['lufs_raw'] for w in words), 2)
    res['final_lufs'] = [w['final']['lufs'] for w in words]
    res['final_tp'] = [w['final']['truePeak'] for w in words]
    return res


def run_voice(lang, voice, generate=False):
    d = f'{OUT}/{lang}-{voice}'
    os.makedirs(d, exist_ok=True)
    takes = sorted(glob.glob(f'{d}/take-*.flac'))
    if not takes and generate:
        texts = [w for w, _ in WORDS[lang]]
        pcm = tts(bundle_prompt(lang, 'neutral', texts, 'ellipsis'), voice, f'voicetest-{lang}-{voice}',
                  min_seconds=2.5, max_seconds=30, tries=1)
        save_flac(pcm, f'{d}/take-ellipsis-gen.flac')
        takes = [f'{d}/take-ellipsis-gen.flac']
    results = [eval_take(lang, voice, t) for t in takes]
    comp = [r for r in results if r.get('complete')]
    agg = {'lang': lang, 'voice': voice, 'takes': results,
           'complete': f'{len(comp)}/{len(results)}'}
    if comp:
        agg['stt_hits'] = f"{sum(r['stt_hits'] for r in comp)}/{5 * len(comp)}"
        agg['syl_per_s_core'] = round(statistics.mean(r['syl_per_s_core'] for r in comp), 2)
        agg['mean_gap_s'] = round(statistics.mean(r['mean_gap_s'] for r in comp), 2)
        agg['s_per_entry'] = round(statistics.mean(r['s_per_entry'] for r in comp), 2)
        agg['lufs_raw_std'] = round(statistics.mean(r['lufs_raw_std'] for r in comp), 2)
        agg['mean_tail_ms'] = round(statistics.mean(r['mean_tail_ms'] for r in comp), 1)
    return agg


def main():
    generate = '--generate' in sys.argv
    if generate and not budget_check(0.02):
        log('Budget-Cap erreicht — Abbruch vor dem ersten bezahlten Aufruf.')
        sys.exit(1)
    jobs = [(l, v) for l, vs in CANDIDATES.items() for v in vs]
    with ThreadPoolExecutor(3) as ex:
        results = list(ex.map(lambda j: run_voice(*j, generate=generate), jobs))
    save_json(f'{OUT}/results.json', results)
    for r in results:
        log(f"{r['lang']} {r['voice']:10s} vollständig {r['complete']} · STT {r.get('stt_hits')} · "
            f"{r.get('syl_per_s_core')} Silben/s · Pause {r.get('mean_gap_s')} s · {r.get('s_per_entry')} s/Eintrag · "
            f"LUFS-Streuung {r.get('lufs_raw_std')} dB · Ausklang {r.get('mean_tail_ms')} ms")
        for t in r['takes']:
            miss = [f"{w['text']}→{w['transcript']}" for w in t.get('words', []) if not w['match']]
            log(f"    take {t['take']:28s} {t['bundle_s']:6.1f}s complete={t['complete']} "
                f"{t.get('error', '')} stt={t.get('stt_hits', '-')} {miss if miss else ''}")
    u = usage_summary()
    log(f"Kosten bisher: {u['eur']:.4f} € (TTS {u['tts_calls']} Aufrufe {u['tts_eur']:.4f} €, STT {u['stt_calls']} Aufrufe {u['stt_eur']:.4f} €)")


if __name__ == '__main__':
    main()
