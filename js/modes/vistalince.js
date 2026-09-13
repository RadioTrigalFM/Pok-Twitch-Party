import { addChatMessage, escapeHtml } from '../chat.js';
import {
  playVeJoin, playModeMusic, playCountdownBeep,
  playVLinceRoundStart, playVLinceCrossingStart, playVLinceReveal,
  playVLinceVictory, playVLinceDraw,
} from '../audio.js';
import { applyOwNpcSprite, getRandomOwNpc } from '../data/owNpcDb.js';
import { getPokemonSprite } from '../data/pokemonDb.js';
import { currentFullscreenElement, requestSceneFullscreen } from '../fullscreen.js';
import { toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { backToMenu } from '../modeLauncher.js';
import { PMDSprite, PMD_DIR, pmdPreload } from '../pmdSprite.js';
import { state } from '../state.js';
import { $, addScore, toast } from '../utils.js';

/* =========================================================
   MODO VISTA LINCE
   -----------------------------------------------------------
   - Lobby: los viewers se apuntan con !participo. A cada uno se le
     asigna al azar un sprite OW de NPC (Rubí/Zafiro/Verde Hoja/Rojo
     Fuego).
   - Mapa: un rancho dividido por una valla horizontal. Arriba (20%)
     esperan los jugadores; abajo (80%) es el recinto de animales.
   - Cada ronda tiene 2 fases:
       1) "crossing": empiezan a cruzar Pokémon por el recinto, de
          izquierda a derecha (o al revés a partir de cierta ronda), a
          intervalos calculados para repartirlos equitativamente dentro
          de una ventana fija de tiempo (20s en las 3 primeras rondas,
          25s el resto -ver VL_CROSSING_WINDOW_MS-), sea cual sea el
          número de Pokémon que toque generar esa ronda. Antes de que
          esto empiece se muestra un cartel animado con el número de
          ronda ("roundIntro").
       2) cuando se decide cuántos Pokémon cruzan en la ronda, se deja
          de generar más ("finishing") pero los que ya están en pantalla
          terminan de cruzar. En cuanto el recinto queda vacío, empieza
          una cuenta atrás de 30s ("guessing") en la que cada jugador
          debe escribir !<número> (p.ej. !7) con cuántos Pokémon ha contado.
   - Opción "Preguntar Antes" (activable en el lobby, ms.askBeforeMode):
     si está activada, justo después del cartel de ronda se muestra un
     adelanto de la pregunta en futuro ("Cuenta cuántos cruzarán...")
     durante 5s, sin temporizador y sin recoger respuestas todavía
     ("preGuessing"); es solo para que los jugadores sepan qué tienen que
     contar. Después empiezan a cruzar los Pokémon igual que en el modo
     normal y, al terminar el cruce, se entra en la misma fase de 30s
     ("guessing") con la pregunta ya en pasado, donde se recogen las
     respuestas escribiendo el número como comando (!0, !1, !2...).
   - Quien acierta sobrevive; quien falla o no responde, muere.
   - Opción "Eliminar Más Lento" (activable en el lobby, ms.eliminateSlowestMode,
     activada por defecto): cuando todos los jugadores vivos responden
     exactamente lo mismo (acierten o no), solo muere quien respondió el
     último; el resto sobrevive esa ronda. Si se desactiva, esta regla
     especial no se aplica y cada jugador se evalúa solo por si acertó o no,
     así que si todos responden la respuesta correcta, pasan todos de ronda.
   - La partida termina cuando queda 1 jugador vivo o no queda ninguno.
   ========================================================= */

const VL_POKEMON_POOL = [
  // --- Fuego ---
  { name: 'Charmander', sprite: 4, types: ['Fuego'], gen: 1 },
  { name: 'Arcanine', sprite: 59, types: ['Fuego'], gen: 1 },
  { name: 'Camerupt', sprite: 323, types: ['Fuego', 'Tierra'], gen: 3 },
  // --- Agua ---
  { name: 'Squirtle', sprite: 7, types: ['Agua'], gen: 1 },
  { name: 'Gyarados', sprite: 130, types: ['Agua', 'Volador'], gen: 1 },
  { name: 'Slowpoke', sprite: 79, types: ['Agua', 'Psíquico'], gen: 1 },
  // --- Planta ---
  { name: 'Bulbasaur', sprite: 1, types: ['Planta', 'Veneno'], gen: 1 },
  { name: 'Lotad', sprite: 270, types: ['Planta', 'Agua'], gen: 3 },
  { name: 'Exeggcute', sprite: 102, types: ['Planta', 'Psíquico'], gen: 1 },
  // --- Eléctrico ---
  { name: 'Pikachu', sprite: 25, types: ['Eléctrico'], gen: 1 },
  { name: 'Magnemite', sprite: 81, types: ['Eléctrico', 'Acero'], gen: 1 },
  { name: 'Luxray', sprite: 405, types: ['Eléctrico'], gen: 4 },
  // --- Hielo ---
  { name: 'Mamoswine', sprite: 473, types: ['Tierra', 'Hielo'], gen: 4 },
  { name: 'Snorunt', sprite: 361, types: ['Hielo'], gen: 3 },
  { name: 'Sealeo', sprite: 364, types: ['Agua', 'Hielo'], gen: 3 },
  // --- Lucha ---
  { name: 'Machoke', sprite: 67, types: ['Lucha'], gen: 1 },
  { name: 'Blaziken', sprite: 257, types: ['Fuego', 'Lucha'], gen: 3 },
  { name: 'Lucario', sprite: 448, types: ['Lucha', 'Acero'], gen: 4 },
  // --- Veneno ---
  { name: 'Ekans', sprite: 23, types: ['Veneno'], gen: 1 },
  { name: 'Golbat', sprite: 42, types: ['Veneno', 'Volador'], gen: 1 },
  { name: 'Muk', sprite: 89, types: ['Veneno'], gen: 1 },
  // --- Roca / Tierra ---
  { name: 'Onix', sprite: 95, types: ['Roca', 'Tierra'], gen: 1 },
  { name: 'Tyranitar', sprite: 248, types: ['Roca', 'Siniestro'], gen: 2 },
  { name: 'Shuckle', sprite: 213, types: ['Roca', 'Bicho'], gen: 2 },
  { name: 'Garchomp', sprite: 445, types: ['Dragón', 'Tierra'], gen: 4 },
  { name: 'Graveler', sprite: 75, types: ['Tierra', 'Roca'], gen: 1 },
  { name: 'Donphan', sprite: 232, types: ['Tierra'], gen: 2 },
  // --- Normal / Volador ---
  { name: 'Pidgey', sprite: 16, types: ['Normal', 'Volador'], gen: 1 },
  { name: 'Xatu', sprite: 178, types: ['Psíquico', 'Volador'], gen: 2 },
  { name: 'Gliscor', sprite: 472, types: ['Tierra', 'Volador'], gen: 4 },
  // --- Psíquico ---
  { name: 'Abra', sprite: 63, types: ['Psíquico'], gen: 1 },
  { name: 'Wobbuffet', sprite: 202, types: ['Psíquico'], gen: 2 },
  { name: 'Ralts', sprite: 280, types: ['Psíquico', 'Hada'], gen: 3 },
  // --- Bicho ---
  { name: 'Caterpie', sprite: 10, types: ['Bicho'], gen: 1 },
  { name: 'Heracross', sprite: 214, types: ['Bicho', 'Lucha'], gen: 2 },
  { name: 'Shedinja', sprite: 292, types: ['Bicho', 'Fantasma'], gen: 3 },
  // --- Fantasma ---
  { name: 'Haunter', sprite: 93, types: ['Fantasma', 'Veneno'], gen: 1 },
  { name: 'Rotom', sprite: 479, types: ['Fantasma', 'Eléctrico'], gen: 4 },
  { name: 'Dusknoir', sprite: 477, types: ['Fantasma'], gen: 4 },
  // --- Dragón ---
  { name: 'Dragonair', sprite: 148, types: ['Dragón'], gen: 1 },
  { name: 'Bagon', sprite: 371, types: ['Dragón'], gen: 3 },
  { name: 'Vibrava', sprite: 329, types: ['Dragón', 'Tierra'], gen: 3 },
  // --- Siniestro ---
  { name: 'Umbreon', sprite: 197, types: ['Siniestro'], gen: 2 },
  { name: 'Houndour', sprite: 228, types: ['Siniestro', 'Fuego'], gen: 2 },
  { name: 'Sableye', sprite: 302, types: ['Fantasma', 'Siniestro'], gen: 3 },
  // --- Acero ---
  { name: 'Beldum', sprite: 374, types: ['Acero', 'Psíquico'], gen: 3 },
  { name: 'Scizor', sprite: 212, types: ['Acero', 'Bicho'], gen: 2 },
  { name: 'Lairon', sprite: 305, types: ['Acero', 'Roca'], gen: 3 },
  // --- Hada ---
  { name: 'Togepi', sprite: 175, types: ['Hada'], gen: 2 },
  { name: 'Clefairy', sprite: 35, types: ['Hada'], gen: 1 },
  { name: 'Marill', sprite: 183, types: ['Agua', 'Hada'], gen: 2 },
  // --- Normal ---
  { name: 'Snorlax', sprite: 143, types: ['Normal'], gen: 1 },
  { name: 'Spinda', sprite: 327, types: ['Normal'], gen: 3 },
  { name: 'Chansey', sprite: 113, types: ['Normal'], gen: 1 },
];

// Etiqueta para preguntar por generación (solo se usan las 4 primeras).
const VL_GEN_LABEL = { 1: '1ª', 2: '2ª', 3: '3ª', 4: '4ª' };

// Todos los tipos posibles del pool y las generaciones preguntables, usados
// por el modo "Preguntar Antes" para elegir la pregunta sin necesitar saber
// todavía qué Pokémon van a cruzar.
const VL_ALL_TYPES = [...new Set(VL_POKEMON_POOL.flatMap(p => p.types))];
const VL_ALL_GENS = [1, 2, 3, 4];

const VL_TICK_MS = 50;                 // frecuencia del bucle de movimiento de los Pokémon
const VL_CROSS_SPEED_MIN = 45;         // px/s mínimo al cruzar (cada Pokémon recibe una velocidad distinta)
const VL_CROSS_SPEED_MAX = 130;        // px/s máximo al cruzar
const VL_CROSSING_WINDOW_MS = 25000;         // ventana (ms) en la que deben cruzar TODOS los Pokémon de la ronda, repartidos equitativamente
const VL_CROSSING_WINDOW_EARLY_MS = 20000;   // ventana (ms) reducida para las primeras rondas
const VL_CROSSING_WINDOW_EARLY_ROUNDS = 3;   // número de rondas iniciales que usan la ventana reducida de arriba
const VL_GUESS_SECONDS = 30;           // segundos para adivinar cuántos han visto
const VL_PRE_GUESS_SECONDS = 7;        // segundos que se muestra la pregunta en modo "Preguntar Antes" (sin temporizador visible; +2s respecto al original para dar más tiempo a leerla)
const VL_ANIM_SPEED = 2.2;             // velocidad de la animación "Walk" mientras cruzan
const VL_NEXT_ROUND_DELAY_MS = 5500;   // pausa entre el resultado de una ronda y la siguiente
const VL_ROUND_BANNER_MS = 2100;       // duración del cartel animado de inicio de ronda (debe coincidir con el CSS)
const VL_PEN_Y_MIN = 8;                // % superior del recinto donde pueden cruzar (dentro de la franja de abajo)
const VL_PEN_Y_MAX = 88;               // % inferior del recinto donde pueden cruzar
const VL_REVERSE_FROM_ROUND = 3;       // a partir de esta ronda, la mitad de los Pokémon cruzan al revés (derecha -> izquierda)

// Cuántos Pokémon cruzan (rango aleatorio) según el número de ronda.
// Ronda 1: 6-9, ronda 2: 8-12, ronda 3: 12-16, ronda 4: 16-22, ronda 5: 22-30,
// ronda 6: 30-40, ronda 7 en adelante: 40-50.
const VL_ROUND_RANGES = [
  [6, 9], [8, 12], [12, 16], [16, 22], [22, 30], [30, 40], [40, 50],
];
function getVistaLinceRoundRange(round) {
  const idx = Math.min(round - 1, VL_ROUND_RANGES.length - 1);
  return VL_ROUND_RANGES[Math.max(0, idx)];
}

// Ventana total (ms) en la que deben cruzar TODOS los Pokémon de la ronda,
// sea cual sea cuántos toquen ese turno (ver VL_ROUND_RANGES): las 3
// primeras rondas usan una ventana más corta (20s) y el resto 25s. Cuantos
// más Pokémon haya que generar, más apretados irán los huecos entre ellos,
// en vez de alargar la duración total de la fase de cruce.
function getVistaLinceCrossingWindowMs(round) {
  return round <= VL_CROSSING_WINDOW_EARLY_ROUNDS ? VL_CROSSING_WINDOW_EARLY_MS : VL_CROSSING_WINDOW_MS;
}

export function startVistaLince() {
  // Igual que en Rayo Solar (ver el comentario largo en startRayoSolar,
  // rayosolar.js): al pulsar "Nueva Partida" (ver el botón
  // #vlince-again-btn tras endVistaLince) esta misma función reconstruye
  // el lobby, lo que destruye por completo el contenido anterior de
  // #game-content -incluido el campo (#vlince-field-outer) que estaba en
  // pantalla completa mientras se jugaba-, sacando al navegador de
  // pantalla completa por su cuenta. Se guarda si había pantalla completa
  // activa ANTES de reconstruir nada para restaurarla sobre el lobby
  // nuevo justo después (ver más abajo).
  const wasFullscreen = !!currentFullscreenElement();
  state.modeState = {
    phase: 'lobby',       // 'lobby' | 'roundIntro' | 'preGuessing' | 'crossing' | 'finishing' | 'guessing' | 'roundEnd' | 'ended'
    players: {},           // user -> jugador
    order: [],
    lobbyImgs: {},          // user -> <img> del lobby (para refrescar el sprite si hiciera falta)
    lobbyCards: {},         // user -> elemento de la tarjeta del lobby (para poder expulsarlo)
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startVistaLince(), es decir, al empezar una nueva partida).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    askBeforeMode: true,    // "Preguntar Antes": si está activo (por defecto), la pregunta se hace antes de cruzar (predicción)
    eliminateSlowestMode: false, // "Eliminar Más Lento": si está activo, cuando todos los jugadores vivos responden lo mismo solo muere quien respondió el último; desactivado por defecto, cada jugador se evalúa solo por si acertó o no
    round: 0,
    roundSpawnGoal: 0,       // cuántos Pokémon en total cruzarán esta ronda
    roundSpawned: 0,
    roundLog: [],             // metadatos (tipos/gen) de cada Pokémon que ha cruzado esta ronda
    questionKind: 'total',    // 'total' | 'type' | 'gen'
    questionValue: null,      // tipo o número de generación, según questionKind
    questionText: '',
    correctAnswer: 0,         // respuesta correcta a la pregunta de esta ronda
    crossers: {},           // id -> { el, sprite, xPct, yPct, speed }
    crosserSeq: 0,
    guesses: {},            // user -> número adivinado
    guessOrder: [],          // orden en que han respondido (el último del array = el último en responder)
    spawnTimeout: null,
    tickInterval: null,
    lastTick: null,
    guessCountdownInterval: null,
    preGuessTimeout: null,
    preGuessCountdownInterval: null,
    nextRoundTimeout: null,
    roundBannerTimeout: null,
  };
  VL_POKEMON_POOL.forEach(p => pmdPreload(p.sprite));
  renderVistaLinceLobby();
  if (wasFullscreen) {
    // Restaura la pantalla completa sobre el lobby recién creado (ver el
    // comentario de arriba).
    requestSceneFullscreen($('vlince-lobby-scene'));
  }
  addChatMessage(null, '🦅 ¡Vista Lince abierto! Escribe !participo para apuntarte', 'system');
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleVistaLinceCmd(user, cmd, parts) {
  const ms = state.modeState;
  if (!ms) return;

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
    const npc = getRandomOwNpc();
    ms.players[user] = {
      user,
      npc,
      alive: true,
      lastGuessCorrect: null,
      elId: 'vl-' + sanitizeUser(user),
    };
    ms.order.push(user);
    addChatMessage(null, `✅ ${user} se apunta a Vista Lince!`, 'correct', { mirror: false });
    playVeJoin();
    renderVistaLinceLobbyGrid();
    return;
  }

  // Los jugadores responden escribiendo directamente el número como comando:
  // !0, !1, !2, !3... (en vez del antiguo "!vi <número>").
  const numMatch = /^!(\d{1,3})$/.exec(cmd);
  if (numMatch) {
    if (ms.phase !== 'guessing') return;
    const p = ms.players[user];
    if (!p || !p.alive) return;
    const n = parseInt(numMatch[1], 10);
    if (!Number.isFinite(n) || n < 0) return;
    const isNewGuess = !(user in ms.guesses);
    ms.guesses[user] = n;
    // Movemos a este jugador al final del orden de respuesta: si cambia su
    // respuesta, se le considera el último en responder con ese nuevo valor.
    ms.guessOrder = ms.guessOrder.filter(u => u !== user);
    ms.guessOrder.push(user);
    showVistaLinceBubble(p, String(n));
    if (isNewGuess) {
      vlinceLog(`👁️ @${user} ha enviado su respuesta`, '');
      renderVistaLincePlayersList();
    }
  }
}

