#!/usr/bin/env python3
"""Iteration 2: entfernt die bei der Sichtung als unlesbar markierten Beispiele (tools/examples-drop.json) aus data/examples.json.
Idempotent über die Markierung `dropped` je Wort (Anzahl bereits entfernter Einträge)."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
drop = json.load(open(os.path.join(ROOT, 'tools/examples-drop.json')))
path = os.path.join(ROOT, 'data/examples.json')
ex = json.load(open(path))
changed = 0
for wid, idxs in drop.items():
    if wid.startswith('_') or wid not in ex:
        continue
    lst = ex[wid]
    if len(lst) < 3:  # schon angewendet
        continue
    ex[wid] = [e for i, e in enumerate(lst) if i not in set(idxs)]
    changed += 1
json.dump(ex, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
print('Wörter angepasst:', changed, '· mit 2 Beispielen:', sum(1 for v in ex.values() if len(v) == 2))
