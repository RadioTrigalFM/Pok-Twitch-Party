import { addChatMessage, escapeHtml } from '../chat.js';
import {
  playVeJoin, playVolcanEruption, playVolcanFiveSecWarning, playModeMusic,
  playVolcanMatchStart, playVolcanHeatranLand, playVolcanVictory, playVolcanWipeout,
} from '../audio.js';
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

/* =========================================================
   MODO EL VOLCÁN
   -----------------------------------------------------------
   - Fase de lobby: los viewers se apuntan con !pokemon [nombre],
     igual que en Zona Safari / Battle Royale / Pokerus, con toda la
     Pokédex Nacional y sprites PMD animados.
   - El mapa son dos plataformas de roca volcánica (izquierda y
     derecha) unidas por una franja vertical de roca de otro tono.
     Al empezar la partida, cada Pokémon aparece repartido al azar
     en una de las dos plataformas.
   - Los viewers escriben !izquierda o !derecha para mandar a su
     Pokémon a la plataforma correspondiente: el sprite reproduce su
     animación "Walk" y camina lentamente (con transición CSS) hasta
     un punto aleatorio de esa plataforma.
   - Cada 40 segundos, la plataforma con más Pokémon encima entra en
     erupción (llamas + temblor) y todos los que están sobre ella en
     ese momento mueren: reproducen su animación "Hurt" y se
     desvanecen.
   - La partida termina cuando solo queda 1 jugador vivo o cuando
     todos han muerto.
   ========================================================= */

const VOLCAN_STAND_ANIM_SPEED = 2.6;    // animación "Walk" lenta = de pie quieto
const VOLCAN_WALK_ANIM_SPEED = 4.4;     // animación "Walk" mientras camina por un comando (mitad de velocidad que antes)
const VOLCAN_WALK_PX_PER_S = 27.5;      // velocidad real de avance por el mapa al recibir un comando (el doble de lento que antes)
const VOLCAN_ERUPTION_INTERVAL_MS = 30000; // cada cuánto entra en erupción una plataforma
const VOLCAN_ERUPTION_BUILDUP_MS = 650;    // retraso entre que empieza a caer la lluvia de magma y el golpe real
const VOLCAN_FLAME_VISUAL_MS = 1750;       // duración total de la lluvia de magma (debe casar con el CSS)
const VOLCAN_MAGMA_DROP_COUNT = 13;        // nº de gotas de magma por erupción
const VOLCAN_MAGMA_SMOKE_COUNT = 5;        // nº de volutas de humo/ceniza tras el impacto
const VOLCAN_DEATH_FADE_MS = 650;          // duración del desvanecido tras el Hurt (debe casar con @keyframes volcanFaint)
const VOLCAN_COUNTDOWN_TICK_MS = 200;      // frecuencia de refresco del contador de cuenta atrás
const VOLCAN_SURVIVE_POINTS = 40;          // puntos por sobrevivir a una oleada de erupción
const VOLCAN_WIN_POINTS = 500;             // puntos por ganar la partida

// Heatran: antes de cada lluvia de magma, desciende desde arriba y se queda
// flotando sobre el centro del mapa disparando la lluvia, para luego volver
// a desaparecer por donde vino (ver spawnVolcanHeatran / despawnVolcanHeatran).
const VOLCAN_HEATRAN_DEX = 485;
const VOLCAN_HEATRAN_FALL_MS = 900;              // duración de la caída desde el borde superior hasta el centro
const VOLCAN_HEATRAN_PRE_SHOOT_DELAY_MS = 1000;  // pausa tras aterrizar antes de que arranque la lluvia
const VOLCAN_HEATRAN_EXIT_MS = 900;              // duración de la subida de vuelta hacia el borde superior

// Deambular libre: mientras no reciben un comando, los Pokémon se pasean
// solos y muy despacio dentro de su propia plataforma, con pausas de vez en
// cuando (en las que además se congela la animación, no solo el movimiento).
const VOLCAN_WANDER_PX_PER_S = 13;         // avance al deambular: mucho más lento que al recibir un comando
const VOLCAN_WANDER_ANIM_SPEED = 6.5;      // animación "Walk" al deambular: aún más lenta que al recibir un comando
const VOLCAN_WANDER_PAUSE_MIN_MS = 1800;   // pausa mínima entre un paseo y el siguiente (o entre dos pausas seguidas)
const VOLCAN_WANDER_PAUSE_MAX_MS = 4500;   // pausa máxima
const VOLCAN_WANDER_STOP_CHANCE = 0.45;    // probabilidad de quedarse quieto otra pausa en vez de deambular

// Límites (en fracción 0-1 del ancho/alto del campo) donde puede aparecer o
// caminar un Pokémon dentro de cada plataforma. Se dejan con margen respecto
// a los bordes visuales de la plataforma (ver .volcan-platform en el CSS)
// para que el sprite nunca se salga de la roca ni entre en la franja central.
const VOLCAN_PLATFORM_BOUNDS = {
  left: { xMin: 0.042, xMax: 0.406, yMin: 0.117, yMax: 0.89 },
  right: { xMin: 0.599, xMax: 0.96, yMin: 0.121, yMax: 0.888 },
};

