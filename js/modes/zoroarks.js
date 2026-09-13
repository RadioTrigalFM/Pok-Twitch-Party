import {
  playCountdownBeep, playZorJoin, playZorMatchStart, playZorSaved,
  playZorEliminated, playZorWolfReveal, playModeMusic,
  playZorNightFall, playZorNightDeaths, playZorVillageWins, playZorWolvesWin,
} from '../audio.js';
import { addChatMessage, escapeHtml } from '../chat.js';
import { applyOwNpcSprite, getRandomOwNpc, owNpcHeadTopRatio } from '../data/owNpcDb.js';
import { currentFullscreenElement, requestSceneFullscreen } from '../fullscreen.js';
import { closeLobbyExpelPopover, toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { backToMenu } from '../modeLauncher.js';
import { OwWalker } from '../owWalker.js';
import { PMDSprite, PMD_DIR } from '../pmdSprite.js';
import { state } from '../state.js';
import { $, toast } from '../utils.js';

/* =========================================================
   MODO ZOROARKS
   -----------------------------------------------------------
   Sustituye al antiguo modo Battle Royale. Incluye:
     - Pantalla previa (lobby) de inscripción: los viewers se apuntan
       con !participo y se les asigna un sprite OW de NPC al azar,
       igual que en Glaciar de Avalugg / Vista Lince / Control de
       Extranjería, mostrado en una tarjeta dentro de la cuadrícula
       de apuntados.
     - El mapa de la aldea de los Zoroark: una única imagen de fondo
       (assets/zoroarks/zor_map_bg.jpg) con la escena completa (plaza,
       arena de madera, estanque, aldea, antorchas y árboles). Al
       comenzar la partida, el sprite OW de cada jugador inscrito
       aparece de pie en la plaza (centro del mapa).
     - Movimiento: cada jugador elige camino escribiendo !bosque,
       !charca o !pueblo, o se queda en la plaza escribiendo !plaza (la
       plaza es además la opción por defecto de quien no escribe nada
       en toda la ronda). Su sprite recorre el sendero correspondiente
       (varios tramos en línea recta que siguen exactamente el camino
       dibujado en el mapa, esquivando el cartel del sendero izquierdo
       y el muro con farolas de la entrada del pueblo) con la animación
       de "andar" de OwWalker activa durante todo el trayecto, a un
       ritmo pausado, hasta desaparecer por el borde de la pantalla en
       el extremo del camino. Si escribe otro comando estando ya en un
       sitio, vuelve sobre sus pasos exactamente por el mismo camino
       hasta la plaza y sigue desde ahí hacia el nuevo destino. Si
       escribe un comando mientras todavía está caminando, se guarda
       como "siguiente destino" y se aplica en cuanto termine de llegar
       a donde iba.
     - Días: la partida avanza en días. Cada día (salvo el primero) se
       abre con una fase de votación de ZOR_VOTE_SECONDS en la que
       cualquier usuario del chat (esté o no inscrito en la partida) puede
       votar a un jugador con !vote nombredeusuario o !vote @nombredeusuario
       (p.ej. !vote Samubf93 o !vote @Samubf93, sin distinguir mayúsculas
       de minúsculas; el voto no se puede cambiar una vez emitido, y si
       quien vota es uno de los jugadores en juego, sobre su cabeza
       aparece un bocadillo con el nombre del jugador votado, ver
       zorCastVote); el
       primer día no tiene fase de votación, porque todavía no hay ningún
       día anterior sobre el que votar; además, esa fase de votación nunca
       arranca mientras algún jugador siga todavía caminando de vuelta a
       la plaza tras la noche anterior (ver zorStartNewDay), para que
       nunca empiece con algún sprite a mitad de camino. Si al acabar esa
       fase hay un único
       jugador con más votos que el resto (sin empate), en ese mismo
       instante todos los demás sprites del pueblo giran para mirar hacia
       él/ella y lo siguen con la mirada (reorientándose sobre la marcha
       según haga falta) mientras sube al escenario de madera de la plaza;
       al llegar al punto final, su propio sprite siempre queda mirando
       hacia abajo, sea cual sea la dirección desde la que llegó. Se abre
       entonces una fase de confirmación
       de ZOR_CONFIRM_SECONDS en la que, de nuevo, cualquier usuario del
       chat puede votar !si o !no para decidir su destino (bajo el cartel
       de esa fase se muestra además una barra que representa en directo la
       proporción de votos !si frente a !no, ver zorUpdateConfirmVoteBar):
       si ganan los
       "!si" el jugador queda eliminado de la partida (su sprite se
       desvanece y ya no puede participar en el resto de días); si ganan
       los "!no", o hay empate, el jugador se salva y baja del escenario de
       vuelta a la plaza. Mientras dure la fase de confirmación, cualquier
       mensaje real que el jugador del escenario escriba en el chat se
       muestra en un bocadillo sobre su cabeza (igual que en Control de
       Extranjería). Si nadie vota en la fase de votación, o hay
       empate por el primer puesto, nadie sube al escenario y se pasa
       directo a la fase de elección de camino. A continuación (o
       directamente tras la votación si no hubo confirmación) viene la
       fase de elección de camino, de ZOR_ROUND_SECONDS, en la que los
       jugadores pueden elegir camino con !bosque, !charca, !pueblo o
       !plaza (ver arriba) -una sola vez por día: en cuanto un jugador
       elige, ese destino queda fijado y ningún comando posterior suyo lo
       puede sustituir hasta el día siguiente, ni siquiera si todavía sigue
       caminando hacia allí. Al agotarse el tiempo de esa fase, cualquier
       trayecto en curso se da por llegado de inmediato y la pantalla hace
       un fundido a negro; con la pantalla ya completamente a negro se
       resuelven las muertes de esa noche (ver zorResolveNightDeaths): al
       empezar la partida se eligen en secreto uno o dos jugadores lobo
       (uno con 8 jugadores o menos, dos a partir de 9, ver
       startZoroarksMatch), que nunca se muestran en la interfaz; en el
       pueblo y en la charca muere un jugador no-lobo por cada lobo
       presente en esa ubicación, mientras que en el bosque y en la plaza
       cada jugador no-lobo tiene un 33% de probabilidad individual de
       morir haya o no lobos entre los inscritos; un jugador lobo nunca
       muere por esta vía, solo puede morir si el pueblo lo vota y confirma
       su muerte en la fase de !si/!no. A continuación se muestran, uno a
       uno con un breve fundido entre cada uno, los rótulos "Esta noche",
       "han muerto" y "X aldeanos" (X = nº de aldeanos muertos esa noche,
       ver zorPlayNightMessages) y se mantiene el último ZOR_NIGHT_HOLD_MS
       antes de empezar la transición inversa. Justo cuando empieza esa
       transición
       inversa que
       vuelve a mostrar el mapa, cada jugador que pasó la noche fuera de la
       plaza y sigue con vida emprende el regreso por el mismo camino (a la
       inversa) que usó
       para llegar, y arranca el siguiente día (con su fase de votación
       correspondiente).
   ========================================================= */

function sanitizeUser(user) {
  return user.replace(/[^a-zA-Z0-9_-]/g, '');
}

/* ---------------------------------------------------------
   GEOMETRÍA DEL MAPA (todo en % de .zor-map, igual que el resto de
   capas del fondo, para que se mantenga en su sitio a cualquier
   tamaño de pantalla).
   -----------------------------------------------------------
   Cada camino es una lista de puntos que van desde la entrada del
   sendero en la plaza (primer punto) hasta el punto de salida, en el
   orden exacto en que hay que recorrerlos: todos los jugadores que
   eligen el mismo camino recorren punto por punto exactamente la misma
   ruta, sin desviaciones ni atajos.
   --------------------------------------------------------- */
/* Cada lista de puntos evita a propósito los obstáculos dibujados en el
   mapa (el cartel de madera del sendero izquierdo, y el muro con farolas
   de la entrada del pueblo), y el último punto queda deliberadamente
   fuera del lienzo (por debajo de 0% o por encima de 100%) para que el
   sprite termine desapareciendo por el borde de la pantalla en vez de
   quedarse quieto dentro del mapa. */
const ZOR_PATHS = {
  charca: [{ x: 24.4, y: 53 }, { x: 24, y: 34.8 }, { x: 19.9, y: 30.2 }, { x: 19.5, y: 9.3 }, { x: 20.1, y: -3 }, { x: 20.7, y: -16.3 }],
  pueblo: [{ x: 76, y: 52.7 }, { x: 76.4, y: 32.5 }, { x: 78.8, y: 20.2 }, { x: 80.5, y: 12.6 }, { x: 80.5, y: -1 }, { x: 80.8, y: -14.3 }],
  bosque: [{ x: 50, y: 78 }, { x: 50, y: 89 }, { x: 50, y: 120 }],
};
const ZOR_LOCATION_NAMES = {
  plaza: 'la plaza',
  bosque: 'el bosque',
  charca: 'la charca',
  pueblo: 'el pueblo',
};
const ZOR_LOCATION_BADGE = {
  plaza: '🏛️ Plaza',
  bosque: '🌲 Bosque',
  charca: '🏞️ Charca',
  pueblo: '🏘️ Pueblo',
};

// Posición (en % de .zor-map, medida directamente sobre el arte de fondo)
// de la bombilla de cada una de las dos farolas del muro de la entrada del
// pueblo, para anclar ahí el brillo animado.
const ZOR_LAMPS = [
  { x: 70.7, y: 29.1 },
  { x: 82.2, y: 28.7 },
];

// Posición (en % de .zor-map) del punto del escenario de madera de la
// plaza donde se coloca el jugador elegido en la votación mientras dura
// la fase de confirmación (!si/!no).
const ZOR_STAGE_SPOT = { x: 50, y: 37 };

// Dos rutas posibles (en % de .zor-map), punto a punto, para subir al
// escenario de madera durante la fase de confirmación: cada una entra
// desde un lateral distinto de la plaza. Al elegir al jugador votado se
// usa la ruta cuyo primer punto quede más cerca de su posición actual
// (ver zorPickStageRoute), para que el trayecto arranque por el lado del
// que realmente viene en vez de cruzar la plaza en diagonal.
const ZOR_STAGE_ROUTES = [
  [
    { x: 42, y: 52 },
    { x: 42.2, y: 35.4 },
    { x: 50, y: 35 },
  ],
  [
    { x: 57.9, y: 50.4 },
    { x: 57.6, y: 35.4 },
    { x: 50, y: 35 },
  ],
];

// Elige, de entre ZOR_STAGE_ROUTES, la ruta cuyo punto inicial está más
// cerca de (fromX, fromY) -la posición del jugador más votado justo al
// acabar la votación-, para que suba al escenario por el lado más
// cercano a donde estaba.
function zorPickStageRoute(fromX, fromY) {
  return ZOR_STAGE_ROUTES.reduce((closest, route) => {
    const d = Math.hypot(route[0].x - fromX, route[0].y - fromY);
    const dClosest = Math.hypot(closest[0].x - fromX, closest[0].y - fromY);
    return d < dClosest ? route : closest;
  });
}

// Velocidad de paseo, en % del lienzo por segundo. El triple de lenta que
// antes (era 24), para que el trayecto por los caminos se vea pausado.
const ZOR_SPEED_PCT_PER_SEC = 8;
const ZOR_MIN_STEP_MS = 780;      // duración mínima de un tramo (también x3), aunque sea muy corto

// Cada cuánto (ms) se recalcula, durante la subida al escenario, hacia
// dónde debe mirar cada uno de los demás sprites para "seguir con la
// mirada" al jugador elegido mientras camina (ver zorOrientWatchers /
// zorSendToStage). No hace falta que sea muy frecuente: setDirection no
// hace nada si la dirección no ha cambiado desde el último tick.
const ZOR_WATCH_INTERVAL_MS = 150;

// Duración de la fase de elección de camino (!bosque/!charca/!pueblo).
const ZOR_ROUND_SECONDS = 40;
// Duración de la fase de votación (!vote nombredeusuario) al principio de cada
// nuevo día, salvo el primero (ver ZOR_VOTE_SKIP_FIRST_DAY más abajo).
const ZOR_VOTE_SECONDS = 40;
// Duración de la fase de confirmación (!si/!no) que decide el destino del
// jugador que subió al escenario tras ganar la fase de votación anterior.
const ZOR_CONFIRM_SECONDS = 40;
// Espera tras el final "real" de la fase de confirmación antes de que
// arranque la fase de elección de ubicación (ver zorEndConfirmationPhase):
// da un respiro visual entre ambas fases. Si el jugador votado resulta ser
// un lobo, ese final "real" no es el propio final del temporizador de la
// fase, sino el momento en que su Zoroark revelado ha terminado de
// desvanecerse del todo (ver zorRevealWolfAndDie/zorFadeOutPlayerEl); esta
// espera de 1s se aplica DESPUÉS de eso, no en su lugar.
const ZOR_LOCATION_PHASE_DELAY_MS = 1000;

// Bocadillo de diálogo sobre la cabeza del jugador que está en el
// escenario durante la fase de confirmación: mismo criterio que en
// Control de Extranjería (solo mensajes reales del chat de ese usuario,
// nunca texto de relleno).
const ZOR_BUBBLE_HOLD_MS = 4500; // tiempo que se mantiene visible cada mensaje antes de desvanecerse
const ZOR_BUBBLE_HIDE_MS = 250;  // duración de la animación de desvanecido (debe casar con el CSS)
const ZOR_BUBBLE_MAX = 3;        // nº máximo de mensajes apilados a la vez sobre la cabeza del jugador
// Transición de noche entre rondas: fundido a negro, secuencia de rótulos
// ("Esta noche" / "han muerto" / "X aldeanos", ver zorPlayNightMessages) y
// fundido inverso de vuelta al mapa (misma duración que el de entrada),
// con la misma curva que .zor-night-overlay en el CSS.
const ZOR_NIGHT_FADE_MS = 900;
// Duración de la animación de entrada/salida de cada rótulo de la
// secuencia de mensajes (debe casar con la transición de opacity de
// .zor-night-content en el CSS).
const ZOR_NIGHT_MSG_FADE_MS = 300;
// Tiempo que cada rótulo de la secuencia permanece del todo visible antes
// de desvanecerse y dar paso al siguiente (el doble de lo habitual, para
// dar tiempo de sobra a leer "Esta noche" / "han muerto" / "X aldeanos").
const ZOR_NIGHT_MSG_HOLD_EACH_MS = 1800;
// Tiempo que se mantiene el último rótulo ("X aldeanos") en pantalla antes
// de empezar el fundido inverso que vuelve a mostrar el mapa.
const ZOR_NIGHT_HOLD_MS = 1400;
// Probabilidad (independiente por jugador) de morir durante la noche para
// quien pasa la noche en el bosque o en la plaza: se aplica por igual a
// cualquier jugador ahí, haya o no lobos entre los inscritos (ver
// zorResolveNightDeaths). Los jugadores lobo están exentos: nunca mueren
// por esta vía, solo pueden morir si el pueblo los vota y confirma su
// muerte en la fase de !si/!no.
const ZOR_NIGHT_RANDOM_DEATH_CHANCE = 0.33;

// Nº de jugadores lobo que se eligen en secreto al comenzar la partida
// (ver startZoroarksMatch): uno solo con 8 jugadores o menos, dos a partir
// de 9. El máximo de jugadores es 18, así que con dos lobos nunca son más
// de una quinta parte de la aldea.
const ZOR_WOLF_COUNT_SMALL = 1;
const ZOR_WOLF_COUNT_LARGE = 2;
const ZOR_WOLF_COUNT_THRESHOLD = 9; // a partir de este nº de jugadores, dos lobos

// Nº de Pokédex nacional de Zoroark: sprite PMD que sustituye al sprite OW
// del jugador cuando se revela que era un lobo (ver zorRevealWolfAndDie).
const ZOR_ZOROARK_DEX = 571;
// Sprite estático de repuesto para el PMDSprite del Zoroark revelado, por si
// su animación "Hurt" (servida localmente, ver PMD_LOCAL_BASES en
// pmdSprite.js) no llegara a cargar por algún motivo. Es una imagen incluida
// en el propio proyecto, así que tampoco depende de la red.
const ZOR_ZOROARK_FALLBACK_SPRITE = 'assets/zoroarks/pmd/0571/fallback.png';
// Tiempo (ms) que se mantiene visible el Zoroark revelado antes de que
// muera y desaparezca del mapa. La animación de Hurt en sí ya no se
// reproduce en bucle (ver zorRevealWolfAndDie): se lanza una única vez y,
// dure lo que dure ese único ciclo, el Zoroark se queda en pantalla hasta
// completar estos 3000ms antes de desvanecerse.
const ZOR_WOLF_REVEAL_HURT_MS = 3000;
// Multiplicador de la duración de cada fotograma de esa animación de Hurt
// (ver PMDSprite.play, parámetro "speed"): a velocidad normal (1) los dos
// fotogramas de esta animación concreta duran apenas ~165ms en total y
// casi ni se aprecian, así que se ralentiza notablemente para que la
// revelación se lea bien mientras dura el zoom de cámara (ver
// zorZoomCameraTo más abajo). Con este valor la animación completa dura
// ~665ms, de sobra dentro de la ventana de ZOR_WOLF_REVEAL_HURT_MS.
const ZOR_WOLF_REVEAL_ANIM_SPEED = 4;
// Velocidad (ralentizada) de la animación "Walk" que se usa para mostrar al
// Zoroark en su pose normal -de pie, en bucle- en la pantalla final cuando
// ganan los lobos (ver zorShowEndScreen): mismo truco que usan otros modos
// (POKERUS_STAND_SPEED, SAFARI_STAND_ANIM_SPEED...) para que una animación
// de caminar se lea como si estuviera quieto.
const ZOR_VICTORY_STAND_ANIM_SPEED = 2.6;
// Escala del zoom de cámara sobre el Zoroark mientras dura su revelación
// (ver zorZoomCameraTo/zorResetCameraZoom): cuanto más alta, más cerca se
// acerca la cámara y menos aldea queda visible alrededor.
const ZOR_CAMERA_ZOOM_SCALE = 2.3;

// Retraso aleatorio máximo (en ms) antes de que cada jugador arranque su
// regreso a la plaza al empezar el nuevo día: sin esto, todos los que
// pasaron la noche en el mismo sitio recorren exactamente el mismo camino
// a la vez y sus sprites quedan superpuestos todo el trayecto. Cada
// jugador tira su propio valor al azar entre 0 y este máximo (ver
// zorStartNewDay), así que arrancan escalonados en vez de todos a la vez.
const ZOR_RETURN_STAGGER_MAX_MS = 700;

// Cada cuánto (ms) se revisa si el nombre de algún jugador se ha quedado
// superpuesto con el sprite de otro, para bajarle la opacidad al 50%
// mientras dure la superposición (ver zorUpdateNameOverlaps). Los
// jugadores se mueven en todo momento por los caminos, así que hace
// falta revisarlo de forma continua y no solo al llegar a un sitio.
const ZOR_NAME_OVERLAP_INTERVAL_MS = 200;
// completas de 8 en la plaza más una tercera fila corta de 2 en el centro
// (ver zorPlazaSpot).
const ZOR_MAX_PLAYERS = 18;
// Mínimo de jugadores inscritos para poder arrancar la partida (ver
// startZoroarksMatch): por debajo de esto no tiene sentido la dinámica de
// votación/lobos, así que el botón de inicio del lobby permanece
// deshabilitado (ver renderZoroarksLobbyGrid) hasta llegar a este mínimo.
const ZOR_MIN_PLAYERS = 3;

// Punto de la plaza donde "vive" cada jugador cuando no está de camino a
// ningún sitio: una pequeña cuadrícula centrada delante del escenario.
// Las dos primeras filas (16 jugadores) van a fila completa de 8; los dos
// últimos jugadores (los que llevan la partida hasta el máximo de 18) se
// colocan aparte, en una tercera fila más corta y centrada justo debajo.
function zorPlazaSpot(index) {
  const cols = 8;
  const spacing = 6;
  const rowY = 63;
  const rowGap = 7;
  if (index < cols * 2) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const startX = 50 - ((cols - 1) * spacing) / 2;
    return { x: startX + col * spacing, y: rowY + row * rowGap };
  }
  // Tercera fila: solo los jugadores 17º y 18º, centrados bajo las otras
  // dos filas en vez de ocupar toda la anchura.
  const extraCols = ZOR_MAX_PLAYERS - cols * 2; // nº de huecos reales en la 3ª fila (2)
  const extraIndex = index - cols * 2;
  const startX = 50 - ((extraCols - 1) * spacing) / 2;
  return { x: startX + extraIndex * spacing, y: rowY + 2 * rowGap };
}

