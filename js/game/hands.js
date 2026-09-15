// Handgezeichnete Hand-Illustrationen (SVG, keine Emojis). Pflicht: Artikel-Zählung ohne Daumen zeigen.
const CAP = (x, y1, y2, w) => `M${x - w / 2} ${y2} L${x - w / 2} ${y1 + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y1 + w / 2} L${x + w / 2} ${y2}`;

/**
 * f: {index, middle, ring, pinky, thumb} (true = gestreckt)
 * opts: {ink, fill, accent (Farbe gestreckter Finger), size, label}
 */
export function handSvg(f, { ink = '#1E2A3A', fill = '#FFFDF7', accent = null, size = 72, label = '' } = {}) {
  const fingers = [
    ['index', 30, 12, 13], ['middle', 44, 6, 13], ['ring', 58, 10, 13], ['pinky', 71, 24, 11],
  ];
  let paths = '';
  // gebeugte Finger zuerst (liegen hinter der Handfläche als Knöchel)
  for (const [k, x, top, w] of fingers) {
    if (f[k]) continue;
    paths += `<path d="${CAP(x, 44, 62, w)}" fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  // Handfläche + Handgelenk
  paths += `<path d="M24 58 Q22 52 30 52 L72 52 Q80 52 78 60 L77 92 Q76 104 62 106 L40 106 Q26 104 24 92 Z" fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
  paths += `<path d="M36 106 L36 118 M64 106 L64 118" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  // gestreckte Finger
  for (const [k, x, top, w] of fingers) {
    if (!f[k]) continue;
    const col = accent || fill;
    paths += `<path d="${CAP(x, top, 60, w)} Z" fill="${col}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
    paths += `<path d="M${x - w / 2 + 3} ${top + 14} L${x + w / 2 - 3} ${top + 14}" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>`;
  }
  // gebeugte Finger: Knöchel-Linien über der Handfläche
  for (const [k, x, , w] of fingers) if (!f[k]) paths += `<path d="M${x - w / 2 + 2} 60 Q${x} 66 ${x + w / 2 - 2} 60" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  // Daumen
  paths += f.thumb
    ? `<path d="M26 86 Q14 80 9 66 Q7 58 14 58 Q19 58 22 66 L30 76" fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`
    : `<path d="M27 91 Q31 79 47 79 Q55 80 54 86 Q53 91 46 91 L35 95 Q27 97 27 91 Z" fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
  return `<svg class="hand" viewBox="0 0 100 124" width="${size}" height="${Math.round(size * 1.24)}" role="img" aria-label="${label}" style="filter:url(#sketchy)">${paths}</svg>`;
}

export const POSES = {
  draw: { index: true, middle: false, ring: false, pinky: false, thumb: false },
  open: { index: true, middle: true, ring: true, pinky: true, thumb: true },
  1: { index: true, middle: false, ring: false, pinky: false, thumb: false },
  2: { index: true, middle: true, ring: false, pinky: false, thumb: false },
  3: { index: true, middle: true, ring: true, pinky: false, thumb: false },
};

/** Silhouette mit Zeigefinger (Attract-Loop / Demo-Modus): Pfad relativ zur Fingerspitze (0,0), Hand zeigt nach oben */
export function drawPointerSilhouette(ctx, x, y, scale = 1, { fill = 'rgba(255,251,239,0.16)', stroke = 'rgba(255,251,239,0.55)', down = true } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(-0.18);
  ctx.beginPath();
  // Zeigefinger
  ctx.moveTo(-7, 0); ctx.arc(0, 4, 7, Math.PI, 0); ctx.lineTo(7, 46);
  // Knöchel Mittel/Ring/klein (gebeugt)
  ctx.quadraticCurveTo(14, 38, 21, 44); ctx.quadraticCurveTo(28, 40, 34, 48); ctx.quadraticCurveTo(41, 46, 44, 55);
  // Handkante + Handgelenk
  ctx.quadraticCurveTo(48, 76, 40, 92); ctx.lineTo(38, 120); ctx.lineTo(4, 120); ctx.lineTo(2, 96);
  // Daumen angelegt
  ctx.quadraticCurveTo(-14, 84, -18, 66); ctx.quadraticCurveTo(-20, 56, -12, 56); ctx.quadraticCurveTo(-7, 58, -7, 50);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.2 / scale; ctx.strokeStyle = stroke; ctx.stroke();
  ctx.restore();
}