/* ---------------------------------------------------------
   BOCADILLO DE DIÁLOGO CON LA RESPUESTA DEL JUGADOR
   --------------------------------------------------------- */
const VL_BUBBLE_MS = 6000;
function showVistaLinceBubble(p, text) {
  const el = $(p.elId);
  if (!el) return;
  const old = el.querySelector('.vlince-bubble');
  if (old) old.remove();
  const bubble = document.createElement('div');
  bubble.className = 'vlince-bubble';
  bubble.textContent = text;
  el.appendChild(bubble);
  if (p.bubbleTimeout) clearTimeout(p.bubbleTimeout);
  p.bubbleTimeout = setTimeout(() => {
    if (bubble.isConnected) bubble.remove();
  }, VL_BUBBLE_MS);
}

function sanitizeUser(user) {
  return user.replace(/[^a-zA-Z0-9_-]/g, '');
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderVistaLinceLobby() {
  const content = $('game-content');
  const ms = state.modeState;
  content.innerHTML = `
    <div class="vlince-lobby-box game-scene" id="vlince-lobby-scene">
      <div class="vlince-lobby-head">
        <div class="big-count pixel" id="vlince-count">0</div>
        <div style="color:var(--muted);font-size:12px;">jugadores apuntados · escribe <b style="color:var(--yellow)">!participo</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:520px;margin:6px auto 0;line-height:1.6;">
          Cada jugador se queda tras la valla del rancho, observando cómo cruzan los Pokémon.
          Cuando dejen de cruzar tendréis <b style="color:#7be08a">30s</b> para responder escribiendo <b style="color:#7be08a">!&lt;número&gt;</b> (p.ej. <b style="color:#7be08a">!7</b>) con cuántos habéis contado.
          Quien acierte sobrevive; el resto, no.
        </div>
      </div>
      <div class="vlince-lobby-grid" id="vlince-lobby-grid">
        <div class="vlince-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="vlince-ask-before-btn" id="vlince-ask-before-btn" type="button" aria-pressed="false">
        🔮 Preguntar Antes
      </button>
      <div class="vlince-ask-before-hint" id="vlince-ask-before-hint">
        Actívalo para que la pregunta se haga justo antes de que crucen los Pokémon: los jugadores tendrán que predecir cuántos van a cruzar, en vez de contarlos.
      </div>
      <button class="vlince-ask-before-btn" id="vlince-eliminate-slowest-btn" type="button" aria-pressed="false">
        🐢 Eliminar Más Lento
      </button>
      <div class="vlince-ask-before-hint" id="vlince-eliminate-slowest-hint">
        Con esta opción activada, si todos los jugadores vivos responden lo mismo, solo queda eliminado quien respondió el último. Desactívala para que, si todos aciertan, pasen todos de ronda sin que nadie sea eliminado por tardar más.
      </div>
      <button class="vlince-start-btn" id="vlince-start-btn" disabled>▶ Comenzar Partida</button>
    </div>
  `;
  $('vlince-start-btn').onclick = () => startVistaLinceMatch();
  const askBtn = $('vlince-ask-before-btn');
  if (askBtn && ms) {
    const syncAskBtn = () => {
      askBtn.classList.toggle('active', !!ms.askBeforeMode);
      askBtn.setAttribute('aria-pressed', ms.askBeforeMode ? 'true' : 'false');
      askBtn.textContent = ms.askBeforeMode ? '🔮 Preguntar Antes: ACTIVADO' : '🔮 Preguntar Antes';
    };
    askBtn.onclick = () => {
      ms.askBeforeMode = !ms.askBeforeMode;
      syncAskBtn();
    };
    syncAskBtn();
  }
  const slowestBtn = $('vlince-eliminate-slowest-btn');
  if (slowestBtn && ms) {
    const syncSlowestBtn = () => {
      slowestBtn.classList.toggle('active', !!ms.eliminateSlowestMode);
      slowestBtn.setAttribute('aria-pressed', ms.eliminateSlowestMode ? 'true' : 'false');
      slowestBtn.textContent = ms.eliminateSlowestMode ? '🐢 Eliminar Más Lento: ACTIVADO' : '🐢 Eliminar Más Lento';
    };
    slowestBtn.onclick = () => {
      ms.eliminateSlowestMode = !ms.eliminateSlowestMode;
      syncSlowestBtn();
    };
    syncSlowestBtn();
  }
  renderVistaLinceLobbyGrid();
}

function renderVistaLinceLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('vlince-lobby-grid');
  const countEl = $('vlince-count');
  const btn = $('vlince-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (btn) btn.disabled = players.length < 2;
  if (players.length === 0) {
    grid.innerHTML = '<div class="vlince-lobby-empty">Esperando a que el chat se apunte...</div>';
    ms.lobbyImgs = {};
    ms.lobbyCards = {};
    return;
  }
  const emptyMsg = grid.querySelector('.vlince-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    if (ms.lobbyImgs[p.user]) return; // ya tiene tarjeta creada
    const card = document.createElement('div');
    card.className = 'vlince-lobby-card';
    card.title = 'Clic para expulsar de la partida';
    const imgId = 'vl-lobby-img-' + sanitizeUser(p.user);
    card.innerHTML = `
      <div class="vlince-ow-slot"><img id="${imgId}" class="vlince-ow-img" alt=""></div>
      <div class="p-user">@${escapeHtml(p.user)}</div>
    `;
    // El streamer puede hacer clic en cualquier jugador inscrito para que
    // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleLobbyExpelPopover(ms, p.user, card, expelFromVistaLinceLobby);
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
// la siguiente partida (nueva llamada a startVistaLince()).
function expelFromVistaLinceLobby(user) {
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
  renderVistaLinceLobbyGrid();
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA
   --------------------------------------------------------- */
function startVistaLinceMatch() {
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
  playModeMusic('vista-lince');
  users.forEach(u => {
    const p = ms.players[u];
    p.alive = true;
    p.lastGuessCorrect = null;
  });
  renderVistaLinceField();
  addChatMessage(null, `🦅 ¡Comienza Vista Lince con ${users.length} jugadores! Todos tras la valla...`, 'system', { mirror: false });
  startVistaLinceRound();
}

/* ---------------------------------------------------------
   CAMPO DE JUEGO (RANCHO)
   --------------------------------------------------------- */
function renderVistaLinceField() {
  const content = $('game-content');
  const ms = state.modeState;
  const players = ms.order.map(u => ms.players[u]);
  content.innerHTML = `
    <div class="vlince-wrap">
      <div class="vlince-topbar">
        <div class="stat">🟢 Vivos: <b id="vlince-alive-count">${players.length}</b></div>
        <div class="stat">🔄 Ronda: <b id="vlince-round-num">0</b></div>
        <div class="stat vlince-phase-hint" id="vlince-phase-hint">Preparando el rancho...</div>
      </div>
      <div class="vlince-field-outer game-scene" id="vlince-field-outer">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <div class="vlince-field-inner" id="vlince-field-inner">
          <div class="vlince-top-zone" id="vlince-top-zone"></div>
          <div class="vlince-pen" id="vlince-pen"></div>
        </div>
        <div class="vlince-guess-overlay" id="vlince-guess-overlay">
          <div class="vlince-guess-overlay-card">
            <div class="vlince-guess-timer" id="vlince-guess-timer">⏱ 30s</div>
            <div class="vlince-guess-hint" id="vlince-guess-hint">¿Cuántos Pokémon habéis visto cruzar?<br><span class="vlince-guess-hint-line">Escribid <b>!&lt;número&gt;</b> en el chat</span></div>
          </div>
        </div>
        <div class="vlince-pre-guess-banner" id="vlince-pre-guess-banner">
          <div class="vlince-pre-guess-backdrop"></div>
          <div class="vlince-pre-guess-card">
            <div class="vlince-pre-guess-label">PREDICCIÓN</div>
            <div class="vlince-pre-guess-hint" id="vlince-pre-guess-hint"></div>
          </div>
        </div>
      </div>
      <div class="vlince-info-grid">
        <div class="ranking-panel" id="vlince-players-panel">
          <div class="ranking-title">🦫 Jugadores tras la valla</div>
          <div id="vlince-players-list"></div>
        </div>
        <div class="battle-log" id="vlince-log"><p style="color:var(--muted);font-style:italic;">¡Que empiece la observación!</p></div>
      </div>
    </div>
  `;
  const topZone = $('vlince-top-zone');
  const n = players.length;
  players.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'vlince-player';
    el.id = p.elId;
    el.style.left = (((i + 0.5) / n) * 100) + '%';
    const imgId = p.elId + '-img';
    el.innerHTML = `
      <div class="vlince-player-name">@${escapeHtml(p.user)}</div>
      <div class="vlince-ow-slot"><img id="${imgId}" class="vlince-ow-img" alt=""></div>
      <div class="vlince-player-badge" id="${p.elId}-badge"></div>
    `;
    topZone.appendChild(el);
    applyOwNpcSprite($(imgId), p.npc);
  });
  renderVistaLincePlayersList();
}

function vlinceFieldSize() {
  const outer = $('vlince-field-outer');
  return outer ? { w: outer.clientWidth || 900, h: outer.clientHeight || 500 } : { w: 900, h: 500 };
}

function updateVistaLincePhaseUI() {
  const ms = state.modeState;
  const hint = $('vlince-phase-hint');
  const overlay = $('vlince-guess-overlay');
  const preBanner = $('vlince-pre-guess-banner');
  const roundNumEl = $('vlince-round-num');
  const timerEl = $('vlince-guess-timer');
  if (roundNumEl) roundNumEl.textContent = ms.round;
  // Cartel de la pregunta al final de la ronda ("guessing"): solo se ve en
  // esa fase y no lleva fondo oscurecido, es un panel flotante más.
  if (overlay) overlay.classList.toggle('show', ms.phase === 'guessing');
  // Cartel de predicción del modo "Preguntar Antes" ("preGuessing"): cartel
  // aparte, más grande y con fondo oscurecido, como el de inicio de ronda.
  if (preBanner) preBanner.classList.toggle('show', ms.phase === 'preGuessing');
  if (timerEl) timerEl.classList.toggle('hidden', ms.phase !== 'guessing');
  if (!hint) return;
  const texts = {
    roundIntro: '🔔 ¡Prepárate, empieza la ronda!',
    preGuessing: '🔮 Fíjate en la pregunta antes de que empiecen a cruzar...',
    crossing: '👀 Observa cuántos Pokémon cruzan el recinto...',
    finishing: '👀 Los últimos Pokémon terminan de cruzar...',
    guessing: '✍️ ¡Escribe !<número> con lo que has contado!',
    roundEnd: '📢 Resultados de la ronda...',
    ended: '🏁 Partida terminada',
  };
  hint.textContent = texts[ms.phase] || '';
}

/* ---------------------------------------------------------
   RONDA: FASE 1 — CRUCE DE POKÉMON
   --------------------------------------------------------- */
function startVistaLinceRound() {
  const ms = state.modeState;
  if (!ms) return;
  ms.round += 1;
  const [minP, maxP] = getVistaLinceRoundRange(ms.round);
  ms.roundSpawnGoal = minP + Math.floor(Math.random() * (maxP - minP + 1));
  ms.roundSpawned = 0;
  ms.roundCrossingWindowMs = getVistaLinceCrossingWindowMs(ms.round);
  ms.crossingStartTime = null;
  ms.roundLog = [];
  ms.crossers = {};
  ms.guesses = {};
  ms.guessOrder = [];
  ms.correctAnswer = 0;
  ms.questionKind = 'total';
  ms.questionValue = null;
  ms.questionText = '';
  ms.phase = 'roundIntro';
  updateVistaLincePhaseUI();
  vlinceLog(`🔄 Ronda ${ms.round}: ¡prepárate!`, '');
  addChatMessage(null, `🔄 Ronda ${ms.round}: ¡prepárate!`, 'system', { mirror: false });
  showVistaLinceRoundBanner(ms.round, () => {
    const ms2 = state.modeState;
    // Si la partida ha cambiado de fase mientras se mostraba el cartel
    // (p.ej. se reinició), no seguimos.
    if (!ms2 || ms2.phase !== 'roundIntro') return;
    if (ms2.askBeforeMode) {
      beginVistaLincePreGuessing();
    } else {
      beginVistaLinceCrossing();
    }
  });
}

// Arranca el cruce de Pokémon por el recinto (modo normal, o justo después
// de la fase de predicción cuando "Preguntar Antes" está activo).
function beginVistaLinceCrossing() {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'crossing';
  updateVistaLincePhaseUI();
  playVLinceCrossingStart();
  vlinceLog('👀 ¡Empiezan a cruzar los Pokémon!', '');
  if (ms.askBeforeMode) {
    addChatMessage(null, '👀 ¡Empiezan a pasar Pokémon por el recinto! Veamos si tu predicción era buena...', 'system', { mirror: false });
  } else {
    addChatMessage(null, '👀 ¡Empiezan a pasar Pokémon por el recinto! Cuenta cuántos ves...', 'system', { mirror: false });
  }
  ms.crossingStartTime = performance.now();
  scheduleVistaLinceSpawn();
  ms.lastTick = performance.now();
  ms.tickInterval = setInterval(vlinceTick, VL_TICK_MS);
}

/* ---------------------------------------------------------
   CARTEL ANIMADO DE INICIO DE RONDA
   --------------------------------------------------------- */
function showVistaLinceRoundBanner(round, onDone) {
  const ms = state.modeState;
  const field = $('vlince-field-outer');
  if (!field) { onDone(); return; }
  const old = field.querySelector('.vlince-round-banner');
  if (old) old.remove();
  const banner = document.createElement('div');
  banner.className = 'vlince-round-banner';
  banner.innerHTML = `
    <div class="vlince-round-banner-backdrop"></div>
    <div class="vlince-round-banner-card">
      <div class="vlince-round-banner-label pixel">RONDA</div>
      <div class="vlince-round-banner-num pixel">${round}</div>
      <div class="vlince-round-banner-sub">¡Observa bien cuántos cruzan!</div>
    </div>
  `;
  field.appendChild(banner);
  playVLinceRoundStart();
  if (ms) {
    if (ms.roundBannerTimeout) clearTimeout(ms.roundBannerTimeout);
    ms.roundBannerTimeout = setTimeout(() => {
      if (banner.isConnected) banner.remove();
      if (ms) ms.roundBannerTimeout = null;
      onDone();
    }, VL_ROUND_BANNER_MS);
  } else {
    setTimeout(() => {
      if (banner.isConnected) banner.remove();
      onDone();
    }, VL_ROUND_BANNER_MS);
  }
}

/* ---------------------------------------------------------
   CARTEL ANIMADO CON LA RESPUESTA CORRECTA (fin de ronda)
   --------------------------------------------------------- */
function showVistaLinceAnswerBanner(correctCount, questionText, onDone) {
  const ms = state.modeState;
  const field = $('vlince-field-outer');
  if (!field) { onDone(); return; }
  const old = field.querySelector('.vlince-round-banner');
  if (old) old.remove();
  const banner = document.createElement('div');
  banner.className = 'vlince-round-banner';
  banner.innerHTML = `
    <div class="vlince-round-banner-backdrop"></div>
    <div class="vlince-round-banner-card vlince-answer-card">
      <div class="vlince-round-banner-label pixel">RESPUESTA</div>
      <div class="vlince-round-banner-num pixel">${correctCount}</div>
      <div class="vlince-round-banner-sub">${escapeHtml(questionText)}</div>
    </div>
  `;
  field.appendChild(banner);
  playVLinceReveal();
  if (ms) {
    if (ms.roundBannerTimeout) clearTimeout(ms.roundBannerTimeout);
    ms.roundBannerTimeout = setTimeout(() => {
      if (banner.isConnected) banner.remove();
      if (ms) ms.roundBannerTimeout = null;
      onDone();
    }, VL_ROUND_BANNER_MS);
  } else {
    setTimeout(() => {
      if (banner.isConnected) banner.remove();
      onDone();
    }, VL_ROUND_BANNER_MS);
  }
}

function scheduleVistaLinceSpawn() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'crossing') return;
  const remainingSpawns = ms.roundSpawnGoal - ms.roundSpawned;
  if (remainingSpawns <= 0) return;
  // Reparto equitativo dentro de la ventana total de la ronda
  // (ms.roundCrossingWindowMs: 20s en las 3 primeras rondas, 25s el
  // resto): en cada spawn se recalcula el hueco en función del tiempo que
  // REALMENTE queda y de cuántos Pokémon faltan por aparecer, así que no
  // importa que una ronda tenga muchos más Pokémon que otra (ver
  // VL_ROUND_RANGES) -- todos terminan de generarse dentro de la ventana,
  // solo que más apretados entre sí. Se añade un pequeño margen aleatorio
  // (+/-30%) para que no se sientan como un metrónomo perfecto, siempre
  // recortado para no salirse del tiempo restante.
  const elapsed = ms.crossingStartTime ? (performance.now() - ms.crossingStartTime) : 0;
  const remainingTime = Math.max(0, ms.roundCrossingWindowMs - elapsed);
  const baseGap = remainingTime / remainingSpawns;
  const jitter = baseGap * 0.3;
  const gap = Math.min(remainingTime, Math.max(30, baseGap + (Math.random() * 2 - 1) * jitter));
  ms.spawnTimeout = setTimeout(() => {
    const ms2 = state.modeState;
    if (!ms2 || ms2.phase !== 'crossing') return;
    spawnVistaLinceCrosser();
    ms2.roundSpawned++;
    if (ms2.roundSpawned >= ms2.roundSpawnGoal) {
      ms2.phase = 'finishing';
      updateVistaLincePhaseUI();
    } else {
      scheduleVistaLinceSpawn();
    }
  }, gap);
}

