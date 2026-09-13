import { addChatMessage, escapeHtml } from '../chat.js';
import { bossSpriteLockBlockMessage } from '../bossSpriteLocks.js';
import { ARENA_POKEMON_DB } from '../data/arenaPokemonDb.js';
import { getPokemonSprite } from '../data/pokemonDb.js';
import { currentFullscreenElement, requestSceneFullscreen } from '../fullscreen.js';
import { toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { backToMenu } from '../modeLauncher.js';
import { PMDSprite, PMD_DIR, pmdHasLocalSprite, pmdPreload } from '../pmdSprite.js';
import { rollShinyPokemon } from '../pokemonShiny.js';
import { state } from '../state.js';
import { $, addScore, toast } from '../utils.js';
import {
  playSafariGoal, playSafariShot, playVeJoin, playModeMusic,
  playSafariMatchStart, playSafariEyesClose, playSafariEyesReady,
  playSafariHit, playSafariTimeUp, playSafariVictory, playSafariWipeout,
} from '../audio.js';

/* =========================================================
   MODO ZONA SAFARI
   -----------------------------------------------------------
   - Fase de lobby: los viewers se apuntan con !pokemon [nombre],
     igual que en Battle Royale / Pokerus, viéndose como su sprite
     PMD animado "de pie" en su tarjeta.
   - Al comenzar, todos los Pokémon aparecen en columna en el borde
     izquierdo del terreno, repartidos a partes iguales en altura.
   - Cada jugador controla si su Pokémon camina o no con !go / !stop
     (empiezan quietos). Solo un Pokémon que esté caminando puede
     ser alcanzado por un disparo; uno parado es intocable.
   - El streamer apunta con el ratón: al mantener pulsado el click
     izquierdo se abre una mirilla con zoom que sigue al cursor: al
     soltar, dispara sobre el punto en el que se soltó.
   - Hay una línea de meta vertical a la derecha del mapa. El
     Pokémon que la cruza gana (queda a salvo, ya no se puede
     disparar), pero la partida sigue hasta que el resto de
     Pokémon con vida también lleguen o mueran.
   - La partida termina cuando el streamer ha matado a todos los
     Pokémon, o cuando todos los que siguen con vida han llegado a
     la meta.
   ========================================================= */

const SAFARI_STAND_ANIM_SPEED = 2.6;   // animación "Walk" lenta = de pie (mismo truco que Pokerus)
const SAFARI_WALK_ANIM_SPEED = 3.2;    // animación "Walk" mientras camina de verdad
const SAFARI_TICK_MS = 50;             // frecuencia del bucle de movimiento
const SAFARI_WALK_PX_PER_S = (55 / 6) * 2; // velocidad real de desplazamiento por el mapa — el doble que antes; la animación de caminar (SAFARI_WALK_ANIM_SPEED) no cambia, solo el avance por el mapa
const SAFARI_START_X_PCT = 8;          // columna inicial (izquierda)
const SAFARI_TOP_SIGN_CLEARANCE_PCT = 19; // margen superior para dejar sitio al cartel de !go/!stop (que ocupa como mucho el 15% de alto)
const SAFARI_FINISH_X_PCT = 90;        // posición interna de la línea de meta (no se muestra)
const SAFARI_EXIT_X_PCT = 108;         // hasta dónde sigue caminando solo tras tocar la meta, para salir del todo del encuadre (si le da tiempo dentro de SAFARI_FINISH_WALK_MS)
const SAFARI_FINISH_WALK_MS = 2000;    // cuánto tiempo sigue caminando solo hacia la derecha tras tocar la meta, antes de detenerse del todo
const SAFARI_ZOOM_SCALE = 2.2;         // zoom de la mirilla al apuntar (fuente real: setupSafariShooting fija --safari-zoom-scale con este valor; debe casar con el fallback de .safari-field-outer.aiming .safari-field-inner en styles.css)
const SAFARI_DEATH_FADE_MS = 600;      // duración del desvanecido/caída tras el Hurt (debe casar con @keyframes safariFaint)
const SAFARI_GOAL_CONFETTI_MS = 5000;          // duración total de las partículas de confeti al tocar la meta
const SAFARI_GOAL_CONFETTI_INTERVAL_MS = 110;  // cada cuánto se lanza un puñado nuevo de partículas
const SAFARI_GOAL_CONFETTI_COLORS = ['#FFCB05', '#E3350D', '#4DAD5B', '#3B4CCA', '#ffffff'];

const SAFARI_EYES_CLOSE_ANIM_MS = 450; // duración de la animación de cerrar los párpados
const SAFARI_EYES_OPEN_ANIM_MS = 450;  // duración de la animación de abrir los párpados
const SAFARI_EYES_BLACK_MS = 5000;     // tiempo con la pantalla en negro antes de poder reabrir
const SAFARI_EYES_RING_R = 44;         // radio del círculo SVG del marcador de tiempo
const SAFARI_EYES_RING_CIRC = 2 * Math.PI * SAFARI_EYES_RING_R;

const SAFARI_TIMER_START_S = 100;      // segundos del temporizador de la partida (solo baja con los ojos cerrados)

export function startSafari() {
  // Igual que en Rayo Solar (ver el comentario largo en startRayoSolar,
  // rayosolar.js): al pulsar "Nueva Partida" (ver el botón
  // #safari-again-btn tras endSafari) esta misma función reconstruye el
  // lobby, lo que destruye por completo el contenido anterior de
  // #game-content -incluido el campo (#safari-field-outer) que estaba en
  // pantalla completa mientras se jugaba-, sacando al navegador de
  // pantalla completa por su cuenta. Se guarda si había pantalla completa
  // activa ANTES de reconstruir nada para restaurarla sobre el lobby
  // nuevo justo después (ver más abajo).
  const wasFullscreen = !!currentFullscreenElement();
  state.modeState = {
    phase: 'lobby',      // 'lobby' | 'playing' | 'ended'
    players: {},           // user -> jugador
    order: [],
    lobbySprites: {},      // user -> { el, sprite, dex } — caminantes PMD del lobby
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startSafari(), es decir, al empezar una nueva partida).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    fieldSprites: {},      // user -> { el, sprite } — sprites PMD sobre el terreno
    tickInterval: null,
    lastTick: null,
    aiming: false,
    eyes: { phase: 'idle', closeTimer: null, countdownInterval: null }, // 'idle' | 'closing' | 'timer' | 'ready' | 'opening'
    timeLeftMs: SAFARI_TIMER_START_S * 1000, // solo desciende mientras los ojos NO están 'idle' (cerrados/en transición)
    timeUp: false,
  };
  renderSafariLobby();
  if (wasFullscreen) {
    // Restaura la pantalla completa sobre el lobby recién creado (ver el
    // comentario de arriba).
    requestSceneFullscreen($('safari-lobby-scene'));
  }
  ensureSafariKeyboardBound();
  addChatMessage(null, `🌿 ¡Zona Safari abierta! Escribe !pokemon [nombre] para apuntarte. ¡Disponible toda la Pokédex Nacional (${ARENA_POKEMON_DB.length} Pokémon)!`, 'system');
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderSafariLobby() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="safari-lobby-box game-scene" id="safari-lobby-scene">
      <div class="safari-lobby-head">
        <div class="big-count pixel" id="safari-count">0</div>
        <div style="color:var(--muted);font-size:12px;">jugadores apuntados · escribe <b style="color:var(--yellow)">!pokemon [nombre]</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:520px;margin:6px auto 0;line-height:1.6;">
          Controlaréis a vuestro Pokémon con <b style="color:#7be08a">!go</b> (caminar) y <b style="color:#ff8b7b">!stop</b> (quedarse quieto).
          El streamer solo podrá cazar a los que estén caminando: ¡llegad a la meta sin que os disparen!
        </div>
      </div>
      <div class="safari-lobby-grid" id="safari-lobby-grid">
        <div class="safari-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="safari-start-btn" id="safari-start-btn" disabled>▶ Comenzar Partida</button>
    </div>
  `;
  $('safari-start-btn').onclick = () => startSafariMatch();
  renderSafariLobbyGrid();
}

// Igual que en Pokerus: cada jugador tiene su propia tarjeta con un sprite
// PMD que se crea una sola vez y se conserva mientras esté en el lobby.
function renderSafariLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('safari-lobby-grid');
  const countEl = $('safari-count');
  const btn = $('safari-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (btn) btn.disabled = players.length < 1;

  if (players.length === 0) {
    grid.innerHTML = '<div class="safari-lobby-empty">Esperando a que el chat se apunte...</div>';
    return;
  }
  const emptyMsg = grid.querySelector('.safari-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    let entry = ms.lobbySprites[p.user];
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'safari-lobby-card';
      el.title = 'Clic para expulsar de la partida';
      const spriteId = 'sf-lobby-' + sanitizeUser(p.user);
      el.innerHTML = `
        <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
        <div class="p-name">${escapeHtml(p.pokemon.name)}</div>
        <div class="p-user">@${escapeHtml(p.user)}</div>
      `;
      // El streamer puede hacer clic en cualquier jugador inscrito para que
      // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleLobbyExpelPopover(ms, p.user, el, expelFromSafariLobby);
      });
      grid.appendChild(el);
      const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
      sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      sprite.play('Walk', PMD_DIR.down, true, null, SAFARI_STAND_ANIM_SPEED);
      ms.lobbySprites[p.user] = { el, sprite, dex: p.pokemon.sprite };
    } else if (entry.dex !== p.pokemon.sprite) {
      entry.sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      entry.sprite.play('Walk', PMD_DIR.down, true, null, SAFARI_STAND_ANIM_SPEED);
      entry.dex = p.pokemon.sprite;
      const nameEl = entry.el.querySelector('.p-name');
      if (nameEl) nameEl.textContent = p.pokemon.name;
    }
  });
}

function sanitizeUser(user) {
  return user.replace(/[^a-zA-Z0-9_-]/g, '');
}

// Expulsa a un jugador inscrito del lobby (acción del streamer, no del
// propio usuario): se retira de la partida en curso y se le añade a
// expelledUsers para que no pueda volver a apuntarse con !pokemon hasta
// la siguiente partida (nueva llamada a startSafari()).
function expelFromSafariLobby(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby' || !ms.players[user]) return;
  const idx = ms.order.indexOf(user);
  if (idx !== -1) ms.order.splice(idx, 1);
  delete ms.players[user];
  const entry = ms.lobbySprites[user];
  if (entry) {
    if (entry.sprite) entry.sprite.destroy();
    if (entry.el) entry.el.remove();
  }
  delete ms.lobbySprites[user];
  ms.expelledUsers.add(user);
  addChatMessage(null, `🚫 @${user} ha sido expulsado de la partida por el streamer`, 'system', { mirror: false });
  renderSafariLobbyGrid();
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleSafariCmd(user, cmd, parts) {
  const ms = state.modeState;
  if (!ms) return;

  if (cmd === '!pokemon') {
    if (ms.phase !== 'lobby') {
      if (ms.phase === 'playing') addChatMessage(null, `${user}: la partida ya ha comenzado, ¡espera a la siguiente!`, 'system', { mirror: false });
      return;
    }
    if (ms.expelledUsers && ms.expelledUsers.has(user)) {
      addChatMessage(null, `${user}: el streamer te ha expulsado de esta partida, no puedes volver a apuntarte hasta la siguiente`, 'system', { mirror: false });
      return;
    }
    const name = parts.slice(1).join(' ').toLowerCase().trim();
    if (!name) return;
    const foundPokemon = ARENA_POKEMON_DB.find(p => p.name.toLowerCase() === name);
    if (!foundPokemon) {
      addChatMessage(null, `${user}: Pokémon no encontrado. Prueba: ${ARENA_POKEMON_DB.slice(0, 5).map(p => p.name).join(', ')}`, 'system');
      return;
    }
    // Formas especiales todavía no desbloqueadas (Wishiwashi Banco,
    // Aegislash Espada...; ver bossSpriteLocks.js): no se dejan elegir
    // hasta superar la fase del Boss que las desbloquea.
    const lockMsg = bossSpriteLockBlockMessage(foundPokemon.name, user);
    if (lockMsg) {
      addChatMessage(null, lockMsg, 'system');
      return;
    }
    // Un puñado de Pokémon (ver README_PMD_LOCAL.md) todavía no tienen su
    // sprite PMD completo en el repositorio comunitario de PMDCollab: no se
    // dejan elegir, para no depender de la red ni verse a medias en pantalla.
    if (!pmdHasLocalSprite(foundPokemon.sprite)) {
      addChatMessage(null, `Lo sentimos, el Pokémon ${foundPokemon.name} aún no tiene sprite en el juego, por favor elige otro.`, 'system');
      return;
    }
    // rollShinyPokemon() devuelve una copia nueva (0.5% de isShiny:true, ver
    // js/pokemonShiny.js), nunca la entrada original compartida de
    // ARENA_POKEMON_DB.
    const pokemon = rollShinyPokemon(foundPokemon);
    const isNew = !ms.players[user];
    ms.players[user] = {
      user,
      pokemon,
      xPct: SAFARI_START_X_PCT,
      yPct: 50,
      moving: false,
      alive: true,
      reachedGoal: false,
      finishing: false, // true entre el instante en que toca la línea de meta y el instante en que la cruza por completo
      elId: 'sf-' + sanitizeUser(user),
    };
    if (isNew) ms.order.push(user);
    pmdPreload(pokemon.sprite);
    addChatMessage(null, `✅ ${user} se apunta con ${pokemon.name}!`, 'correct', { mirror: false });
    if (isNew) playVeJoin();
    renderSafariLobbyGrid();
    return;
  }

  if (cmd === '!go' || cmd === '!stop') {
    if (ms.phase !== 'playing') return;
    const p = ms.players[user];
    // Mientras ya ha tocado la meta (finishing) o ya la ha cruzado del todo
    // (reachedGoal), el jugador ya no controla a su Pokémon: avanza solo.
    if (!p || !p.alive || p.reachedGoal || p.finishing) return;
    const shouldMove = cmd === '!go';
    if (p.moving === shouldMove) return;
    p.moving = shouldMove;
    updateSafariWalkerAnim(p);
    addChatMessage(null, `${shouldMove ? '🏃' : '🧍'} ${p.pokemon.name} (@${user}) ${shouldMove ? 'empieza a caminar' : 'se queda quieto'}`, 'action', { mirror: false });
  }
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA
   --------------------------------------------------------- */
function destroySafariSprites(registry) {
  if (!registry) return;
  Object.values(registry).forEach(entry => {
    if (entry.sprite) entry.sprite.destroy();
  });
}

function startSafariMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const users = ms.order.slice();
  if (users.length < 1) {
    toast('Se necesita al menos 1 jugador para empezar');
    return;
  }
  destroySafariSprites(ms.lobbySprites);
  ms.lobbySprites = {};

  ms.phase = 'playing';
  // La música de este modo no suena durante el lobby de inscripción (ahí
  // sigue la del menú principal): arranca justo aquí, al cerrarse el lobby
  // y empezar la partida de verdad (ver MODES_WITHOUT_LOBBY_MUSIC en
  // modeLauncher.js).
  playModeMusic('zona-safari');
  playSafariMatchStart();
  const n = users.length;
  users.forEach((u, i) => {
    const p = ms.players[u];
    p.xPct = SAFARI_START_X_PCT;
    // Repartidos en columna, con margen abajo y dejando libre la franja
    // superior (hasta SAFARI_TOP_SIGN_CLEARANCE_PCT) donde va el cartel de
    // instrucciones (!go/!stop, ver .safari-status-sign), que no debe ocupar
    // más del 15% vertical del campo.
    p.yPct = SAFARI_TOP_SIGN_CLEARANCE_PCT + ((i + 0.5) / n) * (92 - SAFARI_TOP_SIGN_CLEARANCE_PCT);
    p.moving = false;
    p.alive = true;
    p.reachedGoal = false;
  });
  renderSafariField();
  addChatMessage(null, `🌿 ¡Comienza la Zona Safari con ${n} Pokémon! Escribid !go / !stop para moveros`, 'system', { mirror: false });
  ms.lastTick = performance.now();
  ms.tickInterval = setInterval(safariTick, SAFARI_TICK_MS);
}

/* ---------------------------------------------------------
   CAMPO DE JUEGO
   --------------------------------------------------------- */
function renderSafariField() {
  const content = $('game-content');
  const ms = state.modeState;
  const players = ms.order.map(u => ms.players[u]);
  content.innerHTML = `
    <div class="safari-wrap">
      <div class="safari-topbar">
        <div class="stat">🟢 Vivos: <b id="safari-alive-count">${players.length}</b></div>
        <div class="stat">🏁 En meta: <b id="safari-goal-count">0</b></div>
        <div class="stat">💀 Cazados: <b id="safari-dead-count">0</b></div>
        <div class="stat safari-hint">🎯 Mantén pulsado el click para apuntar, suelta para disparar</div>
        <div class="stat safari-hint">😌 Pulsa ESPACIO para cerrar los ojos</div>
      </div>
      <div class="safari-field-outer game-scene" id="safari-field-outer">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <div class="safari-countdown" id="safari-countdown" title="Cuenta atrás: solo baja con los ojos cerrados">⏱ <span id="safari-countdown-num">${SAFARI_TIMER_START_S}</span>s</div>
        <div class="safari-status-sign">
          <div class="zor-sign-board">
            <div class="zor-sign-title">Avanza o Detente con los comandos:</div>
            <div class="zor-sign-cmds">
              <span>!go</span><span>!stop</span>
            </div>
          </div>
        </div>
        <div class="safari-field-inner" id="safari-field-inner">
        </div>
        <!-- Mirilla del streamer: el propio div recibe --sx/--sy (ver
             updateAim en setupSafariShooting más abajo) y se encarga solo
             del velo oscuro alrededor del punto de mira; el diseño de la
             mirilla en sí (anillos, cruz con hueco central, marcas y
             esquinas de visor) vive en .safari-scope-reticle, un hijo que
             hereda esas mismas variables para colocarse centrado en el
             punto exacto sin tener que repetir el cálculo en cada pieza
             -ver .safari-scope-reticle y sus hijos en styles.css-. -->
        <div class="safari-scope" id="safari-scope">
          <div class="safari-scope-reticle">
            <span class="safari-scope-ring safari-scope-ring--outer"></span>
            <span class="safari-scope-ring safari-scope-ring--inner"></span>
            <span class="safari-scope-crosshair safari-scope-crosshair--n"></span>
            <span class="safari-scope-crosshair safari-scope-crosshair--e"></span>
            <span class="safari-scope-crosshair safari-scope-crosshair--s"></span>
            <span class="safari-scope-crosshair safari-scope-crosshair--w"></span>
            <span class="safari-scope-corner safari-scope-corner--tl"></span>
            <span class="safari-scope-corner safari-scope-corner--tr"></span>
            <span class="safari-scope-corner safari-scope-corner--bl"></span>
            <span class="safari-scope-corner safari-scope-corner--br"></span>
            <span class="safari-scope-dot"></span>
          </div>
        </div>
        <div class="safari-eyes-overlay" id="safari-eyes-overlay">
          <div class="safari-eyes-lid top"></div>
          <div class="safari-eyes-lid bottom"></div>
          <div class="safari-eyes-timer" id="safari-eyes-timer">
            <svg class="safari-eyes-ring" viewBox="0 0 100 100">
              <circle class="track" cx="50" cy="50" r="44"></circle>
              <circle class="fill" id="safari-eyes-ring-fill" cx="50" cy="50" r="44"></circle>
            </svg>
            <div class="safari-eyes-ring-num" id="safari-eyes-ring-num"></div>
          </div>
          <div class="safari-eyes-msg" id="safari-eyes-msg"></div>
        </div>
      </div>
      <div class="safari-info-grid">
        <div class="ranking-panel" id="safari-status-panel">
          <div class="ranking-title">🦌 Estado de los Pokémon</div>
          <div id="safari-status-list"></div>
        </div>
        <div class="battle-log" id="safari-log"><p style="color:var(--muted);">Esperando movimientos...</p></div>
      </div>
    </div>
  `;
  ms.fieldSprites = {};
  players.forEach(p => createSafariWalker(p));
  setupSafariShooting();
  renderSafariStatusList();
}

function createSafariWalker(p) {
  const ms = state.modeState;
  const inner = $('safari-field-inner');
  if (!inner) return;
  const el = document.createElement('div');
  el.className = 'safari-walker';
  el.id = p.elId;
  el.style.left = p.xPct + '%';
  el.style.top = p.yPct + '%';
  const spriteId = 'sf-sprite-' + sanitizeUser(p.user);
  el.innerHTML = `
    <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
    <div class="safari-name">@${escapeHtml(p.user)}</div>
  `;
  inner.appendChild(el);
  const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
  sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
  ms.fieldSprites[p.user] = { el, sprite };
  updateSafariWalkerAnim(p); // respeta si arranca parado (congelado) o caminando
}

function updateSafariWalkerAnim(p) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[p.user];
  if (!entry) return;
  if (p.moving) {
    // Caminando: bucle continuo del ciclo de andar.
    entry.sprite.play('Walk', PMD_DIR.right, true, null, SAFARI_WALK_ANIM_SPEED);
  } else if (entry.sprite.frameEl) {
    // Ya tenía un fotograma PMD cargado (venía caminando o ya se había
    // congelado antes): se detiene YA, en el fotograma en que esté en ese
    // preciso instante, sin terminar el ciclo de andar — así el !stop del
    // jugador detiene el sprite al momento y no unos instantes después.
    entry.sprite.pause();
  } else {
    // Primera vez que aparece en el terreno, todavía sin ningún fotograma
    // PMD cargado: hace falta reproducir el ciclo de andar una vez (loop
    // false) para tener una pose de pie que mostrar; se congela sola al
    // terminar ese único ciclo.
    entry.sprite.play('Walk', PMD_DIR.right, false, null, SAFARI_STAND_ANIM_SPEED);
  }
}

function safariFieldSize() {
  const outer = $('safari-field-outer');
  return outer ? { w: outer.clientWidth || 900, h: outer.clientHeight || 500 } : { w: 900, h: 500 };
}

/* ---------------------------------------------------------
   BUCLE DE MOVIMIENTO
   --------------------------------------------------------- */
function safariTick() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  const now = performance.now();
  const dt = ms.lastTick ? (now - ms.lastTick) : SAFARI_TICK_MS;
  ms.lastTick = now;
  updateSafariCountdown(dt);
  const { w } = safariFieldSize();
  const deltaPct = (SAFARI_WALK_PX_PER_S * (dt / 1000) / w) * 100;

  ms.order.forEach(u => {
    const p = ms.players[u];
    if (!p || !p.alive || p.reachedGoal) return;

    if (p.finishing) {
      // Ya ha tocado la línea de meta: sigue caminando solo (el streamer ya
      // no puede dispararle, es intocable) durante SAFARI_FINISH_WALK_MS
      // como mucho —o hasta desaparecer del todo por el borde derecho si lo
      // consigue antes—, sin importar si el jugador había pulsado !stop.
      p.xPct = Math.min(SAFARI_EXIT_X_PCT, p.xPct + deltaPct);
      const el = $(p.elId);
      if (el) el.style.left = p.xPct + '%';
      const finishElapsedMs = now - (p.finishStartAt || now);
      if (p.xPct >= SAFARI_EXIT_X_PCT || finishElapsedMs >= SAFARI_FINISH_WALK_MS) {
        p.finishing = false;
        p.reachedGoal = true;
        p.moving = false;
        updateSafariWalkerAnim(p);
        addChatMessage(null, `🏁 ¡${p.pokemon.name} (@${u}) llega a la meta!`, 'correct');
        addScore(u, 150);
      }
      return;
    }

    if (!p.moving) return;
    p.xPct += deltaPct;
    if (p.xPct >= SAFARI_FINISH_X_PCT) {
      // Toca la línea de meta (interna, no se muestra): a partir de ahora
      // ya ha ganado, es intocable, y avanza solo hasta cruzarla del todo
      // (o hasta que pasen SAFARI_FINISH_WALK_MS, lo que llegue antes).
      p.finishing = true;
      p.finishStartAt = now;
      playSafariGoal();
      spawnSafariGoalConfetti(u); // expulsa confeti durante SAFARI_GOAL_CONFETTI_MS al tocar la meta
    }
    const el = $(p.elId);
    if (el) el.style.left = p.xPct + '%';
  });
  renderSafariStatusList();
  checkSafariEnd();
}

// Lanza, desde el propio sprite del Pokémon, un chorro continuo de
// partículas de confeti durante SAFARI_GOAL_CONFETTI_MS al tocar la línea
// de meta (ver la llamada justo arriba, cuando p.finishing pasa a true).
// Las partículas viven dentro de .safari-walker (que ya tiene
// position:absolute, así que sirve de contenedor de referencia) y por
// tanto viajan con el Pokémon mientras este sigue caminando solo hacia la
// salida. Cada partícula se anima cayendo y desvaneciéndose (mismo truco
// que el confeti del modo Voltorb Explosivo) y se autodestruye sola al
// terminar su propia animación CSS.
function spawnSafariGoalConfetti(user) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[user];
  if (!entry || !entry.el) return;
  const holder = document.createElement('div');
  holder.className = 'safari-confetti-holder';
  entry.el.appendChild(holder);
  const startedAt = performance.now();
  let intervalId = null;

  const spawnBatch = () => {
    const cur = state.modeState;
    // Si ha cambiado de partida o el sprite ya no existe (p.ej. se ha
    // vuelto a renderizar el campo), se corta la emisión y se limpia.
    if (cur !== ms || !ms.fieldSprites || !ms.fieldSprites[user]) {
      clearInterval(intervalId);
      holder.remove();
      return;
    }
    if (performance.now() - startedAt >= SAFARI_GOAL_CONFETTI_MS) {
      clearInterval(intervalId);
      // Deja que las últimas partículas terminen de caer antes de quitar
      // el contenedor del todo.
      setTimeout(() => holder.remove(), 900);
      return;
    }
    for (let i = 0; i < 2; i++) {
      const piece = document.createElement('div');
      piece.className = 'safari-confetti-piece';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.background = SAFARI_GOAL_CONFETTI_COLORS[Math.floor(Math.random() * SAFARI_GOAL_CONFETTI_COLORS.length)];
      piece.style.animationDuration = (0.7 + Math.random() * 0.5) + 's';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      holder.appendChild(piece);
      piece.addEventListener('animationend', () => piece.remove());
    }
  };

  spawnBatch(); // primer puñado inmediato, sin esperar al primer intervalo
  intervalId = setInterval(spawnBatch, SAFARI_GOAL_CONFETTI_INTERVAL_MS);
}

/* ---------------------------------------------------------
   OJOS DEL STREAMER (barra espaciadora)
   -----------------------------------------------------------
   'idle'    -> ojos abiertos, se puede apuntar y disparar con normalidad.
   'closing' -> animación de cerrar párpados en curso (no dispara).
   'timer'   -> pantalla en negro, cuenta atrás de 5s con marcador circular.
   'ready'   -> ya han pasado los 5s: espera a que se pulse espacio de nuevo.
   'opening' -> animación de abrir párpados en curso.
   Los jugadores pueden seguir avanzando en todo momento: solo se bloquea
   el disparo del streamer (ver setupSafariShooting).
   --------------------------------------------------------- */
let safariKeyboardBound = false;

function ensureSafariKeyboardBound() {
  if (safariKeyboardBound) return;
  safariKeyboardBound = true;
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (state.currentMode !== 'safari') return;
    const ms = state.modeState;
    if (!ms || ms.phase !== 'playing') return;
    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return; // no robar el espacio al escribir
    e.preventDefault();
    toggleSafariEyes();
  });
}

function toggleSafariEyes() {
  const ms = state.modeState;
  if (!ms || !ms.eyes) return;
  if (ms.eyes.phase === 'idle') {
    startSafariEyesClose();
  } else if (ms.eyes.phase === 'ready') {
    startSafariEyesOpen();
  }
  // 'closing' / 'timer' / 'opening': una transición ya en marcha, se ignora la pulsación.
}

function startSafariEyesClose() {
  const ms = state.modeState;
  ms.eyes.phase = 'closing';
  playSafariEyesClose();
  const overlay = $('safari-eyes-overlay');
  hideSafariEyesMsg();
  if (overlay) {
    // Los párpados parten siempre de su posición "abierta" (fuera de la
    // pantalla) vía CSS. Si se añaden "active" y "shut" a la vez, el
    // navegador nunca llega a pintar ese fotograma inicial antes de saltar
    // al final: la transición no se aprecia y el cierre parece instantáneo.
    // Por eso primero se hace visible el overlay (aún abierto), se fuerza
    // un reflow para que el navegador registre esa posición de partida, y
    // solo entonces se añade "shut" para que la transición se anime de
    // verdad — igual de fluida que la apertura, pero a la inversa.
    overlay.classList.remove('shut');
    overlay.classList.add('active');
    void overlay.getBoundingClientRect(); // fuerza reflow con el estado "abierto" ya pintado
    requestAnimationFrame(() => {
      overlay.classList.add('shut');
    });
  }
  addChatMessage(null, '😌 El cazador cierra los ojos...', 'system');
  setTimeout(() => {
    if (state.modeState !== ms || ms.eyes.phase !== 'closing') return;
    beginSafariEyesTimer();
  }, SAFARI_EYES_CLOSE_ANIM_MS);
}

function beginSafariEyesTimer() {
  const ms = state.modeState;
  ms.eyes.phase = 'timer';
  showSafariEyesRing();
  let secondsLeft = Math.ceil(SAFARI_EYES_BLACK_MS / 1000);
  updateSafariEyesRingNum(secondsLeft);
  ms.eyes.countdownInterval = setInterval(() => {
    secondsLeft -= 1;
    updateSafariEyesRingNum(Math.max(secondsLeft, 0));
  }, 1000);
  ms.eyes.closeTimer = setTimeout(() => {
    if (state.modeState !== ms || ms.eyes.phase !== 'timer') return;
    finishSafariEyesTimer();
  }, SAFARI_EYES_BLACK_MS);
}

function showSafariEyesRing() {
  const wrap = $('safari-eyes-timer');
  const fill = $('safari-eyes-ring-fill');
  if (wrap) wrap.style.display = 'flex';
  if (fill) {
    fill.style.strokeDasharray = String(SAFARI_EYES_RING_CIRC);
    fill.style.transition = 'none';
    fill.style.strokeDashoffset = '0';
    void fill.getBoundingClientRect(); // fuerza reflow antes de animar
    fill.style.transition = `stroke-dashoffset ${SAFARI_EYES_BLACK_MS}ms linear`;
    fill.style.strokeDashoffset = String(SAFARI_EYES_RING_CIRC);
  }
}

function updateSafariEyesRingNum(n) {
  const num = $('safari-eyes-ring-num');
  if (num) num.textContent = n > 0 ? String(n) : '';
}

function finishSafariEyesTimer() {
  const ms = state.modeState;
  ms.eyes.phase = 'ready';
  if (ms.eyes.countdownInterval) clearInterval(ms.eyes.countdownInterval);
  ms.eyes.countdownInterval = null;
  const wrap = $('safari-eyes-timer');
  if (wrap) wrap.style.display = 'none';
  playSafariEyesReady();
  showSafariEyesMsg('👁️ Pulsa ESPACIO para abrir los ojos');
  addChatMessage(null, '⏳ El cazador ya puede abrir los ojos pulsando espacio', 'system', { mirror: false });
}

function startSafariEyesOpen() {
  const ms = state.modeState;
  ms.eyes.phase = 'opening';
  hideSafariEyesMsg();
  const overlay = $('safari-eyes-overlay');
  if (overlay) overlay.classList.remove('shut');
  setTimeout(() => {
    if (state.modeState !== ms || ms.eyes.phase !== 'opening') return;
    ms.eyes.phase = 'idle';
    if (overlay) overlay.classList.remove('active');
  }, SAFARI_EYES_OPEN_ANIM_MS);
}

function showSafariEyesMsg(text) {
  const msg = $('safari-eyes-msg');
  if (!msg) return;
  msg.textContent = text;
  msg.style.display = 'flex';
}

function hideSafariEyesMsg() {
  const msg = $('safari-eyes-msg');
  if (msg) msg.style.display = 'none';
}

function resetSafariEyes() {
  const ms = state.modeState;
  if (!ms || !ms.eyes) return;
  if (ms.eyes.closeTimer) clearTimeout(ms.eyes.closeTimer);
  if (ms.eyes.countdownInterval) clearInterval(ms.eyes.countdownInterval);
  ms.eyes.phase = 'idle';
  ms.eyes.closeTimer = null;
  ms.eyes.countdownInterval = null;
  const overlay = $('safari-eyes-overlay');
  if (overlay) overlay.classList.remove('active', 'shut');
  hideSafariEyesMsg();
  const wrap = $('safari-eyes-timer');
  if (wrap) wrap.style.display = 'none';
}

/* ---------------------------------------------------------
   DISPARO DEL STREAMER (mirilla con zoom por arrastre de ratón)
   --------------------------------------------------------- */
function setupSafariShooting() {
  const outer = $('safari-field-outer');
  const inner = $('safari-field-inner');
  const scope = $('safari-scope');
  if (!outer || outer._safariShootBound) return;
  outer._safariShootBound = true;
  // Fija el zoom real de la mirilla (ver SAFARI_ZOOM_SCALE y el comentario
  // junto a .safari-field-outer.aiming .safari-field-inner en styles.css,
  // que lee esta misma variable): así el valor solo vive en un sitio.
  outer.style.setProperty('--safari-zoom-scale', SAFARI_ZOOM_SCALE);
  let aiming = false;
  // A true solo cuando la transición de zoom (transform, ver la regla
  // ".aiming .safari-field-inner" de arriba) ha terminado de verdad
  // mientras seguía apuntando: mientras esté a false, soltar el clic no
  // dispara (ver releaseAim). Se pone a false en cuanto se empieza a
  // apuntar (pointerdown) y solo vuelve a true al completarse el zoom.
  let zoomReady = false;

  // Si se suelta el clic antes de que termine el zoom de entrada, la
  // transición se interrumpe (nunca llega a completarse "in") y en su
  // lugar arranca la de salida (vuelta a escala 1): por eso se comprueba
  // "aiming" aquí dentro — para esa transición de salida, "aiming" ya vale
  // false en el momento en que termine, así que su transitionend se
  // ignora y zoomReady no se ve afectado por ella.
  if (inner) {
    inner.addEventListener('transitionend', (e) => {
      if (e.target !== inner || e.propertyName !== 'transform' || !aiming) return;
      zoomReady = true;
    });
  }

  function updateAim(clientX, clientY) {
    const rect = outer.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    if (inner) inner.style.transformOrigin = xPct + '% ' + yPct + '%';
    if (scope) {
      scope.style.setProperty('--sx', xPct + '%');
      scope.style.setProperty('--sy', yPct + '%');
    }
    return { xPct, yPct };
  }

  outer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // El botón de pantalla completa vive dentro de este mismo contenedor:
    // si el click empieza sobre él, hay que dejarlo pasar tal cual, sin
    // arrancar la mirilla ni capturar el puntero, o el botón deja de
    // recibir su evento "click" (setPointerCapture se lo robaría).
    if (e.target.closest('.scene-fullscreen-btn')) return;
    const ms = state.modeState;
    if (!ms || ms.phase !== 'playing') return;
    if (ms.eyes && ms.eyes.phase !== 'idle') return; // ojos cerrados: no se puede apuntar ni disparar
    aiming = true;
    zoomReady = false;
    ms.aiming = true;
    try { outer.setPointerCapture(e.pointerId); } catch (err) {}
    outer.classList.add('aiming');
    updateAim(e.clientX, e.clientY);
    e.preventDefault();
  });

  outer.addEventListener('pointermove', (e) => {
    if (!aiming) return;
    updateAim(e.clientX, e.clientY);
  });

  function releaseAim(e, shoot) {
    if (!aiming) return;
    aiming = false;
    const ms = state.modeState;
    if (ms) ms.aiming = false;
    try { outer.releasePointerCapture(e.pointerId); } catch (err) {}
    // El disparo se comprueba ANTES de quitar la clase "aiming" (y por tanto
    // antes de que el zoom de la mirilla empiece a deshacerse, ver
    // .safari-field-outer.aiming .safari-field-inner en styles.css). Antes
    // se quitaba la clase primero: el hitTest de PMDSprite consulta el
    // recuadro real en pantalla del Pokémon en ese mismo instante
    // (getBoundingClientRect), y con el zoom ya revirtiéndose (aunque sea a
    // mitad de la transición de scale) ese recuadro ya no coincidía con lo
    // que el streamer estaba viendo -y apuntando- justo al soltar el clic.
    // Comprobando el acierto primero, con la mirilla todavía en su estado
    // real, el disparo se juzga exactamente sobre lo que se veía en pantalla.
    if (shoot && !zoomReady) {
      // Soltó el clic antes de que la cámara terminara de hacer zoom: el
      // disparo no cuenta (ni acierto ni fallo), para que no se pueda
      // "spamear" clics rápidos sin llegar a apuntar de verdad.
      addChatMessage(null, '🔍 El cazador suelta el gatillo demasiado pronto, la mirilla todavía no ha terminado de hacer zoom.', 'system', { mirror: false });
    } else if (shoot) {
      const { xPct, yPct } = updateAim(e.clientX, e.clientY);
      fireSafariShot(xPct, yPct, e.clientX, e.clientY);
    }
    outer.classList.remove('aiming');
  }
  outer.addEventListener('pointerup', (e) => releaseAim(e, true));
  outer.addEventListener('pointercancel', (e) => releaseAim(e, false));
  // Evita que el navegador arrastre/seleccione texto al mantener el click
  outer.addEventListener('dragstart', (e) => e.preventDefault());
}

function fireSafariShot(xPct, yPct, clientX, clientY) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;

  playSafariShot();

  // Solo los Pokémon que se estén moviendo pueden ser alcanzados: uno
  // parado es intocable, sin importar dónde caiga el disparo. Además,
  // "!p.reachedGoal" y "!p.finishing" hacen invulnerable a cualquier
  // Pokémon que ya haya tocado o cruzado la línea de meta (ya ha ganado,
  // nunca puede ser objetivo de un disparo).
  const targets = ms.order
    .map(u => ms.players[u])
    .filter(p => p && p.alive && p.moving && !p.reachedGoal && !p.finishing);

  // La hitbox de cada Pokémon es su dibujo real en pantalla, sin contar el
  // margen transparente del fotograma: se le pregunta a su PMDSprite si el
  // punto exacto del clic (en coordenadas de cliente, las mismas que usa
  // getBoundingClientRect()) cae sobre un píxel no transparente, en vez de
  // comparar distancias contra un radio fijo alrededor de su centro. Si el
  // clic acierta sobre el dibujo de varios Pokémon superpuestos a la vez,
  // se queda con el que esté dibujado más arriba (el último en 'targets'
  // según su z-index natural, ya que se recorren en orden), como
  // cabría esperar al hacer click sobre algo que tapa a otra cosa.
  let hitPlayer = null;
  targets.forEach(p => {
    const entry = ms.fieldSprites[p.user];
    if (entry && entry.sprite.hitTestPoint(clientX, clientY)) hitPlayer = p;
  });

  if (hitPlayer) {
    playSafariHit();
    killSafariPlayer(hitPlayer);
  } else {
    showSafariMiss(xPct, yPct);
    addChatMessage(null, '💨 El cazador falla el disparo', 'wrong', { mirror: false });
  }
}

function showSafariMiss(xPct, yPct) {
  const inner = $('safari-field-inner');
  if (!inner) return;
  const spark = document.createElement('div');
  spark.className = 'safari-miss-spark';
  spark.style.left = xPct + '%';
  spark.style.top = yPct + '%';
  inner.appendChild(spark);
  setTimeout(() => spark.remove(), 500);
}

function applySafariDeath(p) {
  const ms = state.modeState;
  p.alive = false;
  p.moving = false;
  const el = $(p.elId);
  const entry = ms.fieldSprites[p.user];
  if (entry) {
    // Primero se reproduce la animación de "Hurt" completa (el Pokémon se
    // queda quieto en su sitio recibiendo el golpe); la caída/desvanecido
    // (.dead) solo arranca cuando el Hurt termina, para que el golpe se
    // vea de verdad y no quede tapado por el propio desvanecido.
    entry.sprite.play('Hurt', PMD_DIR.right, false, () => {
      if (el) el.classList.add('dead');
      setTimeout(() => {
        entry.sprite.destroy();
        entry.el.remove();
        delete ms.fieldSprites[p.user];
      }, SAFARI_DEATH_FADE_MS);
    });
  } else if (el) {
    el.classList.add('dead');
  }
}

function killSafariPlayer(p) {
  applySafariDeath(p);
  addChatMessage(null, `💥 ¡${p.pokemon.name} (@${p.user}) ha sido cazado!`, 'wrong');
  renderSafariStatusList();
  checkSafariEnd();
}

/* ---------------------------------------------------------
   TEMPORIZADOR DE PARTIDA (esquina superior derecha)
   -----------------------------------------------------------
   Cuenta atrás de SAFARI_TIMER_START_S segundos que solo desciende
   mientras el streamer tiene los ojos cerrados (o en transición de
   cerrarlos/abrirlos): con los ojos abiertos el reloj se detiene por
   completo. Se ve siempre, incluso con la pantalla en negro. Si llega
   a 0, todos los Pokémon que no hayan cruzado la meta caen de golpe.
   --------------------------------------------------------- */
function updateSafariCountdown(dt) {
  const ms = state.modeState;
  if (!ms || ms.timeUp) return;
  const eyesClosed = ms.eyes && ms.eyes.phase !== 'idle';
  if (eyesClosed) {
    ms.timeLeftMs = Math.max(0, ms.timeLeftMs - dt);
  }
  renderSafariCountdown();
  if (ms.timeLeftMs <= 0) {
    handleSafariTimeUp();
  }
}

function renderSafariCountdown() {
  const ms = state.modeState;
  if (!ms) return;
  const numEl = $('safari-countdown-num');
  if (numEl) numEl.textContent = String(Math.ceil(ms.timeLeftMs / 1000));
  const box = $('safari-countdown');
  if (box) box.classList.toggle('low', ms.timeLeftMs <= 10000);
}

function handleSafariTimeUp() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing' || ms.timeUp) return;
  ms.timeUp = true;
  playSafariTimeUp();
  const victims = ms.order
    .map(u => ms.players[u])
    .filter(p => p && p.alive && !p.reachedGoal && !p.finishing);
  victims.forEach(p => applySafariDeath(p));
  if (victims.length > 0) {
    addChatMessage(null, `⏰ ¡Se acaba el tiempo! ${victims.length} Pokémon que no llegaron a la meta caen de golpe`, 'wrong');
  } else {
    addChatMessage(null, '⏰ ¡Se acaba el tiempo!', 'system');
  }
  renderSafariStatusList();
  checkSafariEnd();
}

/* ---------------------------------------------------------
   ESTADO / PANELES
   --------------------------------------------------------- */
function renderSafariStatusList() {
  const ms = state.modeState;
  const list = $('safari-status-list');
  if (!ms || !list) return;
  const players = ms.order.map(u => ms.players[u]);
  const alive = players.filter(p => p.alive);
  const atGoal = players.filter(p => p.reachedGoal || p.finishing);
  const dead = players.filter(p => !p.alive);

  const aliveCountEl = $('safari-alive-count');
  const goalCountEl = $('safari-goal-count');
  const deadCountEl = $('safari-dead-count');
  if (aliveCountEl) aliveCountEl.textContent = alive.length;
  if (goalCountEl) goalCountEl.textContent = atGoal.length;
  if (deadCountEl) deadCountEl.textContent = dead.length;

  if (players.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);">Sin jugadores</div>';
    return;
  }
  list.innerHTML = players.map(p => {
    const won = p.reachedGoal || p.finishing;
    const icon = !p.alive ? '💀' : won ? '🏁' : p.moving ? '🏃' : '🧍';
    const pct = Math.round(Math.min(100, ((p.xPct - SAFARI_START_X_PCT) / (SAFARI_FINISH_X_PCT - SAFARI_START_X_PCT)) * 100));
    return `
      <div class="safari-status-row">
        <img src="${getPokemonSprite(p.pokemon.sprite)}" alt="">
        <span>${icon} @${escapeHtml(p.user)}</span>
        <div class="mini-hp"><div class="mini-hp-fill" style="width:${Math.max(0, pct)}%;background:${!p.alive ? 'var(--muted)' : won ? 'var(--yellow)' : 'var(--green)'}"></div></div>
      </div>
    `;
  }).join('');
}

/* ---------------------------------------------------------
   FIN DE PARTIDA
   --------------------------------------------------------- */
function checkSafariEnd() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  const alive = ms.order.map(u => ms.players[u]).filter(p => p.alive);
  if (alive.length === 0) {
    endSafari([]);
    return;
  }
  if (alive.every(p => p.reachedGoal)) {
    endSafari(alive);
  }
}

function endSafari(winners) {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'ended';
  if (ms.tickInterval) clearInterval(ms.tickInterval);
  ms.tickInterval = null;
  resetSafariEyes();

  const field = $('safari-field-outer');
  if (winners.length > 0) {
    playSafariVictory();
    addChatMessage(null, `🏆 ¡${winners.map(w => '@' + w.user).join(', ')} sobreviven a la Zona Safari!`, 'correct');
  } else {
    playSafariWipeout();
    addChatMessage(null, '☠️ El cazador ha atrapado a todos los Pokémon de la Zona Safari', 'wrong');
  }
  if (field) {
    const banner = document.createElement('div');
    banner.className = 'safari-victory-banner';
    banner.innerHTML = winners.length > 0 ? `
      <div class="win-title pixel">¡SUPERVIVIENTES!</div>
      <div class="win-sub">${winners.map(w => escapeHtml(w.pokemon.name) + ' de @' + escapeHtml(w.user)).join(', ')} ${winners.length > 1 ? 'llegan' : 'llega'} a la meta</div>
      <div class="mode-end-actions">
        <button class="safari-start-btn" id="safari-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="safari-menu-btn">🏠 Menú Principal</button>
      </div>
    ` : `
      <div class="win-title pixel">ZONA SAFARI DESPEJADA</div>
      <div class="win-sub">Ningún Pokémon ha sobrevivido a la cacería</div>
      <div class="mode-end-actions">
        <button class="safari-start-btn" id="safari-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="safari-menu-btn">🏠 Menú Principal</button>
      </div>
    `;
    field.appendChild(banner);
    const again = $('safari-again-btn');
    if (again) again.onclick = () => startSafari();
    const menuBtn = $('safari-menu-btn');
    if (menuBtn) menuBtn.onclick = () => backToMenu();
  }
}
