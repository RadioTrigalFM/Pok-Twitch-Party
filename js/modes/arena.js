import { addChatMessage, escapeHtml } from '../chat.js';
import { bossSpriteLockBlockMessage } from '../bossSpriteLocks.js';
import { ARENA_POKEMON_DB } from '../data/arenaPokemonDb.js';
import { getPokemonSprite } from '../data/pokemonDb.js';
import { currentFullscreenElement } from '../fullscreen.js';
import { backToMenu } from '../modeLauncher.js';
import { PMDSprite, PMD_DIR, arenaDirectionFor, pmdHasLocalSprite, pmdPreload } from '../pmdSprite.js';
import { rollShinyPokemon } from '../pokemonShiny.js';
import { state } from '../state.js';
import { $, addScore, renderRanking, showModal } from '../utils.js';
// playVeJoin: mismo sonido de "apuntarse" que usa el lobby de Voltorb
// Explosivo (ver audio.js), reutilizado aquí para cuando un jugador entra
// en la cola del Coliseo.
import {
  playVeJoin, playArenaFaint, playArenaBattleWin, playArenaTournamentMatchWin,
  playArenaRoundStart, playArenaTournamentChampion,
  playArenaHit, playArenaCrit, playArenaDodge,
} from '../audio.js';

/* =========================================================
   ARENA MODE — COLISEO POKÉMON
   Los jugadores hacen cola fuera del coliseo (!pokemon <nombre>).
   El primero en llegar sube como campeón y espera retador; cada
   nuevo jugador en cola reta al campeón. El ganador se queda en
   el coliseo como campeón para el siguiente combate.
   Todos los Pokémon comparten las mismas estadísticas de combate
   (vida, daño, velocidad de ataque); lo único que cambia es el
   tipo de su ataque principal (el tipo primario del Pokémon),
   sujeto a la tabla de tipos oficial.
   ========================================================= */

// Estadísticas de combate idénticas para todos los Pokémon del Coliseo
const ARENA_BASE_STATS = {
  hp: 120,
  atk: 22,          // daño base del ataque normal
  critChance: 0.10,
  dodgeChance: 0.10,
};

// Los combates del Coliseo son automáticos: cada este intervalo (ms) el
// Pokémon al que le toca turno ataca por sí solo, sin que el chat tenga
// que escribir ningún comando de ataque.
const ARENA_TURN_MS = 1600;

// Número máximo de jugadores que pueden esperar en la cola del Coliseo a la vez.
const ARENA_MAX_QUEUE = 16;

// Retraso (ms) entre el inicio de la animación de ataque y el momento en que
// el golpe "conecta" de verdad: hasta que pasa este tiempo no se aplican el
// daño ni la bajada de vida, ni se reproduce la animación de Hurt del rival,
// para que no se vea el efecto del golpe antes de que el Pokémon esté
// realmente atacando.
const ARENA_HIT_DELAY_MS = 500;

// Multiplicador de velocidad de las animaciones PMD (Walk/Attack/Hurt) de
// los Pokémon que están en el coliseo del modo Arena: al valer 2, cada
// frame dura el doble, así que la animación se reproduce al doble de lenta.
const ARENA_ANIM_SPEED = 2;

// Duración (ms) del desvanecimiento del Pokémon derrotado en el coliseo:
// debe desaparecer poco a poco mientras se reproduce su animación de Hurt.
const ARENA_FAINT_FADE_MS = 1300;

/* =========================================================
   TORNEO DEL COLISEO (eliminatoria directa entre viewers)
   -----------------------------------------------------------
   El streamer pulsa el botón "Torneo" (bajo Auto/Reingreso), confirma en
   un mensaje, y se abre una pantalla de inscripción donde el chat se
   apunta con !torneo (mínimo TOURNAMENT_MIN_PLAYERS). Al pulsar "Comenzar
   Torneo" se genera un cuadro de eliminatorias aleatorio y, ronda a ronda,
   se van anunciando y disputando los combates (reutilizando el mismo
   motor de combate 1vs1 del Coliseo normal) hasta proclamar un campeón.
   Mientras el torneo está activo, la cola normal del Coliseo queda en
   pausa (ver los guardas "ms.tournament" en updateAdvanceQueueUI y
   advanceQueueManually) y el botón de Reingreso se sustituye por uno de
   "Eliminatorias" que reabre el cuadro generado.
   ========================================================= */
const TOURNAMENT_MIN_PLAYERS = 4;
const TOURNAMENT_MAX_PLAYERS = 32;
const TOURNAMENT_MATCH_BANNER_MS = 3000;   // cuánto se muestra el anuncio "fulano vs mengano" antes de empezar el combate
const TOURNAMENT_WINNER_BANNER_MS = 2600;  // cuánto se muestra el anuncio del ganador de cada combate
const TOURNAMENT_ROUND_BANNER_MS = 2600;   // cuánto se muestra el anuncio de la nueva ronda (cuartos, semis...)
const TOURNAMENT_BRACKET_AUTOSTART_MS = 5000; // tras generarse el cuadro, tiempo antes de arrancar los combates si el streamer no pulsa el botón
const TOURNAMENT_BRACKET_UPDATE_MS = 3500; // cuánto se muestra el cuadro actualizado al terminar todos los combates de una fase

// Tabla de tipos (multiplicador de daño), igual que en los juegos principales.
// TYPE_CHART[tipoAtacante][tipoDefensor] = multiplicador. Si no aparece, es x1.
// Tabla completa (incluye Bicho, Acero, Siniestro y Hada), necesaria ahora que
// el Coliseo incluye Pokémon de todas las generaciones.
const TYPE_CHART = {
  'Normal':    { 'Roca': 0.5, 'Fantasma': 0, 'Acero': 0.5 },
  'Fuego':     { 'Planta': 2, 'Hielo': 2, 'Bicho': 2, 'Acero': 2, 'Fuego': 0.5, 'Agua': 0.5, 'Roca': 0.5, 'Dragón': 0.5 },
  'Agua':      { 'Fuego': 2, 'Tierra': 2, 'Roca': 2, 'Agua': 0.5, 'Planta': 0.5, 'Dragón': 0.5 },
  'Eléctrico': { 'Agua': 2, 'Volador': 2, 'Eléctrico': 0.5, 'Planta': 0.5, 'Dragón': 0.5, 'Tierra': 0 },
  'Planta':    { 'Agua': 2, 'Tierra': 2, 'Roca': 2, 'Fuego': 0.5, 'Planta': 0.5, 'Veneno': 0.5, 'Volador': 0.5, 'Bicho': 0.5, 'Dragón': 0.5, 'Acero': 0.5 },
  'Hielo':     { 'Planta': 2, 'Tierra': 2, 'Volador': 2, 'Dragón': 2, 'Fuego': 0.5, 'Agua': 0.5, 'Hielo': 0.5, 'Acero': 0.5 },
  'Lucha':     { 'Normal': 2, 'Hielo': 2, 'Roca': 2, 'Siniestro': 2, 'Acero': 2, 'Veneno': 0.5, 'Volador': 0.5, 'Psíquico': 0.5, 'Bicho': 0.5, 'Hada': 0.5, 'Fantasma': 0 },
  'Veneno':    { 'Planta': 2, 'Hada': 2, 'Veneno': 0.5, 'Tierra': 0.5, 'Roca': 0.5, 'Fantasma': 0.5, 'Acero': 0 },
  'Tierra':    { 'Fuego': 2, 'Eléctrico': 2, 'Veneno': 2, 'Roca': 2, 'Acero': 2, 'Planta': 0.5, 'Bicho': 0.5, 'Volador': 0 },
  'Volador':   { 'Planta': 2, 'Lucha': 2, 'Bicho': 2, 'Eléctrico': 0.5, 'Roca': 0.5, 'Acero': 0.5 },
  'Psíquico':  { 'Lucha': 2, 'Veneno': 2, 'Psíquico': 0.5, 'Acero': 0.5, 'Siniestro': 0 },
  'Bicho':     { 'Planta': 2, 'Psíquico': 2, 'Siniestro': 2, 'Fuego': 0.5, 'Lucha': 0.5, 'Veneno': 0.5, 'Volador': 0.5, 'Fantasma': 0.5, 'Acero': 0.5, 'Hada': 0.5 },
  'Roca':      { 'Fuego': 2, 'Hielo': 2, 'Volador': 2, 'Bicho': 2, 'Lucha': 0.5, 'Tierra': 0.5, 'Acero': 0.5 },
  'Fantasma':  { 'Psíquico': 2, 'Fantasma': 2, 'Siniestro': 0.5, 'Normal': 0 },
  'Dragón':    { 'Dragón': 2, 'Acero': 0.5, 'Hada': 0 },
  'Siniestro': { 'Psíquico': 2, 'Fantasma': 2, 'Lucha': 0.5, 'Siniestro': 0.5, 'Hada': 0.5 },
  'Acero':     { 'Hielo': 2, 'Roca': 2, 'Hada': 2, 'Fuego': 0.5, 'Agua': 0.5, 'Eléctrico': 0.5, 'Acero': 0.5 },
  'Hada':      { 'Lucha': 2, 'Dragón': 2, 'Siniestro': 2, 'Fuego': 0.5, 'Veneno': 0.5, 'Acero': 0.5 },
};

// Devuelve el multiplicador total de daño de un tipo de ataque contra los
// (uno o dos) tipos de un Pokémon defensor.
function arenaTypeMultiplier(moveType, defenderTypes) {
  let mult = 1;
  const table = TYPE_CHART[moveType];
  if (table) {
    defenderTypes.forEach(defType => {
      if (table[defType] !== undefined) mult *= table[defType];
    });
  }
  return mult;
}

function makeArenaFighter(user, pokemon, attackTypeIndex = 0) {
  return {
    user,
    pokemon,
    hp: ARENA_BASE_STATS.hp,
    maxHp: ARENA_BASE_STATS.hp,
    // Tipo de ataque elegido con !habilidad1/!habilidad2 (ver
    // handleArenaAbility) mientras esperaba en la cola o como campeón:
    // 0 = tipo primario, 1 = tipo secundario. Se hereda aquí para que la
    // elección hecha antes de entrar al coliseo no se pierda.
    attackTypeIndex,
  };
}

export function startArena() {
  state.modeState = {
    queue: [],       // [{user, pokemon, qid, attackTypeIndex}] esperando fuera del coliseo (caminando hacia su puesto)
    queueDom: {},    // qid -> { el, sprite: PMDSprite } — caminantes PMD de la cola en pantalla
    queueIdSeq: 0,   // contador para asignar un qid único a cada entrada de la cola
    champion: null,  // {user, pokemon, hp, maxHp, attackTypeIndex} — quien reina en el coliseo
    currentBattle: null, // {left, right, turn} cuando hay combate activo (left = campeón, right = retador)
    arenaSprites: null, // { left: PMDSprite, right: PMDSprite|null }
    tickInterval: null, // intervalo que hace que los combates avancen solos
    autoAdvance: false,      // si el streamer activa el avance automático de la cola
    autoAdvanceTimeout: null, // temporizador pendiente del próximo avance automático
    queueAdvancing: false,   // true mientras el puesto #1 está "en tránsito" hacia el coliseo
                             // (evita que se dispare un segundo avance antes de que el primero
                             // haya terminado de entrar; ver advanceQueueManually).
    champWaitTimeout: null, // temporizador pendiente que muestra al campeón esperando tras ganar
    defeatedUsers: new Set(), // usuarios que ya han perdido un combate en este Coliseo
    allowRejoin: false,       // si el streamer permite que los derrotados vuelvan a hacer cola
    expelPopoverQid: null,    // qid del puesto de cola cuyo popover "Expulsar" está abierto
    expelPopoverEl: null,     // elemento del popover "Expulsar" actualmente abierto
    queueHeightOverrideFrac: loadQueueHeightOverride(), // 0..1 (fracción de la altura de la escena, ya fijada de una calibración anterior) o null si se usa DEFAULT_QUEUE_HEIGHT_FRAC
    tournament: null, // objeto del Torneo (ver TOURNAMENT_* más arriba) mientras está activo, null si no hay ninguno en marcha
  };
  renderArena();
  state.modeState.tickInterval = setInterval(arenaAutoTick, ARENA_TURN_MS);
  addChatMessage(null, `🏛️ ¡Coliseo abierto! Escribe !pokemon [nombre] para hacer cola. ¡Disponible toda la Pokédex Nacional (${ARENA_POKEMON_DB.length} Pokémon)!`, 'system');
}