function spawnVistaLinceCrosser() {
  const ms = state.modeState;
  const pen = $('vlince-pen');
  if (!ms || !pen) return;
  const species = VL_POKEMON_POOL[Math.floor(Math.random() * VL_POKEMON_POOL.length)];
  ms.roundLog.push(species);
  const id = 'c' + (ms.crosserSeq++);
  const el = document.createElement('div');
  el.className = 'vlince-crosser';
  const yPct = VL_PEN_Y_MIN + Math.random() * (VL_PEN_Y_MAX - VL_PEN_Y_MIN);
  el.style.top = yPct + '%';

  // A partir de la ronda 3, la mitad de los Pokémon cruzan al revés:
  // aparecen por la derecha y caminan hacia la izquierda.
  const reverse = ms.round >= VL_REVERSE_FROM_ROUND && Math.random() < 0.5;
  const startX = reverse ? 110 : -10;
  el.style.left = startX + '%';

  const spriteId = 'vl-cross-' + id;
  // Sin "pmd-mini": igual que los combatientes del modo Arena (ver
  // .fl-sprite/.fr-sprite en arena.js), aquí cada Pokémon cruza mostrando
  // su tamaño real, sin forzar que todos ocupen el mismo hueco.
  el.innerHTML = `<div class="pmd-slot" id="${spriteId}"></div>`;
  pen.appendChild(el);
  // uncapped:true = mismo mecanismo que los combatientes del Coliseo: no se
  // aplica el techo de PMD_REFERENCE_SIZE, así que Pokémon con sprites
  // grandes (Gyarados, Onix, Milotic...) se ven a su tamaño real en vez de
  // recortados al tamaño "normalizado" que usan el resto de modos.
  const sprite = new PMDSprite($(spriteId), getPokemonSprite(species.sprite), { uncapped: true });
  sprite.setDex(species.sprite);
  sprite.play('Walk', reverse ? PMD_DIR.left : PMD_DIR.right, true, null, VL_ANIM_SPEED);
  ms.crossers[id] = {
    el, sprite,
    xPct: startX,
    dir: reverse ? -1 : 1,
    // cada Pokémon recibe su propia velocidad al azar, así nunca cruzan todos igual de rápido
    speed: VL_CROSS_SPEED_MIN + Math.random() * (VL_CROSS_SPEED_MAX - VL_CROSS_SPEED_MIN),
  };
}