// Construye la ruta (lista de puntos a recorrer, en orden) para ir desde
// la ubicación actual de un jugador hasta el destino pedido, siguiendo
// siempre, punto por punto y sin desviarse, el sendero dibujado en el
// mapa (ZOR_PATHS) hasta salir de la pantalla por su extremo: si hay que
// cambiar de camino, primero se vuelve a la plaza retrocediendo
// exactamente por el camino de origen y luego se sale por el de destino.
function zorRoutePoints(fromLoc, toLoc, p) {
  if (fromLoc === toLoc) return [];
  const forwardPoints = (loc) => ZOR_PATHS[loc].map(pt => ({ ...pt }));
  const backwardPoints = (loc) => ZOR_PATHS[loc].slice(0, -1).slice().reverse().map(pt => ({ ...pt }));

  if (fromLoc === 'plaza') return forwardPoints(toLoc);
  if (toLoc === 'plaza') return [...backwardPoints(fromLoc), { ...p.plazaSpot }];
  return [...backwardPoints(fromLoc), ...forwardPoints(toLoc)];
}

export function startZoroarks() {
  // Igual que en Rayo Solar (ver el comentario largo en startRayoSolar,
  // rayosolar.js): al pulsar "Nueva Partida" (ver el botón
  // #zor-victory-again-btn) esta misma función reconstruye el lobby, lo
  // que destruye por completo el contenido anterior de #game-content
  // -incluido el campo (#zor-field-outer) que estaba en pantalla completa
  // mientras se jugaba-, sacando al navegador de pantalla completa por su
  // cuenta. Se guarda si había pantalla completa activa ANTES de
  // reconstruir nada para restaurarla sobre el lobby nuevo justo después
  // (ver más abajo).
  const wasFullscreen = !!currentFullscreenElement();
  // Por si veníamos de una partida anterior con temporizadores/walkers
  // todavía activos en segundo plano.
  zorStopMatch();

  state.modeState = {
    phase: 'lobby',   // 'lobby' | 'playing'
    // Sub-fase dentro de 'playing': 'voting' (votar con !vote usuario),
    // 'confirmation' (votar !si/!no al jugador que subió al escenario) o
    // 'location' (elegir camino con !bosque/!charca/!pueblo). null en lobby.
    subphase: null,
    players: {},        // user -> { user, npc, elId, walker, x, y, location, moving, queuedTarget, plazaSpot, roundChoice, eliminated }
    order: [],
    lobbyImgs: {},
    lobbyCards: {},      // user -> elemento de la tarjeta del lobby (para poder expulsarlo)
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startZoroarks(), es decir, al empezar una nueva partida o al volver
    // a entrar en el modo).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    moveTimeouts: [],
    roundNumber: 0,
    // Duración total (en s) de la sub-fase en curso, usada para la barra
    // de tiempo (cambia entre fase de votación, confirmación y elección
    // de camino).
    phaseSeconds: ZOR_ROUND_SECONDS,
    timeLeft: ZOR_ROUND_SECONDS,
    roundTimer: null,
    nightTimeout: null,
    // Intervalo que revisa periódicamente si el nombre de algún jugador
    // se superpone con el sprite de otro (ver zorUpdateNameOverlaps).
    nameOverlapInterval: null,
    // votante -> jugador votado, se reinicia al empezar cada fase de
    // votación.
    votes: {},
    // jugador que ganó la fase de votación y está en el escenario
    // esperando el veredicto de la fase de confirmación (null si no hay
    // ninguno en curso).
    electedPlayer: null,
    // votante -> 'si' | 'no', se reinicia al empezar cada fase de
    // confirmación.
    confirmVotes: {},
    // true durante el fundido a negro / "Nuevo día" / fundido de vuelta:
    // mientras esté activo no se aceptan comandos de camino ni de voto.
    transitioning: false,
    // Set con los nombres de usuario elegidos en secreto como lobos (se
    // rellena de verdad en startZoroarksMatch, ver ZOR_WOLF_COUNT_*): nunca
    // se muestra en ningún sitio de la interfaz, solo se consulta
    // internamente al resolver las muertes de cada noche.
    wolves: new Set(),
  };
  renderZoroarksLobby();
  if (wasFullscreen) {
    // Restaura la pantalla completa sobre el lobby recién creado (ver el
    // comentario de arriba).
    requestSceneFullscreen($('zor-lobby-scene'));
  }
  addChatMessage(null, '🦊 ¡Zoroarks abierto! Escribe !participo para apuntarte', 'system');
}

