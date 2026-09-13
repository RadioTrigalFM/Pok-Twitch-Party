import { addChatMessage, escapeHtml } from '../chat.js';
import {
  playRayoSolarBeam, playModeMusic, playRsJoin, playRsMatchStart,
  playRsHit, playRsVictory, playRsWipeout,
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
   MODO RAYO SOLAR
   -----------------------------------------------------------
   - Fase de lobby: los viewers se apuntan con !pokemon [nombre],
     igual que en El Volcán / Zona Safari / Pokerus, con toda la
     Pokédex Nacional y sprites PMD animados.
   - Al empezar la partida, el mapa se divide en dos franjas
     horizontales:
       · Parte SUPERIOR (20% de la altura): aquí vive Venusaur,
         paseándose solo de izquierda a derecha muy despacio y de
         forma aleatoria (deambular libre, sin que el chat lo
         controle).
       · Parte INFERIOR (80% restante): aquí aparecen todos los
         participantes, repartidos en posiciones aleatorias.
   - Cada jugador controla a su Pokémon con !izquierda / !i y
     !derecha / !d (se mueve sin parar en esa dirección hasta que
     llegue al borde del campo o reciba otro comando) y con !stop
     (se queda quieto donde esté). El movimiento es solo horizontal,
     los jugadores no cambian de altura dentro de la parte inferior.
   - No se puede empezar la partida con menos de 2 jugadores
     apuntados. La partida termina en cuanto solo queda 1 Pokémon con
     vida (gana) o cuando el Rayo Solar de Venusaur acaba con todos
     (ver checkRayoEnd/endRayoSolar).
   ========================================================= */

const RAYO_STAND_ANIM_SPEED = 2.6;    // animación "Walk" lenta = de pie quieto
const RAYO_WALK_ANIM_SPEED = 3.4;     // animación "Walk" mientras el jugador camina de verdad
const RAYO_WALK_PX_PER_S = 21;        // velocidad real de avance por el mapa al recibir !izquierda/!derecha (30 px/s original menos un 30%: 30 * 0.7 = 21)
const RAYO_TICK_MS = 50;              // frecuencia del bucle de movimiento de los jugadores

// Márgenes (en % del ancho/alto de la parte inferior) para que ningún
// jugador aparezca ni camine pegado al borde del campo.
const RAYO_PLAYER_X_MARGIN_PCT = 5;
const RAYO_PLAYER_Y_MARGIN_PCT = 10;

// Venusaur: deambula solo por la parte superior, muy despacio, parándose de
// vez en cuando — mismo truco de transición CSS que usa Heatran/el
// deambular libre de El Volcán (ver volcanMoveWalker/scheduleVolcanWander).
const RAYO_VENUSAUR_DEX = 3;
const RAYO_VENUSAUR_PX_PER_S = 18;          // avance muy lento
const RAYO_VENUSAUR_ANIM_SPEED = 3.5;       // animación "Walk" también ralentizada (el doble de rápido que antes: play() usa speed como divisor de framerate, así que a menor valor, más rápido)
const RAYO_VENUSAUR_PAUSE_MIN_MS = 1500;    // pausa mínima entre un paseo y el siguiente
const RAYO_VENUSAUR_PAUSE_MAX_MS = 4000;    // pausa máxima
const RAYO_VENUSAUR_STOP_CHANCE = 0.35;     // probabilidad de quedarse quieto otra pausa en vez de caminar
const RAYO_VENUSAUR_X_MARGIN_PCT = 10;      // margen respecto a los bordes izq/dcha de la parte superior
const RAYO_VENUSAUR_Y_PCT = 58;             // posición vertical fija dentro de la parte superior (% de su propia franja)
// Cada vez que Venusaur se detiene (tanto si decide no moverse en su turno
// de deambular como al llegar a su destino tras caminar) hay un 30% de
// probabilidades de que "active" su ataque Rayo Solar (ver
// rayoVenusaurMaybeShoot / rayoVenusaurSolarBeamSequence más abajo) en vez
// de quedarse plantado sin más: primero una fase de "Charge" (carga) y
// luego una de "Shoot" (disparo), con sus avisos visuales.
const RAYO_VENUSAUR_SHOOT_CHANCE = 0.3;
const RAYO_VENUSAUR_CHARGE_MS = 15000;      // duración de la animación "Charge" antes de disparar
const RAYO_VENUSAUR_SHOOT_MS = 2000;        // duración de la animación "Shoot" (el disparo en sí)
// Cada vez que Venusaur ataca (activa Rayo Solar), TODOS sus movimientos
// -cargar, caminar y quedarse quieto- se aceleran un 10% de forma
// acumulativa (ver ms.venusaurSpeedMult / rayoVenusaurSpeedMult y su uso en
// rayoVenusaurSolarBeamSequence, scheduleRayoVenusaurWander y
// moveRayoVenusaurTo). La animación "Shoot" y el propio rayo (ataque) NUNCA
// se ven afectados: su duración es siempre RAYO_VENUSAUR_SHOOT_MS.
const RAYO_VENUSAUR_ACCEL_PER_ATTACK = 1.1;
// Si el rayo alcanza a un jugador: reproduce su animación "Hurt" al
// instante y, pasados RAYO_HIT_TO_FAINT_MS, empieza a desvanecerse durante
// RAYO_FAINT_FADE_MS hasta desaparecer del campo por completo.
const RAYO_HIT_TO_FAINT_MS = 2000;
const RAYO_FAINT_FADE_MS = 900;
// Si Venusaur encadena este número de disparos SEGUIDOS sin alcanzar a
// nadie, su siguiente comportamiento deja de ser el deambular/disparo
// aleatorio habitual: se mueve horizontalmente hasta alinearse con un
// jugador y dispara directamente (ver rayoVenusaurForcedAimMove), repitiendo
// esto hasta que consiga alcanzar a alguien.
const RAYO_VENUSAUR_MISS_STREAK_FOR_FORCED_AIM = 2;
// Si la racha de disparos SEGUIDOS sin alcanzar a nadie llega a este
// número, Venusaur se mueve MUCHO más deprisa por la parte superior (ver
// rayoVenusaurMovementSpeedMult): un +300% (×4) sobre la velocidad de
// movimiento que tuviera en ese momento (ya incluyendo la aceleración
// acumulativa por ataques de RAYO_VENUSAUR_ACCEL_PER_ATTACK). Es un boost
// binario -activo mientras la racha siga en pie, sin crecer más allá de
// este umbral- que solo afecta a cómo de rápido CAMINA (moveRayoVenusaurTo/
// moveRayoVenusaurToForcedShoot): no acelera la carga del Rayo Solar
// (RAYO_VENUSAUR_CHARGE_MS) ni las pausas entre paseos. Desaparece en
// cuanto Venusaur vuelve a alcanzar a alguien (ms.venusaurMissStreak vuelve
// a 0, ver rayoVenusaurSolarBeamSequence).
const RAYO_VENUSAUR_MISS_STREAK_FOR_SPEED_BOOST = 5;
const RAYO_VENUSAUR_MISS_SPEED_BOOST_MULT = 4; // +300% = ×4
// Mínimo de jugadores apuntados para poder empezar la partida (por debajo
// de 2 no tiene sentido la dinámica de "último en pie", ver
// startRayoSolarMatch/renderRayoSolarLobbyGrid).
const RAYO_MIN_PLAYERS = 2;
// Puntos que gana el último Pokémon en pie al terminar la partida (ver
// endRayoSolar), igual que en El Volcán (VOLCAN_WIN_POINTS).
const RAYO_WIN_POINTS = 500;

export function startRayoSolar() {
  // Al terminar una partida y pulsar "Nueva Partida" (ver el botón
  // #rayo-again-btn en endRayoSolar) esta misma función se vuelve a
  // llamar para reconstruir el lobby, lo que destruye por completo el
  // contenido anterior de #game-content (ver renderRayoSolarLobby, más
  // abajo). Si esa escena anterior estaba en pantalla completa (nativa o
  // simulada con .fs-fallback), destruir su nodo del DOM hace que el
  // navegador salga de pantalla completa por su cuenta -y, en el modo
  // simulado, deja además colgada la referencia a ese nodo ya inexistente
  // en fullscreen.js, rompiendo cosas como el modal de "¿Volver al menú?"
  // (ver relocateModal en utils.js), que intentaría mostrarse dentro de un
  // elemento que ya no existe-. Por eso aquí se guarda si había pantalla
  // completa activa ANTES de reconstruir nada, para restaurarla sobre la
  // escena nueva del lobby justo después (ver más abajo): así la pantalla
  // completa no se ve interrumpida al pulsar "Nueva Partida", y de paso se
  // renueva la referencia a la escena viva, arreglando también el modal.
  const wasFullscreen = !!currentFullscreenElement();
  state.modeState = {
    phase: 'lobby',       // 'lobby' | 'playing' | 'ended'
    players: {},            // user -> jugador
    order: [],
    lobbySprites: {},       // user -> { el, sprite, dex } — caminantes PMD del lobby
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startRayoSolar(), es decir, al empezar una nueva partida).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    fieldSprites: {},       // user -> { el, sprite } — sprites PMD de los jugadores en la parte inferior
    venusaur: null,         // { el, sprite, wanderTimeout } — Venusaur en la parte superior
    // Punto (en px, coordenada X nativa del campo) que el streamer ha
    // marcado con un clic en la franja superior (ver handleRayoTopZoneClick
    // / rayoVenusaurGoToMark) para el próximo disparo de Venusaur; null si
    // no hay ningún punto pendiente. Se consume en cuanto se usa: al hacer
    // clic mientras Venusaur no está cargando/disparando (se va derecho ahí
    // de inmediato) o, si estaba cargando/disparando en ese momento, en
    // cuanto esa animación termina (ver el chequeo al principio de
    // scheduleRayoVenusaurWander/rayoVenusaurForcedAimMove).
    venusaurTargetMark: null,
    // Multiplicador de velocidad de Venusaur: empieza en 1 (velocidad
    // normal) y se multiplica por 1.1 cada vez que ataca (ver
    // rayoVenusaurSolarBeamSequence), acelerando un 10% acumulativo cargar,
    // caminar y quedarse quieto. La animación "Shoot" y el rayo en sí NO se
    // ven afectados: mantienen siempre la misma duración.
    venusaurSpeedMult: 1,
    // Nº de disparos SEGUIDOS de Venusaur que no han alcanzado a nadie (ver
    // RAYO_VENUSAUR_MISS_STREAK_FOR_FORCED_AIM / rayoVenusaurForcedAimMove).
    // Se reinicia a 0 en cuanto un disparo alcanza a algún jugador.
    venusaurMissStreak: 0,
    solarSilhouetteEl: null, // aviso visual (silueta) durante la fase "Charge" del Rayo Solar
    solarBeamEl: null,       // ataque visual (rayo) durante la fase "Shoot" del Rayo Solar
    tickInterval: null,     // intervalo que mueve a los jugadores que están caminando
    lastTick: 0,
  };
  renderRayoSolarLobby();
  if (wasFullscreen) {
    // Restaura la pantalla completa sobre la escena del lobby recién
    // creada (ver el comentario de arriba). Se pide directamente -sin
    // comprobar el estado actual, que puede no haberse actualizado aún
    // tras destruir el nodo anterior- porque ya sabemos con certeza que
    // había pantalla completa activa y que queremos volver a entrar.
    requestSceneFullscreen($('rayo-lobby-scene'));
  }
  addChatMessage(null, `☀️ ¡Rayo Solar está abierto! Escribe !pokemon [nombre] para apuntarte. ¡Disponible toda la Pokédex Nacional (${ARENA_POKEMON_DB.length} Pokémon)!`, 'system');
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderRayoSolarLobby() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="rayo-lobby-box game-scene" id="rayo-lobby-scene">
      <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
      <div class="rayo-lobby-head">
        <div class="big-count pixel" id="rayo-count">0</div>
        <div style="color:var(--muted);font-size:12px;">jugadores apuntados · escribe <b style="color:var(--yellow)">!pokemon [nombre]</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:520px;margin:6px auto 0;line-height:1.6;">
          Al empezar la partida, Venusaur se paseará solo por la franja superior del mapa mientras
          movéis a vuestro Pokémon por la franja inferior con
          <b style="color:#ffcb05">!izquierda</b> (<b style="color:#ffcb05">!i</b>),
          <b style="color:#ffcb05">!derecha</b> (<b style="color:#ffcb05">!d</b>) y
          <b style="color:#ffcb05">!stop</b>.
        </div>
      </div>
      <div class="rayo-lobby-grid" id="rayo-lobby-grid">
        <div class="rayo-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="rayo-start-btn" id="rayo-start-btn" disabled>▶ Comenzar Partida</button>
    </div>
  `;
  $('rayo-start-btn').onclick = () => startRayoSolarMatch();
  renderRayoSolarLobbyGrid();
}

// Igual que en Zona Safari / El Volcán: cada jugador tiene su propia
// tarjeta con un sprite PMD que se crea una sola vez y se conserva
// mientras esté en el lobby.
function renderRayoSolarLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('rayo-lobby-grid');
  const countEl = $('rayo-count');
  const btn = $('rayo-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (btn) btn.disabled = players.length < RAYO_MIN_PLAYERS;

  if (players.length === 0) {
    grid.innerHTML = '<div class="rayo-lobby-empty">Esperando a que el chat se apunte...</div>';
    return;
  }
  const emptyMsg = grid.querySelector('.rayo-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    let entry = ms.lobbySprites[p.user];
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'rayo-lobby-card';
      el.title = 'Clic para expulsar de la partida';
      const spriteId = 'rs-lobby-' + sanitizeUser(p.user);
      el.innerHTML = `
        <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
        <div class="p-name">${escapeHtml(p.pokemon.name)}</div>
        <div class="p-user">@${escapeHtml(p.user)}</div>
      `;
      // El streamer puede hacer clic en cualquier jugador inscrito para que
      // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleLobbyExpelPopover(ms, p.user, el, expelFromRayoSolarLobby);
      });
      grid.appendChild(el);
      const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
      sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      sprite.play('Walk', PMD_DIR.down, true, null, 2.6);
      ms.lobbySprites[p.user] = { el, sprite, dex: p.pokemon.sprite };
    } else if (entry.dex !== p.pokemon.sprite) {
      entry.sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      entry.sprite.play('Walk', PMD_DIR.down, true, null, 2.6);
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
// la siguiente partida (nueva llamada a startRayoSolar()).
function expelFromRayoSolarLobby(user) {
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
  renderRayoSolarLobbyGrid();
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleRayoSolarCmd(user, cmd, parts) {
  const ms = state.modeState;
  if (!ms) return;

  if (cmd === '!pokemon') {
    if (ms.phase !== 'lobby') {
      addChatMessage(null, `${user}: la partida ya ha comenzado, ¡espera a la siguiente!`, 'system', { mirror: false });
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
      xPct: 50,        // se reasigna al azar al empezar la partida (ver startRayoSolarMatch)
      yPct: 50,
      dir: 0,           // -1 izquierda, 0 quieto, 1 derecha
      moving: false,
      hit: false,       // true en cuanto el Rayo Solar de Venusaur lo alcanza
      elId: 'rs-' + sanitizeUser(user),
    };
    if (isNew) ms.order.push(user);
    pmdPreload(pokemon.sprite);
    addChatMessage(null, `✅ ${user} se apunta con ${pokemon.name}!`, 'correct', { mirror: false });
    if (isNew) playRsJoin();
    renderRayoSolarLobbyGrid();
    return;
  }

  if (cmd === '!izquierda' || cmd === '!derecha' || cmd === '!i' || cmd === '!d') {
    if (ms.phase !== 'playing') return;
    const p = ms.players[user];
    if (!p) return;
    p.dir = (cmd === '!izquierda' || cmd === '!i') ? -1 : 1;
    p.moving = true;
    updateRayoWalkerAnim(p);
    return;
  }

  if (cmd === '!stop') {
    if (ms.phase !== 'playing') return;
    const p = ms.players[user];
    if (!p) return;
    p.moving = false;
    updateRayoWalkerAnim(p);
    return;
  }
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA
   --------------------------------------------------------- */
function destroyRayoSprites(registry) {
  Object.values(registry).forEach(entry => {
    if (entry.sprite) entry.sprite.destroy();
    if (entry.el) entry.el.remove();
  });
}

function startRayoSolarMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const users = ms.order.slice();
  if (users.length < RAYO_MIN_PLAYERS) {
    toast('Se necesitan al menos 2 jugadores para empezar');
    return;
  }
  destroyRayoSprites(ms.lobbySprites);
  ms.lobbySprites = {};

  ms.phase = 'playing';
  // La música de este modo no suena durante el lobby de inscripción (ahí
  // sigue la del menú principal): arranca justo aquí, al cerrarse el lobby
  // y empezar la partida de verdad (ver MODES_WITHOUT_LOBBY_MUSIC en
  // modeLauncher.js).
  playModeMusic('rayosolar');
  playRsMatchStart();
  ms.venusaurSpeedMult = 1; // reinicia la aceleración por ataques al empezar la partida
  ms.venusaurMissStreak = 0; // reinicia la racha de disparos fallidos al empezar la partida
  ms.venusaurTargetMark = null; // reinicia el punto marcado (de una partida anterior) al empezar
  users.forEach(u => {
    const p = ms.players[u];
    // Posición aleatoria dentro de la parte inferior (repartidos por todo
    // el mapa, con margen respecto a los bordes).
    p.xPct = RAYO_PLAYER_X_MARGIN_PCT + Math.random() * (100 - 2 * RAYO_PLAYER_X_MARGIN_PCT);
    p.yPct = RAYO_PLAYER_Y_MARGIN_PCT + Math.random() * (100 - 2 * RAYO_PLAYER_Y_MARGIN_PCT);
    p.dir = 0;
    p.moving = false;
    p.hit = false;
  });
  renderRayoSolarField();
  addChatMessage(null, `☀️ ¡Comienza Rayo Solar con ${users.length} Pokémon! Escribid !izquierda (!i) / !derecha (!d) para moveros y !stop para pararos.`, 'system', { mirror: false });
  ms.lastTick = performance.now();
  ms.tickInterval = setInterval(rayoTick, RAYO_TICK_MS);
}

/* ---------------------------------------------------------
   CAMPO DE JUEGO
   --------------------------------------------------------- */
function renderRayoSolarField() {
  const content = $('game-content');
  const ms = state.modeState;
  const players = ms.order.map(u => ms.players[u]);
  content.innerHTML = `
    <div class="rayo-wrap">
      <div class="rayo-topbar">
        <div class="stat">☀️ Jugadores: <b id="rayo-alive-count">${players.length}</b></div>
      </div>
      <div class="rayo-field-frame">
        <div class="rayo-field-outer game-scene" id="rayo-field-outer">
          <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
          <div class="rayo-status-sign">
            <div class="zor-sign-board">
              <div class="zor-sign-title">Muévete con:</div>
              <div class="zor-sign-cmds">
                <span>!izquierda</span><span>!i</span><span>!derecha</span><span>!d</span><span>!stop</span>
              </div>
            </div>
          </div>
          <div class="rayo-top-zone" id="rayo-top-zone"></div>
          <div class="rayo-bottom-zone" id="rayo-bottom-zone"></div>
        </div>
      </div>
    </div>
  `;
  // Antes de crear a los jugadores y a Venusaur: varias funciones de
  // colocación (rayoTopZoneSize/rayoBottomZoneSize) leen el tamaño real en
  // px de las franjas, así que #rayo-field-outer ya debe tener su tamaño
  // "nativo" fijado (ver syncRayoFieldScale) antes de que se calculen esas
  // posiciones, o partirían de un tamaño 0/sin definir.
  observeRayoFieldScale();
  ms.fieldSprites = {};
  players.forEach(p => createRayoWalker(p));
  spawnRayoVenusaur();
  const topZone = $('rayo-top-zone');
  if (topZone) topZone.addEventListener('click', handleRayoTopZoneClick);
}

// Clic del streamer en la franja superior (por donde deambula Venusaur, su
// "posible ruta") para marcar dónde quiere que dispare a continuación (ver
// rayoVenusaurGoToMark). Se calcula la X nativa del campo a partir de la
// posición del clic en pantalla y el tamaño VISUAL real de la franja
// (getBoundingClientRect, que ya tiene en cuenta el transform:scale que
// aplica syncRayoFieldScale fuera de pantalla completa), no su
// clientWidth/clientHeight nativo -así el punto marcado cae exactamente
// donde se ha hecho clic tanto dentro como fuera de pantalla completa,
// igual que hace el propio Venusaur al colocarse con rayoVenusaurRandomX/
// rayoTopZoneSize-.
function handleRayoTopZoneClick(ev) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing' || !ms.venusaur) return;
  const zone = $('rayo-top-zone');
  if (!zone) return;
  const rect = zone.getBoundingClientRect();
  if (!rect.width) return;
  const { w } = rayoTopZoneSize();
  const minX = (RAYO_VENUSAUR_X_MARGIN_PCT / 100) * w;
  const maxX = w - minX;
  const fraction = (ev.clientX - rect.left) / rect.width;
  const targetX = Math.max(minX, Math.min(maxX, fraction * w));
  showRayoVenusaurMarkFx(targetX);
  rayoVenusaurGoToMark(targetX);
}

// Aspa decorativa y breve en el punto marcado (ver .rayo-target-mark en
// styles.css), puramente de confirmación visual para el streamer: no
// influye en absoluto en el movimiento/disparo real de Venusaur.
function showRayoVenusaurMarkFx(x) {
  const zone = $('rayo-top-zone');
  if (!zone) return;
  const el = document.createElement('div');
  el.className = 'rayo-target-mark';
  el.style.left = x + 'px';
  zone.appendChild(el);
  setTimeout(() => el.remove(), 650);
}

// Aplica el punto marcado por el streamer (ver handleRayoTopZoneClick):
//   - Si Venusaur está cargando o disparando (entry.solarTimeout activo),
//     esa animación NUNCA se interrumpe: el punto solo se guarda en
//     ms.venusaurTargetMark y se recoge en cuanto termine (ver el chequeo al
//     principio de scheduleRayoVenusaurWander/rayoVenusaurForcedAimMove).
//   - Si no, Venusaur para en seco lo que estuviera haciendo (deambular
//     parado en su pausa, o caminando hacia otro punto al azar/forzado) y
//     se dirige derecho al punto marcado, caminando con su animación "Walk"
//     de siempre (ver moveRayoVenusaurToForcedShoot), para cargar y
//     disparar ahí en cuanto llegue.
function rayoVenusaurGoToMark(targetX) {
  const ms = state.modeState;
  const entry = ms && ms.venusaur;
  if (!ms || !entry) return;
  if (entry.solarTimeout) {
    ms.venusaurTargetMark = targetX;
    return;
  }
  ms.venusaurTargetMark = null;
  clearRayoVenusaurWanderTimer();
  moveRayoVenusaurToForcedShoot(targetX);
}

/* ---------------------------------------------------------
   ESCALADO DEL MAPA FUERA DE PANTALLA COMPLETA
   -----------------------------------------------------------
   Fuera de pantalla completa, #rayo-field-outer (el mapa: fondo, franjas,
   Venusaur, jugadores...) se fija a un tamaño "nativo" igual al de la
   pantalla (mismo tamaño que tendría en pantalla completa de verdad) y se
   reescala con transform:scale para que quepa en .rayo-field-frame, el
   hueco real que le deja el layout. Así se ve exactamente lo mismo que en
   pantalla completa, solo que más pequeño, en vez de un mapa con otras
   proporciones. En pantalla completa de verdad no se toca nada aquí: se
   limpian los estilos inline y el elemento vuelve a regirse por las reglas
   ".game-scene:fullscreen" de siempre (ver styles.css), exactamente igual
   que antes de este ajuste.
   --------------------------------------------------------- */
let rayoFieldResizeObserver = null;

function syncRayoFieldScale() {
  const frame = document.querySelector('.rayo-field-frame');
  const outer = $('rayo-field-outer');
  if (!frame || !outer) return;
  if (currentFullscreenElement() === outer) {
    // Pantalla completa real: el tamaño fijo que ignora el zoom del
    // navegador lo aplica fullscreen.js de forma genérica para cualquier
    // escena (ver applyFullscreenSizeLock ahí), así que aquí no se toca
    // width/height/transform -sobrescribirlos aquí también competiría con
    // ese ajuste según el orden en que se disparen los listeners-.
    return;
  }
  const nativeW = (window.screen && window.screen.width) || window.innerWidth || 1920;
  const nativeH = (window.screen && window.screen.height) || window.innerHeight || 1080;
  const frameW = frame.clientWidth || 1;
  const frameH = frame.clientHeight || 1;
  const scale = Math.min(frameW / nativeW, frameH / nativeH) || 1;
  outer.style.width = nativeW + 'px';
  outer.style.height = nativeH + 'px';
  outer.style.transform = `scale(${scale})`;
  outer.style.transformOrigin = 'center center';
}

function observeRayoFieldScale() {
  if (rayoFieldResizeObserver) { rayoFieldResizeObserver.disconnect(); rayoFieldResizeObserver = null; }
  const frame = document.querySelector('.rayo-field-frame');
  if (!frame) return;
  rayoFieldResizeObserver = new ResizeObserver(() => syncRayoFieldScale());
  rayoFieldResizeObserver.observe(frame);
  syncRayoFieldScale();
}

// Reacciona a cualquier cambio de pantalla completa (nativa o simulada) de
// cualquier escena: syncRayoFieldScale no hace nada si el mapa de Rayo
// Solar no está en pantalla en ese momento, así que es seguro escucharlo a
// nivel de módulo sin desconectar/reconectar por partida.
['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange', 'scenefsfallbackchange'].forEach(evt => {
  document.addEventListener(evt, syncRayoFieldScale);
});

function createRayoWalker(p) {
  const ms = state.modeState;
  const zone = $('rayo-bottom-zone');
  if (!zone) return;
  const el = document.createElement('div');
  el.className = 'rayo-walker';
  el.id = p.elId;
  el.style.left = p.xPct + '%';
  el.style.top = p.yPct + '%';
  const spriteId = 'rs-sprite-' + sanitizeUser(p.user);
  el.innerHTML = `
    <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
    <div class="rayo-name">@${escapeHtml(p.user)}</div>
  `;
  zone.appendChild(el);
  const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
  sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
  ms.fieldSprites[p.user] = { el, sprite };
  updateRayoWalkerAnim(p); // respeta si arranca parado (congelado) o caminando
}

function updateRayoWalkerAnim(p) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[p.user];
  if (!entry) return;
  if (p.moving) {
    // Caminando: bucle continuo del ciclo de andar, orientado hacia donde avanza.
    const dir = p.dir < 0 ? PMD_DIR.left : PMD_DIR.right;
    entry.sprite.play('Walk', dir, true, null, RAYO_WALK_ANIM_SPEED);
  } else {
    // Parado (!stop, o recién colocado en el campo): mirando hacia abajo y
    // reproduciendo el ciclo de "Walk" en bucle pero a cámara lenta -pose de
    // "esperando"-, en vez de quedarse congelado en el fotograma en el que
    // estuviera al recibir la orden de parar.
    entry.sprite.play('Walk', PMD_DIR.down, true, null, RAYO_STAND_ANIM_SPEED);
  }
}

function rayoBottomZoneSize() {
  const zone = $('rayo-bottom-zone');
  return zone ? { w: zone.clientWidth || 900, h: zone.clientHeight || 400 } : { w: 900, h: 400 };
}

/* ---------------------------------------------------------
   BUCLE DE MOVIMIENTO DE LOS JUGADORES
   --------------------------------------------------------- */
function rayoTick() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  const now = performance.now();
  const dt = ms.lastTick ? (now - ms.lastTick) : RAYO_TICK_MS;
  ms.lastTick = now;
  const { w } = rayoBottomZoneSize();
  const deltaPct = (RAYO_WALK_PX_PER_S * (dt / 1000) / w) * 100;

  ms.order.forEach(u => {
    const p = ms.players[u];
    if (!p || !p.moving) return;
    const minX = RAYO_PLAYER_X_MARGIN_PCT;
    const maxX = 100 - RAYO_PLAYER_X_MARGIN_PCT;
    let next = p.xPct + p.dir * deltaPct;
    let hitEdge = false;
    if (next <= minX) { next = minX; hitEdge = true; }
    if (next >= maxX) { next = maxX; hitEdge = true; }
    p.xPct = next;
    const el = $(p.elId);
    if (el) el.style.left = p.xPct + '%';
    if (hitEdge) {
      // Se para solo al llegar al borde del campo, hasta que reciba un
      // nuevo comando de movimiento.
      p.moving = false;
      updateRayoWalkerAnim(p);
    }
  });
}

/* ---------------------------------------------------------
   VENUSAUR — DEAMBULAR LIBRE POR LA PARTE SUPERIOR
   --------------------------------------------------------- */
function rayoTopZoneSize() {
  const zone = $('rayo-top-zone');
  return zone ? { w: zone.clientWidth || 900, h: zone.clientHeight || 110 } : { w: 900, h: 110 };
}

function rayoVenusaurRandomX() {
  const { w } = rayoTopZoneSize();
  const minPct = RAYO_VENUSAUR_X_MARGIN_PCT;
  const maxPct = 100 - RAYO_VENUSAUR_X_MARGIN_PCT;
  return (minPct + Math.random() * (maxPct - minPct)) / 100 * w;
}

// Multiplicador de velocidad acumulado de Venusaur (1 = normal, sube un
// 10% -×1.1- cada vez que ataca; ver RAYO_VENUSAUR_ACCEL_PER_ATTACK). Se
// usa para acelerar cargar/caminar/quedarse quieto; el disparo en sí no lo
// usa nunca.
function rayoVenusaurSpeedMult() {
  const ms = state.modeState;
  return (ms && ms.venusaurSpeedMult) || 1;
}

// Igual que rayoVenusaurSpeedMult, pero con el boost extra de
// RAYO_VENUSAUR_MISS_SPEED_BOOST_MULT (+300%) cuando la racha de disparos
// fallidos seguidos alcanza RAYO_VENUSAUR_MISS_STREAK_FOR_SPEED_BOOST (ver
// ms.venusaurMissStreak, actualizado en rayoVenusaurSolarBeamSequence): se
// usa solo en el movimiento real de Venusaur por la parte superior
// (moveRayoVenusaurTo/moveRayoVenusaurToForcedShoot), nunca en la carga ni
// en las pausas entre paseos.
function rayoVenusaurMovementSpeedMult() {
  const ms = state.modeState;
  const base = rayoVenusaurSpeedMult();
  const missStreak = (ms && ms.venusaurMissStreak) || 0;
  return missStreak >= RAYO_VENUSAUR_MISS_STREAK_FOR_SPEED_BOOST ? base * RAYO_VENUSAUR_MISS_SPEED_BOOST_MULT : base;
}

function spawnRayoVenusaur() {
  const ms = state.modeState;
  const zone = $('rayo-top-zone');
  if (!ms || !zone) return;
  pmdPreload(RAYO_VENUSAUR_DEX);
  const { h } = rayoTopZoneSize();
  const x = rayoVenusaurRandomX();
  const y = (RAYO_VENUSAUR_Y_PCT / 100) * h;
  const el = document.createElement('div');
  el.className = 'rayo-venusaur';
  el.id = 'rayo-venusaur-el';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  const spriteId = 'rayo-venusaur-sprite';
  el.innerHTML = `<div class="pmd-slot pmd-mini" id="${spriteId}"></div>`;
  zone.appendChild(el);
  const sprite = new PMDSprite($(spriteId), getPokemonSprite(RAYO_VENUSAUR_DEX));
  sprite.setDex(RAYO_VENUSAUR_DEX);
  sprite.play('Walk', PMD_DIR.down, false, null, RAYO_STAND_ANIM_SPEED / rayoVenusaurSpeedMult());
  ms.venusaur = { el, sprite, x, y, dir: PMD_DIR.right, wanderTimeout: null, missedShootStreak: 0 };
  scheduleRayoVenusaurWander();
}

// Se llama cada vez que Venusaur se detiene (ver los dos puntos que la
// usan en scheduleRayoVenusaurWander/moveRayoVenusaurTo): con un 30% de
// probabilidades (RAYO_VENUSAUR_SHOOT_CHANCE) "activa" el ataque Rayo
// Solar completo (ver rayoVenusaurSolarBeamSequence) en vez de quedarse
// plantado sin más. El otro 70% de las veces se salta el ataque y aplica
// `normalSettle` de inmediato, igual que antes de que existiera esta
// función. En ambos casos Venusaur queda mirando hacia abajo (ver
// RAYO_VENUSAUR_IDLE_DIR): la dirección horizontal en la que caminaba
// solo importa mientras se mueve, no en ninguno de estos estados quieto.
//
// Regla anti-racha: se lleva la cuenta (entry.missedShootStreak) de cuántas
// paradas seguidas han fallado el 30% sin disparar. Si ya van dos paradas
// seguidas sin activarse, la siguiente parada dispara el Rayo Solar seguro,
// para evitar rachas largas de mala suerte. El contador se resetea a 0 en
// cuanto se dispara, sea por la probabilidad normal o por esta regla.
function rayoVenusaurMaybeShoot(entry, normalSettle, onDone) {
  const forced = (entry.missedShootStreak || 0) >= 2;
  if (forced || Math.random() < RAYO_VENUSAUR_SHOOT_CHANCE) {
    entry.missedShootStreak = 0;
    rayoVenusaurSolarBeamSequence(entry, normalSettle, onDone);
  } else {
    entry.missedShootStreak = (entry.missedShootStreak || 0) + 1;
    normalSettle();
    onDone();
  }
}

// Secuencia completa del ataque Rayo Solar, una vez que se ha "activado"
// (30% de probabilidades, ver rayoVenusaurMaybeShoot):
//   1) Fase de carga: Venusaur reproduce su animación "Charge" en bucle
//      durante RAYO_VENUSAUR_CHARGE_MS (15s) mirando hacia abajo, mientras
//      se muestra una silueta de aviso en la franja vertical exacta en la
//      que va a disparar (su posición X actual), para que los jugadores
//      puedan apartarse a tiempo.
//   2) Fase de disparo: en cuanto termina la carga, se retira la silueta,
//      Venusaur reproduce su animación "Shoot" en bucle durante
//      RAYO_VENUSAUR_SHOOT_MS (2s), también mirando hacia abajo, y se
//      muestra el ataque de verdad (el rayo) en esa misma franja vertical,
//      hacia abajo desde su posición.
//   3) Al terminar el disparo se retira el rayo, se aplica `normalSettle`
//      -que deja a Venusaur de pie mirando hacia abajo, ver los dos puntos
//      que llaman a rayoVenusaurMaybeShoot- y se llama a `onDone` para que
//      Venusaur vuelva a deambular con normalidad hasta la siguiente
//      activación.
// Cada fase comprueba que `state.modeState.venusaur` siga siendo la misma
// `entry` (y no una de una partida/render posterior) antes de tocar nada,
// igual que el resto de temporizadores de Venusaur en este fichero.
function rayoVenusaurSolarBeamSequence(entry, normalSettle, onDone) {
  const ms = state.modeState;
  // "Cada vez que ataca" -> se acumula un 10% más de velocidad para lo que
  // resta de partida (incluida esta misma carga).
  if (ms) ms.venusaurSpeedMult = (ms.venusaurSpeedMult || 1) * RAYO_VENUSAUR_ACCEL_PER_ATTACK;
  const mult = rayoVenusaurSpeedMult();
  entry.sprite.play('Charge', PMD_DIR.down, true, null, 1 / mult);
  showRayoSolarSilhouette(entry);
  entry.solarTimeout = setTimeout(() => {
    const cur = state.modeState;
    if (!cur || cur.venusaur !== entry) return;
    hideRayoSolarSilhouette();
    // La animación "Shoot" y la duración del disparo se mantienen SIEMPRE
    // igual (velocidad 1, RAYO_VENUSAUR_SHOOT_MS fijo): no se aceleran nunca,
    // a diferencia de cargar/caminar/quedarse quieto.
    entry.sprite.play('Shoot', PMD_DIR.down, true, null, 1);
    playRayoSolarBeam();
    showRayoSolarBeam(entry);
    // En el instante en que aparece el rayo de verdad se comprueba a quién
    // toca (ver rayoSolarBeamHitPlayers/rayoHitPlayer) y se actualiza la
    // racha de disparos fallidos seguidos: se reinicia en cuanto alcanza a
    // alguien, y sube en caso contrario.
    const hitAny = rayoSolarBeamHitPlayers(entry);
    if (cur) cur.venusaurMissStreak = hitAny ? 0 : (cur.venusaurMissStreak || 0) + 1;
    entry.solarTimeout = setTimeout(() => {
      const cur2 = state.modeState;
      hideRayoSolarBeam();
      if (cur2 && cur2.venusaur === entry) {
        entry.solarTimeout = null;
        normalSettle();
      }
      // Si lleva RAYO_VENUSAUR_MISS_STREAK_FOR_FORCED_AIM disparos seguidos
      // sin alcanzar a nadie, el siguiente movimiento es forzado (perseguir
      // a un jugador y disparar directamente) en vez del deambular/disparo
      // aleatorio habitual; esto se repite hasta que consiga alcanzar a
      // alguien, momento en el que vuelve a la normalidad.
      if (cur2 && cur2.phase === 'playing' && cur2.venusaur === entry &&
          (cur2.venusaurMissStreak || 0) >= RAYO_VENUSAUR_MISS_STREAK_FOR_FORCED_AIM) {
        rayoVenusaurForcedAimMove();
      } else {
        onDone();
      }
    }, RAYO_VENUSAUR_SHOOT_MS);
  }, RAYO_VENUSAUR_CHARGE_MS / mult);
}

/* ---------------------------------------------------------
   ATAQUE RAYO SOLAR — colisión con los jugadores
   --------------------------------------------------------- */
// Comprueba si el rayo (el propio elemento .rayo-solar-beam, ya colocado en
// el DOM por showRayoSolarBeam) toca a algún jugador vivo de la parte
// inferior y, si es así, lo marca como alcanzado (ver rayoHitPlayer).
// Devuelve true si ha tocado a alguno.
function rayoSolarBeamHitPlayers(entry) {
  const ms = state.modeState;
  if (!ms) return false;
  const beamEl = entry.solarBeamEl;
  if (!beamEl) return false;
  // La hitbox de cada jugador es su dibujo real en pantalla, sin contar el
  // margen transparente del fotograma: en vez de comparar un ancho fijo de
  // rayo contra un ancho fijo de jugador, se compara el recuadro real del
  // rayo (que cae en vertical por toda la pantalla) contra la silueta real
  // -los píxeles no transparentes- del Pokémon de cada jugador.
  const beamRect = beamEl.getBoundingClientRect();
  let hitAny = false;
  ms.order.slice().forEach(user => {
    const p = ms.players[user];
    if (!p || p.hit) return;
    const fieldEntry = ms.fieldSprites[user];
    if (fieldEntry && fieldEntry.sprite.hitTestVerticalStrip(beamRect.left, beamRect.right)) {
      hitAny = true;
      rayoHitPlayer(p);
    }
  });
  return hitAny;
}

// Un jugador alcanzado por el Rayo Solar: reproduce su animación "Hurt" al
// instante y dos segundos después empieza a desvanecerse (fundido de
// opacidad) hasta desaparecer del campo por completo (ver removeRayoPlayer).
function rayoHitPlayer(p) {
  const ms = state.modeState;
  if (!ms || p.hit) return;
  p.hit = true;
  p.moving = false;
  playRsHit();
  const entry = ms.fieldSprites[p.user];
  if (entry && entry.sprite) entry.sprite.play('Hurt', PMD_DIR.down, false, null, 1);
  setTimeout(() => {
    const cur = state.modeState;
    if (!cur || cur.players[p.user] !== p) return;
    const el = $(p.elId);
    if (el) el.classList.add('rayo-fainting');
    setTimeout(() => {
      const cur2 = state.modeState;
      if (!cur2 || cur2.players[p.user] !== p) return;
      removeRayoPlayerFromField(p);
    }, RAYO_FAINT_FADE_MS);
  }, RAYO_HIT_TO_FAINT_MS);
}

// Retira por completo a un jugador alcanzado: sprite, elemento del DOM y
// entradas en el estado de la partida en curso.
function removeRayoPlayerFromField(p) {
  const ms = state.modeState;
  if (!ms) return;
  const entry = ms.fieldSprites[p.user];
  if (entry) {
    if (entry.sprite) entry.sprite.destroy();
    if (entry.el) entry.el.remove();
  }
  delete ms.fieldSprites[p.user];
  delete ms.players[p.user];
  const idx = ms.order.indexOf(p.user);
  if (idx !== -1) ms.order.splice(idx, 1);
  const countEl = $('rayo-alive-count');
  if (countEl) countEl.textContent = ms.order.length;
  checkRayoEnd();
}

/* ---------------------------------------------------------
   FIN DE PARTIDA
   --------------------------------------------------------- */
// Se llama cada vez que un jugador queda eliminado (ver
// removeRayoPlayerFromField): en cuanto solo queda 1 Pokémon con vida (o
// ninguno) se termina la partida.
function checkRayoEnd() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  if (ms.order.length <= 1) {
    const winnerUser = ms.order[0] || null;
    endRayoSolar(winnerUser ? ms.players[winnerUser] : null);
  }
}

function endRayoSolar(winner) {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'ended';
  if (ms.tickInterval) clearInterval(ms.tickInterval);
  ms.tickInterval = null;
  // Congela a Venusaur donde esté: cancela cualquier deambular o carga de
  // Rayo Solar pendiente y retira los avisos visuales del ataque.
  clearRayoVenusaurWanderTimer();
  ms.venusaurTargetMark = null;
  if (ms.venusaur && ms.venusaur.solarTimeout) {
    clearTimeout(ms.venusaur.solarTimeout);
    ms.venusaur.solarTimeout = null;
  }
  hideRayoSolarSilhouette();
  hideRayoSolarBeam();

  const field = $('rayo-field-outer');
  if (winner) {
    addScore(winner.user, RAYO_WIN_POINTS);
    playRsVictory();
    addChatMessage(null, `🏆 ¡@${winner.user} gana Rayo Solar con ${winner.pokemon.name}!`, 'correct');
  } else {
    playRsWipeout();
    addChatMessage(null, '☠️ Nadie sobrevive a Rayo Solar', 'wrong');
  }
  if (field) {
    const banner = document.createElement('div');
    banner.className = 'rayo-victory-banner';
    banner.innerHTML = winner ? `
      <img src="${getPokemonSprite(winner.pokemon.sprite)}" alt="${escapeHtml(winner.pokemon.name)}">
      <div class="win-title pixel">¡VICTORIA!</div>
      <div class="win-sub">${escapeHtml(winner.pokemon.name)} de @${escapeHtml(winner.user)} es el último en pie</div>
      <div class="mode-end-actions">
        <button class="rayo-start-btn" id="rayo-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="rayo-menu-btn">🏠 Menú Principal</button>
      </div>
    ` : `
      <div class="win-title pixel">SIN SUPERVIVIENTES</div>
      <div class="win-sub">El Rayo Solar de Venusaur ha acabado con todos los Pokémon</div>
      <div class="mode-end-actions">
        <button class="rayo-start-btn" id="rayo-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="rayo-menu-btn">🏠 Menú Principal</button>
      </div>
    `;
    field.appendChild(banner);
    const again = $('rayo-again-btn');
    if (again) again.onclick = () => startRayoSolar();
    const menuBtn = $('rayo-menu-btn');
    if (menuBtn) menuBtn.onclick = () => backToMenu();
  }
}

/* ---------------------------------------------------------
   VENUSAUR — movimiento forzado tras 2 disparos fallidos seguidos
   --------------------------------------------------------- */
// Elige al azar a un jugador vivo de la partida en curso (o null si no
// queda ninguno).
function rayoPickRandomAlivePlayer() {
  const ms = state.modeState;
  if (!ms || !ms.order.length) return null;
  const user = ms.order[Math.floor(Math.random() * ms.order.length)];
  return ms.players[user] || null;
}

// Se llama en vez de scheduleRayoVenusaurWander cuando Venusaur lleva
// RAYO_VENUSAUR_MISS_STREAK_FOR_FORCED_AIM disparos seguidos sin alcanzar a
// nadie: en vez de deambular/pararse/disparar aleatoriamente, se mueve
// horizontalmente hasta coincidir con la franja vertical de un jugador y
// empieza a cargar el disparo directamente (sin la probabilidad del 30% de
// rayoVenusaurMaybeShoot). Esto se repite -ver rayoVenusaurSolarBeamSequence-
// hasta que consiga alcanzar a alguien, momento en el que se retoma el
// comportamiento habitual.
function rayoVenusaurForcedAimMove() {
  const ms = state.modeState;
  if (!ms || !ms.venusaur || ms.phase !== 'playing') return;
  clearRayoVenusaurWanderTimer();
  // Un punto marcado por el streamer (ver rayoVenusaurGoToMark) tiene
  // prioridad incluso sobre la persecución forzada por racha de fallos:
  // mismo chequeo que al principio de scheduleRayoVenusaurWander.
  if (ms.venusaurTargetMark != null) {
    const targetX = ms.venusaurTargetMark;
    ms.venusaurTargetMark = null;
    moveRayoVenusaurToForcedShoot(targetX);
    return;
  }
  const target = rayoPickRandomAlivePlayer();
  if (!target) {
    // No queda nadie a quien apuntar: se abandona la persecución forzada y
    // se retoma el deambular normal.
    ms.venusaurMissStreak = 0;
    scheduleRayoVenusaurWander();
    return;
  }
  const { w } = rayoBottomZoneSize();
  const targetX = (target.xPct / 100) * w;
  moveRayoVenusaurToForcedShoot(targetX);
}

// Igual que moveRayoVenusaurTo, pero al llegar (o si ya estaba alineado) no
// vuelve a deambular: dispara directamente, sin pasar por la probabilidad
// del 30% de rayoVenusaurMaybeShoot.
function moveRayoVenusaurToForcedShoot(targetX) {
  const ms = state.modeState;
  const entry = ms && ms.venusaur;
  if (!entry) return;
  const settle = () => entry.sprite.play('Walk', PMD_DIR.down, false, null, RAYO_STAND_ANIM_SPEED / rayoVenusaurSpeedMult());
  const dx = targetX - entry.x;
  if (Math.abs(dx) < 4) {
    rayoVenusaurSolarBeamSequence(entry, settle, () => scheduleRayoVenusaurWander());
    return;
  }
  const mult = rayoVenusaurMovementSpeedMult();
  const dir = dx < 0 ? PMD_DIR.left : PMD_DIR.right;
  const duration = Math.max(0.5, Math.min(9, Math.abs(dx) / (RAYO_VENUSAUR_PX_PER_S * mult)));

  entry.sprite.play('Walk', dir, true, null, RAYO_VENUSAUR_ANIM_SPEED / mult);
  entry.dir = dir;
  entry.el.style.transition = `left ${duration}s linear`;
  void entry.el.offsetWidth;
  entry.el.style.left = targetX + 'px';
  entry.x = targetX;

  clearTimeout(entry.wanderTimeout);
  entry.wanderTimeout = setTimeout(() => {
    const cur = state.modeState;
    if (!cur || !cur.venusaur) return;
    cur.venusaur.wanderTimeout = null;
    rayoVenusaurSolarBeamSequence(
      cur.venusaur,
      () => cur.venusaur.sprite.play('Walk', PMD_DIR.down, false, null, RAYO_STAND_ANIM_SPEED / rayoVenusaurSpeedMult()),
      () => scheduleRayoVenusaurWander()
    );
  }, duration * 1000);
}

/* ---------------------------------------------------------
   ATAQUE RAYO SOLAR — avisos visuales verticales
   -----------------------------------------------------------
   Ambos avisos se anclan directamente a #rayo-field-outer (no a la franja
   de arriba ni a la de abajo por separado) para poder abarcar TODA la
   altura del campo -desde la posición de Venusaur hacia abajo, atravesando
   la franja de los jugadores- en la misma franja vertical (coordenada X)
   en la que se encuentra Venusaur en ese momento; top-zone comparte el
   mismo ancho y el mismo origen horizontal que field-outer, así que la
   `x`/`y` en px que ya se usan para colocar a Venusaur sirven tal cual.
   --------------------------------------------------------- */
function showRayoSolarSilhouette(entry) {
  const outer = $('rayo-field-outer');
  if (!outer) return;
  hideRayoSolarSilhouette();
  const el = document.createElement('div');
  el.className = 'rayo-solar-silhouette';
  el.style.left = entry.x + 'px';
  el.style.top = entry.y + 'px';
  outer.appendChild(el);
  entry.solarSilhouetteEl = el;
}

function hideRayoSolarSilhouette() {
  const ms = state.modeState;
  const entry = ms && ms.venusaur;
  if (entry && entry.solarSilhouetteEl) {
    entry.solarSilhouetteEl.remove();
    entry.solarSilhouetteEl = null;
  }
}

function showRayoSolarBeam(entry) {
  const outer = $('rayo-field-outer');
  if (!outer) return;
  hideRayoSolarBeam();
  const el = document.createElement('div');
  el.className = 'rayo-solar-beam';
  el.style.left = entry.x + 'px';
  el.style.top = entry.y + 'px';
  outer.appendChild(el);
  entry.solarBeamEl = el;
}

function hideRayoSolarBeam() {
  const ms = state.modeState;
  const entry = ms && ms.venusaur;
  if (entry && entry.solarBeamEl) {
    entry.solarBeamEl.remove();
    entry.solarBeamEl = null;
  }
}

function clearRayoVenusaurWanderTimer() {
  const ms = state.modeState;
  if (ms && ms.venusaur && ms.venusaur.wanderTimeout) {
    clearTimeout(ms.venusaur.wanderTimeout);
    ms.venusaur.wanderTimeout = null;
  }
}

// Igual que el deambular libre de Heatran/los jugadores en El Volcán: tras
// una pausa aleatoria, decide si camina hasta otro punto horizontal al azar
// de la parte superior o si se queda quieto otra pausa más.
function scheduleRayoVenusaurWander() {
  const ms = state.modeState;
  if (!ms || !ms.venusaur || ms.phase !== 'playing') return;
  clearRayoVenusaurWanderTimer();
  // Si el streamer marcó un punto mientras Venusaur estaba cargando/
  // disparando (ver rayoVenusaurGoToMark), se consume aquí en cuanto esa
  // animación termina: en vez de retomar el deambular aleatorio de
  // siempre, va derecho a ese punto y dispara.
  if (ms.venusaurTargetMark != null) {
    const targetX = ms.venusaurTargetMark;
    ms.venusaurTargetMark = null;
    moveRayoVenusaurToForcedShoot(targetX);
    return;
  }
  const mult = rayoVenusaurSpeedMult();
  const pauseMs = (RAYO_VENUSAUR_PAUSE_MIN_MS + Math.random() * (RAYO_VENUSAUR_PAUSE_MAX_MS - RAYO_VENUSAUR_PAUSE_MIN_MS)) / mult;
  ms.venusaur.wanderTimeout = setTimeout(() => {
    const cur = state.modeState;
    if (!cur || !cur.venusaur || cur.phase !== 'playing') return;
    cur.venusaur.wanderTimeout = null;
    if (Math.random() < RAYO_VENUSAUR_STOP_CHANCE) {
      rayoVenusaurMaybeShoot(cur.venusaur, () => cur.venusaur.sprite.play('Walk', PMD_DIR.down, false, null, RAYO_STAND_ANIM_SPEED / rayoVenusaurSpeedMult()), () => scheduleRayoVenusaurWander());
      return;
    }
    const targetX = rayoVenusaurRandomX();
    moveRayoVenusaurTo(targetX);
  }, pauseMs);
}

function moveRayoVenusaurTo(targetX) {
  const ms = state.modeState;
  const entry = ms && ms.venusaur;
  if (!entry) return;
  const dx = targetX - entry.x;
  if (Math.abs(dx) < 4) {
    scheduleRayoVenusaurWander();
    return;
  }
  const mult = rayoVenusaurMovementSpeedMult();
  const dir = dx < 0 ? PMD_DIR.left : PMD_DIR.right;
  const duration = Math.max(0.5, Math.min(9, Math.abs(dx) / (RAYO_VENUSAUR_PX_PER_S * mult)));

  entry.sprite.play('Walk', dir, true, null, RAYO_VENUSAUR_ANIM_SPEED / mult);
  entry.dir = dir;
  entry.el.style.transition = `left ${duration}s linear`;
  void entry.el.offsetWidth; // fuerza el estilo actual antes de animar hacia el nuevo destino
  entry.el.style.left = targetX + 'px';
  entry.x = targetX;

  clearTimeout(entry.wanderTimeout);
  entry.wanderTimeout = setTimeout(() => {
    const cur = state.modeState;
    if (!cur || !cur.venusaur) return;
    cur.venusaur.wanderTimeout = null;
    rayoVenusaurMaybeShoot(
      cur.venusaur,
      () => cur.venusaur.sprite.play('Walk', PMD_DIR.down, false, null, RAYO_STAND_ANIM_SPEED / rayoVenusaurSpeedMult()),
      () => scheduleRayoVenusaurWander()
    );
  }, duration * 1000);
}