function renderArena() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="arena-wrap">
      <div class="arena-banner">
        <span class="arena-banner-title pixel">🏛️ Coliseo Pokémon</span>
        <span class="arena-banner-live"><span class="live-dot"></span>En vivo</span>
      </div>
      <div class="coliseum-scene game-scene" id="battle-scene">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <div class="arena-queue-track" id="arena-queue-track"></div>
        <div class="arena-toggles-wrap">
          <button class="auto-advance-toggle" id="auto-advance-toggle" title="Alternar avance automático de la cola">🤖 Auto: OFF</button>
          <button class="auto-advance-toggle" id="allow-rejoin-toggle" title="Permitir que los derrotados vuelvan a hacer cola">🔁 Reingreso: OFF</button>
          <button class="auto-advance-toggle" id="tournament-toggle" title="Organizar un torneo de eliminación directa">🏆 Torneo</button>
        </div>
        <div class="queue-advance-wrap" id="queue-advance-wrap"></div>
        <div class="fighter left" id="fighter-left" style="display:none;">
          <div class="fighter-info">
            <div class="fighter-user" id="fl-user">@user</div>
            <div class="hp-bar"><div class="hp-bar-fill" id="fl-hp-bar" style="width:100%"></div></div>
            <div class="fighter-hp" id="fl-hp">HP</div>
          </div>
          <div class="pmd-slot" id="fl-sprite"></div>
        </div>
        <div class="fighter right" id="fighter-right" style="display:none;">
          <div class="fighter-info">
            <div class="fighter-user" id="fr-user">@user</div>
            <div class="hp-bar"><div class="hp-bar-fill" id="fr-hp-bar" style="width:100%"></div></div>
            <div class="fighter-hp" id="fr-hp">HP</div>
          </div>
          <div class="pmd-slot" id="fr-sprite"></div>
        </div>
        <div class="arena-status-sign" id="battle-status">
          <div class="zor-sign-board">
            <div class="zor-sign-title pixel">Participa escribiendo en el chat el comando:</div>
            <div class="zor-sign-cmds">
              <span>!pokemon pikachu</span><span>!pokemon greninja</span>
            </div>
            <div class="arena-status-note">puedes elegir cualquier pokemon</div>
          </div>
        </div>
        <div class="arena-ability-sign" id="arena-ability-sign">
          <div class="zor-sign-board">
            <div class="zor-sign-title pixel">Cambia el tipo de tu ataque con:</div>
            <div class="zor-sign-cmds">
              <span>!habilidad1</span><span>!habilidad2</span>
            </div>
            <div class="arena-status-note">solo si tu pokemon tiene dos tipos</div>
          </div>
        </div>
      </div>
      <div class="arena-stats-row">
        <div class="battle-log" id="battle-log">
          <div class="battle-log-title">📜 Registro de Combate</div>
          <p style="color:var(--muted);font-style:italic;">Esperando el primer combate...</p>
        </div>
        <div class="ranking-panel" id="arena-ranking"></div>
      </div>
    </div>
  `;
  renderRanking($('arena-ranking'));
  renderAutoAdvanceToggle();
  $('auto-advance-toggle').onclick = toggleAutoAdvance;
  renderAllowRejoinToggle();
  $('allow-rejoin-toggle').onclick = onReingresoOrBracketButtonClick;
  renderTournamentToggle();
  $('tournament-toggle').onclick = handleTournamentButtonClick;
  renderArenaQueue();
}

// Alterna el modo de avance de la cola entre manual (por defecto, el
// streamer pulsa el botón) y automático (la cola avanza sola en cuanto
// el coliseo queda libre, sin intervención).
function toggleAutoAdvance() {
  const ms = state.modeState;
  if (!ms) return;
  ms.autoAdvance = !ms.autoAdvance;
  renderAutoAdvanceToggle();
  addChatMessage(null, ms.autoAdvance
    ? '🤖 Avance automático de la cola ACTIVADO'
    : '✋ Avance automático de la cola DESACTIVADO (manual)', 'system', { mirror: false });
  updateAdvanceQueueUI();
}

function renderAutoAdvanceToggle() {
  const ms = state.modeState;
  const btn = $('auto-advance-toggle');
  if (!btn || !ms) return;
  btn.textContent = ms.autoAdvance ? '🤖 Auto: ON' : '🤖 Auto: OFF';
  btn.classList.toggle('is-on', !!ms.autoAdvance);
}

// Alterna si un usuario que ya perdió un combate en este Coliseo puede
// volver a hacer cola escribiendo !pokemon de nuevo. Por defecto está
// desactivado: los derrotados quedan fuera hasta que el streamer lo permita.
function toggleAllowRejoin() {
  const ms = state.modeState;
  if (!ms) return;
  ms.allowRejoin = !ms.allowRejoin;
  renderAllowRejoinToggle();
  addChatMessage(null, ms.allowRejoin
    ? '🔁 Reingreso de derrotados PERMITIDO: quien pierda podrá volver a hacer cola'
    : '🚫 Reingreso de derrotados BLOQUEADO: quien pierda ya no podrá volver a hacer cola', 'system', { mirror: false });
}

function renderAllowRejoinToggle() {
  const ms = state.modeState;
  const btn = $('allow-rejoin-toggle');
  if (!btn || !ms) return;
  // Mientras hay un Torneo activo (desde que se abre la inscripción hasta
  // que el streamer vuelve a la Arena Infinita), este botón deja de ser el
  // interruptor de Reingreso y pasa a abrir el cuadro de eliminatorias del
  // Torneo (ver onReingresoOrBracketButtonClick). Solo se puede pulsar una
  // vez que el cuadro ya se ha generado (fase 'bracket'/'battle'/'finished').
  if (ms.tournament) {
    btn.textContent = '🏆 Eliminatorias';
    btn.classList.remove('is-on');
    btn.disabled = !(ms.tournament.bracket && ms.tournament.bracket.length);
    btn.title = 'Ver el cuadro de eliminatorias del Torneo';
    return;
  }
  btn.disabled = false;
  btn.title = 'Permitir que los derrotados vuelvan a hacer cola';
  btn.textContent = ms.allowRejoin ? '🔁 Reingreso: ON' : '🔁 Reingreso: OFF';
  btn.classList.toggle('is-on', !!ms.allowRejoin);
}

// Manejador fijo del botón que alterna entre "Reingreso" (fuera de
// torneo) y "Eliminatorias" (durante un torneo); qué hace se decide en el
// momento del clic según el estado actual, para no tener que reasignar
// onclick cada vez que cambia la fase del torneo (ver renderAllowRejoinToggle).
function onReingresoOrBracketButtonClick() {
  const ms = state.modeState;
  if (!ms) return;
  if (ms.tournament) {
    if (ms.tournament.bracket && ms.tournament.bracket.length) openTournamentBracketOverlay(true);
    return;
  }
  toggleAllowRejoin();
}

// Habilita/deshabilita y actualiza el texto del botón "Torneo": se
// deshabilita mientras ya hay un torneo en marcha (desde la inscripción
// hasta que el streamer vuelve a la Arena Infinita), para no poder abrir
// dos flujos de torneo a la vez.
function renderTournamentToggle() {
  const ms = state.modeState;
  const btn = $('tournament-toggle');
  if (!btn || !ms) return;
  btn.disabled = !!ms.tournament;
  btn.textContent = ms.tournament ? '🏆 Torneo en curso' : '🏆 Torneo';
}

// ---- Geometría de la cola de espera ----
// El puesto #1 (índice 0) es el más cercano al borde derecho de la escena:
// es el siguiente en avanzar hacia el coliseo. Los demás puestos se colocan
// a su izquierda, uno tras otro, según su posición en la cola.
// Los sprites de la cola ocupan 168px (el doble de los 84px de antes, a
// petición del streamer para que se vean más grandes; ver
// .queue-walker .pmd-slot.pmd-mini en styles.css).
// QUEUE_SLOT_GAP: separación horizontal entre puestos consecutivos. A
// petición del streamer se ha reducido a la mitad (de 168 a 84) para que la
// cola se vea más compacta; como el sprite mide 168px, los contenedores
// contiguos se solapan ligeramente, pero al ir centrado el dibujo del
// Pokémon dentro de un contenedor mucho más ancho que su silueta real, no
// se nota un solape del propio sprite.
const QUEUE_SLOT_GAP = 84;     // separación horizontal entre puestos de la cola
// QUEUE_RIGHT_MARGIN: distancia desde el borde derecho de la escena hasta
// el borde derecho (no el izquierdo) del puesto #1. Como el posicionamiento
// usa `left` (borde IZQUIERDO del contenedor de 168px), hay que restar el
// ancho completo del sprite para que el puesto #1 quede entero dentro de la
// pantalla en vez de cortado por el borde: left = anchoEscena - margen.
// Con margen = 174 el borde derecho del sprite queda a 6px del borde de la
// escena (174 - 168 = 6), igual que quedaba con el tamaño de sprite
// anterior (84px) y el margen de entonces (90px: 90 - 84 = 6).
const QUEUE_RIGHT_MARGIN = 174; // distancia del borde derecho del puesto #1 al borde derecho de la escena
const QUEUE_ENTRY_LEFT = -84;  // punto de partida: fuera de pantalla, esquina superior izquierda
const QUEUE_ENTRY_TOP = -84;
const QUEUE_EXIT_MARGIN = 160; // cuánto se aleja el puesto #1 al salir por la derecha

// ---- Altura a la que camina la cola ----
// La cola camina centrada en la franja horizontal marrón que hay en la
// parte superior de assets/arena/coliseum_bg.jpg. Esa franja ocupa los
// primeros 73px de los 768px de alto de la imagen original (comprobado
// muestreando la imagen: es un color plano hasta y=73, donde empieza la
// textura del graderío), así que su centro vertical está en 36.5/768 ≈
// 4.75% de la altura de la imagen. Como el fondo se pinta con
// background-size:cover y esta imagen es más ancha que cualquier tamaño de
// escena razonable (1376x768, ratio ~1.79:1), el recorte de "cover" siempre
// ocurre en horizontal (centrado) y la imagen ocupa el alto completo de la
// escena sin recortar verticalmente: por eso ese 4.75% de la imagen
// corresponde exactamente al 4.75% de la altura de la escena, sea cual sea
// su tamaño. El valor anterior (2.6%) estaba mal calibrado: colocaba el
// centro de la cola demasiado cerca del borde superior, así que gran parte
// del sprite (sobre todo con el tamaño anterior de 140px) quedaba recortada
// por encima de la propia escena en vez de dentro de la franja.
//
// QUEUE_SPRITE_TOP_OFFSET: distancia (en px) desde ese centro de la franja
// hasta el "top" del contenedor .queue-walker. Con el tamaño de sprite
// anterior (84px) esto era simplemente la mitad de su altura (42px), es
// decir, el sprite quedaba centrado en la franja. Ahora que el sprite mide
// 168px pero el espacio extra debe crecer hacia ARRIBA -sin que la parte
// inferior del sprite (ni la etiqueta de nombre, que va debajo) baje de la
// posición que ya tenían-, el offset ya no es la mitad de la altura nueva:
// se mantiene el mismo punto inferior de antes (centro + 42) y se resta la
// altura nueva completa (168) para obtener el nuevo "top": centro + 42 -
// 168 = centro - 126.
const QUEUE_SPRITE_TOP_OFFSET = 126;
const DEFAULT_QUEUE_HEIGHT_FRAC = 0.0475; // 4.75%, centro real de la franja marrón (36.5/768)

// ---- Altura de la cola ya fijada manualmente (si la hay) ----
// En su día el streamer pudo fijar a mano la altura exacta de la cola en
// pantalla completa (que es como lo ve la audiencia en el stream); ese
// valor se guardó como fracción (0..1) de la altura de la escena en ese
// momento, no en píxeles absolutos, para que siguiera siendo válido aunque
// cambiara el tamaño de la ventana entre sesiones. Esa altura fijada se
// mantiene y se sigue usando aquí; ya no hay forma de volver a ajustarla
// desde la interfaz.
const ARENA_QUEUE_HEIGHT_STORAGE_KEY = 'pokekukoro_arena_queue_height_frac';

function loadQueueHeightOverride() {
  try {
    const raw = localStorage.getItem(ARENA_QUEUE_HEIGHT_STORAGE_KEY);
    const frac = raw === null ? NaN : parseFloat(raw);
    return Number.isFinite(frac) ? Math.min(1, Math.max(0, frac)) : null;
  } catch (err) {
    return null; // localStorage puede no estar disponible (p.ej. en algunos navegadores embebidos)
  }
}

function queueSceneWidth() {
  const scene = $('battle-scene');
  return scene ? scene.clientWidth : 900;
}

function queueSceneHeight() {
  const scene = $('battle-scene');
  return scene ? scene.clientHeight : 380;
}

// Devuelve el "top" (en px, relativo a la escena) al que hay que colocar el
// sprite de la cola para que quede centrado verticalmente en la franja
// marrón, sea cual sea el tamaño actual de la escena. La fracción usada es
// la calibrada a mano por el streamer (queueHeightOverrideFrac) o, si no
// hay ninguna guardada, el valor de fábrica DEFAULT_QUEUE_HEIGHT_FRAC.
function queueBandTop() {
  const ms = state.modeState;
  const frac = (ms && ms.queueHeightOverrideFrac != null) ? ms.queueHeightOverrideFrac : DEFAULT_QUEUE_HEIGHT_FRAC;
  return queueSceneHeight() * frac - QUEUE_SPRITE_TOP_OFFSET;
}

function queueSlotPosition(index) {
  return { left: queueSceneWidth() - QUEUE_RIGHT_MARGIN - index * QUEUE_SLOT_GAP, top: queueBandTop() };
}

// La cola de espera solo tiene sentido mostrarla en pantalla completa (que
// es como la ve la audiencia en el stream, ya con la altura fijada). Fuera
// de pantalla completa la franja marrón del
// coliseo no está en la misma posición relativa, así que los Pokémon de la
// cola se ven "flotando" fuera de sitio; se oculta la cola entera en ese
// caso en vez de mostrarla mal colocada.
function isArenaSceneFullscreen() {
  const scene = $('battle-scene');
  return !!scene && (currentFullscreenElement() === scene || scene.classList.contains('fs-fallback'));
}

// Sincroniza la cola de datos (ms.queue) con sus elementos PMD animados en
// pantalla: crea los que faltan (entrando caminando desde la esquina superior
// izquierda de la escena) y reposiciona los existentes hacia su nuevo puesto
// (esto es lo que produce el efecto de "avance de la cola"). También
// muestra u oculta la cola entera según si la escena está en pantalla
// completa (ver isArenaSceneFullscreen).
function renderArenaQueue() {
  const track = $('arena-queue-track');
  const ms = state.modeState;
  if (!track || !ms) return;
  track.style.display = isArenaSceneFullscreen() ? '' : 'none';
  if (!ms.queueDom) ms.queueDom = {};
  if (ms.queueIdSeq == null) ms.queueIdSeq = 0;

  const seenIds = new Set();
  ms.queue.forEach((entry, index) => {
    if (entry.qid == null) entry.qid = ++ms.queueIdSeq;
    seenIds.add(entry.qid);
    const { left, top } = queueSlotPosition(index);
    let dom = ms.queueDom[entry.qid];
    if (!dom) {
      // Pokémon nuevo en la cola: aparece en la esquina superior izquierda
      // de la escena y camina (animación PMD "Walk") hasta su puesto.
      const el = document.createElement('div');
      el.className = 'queue-walker';
      el.style.left = QUEUE_ENTRY_LEFT + 'px';
      el.style.top = QUEUE_ENTRY_TOP + 'px';
      el.title = 'Clic para expulsar de la cola';
      const spriteId = 'qw-sprite-' + entry.qid;
      el.innerHTML = `
        <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
        <div class="queue-walker-tag">
          <span class="queue-pos">#${index + 1}</span>
          <span class="queue-user">@${entry.user}</span>
        </div>
      `;
      // El streamer puede hacer clic en cualquier Pokémon de la cola para
      // que aparezca un pequeño botón "Expulsar" encima de su cabeza.
      const qid = entry.qid;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleExpelPopover(qid, el);
      });
      track.appendChild(el);
      const sprite = new PMDSprite($(spriteId), getPokemonSprite(entry.pokemon.sprite));
      sprite.setDex(entry.pokemon.sprite, entry.pokemon.isShiny);
      // Velocidad reducida (x2.4): en la cola caminan tranquilos, no al
      // ritmo con el que se mueven dentro del combate.
      sprite.play('Walk', PMD_DIR.downRight, true, null, 2.4);
      dom = { el, sprite };
      ms.queueDom[entry.qid] = dom;
      // Fuerza el estilo inicial antes de animar la transición a su puesto
      void el.offsetWidth;
      requestAnimationFrame(() => {
        el.style.left = left + 'px';
        el.style.top = top + 'px';
      });
    } else {
      // Ya estaba en la cola: avanza (con transición) hasta su nuevo puesto
      dom.el.style.left = left + 'px';
      dom.el.style.top = top + 'px';
    }
    const posEl = dom.el.querySelector('.queue-pos');
    if (posEl) posEl.textContent = '#' + (index + 1);
  });

  // Limpia caminantes que ya no están en la cola de datos (por seguridad;
  // la salida del puesto #1 al avanzar se gestiona aparte, en advanceQueueManually).
  Object.keys(ms.queueDom).forEach(qidStr => {
    const qid = Number(qidStr);
    if (!seenIds.has(qid)) {
      ms.queueDom[qid].sprite.destroy();
      ms.queueDom[qid].el.remove();
      delete ms.queueDom[qid];
    }
  });

  updateAdvanceQueueUI();
}

// Abre (o cierra, si ya estaba abierto para el mismo puesto) el popover con
// el botón "Expulsar" sobre la cabeza del Pokémon de la cola en el que el
// streamer ha hecho clic. Solo puede haber un popover abierto a la vez.
function toggleExpelPopover(qid, el) {
  const ms = state.modeState;
  if (!ms) return;
  if (ms.expelPopoverQid === qid) {
    closeExpelPopover();
    return;
  }
  closeExpelPopover();
  const pop = document.createElement('div');
  pop.className = 'queue-expel-popover';
  pop.innerHTML = `<button type="button" class="queue-expel-btn">Expulsar</button>`;
  pop.querySelector('.queue-expel-btn').onclick = (ev) => {
    ev.stopPropagation();
    expelFromQueue(qid);
  };
  el.appendChild(pop);
  ms.expelPopoverQid = qid;
  ms.expelPopoverEl = pop;
}

export function closeExpelPopover() {
  const ms = state.modeState;
  if (!ms) return;
  if (ms.expelPopoverEl) ms.expelPopoverEl.remove();
  ms.expelPopoverEl = null;
  ms.expelPopoverQid = null;
}

// Saca a un usuario de la cola de espera (acción del streamer, no del
// propio usuario): se retira de los datos de la cola, se destruye su
// caminante PMD y el resto de la cola se recoloca un puesto hacia delante.
function expelFromQueue(qid) {
  const ms = state.modeState;
  if (!ms) return;
  closeExpelPopover();
  const idx = ms.queue.findIndex(q => q.qid === qid);
  if (idx === -1) return;
  const [removed] = ms.queue.splice(idx, 1);
  const dom = ms.queueDom[qid];
  if (dom) {
    dom.sprite.destroy();
    dom.el.remove();
    delete ms.queueDom[qid];
  }
  addChatMessage(null, `🚫 @${removed.user} ha sido expulsado de la cola por el streamer`, 'system', { mirror: false });
  renderArenaQueue();
}

// Muestra u oculta el botón que permite avanzar la cola manualmente. Solo
// tiene sentido cuando no hay combate en curso y hay algún Pokémon esperando.
function updateAdvanceQueueUI() {
  const ms = state.modeState;
  const wrap = $('queue-advance-wrap');
  if (!wrap || !ms) return;
  // Mientras hay un Torneo activo la cola normal del Coliseo queda
  // congelada por completo (ni botón manual ni avance automático): el
  // torneo tiene el control exclusivo del coliseo hasta que el streamer
  // vuelva a la Arena Infinita (ver endTournamentReturnToArena).
  if (ms.tournament) {
    if (ms.autoAdvanceTimeout) { clearTimeout(ms.autoAdvanceTimeout); ms.autoAdvanceTimeout = null; }
    // Mientras se espera a que el streamer pulse "Siguiente Combate" (ver
    // proceedAfterTournamentMatch) no se debe pisar ese botón, salvo que
    // justo en ese momento se active el Modo Auto: entonces se limpia el
    // hueco y el torneo continúa solo, sin esperar el clic.
    if (ms.tournament.awaitingNextMatch) {
      if (ms.autoAdvance) {
        ms.tournament.awaitingNextMatch = false;
        wrap.innerHTML = '';
        advanceTournament();
      }
      return;
    }
    wrap.innerHTML = '';
    return;
  }
  // Mientras el puesto #1 está en tránsito (queueAdvancing) no se puede
  // avanzar de nuevo, aunque currentBattle ya esté a null en ese instante:
  // si no, el modo automático dispararía un segundo avance antes de que el
  // primer Pokémon llegara siquiera al coliseo.
  const canAdvance = !ms.currentBattle && !ms.queueAdvancing && ms.queue.length > 0;
  if (!canAdvance) {
    if (ms.autoAdvanceTimeout) { clearTimeout(ms.autoAdvanceTimeout); ms.autoAdvanceTimeout = null; }
    wrap.innerHTML = '';
    return;
  }
  if (ms.autoAdvance) {
    // Modo automático: no se muestra botón, la cola avanza sola.
    wrap.innerHTML = `<div class="queue-auto-note">🤖 Avance automático en curso...</div>`;
    if (!ms.autoAdvanceTimeout) {
      ms.autoAdvanceTimeout = setTimeout(() => {
        const cur = state.modeState;
        if (cur) cur.autoAdvanceTimeout = null;
        if (cur && cur.autoAdvance && !cur.currentBattle && cur.queue.length) advanceQueueManually();
      }, 900);
    }
    return;
  }
  const label = ms.champion ? '▶ Avanzar cola (entra retador)' : '▶ Avanzar cola (entra campeón)';
  wrap.innerHTML = `<button class="advance-queue-btn" id="advance-queue-btn">${label}</button>`;
  $('advance-queue-btn').onclick = advanceQueueManually;
}

// Avanza la cola una posición de forma MANUAL (no ocurre automáticamente).
// El Pokémon del puesto #1 sale caminando por el borde derecho de la
// pantalla y, un segundo después, reaparece a la altura del coliseo
// (como campeón, si estaba vacío, o como retador) con su sprite a tamaño
// original. El resto de la cola avanza una posición con su animación.
function advanceQueueManually() {
  const ms = state.modeState;
  if (!ms || ms.currentBattle || ms.queueAdvancing || !ms.queue.length || ms.tournament) return;

  if (ms.autoAdvanceTimeout) { clearTimeout(ms.autoAdvanceTimeout); ms.autoAdvanceTimeout = null; }

  // Se marca la cola como "en tránsito" hasta que el Pokémon que sale
  // termine de llegar al coliseo (enterColiseumFromQueue). Así, aunque
  // currentBattle sea null durante ese tránsito, no se dispara un segundo
  // avance automático por encima del primero.
  ms.queueAdvancing = true;

  const btn = $('advance-queue-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Avanzando...'; }

  const leaving = ms.queue.shift();
  const leavingDom = ms.queueDom[leaving.qid];
  delete ms.queueDom[leaving.qid]; // gestionamos su salida aparte

  renderArenaQueue(); // el resto de la cola avanza una posición hacia la derecha
  const wrap = $('queue-advance-wrap');
  if (wrap) wrap.innerHTML = '';

  if (leavingDom) {
    leavingDom.el.style.left = (queueSceneWidth() + QUEUE_EXIT_MARGIN) + 'px';
    setTimeout(() => {
      leavingDom.sprite.destroy();
      leavingDom.el.remove();
    }, 650);
  }

  setTimeout(() => {
    if (!state.modeState) return; // el modo pudo cerrarse mientras tanto
    enterColiseumFromQueue(leaving);
  }, 1000);
}

// El Pokémon que salió de la cola reaparece a la altura correcta del
// coliseo, con el sprite a tamaño original (los sprites de la cola están
// al 50%). Si el coliseo estaba vacío, sube como campeón; si no, reta al
// campeón actual y comienza el combate.
function enterColiseumFromQueue(leaving) {
  const ms = state.modeState;
  if (!ms) return;
  // El tránsito termina aquí: el Pokémon ya ha llegado al coliseo (como
  // campeón o como retador), así que ya se puede evaluar un nuevo avance.
  ms.queueAdvancing = false;
  if (!ms.champion) {
    ms.champion = makeArenaFighter(leaving.user, leaving.pokemon, leaving.attackTypeIndex || 0);
    addChatMessage(null, `👑 ${leaving.user} (${leaving.pokemon.name}) sube al coliseo como campeón. ¡Avanza la cola para retarlo!`, 'system', { mirror: false });
    showChampionWaiting();
  } else {
    const challenger = makeArenaFighter(leaving.user, leaving.pokemon, leaving.attackTypeIndex || 0);
    setupBattle(ms.champion, challenger);
  }
  updateAdvanceQueueUI();
}

export function handleArenaCmd(user, cmd, parts, text) {
  const ms = state.modeState;
  if (cmd === '!pokemon') {
    const name = parts.slice(1).join(' ').toLowerCase().trim();
    if (!name) return;
    const foundPokemon = ARENA_POKEMON_DB.find(p => p.name.toLowerCase() === name);
    if (!foundPokemon) {
      addChatMessage(null, `${user}: "${parts.slice(1).join(' ')}" no es un Pokémon válido. Escribe el nombre exacto de cualquier Pokémon de la Pokédex Nacional (ej: !pokemon Pikachu, !pokemon Greninja, !pokemon Charizard...)`, 'system');
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
    const alreadyQueued = ms.queue.some(q => q.user === user);
    const isChampion = ms.champion && ms.champion.user === user;
    const isFighting = ms.currentBattle && (ms.currentBattle.left.user === user || ms.currentBattle.right.user === user);
    if (alreadyQueued || isChampion || isFighting) {
      addChatMessage(null, `${user}: ya estás en el coliseo o en la cola`, 'system');
      return;
    }
    // Un usuario que ya perdió un combate en este Coliseo no puede volver a
    // hacer cola, salvo que el streamer haya activado el reingreso.
    if (!ms.allowRejoin && ms.defeatedUsers && ms.defeatedUsers.has(user)) {
      addChatMessage(null, `${user}: ya has sido derrotado en este Coliseo, no puedes volver a entrar (el streamer puede permitirlo)`, 'system');
      return;
    }
    // La cola tiene un máximo de jugadores esperando a la vez.
    if (ms.queue.length >= ARENA_MAX_QUEUE) {
      addChatMessage(null, `${user}: la cola del Coliseo está llena (máximo ${ARENA_MAX_QUEUE})`, 'system');
      return;
    }
    // El nuevo Pokémon se coloca al final de la cola de espera y camina
    // desde la esquina superior izquierda de la pantalla hasta su puesto.
    // rollShinyPokemon() ya devuelve una copia nueva (0.5% de probabilidad
    // de isShiny:true, ver js/pokemonShiny.js), nunca la entrada original
    // compartida de ARENA_POKEMON_DB.
    const pokemon = rollShinyPokemon(foundPokemon);
    ms.queue.push({ user, pokemon });
    pmdPreload(pokemon.sprite);
    addChatMessage(null, `🚪 ${user} hace cola con ${pokemon.name}! (posición ${ms.queue.length}/${ARENA_MAX_QUEUE})`, 'correct', { mirror: false });
    playVeJoin();
    // El avance de la cola (quién entra al coliseo) NO es automático:
    // renderArenaQueue ya se encarga de mostrar el botón para avanzarla.
    renderArenaQueue();
  } else if (cmd === '!torneo') {
    handleTournamentSignupCmd(user, parts);
  } else if (cmd === '!atacar' || cmd === '!habilidad') {
    addChatMessage(null, `${user}: ¡los combates del Coliseo son automáticos, no hace falta escribir comandos de ataque!`, 'system', { mirror: false });
  } else if (cmd === '!habilidad1' || cmd === '!habilidad2') {
    handleArenaAbility(user, cmd);
  } else if (cmd === '!puntos') {
    addChatMessage(null, `${user} tienes ${state.scores[user] || 0} puntos`, 'system', { mirror: false });
  }
}

// Gestiona !habilidad1 / !habilidad2: cambia el tipo del ataque del
// Pokémon de "user" (ver attackTypeIndex, leído en performArenaAttack) al
// tipo primario (!habilidad1, índice 0 de pokemon.types) o secundario
// (!habilidad2, índice 1). Solo tiene efecto si su Pokémon tiene dos tipos.
// A diferencia del modo Jefe Cooperativo (ver handleBossAbility), aquí no
// hay una fase de "espera en el puesto" separada de la lucha en sí -en
// cuanto el jugador entra al Coliseo ya está combatiendo de forma
// continua-, así que el comando funciona en cualquier momento: haciendo
// cola, como campeón a la espera de retador, o ya en pleno combate (como
// campeón o como retador).
function handleArenaAbility(user, cmd) {
  const ms = state.modeState;
  if (!ms) return;
  const index = cmd === '!habilidad1' ? 0 : 1;
  const label = index === 0 ? 'primario' : 'secundario';

  // Localiza el objeto donde vive el estado actual del Pokémon del
  // usuario, sea cual sea la fase en la que se encuentre: si ya está
  // combatiendo, currentBattle.left/right es la copia "viva" que lee
  // performArenaAttack (independiente de ms.champion, ver setupBattle);
  // si no, puede estar esperando como campeón sin retador o todavía
  // haciendo cola.
  let target = null;
  if (ms.currentBattle && ms.currentBattle.left.user === user) {
    target = ms.currentBattle.left;
  } else if (ms.currentBattle && ms.currentBattle.right.user === user) {
    target = ms.currentBattle.right;
  } else if (ms.champion && ms.champion.user === user) {
    target = ms.champion;
  } else {
    target = ms.queue.find(q => q.user === user) || null;
  }

  if (!target) {
    addChatMessage(null, `${user}: usa !pokemon [nombre] primero`, 'system', { mirror: false });
    return;
  }

  const types = (target.pokemon.types || []).filter(Boolean);
  if (types.length < 2) {
    addChatMessage(null, `${user}: ${target.pokemon.name} solo tiene un tipo, no puede cambiar el tipo de su ataque con ${cmd}.`, 'system');
    return;
  }
  if ((target.attackTypeIndex || 0) === index) {
    addChatMessage(null, `${user}: ${target.pokemon.name} ya está usando su tipo ${label} (${types[index]}).`, 'system');
    return;
  }
  target.attackTypeIndex = index;
  addChatMessage(null, `🔄 ${user}: ${target.pokemon.name} cambia el tipo de su próximo ataque a ${types[index]} (tipo ${label}).`, 'correct');
}

// Late que hace avanzar los combates del Coliseo en solitario: cada
// ARENA_TURN_MS le toca atacar a uno de los dos combatientes, sin que el
// chat tenga que escribir ningún comando.
function arenaAutoTick() {
  const ms = state.modeState;
  if (!ms || !ms.currentBattle) return;
  const b = ms.currentBattle;
  const side = b.turn === 'right' ? 'right' : 'left';
  b.turn = side === 'left' ? 'right' : 'left';
  performArenaAttack(side);
}

// Resuelve un ataque automático de `side` contra su rival: puede fallar por
// esquiva, ser un golpe crítico, o un golpe normal — igual que en el modo
// Battle Royale.
//
// La animación de "Attack" se lanza de inmediato, pero tarda un poco en
// volverse realmente ofensiva. Por eso el impacto (daño aplicado, bajada de
// vida, textos flotantes y animación de "Hurt" del rival) se retrasa
// ARENA_HIT_DELAY_MS: así el golpe se ve y se siente en el mismo instante en
// que el Pokémon atacante conecta, en vez de antes.
function performArenaAttack(side) {
  const ms = state.modeState;
  const b = ms.currentBattle;
  if (!b) return;
  const enemySide = side === 'left' ? 'right' : 'left';
  const fighter = b[side];
  const enemy = b[enemySide];
  if (!fighter || !enemy || fighter.hp <= 0 || enemy.hp <= 0) return;

  // Tras 10 ataques seguidos (de cualquiera de los dos combatientes) sin que
  // ninguno cause ni reciba daño (esquivas o golpes sin efecto), ambos entran
  // en "Forcejeo": un ataque básico que ignora habilidades y efectividad de
  // tipo, pero que sigue pudiendo fallar (esquiva) o ser crítico.
  const struggling = !!b.struggling;
  const moveType = (fighter.attackTypeIndex === 1 && fighter.pokemon.types[1]) ? fighter.pokemon.types[1] : fighter.pokemon.types[0]; // tipo elegido con !habilidad1/!habilidad2 (por defecto, el primario)
  const dodge = Math.random() < ARENA_BASE_STATS.dodgeChance;

  const attackerSpriteId = side === 'left' ? 'fl-sprite' : 'fr-sprite';
  const enemySpriteId = enemySide === 'left' ? 'fl-sprite' : 'fr-sprite';
  const sprites = ms.arenaSprites;
  const attackerSprite = sprites ? sprites[side] : null;
  const enemySprite = sprites ? sprites[enemySide] : null;
  const backToWalk = (spr, spriteSide) => {
    if (!state.modeState || !state.modeState.currentBattle) return; // combate ya terminó
    spr.play('Walk', arenaDirectionFor(spriteSide), true, null, ARENA_ANIM_SPEED);
  };

  // Quien ataca reproduce su animación "Attack" de inmediato, sin esperar
  // al resultado del golpe.
  if (attackerSprite) {
    attackerSprite.play('Attack', arenaDirectionFor(side), false, () => backToWalk(attackerSprite, side), ARENA_ANIM_SPEED);
  }

  if (dodge) {
    // Una esquiva no causa daño: cuenta para el estancamiento del combate.
    b.noDamageStreak = (b.noDamageStreak || 0) + 1;
    const enteringStruggle = b.noDamageStreak >= 10 && !b.struggling;
    if (enteringStruggle) b.struggling = true;
    setTimeout(() => {
      if (!state.modeState || state.modeState.currentBattle !== b) return; // el combate pudo terminar mientras tanto
      playArenaDodge();
      logBattle(`💨 ¡${enemy.pokemon.name} de @${enemy.user} esquiva ${struggling ? 'el Forcejeo' : 'el ataque'} de ${fighter.pokemon.name}!`, 'dodge');
      showArenaFloatText(enemySpriteId, '¡Esquiva!', 'dodge-number');
      if (enteringStruggle) logBattle('⚔️ ¡El combate se estanca! Ambos Pokémon pasan a usar Forcejeo.', 'system');
    }, ARENA_HIT_DELAY_MS);
    return;
  }

  const baseAtk = ARENA_BASE_STATS.atk;
  let dmg = Math.floor(baseAtk * (0.85 + Math.random() * 0.3));
  // El Forcejeo no tiene tipo, así que ignora por completo la tabla de tipos.
  const mult = struggling ? 1 : arenaTypeMultiplier(moveType, enemy.pokemon.types);
  dmg = Math.floor(dmg * mult);
  const crit = Math.random() < ARENA_BASE_STATS.critChance;
  let finalDmg = crit ? Math.floor(dmg * 1.5) : dmg;
  if (mult > 0) finalDmg = Math.max(finalDmg, 1);

  // Cuenta los ataques consecutivos sin daño (ni provocado ni recibido) para
  // activar el Forcejeo cuando el combate se estanca.
  let enteringStruggle = false;
  if (finalDmg > 0) {
    b.noDamageStreak = 0;
  } else {
    b.noDamageStreak = (b.noDamageStreak || 0) + 1;
    if (b.noDamageStreak >= 10 && !b.struggling) {
      b.struggling = true;
      enteringStruggle = true;
    }
  }

  let effMsg = '';
  if (!struggling) {
    if (mult === 0) effMsg = ' ¡No afecta al rival! (Inmune)';
    else if (mult >= 4) effMsg = ' ¡Es hipereficaz!';
    else if (mult >= 2) effMsg = ' ¡Es súper efectivo!';
    else if (mult <= 0.5) effMsg = ' No es muy eficaz...';
  }
  const moveName = struggling ? 'Forcejeo' : fighter.pokemon.moves[Math.floor(Math.random() * 3)];
  const moveLabel = struggling ? moveName : `${moveName} (${moveType})`;

  // Mensaje de efectividad/inmunidad sobre la cabeza del rival: se muestra
  // primero y, con un pequeño desfase, el número de daño (o "¡CRÍTICO!"),
  // para que ambos textos se puedan leer sin solaparse por completo. El
  // texto flotante es más corto que el del registro de combate (effMsg).
  let effFloatText = '';
  let effClass = '';
  if (mult === 0) { effFloatText = 'Inmune'; effClass = 'immune-number'; }
  else if (mult >= 4) { effFloatText = 'Hipereficaz'; effClass = 'hyper-number'; }
  else if (mult >= 2) { effFloatText = 'Superefectivo'; effClass = 'super-number'; }
  else if (mult <= 0.5) { effFloatText = 'No muy eficaz'; effClass = 'weak-number'; }
  const dmgText = (crit ? '¡CRÍTICO! ' : '') + '-' + finalDmg;

  setTimeout(() => {
    if (!state.modeState || state.modeState.currentBattle !== b) return; // el combate pudo terminar mientras tanto
    if (finalDmg > 0) { if (crit) playArenaCrit(); else playArenaHit(); }

    // Es aquí, en el momento del impacto, cuando se aplican el daño y la
    // bajada de vida — no en cuanto se decide el ataque.
    enemy.hp = Math.max(0, enemy.hp - finalDmg);
    logBattle(`${fighter.pokemon.name} usa ${moveLabel}!${crit ? ' ¡GOLPE CRÍTICO!' : ''} -${finalDmg} PS${effMsg}`, crit ? 'crit' : 'dmg');

    // Si el combate está en Forcejeo, se avisa sobre la cabeza de quien ataca,
    // igual que ocurre con el resto de mensajes de combate.
    if (struggling) {
      showArenaFloatText(attackerSpriteId, '¡Forcejeo!', 'struggle-number');
    }
    if (effFloatText) {
      showArenaFloatText(enemySpriteId, effFloatText, effClass);
      setTimeout(() => showArenaFloatText(enemySpriteId, dmgText, crit ? 'crit-number' : ''), 450);
    } else {
      showArenaFloatText(enemySpriteId, dmgText, crit ? 'crit-number' : '');
    }
    if (enteringStruggle) logBattle('⚔️ ¡El combate se estanca! Ambos Pokémon pasan a usar Forcejeo.', 'system');

    updateArenaHP();

    // Animación PMD del rival: si el golpe hizo daño de verdad, reproduce Hurt
    // justo ahora, sincronizada con el resto de efectos del impacto.
    const fainted = enemy.hp <= 0;
    if (fainted) playArenaFaint();
    if (finalDmg > 0 && enemySprite) {
      if (fainted) {
        // El Pokémon derrotado reproduce su animación de Hurt y, a la vez,
        // se va desvaneciendo poco a poco hasta desaparecer del coliseo.
        enemySprite.play('Hurt', arenaDirectionFor(enemySide), false, null, ARENA_ANIM_SPEED);
        const enemyContainer = $(enemySpriteId);
        if (enemyContainer) enemyContainer.classList.add('pmd-fainting');
      } else {
        enemySprite.play('Hurt', arenaDirectionFor(enemySide), false, () => backToWalk(enemySprite, enemySide), ARENA_ANIM_SPEED);
      }
    }

    if (fainted) {
      // Se espera a que termine el desvanecimiento antes de resolver el
      // fin del combate (cambio de campeón, etc.).
      setTimeout(() => endBattle(fighter, enemy), ARENA_FAINT_FADE_MS);
    }
  }, ARENA_HIT_DELAY_MS);
}

// Muestra un texto flotante (daño, crítico o esquiva) sobre el sprite indicado.
function showArenaFloatText(spriteElId, text, extraClass) {
  const el = $(spriteElId);
  if (!el) return;
  const num = document.createElement('div');
  num.className = 'damage-number' + (extraClass ? ' ' + extraClass : '');
  num.style.left = '50%';
  num.style.top = '0px';
  num.textContent = text;
  el.appendChild(num);
  setTimeout(() => num.remove(), 1500);
}

// Monta el combate entre el campeón actual y un retador (ambos ya han
// salido de la cola). Se llama únicamente desde enterColiseumFromQueue,
// es decir, tras el avance MANUAL de la cola — nunca automáticamente.
// El campeón (ganador del combate anterior) se coloca siempre a la
// izquierda del coliseo.
function setupBattle(championFighter, challenger) {
  const ms = state.modeState;
  // Cancela el temporizador pendiente que, tras la victoria anterior,
  // iba a volver a mostrar "campeón esperando retador": si no se cancela,
  // ese aviso llega tarde (3s después) y oculta al retador que ya ha
  // entrado, borrando su sprite, su barra de vida y su nombre.
  if (ms.champWaitTimeout) { clearTimeout(ms.champWaitTimeout); ms.champWaitTimeout = null; }
  // Combate igualado: el campeón empieza cada combate con la vida al máximo
  championFighter.hp = championFighter.maxHp;
  ms.champion = championFighter;
  ms.currentBattle = {
    left: { ...championFighter },
    right: { ...challenger },
    turn: 'left', // el campeón golpea primero; luego se van alternando solos
    noDamageStreak: 0, // ataques consecutivos (de cualquiera de los dos) sin causar ni recibir daño
    struggling: false, // true cuando, tras 10 ataques sin daño, ambos pasan a usar Forcejeo
  };
  const b = ms.currentBattle;
  addChatMessage(null, `⚔️ ¡${b.left.user} (${b.left.pokemon.name}, campeón) vs ${b.right.user} (${b.right.pokemon.name}, retador)!`, 'system', { mirror: false });
  logBattle(`¡COMBATE EN EL COLISEO! 👑 @${b.left.user} vs 🆚 @${b.right.user}`, '');
  $('fighter-left').style.display = 'flex';
  $('fighter-right').style.display = 'flex';
  // La corona del rey de la pista (el campeón) va justo antes de su nombre de usuario.
  $('fl-user').textContent = '👑 @' + b.left.user;
  $('fr-user').textContent = '@' + b.right.user;
  // Si el campeón conservaba su sprite del combate anterior, se destruye
  // antes de crear el nuevo (evita animaciones huérfanas corriendo en segundo plano).
  if (ms.arenaSprites) {
    if (ms.arenaSprites.left) ms.arenaSprites.left.destroy();
    if (ms.arenaSprites.right) ms.arenaSprites.right.destroy();
  }
  // Los sprites reaparecen aquí a tamaño original (.pmd-slot sin la clase
  // "pmd-mini" que usan los caminantes de la cola, que están al 50%).
  // uncapped: true — los combatientes se muestran a tamaño real, sin el
  // techo de 26px que sí se sigue aplicando a la cola (ver PMDSprite).
  const leftSprite = new PMDSprite($('fl-sprite'), getPokemonSprite(b.left.pokemon.sprite), { uncapped: true });
  const rightSprite = new PMDSprite($('fr-sprite'), getPokemonSprite(b.right.pokemon.sprite), { uncapped: true });
  leftSprite.setDex(b.left.pokemon.sprite, b.left.pokemon.isShiny);
  rightSprite.setDex(b.right.pokemon.sprite, b.right.pokemon.isShiny);
  ms.arenaSprites = { left: leftSprite, right: rightSprite };
  leftSprite.play('Walk', arenaDirectionFor('left'), true, null, ARENA_ANIM_SPEED);
  rightSprite.play('Walk', arenaDirectionFor('right'), true, null, ARENA_ANIM_SPEED);
  updateArenaHP();
  updateAdvanceQueueUI();
}

// El campeón está solo en el coliseo, esperando a que alguien haga cola
function showChampionWaiting() {
  const ms = state.modeState;
  const champ = ms.champion;
  $('fighter-left').style.display = 'flex';
  $('fighter-right').style.display = 'none';
  // La corona del rey de la pista (el campeón) va justo antes de su nombre de usuario.
  $('fl-user').textContent = '👑 @' + champ.user;
  $('fl-hp').textContent = `${champ.hp}/${champ.maxHp}`;
  const flBar = $('fl-hp-bar');
  flBar.style.width = '100%';
  flBar.className = 'hp-bar-fill';
  if (!ms.arenaSprites || !ms.arenaSprites.left) {
    const leftSprite = new PMDSprite($('fl-sprite'), getPokemonSprite(champ.pokemon.sprite), { uncapped: true });
    leftSprite.setDex(champ.pokemon.sprite, champ.pokemon.isShiny);
    ms.arenaSprites = { left: leftSprite, right: null };
    leftSprite.play('Walk', arenaDirectionFor('left'), true, null, ARENA_ANIM_SPEED);
  }
}

function showColiseumEmpty() {
  $('fighter-left').style.display = 'none';
  $('fighter-right').style.display = 'none';
}

function updateArenaHP() {
  const b = state.modeState.currentBattle;
  if (!b) return;
  const lPct = (b.left.hp / b.left.maxHp) * 100;
  const rPct = (b.right.hp / b.right.maxHp) * 100;
  $('fl-hp').textContent = `${b.left.hp}/${b.left.maxHp}`;
  $('fr-hp').textContent = `${b.right.hp}/${b.right.maxHp}`;
  const flBar = $('fl-hp-bar');
  const frBar = $('fr-hp-bar');
  flBar.style.width = lPct + '%';
  frBar.style.width = rPct + '%';
  flBar.className = 'hp-bar-fill' + (lPct < 25 ? ' low' : lPct < 50 ? ' mid' : '');
  frBar.className = 'hp-bar-fill' + (rPct < 25 ? ' low' : rPct < 50 ? ' mid' : '');
}

function logBattle(text, cls) {
  const log = $('battle-log');
  if (!log) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

// El ganador se queda como campeón del coliseo (siempre a la izquierda);
// el perdedor deja el coliseo (puede volver a hacer cola escribiendo
// !pokemon de nuevo). El siguiente combate NO empieza automáticamente:
// hay que pulsar el botón de avanzar la cola.
function endBattle(winner, loser) {
  const ms = state.modeState;
  // Los combates del Torneo (ver setupTournamentBattle) reutilizan este
  // mismo motor de combate (arenaAutoTick/performArenaAttack), pero al
  // terminar deben avanzar el cuadro de eliminatorias en vez de la lógica
  // normal de campeón/cola de abajo.
  if (ms.currentBattle && ms.currentBattle.isTournament) {
    endTournamentBattle(winner, loser);
    return;
  }
  logBattle(`¡${winner.pokemon.name} de @${winner.user} gana el combate!`, 'crit');
  addChatMessage(null, `🏆 ¡@${winner.user} gana y reina en el Coliseo! +200 pts`, 'correct', { mirror: false });
  playArenaBattleWin();
  addScore(winner.user, 200);
  // Se registra al derrotado: por defecto no podrá volver a hacer cola en
  // este Coliseo, salvo que el streamer active el reingreso de derrotados.
  if (ms.defeatedUsers) ms.defeatedUsers.add(loser.user);
  ms.champion = { user: winner.user, pokemon: winner.pokemon, hp: winner.hp, maxHp: winner.maxHp, attackTypeIndex: winner.attackTypeIndex || 0 };
  ms.currentBattle = null;
  if (ms.arenaSprites) {
    if (ms.arenaSprites.left) ms.arenaSprites.left.destroy();
    if (ms.arenaSprites.right) ms.arenaSprites.right.destroy();
    ms.arenaSprites = null;
  }
  renderRanking($('arena-ranking'));
  renderArenaQueue();
  ms.champWaitTimeout = setTimeout(() => {
    const cur = state.modeState;
    if (!cur) return; // el modo pudo cerrarse mientras tanto
    cur.champWaitTimeout = null;
    if (cur.currentBattle) return; // ya ha entrado un retador nuevo: no lo pisamos
    showChampionWaiting();
    updateAdvanceQueueUI();
  }, 3000);
}

// ---- Mostrar/ocultar y reposicionar la cola al entrar o salir de pantalla
// completa ----
// Tras un cambio de tamaño (fullscreen o resize de ventana) el layout tarda
// uno o dos frames en asentarse; se espera con doble rAF antes de medir la
// escena, para no recalcular con medidas todavía antiguas. renderArenaQueue
// se encarga a la vez de mostrar/ocultar la cola (ver isArenaSceneFullscreen)
// y de recolocar sus puestos según el nuevo tamaño de la escena.
function scheduleArenaQueueVisibilityUpdate() {
  requestAnimationFrame(() => requestAnimationFrame(renderArenaQueue));
}
['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange', 'scenefsfallbackchange'].forEach(evt => {
  document.addEventListener(evt, scheduleArenaQueueVisibilityUpdate);
});
window.addEventListener('resize', scheduleArenaQueueVisibilityUpdate);

/* =========================================================
   TORNEO — LÓGICA
   ========================================================= */

// Pulsar el botón "Torneo" (deshabilitado si ya hay uno en marcha, ver
// renderTournamentToggle) pregunta antes de abrir la inscripción.
function handleTournamentButtonClick() {
  const ms = state.modeState;
  if (!ms || ms.tournament) return;
  showModal('🏆 Torneo del Coliseo', '¿Quieres organizar un torneo?', [
    { label: 'Cancelar', class: 'btn-secondary' },
    { label: 'Sí, organizar', class: 'btn-primary', onClick: () => openTournamentSignup() },
  ]);
}

// Abre la pantalla previa de inscripción: crea el estado del torneo y
// muestra el cartel donde el chat se apunta con !torneo. Se usa tanto al
// confirmar el primer torneo como al pulsar "Organizar Torneo" en la
// pantalla de resultados de uno anterior.
function openTournamentSignup() {
  const ms = state.modeState;
  if (!ms) return;
  clearTournamentTimeouts();
  removeAllTournamentOverlays();
  ms.tournament = {
    phase: 'signup', // 'signup' | 'bracket' | 'battle' | 'finished'
    players: {},     // user -> { user, pokemon }
    order: [],       // orden de inscripción
    expelledUsers: new Set(),
    bracket: [],     // bracket[ronda] = [{p1,p2,winner}, ...]
    roundIndex: 0,
    matchIndex: 0,
    champion: null,
    timeouts: [],    // todos los setTimeout pendientes del torneo, para poder cancelarlos de golpe
    awaitingNextMatch: false, // true mientras se espera a que el streamer pulse "Siguiente Combate" tras un combate resuelto (ver proceedAfterTournamentMatch)
  };
  setArenaInstructionSignsVisible(false);
  renderTournamentToggle();
  renderAllowRejoinToggle();
  updateAdvanceQueueUI();
  renderTournamentSignupOverlay();
  // Anuncio por el chat de Twitch (mirror por defecto, ver addChatMessage):
  // avisa de que se ha abierto la inscripción y explica cómo apuntarse,
  // tanto con Pokémon aleatorio como eligiendo uno propio.
  addChatMessage(null, `🏆 ¡Inscripciones abiertas para el Torneo! Escribe !torneo para apuntarte con un Pokémon aleatorio, o !torneo <pokemon> (ej: !torneo Pikachu) para elegir tú el Pokémon. Mínimo ${TOURNAMENT_MIN_PLAYERS}, máximo ${TOURNAMENT_MAX_PLAYERS} jugadores.`, 'system');
}

// user se inscribe al Torneo. "parts" es el mensaje completo partido por
// espacios (["!torneo"] o ["!torneo", "pikachu"], igual que en !pokemon):
// - !torneo <pokemon>: el jugador elige su propio Pokémon, con la misma
//   validación que !pokemon en la cola normal (nombre exacto de la
//   Pokédex Nacional, sin formas bloqueadas y con sprite PMD local).
// - !torneo (sin nada más): se le asigna un Pokémon al azar, como hasta
//   ahora.
function handleTournamentSignupCmd(user, parts) {
  const ms = state.modeState;
  if (!ms || !ms.tournament || ms.tournament.phase !== 'signup') {
    addChatMessage(null, `${user}: ahora mismo no hay inscripciones abiertas para el Torneo`, 'system', { mirror: false });
    return;
  }
  const t = ms.tournament;
  if (t.expelledUsers.has(user)) {
    addChatMessage(null, `${user}: el streamer te ha expulsado de este Torneo, no puedes volver a apuntarte`, 'system', { mirror: false });
    return;
  }
  if (t.players[user]) return;
  if (t.order.length >= TOURNAMENT_MAX_PLAYERS) {
    addChatMessage(null, `${user}: el Torneo está lleno (máximo ${TOURNAMENT_MAX_PLAYERS})`, 'system', { mirror: false });
    return;
  }
  const requestedName = (parts && parts.length > 1) ? parts.slice(1).join(' ').toLowerCase().trim() : '';
  let base;
  if (requestedName) {
    const foundPokemon = ARENA_POKEMON_DB.find(p => p.name.toLowerCase() === requestedName);
    if (!foundPokemon) {
      addChatMessage(null, `${user}: "${parts.slice(1).join(' ')}" no es un Pokémon válido. Escribe el nombre exacto de cualquier Pokémon de la Pokédex Nacional (ej: !torneo Pikachu) o !torneo sin nombre para uno aleatorio.`, 'system', { mirror: false });
      return;
    }
    // Igual que en la cola normal (!pokemon): formas bloqueadas por el
    // Boss y Pokémon sin sprite PMD local todavía no se pueden elegir.
    const lockMsg = bossSpriteLockBlockMessage(foundPokemon.name, user);
    if (lockMsg) {
      addChatMessage(null, lockMsg, 'system', { mirror: false });
      return;
    }
    if (!pmdHasLocalSprite(foundPokemon.sprite)) {
      addChatMessage(null, `Lo sentimos, el Pokémon ${foundPokemon.name} aún no tiene sprite en el juego, por favor elige otro.`, 'system', { mirror: false });
      return;
    }
    base = foundPokemon;
  } else {
    // A cada inscrito que no elige Pokémon se le asigna uno al azar (con la
    // misma probabilidad de variante shiny que en la cola normal, ver
    // rollShinyPokemon) de entre los que sí tienen sprite PMD local, para no
    // depender de la red durante el torneo.
    const candidates = ARENA_POKEMON_DB.filter(p => pmdHasLocalSprite(p.sprite));
    base = candidates[Math.floor(Math.random() * candidates.length)];
  }
  const pokemon = rollShinyPokemon(base);
  t.players[user] = { user, pokemon };
  t.order.push(user);
  pmdPreload(pokemon.sprite);
  addChatMessage(null, `✅ ${user} se inscribe al Torneo con ${pokemon.name}! (${t.order.length} inscritos)`, 'correct', { mirror: false });
  playVeJoin();
  renderTournamentSignupGrid();
  updateTournamentSignupStartButton();
}

function renderTournamentSignupOverlay() {
  const scene = $('battle-scene');
  const ms = state.modeState;
  if (!scene || !ms || !ms.tournament) return;
  const t = ms.tournament;
  let overlay = $('tournament-signup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'arena-tournament-overlay';
    overlay.id = 'tournament-signup-overlay';
    scene.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="arena-tournament-panel">
      <div class="arena-tournament-title pixel">🏆 Inscripción al Torneo</div>
      <div class="arena-tournament-sub">Escribe <b style="color:var(--yellow)">!torneo</b> para apuntarte (o <b style="color:var(--yellow)">!torneo &lt;pokemon&gt;</b> para elegir tú el Pokémon)</div>
      <div class="big-count pixel" id="tournament-signup-count">${t.order.length}</div>
      <div style="color:var(--muted);font-size:11px;">inscritos · mínimo ${TOURNAMENT_MIN_PLAYERS}, máximo ${TOURNAMENT_MAX_PLAYERS}</div>
      <div class="ve-lobby-grid arena-tournament-grid" id="tournament-signup-grid"></div>
      <div class="mode-end-actions">
        <button class="ve-start-btn" id="tournament-start-btn" disabled>▶ Comenzar Torneo</button>
        <button class="mode-end-menu-btn" id="tournament-cancel-btn">✖ Cancelar</button>
      </div>
    </div>
  `;
  renderTournamentSignupGrid();
  updateTournamentSignupStartButton();
  $('tournament-start-btn').onclick = startTournamentFromSignup;
  $('tournament-cancel-btn').onclick = cancelTournamentSignup;
}