function zorStopMatch() {
  const ms = state.modeState;
  if (!ms) return;
  (ms.moveTimeouts || []).forEach(id => clearTimeout(id));
  ms.moveTimeouts = [];
  clearInterval(ms.roundTimer);
  ms.roundTimer = null;
  clearTimeout(ms.nightTimeout);
  ms.nightTimeout = null;
  clearInterval(ms.nameOverlapInterval);
  ms.nameOverlapInterval = null;
  ms.transitioning = false;
  ms.subphase = null;
  ms.votes = {};
  ms.confirmVotes = {};
  ms.electedPlayer = null;
  const overlay = $('zor-night-overlay');
  if (overlay) overlay.remove();
  zorHideLocationSign();
  zorHideVotingSign();
  zorHideConfirmSign();
  Object.values(ms.players || {}).forEach(p => {
    if (p.walker) { p.walker.destroy(); p.walker = null; }
    if (p.pmdSprite) { p.pmdSprite.destroy(); p.pmdSprite = null; } // lobo revelado a mitad de la animación de Hurt
    p.moving = false;
    p.queuedTarget = null;
    (p.bubbleTimers || []).forEach(t => clearTimeout(t));
    p.bubbleTimers = [];
  });
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleZoroarksCmd(user, cmd, parts, text) {
  const ms = state.modeState;
  if (!ms) return;

  // El bocadillo SOLO muestra mensajes reales del chat del jugador que está
  // sobre el escenario durante la fase de confirmación; nunca texto de
  // relleno (mismo criterio que en Control de Extranjería). No corta el
  // procesamiento: el mensaje se muestra Y además se procesa igual como
  // comando si lo es (p.ej. si el propio jugador escribe !si o !no).
  if (ms.phase === 'playing' && ms.subphase === 'confirmation' && user === ms.electedPlayer && typeof text === 'string' && text.trim()) {
    zorShowBubble(user, text.trim());
  }

  if (cmd === '!participo') {
    if (ms.phase !== 'lobby') {
      addChatMessage(null, `${user}: las inscripciones ya están cerradas`, 'system');
      return;
    }
    if (ms.expelledUsers && ms.expelledUsers.has(user)) {
      addChatMessage(null, `${user}: el streamer te ha expulsado de esta partida, no puedes volver a apuntarte hasta la siguiente`, 'system');
      return;
    }
    if (ms.players[user]) return;
    if (ms.order.length >= ZOR_MAX_PLAYERS) {
      addChatMessage(null, `${user}: la aldea está llena (${ZOR_MAX_PLAYERS}/${ZOR_MAX_PLAYERS})`, 'system');
      return;
    }

    const npc = getRandomOwNpc();
    ms.players[user] = { user, npc };
    ms.order.push(user);
    addChatMessage(null, `✅ ${user} se apunta a Zoroarks! (${ms.order.length}/${ZOR_MAX_PLAYERS})`, 'correct', { mirror: false });
    playZorJoin();
    renderZoroarksLobbyGrid();
    return;
  }

  // !plaza deja al jugador en la plaza (o lo hace volver si ya está de
  // camino a otro sitio): es la misma opción que se aplica por defecto a
  // quien no elige ubicación en toda la ronda, pero también se puede
  // elegir explícitamente igual que !bosque/!charca/!pueblo.
  if (cmd === '!bosque' || cmd === '!charca' || cmd === '!pueblo' || cmd === '!plaza') {
    if (ms.phase !== 'playing' || ms.transitioning || ms.subphase !== 'location') return;
    const p = ms.players[user];
    if (!p || p.eliminated) return; // solo pueden moverse quienes se apuntaron antes de que empezara la partida y siguen en juego
    // Ya eligió ubicación esta ronda: no se puede sustituir por otra,
    // ni aunque el jugador siga todavía caminando hacia la elegida.
    if (p.roundChoice) return;
    const loc = cmd.slice(1);
    p.roundChoice = loc;
    zorMoveTo(user, loc);
    return;
  }

  // Fase de confirmación: cualquier usuario del chat puede votar !si o
  // !no para decidir el destino del jugador que subió al escenario.
  if (cmd === '!si' || cmd === '!no') {
    if (ms.phase !== 'playing' || ms.transitioning || ms.subphase !== 'confirmation') return;
    zorCastConfirmVote(user, cmd.slice(1));
    return;
  }

  // Fase de votación: !vote nombredeusuario (o !vote @nombredeusuario)
  // vota a ese jugador (debe ser uno de los inscritos en la partida y
  // seguir en juego). Puede votar cualquier usuario del chat, esté o no
  // inscrito en la partida. Sin distinción de mayúsculas/minúsculas, ni
  // en el comando ni en el nombre de usuario votado.
  if (cmd === '!vote') {
    if (ms.phase !== 'playing' || ms.transitioning || ms.subphase !== 'voting') return;
    let targetName = (parts[1] || '').trim();
    if (targetName.startsWith('@')) targetName = targetName.slice(1);
    if (!targetName) return;
    const targetUser = ms.order.find(u => u.toLowerCase() === targetName.toLowerCase() && !ms.players[u].eliminated);
    if (!targetUser) return; // no es un comando de voto válido (no coincide con ningún jugador en juego)
    zorCastVote(user, targetUser);
    return;
  }
}

/* ---------------------------------------------------------
   VOTACIÓN
   -----------------------------------------------------------
   Cada nuevo día (salvo el primero) empieza con ZOR_VOTE_SECONDS para
   votar a un jugador escribiendo !vote nombredeusuario o
   !vote @nombredeusuario (sin distinguir mayúsculas/minúsculas); puede
   votar cualquier usuario del chat, esté o no inscrito en la partida. El
   voto no se puede cambiar una vez emitido: solo cuenta el primer !vote
   válido de cada votante en toda la fase, cualquier otro posterior suyo
   se ignora (ver zorCastVote). Si quien vota es uno de los jugadores en
   juego (tiene su propio sprite en el mapa), al emitir ese primer voto se
   le muestra un bocadillo sobre la cabeza con el nombre del jugador
   votado (mismo mecanismo de bocadillos que la fase de confirmación, ver
   zorShowBubble). Si al acabar la fase hay un único jugador con más votos
   que el resto, sube al escenario y se abre la fase de confirmación (ver
   más abajo); si hay empate o nadie votó, se pasa directo a la fase de
   elección de camino.
   --------------------------------------------------------- */
function zorCastVote(voter, targetUser) {
  const ms = state.modeState;
  if (!ms) return;
  // El voto no se puede cambiar: si este votante ya tiene uno registrado
  // en esta fase, cualquier !vote posterior se ignora sin más.
  if (ms.votes[voter]) return;
  ms.votes[voter] = targetUser;
  zorLog(`🗳️ @${voter} vota a @${targetUser}.`);
  // Bocadillo con el nombre del jugador votado, solo si quien vota es uno
  // de los jugadores en juego (tiene sprite propio sobre el que mostrarlo;
  // zorShowBubble ya no hace nada si no hay stack de bocadillos, así que
  // no hace falta comprobar aquí si sigue vivo/tiene sprite en pantalla).
  if (ms.players[voter]) zorShowBubble(voter, `@${targetUser}`);
  renderZoroarksPlayersList();
}

function zorVoteCounts() {
  const ms = state.modeState;
  const counts = {};
  ms.order.forEach(u => { counts[u] = 0; });
  Object.values(ms.votes || {}).forEach(target => {
    if (target in counts) counts[target]++;
  });
  return counts;
}

/* ---------------------------------------------------------
   CONFIRMACIÓN (!si / !no)
   -----------------------------------------------------------
   Tras ganar la fase de votación, el jugador elegido sube al escenario de
   la plaza y se abre una fase de ZOR_CONFIRM_SECONDS en la que cualquier
   usuario del chat puede votar !si o !no. A diferencia de la votación
   normal (!vote, ver zorCastVote más arriba), aquí SÍ se puede cambiar de
   voto tantas veces como se quiera mientras dure la fase: solo cuenta el
   último !si/!no emitido por cada uno. Al acabar: si hay más "!si" que
   "!no", el jugador queda eliminado de la partida; en cualquier otro caso
   (más "!no", o empate) se salva y vuelve a la plaza.
   --------------------------------------------------------- */
function zorCastConfirmVote(voter, choice) {
  const ms = state.modeState;
  if (!ms) return;
  const changed = ms.confirmVotes[voter] && ms.confirmVotes[voter] !== choice;
  ms.confirmVotes[voter] = choice;
  const label = choice === 'si' ? '¡SÍ!' : '¡NO!';
  zorLog(changed ? `🗳️ @${voter} cambia su voto a ${label}` : `🗳️ @${voter} vota ${label}`);
  zorUpdateConfirmHint();
  renderZoroarksPlayersList();
}

function zorConfirmVoteCounts() {
  const ms = state.modeState;
  const counts = { si: 0, no: 0 };
  Object.values(ms.confirmVotes || {}).forEach(choice => {
    if (choice === 'si' || choice === 'no') counts[choice]++;
  });
  return counts;
}

function zorUpdateConfirmHint() {
  const ms = state.modeState;
  if (!ms || ms.subphase !== 'confirmation') return;
  const counts = zorConfirmVoteCounts();
  updateZorPhaseHint(`@${ms.electedPlayer} está en el escenario: vota !si (eliminar) o !no (salvar) · SÍ ${counts.si} - NO ${counts.no}`);
  zorUpdateConfirmVoteBar(counts);
}

// Barra de votación de la fase de confirmación (!si/!no), situada justo
// debajo del cartel de esa fase (ver el HTML de .zor-confirm-sign en
// renderZoroarksMap): dos tramos de color cuyo ancho relativo representa
// la proporción de votos "SÍ" (eliminar) frente a "NO" (salvar) emitidos
// hasta el momento. Sin votos todavía, se muestra a partes iguales (50/50)
// en vez de vacía, para no dar la falsa impresión de que ya ganó alguno de
// los dos bandos.
function zorUpdateConfirmVoteBar(counts) {
  const total = counts.si + counts.no;
  const siPct = total === 0 ? 50 : (counts.si / total) * 100;
  const noPct = total === 0 ? 50 : (counts.no / total) * 100;
  const siFill = $('zor-confirm-vote-si');
  const noFill = $('zor-confirm-vote-no');
  if (siFill) siFill.style.width = siPct + '%';
  if (noFill) noFill.style.width = noPct + '%';
  const siCount = $('zor-confirm-vote-si-count');
  const noCount = $('zor-confirm-vote-no-count');
  if (siCount) siCount.textContent = counts.si;
  if (noCount) noCount.textContent = counts.no;
}

/* ---------------------------------------------------------
   BOCADILLO DE DIÁLOGO (fase de confirmación)
   -----------------------------------------------------------
   Igual que en Control de Extranjería: cada mensaje nuevo se apila en su
   propio bocadillo sobre la cabeza del jugador, los anteriores se
   recolocan encima (más arriba) en vez de desaparecer, y cada uno se
   desvanece por su cuenta al cabo de ZOR_BUBBLE_HOLD_MS. Aquí, a
   diferencia de Extranjería (un único NPC en la ventanilla), cada jugador
   tiene su propia pila (p.bubbleStackId), así que solo se toca la del
   jugador que escribe.
   --------------------------------------------------------- */
function zorShowBubble(user, text) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p || !p.bubbleStackId) return;
  const stack = $(p.bubbleStackId);
  if (!stack) return;

  // Al primer mensaje de este jugador, medimos dónde empieza realmente la
  // cabeza dentro de su sprite (varía según el NPC, igual que en
  // Extranjería) para anclar el bocadillo justo encima y no del recuadro
  // completo del fotograma.
  if (!p.bubbleAnchored) {
    p.bubbleAnchored = true;
    owNpcHeadTopRatio(p.npc).then(ratio => {
      const img = $(p.elId + '-img');
      if (!img || !stack.isConnected) return;
      const displayedH = img.clientHeight || img.offsetHeight || 48;
      const headTopPx = Math.round(ratio * displayedH);
      stack.style.bottom = `calc(100% - ${headTopPx}px + 3px)`;
    });
  }

  const shown = text.length > 60 ? text.slice(0, 57) + '…' : text;
  const el = document.createElement('div');
  el.className = 'zor-bubble';
  el.textContent = shown;
  stack.appendChild(el);
  void el.offsetWidth; // fuerza el reflow para que la animación de entrada se aplique
  el.classList.add('show');

  // Mismo truco que en Extranjería para no acumular bocadillos sin fin: se
  // filtran los que aún NO se están desvaneciendo y se retira el más
  // antiguo de esa lista (ver el comentario largo en extrShowBubble).
  const visible = Array.from(stack.children).filter(c => c !== el && !c.classList.contains('hide'));
  while (visible.length + 1 > ZOR_BUBBLE_MAX) {
    zorRemoveBubble(visible.shift());
  }

  const timer = setTimeout(() => zorRemoveBubble(el), ZOR_BUBBLE_HOLD_MS);
  p.bubbleTimers = p.bubbleTimers || [];
  p.bubbleTimers.push(timer);
}

function zorRemoveBubble(el) {
  if (!el || !el.isConnected || el.classList.contains('hide')) return;
  el.classList.remove('show');
  el.classList.add('hide');
  setTimeout(() => { if (el.isConnected) el.remove(); }, ZOR_BUBBLE_HIDE_MS);
}

// Vacía de golpe (sin animación de desvanecido) la pila de bocadillos de un
// jugador y cancela sus temporizadores: se usa al acabar la fase de
// confirmación, para que no queden mensajes suyos flotando una vez baja
// del escenario.
function zorClearBubbles(user) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!p) return;
  (p.bubbleTimers || []).forEach(t => clearTimeout(t));
  p.bubbleTimers = [];
  const stack = p.bubbleStackId && $(p.bubbleStackId);
  if (stack) stack.innerHTML = '';
}