function vlinceTick() {
  const ms = state.modeState;
  if (!ms || (ms.phase !== 'crossing' && ms.phase !== 'finishing')) return;
  const now = performance.now();
  const dt = ms.lastTick ? (now - ms.lastTick) : VL_TICK_MS;
  ms.lastTick = now;
  const { w } = vlinceFieldSize();
  Object.entries(ms.crossers).forEach(([id, c]) => {
    c.xPct += c.dir * (c.speed * (dt / 1000) / w) * 100;
    const offRight = c.dir > 0 && c.xPct >= 112;
    const offLeft = c.dir < 0 && c.xPct <= -12;
    if (offRight || offLeft) {
      if (c.sprite) c.sprite.destroy();
      if (c.el) c.el.remove();
      delete ms.crossers[id];
      return;
    }
    if (c.el) c.el.style.left = c.xPct + '%';
  });

  if (ms.phase === 'finishing' && Object.keys(ms.crossers).length === 0) {
    clearInterval(ms.tickInterval);
    ms.tickInterval = null;
    // Tanto en modo normal como con "Preguntar Antes" activo, la fase de
    // respuesta (pregunta en pasado + 30s) es la misma: la única diferencia
    // es que con "Preguntar Antes" la pregunta ya se decidió y se enseñó en
    // futuro antes del cruce, así que no hay que elegir una nueva.
    beginVistaLinceGuessing();
  }
}

