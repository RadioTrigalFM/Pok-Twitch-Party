import { currentFullscreenElement } from './fullscreen.js';
import { state } from './state.js';

/* =========================================================
   UTILITIES
   ========================================================= */
export function $(id) { return document.getElementById(id); }
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
export function toast(msg, duration = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, duration);
}
// El modal (#modal) vive al final del <body>, fuera de cualquier
// .game-scene. Cuando una escena está en pantalla completa (nativa o
// simulada), el navegador solo pinta lo que cuelga de ese elemento, así
// que un modal "hijo de body" se queda invisible aunque tenga z-index alto.
// Para poder abrir el pasaporte (u otro modal) mientras se juega en
// pantalla completa, lo movemos dentro de la escena activa justo antes de
// mostrarlo, y lo devolvemos a <body> en cuanto se sale de pantalla
// completa (ver eventListeners.js).
export function relocateModal() {
  const modal = $('modal');
  if (!modal) return;
  const target = currentFullscreenElement() || document.body;
  if (modal.parentElement !== target) target.appendChild(modal);
}

export function showModal(title, body, actions = []) {
  relocateModal();
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  const actionsEl = $('modal-actions');
  actionsEl.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = a.class || 'btn-primary';
    b.textContent = a.label;
    b.onclick = () => { $('modal').classList.remove('show'); a.onClick && a.onClick(); };
    actionsEl.appendChild(b);
  });
  $('modal').classList.add('show');
}
export function addScore(user, points) {
  state.scores[user] = (state.scores[user] || 0) + points;
}
// Quita tildes/diacríticos para poder comparar respuestas con o sin acentos
// (p.ej. "pikachu" debe aceptarse igual que "pikáchu").
export function normalizeAnswer(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
export function getRanking() {
  return Object.entries(state.scores)
    .map(([u,s]) => ({ user: u, score: s }))
    .sort((a,b) => b.score - a.score);
}
export function renderRanking(container, limit = 10, title = '🏆 Ranking') {
  const ranking = getRanking().slice(0, limit);
  container.innerHTML = `<div class="ranking-title">${title}</div>`;
  if (ranking.length === 0) {
    container.innerHTML += '<p style="font-size:12px;color:var(--muted);text-align:center;padding:10px;">Sin puntuaciones aún</p>';
    return;
  }
  ranking.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'ranking-row' + (i === 0 ? ' gold' : i === 1 ? ' silver' : i === 2 ? ' bronze' : '');
    row.innerHTML = `
      <span class="ranking-pos">${i+1}</span>
      <span class="ranking-name">@${r.user}</span>
      <span class="ranking-score">${r.score} pts</span>
    `;
    container.appendChild(row);
  });
}