/* ---------------------------------------------------------
   LOBBY (pantalla previa de inscripción)
   --------------------------------------------------------- */
function renderZoroarksLobby() {
  const ms = state.modeState;
  // La rejilla se reconstruye entera aquí (content.innerHTML), así que las
  // cachés de tarjetas/imágenes de una posible pantalla de lobby anterior
  // (p.ej. al volver a inscripciones desde una partida en curso) quedarían
  // apuntando a elementos ya desconectados del DOM si no se reinician.
  if (ms) {
    ms.lobbyImgs = {};
    ms.lobbyCards = {};
  }
  const content = $('game-content');
  content.innerHTML = `
    <div class="zor-lobby-box game-scene" id="zor-lobby-scene">
      <div class="zor-lobby-head">
        <div class="big-count pixel" id="zor-lobby-count">0</div>
        <div style="color:var(--muted);font-size:12px;">/ ${ZOR_MAX_PLAYERS} jugadores apuntados · escribe <b style="color:var(--yellow)">!participo</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:560px;margin:6px auto 0;line-height:1.6;">
          Bienvenidos a la aldea de los Zoroark. Apúntate para reservar tu sitio: al empezar la
          partida, tu sprite aparecerá en la plaza y podrás elegir camino escribiendo
          <b style="color:#7be0ff">!bosque</b>, <b style="color:#7be0ff">!charca</b> o
          <b style="color:#7be0ff">!pueblo</b> en el chat, o quedarte en la plaza escribiendo
          <b style="color:#7be0ff">!plaza</b> (es lo que pasa por defecto si no eliges nada).
          Hacen falta al menos ${ZOR_MIN_PLAYERS} jugadores inscritos para poder empezar.
        </div>
      </div>
      <div class="zor-lobby-grid" id="zor-lobby-grid">
        <div class="zor-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="zor-start-btn is-locked" id="zor-start-btn" disabled>🔒 Comenzar Partida</button>
    </div>
  `;
  const btn = $('zor-start-btn');
  if (btn) btn.onclick = () => startZoroarksMatch();
  renderZoroarksLobbyGrid();
}

function renderZoroarksLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('zor-lobby-grid');
  const countEl = $('zor-lobby-count');
  const btn = $('zor-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (btn) {
    const locked = players.length < ZOR_MIN_PLAYERS;
    btn.disabled = locked;
    btn.classList.toggle('is-locked', locked);
    btn.textContent = locked ? '🔒 Comenzar Partida' : '▶ Comenzar Partida';
  }
  if (players.length === 0) {
    grid.innerHTML = '<div class="zor-lobby-empty">Esperando a que el chat se apunte...</div>';
    ms.lobbyImgs = {};
    ms.lobbyCards = {};
    return;
  }
  const emptyMsg = grid.querySelector('.zor-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    if (ms.lobbyImgs[p.user]) return; // ya tiene tarjeta creada
    const card = document.createElement('div');
    card.className = 'zor-lobby-card';
    card.title = 'Clic para expulsar de la partida';
    const imgId = 'zor-lobby-img-' + sanitizeUser(p.user);
    card.innerHTML = `
      <div class="zor-ow-slot"><img id="${imgId}" class="zor-ow-img" alt=""></div>
      <div class="p-user">@${escapeHtml(p.user)}</div>
    `;
    // El streamer puede hacer clic en cualquier jugador inscrito para que
    // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleZorLobbyExpelPopover(p.user, card);
    });
    grid.appendChild(card);
    const img = $(imgId);
    applyOwNpcSprite(img, p.npc);
    ms.lobbyImgs[p.user] = img;
    ms.lobbyCards[p.user] = card;
  });
}

// Abre (o cierra, si ya estaba abierto para el mismo jugador) el popover
// con el botón "Expulsar" sobre la tarjeta del lobby en la que el
// streamer ha hecho clic. Solo puede haber un popover abierto a la vez.
function toggleZorLobbyExpelPopover(user, cardEl) {
  const ms = state.modeState;
  if (!ms) return;
  toggleLobbyExpelPopover(ms, user, cardEl, expelFromZorLobby);
}

export function closeZorLobbyExpelPopover() {
  closeLobbyExpelPopover(state.modeState);
}

// Expulsa a un jugador inscrito del lobby (acción del streamer, no del
// propio usuario): se retira de la partida en curso y se le añade a
// expelledUsers para que no pueda volver a apuntarse con !participo hasta
// la siguiente partida (nueva llamada a startZoroarks()).
function expelFromZorLobby(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby' || !ms.players[user]) {
    closeZorLobbyExpelPopover();
    return;
  }
  closeZorLobbyExpelPopover();
  const idx = ms.order.indexOf(user);
  if (idx !== -1) ms.order.splice(idx, 1);
  delete ms.players[user];
  delete ms.lobbyImgs[user];
  const card = ms.lobbyCards[user];
  if (card) card.remove();
  delete ms.lobbyCards[user];
  ms.expelledUsers.add(user);
  addChatMessage(null, `🚫 @${user} ha sido expulsado de la partida por el streamer`, 'system', { mirror: false });
  renderZoroarksLobbyGrid();
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA
   --------------------------------------------------------- */
function startZoroarksMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const users = ms.order.slice();
  if (users.length < ZOR_MIN_PLAYERS) {
    toast(`Necesitas al menos ${ZOR_MIN_PLAYERS} jugadores para empezar`);
    return;
  }

  ms.phase = 'playing';
  // La música de este modo no suena durante el lobby de inscripción (ahí
  // sigue la del menú principal): arranca justo aquí, al cerrarse el lobby
  // y empezar la partida de verdad (ver MODES_WITHOUT_LOBBY_MUSIC en
  // modeLauncher.js).
  playModeMusic('zoroarks');
  ms.moveTimeouts = [];

  // Elección interna (secreta) de los jugadores lobo: uno solo si hay 8
  // jugadores o menos, dos a partir de 9. Se sortean sin repetición entre
  // todos los inscritos, y nunca se revela en la interfaz quién es quién
  // (ver ZOR_WOLF_COUNT_* y zorResolveNightDeaths).
  const wolfCount = Math.min(
    users.length >= ZOR_WOLF_COUNT_THRESHOLD ? ZOR_WOLF_COUNT_LARGE : ZOR_WOLF_COUNT_SMALL,
    users.length
  );
  const wolfPool = users.slice();
  ms.wolves = new Set();
  while (ms.wolves.size < wolfCount && wolfPool.length) {
    const idx = Math.floor(Math.random() * wolfPool.length);
    ms.wolves.add(wolfPool.splice(idx, 1)[0]);
  }

  users.forEach((u, i) => {
    const p = ms.players[u];
    const spot = zorPlazaSpot(i);
    p.elId = 'zor-p-' + sanitizeUser(u);
    p.walker = null;
    p.plazaSpot = spot;
    p.x = spot.x;
    p.y = spot.y;
    p.location = 'plaza';
    p.pendingLoc = null;
    p.moving = false;
    p.queuedTarget = null;
    p.roundChoice = null;
    p.eliminated = false;
    p.bubbleTimers = [];
    p.bubbleAnchored = false;
  });

  renderZoroarksMap();
  addChatMessage(null, `🦊 ¡Comienza Zoroarks con ${users.length} jugadores!`, 'system', { mirror: false });
  playZorMatchStart();
  startZoroarksDay();
}

/* ---------------------------------------------------------
   MAPA DE LA ALDEA
   --------------------------------------------------------- */
function renderZoroarksMap() {
  const ms = state.modeState;
  if (!ms) return;
  const content = $('game-content');
  content.innerHTML = `
    <div class="zor-wrap">
      <div class="zor-topbar">
        <div class="stat">🦊 Jugadores: <b id="zor-players-count">${ms.order.length}</b></div>
        <div class="stat">🌙 Día: <b id="zor-round-num">${ms.roundNumber}</b></div>
        <div class="stat zor-phase-hint" id="zor-phase-hint">Escribe !bosque, !charca, !pueblo o !plaza para elegir dónde ir</div>
        <button class="zor-back-btn" id="zor-back-btn">⬅ Volver a inscripciones</button>
      </div>
      <div class="zor-field-outer game-scene" id="zor-field-outer">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <div class="zor-timer-box" id="zor-timer-box">
          <div class="zor-timer-box-head"><span>⏱️ Tiempo</span><b id="zor-timer-text">${ms.timeLeft}s</b></div>
          <div class="timer-bar"><div class="timer-bar-fill" id="zor-timer-fill" style="width:100%"></div></div>
        </div>
        <div class="zor-map" id="zor-map">
          <div class="zor-lamp-layer">
            ${ZOR_LAMPS.map((lamp, i) => `
              <div class="zor-lamp${i % 2 ? ' zor-lamp--b' : ''}" style="left:${lamp.x}%; top:${lamp.y}%;">
                <div class="zor-lamp-halo"></div>
                <div class="zor-lamp-core"></div>
              </div>
            `).join('')}
          </div>
          <div class="zor-players-layer" id="zor-players-layer"></div>
          <div class="zor-location-sign" id="zor-location-sign" style="left:${ZOR_STAGE_SPOT.x}%; top:${ZOR_STAGE_SPOT.y}%;">
            <div class="zor-sign-inner">
              <div class="zor-sign-board">
                <div class="zor-sign-title pixel">Elige dónde pasar la noche</div>
                <div class="zor-sign-cmds">
                  <span>!pueblo</span><span>!charca</span><span>!bosque</span><span>!plaza</span>
                </div>
              </div>
            </div>
          </div>
          <div class="zor-voting-sign" id="zor-voting-sign" style="left:${ZOR_STAGE_SPOT.x}%; top:${ZOR_STAGE_SPOT.y}%;">
            <div class="zor-sign-inner">
              <div class="zor-sign-board">
                <div class="zor-sign-title pixel">Vota por un jugador con</div>
                <div class="zor-sign-cmds">
                  <span>!vote nombredeusuario</span><span>!vote @nombredeusuario</span>
                </div>
              </div>
            </div>
          </div>
          <div class="zor-confirm-sign" id="zor-confirm-sign">
            <div class="zor-sign-inner">
              <div class="zor-sign-board">
                <div class="zor-sign-title pixel">Vota si matar o no al jugador elegido con</div>
                <div class="zor-sign-cmds">
                  <span>!si</span><span>!no</span>
                </div>
              </div>
              <div class="zor-confirm-vote-bar" id="zor-confirm-vote-bar">
                <div class="zor-confirm-vote-fill zor-confirm-vote-fill--si" id="zor-confirm-vote-si" style="width:50%"></div>
                <div class="zor-confirm-vote-fill zor-confirm-vote-fill--no" id="zor-confirm-vote-no" style="width:50%"></div>
              </div>
              <div class="zor-confirm-vote-labels">
                <span>🔪 SÍ <b id="zor-confirm-vote-si-count">0</b></span>
                <span>❤️ NO <b id="zor-confirm-vote-no-count">0</b></span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="zor-info-grid">
        <div class="ranking-panel" id="zor-players-panel">
          <div class="ranking-title">🦊 Jugadores</div>
          <div id="zor-players-list"></div>
        </div>
        <div class="battle-log" id="zor-log"><p style="color:var(--muted);font-style:italic;">¡Elige tu camino por la aldea!</p></div>
      </div>
    </div>
  `;
  const backBtn = $('zor-back-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      zorStopMatch();
      ms.phase = 'lobby';
      renderZoroarksLobby();
    };
  }

  ms.order.forEach(u => createZoroarksPlayerEl(ms.players[u]));
  renderZoroarksPlayersList();

  // Revisa cada ZOR_NAME_OVERLAP_INTERVAL_MS si el nombre de algún
  // jugador se ha quedado superpuesto con el sprite de otro (los
  // jugadores se mueven en todo momento, no solo al llegar a un sitio),
  // para bajarle la opacidad al 50% mientras dure. clearInterval por si
  // quedara uno de una partida/render anterior.
  clearInterval(ms.nameOverlapInterval);
  ms.nameOverlapInterval = setInterval(zorUpdateNameOverlaps, ZOR_NAME_OVERLAP_INTERVAL_MS);
}

function createZoroarksPlayerEl(p) {
  const layer = $('zor-players-layer');
  if (!layer) return null;
  const el = document.createElement('div');
  el.className = 'zor-player';
  el.id = p.elId;
  const imgId = p.elId + '-img';
  const bubbleId = p.elId + '-bubbles';
  const slotId = p.elId + '-slot';
  const nameId = p.elId + '-name';
  p.bubbleStackId = bubbleId;
  p.bubbleAnchored = false;
  el.innerHTML = `
    <div class="zor-player-name" id="${nameId}">@${escapeHtml(p.user)}</div>
    <div class="zor-ow-slot" id="${slotId}">
      <div class="zor-bubble-stack" id="${bubbleId}"></div>
      <img id="${imgId}" class="zor-ow-img" alt="">
    </div>
  `;
  el.style.left = p.x + '%';
  el.style.top = p.y + '%';
  layer.appendChild(el);
  p.walker = new OwWalker($(imgId), p.npc, 'down');
  return el;
}