/* ---------------------------------------------------------
   RONDA: FASE 2 — ADIVINAR CUÁNTOS HAN PASADO
   (o, con "Preguntar Antes", predecir cuántos van a pasar)
   --------------------------------------------------------- */

// Decide qué se pregunta esta ronda a partir de lo que YA ha cruzado: el
// total, cuántos de un tipo concreto (de entre los que de verdad han
// aparecido), o cuántos de una generación concreta (solo 1ª a 4ª). Usado en
// el modo normal, justo después de que termine el cruce.
function decideVistaLinceQuestion(ms) {
  const log = ms.roundLog;
  const total = log.length;
  const roll = Math.random();

  if (roll < 0.4 || total === 0) {
    ms.questionKind = 'total';
    ms.questionValue = null;
  } else if (roll < 0.7) {
    const types = [...new Set(log.flatMap(p => p.types))];
    ms.questionKind = 'type';
    ms.questionValue = types[Math.floor(Math.random() * types.length)];
  } else {
    const gens = [...new Set(log.map(p => p.gen))].filter(g => g >= 1 && g <= 4);
    ms.questionKind = 'gen';
    ms.questionValue = gens[Math.floor(Math.random() * gens.length)];
  }
  resolveVistaLinceQuestionAnswer(ms);
}

// Decide qué se va a preguntar ANTES de que empiecen a cruzar los Pokémon
// (modo "Preguntar Antes"): como todavía no sabemos qué va a cruzar, el
// tipo o la generación se eligen de entre TODOS los posibles del pool, no
// de un cruce ya ocurrido. El texto queda en modo predicción ("cuenta
// cuántos van a cruzar").
function decideVistaLinceQuestionBefore(ms) {
  const roll = Math.random();
  if (roll < 0.4) {
    ms.questionKind = 'total';
    ms.questionValue = null;
    ms.questionText = 'Cuenta el total de Pokémon que cruzarán';
    return;
  }
  if (roll < 0.7) {
    const type = VL_ALL_TYPES[Math.floor(Math.random() * VL_ALL_TYPES.length)];
    ms.questionKind = 'type';
    ms.questionValue = type;
    ms.questionText = `Cuenta cuántos Pokémon de tipo ${type} cruzarán`;
    return;
  }
  const gen = VL_ALL_GENS[Math.floor(Math.random() * VL_ALL_GENS.length)];
  ms.questionKind = 'gen';
  ms.questionValue = gen;
  ms.questionText = `Cuenta cuántos Pokémon de ${VL_GEN_LABEL[gen]} generación cruzarán`;
}

