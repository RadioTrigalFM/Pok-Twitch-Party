import { addChatMessage, escapeHtml } from '../chat.js';
import { pickVoltorbCategory, veItemName, veItemMatchVariants } from '../data/voltorbCategoriesDb.js';
import { applyOwNpcSprite, getRandomOwNpc } from '../data/owNpcDb.js';
import { getPokemonSprite } from '../data/pokemonDb.js';
import { currentFullscreenElement, requestSceneFullscreen } from '../fullscreen.js';
import { toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { backToMenu } from '../modeLauncher.js';
import { PMDSprite, PMD_DIR, pmdPreload } from '../pmdSprite.js';
import { state } from '../state.js';
import { $, addScore, normalizeAnswer, showModal, toast } from '../utils.js';
import {
  playCountdownBeep, playVeJoin, playVeMatchStart, playVeCategory, playVeTurn,
  playVeCorrect, playVeWrong, playVeTimeout, playVeGrow, playVeExplosion,
  playVeRoundComplete, playVeVictory, playVeDraw, playModeMusic,
} from '../audio.js';

/* =========================================================
   MODO VOLTORB EXPLOSIVO
   -----------------------------------------------------------
   - Lobby: los viewers se apuntan con !participo (máx. 24 jugadores).
     A cada uno se le asigna al azar un sprite OW de NPC, igual que en
     el modo Vista Lince.
   - Al empezar la partida, todos los jugadores se colocan formando un
     corro (círculo), mirando hacia el centro.
   - Cada ronda empieza con un cartel grande con el nombre de la
     categoría; tras unos segundos se encoge y se coloca arriba,
     quedando visible durante toda la ronda.
   - El turno del primer jugador de toda la partida se elige al azar;
     a partir de ahí, los turnos van en el sentido de las agujas del
     reloj según el orden del corro.
   - En su turno, el jugador escribe "!<elemento>" (la respuesta va
     pegada directamente detrás del "!", sin comando previo como "!r";
     p. ej. "!tauros paldea") para nombrar un elemento de la categoría.
     Si acierta (y no estaba ya dicho), pasa el turno al siguiente; si
     falla, pierde una vida y el turno pasa igualmente al siguiente
     jugador vivo.
   - Cada jugador tiene 3 vidas. Si un jugador se queda a 0, su Voltorb
     se hincha y se pone blanco durante 1,5s y después explota. Tras la
     explosión se pasa a otra ronda (nueva categoría), y el turno es
     para el jugador que iba justo después del eliminado.
   - Si se nombran todos los elementos de la categoría sin que nadie
     pierda su última vida, se pasa a la siguiente ronda con normalidad.
   - La partida termina cuando solo queda un jugador con vidas.
   ========================================================= */

const VE_MAX_PLAYERS = 24;
const VE_VOLTORB_DEX = 100; // Voltorb
const VE_START_LIVES = 3;
const VE_ANIM_SPEED = 1.6;             // velocidad de la animación Walk del Voltorb
const VE_MOVE_MS = 700;                // duración del desplazamiento del Voltorb entre jugadores
const VE_SPAWN_MS = 420;               // duración del "pop" al aparecer el Voltorb junto a un jugador
const VE_BANNER_BIG_MS = 2600;         // tiempo que el cartel de categoría se muestra grande
const VE_BANNER_SHRINK_MS = 900;       // duración de la transición de encogerse hacia arriba
const VE_ROUND_GAP_MS = 2600;          // pausa entre el fin de una ronda y el cartel de la siguiente
const VE_GROW_MS = 1500;               // duración del hinchado/blanqueado antes de explotar
const VE_BLAST_MS = 650;               // duración del estallido en sí
const VE_TURN_ADVANCE_DELAY_MS = 550;  // pequeña pausa tras acertar/fallar antes de anunciar el siguiente turno
const VE_TURN_TIMEOUT_MS = 25000;      // tiempo máximo por turno antes de perder una vida automáticamente

// Radio (en % del ancho/alto del campo) al que se colocan los jugadores
// formando el corro, y factor al que se sitúa el Voltorb respecto al
// centro (más cerca del centro que los jugadores = "lado interior").
const VE_CIRCLE_RX = 40;
const VE_CIRCLE_RY = 37;
const VE_VOLTORB_INNER_FACTOR = 0.64;

export function startVoltorbExplosivo() {
  // Igual que en Rayo Solar (ver el comentario largo en startRayoSolar,
  // rayosolar.js): al pulsar "Nueva Partida" (ver el botón #ve-again-btn
  // tras endVoltorbExplosivo) esta misma función reconstruye el lobby, lo
  // que destruye por completo el contenido anterior de #game-content
  // -incluido el campo (#ve-field-outer) que estaba en pantalla completa
  // mientras se jugaba-, sacando al navegador de pantalla completa por su
  // cuenta. Se guarda si había pantalla completa activa ANTES de
  // reconstruir nada para restaurarla sobre el lobby nuevo justo después
  // (ver más abajo).
  const wasFullscreen = !!currentFullscreenElement();
  state.modeState = {
    phase: 'lobby',        // 'lobby' | 'categoryIntro' | 'turn' | 'exploding' | 'roundTransition' | 'ended'
    players: {},            // user -> jugador
    order: [],               // orden de registro / asientos fijos del corro
    lobbyImgs: {},
    lobbyCards: {},         // user -> elemento de la tarjeta del lobby (para poder expulsarlo)
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startVoltorbExplosivo(), es decir, al empezar una nueva partida).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    round: 0,
    category: null,           // { name, items }
    usedItems: [],             // items (normalizados) ya dichos en la ronda actual
    currentTurnUser: null,
    pendingTurnUser: null,      // a quién le toca al empezar la siguiente ronda
    circlePositions: {},          // user -> { leftPct, topPct } (posición del jugador en el corro)
    voltorbInnerPositions: {},     // user -> { leftPct, topPct } (posición del Voltorb junto a ese jugador)
    voltorbPlaced: false,
    voltorbCurrentPos: null,
    voltorbSprite: null,
    categoryBannerTimeout: null,
    nextRoundTimeout: null,
    moveTimeout: null,
    growTimeout: null,
    blastTimeout: null,
    turnTimeout: null,           // setTimeout que ejecuta la pérdida de vida al agotarse el tiempo
    turnTickInterval: null,      // setInterval que refresca la UI del contador cada segundo
    turnDeadlineTs: null,        // timestamp (Date.now()) en el que expira el turno actual
  };
  pmdPreload(VE_VOLTORB_DEX);
  renderVoltorbLobby();
  if (wasFullscreen) {
    // Restaura la pantalla completa sobre el lobby recién creado (ver el
    // comentario de arriba).
    requestSceneFullscreen($('ve-lobby-scene'));
  }
  addChatMessage(null, '💣 ¡Voltorb Explosivo abierto! Escribe !participo para apuntarte (máx. 24 jugadores)', 'system');
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleVoltorbCmd(user, cmd, parts, text) {
  const ms = state.modeState;
  if (!ms) return;
  if (!cmd || cmd[0] !== '!') return;

  if (cmd === '!participo') {
    if (ms.phase !== 'lobby') {
      if (ms.phase !== 'ended') addChatMessage(null, `${user}: la partida ya ha comenzado, ¡espera a la siguiente!`, 'system', { mirror: false });
      return;
    }
    if (ms.expelledUsers && ms.expelledUsers.has(user)) {
      addChatMessage(null, `${user}: el streamer te ha expulsado de esta partida, no puedes volver a apuntarte hasta la siguiente`, 'system', { mirror: false });
      return;
    }
    if (ms.players[user]) return;
    if (ms.order.length >= VE_MAX_PLAYERS) {
      addChatMessage(null, `${user}: la sala está llena (${VE_MAX_PLAYERS}/${VE_MAX_PLAYERS})`, 'system', { mirror: false });
      return;
    }
    const npc = getRandomOwNpc();
    ms.players[user] = {
      user,
      npc,
      lives: VE_START_LIVES,
      alive: true,
      elId: 've-' + sanitizeUser(user),
    };
    ms.order.push(user);
    addChatMessage(null, `✅ ${user} se apunta a Voltorb Explosivo! (${ms.order.length}/${VE_MAX_PLAYERS})`, 'correct', { mirror: false });
    playVeJoin();
    renderVoltorbLobbyGrid();
    return;
  }

  // Cualquier otro mensaje que empiece por "!" se trata como intento de
  // respuesta: los jugadores escriben directamente "!<elemento>" (p. ej.
  // "!carmin" o "!azulona"), sin necesidad de un comando previo como "!r".
  if (ms.phase !== 'turn') return;
  const player = ms.players[user];
  if (!player || !player.alive) return;
  if (user !== ms.currentTurnUser) return;
  const raw = (typeof text === 'string' && text ? text : parts.join(' ')).trim();
  const answer = raw.slice(1).trim();
  if (!answer) return;
  resolveVoltorbAnswer(user, answer);
}

function sanitizeUser(user) {
  return user.replace(/[^a-zA-Z0-9_-]/g, '');
}
// Normaliza una respuesta para compararla: quita tildes/mayúsculas (vía
// normalizeAnswer) y además elimina espacios, guiones, apóstrofes y
// cualquier otro carácter que no sea letra o número, para que "Ho-Oh",
// "ho oh", "HOOH" y "hooh" se consideren todas la misma respuesta.
function veNorm(s) {
  return normalizeAnswer(s).replace(/[^a-z0-9]/g, '');
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderVoltorbLobby() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="ve-lobby-box game-scene" id="ve-lobby-scene">
      <div class="ve-lobby-head">
        <div class="ve-lobby-bomb-icon">💣</div>
        <div class="big-count pixel" id="ve-count">0</div>
        <div style="color:var(--muted);font-size:12px;">/ ${VE_MAX_PLAYERS} jugadores apuntados · escribe <b style="color:var(--yellow)">!participo</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:540px;margin:6px auto 0;line-height:1.6;">
          Os colocaréis todos formando un corro. Cada ronda saldrá una categoría y, por turnos
          (en el sentido de las agujas del reloj), tendréis que escribir <b style="color:#7be08a">!&lt;elemento&gt;</b>
          (por ejemplo <b style="color:#7be08a">!carmin</b>) sin repetir nada ya dicho.
          Tenéis 25 segundos por turno: fallar, no responder a tiempo, o repetir algo ya dicho cuesta una vida.
          Con 3 fallos, ¡tu Voltorb explota!
        </div>
      </div>
      <div class="ve-lobby-grid" id="ve-lobby-grid">
        <div class="ve-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="ve-start-btn" id="ve-start-btn" disabled>▶ Comenzar Partida</button>
    </div>
  `;
  $('ve-start-btn').onclick = () => startVoltorbMatch();
  renderVoltorbLobbyGrid();
}

function renderVoltorbLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('ve-lobby-grid');
  const countEl = $('ve-count');
  const btn = $('ve-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) {
    if (countEl.textContent !== String(players.length)) {
      countEl.textContent = players.length;
      countEl.classList.remove('bump');
      void countEl.offsetWidth;
      countEl.classList.add('bump');
    }
  }
  if (btn) btn.disabled = players.length < 2;
  if (players.length === 0) {
    grid.innerHTML = '<div class="ve-lobby-empty">Esperando a que el chat se apunte...</div>';
    ms.lobbyImgs = {};
    ms.lobbyCards = {};
    return;
  }
  const emptyMsg = grid.querySelector('.ve-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    if (ms.lobbyImgs[p.user]) return; // ya tiene tarjeta creada
    const card = document.createElement('div');
    card.className = 've-lobby-card';
    card.title = 'Clic para expulsar de la partida';
    const imgId = 've-lobby-img-' + sanitizeUser(p.user);
    card.innerHTML = `
      <div class="ve-ow-slot"><img id="${imgId}" class="ve-ow-img" alt=""></div>
      <div class="p-user">@${escapeHtml(p.user)}</div>
    `;
    // El streamer puede hacer clic en cualquier jugador inscrito para que
    // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleLobbyExpelPopover(ms, p.user, card, expelFromVoltorbLobby);
    });
    grid.appendChild(card);
    const img = $(imgId);
    applyOwNpcSprite(img, p.npc);
    ms.lobbyImgs[p.user] = img;
    ms.lobbyCards[p.user] = card;
  });
}

// Expulsa a un jugador inscrito del lobby (acción del streamer, no del
// propio usuario): se retira de la partida en curso y se le añade a
// expelledUsers para que no pueda volver a apuntarse con !participo hasta
// la siguiente partida (nueva llamada a startVoltorbExplosivo()).
function expelFromVoltorbLobby(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby' || !ms.players[user]) return;
  const idx = ms.order.indexOf(user);
  if (idx !== -1) ms.order.splice(idx, 1);
  delete ms.players[user];
  delete ms.lobbyImgs[user];
  const card = ms.lobbyCards[user];
  if (card) card.remove();
  delete ms.lobbyCards[user];
  ms.expelledUsers.add(user);
  addChatMessage(null, `🚫 @${user} ha sido expulsado de la partida por el streamer`, 'system', { mirror: false });
  renderVoltorbLobbyGrid();
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA
   --------------------------------------------------------- */
function startVoltorbMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const users = ms.order.slice();
  if (users.length < 2) {
    toast('Se necesitan al menos 2 jugadores para empezar');
    return;
  }
  // La música de este modo no suena durante el lobby de inscripción (ahí
  // sigue la del menú principal): arranca justo aquí, al cerrarse el lobby
  // y empezar la partida de verdad (ver MODES_WITHOUT_LOBBY_MUSIC en
  // modeLauncher.js).
  playModeMusic('voltorb-explosivo');
  users.forEach(u => {
    const p = ms.players[u];
    p.alive = true;
    p.lives = VE_START_LIVES;
  });
  computeVoltorbCirclePositions();
  renderVoltorbField();
  addChatMessage(null, `💣 ¡Comienza Voltorb Explosivo con ${users.length} jugadores formando un corro!`, 'system', { mirror: false });
  playVeMatchStart();
  // El primer turno de toda la partida se elige al azar; a partir de ahí,
  // los turnos siguientes siguen siempre el sentido horario del corro.
  ms.pendingTurnUser = users[Math.floor(Math.random() * users.length)];
  ms.voltorbPlaced = false;
  startVoltorbRound();
}

// Calcula, para cada jugador, su posición en el corro (en % del campo) y la
// posición "interior" donde se colocará el Voltorb cuando sea su turno.
function computeVoltorbCirclePositions() {
  const ms = state.modeState;
  const users = ms.order;
  const n = users.length;
  users.forEach((u, i) => {
    // Empieza arriba (como las 12 en punto) y avanza en el sentido de las
    // agujas del reloj a medida que aumenta el índice del array.
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const leftPct = 50 + VE_CIRCLE_RX * Math.cos(angle);
    const topPct = 50 + VE_CIRCLE_RY * Math.sin(angle);
    ms.circlePositions[u] = { leftPct, topPct, angle };
    ms.voltorbInnerPositions[u] = {
      leftPct: 50 + VE_CIRCLE_RX * VE_VOLTORB_INNER_FACTOR * Math.cos(angle),
      topPct: 50 + VE_CIRCLE_RY * VE_VOLTORB_INNER_FACTOR * Math.sin(angle),
    };
  });
}

/* ---------------------------------------------------------
   CAMPO DE JUEGO (EL CORRO)
   --------------------------------------------------------- */
function renderVoltorbField() {
  const content = $('game-content');
  const ms = state.modeState;
  const players = ms.order.map(u => ms.players[u]);
  content.innerHTML = `
    <div class="voltorb-wrap">
      <div class="voltorb-topbar">
        <div class="stat">🟢 Vivos: <b id="ve-alive-count">${players.length}</b></div>
        <div class="stat">🔄 Ronda: <b id="ve-round-num">0</b></div>
        <div class="stat" id="ve-timer"></div>
        <div class="stat ve-turn-hint" id="ve-turn-hint">Preparando el corro...</div>
      </div>
      <div class="ve-field-outer game-scene" id="ve-field-outer">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <div class="ve-circle-guide"></div>
        <div class="ve-players-layer" id="ve-players-layer"></div>
        <div class="ve-voltorb-token" id="ve-voltorb-token" style="display:none;">
          <div class="pmd-slot pmd-mini" id="ve-voltorb-sprite"></div>
          <div class="voltorb-white-mask"></div>
        </div>
      </div>
      <div class="voltorb-info-grid">
        <div class="ranking-panel" id="ve-players-panel">
          <div class="ranking-title">💣 Jugadores del corro</div>
          <div id="ve-players-list"></div>
        </div>
        <div class="battle-log" id="ve-log"><p style="color:var(--muted);font-style:italic;">¡Que empiece la ronda!</p></div>
      </div>
    </div>
  `;
  const layer = $('ve-players-layer');
  players.forEach(p => {
    const pos = ms.circlePositions[p.user];
    const el = document.createElement('div');
    // El sprite OW es una pose frontal estática; para dar la sensación de
    // que todos "miran" hacia el centro del corro, se espeja horizontalmente
    // a quienes caen en la mitad izquierda del círculo.
    const facingClass = pos && Math.cos(pos.angle) < 0 ? ' flip' : '';
    el.className = 've-player' + facingClass;
    el.id = p.elId;
    el.style.left = (pos ? pos.leftPct : 50) + '%';
    el.style.top = (pos ? pos.topPct : 50) + '%';
    const imgId = p.elId + '-img';
    el.innerHTML = `
      <div class="ve-player-name">@${escapeHtml(p.user)}</div>
      <div class="ve-ow-slot"><img id="${imgId}" class="ve-ow-img" alt=""></div>
      <div class="ve-player-lives" id="${p.elId}-lives">${livesHtml(p.lives)}</div>
      <div class="ve-player-badge" id="${p.elId}-badge"></div>
    `;
    layer.appendChild(el);
    applyOwNpcSprite($(imgId), p.npc);
  });
  ms.voltorbSprite = new PMDSprite($('ve-voltorb-sprite'), getPokemonSprite(VE_VOLTORB_DEX));
  ms.voltorbSprite.setDex(VE_VOLTORB_DEX);
  renderVoltorbPlayersList();
}

function livesHtml(lives) {
  const l = Math.max(0, lives);
  return '❤️'.repeat(l) + '🖤'.repeat(Math.max(0, VE_START_LIVES - l));
}

function updateVoltorbLivesUI(player) {
  const el = $(player.elId + '-lives');
  if (el) el.textContent = livesHtml(player.lives);
}

function markVoltorbPlayerDead(player) {
  const el = $(player.elId);
  if (el) el.classList.add('dead');
  const badge = $(player.elId + '-badge');
  if (badge) badge.textContent = '💀';
}

function updateVoltorbActiveHighlight() {
  const ms = state.modeState;
  document.querySelectorAll('.ve-player.active-turn').forEach(el => el.classList.remove('active-turn'));
  const player = ms.currentTurnUser && ms.players[ms.currentTurnUser];
  if (player) {
    const el = $(player.elId);
    if (el) el.classList.add('active-turn');
  }
}

const VE_BUBBLE_MS = 2600;      // tiempo que se mantiene visible el bocadillo
const VE_BUBBLE_OUT_MS = 250;   // duración de la animación de salida

// Muestra, en un bocadillo de diálogo sobre el sprite del jugador, lo que
// acaba de responder. "kind" puede ser 'correct' o 'wrong' para colorear
// el bocadillo según el resultado.
function showVoltorbAnswerBubble(user, text, kind) {
  const ms = state.modeState;
  const player = ms && ms.players[user];
  if (!player) return;
  const el = $(player.elId);
  if (!el) return;
  const old = el.querySelector('.ve-speech-bubble');
  if (old) old.remove();
  const bubble = document.createElement('div');
  bubble.className = 've-speech-bubble' + (kind ? ' ' + kind : '');
  bubble.textContent = text;
  el.appendChild(bubble);
  // Mientras el bocadillo está visible, el jugador pasa por delante del
  // Voltorb (ver .ve-player.ve-has-bubble en styles.css) para que el
  // bocadillo se vea siempre por encima si ambos se solapan.
  el.classList.add('ve-has-bubble');
  if (player.bubbleTimeout) clearTimeout(player.bubbleTimeout);
  player.bubbleTimeout = setTimeout(() => {
    bubble.classList.add('leaving');
    setTimeout(() => {
      bubble.remove();
      el.classList.remove('ve-has-bubble');
    }, VE_BUBBLE_OUT_MS);
  }, VE_BUBBLE_MS);
}

/* ---------------------------------------------------------
   RONDA: CARTEL DE CATEGORÍA
   --------------------------------------------------------- */
function startVoltorbRound() {
  const ms = state.modeState;
  if (!ms) return;
  ms.round += 1;
  ms.category = pickVoltorbCategory(ms.category ? ms.category.name : null);
  ms.usedItems = [];
  ms.currentTurnUser = ms.pendingTurnUser;
  ms.pendingTurnUser = null;
  ms.phase = 'categoryIntro';
  const roundNumEl = $('ve-round-num');
  if (roundNumEl) roundNumEl.textContent = ms.round;
  const hint = $('ve-turn-hint');
  if (hint) hint.textContent = '🔔 ¡Nueva categoría!';
  veLog(`🔄 Ronda ${ms.round}: categoría "${ms.category.name}"`, '');
  addChatMessage(null, `🔄 Ronda ${ms.round}: ¡la categoría es "${ms.category.name}"!`, 'system');
  showVoltorbCategoryBanner(ms.category, () => {
    const ms2 = state.modeState;
    if (!ms2 || ms2.phase !== 'categoryIntro') return;
    beginVoltorbTurnPhase();
  });
}

function showVoltorbCategoryBanner(category, onDone) {
  const ms = state.modeState;
  const field = $('ve-field-outer');
  if (!field) { onDone(); return; }
  const old = field.querySelector('.ve-category-banner-wrap');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.className = 've-category-banner-wrap';
  wrap.innerHTML = `
    <div class="ve-category-backdrop"></div>
    <div class="ve-category-banner" id="ve-category-banner">
      <div class="ve-category-label pixel">CATEGORÍA</div>
      <div class="ve-category-name pixel">${escapeHtml(category.name)}</div>
      <div class="ve-category-progress" id="ve-category-progress">0 / ${category.items.length}</div>
    </div>
    <div class="ve-category-timer-badge" id="ve-category-timer-badge"></div>
  `;
  field.appendChild(wrap);
  const banner = $('ve-category-banner');
  // Fuerza un reflow para que la animación de entrada se dispare siempre,
  // incluso si el nodo se acaba de insertar.
  void banner.offsetWidth;
  banner.classList.add('entering');
  playVeCategory();
  if (ms.categoryBannerTimeout) clearTimeout(ms.categoryBannerTimeout);
  ms.categoryBannerTimeout = setTimeout(() => {
    banner.classList.remove('entering');
    banner.classList.add('shrunk');
    const backdrop = wrap.querySelector('.ve-category-backdrop');
    if (backdrop) backdrop.classList.add('hide');
    ms.categoryBannerTimeout = setTimeout(() => {
      const ms2 = state.modeState;
      if (ms2) ms2.categoryBannerTimeout = null;
      onDone();
    }, VE_BANNER_SHRINK_MS);
  }, VE_BANNER_BIG_MS);
}

function updateVoltorbCategoryProgress() {
  const ms = state.modeState;
  const el = $('ve-category-progress');
  if (el && ms.category) el.textContent = `${ms.usedItems.length} / ${ms.category.items.length}`;
}

/* ---------------------------------------------------------
   RONDA: TURNOS
   --------------------------------------------------------- */
function beginVoltorbTurnPhase() {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'turn';
  announceVoltorbTurn();
  moveVoltorbTo(ms.currentTurnUser, () => {
    updateVoltorbActiveHighlight();
  });
}

function announceVoltorbTurn() {
  const ms = state.modeState;
  updateVoltorbActiveHighlight();
  renderVoltorbPlayersList();
  const hint = $('ve-turn-hint');
  if (hint) hint.textContent = `🎯 Turno de @${ms.currentTurnUser}`;
  veLog(`🎯 Turno de @${ms.currentTurnUser}`, '');
  addChatMessage(null, `🎯 Turno de @${ms.currentTurnUser} — responde con !<elemento> (tienes 25s)`, 'system');
  playVeTurn();
  startVoltorbTurnTimer(ms.currentTurnUser);
}

/* ---------------------------------------------------------
   TEMPORIZADOR DE TURNO (25s)
   --------------------------------------------------------- */
function clearVoltorbTurnTimer() {
  const ms = state.modeState;
  if (!ms) return;
  if (ms.turnTimeout) { clearTimeout(ms.turnTimeout); ms.turnTimeout = null; }
  if (ms.turnTickInterval) { clearInterval(ms.turnTickInterval); ms.turnTickInterval = null; }
  ms.turnDeadlineTs = null;
  ms.lastBeepSecond = null;
  const timerEl = $('ve-timer');
  if (timerEl) { timerEl.textContent = ''; timerEl.classList.remove('ve-timer-warn'); }
  const badge = $('ve-category-timer-badge');
  if (badge) { badge.textContent = ''; badge.classList.remove('visible', 've-timer-warn'); }
}

function startVoltorbTurnTimer(user) {
  const ms = state.modeState;
  if (!ms) return;
  clearVoltorbTurnTimer();
  ms.turnDeadlineTs = Date.now() + VE_TURN_TIMEOUT_MS;
  updateVoltorbTimerUI();
  ms.turnTickInterval = setInterval(updateVoltorbTimerUI, 250);
  ms.turnTimeout = setTimeout(() => {
    const ms2 = state.modeState;
    if (ms2) { ms2.turnTimeout = null; }
    clearVoltorbTurnTimer();
    handleVoltorbTurnTimeout(user);
  }, VE_TURN_TIMEOUT_MS);
}

function updateVoltorbTimerUI() {
  const ms = state.modeState;
  if (!ms || !ms.turnDeadlineTs) return;
  const remainingMs = ms.turnDeadlineTs - Date.now();
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const text = `⏱️ ${secs}s`;
  const warn = secs <= 10;

  // Pitido de cuenta atrás en cada uno de los últimos 5 segundos del turno
  // (una sola vez por segundo, aunque la UI se refresque cada 250ms).
  if (secs !== ms.lastBeepSecond) {
    ms.lastBeepSecond = secs;
    if (secs > 0 && secs <= 5) playCountdownBeep(secs);
  }

  const timerEl = $('ve-timer');
  if (timerEl) {
    timerEl.textContent = text;
    timerEl.classList.toggle('ve-timer-warn', warn);
  }

  // Badge del temporizador, mostrado justo al lado del cartel de categoría
  // (ya encogido en la esquina superior derecha).
  const badge = $('ve-category-timer-badge');
  if (badge) {
    badge.textContent = text;
    badge.classList.toggle('ve-timer-warn', warn);
    badge.classList.add('visible');
    positionVoltorbTimerBadge(badge);
  }
}

// Coloca el badge del temporizador justo a la izquierda del cartel de
// categoría (que puede tener anchuras distintas según el nombre de la
// categoría), recalculando su posición en cada tick del temporizador.
function positionVoltorbTimerBadge(badge) {
  const wrap = badge.parentElement;
  const banner = $('ve-category-banner');
  if (!wrap || !banner) return;
  const wrapRect = wrap.getBoundingClientRect();
  const bannerRect = banner.getBoundingClientRect();
  if (!wrapRect.width || !bannerRect.width) return;
  const gap = 10;
  const top = bannerRect.top - wrapRect.top + (bannerRect.height - badge.offsetHeight) / 2;
  const left = bannerRect.left - wrapRect.left - badge.offsetWidth - gap;
  badge.style.top = top + 'px';
  badge.style.left = Math.max(6, left) + 'px';
}

// Se agota el tiempo del turno: cuenta como fallo (pierde una vida) y el
// turno pasa al siguiente jugador vivo, igual que una respuesta errónea.
function handleVoltorbTurnTimeout(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'turn' || ms.currentTurnUser !== user) return;
  const player = ms.players[user];
  if (!player || !player.alive) return;

  player.lives -= 1;
  updateVoltorbLivesUI(player);
  veLog(`⏱️ @${user} se queda sin tiempo`, 'dmg');
  addChatMessage(null, `⏱️ @${user} se ha quedado sin tiempo. Le queda(n) ${Math.max(0, player.lives)} vida(s)`, 'wrong');
  playVeTimeout();
  renderVoltorbPlayersList();

  if (player.lives <= 0) {
    triggerVoltorbElimination(user);
  } else {
    const next = nextAliveSeatUser(user);
    ms.currentTurnUser = next;
    ms.phase = 'turn';
    setTimeout(() => {
      const ms2 = state.modeState;
      if (!ms2 || ms2.phase !== 'turn') return;
      announceVoltorbTurn();
      moveVoltorbTo(next, updateVoltorbActiveHighlight);
    }, VE_TURN_ADVANCE_DELAY_MS);
  }
}

function resolveVoltorbAnswer(user, answerRaw) {
  const ms = state.modeState;
  clearVoltorbTurnTimer();
  const norm = veNorm(answerRaw);
  const matchItem = ms.category.items.find(it => veItemMatchVariants(it).some(a => veNorm(a) === norm));
  const matchName = matchItem ? veItemName(matchItem) : null;
  const alreadyUsed = matchItem && ms.usedItems.includes(veNorm(matchName));

  if (matchItem && !alreadyUsed) {
    ms.usedItems.push(veNorm(matchName));
    addScore(user, 60);
    showVoltorbAnswerBubble(user, matchName, 'correct');
    veLog(`✅ @${user}: "${matchName}" ¡correcto!`, '');
    addChatMessage(null, `✅ @${user} acierta con "${matchName}"! +60 pts`, 'correct', { mirror: false });
    playVeCorrect();
    updateVoltorbCategoryProgress();
    renderVoltorbPlayersList();

    if (ms.usedItems.length >= ms.category.items.length) {
      finishVoltorbRoundComplete();
    } else {
      const next = nextAliveSeatUser(user);
      ms.currentTurnUser = next;
      ms.phase = 'turn';
      setTimeout(() => {
        const ms2 = state.modeState;
        if (!ms2 || ms2.phase !== 'turn') return;
        announceVoltorbTurn();
        moveVoltorbTo(next, updateVoltorbActiveHighlight);
      }, VE_TURN_ADVANCE_DELAY_MS);
    }
    return;
  }

  // Respuesta incorrecta (no existe en la categoría, o ya fue dicha antes)
  const player = ms.players[user];
  player.lives -= 1;
  updateVoltorbLivesUI(player);
  showVoltorbAnswerBubble(user, answerRaw, 'wrong');
  const reason = alreadyUsed ? `"${matchName}" ya se ha dicho` : `"${answerRaw}" no es válido`;
  veLog(`❌ @${user} falla (${reason})`, 'dmg');
  addChatMessage(null, `❌ @${user} falla: ${reason}. Le queda(n) ${Math.max(0, player.lives)} vida(s)`, 'wrong', { mirror: false });
  playVeWrong();
  renderVoltorbPlayersList();

  if (player.lives <= 0) {
    triggerVoltorbElimination(user);
  } else {
    const next = nextAliveSeatUser(user);
    ms.currentTurnUser = next;
    ms.phase = 'turn';
    setTimeout(() => {
      const ms2 = state.modeState;
      if (!ms2 || ms2.phase !== 'turn') return;
      announceVoltorbTurn();
      moveVoltorbTo(next, updateVoltorbActiveHighlight);
    }, VE_TURN_ADVANCE_DELAY_MS);
  }
}

// Busca, a partir de la posición en el corro de "fromUser", el siguiente
// jugador vivo en el sentido de las agujas del reloj (orden de ms.order).
function nextAliveSeatUser(fromUser) {
  const ms = state.modeState;
  const seats = ms.order;
  const n = seats.length;
  const startIdx = seats.indexOf(fromUser);
  if (startIdx === -1) return seats.find(u => ms.players[u].alive) || null;
  for (let step = 1; step <= n; step++) {
    const idx = (startIdx + step) % n;
    const u = seats[idx];
    if (ms.players[u] && ms.players[u].alive) return u;
  }
  return null;
}

function finishVoltorbRoundComplete() {
  const ms = state.modeState;
  ms.phase = 'roundTransition';
  const hint = $('ve-turn-hint');
  if (hint) hint.textContent = '🎉 ¡Categoría completada!';
  veLog('🎉 ¡Se han nombrado todos los elementos! Siguiente ronda...', '');
  addChatMessage(null, '🎉 ¡Categoría completada entre todos! Vamos a por la siguiente ronda...', 'system');
  playVeRoundComplete();
  ms.pendingTurnUser = nextAliveSeatUser(ms.currentTurnUser);
  if (ms.nextRoundTimeout) clearTimeout(ms.nextRoundTimeout);
  ms.nextRoundTimeout = setTimeout(() => {
    ms.nextRoundTimeout = null;
    startVoltorbRound();
  }, VE_ROUND_GAP_MS);
}

/* ---------------------------------------------------------
   MOVIMIENTO DEL VOLTORB
   --------------------------------------------------------- */
function angleToPmdDir(dx, dy) {
  if (dx === 0 && dy === 0) return PMD_DIR.down;
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  const norm = ((deg % 360) + 360) % 360;
  const dirs = [
    PMD_DIR.right, PMD_DIR.downRight, PMD_DIR.down, PMD_DIR.downLeft,
    PMD_DIR.left, PMD_DIR.upLeft, PMD_DIR.up, PMD_DIR.upRight,
  ];
  const idx = Math.round(norm / 45) % 8;
  return dirs[idx];
}

function moveVoltorbTo(targetUser, onArrive) {
  const ms = state.modeState;
  const token = $('ve-voltorb-token');
  const pos = ms.voltorbInnerPositions[targetUser];
  if (!token || !pos) { if (onArrive) onArrive(); return; }

  if (!ms.voltorbPlaced) {
    // Aparece directamente junto al jugador (sin caminar): es el primer
    // turno de la partida, o el Voltorb acaba de explotar y reaparece.
    token.style.transition = 'none';
    token.style.left = pos.leftPct + '%';
    token.style.top = pos.topPct + '%';
    token.style.display = '';
    token.classList.remove('growing', 'blasting');
    token.classList.add('spawning');
    void token.offsetWidth;
    token.style.transition = '';
    if (ms.voltorbSprite) ms.voltorbSprite.play('Walk', PMD_DIR.down, true, null, VE_ANIM_SPEED);
    ms.voltorbPlaced = true;
    ms.voltorbCurrentPos = pos;
    if (ms.moveTimeout) clearTimeout(ms.moveTimeout);
    ms.moveTimeout = setTimeout(() => {
      token.classList.remove('spawning');
      if (onArrive) onArrive();
    }, VE_SPAWN_MS);
    return;
  }

  const prev = ms.voltorbCurrentPos || pos;
  const dir = angleToPmdDir(pos.leftPct - prev.leftPct, pos.topPct - prev.topPct);
  if (ms.voltorbSprite) ms.voltorbSprite.play('Walk', dir, true, null, VE_ANIM_SPEED);
  token.style.left = pos.leftPct + '%';
  token.style.top = pos.topPct + '%';
  ms.voltorbCurrentPos = pos;
  if (ms.moveTimeout) clearTimeout(ms.moveTimeout);
  ms.moveTimeout = setTimeout(() => {
    ms.moveTimeout = null;
    if (ms.voltorbSprite) ms.voltorbSprite.play('Walk', PMD_DIR.down, true, null, VE_ANIM_SPEED);
    if (onArrive) onArrive();
  }, VE_MOVE_MS);
}

/* ---------------------------------------------------------
   ELIMINACIÓN: EL VOLTORB EXPLOTA
   --------------------------------------------------------- */
function triggerVoltorbElimination(user) {
  const ms = state.modeState;
  clearVoltorbTurnTimer();
  ms.phase = 'exploding';
  const player = ms.players[user];
  player.alive = false;
  markVoltorbPlayerDead(player);
  renderVoltorbPlayersList();
  const hint = $('ve-turn-hint');
  if (hint) hint.textContent = `💥 ¡El Voltorb de @${user} está a punto de explotar!`;
  veLog(`💥 @${user} se queda sin vidas... ¡su Voltorb va a explotar!`, 'dmg');
  addChatMessage(null, `💥 @${user} se ha quedado sin vidas... ¡cuidado!`, 'wrong', { mirror: false });

  playVoltorbExplosion(() => {
    addChatMessage(null, `💥 ¡BOOM! El Voltorb de @${user} ha explotado`, 'system');
    const aliveCountEl = $('ve-alive-count');
    const stillAlive = ms.order.map(u => ms.players[u]).filter(p => p.alive);
    if (aliveCountEl) aliveCountEl.textContent = stillAlive.length;

    if (stillAlive.length <= 1) {
      endVoltorbMatch(stillAlive[0] || null);
      return;
    }
    ms.pendingTurnUser = nextAliveSeatUser(user);
    ms.voltorbPlaced = false;
    ms.phase = 'roundTransition';
    const hint2 = $('ve-turn-hint');
    if (hint2) hint2.textContent = '⏳ Siguiente ronda en unos segundos...';
    veLog(`⏳ Siguiente ronda en unos segundos... (quedan ${stillAlive.length})`, '');
    if (ms.nextRoundTimeout) clearTimeout(ms.nextRoundTimeout);
    ms.nextRoundTimeout = setTimeout(() => {
      ms.nextRoundTimeout = null;
      startVoltorbRound();
    }, VE_ROUND_GAP_MS);
  });
}

function playVoltorbExplosion(onDone) {
  const ms = state.modeState;
  const token = $('ve-voltorb-token');
  if (!token) { onDone(); return; }
  token.classList.add('growing');
  playVeGrow(VE_GROW_MS);
  if (ms.growTimeout) clearTimeout(ms.growTimeout);
  ms.growTimeout = setTimeout(() => {
    ms.growTimeout = null;
    token.classList.remove('growing');
    token.classList.add('blasting');
    playVeExplosion();
    spawnVoltorbBlastFx(token);
    if (ms.blastTimeout) clearTimeout(ms.blastTimeout);
    ms.blastTimeout = setTimeout(() => {
      ms.blastTimeout = null;
      token.classList.remove('blasting');
      token.style.display = 'none';
      const field = $('ve-field-outer');
      if (field) field.querySelectorAll('.ve-blast-fx').forEach(n => n.remove());
      onDone();
    }, VE_BLAST_MS);
  }, VE_GROW_MS);
}

// Genera el estallido "vistoso": un flash general del campo, un anillo de
// onda expansiva y varias chispas que salen disparadas en todas direcciones
// desde la posición del Voltorb.
function spawnVoltorbBlastFx(token) {
  const field = $('ve-field-outer');
  if (!field) return;
  const left = token.style.left;
  const top = token.style.top;

  // Pequeño temblor de cámara para reforzar el impacto del estallido.
  field.classList.remove('ve-shake');
  void field.offsetWidth;
  field.classList.add('ve-shake');
  setTimeout(() => field.classList.remove('ve-shake'), 460);

  const flash = document.createElement('div');
  flash.className = 've-blast-fx ve-blast-flash';
  field.appendChild(flash);

  const ring = document.createElement('div');
  ring.className = 've-blast-fx ve-blast-ring';
  ring.style.left = left;
  ring.style.top = top;
  field.appendChild(ring);

  const sparkCount = 14;
  for (let i = 0; i < sparkCount; i++) {
    const angle = (i / sparkCount) * 360 + (Math.random() * 14 - 7);
    const dist = 70 + Math.random() * 55;
    const spark = document.createElement('div');
    spark.className = 've-blast-fx ve-blast-spark';
    spark.style.left = left;
    spark.style.top = top;
    spark.style.setProperty('--ve-spark-angle', angle + 'deg');
    spark.style.setProperty('--ve-spark-dist', dist + 'px');
    field.appendChild(spark);
  }

  // Bocanadas de humo que suben y se disipan, para dar algo más de "cuerpo"
  // a la explosión una vez pasa el flash inicial.
  const smokeCount = 5;
  for (let i = 0; i < smokeCount; i++) {
    const smoke = document.createElement('div');
    smoke.className = 've-blast-fx ve-blast-smoke';
    smoke.style.left = left;
    smoke.style.top = top;
    smoke.style.setProperty('--ve-smoke-dx', (Math.random() * 50 - 25) + 'px');
    smoke.style.animationDelay = (Math.random() * 120) + 'ms';
    field.appendChild(smoke);
  }
}

/* ---------------------------------------------------------
   PANEL LATERAL DE JUGADORES
   --------------------------------------------------------- */
function renderVoltorbPlayersList() {
  const ms = state.modeState;
  const list = $('ve-players-list');
  if (!ms || !list) return;
  const players = ms.order.map(u => ms.players[u]);
  if (players.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);">Sin jugadores</div>';
    return;
  }
  list.innerHTML = players.map(p => {
    let statusIcon = '';
    const isActive = p.alive && ms.phase === 'turn' && p.user === ms.currentTurnUser;
    if (!p.alive) statusIcon = '💀';
    else if (isActive) statusIcon = '🎯';
    return `
      <div class="ve-player-row${!p.alive ? ' dead' : ''}${isActive ? ' active' : ''}">
        <span>@${escapeHtml(p.user)}</span>
        <span class="ve-player-row-lives">${livesHtml(p.lives)}</span>
        <span class="ve-player-status">${statusIcon}</span>
      </div>
    `;
  }).join('');
}

function veLog(text, cls = '') {
  const log = $('ve-log');
  if (!log) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}

/* ---------------------------------------------------------
   FIN DE PARTIDA
   --------------------------------------------------------- */
function endVoltorbMatch(winner) {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'ended';
  clearVoltorbTurnTimer();
  const hint = $('ve-turn-hint');
  if (hint) hint.textContent = '🏁 Partida terminada';
  if (ms.categoryBannerTimeout) clearTimeout(ms.categoryBannerTimeout);
  if (ms.nextRoundTimeout) clearTimeout(ms.nextRoundTimeout);
  if (ms.moveTimeout) clearTimeout(ms.moveTimeout);
  if (ms.growTimeout) clearTimeout(ms.growTimeout);
  if (ms.blastTimeout) clearTimeout(ms.blastTimeout);
  ms.categoryBannerTimeout = null; ms.nextRoundTimeout = null; ms.moveTimeout = null;
  ms.growTimeout = null; ms.blastTimeout = null;
  if (ms.voltorbSprite) { ms.voltorbSprite.destroy(); ms.voltorbSprite = null; }

  const field = $('ve-field-outer');
  if (field) {
    const leftoverBanner = field.querySelector('.ve-category-banner-wrap');
    if (leftoverBanner) leftoverBanner.remove();
    field.querySelectorAll('.ve-blast-fx').forEach(n => n.remove());
  }

  if (winner) {
    addScore(winner.user, 400);
    veLog(`🏆 ¡@${winner.user} gana Voltorb Explosivo!`, 'crit');
    addChatMessage(null, `🏆 ¡@${winner.user} gana Voltorb Explosivo siendo el último en pie!`, 'correct');
    playVeVictory();
  } else {
    veLog('🤝 La partida termina sin supervivientes', '');
    addChatMessage(null, '🤝 Voltorb Explosivo termina sin supervivientes', 'system');
    playVeDraw();
  }
  if (field) {
    const banner = document.createElement('div');
    banner.className = 've-victory-banner';
    const answersBtn = ms.category
      ? '<button class="ve-answers-btn" id="ve-answers-btn">📋 Ver todas las respuestas</button>'
      : '';
    banner.innerHTML = winner ? `
      <div class="ve-ow-slot big"><img id="ve-winner-img" class="ve-ow-img" alt=""></div>
      <div class="win-title pixel">¡VICTORIA!</div>
      <div class="win-sub">@${escapeHtml(winner.user)} es el último en pie</div>
      ${answersBtn}
      <div class="mode-end-actions">
        <button class="ve-start-btn" id="ve-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="ve-menu-btn">🏠 Menú Principal</button>
      </div>
    ` : `
      <div class="win-title pixel">SIN SUPERVIVIENTES</div>
      ${answersBtn}
      <div class="mode-end-actions">
        <button class="ve-start-btn" id="ve-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="ve-menu-btn">🏠 Menú Principal</button>
      </div>
    `;
    field.appendChild(banner);
    if (winner) {
      applyOwNpcSprite($('ve-winner-img'), winner.npc);
      spawnVoltorbConfetti(banner);
    }
    const again = $('ve-again-btn');
    if (again) again.onclick = () => startVoltorbExplosivo();
    const menuBtn = $('ve-menu-btn');
    if (menuBtn) menuBtn.onclick = () => backToMenu();
    const answers = $('ve-answers-btn');
    if (answers) answers.onclick = () => showVoltorbFinalAnswers();
  }
}

// Lanza un puñado de piezas de confeti cayendo desde arriba del banner de
// victoria, en varios colores del tema del juego.
function spawnVoltorbConfetti(banner) {
  const colors = ['#FFCB05', '#E3350D', '#4DAD5B', '#3B4CCA', '#ffffff'];
  const pieceCount = 34;
  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement('div');
    piece.className = 've-confetti-piece';
    piece.style.left = (Math.random() * 100) + '%';
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
    piece.style.animationDelay = (Math.random() * 0.7) + 's';
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    banner.appendChild(piece);
  }
}

// Muestra un modal con todas las respuestas posibles de la última
// categoría jugada, marcando en verde las que algún jugador llegó a
// decir durante esa ronda antes de que terminara la partida.
function showVoltorbFinalAnswers() {
  const ms = state.modeState;
  if (!ms || !ms.category) return;
  const usedSet = new Set(ms.usedItems);
  const items = ms.category.items;
  const saidCount = items.filter(it => usedSet.has(veNorm(veItemName(it)))).length;
  const summary = `
    <div class="ve-answers-summary">
      Categoría: <b style="color:var(--text)">${escapeHtml(ms.category.name)}</b><br>
      <span style="color:#7be08a;">${saidCount} / ${items.length}</span> dichas por el chat en esa ronda
    </div>
  `;
  const grid = `
    <div class="ve-answers-grid">
      ${items.map(it => {
        const name = veItemName(it);
        const said = usedSet.has(veNorm(name));
        return `<span class="ve-answer-chip${said ? ' said' : ''}">${escapeHtml(name)}</span>`;
      }).join('')}
    </div>
  `;
  showModal('📋 Respuestas posibles', summary + grid, [{ label: 'Cerrar', class: 'btn-primary' }]);
}