function renderZoroarksPlayersList() {
  const ms = state.modeState;
  const list = $('zor-players-list');
  if (!ms || !list) return;
  const players = ms.order.map(u => ms.players[u]);
  if (players.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);">Sin jugadores</div>';
    return;
  }
  const showVotes = ms.subphase === 'voting';
  const showConfirm = ms.subphase === 'confirmation';
  const counts = showVotes ? zorVoteCounts() : null;
  list.innerHTML = players.map(p => `
    <div class="zor-player-row${p.eliminated ? ' zor-player-row--out' : ''}">
      <span>@${escapeHtml(p.user)}</span>
      <span class="zor-player-status">${
        p.eliminated
          ? '💀 Eliminado'
          : showConfirm
            ? (p.user === ms.electedPlayer ? '🔥 En el escenario' : '')
            : showVotes
              ? `🗳️ ${counts[p.user] || 0}`
              : (p.location ? (p.moving ? '🚶 en camino…' : ZOR_LOCATION_BADGE[p.location]) : '')
      }</span>
    </div>
  `).join('');
}

// El nombre de cada jugador vive siempre visible sobre su sprite (nunca se
// oculta), pero cuando dos sprites quedan lo bastante cerca como para que
// el nombre de uno se superponga con el sprite de otro, ese nombre baja al
// 50% de opacidad mientras dure la superposición (clase
// .zor-player-name--dim), para que se note que hay alguien debajo sin
// llegar a taparlo del todo. Se compara en coordenadas de pantalla
// (getBoundingClientRect), así que funciona igual estén los jugadores
// quietos en la plaza o a mitad de camino.
function zorUpdateNameOverlaps() {
  const ms = state.modeState;
  if (!ms) return;

  const entries = [];
  ms.order.forEach(u => {
    const p = ms.players[u];
    if (!p || p.eliminated) return;
    const nameEl = $(p.elId + '-name');
    const slotEl = $(p.elId + '-slot');
    if (!nameEl || !slotEl) return;
    entries.push({ nameEl, nameRect: nameEl.getBoundingClientRect(), slotRect: slotEl.getBoundingClientRect() });
  });

  const rectsOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  entries.forEach(entry => {
    const dim = entries.some(other => other !== entry && rectsOverlap(entry.nameRect, other.slotRect));
    entry.nameEl.classList.toggle('zor-player-name--dim', dim);
  });
}

function zorLog(text) {
  const log = $('zor-log');
  if (!log) return;
  const p = document.createElement('p');
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}

/* ---------------------------------------------------------
   MOVIMIENTO
   -----------------------------------------------------------
   Cada jugador recorre su ruta punto a punto: en cada tramo se
   calcula la dirección (para que OwWalker mire y ande hacia el lado
   correcto) y una duración proporcional a la distancia, se anima con
   una transición CSS de left/top, y al terminar ese tramo se pasa al
   siguiente hasta agotar la ruta. Si llega un comando nuevo mientras
   el jugador todavía está caminando, se guarda en queuedTarget y se
   aplica en cuanto termine de llegar a su destino actual.
   --------------------------------------------------------- */
function zorMoveTo(user, toLoc, onArrive) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p || p.eliminated) return;

  if (p.moving) {
    if (p.queuedTarget !== toLoc) {
      p.queuedTarget = toLoc;
      addChatMessage(null, `🚶 @${user} ya va de camino, en cuanto llegue pondrá rumbo a ${ZOR_LOCATION_NAMES[toLoc]}`, 'system', { mirror: false });
    }
    return;
  }
  if (p.location === toLoc) { if (onArrive) onArrive(); return; } // ya está ahí, no hace nada

  const route = zorRoutePoints(p.location, toLoc, p);
  if (route.length === 0) { if (onArrive) onArrive(); return; }

  p.pendingLoc = toLoc;
  p.queuedTarget = null;
  p.moving = true;
  renderZoroarksPlayersList();
  zorLog(`🚶 @${user} pone rumbo a ${ZOR_LOCATION_NAMES[toLoc]}...`);
  zorWalkRoute(user, route, 0, onArrive);
}

function zorWalkRoute(user, route, idx, onArrive) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;
  if (ms.phase !== 'playing') { p.moving = false; return; }

  if (idx >= route.length) {
    p.location = p.pendingLoc;
    p.pendingLoc = null;
    p.moving = false;
    if (p.walker) p.walker.stopWalking();
    zorLog(
      p.location === 'plaza'
        ? `📍 @${user} llega de vuelta a ${ZOR_LOCATION_NAMES[p.location]}.`
        : `🌫️ @${user} desaparece por el camino de ${ZOR_LOCATION_NAMES[p.location]}.`
    );
    renderZoroarksPlayersList();
    if (onArrive) onArrive();
    if (p.queuedTarget && p.queuedTarget !== p.location) {
      const next = p.queuedTarget;
      p.queuedTarget = null;
      zorMoveTo(user, next);
    }
    return;
  }

  const wp = route[idx];
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  const dist = Math.hypot(dx, dy);
  const dur = Math.max(ZOR_MIN_STEP_MS, (dist / ZOR_SPEED_PCT_PER_SEC) * 1000);
  const dirName = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');

  if (p.walker) {
    p.walker.setDirection(dirName);
    p.walker.startWalking();
  }
  const el = $(p.elId);
  if (el) {
    el.style.transition = `left ${dur}ms linear, top ${dur}ms linear`;
    el.style.left = wp.x + '%';
    el.style.top = wp.y + '%';
  }
  p.x = wp.x;
  p.y = wp.y;

  const timeoutId = setTimeout(() => zorWalkRoute(user, route, idx + 1, onArrive), dur);
  ms.moveTimeouts.push(timeoutId);
}

/* ---------------------------------------------------------
   ESCENARIO (fase de confirmación) Y ELIMINACIÓN
   -----------------------------------------------------------
   Subir/bajar del escenario es un desplazamiento puramente visual: no
   toca p.location (que sigue siendo 'plaza' todo el rato). Para subir, el
   sprite recorre punto a punto una de las dos rutas de ZOR_STAGE_ROUTES
   (la que arranca más cerca de él, ver zorPickStageRoute); para bajar,
   vuelve directo a su plazaSpot. Ambos casos reutilizan la misma
   velocidad de paseo (ZOR_SPEED_PCT_PER_SEC/ZOR_MIN_STEP_MS) que el resto
   de trayectos.
   --------------------------------------------------------- */
// onProgress (opcional) se llama periódicamente mientras dura el trayecto
// con la posición interpolada (x, y) del jugador en ese instante -y una
// última vez, con la posición final exacta, justo antes de onArrive-, para
// que quien lo llame pueda hacer que otros sprites lo sigan con la mirada
// mientras camina (ver zorSendToStage).
function zorWalkToPoint(user, target, onArrive, onProgress) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;

  const startX = p.x;
  const startY = p.y;
  const dx = target.x - startX;
  const dy = target.y - startY;
  const dist = Math.hypot(dx, dy);
  const dur = Math.max(ZOR_MIN_STEP_MS, (dist / ZOR_SPEED_PCT_PER_SEC) * 1000);
  const dirName = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');

  if (p.walker) {
    p.walker.setDirection(dirName);
    p.walker.startWalking();
  }
  const el = $(p.elId);
  if (el) {
    el.style.transition = `left ${dur}ms linear, top ${dur}ms linear`;
    el.style.left = target.x + '%';
    el.style.top = target.y + '%';
  }
  p.x = target.x;
  p.y = target.y;

  let progressIntervalId = null;
  if (onProgress) {
    const startTime = performance.now();
    progressIntervalId = setInterval(() => {
      const t = Math.min(1, (performance.now() - startTime) / dur);
      onProgress(startX + dx * t, startY + dy * t);
    }, ZOR_WATCH_INTERVAL_MS);
    ms.moveTimeouts.push(progressIntervalId);
  }

  const timeoutId = setTimeout(() => {
    if (progressIntervalId) clearInterval(progressIntervalId);
    if (onProgress) onProgress(target.x, target.y); // deja la mirada fijada exactamente en el punto de llegada
    if (p.walker) p.walker.stopWalking();
    if (onArrive) onArrive();
  }, dur);
  ms.moveTimeouts.push(timeoutId);
}

// Dirección cardinal (arriba/abajo/izquierda/derecha) más cercana desde un
// punto (fromX, fromY) hacia otro (toX, toY): mismo criterio que se usa en
// todo el fichero para orientar a un sprite según hacia dónde se mueve
// (ver zorWalkRoute), pero aquí en función de una posición relativa fija
// en vez de un desplazamiento propio.
function zorDirBetween(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

// Gira el sprite de cada jugador (salvo el propio jugador elegido y los ya
// eliminados) para que mire hacia la posición (atX, atY) del jugador más
// votado. Se usa tanto en el instante en que acaba la votación como, a
// intervalos, mientras dicho jugador camina hacia el escenario, para que
// el resto del pueblo lo siga con la mirada durante todo el trayecto.
function zorOrientWatchers(electedUser, atX, atY) {
  const ms = state.modeState;
  if (!ms) return;
  ms.order.forEach(u => {
    if (u === electedUser) return;
    const p = ms.players[u];
    if (!p || p.eliminated || !p.walker) return;
    p.walker.setDirection(zorDirBetween(p.x, p.y, atX, atY));
  });
}

// Recorre, punto a punto, una de las rutas de ZOR_STAGE_ROUTES: encadena
// zorWalkToPoint tramo tras tramo (igual que zorWalkRoute con los
// caminos normales) pero conservando aquí el onProgress en cada tramo,
// para que zorOrientWatchers pueda seguir con la mirada al jugador
// elegido durante todo el trayecto y no solo en el último tramo.
function zorWalkStageRoute(user, route, idx, onArrive, onProgress) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;
  if (idx >= route.length) { if (onArrive) onArrive(); return; }
  zorWalkToPoint(
    user,
    route[idx],
    () => zorWalkStageRoute(user, route, idx + 1, onArrive, onProgress),
    onProgress
  );
}

function zorSendToStage(user) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;
  // En cuanto se conoce el jugador elegido (justo al acabar la votación),
  // el resto de sprites del pueblo giran de inmediato para mirar hacia él,
  // y lo siguen con la mirada (onProgress) durante todo el trayecto hasta
  // el escenario.
  zorOrientWatchers(user, p.x, p.y);
  // La ruta a seguir es la de ZOR_STAGE_ROUTES cuyo punto inicial esté más
  // cerca de la posición actual del jugador elegido.
  const route = zorPickStageRoute(p.x, p.y);
  zorWalkStageRoute(
    user,
    route,
    0,
    () => {
      // Al llegar al punto final, el jugador elegido siempre queda mirando
      // hacia abajo (de cara al pueblo), sea cual sea la dirección desde la
      // que llegó caminando.
      if (p.walker) p.walker.setDirection('down');
      zorLog(`🎭 @${user} ya está sobre el escenario, esperando el veredicto del pueblo.`);
    },
    (curX, curY) => zorOrientWatchers(user, curX, curY)
  );
}

function zorSendBackFromStage(user, onArrive) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p || !p.plazaSpot) return;
  zorWalkToPoint(user, p.plazaSpot, onArrive);
}

// Fundido final de desaparición del elemento completo de un jugador (placa
// de nombre + sprite): común a la eliminación normal (zorEliminatePlayer)
// y a la de un lobo revelado (zorRevealWolfAndDie), que solo llega aquí
// después de mantener su Hurt en pantalla el tiempo pedido. onDone (si se
// pasa) se llama justo cuando el elemento ya se ha quitado del todo del
// DOM, es decir, cuando el jugador ha "desaparecido por completo" -lo usa
// zorRevealWolfAndDie para saber el momento exacto en que el Zoroark ya no
// queda ni rastro de él en pantalla (ver ZOR_LOCATION_PHASE_DELAY_MS).
function zorFadeOutPlayerEl(user, onDone) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!p) { if (onDone) onDone(); return; }
  const el = $(p.elId);
  if (el) {
    el.style.transition = 'opacity .8s ease, transform .8s ease';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -100%) scale(.6)';
    setTimeout(() => { el.remove(); if (onDone) onDone(); }, 850);
  } else if (onDone) {
    onDone();
  }
}

// Elimina definitivamente a un jugador de la partida: su sprite se
// desvanece del mapa y a partir de ahí no puede votar como objetivo, ni
// elegir camino, ni ser elegido de nuevo en votaciones futuras. onDone (si
// se pasa) se llama justo cuando el elemento ya ha desaparecido del todo
// del DOM -lo usa zorEndConfirmationPhase para no comprobar el fin de
// partida (zorCheckGameEnd) hasta que el jugador eliminado por votación
// haya terminado de desvanecerse del mapa.
function zorEliminatePlayer(user, onDone) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p || p.eliminated) { if (onDone) onDone(); return; }
  p.eliminated = true;
  p.moving = false;
  p.queuedTarget = null;
  if (p.walker) p.walker.stopWalking();
  zorFadeOutPlayerEl(user, onDone);
}