// Calcula la respuesta correcta a partir de lo que REALMENTE ha cruzado
// (ms.roundLog) para la pregunta ya decidida (ms.questionKind/questionValue),
// y deja el texto de la pregunta en pasado, listo para mostrarse en el
// cartel de resultados. La usan tanto el modo normal (tras decideVistaLinceQuestion)
// como el modo "Preguntar Antes" (tras terminar el cruce).
function resolveVistaLinceQuestionAnswer(ms) {
  const log = ms.roundLog;
  if (ms.questionKind === 'type') {
    ms.correctAnswer = log.filter(p => p.types.includes(ms.questionValue)).length;
    ms.questionText = `¿Cuántos Pokémon de tipo ${ms.questionValue} han cruzado?`;
  } else if (ms.questionKind === 'gen') {
    ms.correctAnswer = log.filter(p => p.gen === ms.questionValue).length;
    ms.questionText = `¿Cuántos Pokémon de ${VL_GEN_LABEL[ms.questionValue]} generación han cruzado?`;
  } else {
    ms.correctAnswer = log.length;
    ms.questionText = '¿Cuántos Pokémon han cruzado en total?';
  }
}

// Fase de predicción (solo si "Preguntar Antes" está activo): se muestra la
// pregunta, en futuro y SIN temporizador visible, durante unos pocos
// segundos (VL_PRE_GUESS_SECONDS) justo después del cartel de ronda. Es solo
// un adelanto informativo: aquí NO se recogen respuestas todavía, eso pasa
// en la fase "guessing" normal, una vez terminen de cruzar los Pokémon.
function beginVistaLincePreGuessing() {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'preGuessing';
  ms.guesses = {};
  ms.guessOrder = [];
  decideVistaLinceQuestionBefore(ms);
  updateVistaLincePhaseUI();
  const hintEl = $('vlince-pre-guess-hint');
  if (hintEl) hintEl.innerHTML = escapeHtml(ms.questionText);
  vlinceLog(`🔮 ${ms.questionText}`, '');
  addChatMessage(null, `🔮 ¡Atentos! ${ms.questionText}`, 'system');
  if (ms.preGuessTimeout) clearTimeout(ms.preGuessTimeout);
  ms.preGuessTimeout = setTimeout(() => {
    const ms2 = state.modeState;
    if (ms2) ms2.preGuessTimeout = null;
    if (!ms2 || ms2.phase !== 'preGuessing') return;
    beginVistaLinceCrossing();
  }, VL_PRE_GUESS_SECONDS * 1000);
  // Reutiliza el mismo pitido de cuenta atrás que la fase de "guessing" en
  // los últimos 5s de la predicción, aunque aquí no haya temporizador
  // visible (VL_PRE_GUESS_SECONDS no tiene reloj en pantalla).
  if (ms.preGuessCountdownInterval) clearInterval(ms.preGuessCountdownInterval);
  let preRemaining = VL_PRE_GUESS_SECONDS;
  ms.preGuessCountdownInterval = setInterval(() => {
    preRemaining--;
    if (preRemaining > 0 && preRemaining <= 5) playCountdownBeep(preRemaining);
    if (preRemaining <= 0) {
      clearInterval(ms.preGuessCountdownInterval);
      ms.preGuessCountdownInterval = null;
    }
  }, 1000);
}

