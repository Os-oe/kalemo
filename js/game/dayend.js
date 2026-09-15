// Tagesende: lebende eigene Zeichnungen, „KI erkannte x/5", Punkte-Count-up, Serien-Flamme, lustigster Fehltipp.
import { t, word, ART_TEXT, FRINGE, funnyLine, funnyAllowed, pluralPhrase } from '../core/i18n.js';
import { streak, saveSettings, store } from '../core/store.js';
import { addDays } from '../core/plan.js';
import { mount, unmountAll } from './alive.js';
import { escapeHtml } from './round.js';
import { todayCard } from './cards.js';
import { shareImage } from './share.js';

const $ = (s) => document.querySelector(s);
const FLAME = '<svg class="flame" viewBox="0 0 40 52" aria-hidden="true"><path d="M20 3c3 9 14 15 14 29a14 14 0 0 1-28 0c0-8 5-12 7-18 2 5 4 7 6 8-1-7 0-13 1-19z" fill="#FFC857" stroke="#1E2A3A" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 26c2 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-8 1 2 2 3 3 3z" fill="#EF4444"/></svg>';

export function installDayEnd(app) {
  app.showDayEnd = async (sum) => {
    const { learn, native } = app.settings;
    app.show('dayend'); unmountAll($('#dayend-grid'));
    sum.streak = streak(sum.date, addDays(sum.date, -1)) || (sum.scored ? 1 : 0);
    $('#dayend-title').textContent = t('dayEndT', { n: sum.number });
    $('#dayend-recog').textContent = t('aiRecognized', { x: sum.hits });
    const grid = $('#dayend-grid');
    grid.innerHTML = sum.results.map((r, i) => {
      const w = app.byId.get(r.id); const ok = r.result === 'hit' || (r.parts > 0);
      const col = learn === 'de' ? ART_TEXT[r.kind === 'plural' ? 'plural' : w.de.art] : '#1E2A3A';
      // Mehrzahl (P3-4): Kachel in der Mehrzahl („zwei Frösche") mit allen gemalten Zeichnungen
      return `<figure class="${ok ? 'ok' : 'miss'}" style="--d:${i * 90}ms"><canvas></canvas><figcaption style="color:${col}">${escapeHtml(r.kind === 'plural' && r.n ? pluralPhrase(w, learn, r.n) : word(w, learn))}${r.kind === 'plural' ? ` <small>${r.parts}/${r.n}</small>` : ''}</figcaption></figure>`;
    }).join('');
    [...grid.querySelectorAll('canvas')].forEach((c, i) => {
      const r = sum.results[i], w = app.byId.get(r.id); const ok = r.result === 'hit' || r.parts > 0;
      const strokes = r.drawings?.length ? r.drawings[0] : r.strokes;
      const col = learn === 'de' ? ART_TEXT[r.kind === 'plural' ? 'plural' : w.de.art] : '#1E2A3A';
      // Tagesende-Kachel als Standbild (Iteration 1): ganze Zeichnung immer sichtbar, Line-Boil als leise Bewegung
      const fringe = learn === 'de' ? FRINGE[r.kind === 'plural' ? 'plural' : w.de.art] : FRINGE.neutral;
      mount(c, { strokes, groups: r.kind === 'plural' && r.drawings?.length > 1 ? r.drawings : null, color: col, fringe: ok ? fringe : '#C9CED6', style: 'crayon', width: 3.4, boil: 0.9, still: true, delay: 300 + i * 160, seed: i + 2 });
    });
    // Punkte zählen hoch
    const pts = $('#dayend-points'); const start = performance.now(); const dur = 1200;
    const step = (now) => { const k = Math.min(1, (now - start) / dur); pts.textContent = Math.round(sum.points * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); else app.sfx?.play('streak'); };
    requestAnimationFrame(step);
    $('#dayend-streak').innerHTML = sum.streak > 0 ? `${FLAME}<span>${escapeHtml(sum.streak === 1 ? t('streakDay') : t('streakDays', { n: sum.streak }))}</span>` : '';
    const f = sum.funniest && funnyAllowed(sum.funniest.target, sum.funniest.id) ? funnyLine(app.byId.get(sum.funniest.target), app.byId.get(sum.funniest.id), native) : null;
    const fe = $('#dayend-funny'); fe.hidden = !f; fe.innerHTML = f ? `<small>${escapeHtml(t('funniest'))}</small>${escapeHtml(f)}` : '';
    app.lastSummary = sum;
    // Punkt 2e: kam man über „Erst Tagesskizze — dann das Duell", führt ein Knopf zurück ins Duell (der Link bleibt gültig)
    const pd = store.get('pendingDuel', null);
    $('#btn-dayend-duel').hidden = !(pd && pd.date === sum.date && pd.code);
    $('#dayend-air').hidden = !app.shouldOfferAir?.();
    app.music?.play();
  };
  $('#dayend-air').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    app.sfx?.play('tap'); $('#dayend-air').hidden = true;
    if (b.dataset.k === 'yes') await app.airFromDayEnd();
    else app.settings = saveSettings({ airOffered: true, airDeclined: true });
  });

  /** Heute-Karte teilen — vom Tagesende und von der Ergebnis-Kachel auf dem Start (P2-2) */
  app.shareToday = async (sum, btn) => {
    if (!sum) return;
    if (btn) btn.disabled = true;
    try {
      if (!app.clf) await app.ensureClf?.();
      sum.streak ??= streak(sum.date, addDays(sum.date, -1)) || 1;
      const card = await todayCard(app, sum);
      app.lastCard = { gates: card.gates, text: card.text, bytes: card.blob.size, quote: card.quote, hero: card.hero, w: card.canvas.width, h: card.canvas.height };
      await shareImage(app, { blob: card.blob, filename: `kalemo-${sum.number}.png`, text: card.text, url: location.origin + location.pathname.replace(/index\.html$/, ''), forceFallback: !!app.TEST });
    } finally { if (btn) btn.disabled = false; }
  };
  $('#btn-share').addEventListener('click', () => app.shareToday(app.lastSummary, $('#btn-share')));
  $('#btn-dayend-duel').addEventListener('click', () => {
    const pd = store.get('pendingDuel', null); store.set('pendingDuel', null); $('#btn-dayend-duel').hidden = true;
    if (pd?.code) { app.sfx?.play('tap'); app.duel.receive(pd.code); }
  });
  $('#btn-challenge').addEventListener('click', () => app.challengeFrom(app.lastSummary));
  /** Zeichnung auswählen → Duell-Link (Tagesende + Start-Kachel) */
  app.challengeFrom = (sum) => {
    if (!sum) return;
    const learn = sum.learn || app.settings.learn;
    const opts = sum.results.map((r, i) => ({ r, i })).filter(({ r }) => (r.drawings?.length ? r.drawings[0] : r.strokes)?.length);
    const box = document.getElementById('sheet');
    box.innerHTML = `<div class="sheet-card"><h3>${escapeHtml(t('challenge'))}</h3><div class="pick-grid">${opts.map(({ r, i }) => `<button class="pick" data-i="${i}"><canvas></canvas><span>${escapeHtml(word(app.byId.get(r.id), learn))}</span></button>`).join('')}</div><button class="btn ghost" data-act="close">${escapeHtml(t('close'))}</button></div>`;
    box.hidden = false;
    box.querySelectorAll('.pick canvas').forEach((c, k) => { const r = opts[k].r; mount(c, { strokes: r.drawings?.length ? r.drawings[0] : r.strokes, color: '#1E2A3A', style: 'pencil', width: 2.6, still: true }); });
    box.onclick = (e) => {
      const b = e.target.closest('.pick');
      // P1-2: Link-Karte auf DIESEM Screen + direkt Teilen-Menü (Tipp = Nutzer-Geste)
      if (b) { const r = sum.results[+b.dataset.i]; unmountAll(box); box.innerHTML = ''; app.sfx?.play('tap'); app.duel.sendDrawing(r.id, r.drawings?.length ? r.drawings[0] : r.strokes, r.result === 'hit' ? (r.drawMs ?? r.hitAt ?? 20000) : 20000, r.timing || null, { autoShare: true }); } // Iteration 2: Malzeit ab erstem Strich
      else if (e.target === box || e.target.closest('[data-act=close]')) { box.hidden = true; box.innerHTML = ''; }
    };
  };
  $('#btn-dayend-dict').addEventListener('click', () => app.openDict());
}