// Cuando el pueblo confirma con !si la muerte de un jugador que en secreto
// era un lobo (ver ms.wolves), su sprite OW deja paso a su verdadera forma:
// un Zoroark, con el mismo sprite PMD (Pokémon Mundo Misterioso) que usan
// otros modos como Pokerus. Se marca como eliminado de inmediato -para que
// no pueda colarse ningún comando de camino mientras dura la revelación,
// aunque el desvanecido visual final llegue más tarde- y se detiene y
// destruye su OwWalker; en su lugar, el mismo .zor-ow-slot (conserva su
// posición sobre el mapa, pero el Zoroark se muestra al doble de tamaño
// que el sprite OW al que sustituye, ver el CSS de .zor-ow-slot.pmd-mini)
// pasa a alojar un PMDSprite que reproduce la animación
// de "Hurt" una única vez (sin bucle) y a un ritmo ralentizado (ver
// ZOR_WOLF_REVEAL_ANIM_SPEED). A la vez, la cámara hace zoom sobre su
// posición en el escenario (ver zorZoomCameraTo) mientras dura la
// revelación. El Zoroark se mantiene en pantalla durante
// ZOR_WOLF_REVEAL_HURT_MS (3 segundos) -tanto si el ciclo de la animación
// termina antes como si tarda más- antes de que la cámara se aleje de
// nuevo (zorResetCameraZoom) y el Zoroark muera del todo y se desvanezca
// del mapa (zorFadeOutPlayerEl). onComplete (si se pasa) se llama justo
// cuando el sprite del Zoroark ha desaparecido por completo del mapa -lo
// usa zorEndConfirmationPhase para no arrancar la fase de elección de
// ubicación hasta que eso ocurra (ver ZOR_LOCATION_PHASE_DELAY_MS).
function zorRevealWolfAndDie(user, onComplete) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p || p.eliminated) { if (onComplete) onComplete(); return; }

  p.eliminated = true;
  p.moving = false;
  p.queuedTarget = null;
  if (p.walker) { p.walker.destroy(); p.walker = null; }

  const slot = $(p.elId + '-slot');
  if (slot) {
    slot.innerHTML = '';
    slot.classList.add('pmd-slot', 'pmd-mini');
    const pmdSprite = new PMDSprite(slot, ZOR_ZOROARK_FALLBACK_SPRITE);
    pmdSprite.setDex(ZOR_ZOROARK_DEX);
    // loop=false: se reproduce un único ciclo de la animación de Hurt y se
    // queda parada en su último fotograma (no vuelve a arrancar), aunque
    // el Zoroark siga visible en pantalla hasta ZOR_WOLF_REVEAL_HURT_MS.
    // speed=ZOR_WOLF_REVEAL_ANIM_SPEED: la ralentiza para que se aprecie
    // bien durante el zoom de cámara.
    pmdSprite.play('Hurt', PMD_DIR.down, false, null, ZOR_WOLF_REVEAL_ANIM_SPEED);
    p.pmdSprite = pmdSprite;
  }

  zorZoomCameraTo(p.x, p.y);

  const timeoutId = setTimeout(() => {
    if (p.pmdSprite) { p.pmdSprite.destroy(); p.pmdSprite = null; }
    zorResetCameraZoom();
    zorFadeOutPlayerEl(user, onComplete);
  }, ZOR_WOLF_REVEAL_HURT_MS);
  ms.moveTimeouts = ms.moveTimeouts || [];
  ms.moveTimeouts.push(timeoutId);
}

// Acerca la cámara (zoom sobre .zor-map, recortado por el overflow:hidden
// de .zor-field-outer que lo contiene) al punto (x,y) indicado, en el
// mismo sistema de % que usa el resto de coordenadas del mapa (posición de
// jugadores, ZOR_STAGE_SPOT...), dejando ese punto CENTRADO en la pantalla
// mientras dura el zoom. Se usa durante la revelación del Zoroark (ver
// zorRevealWolfAndDie) para centrar el zoom exactamente sobre su posición
// en el escenario. Al ser .zor-map el elemento que escala -y no
// .zor-field-outer- el zoom deja completamente quietos a los elementos que
// viven fuera de él dentro de .zor-field-outer, como .zor-timer-box o el
// botón de pantalla completa.
//
// OJO: fijar transform-origin directamente en (x,y) (como se hacía antes)
// NO centra el punto en la pantalla, solo lo deja fijo en su posición
// ORIGINAL: al escalar con origen O, un punto P se renderiza en
// O + s·(P - O), que solo coincide con el centro (50%,50%) si P ya estaba
// en el centro. Como ZOR_STAGE_SPOT no está centrado verticalmente
// (y:37, no 50), el Zoroark quedaba desplazado hacia arriba en vez de
// centrado. Para que SÍ quede centrado, se despeja el origen O que hace
// que ese punto se renderice en el centro: de la fórmula anterior,
// O = (centro - s·P) / (1 - s).
function zorZoomCameraTo(x, y) {
  const map = $('zor-map');
  if (!map) return;
  const s = ZOR_CAMERA_ZOOM_SCALE;
  const originX = (50 - s * x) / (1 - s);
  const originY = (50 - s * y) / (1 - s);
  map.style.transformOrigin = `${originX}% ${originY}%`;
  // Fuerza el reflow para que el nuevo transform-origin quede aplicado
  // ANTES de cambiar la escala: si no, el navegador podría animar también
  // el origen del zoom (encuadre raro) en vez de solo el acercamiento.
  void map.offsetWidth;
  map.style.transform = `scale(${s})`;
}

// Deshace el zoom de zorZoomCameraTo y devuelve la cámara a su encuadre
// normal (misma transición definida en CSS para .zor-map, pero a la
// inversa).
function zorResetCameraZoom() {
  const map = $('zor-map');
  if (map) map.style.transform = '';
}

/* ---------------------------------------------------------
   MUERTES NOCTURNAS (lobos ocultos)
   -----------------------------------------------------------
   Al principio de la partida se eligen en secreto uno o dos jugadores
   lobo (ver startZoroarksMatch), que nunca se muestran en la interfaz.
   Cada noche, una vez todos los jugadores han llegado a su destino
   (ver zorShowNightTransition, que llama a esto con la pantalla ya
   completamente a negro), se resuelven las muertes según la ubicación en
   la que pasó la noche cada uno:
     - Pueblo y charca: por cada lobo presente en esa ubicación muere un
       jugador no-lobo de esa misma ubicación, elegido al azar sin
       repetir (como máximo tantos como jugadores no-lobo haya ahí).
     - Bosque y plaza: cada jugador no-lobo presente tiene un
       ZOR_NIGHT_RANDOM_DEATH_CHANCE (33%) de probabilidad, independiente
       del resto, de morir esa noche, haya o no lobos en la partida.
   Un jugador lobo nunca muere por ninguna de estas dos vías: solo puede
   morir si el pueblo lo vota como más votado y luego confirma su muerte
   en la fase de !si/!no (zorEndConfirmationPhase).
   --------------------------------------------------------- */
// Devuelve el nº de aldeanos (jugadores no-lobo) muertos esa noche, para
// que zorShowNightTransition pueda mostrarlo en el rótulo de la pantalla
// en negro (ver zorPlayNightMessages).
function zorResolveNightDeaths() {
  const ms = state.modeState;
  if (!ms) return 0;

  const byLoc = { pueblo: [], charca: [], bosque: [], plaza: [] };
  ms.order.forEach(u => {
    const p = ms.players[u];
    if (!p || p.eliminated) return;
    if (byLoc[p.location]) byLoc[p.location].push(u);
  });

  const victims = [];

  // Pueblo y charca: un jugador no-lobo muerto por cada lobo presente ahí.
  ['pueblo', 'charca'].forEach(loc => {
    const here = byLoc[loc];
    const wolvesHere = here.filter(u => ms.wolves.has(u)).length;
    const villagerPool = here.filter(u => !ms.wolves.has(u));
    const killCount = Math.min(wolvesHere, villagerPool.length);
    for (let i = 0; i < killCount; i++) {
      const idx = Math.floor(Math.random() * villagerPool.length);
      victims.push(villagerPool.splice(idx, 1)[0]);
    }
  });

  // Bosque y plaza: 33% de probabilidad individual, independiente de si
  // hay lobos presentes o no. Los lobos quedan siempre exentos.
  ['bosque', 'plaza'].forEach(loc => {
    byLoc[loc].forEach(u => {
      if (ms.wolves.has(u)) return;
      if (Math.random() < ZOR_NIGHT_RANDOM_DEATH_CHANCE) victims.push(u);
    });
  });

  if (victims.length === 0) {
    zorLog('🌙 La noche pasa en calma, sin víctimas.');
    addChatMessage(null, '🌙 La noche pasa en calma: nadie ha muerto.', 'system');
    return 0;
  }

  victims.forEach(u => {
    zorLog(`🐺 @${u} no sobrevive a la noche en ${ZOR_LOCATION_NAMES[ms.players[u].location]}...`);
    zorEliminatePlayer(u);
  });
  addChatMessage(null, `🐺 No ${victims.length > 1 ? 'sobreviven' : 'sobrevive'} a la noche: ${victims.map(u => '@' + u).join(', ')}`, 'wrong');
  renderZoroarksPlayersList();
  return victims.length;
}

/* ---------------------------------------------------------
   FIN DE PARTIDA
   -----------------------------------------------------------
   La partida termina en cuanto, tras cualquier eliminación (muerte
   nocturna en zorResolveNightDeaths, o eliminación/revelación en
   zorEndConfirmationPhase), uno de los dos bandos se queda sin ningún
   jugador vivo:
     - Todos los lobos han muerto: gana el pueblo. Solo puede ocurrir tras
       una revelación en la fase de confirmación (los lobos nunca mueren
       por la vía nocturna, ver zorResolveNightDeaths), así que basta con
       comprobarlo ahí.
     - Todos los aldeanos han muerto: el pueblo es arrasado. Puede ocurrir
       tanto por muertes nocturnas como por una eliminación en la fase de
       confirmación (un aldeano votado y confirmado), así que se comprueba
       tras ambas.
   En cualquiera de los dos casos se muestra la misma pantalla final: un
   sprite PMD de Zoroark (uno por cada lobo QUE HUBO en la partida, vivo o
   no en ese momento, ver ms.wolves) con el nombre de usuario de ese lobo
   debajo, para revelar de una vez quién o quiénes lo eran (ver
   zorShowEndScreen).
   --------------------------------------------------------- */
function zorAliveWolves() {
  const ms = state.modeState;
  if (!ms) return [];
  return ms.order.filter(u => ms.wolves.has(u) && ms.players[u] && !ms.players[u].eliminated);
}

function zorAliveVillagers() {
  const ms = state.modeState;
  if (!ms) return [];
  return ms.order.filter(u => !ms.wolves.has(u) && ms.players[u] && !ms.players[u].eliminated);
}

// Debe llamarse justo después de cualquier evento que pueda eliminar
// jugadores. Si alguno de los dos bandos se ha quedado sin jugadores vivos,
// muestra la pantalla final correspondiente (zorEndGame) y devuelve true,
// para que quien llame deje de encadenar la siguiente fase/día; si la
// partida debe continuar, devuelve false sin hacer nada.
function zorCheckGameEnd() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return false;
  if (zorAliveWolves().length === 0) {
    zorEndGame('village');
    return true;
  }
  if (zorAliveVillagers().length === 0) {
    zorEndGame('wolves');
    return true;
  }
  return false;
}

// Detiene toda la partida (temporizadores, transiciones, carteles) y
// muestra la pantalla final. winner es 'village' (todos los lobos han
// muerto) o 'wolves' (todos los aldeanos han muerto).
function zorEndGame(winner) {
  const ms = state.modeState;
  if (!ms || ms.phase === 'ended') return;
  ms.phase = 'ended';
  ms.subphase = null;

  clearInterval(ms.roundTimer);
  ms.roundTimer = null;
  clearTimeout(ms.nightTimeout);
  ms.nightTimeout = null;
  clearTimeout(ms.locationPhaseDelayTimeout);
  ms.locationPhaseDelayTimeout = null;
  (ms.moveTimeouts || []).forEach(id => clearTimeout(id));
  ms.moveTimeouts = [];
  clearInterval(ms.nameOverlapInterval);
  ms.nameOverlapInterval = null;

  zorHideLocationSign();
  zorHideVotingSign();
  zorHideConfirmSign();
  const nightOverlay = $('zor-night-overlay');
  if (nightOverlay) nightOverlay.remove();

  // ms.wolves nunca cambia tras startZoroarksMatch: da igual que a estas
  // alturas algún lobo siga vivo (bando "wolves" ganador) o ya esté
  // eliminado (bando "village" ganador), aquí se listan siempre TODOS los
  // que lo eran, vivos o no.
  const wolfNames = ms.order.filter(u => ms.wolves.has(u));

  if (winner === 'village') {
    zorLog(`🏆 ¡Todos los lobos han caído! Gana el pueblo. ${wolfNames.map(u => '@' + u).join(', ')} ${wolfNames.length > 1 ? 'eran' : 'era'} hombre lobo.`);
    playZorVillageWins();
    addChatMessage(null, `🏆 ¡Gana el pueblo! ${wolfNames.map(u => '@' + u).join(', ')} ${wolfNames.length > 1 ? 'eran' : 'era'} hombre lobo.`, 'correct');
  } else {
    zorLog(`☠️ Todos los aldeanos han muerto. El pueblo ha sido arrasado. ${wolfNames.map(u => '@' + u).join(', ')} ${wolfNames.length > 1 ? 'eran' : 'era'} hombre lobo.`);
    playZorWolvesWin();
    addChatMessage(null, `☠️ El pueblo ha sido arrasado. ${wolfNames.map(u => '@' + u).join(', ')} ${wolfNames.length > 1 ? 'eran' : 'era'} hombre lobo.`, 'wrong');
  }

  zorShowEndScreen(winner, wolfNames);
}