function beginVistaLinceGuessing() {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'guessing';
  ms.guesses = {};
  ms.guessOrder = [];
  if (ms.askBeforeMode) {
    // La pregunta ya se decidió y se mostró en futuro antes del cruce
    // (decideVistaLinceQuestionBefore); ahora solo hace falta calcular la
    // respuesta correcta con lo que realmente ha cruzado y pasar el texto
    // a pasado, igual que en el cartel de resultados del modo normal.
    resolveVistaLinceQuestionAnswer(ms);
  } else {
    decideVistaLinceQuestion(ms);
  }
  updateVistaLincePhaseUI();
  const hintEl = $('vlince-guess-hint');
  if (hintEl) hintEl.innerHTML = `${escapeHtml(ms.questionText)}<br><span class="vlince-guess-hint-line">Escribid <b>!&lt;número&gt;</b> en el chat</span>`;
  vlinceLog('⏱ ¡Se acabó el cruce! 30s para responder...', '');
  addChatMessage(null, `⏱ ¡Ya no cruzan más Pokémon! ${ms.questionText} Tenéis 30s para escribir !<número> (p.ej. !7)`, 'system');
  let remaining = VL_GUESS_SECONDS;
  updateVistaLinceGuessTimer(remaining);
  ms.guessCountdownInterval = setInterval(() => {
    remaining--;
    updateVistaLinceGuessTimer(remaining);
    if (remaining > 0 && remaining <= 5) playCountdownBeep(remaining);
    if (remaining <= 0) {
      clearInterval(ms.guessCountdownInterval);
      ms.guessCountdownInterval = null;
      resolveVistaLinceRound();
    }
  }, 1000);
}

function updateVistaLinceGuessTimer(seconds) {
  const el = $('vlince-guess-timer');
  if (el) el.textContent = `⏱ ${Math.max(0, seconds)}s`;
}

function resolveVistaLinceRound() {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'roundEnd';
  updateVistaLincePhaseUI();
  const correctCount = ms.correctAnswer;
  vlinceLog(`🎯 ${ms.questionText} → ${correctCount}`, 'crit');
  addChatMessage(null, `🎯 ${ms.questionText} La respuesta correcta era ${correctCount}!`, 'system', { mirror: false });

  showVistaLinceAnswerBanner(correctCount, ms.questionText, () => {
    const ms2 = state.modeState;
    if (!ms2 || ms2.phase !== 'roundEnd') return;
    finishVistaLinceRoundResolution(correctCount);
  });
}