function renderTournamentSignupGrid() {
  const ms = state.modeState;
  if (!ms || !ms.tournament) return;
  const t = ms.tournament;
  const grid = $('tournament-signup-grid');
  const countEl = $('tournament-signup-count');
  if (countEl) countEl.textContent = t.order.length;
  if (!grid) return;
  if (!t.order.length) {
    grid.innerHTML = '<div class="ve-lobby-empty">Esperando a que el chat se apunte...</div>';
    return;
  }
  grid.innerHTML = t.order.map(u => {
    const p = t.players[u];
    return `
      <div class="ve-lobby-card arena-tournament-card">
        <div class="ve-ow-slot"><img src="${getPokemonSprite(p.pokemon.sprite)}" class="ve-ow-img" alt=""></div>
        <div class="p-user">@${escapeHtml(u)}</div>
      </div>
    `;
  }).join('');
}

function updateTournamentSignupStartButton() {
  const ms = state.modeState;
  const btn = $('tournament-start-btn');
  if (!btn || !ms || !ms.tournament) return;
  btn.disabled = ms.tournament.order.length < TOURNAMENT_MIN_PLAYERS;
}

function cancelTournamentSignup() {
  const ms = state.modeState;
  if (!ms) return;
  clearTournamentTimeouts();
  removeAllTournamentOverlays();
  ms.tournament = null;
  setArenaInstructionSignsVisible(true);
  renderTournamentToggle();
  renderAllowRejoinToggle();
  updateAdvanceQueueUI();
  addChatMessage(null, '🚫 Inscripción al Torneo cancelada', 'system', { mirror: false });
}