// Construye la pantalla final: un cartel a pantalla completa sobre el mapa
// con el título correspondiente ("gana el pueblo" / "el pueblo ha sido
// arrasado"), un sprite PMD de Zoroark por cada lobo que hubo en la
// partida (misma pinta que la revelación de zorRevealWolfAndDie, aunque
// aquí se queden fijos en pantalla sin desvanecerse) y, debajo de cada
// sprite, el nombre de usuario de ese lobo. Incluye un botón para volver a
// las inscripciones de una nueva partida.
function zorShowEndScreen(winner, wolfNames) {
  const field = $('zor-field-outer');
  if (!field) return;

  const existing = $('zor-victory-banner');
  if (existing) existing.remove();

  const title = winner === 'village' ? 'Gana el pueblo' : 'El pueblo ha sido arrasado';
  const banner = document.createElement('div');
  banner.className = 'zor-victory-banner';
  banner.id = 'zor-victory-banner';
  banner.innerHTML = `
    <div class="win-title pixel">${escapeHtml(title)}</div>
    <div class="zor-victory-wolves" id="zor-victory-wolves"></div>
    <div class="mode-end-actions">
      <button class="zor-start-btn" id="zor-victory-again-btn">🔁 Nueva Partida</button>
      <button class="mode-end-menu-btn" id="zor-victory-menu-btn">🏠 Menú Principal</button>
    </div>
  `;
  field.appendChild(banner);

  const wolvesLayer = $('zor-victory-wolves');
  if (wolvesLayer) {
    wolfNames.forEach((u, i) => {
      const card = document.createElement('div');
      card.className = 'zor-victory-wolf-card';
      const spriteId = 'zor-victory-sprite-' + i;
      card.innerHTML = `
        <div class="pmd-slot pmd-mini zor-victory-sprite" id="${spriteId}"></div>
        <div class="zor-victory-wolf-name">@${escapeHtml(u)}</div>
      `;
      wolvesLayer.appendChild(card);
      const sprite = new PMDSprite($(spriteId), ZOR_ZOROARK_FALLBACK_SPRITE);
      sprite.setDex(ZOR_ZOROARK_DEX);
      if (winner === 'wolves') {
        // Ganan los lobos: se muestra al Zoroark en su pose normal -Walk
        // ralentizado hasta que se lee como si estuviera de pie, quieto-,
        // nunca la animación de Hurt (esa es propia de la revelación
        // cuando el pueblo consigue eliminarlos, no encaja si son ellos
        // quienes ganan).
        sprite.play('Walk', PMD_DIR.down, true, null, ZOR_VICTORY_STAND_ANIM_SPEED);
      } else {
        // Gana el pueblo: se mantiene la misma pinta "herida" que ya
        // vieron al eliminarlos durante la partida (Hurt, la única
        // animación de Zoroark disponible localmente, ver
        // PMD_LOCAL_ANIM_DATA en pmdSprite.js), sin bucle, parada en su
        // último fotograma.
        sprite.play('Hurt', PMD_DIR.down, false, null, ZOR_WOLF_REVEAL_ANIM_SPEED);
      }
    });
  }

  const again = $('zor-victory-again-btn');
  if (again) again.onclick = () => startZoroarks();
  const menuBtn = $('zor-victory-menu-btn');
  if (menuBtn) menuBtn.onclick = () => backToMenu();
}

/* ---------------------------------------------------------
   RONDAS Y TRANSICIÓN DE NOCHE
   -----------------------------------------------------------
   Cada ronda dura ZOR_ROUND_SECONDS: mientras corre el temporizador los
   jugadores pueden elegir camino con !bosque/!charca/!pueblo (y cambiar
   de opinión, como en zorMoveTo). Al agotarse el tiempo:
     1) Cualquier trayecto en curso se da por llegado de inmediato
        (zorFinalizePendingMove), para que todos los jugadores queden en
        un sitio bien definido (plaza/bosque/charca/pueblo) antes de que
        se tape la pantalla.
     2) Fundido a negro sobre el mapa, resolución de las muertes de la
        noche (zorResolveNightDeaths) y secuencia de rótulos "Esta noche" /
        "han muerto" / "X aldeanos" (zorPlayNightMessages), que se
        mantiene en pantalla ZOR_NIGHT_HOLD_MS tras el último mensaje.
     3) En el instante en que arranca el fundido inverso que devuelve el
        mapa a la vista, cada jugador que pasó la noche fuera de la plaza
        emprende el regreso por el mismo camino (a la inversa) que usó
        para llegar hasta allí -reutilizando zorMoveTo, que ya sabe
        construir ese trayecto de vuelta-, y arranca la siguiente ronda.
   No se aceptan comandos de camino mientras ms.transitioning es true
   (ver handleZoroarksCmd).
   --------------------------------------------------------- */
function updateZorTimerUI() {
  const ms = state.modeState;
  if (!ms) return;
  const pct = Math.max(0, (ms.timeLeft / ms.phaseSeconds) * 100) + '%';
  const label = Math.max(0, ms.timeLeft) + 's';
  const fill = $('zor-timer-fill');
  if (fill) fill.style.width = pct;
  const text = $('zor-timer-text');
  if (text) text.textContent = label;
}

function updateZorPhaseHint(text) {
  const hint = $('zor-phase-hint');
  if (hint) hint.textContent = text;
}

/* ---------------------------------------------------------
   CARTELES ANIMADOS DE AVISO DE FASE
   -----------------------------------------------------------
   Los tres carteles -"elige dónde pasar la noche" (ver
   startZoroarksLocationPhase), "vota por un jugador" (ver
   startZoroarksVotingPhase) y "vota si matar o no" (ver
   startZoroarksConfirmationPhase)- comparten el mismo mecanismo de
   entrada/salida a través de zorShowSign/zorHideSign: entran con una
   animación de caída/balanceo al empezar su fase y salen con la
   animación inversa (suben y giran en sentido contrario, en vez de
   simplemente desvanecerse) en cuanto esa fase termina. Ver
   .zor-sign-inner / zorSignDrop / zorSignLift en styles.css. */
function zorShowSign(id) {
  const sign = $(id);
  if (!sign) return;
  // Por si quedara a mitad de la animación de salida de una vez anterior
  // (no debería, pero así siempre se reinicia limpio): se quitan ambas
  // clases y se fuerza un reflow antes de volver a añadir 'show', para
  // que la animación de entrada arranque siempre desde el principio.
  sign.classList.remove('show', 'hiding');
  void sign.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => sign.classList.add('show')));
}

function zorHideSign(id) {
  const sign = $(id);
  if (!sign || !sign.classList.contains('show')) return;
  const inner = sign.querySelector('.zor-sign-inner');
  sign.classList.remove('show');
  sign.classList.add('hiding');
  // zorSignLift (ver styles.css) es quien de verdad "saca" el cartel de la
  // vista subiéndolo y girándolo al revés que en la caída; en cuanto
  // termina esa animación se retira 'hiding', dejándolo listo por si hay
  // que mostrarlo de nuevo más adelante (p.ej. el cartel de votación, que
  // vuelve a aparecer cada día).
  const cleanup = () => sign.classList.remove('hiding');
  if (inner) inner.addEventListener('animationend', cleanup, { once: true });
  else cleanup();
}

function zorShowLocationSign() { zorShowSign('zor-location-sign'); }
function zorHideLocationSign() { zorHideSign('zor-location-sign'); }
function zorShowVotingSign() { zorShowSign('zor-voting-sign'); }
function zorHideVotingSign() { zorHideSign('zor-voting-sign'); }
function zorShowConfirmSign() { zorShowSign('zor-confirm-sign'); }
function zorHideConfirmSign() { zorHideSign('zor-confirm-sign'); }

// Arranca un nuevo día: incrementa el contador y decide la primera
// sub-fase. El primer día de la partida no tiene fase de votación (no
// hay todavía ningún día anterior sobre el que votar) y pasa directo a
// la fase de elección de camino; el resto de días abren con la fase de
// votación de ZOR_VOTE_SECONDS.
function startZoroarksDay() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;

  ms.roundNumber++;
  const roundNumEl = $('zor-round-num');
  if (roundNumEl) roundNumEl.textContent = ms.roundNumber;

  if (ms.roundNumber === 1) {
    startZoroarksLocationPhase();
  } else {
    startZoroarksVotingPhase();
  }
}

function startZoroarksVotingPhase() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;

  ms.subphase = 'voting';
  ms.votes = {};
  ms.phaseSeconds = ZOR_VOTE_SECONDS;
  ms.timeLeft = ZOR_VOTE_SECONDS;
  updateZorTimerUI();
  updateZorPhaseHint('Vota a un jugador escribiendo !vote nombredeusuario');
  renderZoroarksPlayersList();
  zorShowVotingSign();

  zorLog(`🗳️ Día ${ms.roundNumber}: tenéis ${ZOR_VOTE_SECONDS}s para votar a un jugador con !vote nombredeusuario.`);
  addChatMessage(null, `🗳️ Día ${ms.roundNumber}: tenéis ${ZOR_VOTE_SECONDS}s para votar a quién sube al escenario. Escribid !vote nombredeusuario`, 'system');

  clearInterval(ms.roundTimer);
  ms.roundTimer = setInterval(() => {
    ms.timeLeft--;
    updateZorTimerUI();
    if (ms.timeLeft > 0 && ms.timeLeft <= 5) playCountdownBeep(ms.timeLeft);
    if (ms.timeLeft <= 0) {
      clearInterval(ms.roundTimer);
      zorEndVotingPhase();
    }
  }, 1000);
}

function zorEndVotingPhase() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;

  zorHideVotingSign();
  const counts = zorVoteCounts();
  const totalVotes = Object.keys(ms.votes || {}).length;
  let elected = null;
  if (totalVotes === 0) {
    zorLog('🗳️ Nadie ha votado esta ronda.');
  } else {
    let top = [];
    let max = 0;
    ms.order.forEach(u => {
      if (ms.players[u].eliminated) return;
      if (counts[u] > max) { max = counts[u]; top = [u]; }
      else if (counts[u] === max && max > 0) top.push(u);
    });
    if (top.length === 1) {
      elected = top[0];
      zorLog(`🗳️ @${elected} recibe más votos (${max}) y sube al escenario.`);
    } else if (top.length > 1) {
      zorLog(`🗳️ Empate a ${max} votos entre ${top.map(u => '@' + u).join(', ')}. Nadie sube al escenario.`);
    }
  }
  renderZoroarksPlayersList();

  if (elected) {
    startZoroarksConfirmationPhase(elected);
  } else {
    startZoroarksLocationPhase();
  }
}

function startZoroarksConfirmationPhase(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;

  ms.subphase = 'confirmation';
  ms.electedPlayer = user;
  ms.confirmVotes = {};
  ms.phaseSeconds = ZOR_CONFIRM_SECONDS;
  ms.timeLeft = ZOR_CONFIRM_SECONDS;
  updateZorTimerUI();
  zorUpdateConfirmHint();
  renderZoroarksPlayersList();
  zorShowConfirmSign();

  zorLog(`🔥 @${user} es llevado/a al escenario de la plaza.`);
  zorSendToStage(user);

  clearInterval(ms.roundTimer);
  ms.roundTimer = setInterval(() => {
    ms.timeLeft--;
    updateZorTimerUI();
    if (ms.timeLeft > 0 && ms.timeLeft <= 5) playCountdownBeep(ms.timeLeft);
    if (ms.timeLeft <= 0) {
      clearInterval(ms.roundTimer);
      zorEndConfirmationPhase();
    }
  }, 1000);
}

