import { escapeHtml } from './chat.js';
import { ARENA_POKEMON_DB } from './data/arenaPokemonDb.js';
import { getPokemonSprite } from './data/pokemonDb.js';
import { $, normalizeAnswer, showScreen } from './utils.js';

/* =========================================================
   PANTALLA "COMANDOS DE POKÉMON" — accesible desde Ajustes
   -----------------------------------------------------------
   Lista de solo consulta con el comando exacto (!pokemon [nombre]) para
   apuntarse con cada uno de los Pokémon de ARENA_POKEMON_DB: la misma
   Pokédex Nacional que ya usan, con ese mismo comando, el Coliseo del
   modo Arena, el Boss cooperativo, Pokerus, Rayo Solar, Zona Safari y El
   Volcán (ver handleXxxJoin en cada uno de esos modos) — no se apunta a
   nada desde aquí, solo sirve de referencia para el chat. Se muestran
   siempre en orden de Pokédex Nacional, que es justo el orden en que ya
   está declarado ARENA_POKEMON_DB, así que no hace falta ordenarlos
   aparte.

   La rejilla (1025 tarjetas) se monta una única vez, la primera vez que
   se abre esta pantalla (ver ensureGridRendered/rendered): no tendría
   sentido reconstruirla en cada visita, ya que ARENA_POKEMON_DB no cambia
   en caliente. El buscador de arriba no reconstruye nada tampoco, solo
   oculta/muestra las tarjetas ya creadas (ver filterGrid) comparando
   contra un texto normalizado (sin tildes ni mayúsculas, ver
   normalizeAnswer) que cada tarjeta ya lleva precalculado en
   dataset.search desde que se creó.
   ========================================================= */

let rendered = false;

// Una tarjeta por Pokémon: su icono estático (el mismo PNG de PokeAPI que
// se usa como imagen de respaldo del sprite PMD animado en el resto del
// juego, ver getPokemonSprite en data/pokemonDb.js — aquí de sobra, no
// hace falta la animación completa para una lista de 1025), su número de
// Pokédex, su nombre y el propio comando ya formado, listo para copiar tal
// cual en el chat.
function createPokemonCommandCard(p) {
  const el = document.createElement('div');
  el.className = 'pkcmds-card';
  const dex = String(p.id).padStart(4, '0');
  el.dataset.search = normalizeAnswer(`${p.name} ${p.id}`);
  el.innerHTML = `
    <img class="pkcmds-icon" src="${getPokemonSprite(p.sprite)}" alt="" loading="lazy" width="40" height="40">
    <div class="pkcmds-info">
      <div class="pkcmds-dex">#${dex}</div>
      <div class="pkcmds-name">${escapeHtml(p.name)}</div>
    </div>
    <code class="pkcmds-code">!pokemon ${escapeHtml(p.name)}</code>
  `;
  return el;
}

function ensureGridRendered() {
  if (rendered) return;
  rendered = true;
  const intro = $('pkcmds-intro');
  if (intro) {
    intro.innerHTML = `Escribe <b>!pokemon [nombre]</b> en el chat para inscribirte con ese Pokémon en los modos que lo usan (Coliseo, Boss cooperativo, Pokerus, Rayo Solar, Zona Safari y El Volcán). Los ${ARENA_POKEMON_DB.length} Pokémon disponibles, ordenados por Pokédex Nacional:`;
  }
  const grid = $('pkcmds-grid');
  if (!grid) return;
  const frag = document.createDocumentFragment();
  ARENA_POKEMON_DB.forEach(p => frag.appendChild(createPokemonCommandCard(p)));
  grid.appendChild(frag);
}

// Oculta/muestra cada tarjeta ya montada según lo escrito en el buscador
// (nombre o número de Pokédex, con o sin tildes/mayúsculas): vacío muestra
// las 1025 de nuevo.
function filterGrid(query) {
  const grid = $('pkcmds-grid');
  if (!grid) return;
  const q = normalizeAnswer(query || '').trim();
  grid.querySelectorAll('.pkcmds-card').forEach(card => {
    card.style.display = !q || card.dataset.search.includes(q) ? '' : 'none';
  });
}

// Cablea el botón de Ajustes y el buscador. Se llama una sola vez, al
// cargar el módulo (ver el import en eventListeners.js), igual que el
// resto de listeners de navegación entre pantallas.
export function initPokemonCommandsScreen() {
  const openBtn = $('pokemon-commands-btn');
  if (openBtn) {
    openBtn.onclick = () => {
      showScreen('pokemon-commands-screen');
      ensureGridRendered();
    };
  }
  const backBtn = $('pokemon-commands-back-btn');
  if (backBtn) backBtn.onclick = () => showScreen('settings-screen');
  const search = $('pkcmds-search');
  if (search) search.oninput = () => filterGrid(search.value);
}
