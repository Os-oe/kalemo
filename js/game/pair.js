// Sprachpaar-Wahl „Ich spreche" / „Ich lerne" (Start + Duell-Empfang).
// Review P2-5: Tipp auf die aktive Sprache tut nichts; die Sprache der anderen Spalte ist gesperrt;
// Tauschen nur über den eigenen ⇄-Knopf. P3-8: Radiogruppe mit Pfeiltasten (roving tabindex).
import { t, LANGS, LANG_CODE } from '../core/i18n.js';
import { saveSettings } from '../core/store.js';

const SWAP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>';

/**
 * mountPair(root, app, { onChange }) — root enthält [data-pair=native], [data-pair=learn] und [data-pair=swap].
 * onChange(patch) nach jeder Änderung (Settings sind dann schon gespeichert).
 */
export function mountPair(root, app, { onChange = () => {} } = {}) {
  const box = (k) => root.querySelector(`[data-pair="${k}"]`);
  const render = () => {
    const s = app.settings;
    const focusKey = root.contains(document.activeElement) ? document.activeElement.closest('[data-pair]')?.dataset.pair : null;
    queueMicrotask(() => { if (focusKey === 'native' || focusKey === 'learn') box(focusKey).querySelector('[aria-checked=true]')?.focus(); });
    for (const key of ['native', 'learn']) {
      const other = key === 'native' ? 'learn' : 'native';
      box(key).innerHTML = LANGS.map((l) => {
        const on = s[key] === l, locked = s[other] === l;
        return `<button type="button" role="radio" aria-checked="${on}" data-l="${l}" tabindex="${on ? 0 : -1}" ${locked ? 'aria-disabled="true" class="locked"' : ''} aria-label="${t('langName.' + l)}">${LANG_CODE[l]}</button>`;
      }).join('');
    }
    const sw = box('swap'); if (sw) { sw.innerHTML = SWAP_SVG; sw.setAttribute('aria-label', t('swap')); sw.title = t('swap'); }
  };
  const set = (patch) => { app.settings = saveSettings({ ...patch, chosenPair: true }); app.sfx?.play('tap'); render(); onChange(patch); };
  const choose = (key, l) => {
    const other = key === 'native' ? 'learn' : 'native';
    if (app.settings[key] === l) return false; // aktive Sprache: nichts tun
    if (app.settings[other] === l) { root.querySelector('[data-pair=swap]')?.classList.remove('nudge'); void root.offsetWidth; root.querySelector('[data-pair=swap]')?.classList.add('nudge'); return false; } // gesperrt → ⇄ zeigt sich
    set({ [key]: l }); return true;
  };
  for (const key of ['native', 'learn']) {
    const el = box(key);
    el.onclick = (e) => { const b = e.target.closest('button[data-l]'); if (b) choose(key, b.dataset.l); };
    el.onkeydown = (e) => {
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!dir) return;
      e.preventDefault();
      const other = key === 'native' ? 'learn' : 'native';
      let i = LANGS.indexOf(app.settings[key]);
      for (let k = 0; k < LANGS.length; k++) { i = (i + dir + LANGS.length) % LANGS.length; if (LANGS[i] !== app.settings[other]) break; }
      if (choose(key, LANGS[i])) box(key).querySelector(`[data-l="${LANGS[i]}"]`)?.focus();
    };
  }
  const sw = box('swap');
  if (sw) sw.onclick = () => set({ native: app.settings.learn, learn: app.settings.native });
  render();
  return { render };
}