function zorEndConfirmationPhase() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;

  zorHideConfirmSign();
  const user = ms.electedPlayer;
  const counts = zorConfirmVoteCounts();
  ms.electedPlayer = null;
  if (user) zorClearBubbles(user); // no dejar flotando sus mensajes tras bajar del escenario

  // La fase de elección de ubicación nunca arranca en el acto: se espera
  // siempre ZOR_LOCATION_PHASE_DELAY_MS tras el final "real" de la
  // confirmación. Ese final "real" es distinto según lo que haya pasado:
  // si el jugador votado era un lobo, no es el propio final de este
  // temporizador, sino el momento en que su Zoroark revelado ha
  // desaparecido por completo del mapa (ver zorRevealWolfAndDie, que llama
  // a scheduleLocationPhase como su onComplete); si era un jugador normal,
  // tampoco es este instante, sino el momento en que su sprite ha
  // terminado de desvanecerse del todo (ver zorEliminatePlayer, al que
  // aquí se le pasa scheduleLocationPhase como onDone) -así, si esa
  // eliminación deja a un bando sin jugadores vivos, la pantalla final
  // (ver zorCheckGameEnd más abajo) nunca se muestra mientras el jugador
  // eliminado todavía sea visible en el mapa a mitad de desvanecerse-; si
  // se salva, tampoco es este instante, sino el momento en que termina de
  // bajar del escenario y llega de vuelta a su sitio en la plaza (ver
  // zorSendBackFromStage, que igualmente llama a scheduleLocationPhase
  // como onArrive) -si no se esperase a que termine ese trayecto, la fase
  // de ubicación (y su cartel) podían arrancar mientras el jugador salvado
  // seguía todavía caminando de vuelta, ya que ese trayecto puede tardar
  // bastante más que ZOR_LOCATION_PHASE_DELAY_MS según lo lejos que quede
  // su sitio del escenario-; solo si nadie subió al escenario el final
  // "real" es este mismo instante.
  const scheduleLocationPhase = () => {
    if (state.modeState !== ms) return; // la partida pudo pararse/reiniciarse mientras se esperaba
    // Tras cualquier eliminación resuelta en esta fase (aldeano votado y
    // confirmado, o lobo revelado y muerto) comprobamos si alguno de los
    // dos bandos se ha quedado sin jugadores vivos antes de encadenar la
    // fase de elección de camino: si la partida ha terminado,
    // zorCheckGameEnd ya ha mostrado la pantalla final y aquí no hay nada
    // más que hacer.
    if (zorCheckGameEnd()) return;
    clearTimeout(ms.locationPhaseDelayTimeout);
    ms.locationPhaseDelayTimeout = setTimeout(() => {
      startZoroarksLocationPhase();
    }, ZOR_LOCATION_PHASE_DELAY_MS);
    ms.moveTimeouts = ms.moveTimeouts || [];
    ms.moveTimeouts.push(ms.locationPhaseDelayTimeout);
  };

  if (user && counts.si > counts.no) {
    if (ms.wolves.has(user)) {
      zorLog(`🔪 El pueblo decide: ¡SÍ gana (${counts.si} - ${counts.no})! ¡@${user} era un lobo! Su forma se desvanece y revela un Zoroark.`);
      addChatMessage(null, `🔪 El pueblo decide: ¡SÍ gana (${counts.si}-${counts.no})! @${user} ERA un Zoroark disfrazado. 🦊`, 'correct');
      playZorWolfReveal();
      zorRevealWolfAndDie(user, scheduleLocationPhase);
    } else {
      zorLog(`🔪 El pueblo decide: ¡SÍ gana (${counts.si} - ${counts.no})! @${user} queda eliminado/a de la partida.`);
      addChatMessage(null, `🔪 El pueblo decide: ¡SÍ gana (${counts.si}-${counts.no})! @${user} NO era un Zoroark: era inocente y queda eliminado/a igualmente.`, 'wrong');
      playZorEliminated();
      zorEliminatePlayer(user, scheduleLocationPhase);
    }
  } else if (user) {
    zorLog(
      counts.si === counts.no
        ? `❤️ Empate a ${counts.si} votos: @${user} se salva y baja del escenario.`
        : `❤️ El pueblo decide: ¡NO gana (${counts.no} - ${counts.si})! @${user} se salva y baja del escenario.`
    );
    playZorSaved();
    zorSendBackFromStage(user, () => {
      renderZoroarksPlayersList();
      scheduleLocationPhase();
    });
  } else {
    scheduleLocationPhase();
  }

  renderZoroarksPlayersList();
}

function startZoroarksLocationPhase() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;

  ms.subphase = 'location';
  ms.order.forEach(u => { const p = ms.players[u]; if (p) p.roundChoice = null; });
  ms.phaseSeconds = ZOR_ROUND_SECONDS;
  ms.timeLeft = ZOR_ROUND_SECONDS;
  updateZorTimerUI();
  updateZorPhaseHint('Escribe !bosque, !charca, !pueblo o !plaza para elegir dónde ir');
  renderZoroarksPlayersList();
  zorShowLocationSign();

  zorLog(
    ms.roundNumber === 1
      ? `🌙 Día 1: tenéis ${ZOR_ROUND_SECONDS}s para elegir dónde pasar la noche.`
      : `🌅 Tenéis ${ZOR_ROUND_SECONDS}s para elegir dónde pasar la noche.`
  );

  clearInterval(ms.roundTimer);
  ms.roundTimer = setInterval(() => {
    ms.timeLeft--;
    updateZorTimerUI();
    // Mismo aviso sonoro de cuenta atrás que en Pokerus/Voltorb Explosivo
    // en los últimos 5 segundos de la ronda.
    if (ms.timeLeft > 0 && ms.timeLeft <= 5) playCountdownBeep(ms.timeLeft);
    if (ms.timeLeft <= 0) {
      clearInterval(ms.roundTimer);
      zorEndRound();
    }
  }, 1000);
}

// Da por llegado de inmediato a un jugador que todavía estuviera de
// camino cuando se acabó el tiempo de la ronda: el cambio queda oculto
// por el fundido a negro que se muestra justo después, así que no hace
// falta animarlo.
function zorFinalizePendingMove(p) {
  if (!p || !p.moving) return;
  const loc = p.pendingLoc;
  p.location = loc;
  p.pendingLoc = null;
  p.moving = false;
  p.queuedTarget = null;
  if (p.walker) p.walker.stopWalking();
  const target = loc === 'plaza' ? p.plazaSpot : ZOR_PATHS[loc][ZOR_PATHS[loc].length - 1];
  p.x = target.x;
  p.y = target.y;
  const el = $(p.elId);
  if (el) {
    el.style.transition = 'none';
    el.style.left = target.x + '%';
    el.style.top = target.y + '%';
  }
}

function zorEndRound() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  ms.transitioning = true;

  (ms.moveTimeouts || []).forEach(id => clearTimeout(id));
  ms.moveTimeouts = [];
  ms.order.forEach(u => zorFinalizePendingMove(ms.players[u]));
  renderZoroarksPlayersList();

  zorLog('🌙 Cae la noche...');
  zorShowNightTransition();
}

function zorShowNightTransition() {
  const ms = state.modeState;
  const field = $('zor-field-outer');
  if (!ms || !field) return;

  const overlay = document.createElement('div');
  overlay.className = 'zor-night-overlay';
  overlay.id = 'zor-night-overlay';
  // El contenido arranca vacío: los rótulos ("Esta noche" / "han muerto" /
  // "X aldeanos") se rellenan uno a uno más abajo, una vez resueltas las
  // muertes de la noche (ver zorPlayNightMessages), así que aún no se
  // conoce el nº de aldeanos muertos en el momento en que se crea el
  // overlay.
  overlay.innerHTML = '<div class="zor-night-content pixel" id="zor-night-content"></div>';
  field.appendChild(overlay);
  playZorNightFall();
  // Doble rAF para asegurar que el navegador pinta el estado inicial
  // (opacidad 0) antes de añadir la clase que dispara la transición CSS.
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

  clearTimeout(ms.nightTimeout);
  ms.nightTimeout = setTimeout(() => {
    // Ya está completamente a negro: se retira el cartel de "elige dónde
    // pasar la noche" (queda oculto tras el fundido, así que no hace falta
    // que se vea su animación de salida) y se resuelven las muertes de la
    // noche, con la pantalla ya completamente a negro, para que quien
    // resulte eliminado nunca llegue a verse regresando a la plaza (ver
    // zorResolveNightDeaths y el filtro de zorStartNewDay). El nº de
    // aldeanos muertos se muestra a continuación, mensaje a mensaje (ver
    // zorPlayNightMessages); solo al terminar esa secuencia arranca la
    // cuenta atrás final antes del fundido inverso.
    zorHideLocationSign();
    const deaths = zorResolveNightDeaths();
    zorPlayNightMessages(deaths, () => {
      // Si las muertes de esta noche han dejado al pueblo sin ningún
      // aldeano vivo, la partida termina aquí mismo (zorCheckGameEnd ya
      // se encarga de mostrar la pantalla final): no arranca un nuevo día.
      if (zorCheckGameEnd()) return;
      ms.nightTimeout = setTimeout(() => zorStartNewDay(overlay), ZOR_NIGHT_HOLD_MS);
    });
  }, ZOR_NIGHT_FADE_MS);
}

// Muestra, uno a uno y con un breve fundido entre cada uno, los tres
// rótulos del resumen de la noche sobre el fondo ya completamente en
// negro: "Esta noche" -> "han muerto" -> "X aldeanos" (X = deaths, en
// singular si es 1). Cada rótulo se mantiene ZOR_NIGHT_MSG_HOLD_EACH_MS
// del todo visible antes de desvanecerse (ZOR_NIGHT_MSG_FADE_MS) y dar
// paso al siguiente; al terminar el último se llama a onDone (que arranca
// la espera final antes del fundido de vuelta al mapa).
function zorPlayNightMessages(deaths, onDone) {
  const ms = state.modeState;
  const content = $('zor-night-content');
  if (!ms || !content) { onDone(); return; }

  const messages = [
    'Esta noche',
    deaths === 1 ? 'ha muerto' : 'han muerto',
    deaths === 1 ? '1 aldeano' : `${deaths} aldeanos`,
  ];

  let i = 0;
  const showNext = () => {
    if (i >= messages.length) { onDone(); return; }
    content.textContent = messages[i];
    content.classList.remove('zor-night-msg-hide');
    void content.offsetWidth; // fuerza el reflow para que el fundido de entrada se aplique
    content.classList.add('zor-night-msg-show');
    // El sonido de "han muerto X aldeanos" solo suena en el último rótulo
    // de la secuencia (el que muestra la cifra) y solo si ha habido
    // víctimas esta noche; si la noche pasa en calma no suena nada, para
    // reforzar el alivio del mensaje.
    if (i === messages.length - 1 && deaths > 0) playZorNightDeaths();
    i++;
    const holdId = setTimeout(() => {
      if (i >= messages.length) { onDone(); return; }
      content.classList.remove('zor-night-msg-show');
      content.classList.add('zor-night-msg-hide');
      const fadeId = setTimeout(showNext, ZOR_NIGHT_MSG_FADE_MS);
      ms.moveTimeouts.push(fadeId);
    }, ZOR_NIGHT_MSG_HOLD_EACH_MS);
    ms.moveTimeouts.push(holdId);
  };
  showNext();
}

function zorStartNewDay(overlay) {
  const ms = state.modeState;
  if (!ms) return;

  // En el mismo instante en que arranca el fundido inverso (la pantalla
  // empieza a volver a mostrar el mapa), cada jugador que pasó la noche
  // fuera de la plaza emprende el regreso por el mismo camino, a la
  // inversa, que usó para llegar: zorMoveTo ya construye ese trayecto de
  // vuelta punto por punto (ver zorRoutePoints). Cada uno arranca tras su
  // propio retraso aleatorio (ver ZOR_RETURN_STAGGER_MAX_MS más abajo),
  // para no ir todos superpuestos. El día (y su fase de votación, si
  // toca) no arranca hasta que TODOS los sprites hayan llegado de vuelta
  // a la plaza: ms.transitioning sigue en true (bloquea comandos) durante
  // toda esta espera, así que nunca puede empezar la votación con alguien
  // todavía a mitad de camino.
  const returning = ms.order.filter(u => {
    const p = ms.players[u];
    return p && !p.eliminated && p.location !== 'plaza';
  });

  let pending = returning.length;
  const onAllArrived = () => {
    if (state.modeState !== ms) return; // la partida pudo pararse/reiniciarse mientras se esperaba
    ms.transitioning = false;
    startZoroarksDay();
  };

  if (pending === 0) {
    onAllArrived();
  } else {
    // Cada jugador espera su propio retraso aleatorio antes de arrancar el
    // regreso, para que no salgan todos a la vez y se pisen el sprite unos
    // a otros durante todo el trayecto (sobre todo los que vuelven desde
    // el mismo sitio, que recorrerían exactamente el mismo camino).
    returning.forEach(u => {
      const delay = Math.floor(Math.random() * ZOR_RETURN_STAGGER_MAX_MS);
      const staggerId = setTimeout(() => {
        zorMoveTo(u, 'plaza', () => {
          pending--;
          if (pending <= 0) onAllArrived();
        });
      }, delay);
      ms.moveTimeouts.push(staggerId);
    });
  }

  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), ZOR_NIGHT_FADE_MS + 100);
  }
}
