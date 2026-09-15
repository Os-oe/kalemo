"""Synthetische MediaPipe-Hand-Landmarken (21 Punkte, normiert 0..1) für __feedLandmarks-Tests."""


def hand(cx=0.5, cy=0.5, index=True, middle=False, ring=False, pinky=False, thumb=False, s=0.12):
    """Hand zeigt nach oben. cx/cy = Mitte der Fingergrundgelenke. Gestreckt → Spitze weit weg vom Handgelenk."""
    wrist = (cx, cy + s * 1.0)
    pts = [None] * 21
    pts[0] = wrist
    # Daumen 1..4
    if thumb:
        pts[1], pts[2], pts[3], pts[4] = (cx - .35 * s, cy + .7 * s), (cx - .6 * s, cy + .45 * s), (cx - .8 * s, cy + .25 * s), (cx - 1.0 * s, cy + .05 * s)
    else:
        pts[1], pts[2], pts[3], pts[4] = (cx - .3 * s, cy + .7 * s), (cx - .35 * s, cy + .45 * s), (cx - .2 * s, cy + .35 * s), (cx - .05 * s, cy + .38 * s)
    for (mcp, ext, dx, length) in ((5, index, -.45, .85), (9, middle, -.15, .95), (13, ring, .15, .9), (17, pinky, .45, .7)):
        bx, by = cx + dx * s, cy
        pts[mcp] = (bx, by)
        if ext:
            pts[mcp + 1] = (bx, by - .35 * length * s)
            pts[mcp + 2] = (bx, by - .62 * length * s)
            pts[mcp + 3] = (bx, by - .85 * length * s)
        else:  # eingerollt: Spitze zurück Richtung Handfläche
            pts[mcp + 1] = (bx, by - .28 * s)
            pts[mcp + 2] = (bx + .02 * s, by - .12 * s)
            pts[mcp + 3] = (bx + .03 * s, by + .12 * s)
    return [[x, y, 0.0] for (x, y) in pts]


def seq(pose_fn, n, t0, fps=30, move=None):
    """n Frames ab t0 (ms). move(i) → (cx, cy)."""
    out = []
    for i in range(n):
        cx, cy = move(i) if move else (0.5, 0.5)
        out.append({'lm': pose_fn(cx, cy), 't': t0 + i * 1000.0 / fps})
    return out


POINT = lambda cx, cy: hand(cx, cy, index=True)
OPEN = lambda cx, cy: hand(cx, cy, index=True, middle=True, ring=True, pinky=True, thumb=True)
FIST = lambda cx, cy: hand(cx, cy, index=False)
C1 = lambda cx, cy: hand(cx, cy, index=True)
C2 = lambda cx, cy: hand(cx, cy, index=True, middle=True)
C2_THUMB = lambda cx, cy: hand(cx, cy, index=True, middle=True, thumb=True)
C3 = lambda cx, cy: hand(cx, cy, index=True, middle=True, ring=True)
C3_THUMB = lambda cx, cy: hand(cx, cy, index=True, middle=True, ring=True, thumb=True)
FOUR = lambda cx, cy: hand(cx, cy, index=True, middle=True, ring=True, pinky=True)
WOLF = lambda cx, cy: hand(cx, cy, index=True, pinky=True)
NONE = lambda cx, cy: None