export function startVolcan() {
  // Igual que en Rayo Solar (ver el comentario largo en startRayoSolar,
  // rayosolar.js): al pulsar "Nueva Partida" (ver el botón
  // #volcan-again-btn tras endVolcan) esta misma función reconstruye el
  // lobby, lo que destruye por completo el contenido anterior de
  // #game-content -incluido el campo (#volcan-field-outer) que estaba en
  // pantalla completa mientras se jugaba-, sacando al navegador de
  // pantalla completa por su cuenta. Se guarda si había pantalla completa
  // activa ANTES de reconstruir nada para restaurarla sobre el lobby
  // nuevo justo después (ver más abajo).
  const wasFullscreen = !!currentFullscreenElement();
  state.modeState = {
    phase: 'lobby',       // 'lobby' | 'playing' | 'ended'
    players: {},            // user -> jugador
    order: [],
    lobbySprites: {},       // user -> { el, sprite, dex } — caminantes PMD del lobby
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startVolcan(), es decir, al empezar una nueva partida).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    fieldSprites: {},       // user -> { el, sprite, x, y, dir, arriveTimeout } — sprites PMD sobre el volcán
    tickInterval: null,     // intervalo que refresca la cuenta atrás y dispara la erupción
    nextEruptionAt: 0,      // performance.now() en el que toca la próxima erupción
    eruptionBusy: false,    // true mientras se resuelve una erupción (llamas + muertes)
    roundLocked: false,     // true desde que se agota el tiempo hasta que empieza la nueva ronda: no se admiten comandos
    heatran: null,          // { el, sprite } — Heatran mientras está en pantalla durante una erupción
  };
  pmdPreload(VOLCAN_HEATRAN_DEX);
  renderVolcanLobby();
  if (wasFullscreen) {
    // Restaura la pantalla completa sobre el lobby recién creado (ver el
    // comentario de arriba).
    requestSceneFullscreen($('volcan-lobby-scene'));
  }
  addChatMessage(null, `🌋 ¡El Volcán está abierto! Escribe !pokemon [nombre] para apuntarte. ¡Disponible toda la Pokédex Nacional (${ARENA_POKEMON_DB.length} Pokémon)!`, 'system');
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderVolcanLobby() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="volcan-lobby-box game-scene" id="volcan-lobby-scene">
      <div class="volcan-lobby-head">
        <div class="big-count pixel" id="volcan-count">0</div>
        <div style="color:var(--muted);font-size:12px;">jugadores apuntados · escribe <b style="color:var(--yellow)">!pokemon [nombre]</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:520px;margin:6px auto 0;line-height:1.6;">
          Una vez empiece la partida, moveréis a vuestro Pokémon entre las dos plataformas con
          <b style="color:#ff9b5a">!izquierda</b> (<b style="color:#ff9b5a">!i</b>) y <b style="color:#ff9b5a">!derecha</b> (<b style="color:#ff9b5a">!d</b>).
          Cada 40 segundos, ¡la plataforma con más Pokémon encima entrará en erupción!
        </div>
      </div>
      <div class="volcan-lobby-grid" id="volcan-lobby-grid">
        <div class="volcan-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="volcan-start-btn" id="volcan-start-btn" disabled>▶ Comenzar Partida</button>
    </div>
  `;
  $('volcan-start-btn').onclick = () => startVolcanMatch();
  renderVolcanLobbyGrid();
}

// Igual que en Zona Safari: cada jugador tiene su propia tarjeta con un
// sprite PMD que se crea una sola vez y se conserva mientras esté en el lobby.
function renderVolcanLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('volcan-lobby-grid');
  const countEl = $('volcan-count');
  const btn = $('volcan-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (btn) btn.disabled = players.length < 3;

  if (players.length === 0) {
    grid.innerHTML = '<div class="volcan-lobby-empty">Esperando a que el chat se apunte...</div>';
    return;
  }
  const emptyMsg = grid.querySelector('.volcan-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    let entry = ms.lobbySprites[p.user];
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'volcan-lobby-card';
      el.title = 'Clic para expulsar de la partida';
      const spriteId = 'vc-lobby-' + sanitizeUser(p.user);
      el.innerHTML = `
        <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
        <div class="p-name">${escapeHtml(p.pokemon.name)}</div>
        <div class="p-user">@${escapeHtml(p.user)}</div>
      `;
      // El streamer puede hacer clic en cualquier jugador inscrito para que
      // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleLobbyExpelPopover(ms, p.user, el, expelFromVolcanLobby);
      });
      grid.appendChild(el);
      const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
      sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      sprite.play('Walk', PMD_DIR.down, true, null, VOLCAN_STAND_ANIM_SPEED);
      ms.lobbySprites[p.user] = { el, sprite, dex: p.pokemon.sprite };
    } else if (entry.dex !== p.pokemon.sprite) {
      entry.sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      entry.sprite.play('Walk', PMD_DIR.down, true, null, VOLCAN_STAND_ANIM_SPEED);
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
// la siguiente partida (nueva llamada a startVolcan()).
function expelFromVolcanLobby(user) {
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
  renderVolcanLobbyGrid();
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleVolcanCmd(user, cmd, parts) {
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
      side: null,     // 'left' | 'right' — se asigna al empezar la partida
      alive: true,
      elId: 'vc-' + sanitizeUser(user),
    };
    if (isNew) ms.order.push(user);
    pmdPreload(pokemon.sprite);
    addChatMessage(null, `✅ ${user} se apunta con ${pokemon.name}!`, 'correct', { mirror: false });
    if (isNew) playVeJoin();
    renderVolcanLobbyGrid();
    return;
  }

  if (cmd === '!izquierda' || cmd === '!derecha' || cmd === '!i' || cmd === '!d') {
    if (ms.phase !== 'playing') return;
    if (ms.roundLocked) return; // se acabó el tiempo: no se admiten más comandos hasta la nueva ronda
    const p = ms.players[user];
    if (!p || !p.alive) return;
    const targetSide = (cmd === '!izquierda' || cmd === '!i') ? 'left' : 'right';
    if (p.side === targetSide) return; // ya está en esa plataforma (o caminando hacia ella)
    p.side = targetSide;
    walkVolcanPlayerTo(p, targetSide);
    addChatMessage(null, `🚶 ${p.pokemon.name} (@${user}) se dirige a la plataforma ${targetSide === 'left' ? 'IZQUIERDA' : 'DERECHA'}`, 'action', { mirror: false });
    renderVolcanStatusList();
  }
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA
   --------------------------------------------------------- */
function destroyVolcanSprites(registry) {
  if (!registry) return;
  Object.values(registry).forEach(entry => {
    if (entry.arriveTimeout) clearTimeout(entry.arriveTimeout);
    if (entry.wanderTimeout) clearTimeout(entry.wanderTimeout);
    if (entry.sprite) entry.sprite.destroy();
  });
}

function startVolcanMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const users = ms.order.slice();
  if (users.length < 3) {
    toast('Se necesitan al menos 3 jugadores para empezar');
    return;
  }
  destroyVolcanSprites(ms.lobbySprites);
  ms.lobbySprites = {};

  ms.phase = 'playing';
  // La música de este modo no suena durante el lobby de inscripción (ahí
  // sigue la del menú principal): arranca justo aquí, al cerrarse el lobby
  // y empezar la partida de verdad (ver MODES_WITHOUT_LOBBY_MUSIC en
  // modeLauncher.js).
  playModeMusic('volcan');
  playVolcanMatchStart();
  // Repartidos al azar por el mapa: cada Pokémon empieza en una de las
  // dos plataformas con la misma probabilidad.
  users.forEach(u => {
    const p = ms.players[u];
    p.side = Math.random() < 0.5 ? 'left' : 'right';
    p.alive = true;
  });
  renderVolcanField();
  addChatMessage(null, `🌋 ¡Comienza El Volcán con ${users.length} Pokémon! Escribid !izquierda (!i) o !derecha (!d) para cambiar de plataforma. Cada 40s arderá la plataforma con más Pokémon encima.`, 'system', { mirror: false });
  ms.roundLocked = false;
  ms.nextEruptionAt = performance.now() + VOLCAN_ERUPTION_INTERVAL_MS;
  ms.fiveSecWarnPlayed = false; // se resetea el aviso sonoro de "quedan 5s" para la nueva ronda
  ms.tickInterval = setInterval(volcanCountdownTick, VOLCAN_COUNTDOWN_TICK_MS);
}

/* ---------------------------------------------------------
   CAMPO DE JUEGO
   --------------------------------------------------------- */
function renderVolcanField() {
  const content = $('game-content');
  const ms = state.modeState;
  const players = ms.order.map(u => ms.players[u]);
  content.innerHTML = `
    <div class="volcan-wrap">
      <div class="volcan-topbar">
        <div class="stat">🟢 Vivos: <b id="volcan-alive-count">${players.length}</b></div>
        <div class="stat">👥 Total: <b>${players.length}</b></div>
      </div>
      <div class="volcan-field-outer game-scene" id="volcan-field-outer">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <div class="volcan-timer-badge" id="volcan-eruption-warn">🌋 Próxima erupción en <b id="volcan-countdown-num">30</b>s</div>
        <div class="volcan-field-inner" id="volcan-field-inner">
          <div class="volcan-platform left" id="volcan-platform-left">
            <div class="volcan-magma-rain" id="volcan-magma-left"></div>
          </div>
          <div class="volcan-gap"></div>
          <div class="volcan-platform right" id="volcan-platform-right">
            <div class="volcan-magma-rain" id="volcan-magma-right"></div>
          </div>
        </div>
        <div class="volcan-status-sign">
          <div class="zor-sign-board">
            <div class="zor-sign-title pixel">Cambia de plataforma escribiendo el comando:</div>
            <div class="zor-sign-cmds">
              <span>!izquierda</span><span>!i</span><span>!derecha</span><span>!d</span>
            </div>
          </div>
        </div>
      </div>
      <div class="volcan-info-grid">
        <div class="ranking-panel" id="volcan-status-panel">
          <div class="ranking-title">🌋 Pokémon en el volcán</div>
          <div id="volcan-status-list"></div>
        </div>
        <div class="battle-log" id="volcan-log">
          <p style="color:var(--muted);font-style:italic;">¡La erupción puede llegar en cualquier momento!</p>
        </div>
      </div>
    </div>
  `;
  ms.fieldSprites = {};
  players.forEach(p => createVolcanWalker(p));
  renderVolcanStatusList();
}

function volcanFieldSize() {
  const outer = $('volcan-field-outer');
  return outer ? { w: outer.clientWidth || 900, h: outer.clientHeight || 520 } : { w: 900, h: 520 };
}

// Punto aleatorio (en px, relativo al campo) dentro de los límites de la
// plataforma indicada — se usa tanto para colocar a un Pokémon nuevo como
// para elegir a dónde camina cuando cambia de plataforma.
function volcanRandomPointForSide(side) {
  const { w, h } = volcanFieldSize();
  const b = VOLCAN_PLATFORM_BOUNDS[side];
  return {
    x: (b.xMin + Math.random() * (b.xMax - b.xMin)) * w,
    y: (b.yMin + Math.random() * (b.yMax - b.yMin)) * h,
  };
}

function createVolcanWalker(p) {
  const ms = state.modeState;
  const inner = $('volcan-field-inner');
  if (!inner) return;
  const { x, y } = volcanRandomPointForSide(p.side);
  const el = document.createElement('div');
  el.className = 'volcan-walker';
  el.id = p.elId;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  const spriteId = 'vc-sprite-' + sanitizeUser(p.user);
  el.innerHTML = `
    <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
    <div class="volcan-name">@${escapeHtml(p.user)}</div>
  `;
  inner.appendChild(el);
  const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
  sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
  // De pie, mirando hacia el centro del mapa (hacia la franja de roca)
  const standDir = p.side === 'left' ? PMD_DIR.right : PMD_DIR.left;
  sprite.play('Walk', standDir, false, null, VOLCAN_STAND_ANIM_SPEED);
  // xFrac/yFrac guardan la posición como fracción (0-1) del campo en el
  // momento de fijarla: son la fuente de verdad para recalcular x/y en
  // píxeles cuando el campo cambia de tamaño (ver repositionVolcanField),
  // por ejemplo al entrar o salir de pantalla completa.
  const { w: fw0, h: fh0 } = volcanFieldSize();
  ms.fieldSprites[p.user] = {
    el, sprite, x, y, xFrac: fw0 ? x / fw0 : 0, yFrac: fh0 ? y / fh0 : 0,
    dir: standDir, arriveTimeout: null, wanderTimeout: null, commandMoving: false,
  };
  // Arranca el deambular libre: hasta que reciba un comando, el Pokémon se
  // pasea solo (muy despacio) por su propia plataforma, con pausas.
  scheduleVolcanWander(p.user);
}

function clearVolcanWanderTimer(entry) {
  if (entry && entry.wanderTimeout) {
    clearTimeout(entry.wanderTimeout);
    entry.wanderTimeout = null;
  }
}

// Programa la siguiente decisión de "deambular libre": tras una pausa
// (durante la que el Pokémon se queda parado y su animación se congela, ver
// PMDSprite.pause()), decide al azar si se pasea un poco por su plataforma
// o si se queda quieto otra pausa más. Se cancela en cuanto el jugador
// recibe un comando (ver walkVolcanPlayerTo) y se retoma en cuanto termina
// de llegar a su destino, así el deambular nunca pisa el movimiento por
// comando.
function scheduleVolcanWander(user) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[user];
  const p = ms && ms.players && ms.players[user];
  if (!ms || !entry || !p || !p.alive || ms.phase !== 'playing') return;
  clearVolcanWanderTimer(entry);
  const pauseMs = VOLCAN_WANDER_PAUSE_MIN_MS + Math.random() * (VOLCAN_WANDER_PAUSE_MAX_MS - VOLCAN_WANDER_PAUSE_MIN_MS);
  entry.wanderTimeout = setTimeout(() => {
    const cur = state.modeState;
    const e2 = cur && cur.fieldSprites && cur.fieldSprites[user];
    const p2 = cur && cur.players && cur.players[user];
    if (!cur || !e2 || !p2 || !p2.alive || cur.phase !== 'playing') return;
    e2.wanderTimeout = null;
    if (e2.arriveTimeout) return; // ya está caminando por un comando, no interferir
    if (Math.random() < VOLCAN_WANDER_STOP_CHANCE) {
      // Se queda quieto: congela la animación tal cual está ahora mismo.
      e2.sprite.pause();
      scheduleVolcanWander(user);
      return;
    }
    // Deambula muy despacio a otro punto dentro de su propia plataforma.
    const { x, y } = volcanRandomPointForSide(p2.side);
    volcanMoveWalker(user, x, y, { pxPerS: VOLCAN_WANDER_PX_PER_S, animSpeed: VOLCAN_WANDER_ANIM_SPEED });
  }, pauseMs);
}

// Calcula la dirección PMD (una de las 8) más cercana al ángulo real del
// desplazamiento (dx,dy), para que el sprite camine orientado hacia donde
// se mueve de verdad.
function volcanDirFromDelta(dx, dy) {
  if (Math.hypot(dx, dy) < 4) return null;
  const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  const dirs = [PMD_DIR.right, PMD_DIR.downRight, PMD_DIR.down, PMD_DIR.downLeft, PMD_DIR.left, PMD_DIR.upLeft, PMD_DIR.up, PMD_DIR.upRight];
  return dirs[idx];
}

// Hace que el sprite libre de "user" camine (animación Walk orientada hacia
// donde avanza de verdad, con una transición CSS que dura lo que tarde en
// recorrer la distancia real) hasta (targetX,targetY); al llegar, se queda
// de pie mirando hacia donde caminaba y retoma el deambular libre.
// opts.pxPerS / opts.animSpeed permiten usar una velocidad distinta según el
// motivo del movimiento (comando del chat vs. deambular libre).
// opts.isCommand marca que este movimiento viene de un comando de jugador
// (!izquierda/!derecha): solo estos movimientos deben bloquear la erupción;
// ver volcanAnyWalkerMoving, que solo mira entry.commandMoving.
function volcanMoveWalker(user, targetX, targetY, opts = {}) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[user];
  if (!entry) return;
  const pxPerS = opts.pxPerS ?? VOLCAN_WALK_PX_PER_S;
  const animSpeed = opts.animSpeed ?? VOLCAN_WALK_ANIM_SPEED;
  entry.commandMoving = !!opts.isCommand;
  const dx = targetX - entry.x;
  const dy = targetY - entry.y;
  const dist = Math.hypot(dx, dy);
  const moveDir = volcanDirFromDelta(dx, dy) ?? entry.dir;
  const duration = Math.max(0.5, Math.min(7.2, dist / pxPerS));

  entry.sprite.play('Walk', moveDir, true, null, animSpeed);
  entry.dir = moveDir;
  entry.el.style.transition = `left ${duration}s linear, top ${duration}s linear`;
  // Fuerza el estilo actual antes de animar hacia el nuevo destino.
  void entry.el.offsetWidth;
  entry.el.style.left = targetX + 'px';
  entry.el.style.top = targetY + 'px';
  entry.x = targetX;
  entry.y = targetY;
  // Guarda también la posición de destino como fracción del campo (ver
  // comentario en createVolcanWalker), para poder recalcularla si el campo
  // cambia de tamaño antes de que termine de llegar.
  const { w: fw1, h: fh1 } = volcanFieldSize();
  entry.xFrac = fw1 ? targetX / fw1 : entry.xFrac;
  entry.yFrac = fh1 ? targetY / fh1 : entry.yFrac;

  clearTimeout(entry.arriveTimeout);
  entry.arriveTimeout = setTimeout(() => {
    const cur = state.modeState;
    const e2 = cur && cur.fieldSprites && cur.fieldSprites[user];
    if (!e2) return;
    e2.sprite.play('Walk', moveDir, false, null, VOLCAN_STAND_ANIM_SPEED);
    e2.arriveTimeout = null;
    e2.commandMoving = false;
    scheduleVolcanWander(user);
  }, duration * 1000);
}

function walkVolcanPlayerTo(p, side) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[p.user];
  clearVolcanWanderTimer(entry); // un comando siempre corta el deambular libre en curso
  const { x, y } = volcanRandomPointForSide(side);
  volcanMoveWalker(p.user, x, y, { pxPerS: VOLCAN_WALK_PX_PER_S, animSpeed: VOLCAN_WALK_ANIM_SPEED, isCommand: true });
}

// Recoloca instantáneamente (sin animación de paso) a todos los Pokémon del
// campo en su posición lógica actual, recalculada con el tamaño vigente del
// área jugable. Se llama al entrar/salir de pantalla completa (o al
// redimensionar la ventana): las plataformas usan porcentajes y se adaptan
// solas, pero los caminantes se mueven con coordenadas en píxeles (ver
// xFrac/yFrac) que quedarían obsoletas si no se recalculan.
function repositionVolcanField() {
  const ms = state.modeState;
  const inner = $('volcan-field-inner');
  if (!ms || !inner || !ms.fieldSprites) return;
  const { w, h } = volcanFieldSize();
  Object.keys(ms.fieldSprites).forEach(user => {
    const entry = ms.fieldSprites[user];
    if (!entry || entry.xFrac == null) return;
    // Cualquier movimiento en curso (por comando o por deambular libre)
    // apuntaba a unas coordenadas en píxeles ya obsoletas: se cancela y se
    // recalcula directamente la posición final con el nuevo tamaño.
    clearTimeout(entry.arriveTimeout);
    entry.arriveTimeout = null;
    entry.commandMoving = false;
    clearVolcanWanderTimer(entry);
    const x = entry.xFrac * w;
    const y = entry.yFrac * h;
    entry.el.style.transition = 'none';
    entry.el.style.left = x + 'px';
    entry.el.style.top = y + 'px';
    entry.x = x;
    entry.y = y;
    // Fuerza el reflow para que el "transition: none" surta efecto antes de
    // volver a permitir transiciones (así el próximo desplazamiento real sí
    // se anima con normalidad).
    void entry.el.offsetWidth;
    entry.el.style.transition = '';
    if (entry.sprite.frameEl) entry.sprite.pause();
    // Retoma el deambular libre, como si acabase de llegar a su sitio.
    scheduleVolcanWander(user);
  });
}

// Tras un cambio de tamaño (fullscreen o resize de ventana) el layout tarda
// uno o dos frames en asentarse; se espera con doble rAF antes de medir el
// campo, para no recalcular con medidas todavía antiguas.
function scheduleVolcanReposition() {
  requestAnimationFrame(() => requestAnimationFrame(repositionVolcanField));
}

['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange', 'scenefsfallbackchange'].forEach(evt => {
  document.addEventListener(evt, scheduleVolcanReposition);
});
window.addEventListener('resize', scheduleVolcanReposition);

/* ---------------------------------------------------------
   CUENTA ATRÁS Y ERUPCIÓN
   --------------------------------------------------------- */
function volcanCountdownTick() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  const now = performance.now();
  const msLeft = Math.max(0, ms.nextEruptionAt - now);
  renderVolcanCountdown(msLeft);
  // Aviso sonoro cuando quedan 5s o menos para la erupción: solo una vez
  // por ronda, aunque el tick se repita cada 200ms mientras dure esa
  // ventana de tiempo.
  if (msLeft <= 5000 && msLeft > 0 && !ms.fiveSecWarnPlayed) {
    ms.fiveSecWarnPlayed = true;
    playVolcanFiveSecWarning();
  }
  if (ms.eruptionBusy) return;
  if (msLeft > 0) return;

  // Se acabó el tiempo: a partir de aquí no se admiten más comandos hasta
  // que empiece la nueva ronda (se reactiva al final de triggerVolcanEruption).
  if (!ms.roundLocked) ms.roundLocked = true;

  // No se resuelve la ronda hasta que todos los sprites hayan terminado el
  // movimiento que estuvieran haciendo por los comandos recibidos.
  if (volcanAnyWalkerMoving()) return;

  triggerVolcanEruption();
}

// true si algún Pokémon del campo todavía está caminando hacia su destino
// por un COMANDO de jugador (!izquierda/!derecha). El deambular libre no
// cuenta: aunque también usa arriveTimeout para saber cuándo ha llegado,
// no debe retrasar la erupción, así que aquí solo se mira commandMoving.
function volcanAnyWalkerMoving() {
  const ms = state.modeState;
  if (!ms || !ms.fieldSprites) return false;
  return Object.values(ms.fieldSprites).some(entry => !!entry.commandMoving);
}

function renderVolcanCountdown(msLeft) {
  const numEl = $('volcan-countdown-num');
  if (numEl) numEl.textContent = String(Math.ceil(msLeft / 1000));
  const box = $('volcan-eruption-warn');
  if (box) box.classList.toggle('low', msLeft <= 8000);
}

// Crea el sprite PMD de Heatran fuera de la pantalla (por encima del campo,
// que tiene overflow:hidden) y lo anima cayendo hasta quedar centrado sobre
// el mapa, en la franja entre ambas plataformas. onLanded se llama en
// cuanto termina la caída (antes de la pausa de 1s previa al disparo).
function spawnVolcanHeatran(onLanded) {
  const ms = state.modeState;
  const inner = $('volcan-field-inner');
  if (!ms || !inner) { if (onLanded) onLanded(); return; }
  const { w, h } = volcanFieldSize();
  const centerX = w / 2;
  const startY = -0.35 * h;   // por encima del borde superior, oculto por el overflow:hidden del campo
  const centerY = h / 2;

  const el = document.createElement('div');
  el.className = 'volcan-heatran';
  el.style.left = centerX + 'px';
  el.style.top = startY + 'px';
  const spriteId = 'volcan-heatran-sprite';
  el.innerHTML = `<div class="pmd-slot pmd-mini" id="${spriteId}"></div>`;
  inner.appendChild(el);

  const sprite = new PMDSprite($(spriteId), getPokemonSprite(VOLCAN_HEATRAN_DEX));
  sprite.setDex(VOLCAN_HEATRAN_DEX);
  sprite.play('Walk', PMD_DIR.down, true, null, VOLCAN_STAND_ANIM_SPEED);
  ms.heatran = { el, sprite };

  el.style.transition = `top ${(VOLCAN_HEATRAN_FALL_MS / 1000).toFixed(2)}s cubic-bezier(.55,.06,.9,.4)`;
  void el.offsetWidth; // fuerza el estilo de partida antes de animar hacia el centro
  el.style.top = centerY + 'px';

  setTimeout(() => {
    const cur = state.modeState;
    if (cur !== ms || !ms.heatran || ms.heatran.el !== el) return;
    if (onLanded) onLanded();
  }, VOLCAN_HEATRAN_FALL_MS);
}

// Hace que Heatran vuelva a subir por donde vino (a la inversa de la caída)
// y, al terminar la subida, destruye su sprite y lo quita del DOM.
function despawnVolcanHeatran() {
  const ms = state.modeState;
  if (!ms || !ms.heatran) return;
  const { el, sprite } = ms.heatran;
  const { h } = volcanFieldSize();
  const exitY = -0.35 * h;
  el.style.transition = `top ${(VOLCAN_HEATRAN_EXIT_MS / 1000).toFixed(2)}s cubic-bezier(.4,0,.7,.3)`;
  void el.offsetWidth;
  el.style.top = exitY + 'px';
  setTimeout(() => {
    sprite.destroy();
    el.remove();
    const cur = state.modeState;
    if (cur === ms && ms.heatran && ms.heatran.el === el) ms.heatran = null;
  }, VOLCAN_HEATRAN_EXIT_MS);
}

// Decide qué plataforma entra en erupción (la que tenga más Pokémon vivos
// encima; en caso de empate, se decide al azar). Antes de que caiga la
// lluvia de magma, Heatran desciende desde arriba hasta el centro del mapa;
// 1s después de aterrizar arranca la lluvia con normalidad (Heatran
// reproduce su animación "Shoot" mientras dura) y, tras un breve instante
// para que se vea caer, mueren todos los Pokémon que en ESE momento siguen
// sobre esa plataforma. Cuando la lluvia termina, Heatran vuelve a subir
// por donde vino.
function triggerVolcanEruption() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  ms.eruptionBusy = true;

  const aliveUsers = ms.order.filter(u => ms.players[u] && ms.players[u].alive);
  const leftUsers = aliveUsers.filter(u => ms.players[u].side === 'left');
  const rightUsers = aliveUsers.filter(u => ms.players[u].side === 'right');

  let side;
  if (leftUsers.length > rightUsers.length) side = 'left';
  else if (rightUsers.length > leftUsers.length) side = 'right';
  else side = Math.random() < 0.5 ? 'left' : 'right'; // empate: se decide al azar
  const victims = side === 'left' ? leftUsers : rightUsers;
  const sideLabel = side === 'left' ? 'IZQUIERDA' : 'DERECHA';

  addChatMessage(null, '🔥 ¡Heatran desciende sobre El Volcán!', 'system', { mirror: false });

  spawnVolcanHeatran(() => {
    const cur = state.modeState;
    if (cur !== ms || ms.phase !== 'playing') return;
    playVolcanHeatranLand();

    setTimeout(() => {
      const cur2 = state.modeState;
      if (cur2 !== ms || ms.phase !== 'playing') return;

      if (ms.heatran && ms.heatran.sprite) {
        ms.heatran.sprite.play('Shoot', PMD_DIR.down, true, null, 1);
      }

      const platformEl = $(side === 'left' ? 'volcan-platform-left' : 'volcan-platform-right');
      const magmaEl = $(side === 'left' ? 'volcan-magma-left' : 'volcan-magma-right');
      playVolcanEruption();
      spawnVolcanMagmaRain(magmaEl);
      if (platformEl) {
        platformEl.classList.add('erupting');
        setTimeout(() => {
          platformEl.classList.remove('erupting');
          if (magmaEl) magmaEl.innerHTML = ''; // limpia las gotas para la próxima erupción
        }, VOLCAN_FLAME_VISUAL_MS);
      }
      volcanLog(`🌋 ¡La plataforma ${sideLabel} entra en erupción! (${victims.length} Pokémon atrapados)`, 'crit');
      addChatMessage(null, `🌋 ¡ERUPCIÓN en la plataforma ${sideLabel}! ${victims.length} Pokémon en peligro`, 'system');

      setTimeout(() => {
        const cur3 = state.modeState;
        if (cur3 !== ms || ms.phase !== 'playing') return;
        victims.forEach(u => {
          const p = ms.players[u];
          if (p && p.alive) applyVolcanDeath(p);
        });
        renderVolcanStatusList();
        // Puntos de consuelo para quien sobrevive esta oleada
        aliveUsers.filter(u => !victims.includes(u)).forEach(u => addScore(u, VOLCAN_SURVIVE_POINTS));
        ms.eruptionBusy = false;
        ms.nextEruptionAt = performance.now() + VOLCAN_ERUPTION_INTERVAL_MS;
        ms.fiveSecWarnPlayed = false; // se resetea el aviso sonoro de "quedan 5s" para la nueva ronda
        ms.roundLocked = false; // empieza la nueva ronda: se vuelven a admitir comandos
        checkVolcanEnd();
      }, VOLCAN_ERUPTION_BUILDUP_MS);

      // Cuando la lluvia termina, Heatran desaparece por donde vino.
      setTimeout(() => {
        const cur4 = state.modeState;
        if (cur4 !== ms) return;
        despawnVolcanHeatran();
      }, VOLCAN_FLAME_VISUAL_MS);
    }, VOLCAN_HEATRAN_PRE_SHOOT_DELAY_MS);
  });
}

// Genera, con posiciones y tiempos aleatorios, las gotas de magma y las
// volutas de humo/ceniza de una erupción, para que cada erupción se vea
// ligeramente distinta y la lluvia resulte orgánica en vez de un patrón
// repetido. Cada gota lleva sus propios --x/--w/--fall-dur/--fall-delay
// (leídos por las animaciones en CSS) fijados como estilo en línea.
function spawnVolcanMagmaRain(container) {
  if (!container) return;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  const totalWindow = (VOLCAN_FLAME_VISUAL_MS - 750) / 1000; // margen para que hasta la última gota le dé tiempo a caer y salpicar

  for (let i = 0; i < VOLCAN_MAGMA_DROP_COUNT; i++) {
    const drop = document.createElement('span');
    drop.className = 'drop';
    const x = 5 + Math.random() * 90;                          // % horizontal dentro de la plataforma
    const w = 2.4 + Math.random() * 2.2;                        // % de ancho de la gota
    const fallDur = 0.62 + Math.random() * 0.4;                 // s que tarda en caer
    const fallDelay = (i / VOLCAN_MAGMA_DROP_COUNT) * totalWindow + Math.random() * 0.12;
    drop.style.cssText = `--x:${x}%; --w:${w}%; --fall-dur:${fallDur.toFixed(2)}s; --fall-delay:${fallDelay.toFixed(2)}s;`;
    frag.appendChild(drop);
  }
  for (let i = 0; i < VOLCAN_MAGMA_SMOKE_COUNT; i++) {
    const smoke = document.createElement('span');
    smoke.className = 'smoke';
    const x = 8 + Math.random() * 84;
    const delay = 0.35 + (i / VOLCAN_MAGMA_SMOKE_COUNT) * (totalWindow * 0.85) + Math.random() * 0.15;
    smoke.style.cssText = `--x:${x}%; --smoke-delay:${delay.toFixed(2)}s;`;
    frag.appendChild(smoke);
  }
  container.appendChild(frag);
}

function applyVolcanDeath(p) {
  const ms = state.modeState;
  p.alive = false;
  const el = $(p.elId);
  const entry = ms.fieldSprites[p.user];
  if (entry) {
    clearTimeout(entry.arriveTimeout);
    clearVolcanWanderTimer(entry);
    // Primero se reproduce la animación de "Hurt" completa (el Pokémon se
    // queda quieto en su sitio recibiendo el golpe de las llamas); el
    // desvanecido (.dead) solo arranca cuando el Hurt termina.
    entry.sprite.play('Hurt', entry.dir || PMD_DIR.down, false, () => {
      if (el) el.classList.add('dead');
      setTimeout(() => {
        entry.sprite.destroy();
        entry.el.remove();
        delete ms.fieldSprites[p.user];
      }, VOLCAN_DEATH_FADE_MS);
    });
  } else if (el) {
    el.classList.add('dead');
  }
  volcanLog(`🔥 ¡${p.pokemon.name} (@${p.user}) es devorado por la lava!`, 'dmg');
  addChatMessage(null, `🔥 @${p.user} y su ${p.pokemon.name} caen en la lava`, 'wrong', { mirror: false });
}

/* ---------------------------------------------------------
   PANEL DE ESTADO / REGISTRO
   --------------------------------------------------------- */
function volcanLog(text, cls = '') {
  const log = $('volcan-log');
  if (!log) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}

function renderVolcanStatusList() {
  const ms = state.modeState;
  const list = $('volcan-status-list');
  if (!ms || !list) return;
  const players = ms.order.map(u => ms.players[u]);
  const alive = players.filter(p => p.alive);

  const aliveCountEl = $('volcan-alive-count');
  if (aliveCountEl) aliveCountEl.textContent = alive.length;

  if (players.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);">Sin jugadores</div>';
    return;
  }
  list.innerHTML = players.map(p => {
    const sideIcon = p.side === 'left' ? '⬅️' : '➡️';
    const icon = p.alive ? sideIcon : '💀';
    return `
      <div class="volcan-status-row${p.alive ? '' : ' dead'}">
        <img src="${getPokemonSprite(p.pokemon.sprite)}" alt="">
        <span>${icon} @${escapeHtml(p.user)}</span>
        <span class="volcan-side-badge">${p.alive ? (p.side === 'left' ? 'Izquierda' : 'Derecha') : 'Eliminado'}</span>
      </div>
    `;
  }).join('');
}

/* ---------------------------------------------------------
   FIN DE PARTIDA
   --------------------------------------------------------- */
function checkVolcanEnd() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  const alive = ms.order.map(u => ms.players[u]).filter(p => p.alive);
  if (alive.length <= 1) {
    endVolcan(alive[0] || null);
  }
}

function endVolcan(winner) {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'ended';
  if (ms.tickInterval) clearInterval(ms.tickInterval);
  ms.tickInterval = null;

  const field = $('volcan-field-outer');
  if (winner) {
    addScore(winner.user, VOLCAN_WIN_POINTS);
    playVolcanVictory();
    volcanLog(`🏆 ¡${winner.pokemon.name} (@${winner.user}) sobrevive a El Volcán!`, 'crit');
    addChatMessage(null, `🏆 ¡@${winner.user} gana El Volcán con ${winner.pokemon.name}!`, 'correct');
  } else {
    playVolcanWipeout();
    volcanLog('🌋 El Volcán se traga a todos los Pokémon...', '');
    addChatMessage(null, '☠️ Nadie sobrevive a El Volcán', 'wrong');
  }
  if (field) {
    const banner = document.createElement('div');
    banner.className = 'volcan-victory-banner';
    banner.innerHTML = winner ? `
      <img src="${getPokemonSprite(winner.pokemon.sprite)}" alt="${escapeHtml(winner.pokemon.name)}">
      <div class="win-title pixel">¡VICTORIA!</div>
      <div class="win-sub">${escapeHtml(winner.pokemon.name)} de @${escapeHtml(winner.user)} es el último en pie</div>
      <div class="mode-end-actions">
        <button class="volcan-start-btn" id="volcan-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="volcan-menu-btn">🏠 Menú Principal</button>
      </div>
    ` : `
      <div class="win-title pixel">SIN SUPERVIVIENTES</div>
      <div class="win-sub">El Volcán ha acabado con todos los Pokémon</div>
      <div class="mode-end-actions">
        <button class="volcan-start-btn" id="volcan-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="volcan-menu-btn">🏠 Menú Principal</button>
      </div>
    `;
    field.appendChild(banner);
    const again = $('volcan-again-btn');
    if (again) again.onclick = () => startVolcan();
    const menuBtn = $('volcan-menu-btn');
    if (menuBtn) menuBtn.onclick = () => backToMenu();
  }
}