// Cierra la inscripción, genera el cuadro de eliminatorias aleatorio y
// abre la pantalla que lo muestra antes de empezar los combates.
function startTournamentFromSignup() {
  const ms = state.modeState;
  if (!ms || !ms.tournament || ms.tournament.phase !== 'signup') return;
  const t = ms.tournament;
  if (t.order.length < TOURNAMENT_MIN_PLAYERS) return;
  const overlay = $('tournament-signup-overlay');
  if (overlay) overlay.remove();
  t.phase = 'bracket';
  t.bracket = buildTournamentBracket(t.order.slice());
  t.roundIndex = 0;
  t.matchIndex = 0;
  renderAllowRejoinToggle();
  addChatMessage(null, `🏆 ¡Comienza el Torneo con ${t.order.length} jugadores! Cuadro de eliminatorias generado.`, 'system');
  openTournamentBracketOverlay(false);
}

/* ---- Generación del cuadro ---- */

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Genera la primera ronda del cuadro a partir de la lista de inscritos,
// completamente al azar. Si el número de inscritos no es una potencia de
// dos, algunos emparejamientos se rellenan con un "bye" (p2: null): ese
// jugador pasa de ronda automáticamente sin combatir (ver advanceTournament).
// El reparto garantiza que nunca haya dos "bye" en el mismo emparejamiento.
function buildTournamentBracket(users) {
  const n = users.length;
  const size = nextPowerOfTwo(n);
  const byesCount = size - n;
  const shuffled = shuffleArray(users.slice());
  const byePlayers = shuffled.slice(0, byesCount);
  const pairPlayers = shuffled.slice(byesCount);
  const matches = [];
  byePlayers.forEach(p => matches.push({ p1: p, p2: null, winner: null }));
  for (let i = 0; i < pairPlayers.length; i += 2) {
    matches.push({ p1: pairPlayers[i], p2: pairPlayers[i + 1], winner: null });
  }
  shuffleArray(matches);
  return [matches];
}