function finishVistaLinceRoundResolution(correctCount) {
  const ms = state.modeState;
  if (!ms) return;

  const aliveUsers = ms.order.filter(u => ms.players[u].alive);
  // Usuarios eliminados en ESTA ronda: se van rellenando en las dos ramas de
  // abajo para poder mandar un único mensaje agrupado a Twitch al final,
  // en vez de un mensaje suelto (y silenciado, mirror:false) por cada uno.
  const eliminatedUsers = [];

  // Regla especial ("Eliminar Más Lento"): si TODOS los jugadores vivos han
  // respondido lo mismo (acierten o no) y la opción está activada, solo
  // muere quien haya respondido el último; el resto sobrevive la ronda. Si
  // la opción está desactivada, esta regla no se aplica: cada jugador se
  // evalúa solo por si acertó o no, así que si todos aciertan, pasan todos.
  const respondedUsers = aliveUsers.filter(u => u in ms.guesses);
  const allSameAnswer = !!ms.eliminateSlowestMode &&
    respondedUsers.length > 0 &&
    respondedUsers.length === aliveUsers.length &&
    new Set(respondedUsers.map(u => ms.guesses[u])).size === 1;

  if (allSameAnswer) {
    const lastUser = ms.guessOrder[ms.guessOrder.length - 1];
    const sharedGuess = ms.guesses[lastUser];
    vlinceLog(`🦜 ¡Todos habéis respondido lo mismo (${sharedGuess})! Solo muere quien respondió el último`, 'crit');
    addChatMessage(null, `🦜 ¡Todos habéis respondido ${sharedGuess}! Solo @${lastUser}, que respondió el último, queda eliminado`, 'system');
    aliveUsers.forEach(u => {
      const p = ms.players[u];
      if (u === lastUser) {
        p.alive = false;
        p.lastGuessCorrect = false;
        vlinceLog(`💀 @${u} respondió el último y queda eliminado`, 'dmg');
        addChatMessage(null, `💀 @${u} queda eliminado`, 'wrong', { mirror: false });
        eliminatedUsers.push(u);
        markVistaLincePlayerDead(p);
      } else {
        p.lastGuessCorrect = true;
        addScore(u, 120);
        vlinceLog(`✅ @${u} sobrevive (todos coincidisteis)`, '');
      }
    });
  } else {
    aliveUsers.forEach(u => {
      const p = ms.players[u];
      const guess = ms.guesses[u];
      const correct = guess === correctCount;
      p.lastGuessCorrect = correct;
      if (correct) {
        addScore(u, 120);
        vlinceLog(`✅ @${u} acierta (${guess}) y sobrevive`, '');
      } else {
        p.alive = false;
        const shown = (guess === undefined) ? 'sin respuesta' : guess;
        vlinceLog(`💀 @${u} falla (${shown}) y queda eliminado`, 'dmg');
        addChatMessage(null, `💀 @${u} queda eliminado`, 'wrong', { mirror: false });
        eliminatedUsers.push(u);
        markVistaLincePlayerDead(p);
      }
    });
  }

  // Un único mensaje a Twitch con todos los eliminados de esta ronda (en vez
  // de uno por jugador), justo después de revelar la respuesta correcta.
  if (eliminatedUsers.length === 1) {
    addChatMessage(null, `💀 @${eliminatedUsers[0]} queda eliminado`, 'wrong');
  } else if (eliminatedUsers.length > 1) {
    addChatMessage(null, `💀 Quedan eliminados: ${eliminatedUsers.map(u => `@${u}`).join(', ')}`, 'wrong');
  }

  renderVistaLincePlayersList();
  const aliveCountEl = $('vlince-alive-count');
  const stillAlive = ms.order.map(u => ms.players[u]).filter(p => p.alive);
  if (aliveCountEl) aliveCountEl.textContent = stillAlive.length;

  if (stillAlive.length <= 1) {
    endVistaLinceMatch(stillAlive[0] || null);
  } else {
    vlinceLog(`⏳ Siguiente ronda en unos segundos... (quedan ${stillAlive.length})`, '');
    ms.nextRoundTimeout = setTimeout(() => startVistaLinceRound(), VL_NEXT_ROUND_DELAY_MS);
  }
}

function markVistaLincePlayerDead(p) {
  const el = $(p.elId);
  if (el) el.classList.add('dead');
  const badge = $(p.elId + '-badge');
  if (badge) badge.textContent = '💀';
}

/* ---------------------------------------------------------
   PANEL LATERAL DE JUGADORES
   --------------------------------------------------------- */
function renderVistaLincePlayersList() {
  const ms = state.modeState;
  const list = $('vlince-players-list');
  if (!ms || !list) return;
  const players = ms.order.map(u => ms.players[u]);
  if (players.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);">Sin jugadores</div>';
    return;
  }
  list.innerHTML = players.map(p => {
    const isGuessPhase = ms.phase === 'guessing';
    const hasGuessed = isGuessPhase && (p.user in ms.guesses);
    let statusIcon = '';
    if (!p.alive) statusIcon = '💀';
    else if (isGuessPhase) statusIcon = hasGuessed ? '✅' : '⏳';
    else if (p.lastGuessCorrect === true) statusIcon = '✅';
    return `
      <div class="vlince-player-row${!p.alive ? ' dead' : ''}">
        <span>@${escapeHtml(p.user)}</span>
        <span class="vlince-player-status">${statusIcon}</span>
      </div>
    `;
  }).join('');
}

function vlinceLog(text, cls = '') {
  const log = $('vlince-log');
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
function endVistaLinceMatch(winner) {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'ended';
  updateVistaLincePhaseUI();
  if (ms.tickInterval) clearInterval(ms.tickInterval);
  if (ms.spawnTimeout) clearTimeout(ms.spawnTimeout);
  if (ms.guessCountdownInterval) clearInterval(ms.guessCountdownInterval);
  if (ms.preGuessTimeout) clearTimeout(ms.preGuessTimeout);
  if (ms.preGuessCountdownInterval) clearInterval(ms.preGuessCountdownInterval);
  if (ms.nextRoundTimeout) clearTimeout(ms.nextRoundTimeout);
  if (ms.roundBannerTimeout) clearTimeout(ms.roundBannerTimeout);
  ms.tickInterval = null; ms.spawnTimeout = null; ms.guessCountdownInterval = null; ms.preGuessTimeout = null;
  ms.preGuessCountdownInterval = null;
  ms.nextRoundTimeout = null;
  ms.roundBannerTimeout = null;
  const field = $('vlince-field-outer');
  if (field) {
    const leftoverBanner = field.querySelector('.vlince-round-banner');
    if (leftoverBanner) leftoverBanner.remove();
  }

  if (winner) {
    addScore(winner.user, 400);
    playVLinceVictory();
    vlinceLog(`🏆 ¡@${winner.user} gana Vista Lince!`, 'crit');
    addChatMessage(null, `🏆 ¡@${winner.user} gana gracias a su vista de lince!`, 'correct');
  } else {
    playVLinceDraw();
    vlinceLog('🤝 La partida termina sin supervivientes', '');
    addChatMessage(null, '🤝 Vista Lince termina sin supervivientes', 'system');
  }
  if (field) {
    const banner = document.createElement('div');
    banner.className = 'vlince-victory-banner';
    banner.innerHTML = winner ? `
      <div class="vlince-ow-slot big"><img id="vlince-winner-img" class="vlince-ow-img" alt=""></div>
      <div class="win-title pixel">¡VICTORIA!</div>
      <div class="win-sub">@${escapeHtml(winner.user)} es el último en pie</div>
      <div class="mode-end-actions">
        <button class="vlince-start-btn" id="vlince-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="vlince-menu-btn">🏠 Menú Principal</button>
      </div>
    ` : `
      <div class="win-title pixel">SIN SUPERVIVIENTES</div>
      <div class="mode-end-actions">
        <button class="vlince-start-btn" id="vlince-again-btn">🔁 Nueva Partida</button>
        <button class="mode-end-menu-btn" id="vlince-menu-btn">🏠 Menú Principal</button>
      </div>
    `;
    field.appendChild(banner);
    if (winner) applyOwNpcSprite($('vlince-winner-img'), winner.npc);
    const again = $('vlince-again-btn');
    if (again) again.onclick = () => startVistaLince();
    const menuBtn = $('vlince-menu-btn');
    if (menuBtn) menuBtn.onclick = () => backToMenu();
  }
}