// Nombre de la ronda según cuántos emparejamientos tiene (16 = octavos, etc).
function tournamentRoundName(numMatchesInRound) {
  const players = numMatchesInRound * 2;
  switch (players) {
    case 2: return 'Final';
    case 4: return 'Semifinales';
    case 8: return 'Cuartos de Final';
    case 16: return 'Octavos de Final';
    case 32: return 'Dieciseisavos de Final';
    default: return `Ronda de ${players}`;
  }
}

/* ---- Pantalla del cuadro de eliminatorias ---- */

// Muestra el cuadro de eliminatorias. Con flowMode=false (justo tras
// generarse) se usa dentro del flujo automático del torneo: al cerrarse
// (por el botón o por el tiempo de espera) arrancan los combates. Con
// peek=true (botón "Eliminatorias") es solo una consulta: se cierra con
// un botón "Cerrar" y no dispara nada más.
function openTournamentBracketOverlay(peek) {
  const scene = $('battle-scene');
  const ms = state.modeState;
  if (!scene || !ms || !ms.tournament) return;
  const existing = $('tournament-bracket-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'arena-tournament-overlay';
  overlay.id = 'tournament-bracket-overlay';
  overlay.innerHTML = `
    <div class="arena-tournament-panel arena-bracket-panel">
      <div class="arena-tournament-title pixel">🏆 Cuadro de Eliminatorias</div>
      <div class="arena-bracket-tree" id="arena-bracket-tree"></div>
      <div class="mode-end-actions">
        ${peek
          ? '<button class="mode-end-menu-btn" id="tournament-bracket-close-btn">✖ Cerrar</button>'
          : '<button class="ve-start-btn" id="tournament-bracket-continue-btn">▶ Empezar Combates</button>'}
      </div>
    </div>
  `;
  scene.appendChild(overlay);
  renderBracketTree($('arena-bracket-tree'));
  if (peek) {
    $('tournament-bracket-close-btn').onclick = () => overlay.remove();
    return;
  }
  const proceed = () => {
    if (!$('tournament-bracket-overlay')) return; // ya se cerró por otra vía
    overlay.remove();
    const cur = state.modeState;
    if (!cur || !cur.tournament) return;
    cur.tournament.phase = 'battle';
    advanceTournament();
  };
  $('tournament-bracket-continue-btn').onclick = proceed;
  const tid = setTimeout(proceed, TOURNAMENT_BRACKET_AUTOSTART_MS);
  ms.tournament.timeouts.push(tid);
}

// Muestra automáticamente el cuadro de eliminatorias ya actualizado al
// terminar todos los combates de una fase (dieciseisavos, octavos, cuartos,
// semifinal o final): sin botones, se cierra sola tras
// TOURNAMENT_BRACKET_UPDATE_MS y entonces continúa el flujo del torneo
// (onDone). A diferencia de openTournamentBracketOverlay(true), que es una
// consulta manual del streamer con botón "Cerrar", esta es la versión
// automática que se dispara sola en cuanto se completa la fase.
function showTournamentBracketUpdate(onDone) {
  const scene = $('battle-scene');
  const ms = state.modeState;
  if (!scene || !ms || !ms.tournament) { onDone(); return; }
  const existing = $('tournament-bracket-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'arena-tournament-overlay';
  overlay.id = 'tournament-bracket-overlay';
  overlay.innerHTML = `
    <div class="arena-tournament-panel arena-bracket-panel">
      <div class="arena-tournament-title pixel">🏆 Cuadro de Eliminatorias</div>
      <div class="arena-bracket-tree" id="arena-bracket-tree"></div>
    </div>
  `;
  scene.appendChild(overlay);
  renderBracketTree($('arena-bracket-tree'));
  const tid = setTimeout(() => {
    overlay.remove();
    onDone();
  }, TOURNAMENT_BRACKET_UPDATE_MS);
  ms.tournament.timeouts.push(tid);
}

function renderBracketTree(container) {
  const ms = state.modeState;
  if (!container || !ms || !ms.tournament || !ms.tournament.bracket.length) return;
  const t = ms.tournament;
  const totalPlayers = t.bracket[0].length * 2;
  const totalRounds = Math.log2(totalPlayers);
  let html = '<div class="arena-bracket-cols">';
  for (let r = 0; r < totalRounds; r++) {
    const round = t.bracket[r] || null;
    const matchCount = totalPlayers / Math.pow(2, r + 1);
    html += `<div class="arena-bracket-col"><div class="arena-bracket-round-label">${tournamentRoundName(matchCount)}</div>`;
    for (let m = 0; m < matchCount; m++) {
      html += renderBracketMatchBox(round ? round[m] : null);
    }
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

function renderBracketMatchBox(match) {
  const fmt = (slotClass, u) => {
    if (u === undefined || match == null) return `<div class="arena-bracket-slot${slotClass}"><span class="arena-bracket-tbd">?</span></div>`;
    if (u === null) return `<div class="arena-bracket-slot${slotClass}"><span class="arena-bracket-bye">BYE</span></div>`;
    return `<div class="arena-bracket-slot${slotClass}">@${escapeHtml(u)}</div>`;
  };
  const p1Win = match && match.winner && match.winner === match.p1 ? ' win' : '';
  const p2Win = match && match.winner && match.winner === match.p2 ? ' win' : '';
  return `<div class="arena-bracket-match">
    ${fmt(p1Win, match ? match.p1 : undefined)}
    <div class="arena-bracket-vs">vs</div>
    ${fmt(p2Win, match ? match.p2 : undefined)}
  </div>`;
}

/* ---- Motor de avance del torneo ---- */

// Guarda el resultado de un emparejamiento y coloca al ganador en su hueco
// de la siguiente ronda (creándola si aún no existía). Si era el
// emparejamiento de la final, proclama campeón y termina el torneo.
function resolveTournamentMatch(roundIdx, matchIdx, winnerUser) {
  const ms = state.modeState;
  if (!ms || !ms.tournament) return;
  const t = ms.tournament;
  t.bracket[roundIdx][matchIdx].winner = winnerUser;
  const matchesInRound = t.bracket[roundIdx].length;
  if (matchesInRound === 1) {
    finishTournament(winnerUser);
    return;
  }
  const nextRoundIdx = roundIdx + 1;
  if (!t.bracket[nextRoundIdx]) {
    t.bracket[nextRoundIdx] = Array.from({ length: matchesInRound / 2 }, () => ({ p1: undefined, p2: undefined, winner: null }));
  }
  const nextMatchIdx = Math.floor(matchIdx / 2);
  const slot = matchIdx % 2 === 0 ? 'p1' : 'p2';
  t.bracket[nextRoundIdx][nextMatchIdx][slot] = winnerUser;
}

// Motor central que hace avanzar el torneo combate a combate y ronda a
// ronda: se llama al empezar los combates (tras cerrarse el cuadro) y cada
// vez que se resuelve un emparejamiento (directamente, o tras un "bye").
function advanceTournament() {
  const ms = state.modeState;
  if (!ms || !ms.tournament) return;
  const t = ms.tournament;
  if (t.phase === 'finished') return;
  const round = t.bracket[t.roundIndex];
  if (!round) return;
  if (t.matchIndex >= round.length) {
    // Ronda actual completa: se pasa a la siguiente (ya generada en
    // resolveTournamentMatch en cuanto se resolvió el último emparejamiento).
    // Antes de anunciar la nueva ronda se muestra el cuadro de eliminatorias
    // ya actualizado con los resultados de la fase que acaba de terminar.
    t.roundIndex++;
    t.matchIndex = 0;
    const nextRound = t.bracket[t.roundIndex];
    if (!nextRound) return; // seguridad: no debería ocurrir
    showTournamentBracketUpdate(() => {
      const cur = state.modeState;
      if (!cur || !cur.tournament) return;
      showTournamentRoundBanner(tournamentRoundName(nextRound.length));
      const tid = setTimeout(() => advanceTournament(), TOURNAMENT_ROUND_BANNER_MS);
      cur.tournament.timeouts.push(tid);
    });
    return;
  }
  const match = round[t.matchIndex];
  if (match.p2 === null) {
    // "Bye": el jugador pasa de ronda automáticamente, sin combate.
    addChatMessage(null, `➡️ ${match.p1} pasa de ronda automáticamente (sin rival)`, 'system', { mirror: false });
    const roundIdx = t.roundIndex;
    const matchIdx = t.matchIndex;
    resolveTournamentMatch(roundIdx, matchIdx, match.p1);
    t.matchIndex = matchIdx + 1;
    advanceTournament();
    return;
  }
  showTournamentMatchNotification(match.p1, match.p2);
}

/* ---- Anuncios en pantalla y combates ---- */

function showTournamentMatchNotification(p1User, p2User) {
  const ms = state.modeState;
  const scene = $('battle-scene');
  if (!scene || !ms || !ms.tournament) return;
  const existing = $('tournament-match-banner');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'arena-tournament-notify';
  overlay.id = 'tournament-match-banner';
  overlay.innerHTML = `
    <div class="arena-tournament-notify-box">
      <div class="arena-tournament-notify-title pixel">⚔️ Próximo Combate</div>
      <div class="arena-tournament-notify-fighters">@${escapeHtml(p1User)} <span class="vs">VS</span> @${escapeHtml(p2User)}</div>
    </div>
  `;
  scene.appendChild(overlay);
  const tid = setTimeout(() => {
    overlay.remove();
    beginTournamentMatch(p1User, p2User);
  }, TOURNAMENT_MATCH_BANNER_MS);
  ms.tournament.timeouts.push(tid);
}

// Monta el combate 1vs1 de torneo entre p1User y p2User, reutilizando el
// mismo motor de combate automático del Coliseo normal (arenaAutoTick /
// performArenaAttack). A diferencia de un combate normal (donde siempre
// empieza golpeando el campeón), aquí quién empieza se decide al azar.
function beginTournamentMatch(p1User, p2User) {
  const ms = state.modeState;
  if (!ms || !ms.tournament) return;
  const t = ms.tournament;
  t.phase = 'battle';
  const p1 = t.players[p1User];
  const p2 = t.players[p2User];
  if (!p1 || !p2) return; // seguridad
  ms.champion = null; // los combates de torneo no usan el concepto de campeón/cola
  const left = makeArenaFighter(p1.user, p1.pokemon);
  const right = makeArenaFighter(p2.user, p2.pokemon);
  ms.currentBattle = {
    left,
    right,
    turn: Math.random() < 0.5 ? 'left' : 'right', // quién empieza a golpear se decide al azar
    noDamageStreak: 0,
    struggling: false,
    isTournament: true,
  };
  const b = ms.currentBattle;
  addChatMessage(null, `⚔️ ¡Combate de Torneo! ${b.left.user} (${b.left.pokemon.name}) vs ${b.right.user} (${b.right.pokemon.name})`, 'system');
  logBattle(`🏆 TORNEO: @${b.left.user} vs @${b.right.user}`, '');
  $('fighter-left').style.display = 'flex';
  $('fighter-right').style.display = 'flex';
  $('fl-user').textContent = '@' + b.left.user;
  $('fr-user').textContent = '@' + b.right.user;
  if (ms.arenaSprites) {
    if (ms.arenaSprites.left) ms.arenaSprites.left.destroy();
    if (ms.arenaSprites.right) ms.arenaSprites.right.destroy();
  }
  const leftSprite = new PMDSprite($('fl-sprite'), getPokemonSprite(b.left.pokemon.sprite), { uncapped: true });
  const rightSprite = new PMDSprite($('fr-sprite'), getPokemonSprite(b.right.pokemon.sprite), { uncapped: true });
  leftSprite.setDex(b.left.pokemon.sprite, b.left.pokemon.isShiny);
  rightSprite.setDex(b.right.pokemon.sprite, b.right.pokemon.isShiny);
  ms.arenaSprites = { left: leftSprite, right: rightSprite };
  leftSprite.play('Walk', arenaDirectionFor('left'), true, null, ARENA_ANIM_SPEED);
  rightSprite.play('Walk', arenaDirectionFor('right'), true, null, ARENA_ANIM_SPEED);
  updateArenaHP();
}

// Se llama desde endBattle cuando el combate que acaba de terminar era de
// torneo: anuncia al ganador, hace desaparecer a ambos combatientes y
// avanza el cuadro (siguiente combate, siguiente ronda, o fin del torneo).
function endTournamentBattle(winner, loser) {
  const ms = state.modeState;
  const t = ms.tournament;
  if (!t) return;
  logBattle(`¡${winner.pokemon.name} de @${winner.user} gana el combate de torneo!`, 'crit');
  addChatMessage(null, `🏆 ¡@${winner.user} gana su combate y avanza en el Torneo!`, 'correct');
  playArenaTournamentMatchWin();
  addScore(winner.user, 250);
  const roundIdx = t.roundIndex;
  const matchIdx = t.matchIndex;
  ms.currentBattle = null;
  if (ms.arenaSprites) {
    if (ms.arenaSprites.left) ms.arenaSprites.left.destroy();
    if (ms.arenaSprites.right) ms.arenaSprites.right.destroy();
    ms.arenaSprites = null;
  }
  renderRanking($('arena-ranking'));
  showTournamentWinnerBanner(winner.user, () => {
    const cur = state.modeState;
    if (!cur || !cur.tournament) return;
    if ($('fighter-left')) $('fighter-left').style.display = 'none';
    if ($('fighter-right')) $('fighter-right').style.display = 'none';
    resolveTournamentMatch(roundIdx, matchIdx, winner.user);
    if (cur.tournament.phase === 'finished') return; // finishTournament ya se ha encargado de la pantalla final
    cur.tournament.matchIndex = matchIdx + 1;
    proceedAfterTournamentMatch();
  });
}

// Se llama justo después de resolver un combate REAL de Torneo (no un
// "bye", que sigue pasando de ronda solo, sin combate ni pausa: ver
// advanceTournament). Con el Modo Auto desactivado (por defecto) el juego
// no continúa solo: se muestra el botón "Siguiente Combate" y se espera a
// que el streamer lo pulse. Con el Modo Auto activado (mismo interruptor
// "🤖 Auto" que controla el avance de la cola normal del Coliseo) el
// torneo sigue encadenando combates sin intervención, como ocurría siempre
// antes de este botón.
function proceedAfterTournamentMatch() {
  const ms = state.modeState;
  if (!ms || !ms.tournament) return;
  if (ms.autoAdvance) {
    advanceTournament();
    return;
  }
  showTournamentNextMatchButton();
}

// Muestra en el hueco de "avanzar cola" (reutilizado aquí porque durante
// un torneo la cola normal está en pausa y ese hueco queda libre, ver
// updateAdvanceQueueUI) el botón que el streamer debe pulsar para que el
// cuadro del torneo avance al siguiente combate (o a la siguiente ronda).
function showTournamentNextMatchButton() {
  const ms = state.modeState;
  if (!ms || !ms.tournament) return;
  ms.tournament.awaitingNextMatch = true;
  const wrap = $('queue-advance-wrap');
  if (!wrap) {
    // Seguridad: si por lo que sea el hueco no existe, no se bloquea el
    // torneo esperando un botón que nadie podría pulsar.
    ms.tournament.awaitingNextMatch = false;
    advanceTournament();
    return;
  }
  wrap.innerHTML = `<button class="advance-queue-btn" id="tournament-next-match-btn">▶ Siguiente Combate</button>`;
  $('tournament-next-match-btn').onclick = () => {
    const cur = state.modeState;
    if (!cur || !cur.tournament) return;
    cur.tournament.awaitingNextMatch = false;
    wrap.innerHTML = '';
    advanceTournament();
  };
}

function showTournamentWinnerBanner(winnerUser, onDone) {
  const ms = state.modeState;
  const scene = $('battle-scene');
  if (!scene || !ms || !ms.tournament) { onDone(); return; }
  const existing = $('tournament-match-banner');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'arena-tournament-notify';
  overlay.id = 'tournament-match-banner';
  overlay.innerHTML = `
    <div class="arena-tournament-notify-box winner">
      <div class="arena-tournament-notify-title pixel">🏆 ¡Ganador del combate!</div>
      <div class="arena-tournament-notify-fighters">@${escapeHtml(winnerUser)}</div>
    </div>
  `;
  scene.appendChild(overlay);
  const tid = setTimeout(() => {
    overlay.remove();
    onDone();
  }, TOURNAMENT_WINNER_BANNER_MS);
  ms.tournament.timeouts.push(tid);
}

function showTournamentRoundBanner(name) {
  const ms = state.modeState;
  const scene = $('battle-scene');
  if (!scene || !ms || !ms.tournament) return;
  playArenaRoundStart();
  const existing = $('tournament-round-banner');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'arena-tournament-notify';
  overlay.id = 'tournament-round-banner';
  overlay.innerHTML = `
    <div class="arena-tournament-notify-box round">
      <div class="arena-tournament-notify-title pixel">📢 ${escapeHtml(name)}</div>
    </div>
  `;
  scene.appendChild(overlay);
  addChatMessage(null, `📢 ¡Comienza la ronda de ${name}!`, 'system', { mirror: false });
  const tid = setTimeout(() => overlay.remove(), Math.max(200, TOURNAMENT_ROUND_BANNER_MS - 200));
  ms.tournament.timeouts.push(tid);
}

/* ---- Fin del torneo ---- */

function finishTournament(winnerUser) {
  const ms = state.modeState;
  if (!ms || !ms.tournament) return;
  const t = ms.tournament;
  t.phase = 'finished';
  t.champion = winnerUser;
  addScore(winnerUser, 500);
  playArenaTournamentChampion();
  addChatMessage(null, `🏆👑 ¡@${winnerUser} es el CAMPEÓN DEL TORNEO!`, 'correct');
  renderRanking($('arena-ranking'));
  renderAllowRejoinToggle();
  // Igual que al terminar cualquier otra fase, se muestra primero el cuadro
  // de eliminatorias ya actualizado (con la final resuelta) antes de pasar
  // a la pantalla de campeón.
  showTournamentBracketUpdate(() => {
    const cur = state.modeState;
    if (!cur || !cur.tournament) return;
    showTournamentFinalScreen(winnerUser);
  });
}

function showTournamentFinalScreen(winnerUser) {
  const ms = state.modeState;
  const scene = $('battle-scene');
  if (!scene || !ms || !ms.tournament) return;
  const p = ms.tournament.players[winnerUser];
  const existing = $('tournament-final-banner');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 've-victory-banner arena-tournament-final';
  overlay.id = 'tournament-final-banner';
  overlay.innerHTML = `
    <div class="ve-ow-slot big"><img class="ve-ow-img" src="${p ? getPokemonSprite(p.pokemon.sprite) : ''}" alt=""></div>
    <div class="win-title pixel">¡CAMPEÓN DEL TORNEO!</div>
    <div class="win-sub">@${escapeHtml(winnerUser)}${p ? ' con ' + escapeHtml(p.pokemon.name) : ''}</div>
    <div class="mode-end-actions">
      <button class="ve-start-btn" id="tournament-again-btn">🏆 Organizar Torneo</button>
      <button class="mode-end-menu-btn" id="tournament-infinite-btn">♾️ Volver a Arena Infinita</button>
      <button class="mode-end-menu-btn" id="tournament-menu-btn">🏠 Menú Principal</button>
    </div>
  `;
  scene.appendChild(overlay);
  spawnArenaTournamentConfetti(overlay);
  $('tournament-again-btn').onclick = () => { overlay.remove(); openTournamentSignup(); };
  $('tournament-infinite-btn').onclick = () => { overlay.remove(); endTournamentReturnToArena(); };
  $('tournament-menu-btn').onclick = () => backToMenu();
}

// Lanza un puñado de piezas de confeti cayendo desde arriba del banner de
// victoria (mismo efecto que en Voltorb Explosivo, ver spawnVoltorbConfetti
// en voltorbexplosivo.js), reutilizando la misma clase CSS .ve-confetti-piece.
function spawnArenaTournamentConfetti(banner) {
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

// "Volver a Arena Infinita": cierra el torneo por completo y deja el
// Coliseo listo para que la cola normal (!pokemon) vuelva a funcionar.
function endTournamentReturnToArena() {
  const ms = state.modeState;
  if (!ms) return;
  clearTournamentTimeouts();
  removeAllTournamentOverlays();
  ms.tournament = null;
  ms.currentBattle = null;
  ms.champion = null;
  if (ms.arenaSprites) {
    if (ms.arenaSprites.left) ms.arenaSprites.left.destroy();
    if (ms.arenaSprites.right) ms.arenaSprites.right.destroy();
    ms.arenaSprites = null;
  }
  showColiseumEmpty();
  setArenaInstructionSignsVisible(true);
  renderTournamentToggle();
  renderAllowRejoinToggle();
  updateAdvanceQueueUI();
  addChatMessage(null, '♾️ Volviendo a la Arena Infinita', 'system', { mirror: false });
}

/* ---- Utilidades comunes del torneo ---- */

function clearTournamentTimeouts() {
  const ms = state.modeState;
  if (ms && ms.tournament && ms.tournament.timeouts) {
    ms.tournament.timeouts.forEach(id => clearTimeout(id));
    ms.tournament.timeouts = [];
  }
}

function removeAllTournamentOverlays() {
  ['tournament-signup-overlay', 'tournament-bracket-overlay', 'tournament-match-banner', 'tournament-round-banner', 'tournament-final-banner'].forEach(id => {
    const el = $(id);
    if (el) el.remove();
  });
}

// Los carteles de instrucciones normales del Coliseo ("escribe !pokemon...",
// "cambia el tipo con !habilidad1/2") no tienen sentido mientras el Torneo
// controla la pantalla; se ocultan durante la inscripción y se devuelven al
// volver a la Arena Infinita (ver openTournamentSignup/endTournamentReturnToArena).
function setArenaInstructionSignsVisible(visible) {
  const a = $('battle-status');
  const b = $('arena-ability-sign');
  if (a) a.style.display = visible ? '' : 'none';
  if (b) b.style.display = visible ? '' : 'none';
}
