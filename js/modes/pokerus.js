import { addChatMessage, escapeHtml } from '../chat.js';
import { bossSpriteLockBlockMessage } from '../bossSpriteLocks.js';
import { ARENA_POKEMON_DB } from '../data/arenaPokemonDb.js';
import { getPokemonSprite } from '../data/pokemonDb.js';
import {
  playCountdownBeep, playModeMusic, playPokerusDefeat, playPokerusVictory, playVeJoin,
  playPokerusMatchStart, playPokerusNightFall, playPokerusDayStart,
} from '../audio.js';
import { toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { backToMenu } from '../modeLauncher.js';
import { PMDSprite, PMD_DIR, pmdHasLocalSprite, pmdPreload } from '../pmdSprite.js';
import { rollShinyPokemon } from '../pokemonShiny.js';
import { state } from '../state.js';
import { $, addScore, showModal, toast } from '../utils.js';

/* =========================================================
   MODO POKERUS
   -----------------------------------------------------------
   - Fase de lobby: los viewers se apuntan con !pokemon [nombre],
     eligiendo entre toda la Pokédex Nacional (misma base de datos
     que el modo Arena). Cada jugador se ve en el lobby como su
     sprite animado PMD (Pokémon Mundo Misterioso), igual que en
     el Coliseo del modo Arena.
   - Al comenzar, un 20% de los jugadores (mínimo 1) queda infectado
     por el Pokerus, en secreto.
   - El mapa tiene SIEMPRE 10 salas en posiciones y tamaños fijos
     (POKERUS_ROOM_LAYOUT), repartidas por los bordes del mapa sin
     superponerse nunca entre sí, y las 10 se ven siempre en pantalla
     (abiertas o cerradas), independientemente del número de jugadores.
     Cada ronda se decide cuántas de esas 10 salas se ABREN (con puerta
     funcional y un aforo de 2, 3 o 4 personas cada una): las salas
     abiertas son siempre las justas y necesarias para que quepan todos
     los jugadores vivos, sin que nadie se quede fuera, y el aforo total
     de las salas abiertas nunca supera en más de un 20% el aforo
     necesario (el sobrante exacto, entre 0% y 20%, varía al azar cada
     ronda). Las salas que no se abren esa ronda se muestran cerradas
     (candado, sin función) en su misma posición fija del mapa. El
     tamaño y la ubicación de cada una de las 10 salas no cambian nunca.
   - Al empezar la ronda (cada ronda = una noche), todos los jugadores
     vivos aparecen reunidos en el centro del mapa (la PLAZA), como
     sprites PMD animados. Quedarse ahí, sin hacer nada, significa
     dormir esa noche en la plaza (a la intemperie). Al escribir el
     número de puerta con "!" delante (p.ej. "!3", o "!puerta 3"), su
     sprite camina (animación Walk, orientada hacia donde se mueve)
     hasta esa puerta; si luego cambian de opinión y eligen otra sala,
     o quieren volver a la plaza con "!plaza" (o "!0"), su sprite sale
     caminando hacia el nuevo destino. Un número suelto sin "!" delante
     no cuenta como elección de puerta, para no confundirlo con charla
     normal del chat.
   - ETAPAS DEL VIRUS (contador de días propio de cada jugador desde que
     se infecta, independiente de la ronda global):
       · Día 0 — Infección: la noche en que se contagia (paciente cero,
         dormir en la plaza, o dormir en una sala con algún infectado).
         Sin síntomas.
       · Días 1-2 — Incubación: sigue sin mostrar ningún síntoma (su
         sprite y su estado en la lista de jugadores aparecen sanos),
         pero ya es contagioso para quien duerma con él.
       · Días 3-4 — Sintomática: a partir de aquí su sprite se tiñe de
         verde radioactivo y su estado pasa a "Infectado" en la lista,
         visible para todos. Sigue siendo contagioso.
       · Día 5 — Muerte: el jugador muere automáticamente (sin ninguna
         tirada adicional de supervivencia).
   - PROBABILIDAD DE CONTAGIO al cerrarse la noche, para cada jugador
     sano expuesto:
       · Dormir en la plaza: 80% de contagiarse.
       · Dormir en una sala con exactamente 1 infectado: 80%.
       · Dormir en una sala con 2 o más infectados: 100%.
     Un jugador recién contagiado esa misma noche empieza en Día 0 (sin
     avanzar de día hasta la noche siguiente). Al terminar de resolver,
     la pantalla se funde a negro y muestra un resumen (muertes de la
     ronda, infectados restantes, supervivientes); después la nueva
     ronda entra también con un fundido, para que el paso de una
     pantalla a otra sea siempre suave.
   - La partida termina cuando mueren todos los jugadores (derrota) o
     cuando ya no queda nadie infectado, es decir, todos los infectados
     han muerto y quedan supervivientes sanos (victoria de los
     supervivientes).
   ========================================================= */

const POKERUS_CHOOSE_SECONDS = 45;   // tiempo para elegir puerta cada ronda
const POKERUS_MAX_PLAYERS = 40;      // máximo de jugadores que pueden apuntarse en el lobby
// Duración del fundido A NEGRO con el que arranca cada transición de noche
// (mapa -> negro), antes de resolver nada: igual que ZOR_NIGHT_FADE_MS en
// zoroarks.js, para que la pantalla esté ya completamente negra cuando se
// calculan los contagios y las muertes, y nadie llegue a verlas ocurrir.
const POKERUS_NIGHT_FADE_MS = 900;
// Sobre el fondo ya negro se muestran, uno detrás de otro, dos mensajes:
// primero cuántos han muerto esa noche (POKERUS_NIGHT_DEATHS_HOLD_MS) y
// después el nuevo día que empieza, "Día X" (POKERUS_NIGHT_DAY_HOLD_MS).
const POKERUS_NIGHT_DEATHS_HOLD_MS = 3000;
const POKERUS_NIGHT_DAY_HOLD_MS = 2000;
// Fundido entre esos dos mensajes (debe coincidir con la transición CSS de
// .pokerus-fade-content, ver styles.css).
const POKERUS_NIGHT_MSG_FADE_MS = 500;
const POKERUS_ROUND_ENTER_FADE_MS = 550; // duración del fundido de entrada a la nueva ronda
const POKERUS_DOOR_CAPACITIES = [2, 3, 4];
// Etapas del virus, en días desde el contagio (contador propio de cada
// jugador, no de la ronda global):
//  - Día 0: infección (sin síntomas).
//  - Días 1-2: incubación (sin síntomas, pero ya contagioso).
//  - Días 3-4: sintomática (visible, contagioso).
//  - Día 5: muerte automática.
const POKERUS_DAY_SYMPTOMATIC = 3;  // a partir de este día se vuelve visible
const POKERUS_DAY_DEATH = 5;        // al llegar a este día, muere
// Probabilidades de contagio al cerrarse la noche, para cada jugador sano
// expuesto según dónde haya dormido:
const POKERUS_INFECT_CHANCE_PLAZA = 0.8;        // dormir en la plaza (a la intemperie)
const POKERUS_INFECT_CHANCE_ONE_SICK = 0.8;     // sala con exactamente 1 infectado
const POKERUS_INFECT_CHANCE_MULTI_SICK = 1.0;   // sala con 2+ infectados
// Número total de salas del mapa. Es SIEMPRE el mismo, ronda tras ronda y
// partida tras partida: lo único que cambia según cuántos jugadores queden
// vivos es cuántas de estas 10 salas se abren cada ronda (ver
// generatePokerusDoors) y el aforo de cada una — nunca su tamaño ni su
// posición, que están fijados de antemano en POKERUS_ROOM_LAYOUT.
const POKERUS_TOTAL_ROOMS = 10;
// Layout fijo de las 10 salas: cada una tiene un id (el número que hay que
// escribir en el chat para entrar) y un área rectangular libre, en porcentaje
// (0-100) sobre el mapa (xPct/yPct = esquina superior-izquierda, wPct/hPct =
// ancho/alto), calcada de las salas ya dibujadas en el propio fondo del mapa
// (assets/textures/pokerus_map_bg.jpg). Definida a mano con la herramienta
// tools/marcador_coordenadas_pokerus.html. El tamaño y la ubicación de cada
// una de las 10 salas no cambian nunca.
const POKERUS_ROOM_LAYOUT = [
  { id: 1, xPct: 5.59, yPct: 9.77, wPct: 10.42, hPct: 29.44 },
  { id: 2, xPct: 19.66, yPct: 9, wPct: 11.82, hPct: 17.32 },
  { id: 3, xPct: 36.84, yPct: 9.19, wPct: 26.21, hPct: 16.74 },
  { id: 4, xPct: 68.85, yPct: 9.77, wPct: 11.49, hPct: 16.55 },
  { id: 5, xPct: 83.67, yPct: 9.57, wPct: 10.96, hPct: 29.64 },
  { id: 6, xPct: 84, yPct: 61.72, wPct: 10.63, hPct: 28.87 },
  { id: 7, xPct: 68.96, yPct: 75.77, wPct: 11.17, hPct: 14.82 },
  { id: 8, xPct: 36.84, yPct: 75.19, wPct: 25.46, hPct: 15.2 },
  { id: 9, xPct: 19.66, yPct: 75.19, wPct: 11.39, hPct: 15.59 },
  { id: 10, xPct: 5.37, yPct: 61.52, wPct: 10.85, hPct: 29.25 },
];

// Posición (en % del mapa, mismo sistema que POKERUS_ROOM_LAYOUT) de cada
// antorcha ya dibujada en el propio arte de fondo
// (assets/textures/pokerus_map_bg.jpg): dos en la sala 1 (arriba a la
// izquierda), una en la sala 5 (arriba a la derecha) y una en la sala 10
// (abajo a la izquierda). Solo se usan para superponer un resplandor
// cálido sobre la llama ya pintada; no son elementos interactivos.
const POKERUS_TORCH_POSITIONS = [
  { xPct: 15.39, yPct: 9.75 },
  { xPct: 93.85, yPct: 9.62 },
  { xPct: 6.21, yPct: 23.45 },
  { xPct: 6.05, yPct: 80.95 },
];
// el espacio central del mapa donde se reúnen los jugadores vivos al empezar
// cada ronda y donde deambulan mientras no eligen puerta.
const POKERUS_PLAZA_AREA = { xPct: 21.05, yPct: 36.31, wPct: 58.43, hPct: 28.87 };

// Camino (lista ordenada de puntos, en % del mapa) que sigue el sprite de un
// jugador al caminar desde la plaza hasta la puerta de cada sala (y a la
// inversa, en orden invertido, al volver a la plaza). El último punto de cada
// camino es la "boca" de la puerta; los ocupantes de la sala se reparten desde
// ahí hacia el centro de su área (ver pokerusDoorAnchor). Definidos a mano con
// la herramienta tools/marcador_coordenadas_pokerus.html.
const POKERUS_PATHS = {
  1: [{ xPct: 21.16, yPct: 49.98 }, { xPct: 10.85, yPct: 50.36 }, { xPct: 10.74, yPct: 38.24 }],
  2: [{ xPct: 25.67, yPct: 34.39 }, { xPct: 25.67, yPct: 24.96 }],
  3: [{ xPct: 49.95, yPct: 35.74 }, { xPct: 49.95, yPct: 22.27 }],
  4: [{ xPct: 74.65, yPct: 35.35 }, { xPct: 74.65, yPct: 23.8 }],
  5: [{ xPct: 79.7, yPct: 49.59 }, { xPct: 89.26, yPct: 49.59 }, { xPct: 89.26, yPct: 37.85 }],
  6: [{ xPct: 79.81, yPct: 50.94 }, { xPct: 89.37, yPct: 50.94 }, { xPct: 89.37, yPct: 61.91 }],
  7: [{ xPct: 74.76, yPct: 65.37 }, { xPct: 74.76, yPct: 77.5 }],
  8: [{ xPct: 50.05, yPct: 66.14 }, { xPct: 50.05, yPct: 77.88 }],
  9: [{ xPct: 25.46, yPct: 65.76 }, { xPct: 25.35, yPct: 76.54 }],
  10: [{ xPct: 20.73, yPct: 50.94 }, { xPct: 10.85, yPct: 50.94 }, { xPct: 10.74, yPct: 62.1 }],
};
// Velocidad (multiplicador de duración de frame) de los sprites PMD parados
// en el lobby o de pie dentro de una sala: cuanto más alto, más lenta y
// pausada se ve la animación.
const POKERUS_STAND_SPEED = 2.6;
// Velocidad de la animación Walk mientras un sprite se está desplazando de
// verdad por el mapa: algo más pausada que antes, para que el ciclo de
// pasos acompañe a la nueva velocidad de desplazamiento, más lenta.
const POKERUS_WALK_ANIM_SPEED = 5.4;
// Velocidad de desplazamiento real por el mapa, en píxeles por segundo,
// usada para calcular cuánto debe durar cada trayecto caminado cuando el
// jugador recibe una orden real por chat (elegir puerta o volver a la
// plaza). Deliberadamente lenta y pausada, para que el paso se vea como un
// paseo y no como una carrera.
const POKERUS_WALK_PX_PER_S = 32;
// Deambular en el centro del mapa (antes de que el jugador elija puerta):
// mucho más lento que el trayecto decidido hacia una puerta, para que se
// note que están "matando el tiempo" y no yendo a ningún sitio en concreto.
const POKERUS_WANDER_PX_PER_S = 20;
const POKERUS_WANDER_RADIUS = 40; // px de radio en torno a su puesto en el centro
const POKERUS_WANDER_PAUSE_MIN_MS = 500;   // pausa breve normal entre pasos
const POKERUS_WANDER_PAUSE_MAX_MS = 1600;
const POKERUS_WANDER_STOP_CHANCE = 0.35;   // probabilidad de quedarse parado más tiempo
const POKERUS_WANDER_STOP_MIN_MS = 2000;   // "unos segundos" parado
const POKERUS_WANDER_STOP_MAX_MS = 5000;

export function startPokerus() {
  state.modeState = {
    phase: 'lobby',   // 'lobby' | 'round' | 'resolving' | 'ended'
    players: {},       // user -> player
    order: [],
    roundNumber: 0,
    doors: [],
    timer: null,         // cuenta atrás para elegir puerta (limpiado por backToMenu)
    autoAdvanceTimeout: null, // pausa entre rondas (limpiado por backToMenu)
    timeLeft: POKERUS_CHOOSE_SECONDS,
    lobbySprites: {},    // user -> { el, sprite, dex } — caminantes PMD del lobby
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startPokerus(), es decir, al empezar una nueva partida).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    roomEls: {},         // doorId -> { roomEl, capEl } — decorado (puerta) de cada sala
    fieldSprites: {},    // user -> { el, sprite, x, y, dir, arriveTimeout } — sprites libres sobre el mapa
    // Una vez arranca pokerus2.mp3 (al entrar un día con algún sintomático)
    // se queda sonando esa hasta el final de la partida, sin volver a
    // pokerus1.mp3 aunque luego no quede nadie sintomático (ver
    // startPokerusRound más abajo).
    pokerus2Started: false,
  };
  renderPokerusLobby();
  addChatMessage(null, `🧬 ¡Modo Pokerus abierto! Escribe !pokemon [nombre] para apuntarte (¡disponible toda la Pokédex Nacional, ${ARENA_POKEMON_DB.length} Pokémon!)`, 'system');
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderPokerusLobby() {
  const content = $('game-content');
  content.innerHTML = `
    <!-- La clase "game-scene" es la misma que llevan las escenas de lobby
         del resto de modos (ver p.ej. #safari-lobby-scene): sin ella, el
         listener de 'pk-mode-launched' en eventListeners.js -que busca
         "#game-content .game-scene" para la pantalla completa
         automática- no encontraba nada mientras se estaba en el lobby, y
         la preferencia de Ajustes se quedaba sin efecto en este modo hasta
         llegar a la partida de verdad (donde #pokerus-field sí la lleva). -->
    <div class="pokerus-lobby-box game-scene" id="pokerus-lobby-scene">
      <div class="pokerus-lobby-head">
        <div class="big-count pixel" id="pokerus-count">0</div>
        <div style="color:var(--muted);font-size:12px;">jugadores apuntados (máx. ${POKERUS_MAX_PLAYERS}) · escribe <b style="color:var(--yellow)">!pokemon [nombre]</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:520px;margin:6px auto 0;line-height:1.6;">
          Un <b style="color:#7be08a">20%</b> del grupo empezará infectado por el Pokerus, en secreto.
          Cada noche elige una sala o quédate en la plaza: dormir con un infectado o a la intemperie
          puede contagiarte. El virus no muestra síntomas los 2 primeros días, se hace visible al 3º
          y mata al 5º.
        </div>
      </div>
      <div class="pokerus-lobby-grid" id="pokerus-lobby-grid">
        <div class="pokerus-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="pokerus-start-btn" id="pokerus-start-btn" disabled>▶ Comenzar Partida</button>
    </div>
  `;
  $('pokerus-start-btn').onclick = () => startPokerusMatch();
  renderPokerusLobbyGrid();
}

// Renderizado incremental: cada jugador tiene su propia tarjeta con un sprite
// PMD animado (igual que los caminantes del modo Arena) que se crea una sola
// vez y se conserva mientras esté en el lobby, en vez de reconstruir todo el
// grid (lo que destruiría y relanzaría las animaciones en cada apunte).
function renderPokerusLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('pokerus-lobby-grid');
  const countEl = $('pokerus-count');
  const btn = $('pokerus-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = `${players.length}/${POKERUS_MAX_PLAYERS}`;
  if (btn) btn.disabled = players.length < 2;

  if (players.length === 0) {
    grid.innerHTML = '<div class="pokerus-lobby-empty">Esperando a que el chat se apunte...</div>';
    return;
  }
  const emptyMsg = grid.querySelector('.pokerus-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    let entry = ms.lobbySprites[p.user];
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'pokerus-lobby-card';
      el.title = 'Clic para expulsar de la partida';
      const spriteId = 'pk-lobby-' + p.user.replace(/[^a-zA-Z0-9_-]/g, '');
      el.innerHTML = `
        <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
        <div class="p-name">${escapeHtml(p.pokemon.name)}</div>
        <div class="p-user">@${escapeHtml(p.user)}</div>
      `;
      // El streamer puede hacer clic en cualquier jugador inscrito para que
      // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleLobbyExpelPopover(ms, p.user, el, expelFromPokerusLobby);
      });
      grid.appendChild(el);
      const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
      sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      sprite.play('Walk', PMD_DIR.down, true, null, POKERUS_STAND_SPEED);
      ms.lobbySprites[p.user] = { el, sprite, dex: p.pokemon.sprite };
    } else if (entry.dex !== p.pokemon.sprite) {
      // El jugador cambió de Pokémon: se relanza la animación con el nuevo sprite.
      entry.sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      entry.sprite.play('Walk', PMD_DIR.down, true, null, POKERUS_STAND_SPEED);
      entry.dex = p.pokemon.sprite;
      const nameEl = entry.el.querySelector('.p-name');
      if (nameEl) nameEl.textContent = p.pokemon.name;
    }
  });
}

// Expulsa a un jugador inscrito del lobby (acción del streamer, no del
// propio usuario): se retira de la partida en curso y se le añade a
// expelledUsers para que no pueda volver a apuntarse con !pokemon hasta
// la siguiente partida (nueva llamada a startPokerus()).
function expelFromPokerusLobby(user) {
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
  renderPokerusLobbyGrid();
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handlePokerusCmd(user, cmd, parts) {
  const ms = state.modeState;
  if (!ms) return;

  if (cmd === '!pokemon') {
    if (ms.phase !== 'lobby') {
      if (ms.phase !== 'ended') addChatMessage(null, `${user}: la partida ya ha comenzado, ¡espera a la siguiente!`, 'system', { mirror: false });
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
    // rollShinyPokemon() devuelve una copia nueva (0.5% de isShiny:true, ver
    // js/pokemonShiny.js), nunca la entrada original compartida de
    // ARENA_POKEMON_DB.
    const pokemon = rollShinyPokemon(foundPokemon);
    // Si ya está apuntado, se le deja cambiar de Pokémon sin contar como
    // plaza nueva; el límite de jugadores solo aplica a quien se apunta
    // por primera vez.
    const isNew = !ms.players[user];
    if (isNew && ms.order.length >= POKERUS_MAX_PLAYERS) {
      addChatMessage(null, `${user}: el lobby de Pokerus ya está lleno (máximo ${POKERUS_MAX_PLAYERS} jugadores)`, 'system');
      return;
    }
    ms.players[user] = {
      user,
      pokemon,
      infected: false,
      infectionDay: null, // null = sano; 0-5 = días desde el contagio (ver etapas del virus)
      alive: true,
      doorId: null,
      elId: 'pk-' + user.replace(/[^a-zA-Z0-9_-]/g, ''),
    };
    if (isNew) ms.order.push(user);
    pmdPreload(pokemon.sprite);
    addChatMessage(null, `✅ ${user} se apunta con ${pokemon.name}!`, 'correct', { mirror: false });
    if (isNew) playVeJoin();
    renderPokerusLobbyGrid();
    return;
  }

  // Elección de puerta: solo cuenta si lleva "!" delante, ya sea como
  // número directo ("!3") o como comando ("!puerta 3"). Un número suelto
  // sin "!" ("3") NO cuenta, para no confundir charla normal del chat con
  // una elección de sala.
  if (ms.phase !== 'round') return;
  const player = ms.players[user];
  if (!player || !player.alive) return;

  // Dormir en la plaza (a la intemperie): "!plaza", "!0" o "!puerta 0/plaza".
  const wantsPlaza = cmd === '!plaza' || cmd === '!0'
    || (cmd === '!puerta' && /^(0|plaza)$/i.test(parts[1] || ''));
  if (wantsPlaza) {
    if (player.doorId == null) return; // ya está en la plaza
    assignPlayerToPlaza(user);
    addChatMessage(null, `🌌 ${user} decide dormir en la plaza esta noche`, 'action', { mirror: false });
    return;
  }

  let doorNum = null;
  if (/^!\d+$/.test(cmd)) {
    doorNum = parseInt(cmd.slice(1), 10);
  } else if (cmd === '!puerta') {
    doorNum = parseInt(parts[1], 10);
  } else {
    return;
  }
  if (!Number.isFinite(doorNum)) return;

  const door = ms.doors.find(d => d.id === doorNum);
  if (!door) {
    const inLayout = POKERUS_ROOM_LAYOUT.some(r => r.id === doorNum);
    const msg = inLayout
      ? `${user}: la puerta ${doorNum} está cerrada esta ronda. Puertas disponibles: ${ms.doors.map(d => '!' + d.id).join(', ')} (o !plaza para dormir fuera)`
      : `${user}: la puerta ${doorNum} no existe. Puertas disponibles: ${ms.doors.map(d => '!' + d.id).join(', ')} (o !plaza para dormir fuera)`;
    addChatMessage(null, msg, 'system');
    return;
  }
  if (player.doorId === door.id) return; // ya está de camino a (o dentro de) esa puerta
  if (door.occupants.length >= door.capacity) {
    addChatMessage(null, `❌ ${user}: la puerta ${doorNum} está llena (${door.capacity}/${door.capacity}). Prueba otra puerta o !plaza`, 'system');
    return;
  }
  assignPlayerToDoor(user, door);
  addChatMessage(null, `🚪 ${user} entra por la puerta ${doorNum}`, 'action', { mirror: false });
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA Y RONDAS
   --------------------------------------------------------- */
// Un jugador infectado solo se ve como tal (sprite verde, estado "Infectado")
// a partir de la etapa sintomática (día 3+); antes (días 0-2) está infectado
// mismo, pero sin ningún síntoma visible, tal y como pide el diseño del virus.
function isPokerusSymptomatic(p) {
  return !!p && p.infected && p.infectionDay != null && p.infectionDay >= POKERUS_DAY_SYMPTOMATIC;
}

function shuffledCopy(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Destruye y vacía el registro de sprites PMD indicado (lobby o mapa).
function destroyPokerusSprites(registry) {
  if (!registry) return;
  Object.values(registry).forEach(entry => {
    if (entry.arriveTimeout) clearTimeout(entry.arriveTimeout);
    if (entry.wanderTimeout) clearTimeout(entry.wanderTimeout);
    if (entry.sprite) entry.sprite.destroy();
  });
}

function startPokerusMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const users = ms.order.slice();
  if (users.length < 2) {
    toast('Se necesitan al menos 2 jugadores para empezar');
    return;
  }
  // El lobby (y sus sprites PMD) deja de existir al pasar a la primera ronda.
  destroyPokerusSprites(ms.lobbySprites);
  ms.lobbySprites = {};

  // 20% de los jugadores iniciales quedan infectados (mínimo 1, para que el
  // modo siempre tenga un brote real con el que arrancar).
  const infectedCount = Math.max(1, Math.round(users.length * 0.2));
  const shuffled = shuffledCopy(users);
  shuffled.slice(0, infectedCount).forEach(u => {
    const p = ms.players[u];
    p.infected = true;
    p.infectionDay = 0; // paciente cero: entra en Día 0 (etapa de infección)
  });

  ms.phase = 'round';
  ms.roundNumber = 0;
  ms.pokerus2Started = false;
  // La música de este modo no suena durante el lobby de inscripción (ahí
  // sigue la del menú principal): pokerus1.mp3 arranca justo aquí, al
  // cerrarse el lobby y empezar la partida de verdad (ver
  // MODES_WITHOUT_LOBBY_MUSIC en modeLauncher.js). El propio modo pasa
  // luego a 'pokerus2' al entrar un nuevo día con algún jugador ya
  // sintomático (ver más abajo, en startPokerusRound), y se queda sonando
  // esa para el resto de la partida.
  playModeMusic('pokerus1');
  playPokerusMatchStart();
  addChatMessage(null, `🧬 ¡Comienza el Pokerus con ${users.length} jugadores! ${infectedCount} de ellos ya están infectados en secreto...`, 'system', { mirror: false });
  startPokerusRound();
}

// Reparte el número y aforo de las puertas ABIERTAS para la ronda en función
// de cuántos jugadores siguen vivos. Reglas (fijadas por diseño):
//  - Cada sala abierta tiene aforo 2, 3 o 4.
//  - El aforo total de las salas abiertas es siempre >= al número de
//    jugadores vivos (nadie se queda sin sala esa noche).
//  - El aforo total nunca supera en más de un 20% ese número de jugadores
//    (el sobrante real, entre 0% y 20%, sale al azar cada ronda).
//  - Como mucho se abren las 10 salas del mapa (POKERUS_TOTAL_ROOMS); el
//    TAMAÑO y la UBICACIÓN de cada sala nunca dependen del número de
//    jugadores, son fijos (POKERUS_ROOM_LAYOUT) — lo único que varía por
//    ronda es cuáles de esas 10 posiciones se abren y el aforo de cada una.
function generatePokerusDoors(aliveCount) {
  const capacities = pickPokerusRoomCapacities(aliveCount);
  // Elige, al azar, cuáles de las 10 posiciones fijas alojan esta ronda las
  // salas abiertas, y las ordena por número de sala para que la lista de
  // puertas disponibles sea legible en el chat.
  const chosenRooms = shuffledCopy(POKERUS_ROOM_LAYOUT).slice(0, capacities.length)
    .sort((a, b) => a.id - b.id);

  return capacities.map((capacity, i) => {
    const room = chosenRooms[i];
    return { id: room.id, capacity, occupants: [], slots: {}, room };
  });
}

// Genera, al azar, una combinación de aforos (cada uno 2, 3 o 4) cuya suma
// sea >= "necessary" y no supere "necessary * 1.2". Prueba combinaciones al
// azar (construidas sumando salas una a una hasta cubrir a todo el mundo) y
// se queda con la primera que respeta el margen del 20%; así, en partidas
// iguales con el mismo número de jugadores, unas veces sobran 0 plazas y
// otras hasta un 20%, sin patrón fijo.
function pickPokerusRoomCapacities(necessary) {
  if (necessary <= 0) return [POKERUS_DOOR_CAPACITIES[0]];
  const maxTotal = necessary * 1.2;
  const MAX_ATTEMPTS = 400;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const combo = [];
    let sum = 0;
    while (sum < necessary && combo.length < POKERUS_TOTAL_ROOMS) {
      const cap = POKERUS_DOOR_CAPACITIES[Math.floor(Math.random() * POKERUS_DOOR_CAPACITIES.length)];
      combo.push(cap);
      sum += cap;
    }
    if (sum >= necessary && sum <= maxTotal) return combo;
  }
  // Fallback determinista: si en los intentos anteriores el azar no dio con
  // ninguna combinación dentro del margen del 20% (puede pasar con grupos
  // muy pequeños, donde ese margen es muy estrecho), se descompone
  // "necessary" de forma EXACTA en salas de 2/3/4 (0% de sobrante, así que
  // siempre respeta la regla). El único caso sin solución exacta es
  // necessary === 1 (no hay sala de aforo 1): se abre una única sala de 2,
  // el mínimo posible aunque technically implique más de un 20% de más.
  return exactPokerusDecomposition(necessary);
}

function exactPokerusDecomposition(n) {
  const combo = [];
  let remaining = n;
  while (remaining > 0 && combo.length < POKERUS_TOTAL_ROOMS) {
    if (remaining === 1) {
      // 1 no es descomponible en salas de 2/3/4: se absorbe ampliando la
      // última sala añadida (hasta un máximo de 4) o, si no hay ninguna
      // todavía, abriendo una sala de 2 (el caso necessary === 1).
      if (combo.length > 0 && combo[combo.length - 1] < 4) combo[combo.length - 1]++;
      else combo.push(2);
      break;
    }
    const cap = POKERUS_DOOR_CAPACITIES.slice().reverse().find(c => c <= remaining) || 2;
    combo.push(cap);
    remaining -= cap;
  }
  return combo;
}


// Posiciona el elemento decorativo de una sala según su área rectangular
// (xPct/yPct/wPct/hPct, ver POKERUS_ROOM_LAYOUT), en porcentaje sobre el
// mapa — así coincide siempre con el arte de fondo, sea cual sea el tamaño
// real de pantalla en el que se muestre.
function applyPokerusRoomPosition(el, room) {
  el.style.left = room.xPct + '%';
  el.style.top = room.yPct + '%';
  el.style.width = room.wPct + '%';
  el.style.height = room.hPct + '%';
}

// Límite (px) al que se puede acercar un sprite al borde del área jugable,
// para que nunca quede recortado por el marco del mapa.
const POKERUS_EDGE_MARGIN = 20;

function clampPx(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Tamaño (en píxeles) del área jugable actual, para calcular posiciones y
// distancias de los sprites libres que caminan por el mapa.
function pokerusFieldSize() {
  const floor = $('pokerus-field-floor');
  return floor ? { w: floor.clientWidth || 800, h: floor.clientHeight || 360 } : { w: 800, h: 360 };
}

// Convierte un área en porcentaje (xPct/yPct/wPct/hPct) en un rectángulo en
// píxeles, con el tamaño ACTUAL del mapa.
function pokerusAreaPx(area) {
  const { w, h } = pokerusFieldSize();
  return { x: (area.xPct / 100) * w, y: (area.yPct / 100) * h, w: (area.wPct / 100) * w, h: (area.hPct / 100) * h };
}

// Reparte "total" puestos en una rejilla centrada dentro del rectángulo en
// píxeles "rect", con una separación de como mucho "maxSpacing" px (se
// reduce si el rectángulo es más pequeño, para que ningún puesto se salga
// de su área). Se usa tanto para la plaza como para el interior de cada
// sala.
function pokerusGridSlot(rect, index, total, maxSpacing) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.ceil(total / cols);
  const spacingX = Math.min(maxSpacing, rect.w / (cols + 1));
  const spacingY = Math.min(maxSpacing, rect.h / (rows + 1));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const x = cx + (col - (cols - 1) / 2) * spacingX;
  const y = cy + (row - (rows - 1) / 2) * spacingY;
  return {
    x: clampPx(x, rect.x + POKERUS_EDGE_MARGIN, rect.x + rect.w - POKERUS_EDGE_MARGIN),
    y: clampPx(y, rect.y + POKERUS_EDGE_MARGIN, rect.y + rect.h - POKERUS_EDGE_MARGIN),
  };
}

// Punto (en px) donde debe colocarse el jugador i-ésimo (de "total") del
// grupo reunido en el centro del mapa (la plaza) al empezar la ronda.
function pokerusCenterAnchor(index, total) {
  const rect = pokerusAreaPx(POKERUS_PLAZA_AREA);
  return pokerusGridSlot(rect, index, total, 42);
}

// Punto (en px) donde debe quedarse de pie el ocupante que ocupa el hueco
// "slot" (0-based) de una puerta con capacidad "capacity": los huecos se
// reparten en rejilla, centrados dentro del área rectangular de la sala
// (room = entrada de POKERUS_ROOM_LAYOUT), sin salirse nunca de ella.
function pokerusDoorAnchor(room, slot, capacity) {
  const rect = pokerusAreaPx(room);
  return pokerusGridSlot(rect, slot, capacity, 34);
}

// Convierte el camino de una sala (POKERUS_PATHS[id], en % del mapa) en
// puntos en píxeles con el tamaño ACTUAL del mapa. "reverse" invierte el
// orden (usado al volver de la sala a la plaza).
function pokerusPathPx(roomId, reverse) {
  const raw = POKERUS_PATHS[roomId] || [];
  const pts = raw.map(p => {
    const { w, h } = pokerusFieldSize();
    return { x: (p.xPct / 100) * w, y: (p.yPct / 100) * h };
  });
  return reverse ? pts.slice().reverse() : pts;
}

// Dirección (PMD_DIR, 8 posiciones) que corresponde a moverse de (0,0) hacia
// (dx,dy) — usada para orientar el sprite mientras camina de verdad.
function pokerusDirFromDelta(dx, dy) {
  if (Math.hypot(dx, dy) < 4) return null;
  const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  const dirs = [PMD_DIR.right, PMD_DIR.downRight, PMD_DIR.down, PMD_DIR.downLeft, PMD_DIR.left, PMD_DIR.upLeft, PMD_DIR.up, PMD_DIR.upRight];
  return dirs[idx];
}

// Crea (destruyendo antes cualquier resto de la ronda anterior) un sprite
// libre por cada jugador vivo, reunidos en el centro del mapa: así arranca
// visualmente cada ronda, con todos los participantes a la vista.
function initPokerusRoundWalkers() {
  const ms = state.modeState;
  const floor = $('pokerus-field-floor');
  if (!ms || !floor) return;
  destroyPokerusSprites(ms.fieldSprites);
  ms.fieldSprites = {};

  const alivePlayers = ms.order.map(u => ms.players[u]).filter(p => p.alive);
  alivePlayers.forEach((p, i) => {
    const anchor = pokerusCenterAnchor(i, alivePlayers.length);
    const el = document.createElement('div');
    el.className = 'pokerus-walker';
    el.style.left = anchor.x + 'px';
    el.style.top = anchor.y + 'px';
    const spriteId = 'pk-walk-' + p.user.replace(/[^a-zA-Z0-9_-]/g, '');
    el.innerHTML = `
      <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
      <div class="pokerus-walker-tag">@${escapeHtml(p.user)}</div>
    `;
    floor.appendChild(el);
    const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
    sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
    sprite.play('Walk', PMD_DIR.down, true, null, POKERUS_STAND_SPEED);
    el.classList.toggle('infected', isPokerusSymptomatic(p));
    // "anchor" guarda CÓMO se calculó la posición (no solo el resultado en
    // píxeles) para poder recalcularla si cambia el tamaño del mapa (p.ej.
    // al entrar o salir de pantalla completa).
    ms.fieldSprites[p.user] = { el, sprite, x: anchor.x, y: anchor.y, dir: PMD_DIR.down, arriveTimeout: null, wanderTimeout: null, anchor: { type: 'center', index: i, total: alivePlayers.length } };
    // Empiezan a deambular lentamente por el centro del mapa (con retardo
    // inicial aleatorio para que no se muevan todos a la vez), y seguirán
    // haciéndolo hasta que el jugador elija puerta desde el chat.
    pokerusScheduleNextWander(p.user, 200 + Math.random() * 1400);
  });
}

// Activa o quita el efecto "verde radioactivo" del sprite libre de "user"
// sobre el mapa, según su estado de infección actual.
function updatePokerusInfectedVisual(user) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  const entry = ms && ms.fieldSprites && ms.fieldSprites[user];
  if (!p || !entry) return;
  entry.el.classList.toggle('infected', isPokerusSymptomatic(p));
}

// Resuelve a coordenadas (px) actuales el "anchor" lógico guardado para un
// caminante (su puesto en el centro del mapa, o su hueco dentro de una
// puerta), usando el tamaño ACTUAL del mapa. Así, si el mapa cambia de
// tamaño (pantalla completa), cada sprite puede recolocarse en su sitio
// correcto sin perder de vista dónde "lógicamente" está.
function pokerusResolveAnchor(anchor) {
  const ms = state.modeState;
  if (!ms || !anchor) return null;
  if (anchor.type === 'center') return pokerusCenterAnchor(anchor.index, anchor.total);
  if (anchor.type === 'door') {
    const door = ms.doors.find(d => d.id === anchor.doorId);
    if (!door) return null;
    const slot = door.slots[anchor.user] ?? 0;
    return pokerusDoorAnchor(door.room, slot, door.capacity);
  }
  return null;
}

// Recoloca instantáneamente (sin animación de paso) a todos los caminantes
// libres del mapa en su posición lógica actual, recalculada con el tamaño
// vigente del área jugable. Se llama al entrar/salir de pantalla completa
// (o al redimensionar la ventana), ya que las salas usan porcentajes y se
// adaptan solas, pero los caminantes se mueven con coordenadas en píxeles
// que quedarían obsoletas si no se recalculan.
function repositionPokerusField() {
  const ms = state.modeState;
  const floor = $('pokerus-field-floor');
  if (!ms || !floor || !ms.fieldSprites) return;
  Object.values(ms.fieldSprites).forEach(entry => {
    if (!entry || !entry.anchor) return;
    const pos = pokerusResolveAnchor(entry.anchor);
    if (!pos) return;
    clearTimeout(entry.arriveTimeout);
    entry.arriveTimeout = null;
    entry.el.style.transition = 'none';
    entry.el.style.left = pos.x + 'px';
    entry.el.style.top = pos.y + 'px';
    entry.x = pos.x;
    entry.y = pos.y;
    // Fuerza el reflow para que el "transition: none" surta efecto antes de
    // volver a permitir transiciones (así el próximo desplazamiento real sí
    // se anima con normalidad).
    void entry.el.offsetWidth;
    entry.el.style.transition = '';
  });
}

// Tras un cambio de tamaño (fullscreen o resize de ventana) el layout tarda
// uno o dos frames en asentarse; se espera con doble rAF antes de medir el
// mapa, para no recalcular con medidas todavía antiguas.
function schedulePokerusReposition() {
  requestAnimationFrame(() => requestAnimationFrame(repositionPokerusField));
}

// Indica si #pokerus-field está actualmente "en pantalla completa", ya sea
// por la API nativa (document.fullscreenElement, con sus variantes con
// prefijo) o por el modo simulado (clase .fs-fallback que aplica
// eventListeners.js cuando el navegador bloquea la API nativa en silencio,
// algo habitual en navegadores embebidos como OBS Browser Source).
function isPokerusFieldFullscreen(field) {
  if (!field) return false;
  return document.fullscreenElement === field
    || document.webkitFullscreenElement === field
    || document.msFullscreenElement === field
    || field.classList.contains('fs-fallback');
}

// Muestra u oculta el temporizador duplicado que vive dentro de
// #pokerus-field (el único que sigue visible en pantalla completa, ya que
// la barra de tiempo "normal" queda fuera de la escena). Se controla por
// JS en vez de confiar solo en el selector CSS ":fullscreen" / ".fs-fallback",
// para que funcione siempre, sea cual sea la vía (nativa o simulada) por la
// que el navegador haya entrado en pantalla completa.
function updatePokerusFsTimerVisibility() {
  const field = $('pokerus-field');
  const fsTimer = $('pokerus-fs-timer');
  if (!fsTimer) return;
  fsTimer.style.display = isPokerusFieldFullscreen(field) ? 'block' : 'none';
}

['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange', 'scenefsfallbackchange'].forEach(evt => {
  document.addEventListener(evt, schedulePokerusReposition);
  document.addEventListener(evt, updatePokerusFsTimerVisibility);
});
window.addEventListener('resize', schedulePokerusReposition);

// Hace que el sprite libre de "user" camine (con su animación Walk, orientada
// en la dirección real del movimiento) hasta el punto (targetX,targetY); al
// llegar, se queda de pie mirando hacia "standDir" (o hacia donde caminaba,
// si no se especifica). "opts" permite ajustar la velocidad del trayecto
// (usado por el deambular lento del centro del mapa) y recibir un aviso al
// llegar (onArrive).
function pokerusMoveWalker(user, targetX, targetY, standDir, opts = {}) {
  const ms = state.modeState;
  const entry = ms.fieldSprites && ms.fieldSprites[user];
  if (!entry) return;
  const pxPerSecond = opts.pxPerSecond || POKERUS_WALK_PX_PER_S;
  const animSpeed = opts.animSpeed || POKERUS_WALK_ANIM_SPEED;
  const dx = targetX - entry.x;
  const dy = targetY - entry.y;
  const dist = Math.hypot(dx, dy);
  const moveDir = pokerusDirFromDelta(dx, dy) ?? entry.dir;
  const finalStandDir = standDir ?? moveDir;
  const duration = Math.max(0.6, Math.min(3.4, dist / pxPerSecond));

  entry.sprite.play('Walk', moveDir, true, null, animSpeed);
  entry.dir = moveDir;
  entry.el.style.transition = `left ${duration}s linear, top ${duration}s linear`;
  // Fuerza el estilo actual antes de animar hacia el nuevo destino.
  void entry.el.offsetWidth;
  entry.el.style.left = targetX + 'px';
  entry.el.style.top = targetY + 'px';
  entry.x = targetX;
  entry.y = targetY;

  clearTimeout(entry.arriveTimeout);
  entry.arriveTimeout = setTimeout(() => {
    const cur = state.modeState;
    const e2 = cur && cur.fieldSprites && cur.fieldSprites[user];
    if (!e2) return;
    e2.sprite.play('Walk', finalStandDir, true, null, POKERUS_STAND_SPEED);
    e2.dir = finalStandDir;
    e2.arriveTimeout = null;
    if (opts.onArrive) opts.onArrive();
  }, duration * 1000);
}

// Hace que el sprite libre de "user" recorra una serie de puntos en orden
// (p.ej. el camino de una sala, ver POKERUS_PATHS) y termine en "finalPos",
// tramo a tramo, para que su recorrido siga el pasillo dibujado en el mapa
// en vez de cruzar en línea recta por encima de las paredes. Al llegar al
// final se queda de pie mirando hacia donde acaba de caminar (el tramo más
// natural), salvo que se indique "finalStandDir" explícitamente.
function pokerusMoveWalkerPath(user, waypoints, finalPos, finalStandDir, opts = {}) {
  const allPoints = [...waypoints, finalPos];
  let i = 0;
  function step() {
    const ms = state.modeState;
    const entry = ms && ms.fieldSprites && ms.fieldSprites[user];
    if (!entry || i >= allPoints.length) return;
    const pt = allPoints[i];
    const isLast = i === allPoints.length - 1;
    pokerusMoveWalker(user, pt.x, pt.y, isLast ? finalStandDir : null, {
      pxPerSecond: opts.pxPerSecond,
      animSpeed: opts.animSpeed,
      onArrive: () => {
        i++;
        if (isLast) { if (opts.onArrive) opts.onArrive(); }
        else step();
      },
    });
  }
  step();
}

/* ---------------------------------------------------------
   DEAMBULAR LENTO EN EL CENTRO DEL MAPA
   -----------------------------------------------------------
   Mientras un jugador siga "en el centro" (todavía no ha recibido ninguna
   orden de puerta por chat), su sprite no se queda quieto: pasea sin rumbo
   muy despacio alrededor de su puesto en el grupo central, con la animación
   Walk orientada hacia donde camina, y de vez en cuando se detiene unos
   segundos antes de seguir. En cuanto el jugador elige puerta
   (assignPlayerToDoor cambia su anchor a type:'door'), el deambular se
   detiene solo, porque cada paso comprueba que sigue en el centro.
   --------------------------------------------------------- */
function pokerusScheduleNextWander(user, delayMs) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[user];
  if (!entry || !entry.anchor || entry.anchor.type !== 'center') return;
  clearTimeout(entry.wanderTimeout);
  entry.wanderTimeout = setTimeout(() => pokerusWanderStep(user), delayMs);
}

function pokerusWanderStep(user) {
  const ms = state.modeState;
  const entry = ms && ms.fieldSprites && ms.fieldSprites[user];
  // Si ya no existe, o ya no está "en el centro" (ha recibido una orden de
  // puerta desde el chat), se deja de deambular.
  if (!entry || !entry.anchor || entry.anchor.type !== 'center') return;
  const player = ms.players[user];
  if (!player || !player.alive) return;

  const base = pokerusResolveAnchor(entry.anchor);
  if (!base) return;
  // El deambular se limita al área de la plaza (no a todo el mapa), para
  // que nadie se salga paseando hacia las salas o las paredes.
  const rect = pokerusAreaPx(POKERUS_PLAZA_AREA);
  const angle = Math.random() * Math.PI * 2;
  const dist = 12 + Math.random() * POKERUS_WANDER_RADIUS;
  const targetX = clampPx(base.x + Math.cos(angle) * dist, rect.x + POKERUS_EDGE_MARGIN, rect.x + rect.w - POKERUS_EDGE_MARGIN);
  const targetY = clampPx(base.y + Math.sin(angle) * dist, rect.y + POKERUS_EDGE_MARGIN, rect.y + rect.h - POKERUS_EDGE_MARGIN);

  pokerusMoveWalker(user, targetX, targetY, null, {
    pxPerSecond: POKERUS_WANDER_PX_PER_S,
    animSpeed: POKERUS_WALK_ANIM_SPEED,
    onArrive: () => {
      const stopping = Math.random() < POKERUS_WANDER_STOP_CHANCE;
      const pause = stopping
        ? POKERUS_WANDER_STOP_MIN_MS + Math.random() * (POKERUS_WANDER_STOP_MAX_MS - POKERUS_WANDER_STOP_MIN_MS)
        : POKERUS_WANDER_PAUSE_MIN_MS + Math.random() * (POKERUS_WANDER_PAUSE_MAX_MS - POKERUS_WANDER_PAUSE_MIN_MS);
      pokerusScheduleNextWander(user, pause);
    },
  });
}

// Asigna a "user" la puerta "door": lo saca de su puerta anterior (si tenía),
// le reserva el primer hueco libre de la nueva, y anima su sprite caminando
// desde donde esté hasta esa puerta.
function assignPlayerToDoor(user, door) {
  const ms = state.modeState;
  const player = ms.players[user];
  if (!player) return;

  let prevDoorId = null;
  if (player.doorId != null) {
    prevDoorId = player.doorId;
    const prevDoor = ms.doors.find(d => d.id === player.doorId);
    if (prevDoor) {
      const idx = prevDoor.occupants.indexOf(user);
      if (idx !== -1) prevDoor.occupants.splice(idx, 1);
      delete prevDoor.slots[user];
      updateRoomMeta(prevDoor);
    }
  }

  let slot = 0;
  const usedSlots = new Set(Object.values(door.slots));
  while (usedSlots.has(slot)) slot++;
  door.slots[user] = slot;
  door.occupants.push(user);
  player.doorId = door.id;
  updateRoomMeta(door);

  // El jugador acaba de recibir una orden real del chat: si seguía
  // deambulando sin rumbo por el centro, deja de hacerlo. Se cambia el
  // anchor a 'door' ANTES de moverlo para que, si el deambular llega a
  // ejecutarse una última vez por una carrera de timers, se detecte de
  // inmediato que ya no está "en el centro" y no haga nada.
  const entry = ms.fieldSprites && ms.fieldSprites[user];
  if (entry) {
    clearTimeout(entry.wanderTimeout);
    entry.wanderTimeout = null;
    entry.anchor = { type: 'door', doorId: door.id, user };
  }

  const anchor = pokerusDoorAnchor(door.room, slot, door.capacity);
  // Si venía de otra sala (cambia de puerta directamente, sin pasar antes
  // por !plaza), primero recorre el camino de salida de esa sala en sentido
  // inverso —el mismo que usó para entrar, del revés— y solo cuando termina
  // de recorrerlo del todo emprende el camino ordenado de entrada a la
  // nueva puerta. Si venía de la plaza, no hay camino que deshacer y va
  // directo por el camino de la nueva puerta, como antes.
  const waypoints = prevDoorId != null
    ? [...pokerusPathPx(prevDoorId, true), ...pokerusPathPx(door.id, false)]
    : pokerusPathPx(door.id, false);
  pokerusMoveWalkerPath(user, waypoints, anchor);
}

// Devuelve a "user" a la plaza (el centro del mapa): lo saca de su sala
// actual si tenía una, y su sprite camina de vuelta al puesto que le
// corresponde entre el resto de jugadores reunidos ahí, retomando el
// deambular lento propio de la plaza.
function assignPlayerToPlaza(user) {
  const ms = state.modeState;
  const player = ms.players[user];
  if (!player) return;

  let prevDoorId = null;
  if (player.doorId != null) {
    prevDoorId = player.doorId;
    const prevDoor = ms.doors.find(d => d.id === player.doorId);
    if (prevDoor) {
      const idx = prevDoor.occupants.indexOf(user);
      if (idx !== -1) prevDoor.occupants.splice(idx, 1);
      delete prevDoor.slots[user];
      updateRoomMeta(prevDoor);
    }
    player.doorId = null;
  }

  const alivePlayers = ms.order.map(u => ms.players[u]).filter(p => p.alive);
  const index = alivePlayers.findIndex(p => p.user === user);
  if (index === -1) return;
  const anchor = pokerusCenterAnchor(index, alivePlayers.length);

  const entry = ms.fieldSprites && ms.fieldSprites[user];
  if (entry) {
    entry.anchor = { type: 'center', index, total: alivePlayers.length };
    // Si venía de una sala, recorre su camino en sentido inverso (de la
    // puerta a la plaza) en vez de cruzar en línea recta.
    const waypoints = prevDoorId != null ? pokerusPathPx(prevDoorId, true) : [];
    pokerusMoveWalkerPath(user, waypoints, anchor, PMD_DIR.down, {
      onArrive: () => pokerusScheduleNextWander(user, 300 + Math.random() * 1000),
    });
  }
}

function startPokerusRound(prevOverlay) {
  const ms = state.modeState;
  if (!ms) return;
  const alivePlayers = ms.order.map(u => ms.players[u]).filter(p => p.alive);

  if (alivePlayers.length === 0) { endPokerus('extinct'); return; }
  if (!alivePlayers.some(p => p.infected)) { endPokerus('cured'); return; }

  ms.roundNumber++;
  // La música de fondo empieza sonando pokerus1.mp3 (ver startPokerusMatch,
  // que la arranca al cerrar el lobby). En cuanto se entra a un nuevo día
  // con algún jugador ya sintomático (día 3+ de infección, ver
  // isPokerusSymptomatic/POKERUS_DAY_SYMPTOMATIC) se sustituye por
  // pokerus2.mp3, y se queda sonando esa el resto de la partida (no vuelve
  // a pokerus1.mp3 aunque luego no quede nadie sintomático; no hay
  // pokerus3.mp3, etc.).
  if (!ms.pokerus2Started && alivePlayers.some(isPokerusSymptomatic)) {
    ms.pokerus2Started = true;
    playModeMusic('pokerus2');
  }
  ms.doors = generatePokerusDoors(alivePlayers.length);
  alivePlayers.forEach(p => { p.doorId = null; });
  ms.timeLeft = POKERUS_CHOOSE_SECONDS;

  renderPokerusRound(prevOverlay);
  addChatMessage(null, `🚪 Ronda ${ms.roundNumber}: ${ms.doors.length} puertas abiertas (aforo ${ms.doors.map(d => d.capacity).join('/')}). ¡Escribe el número de tu puerta con ! delante (ej: !3), o !plaza para dormir fuera!`, 'system');

  clearInterval(ms.timer);
  ms.timer = setInterval(() => {
    ms.timeLeft--;
    const timeLabel = Math.max(0, ms.timeLeft) + 's';
    // El temporizador ya no muestra ninguna barra de progreso: solo el
    // icono del cronómetro (fijo en el HTML) y el número de segundos
    // restantes, aquí y en su duplicado de pantalla completa.
    const timeText = $('pokerus-timer-text');
    if (timeText) timeText.textContent = timeLabel;
    // Duplicado del temporizador dentro de la propia escena (#pokerus-field):
    // es el único que sigue visible cuando la sala entra en pantalla
    // completa, ya que la barra superior queda fuera del elemento que pasa
    // a pantalla completa.
    const fsText = $('pokerus-fs-timer-text');
    if (fsText) fsText.textContent = timeLabel;
    // Aviso sonoro de que queda poco tiempo: un pitido de cuenta atrás en
    // cada uno de los últimos 5 segundos de la ronda (más urgente en el
    // segundo final), para que se note incluso sin mirar la pantalla.
    if (ms.timeLeft > 0 && ms.timeLeft <= 5) playCountdownBeep(ms.timeLeft);
    if (ms.timeLeft <= 0) {
      clearInterval(ms.timer);
      resolvePokerusRound();
    }
  }, 1000);
}

/* ---------------------------------------------------------
   RENDER DE LA RONDA
   --------------------------------------------------------- */
const POKERUS_LOG_PLACEHOLDER = '<p style="color:var(--muted);font-style:italic;">¡Elegid puerta antes de que se acabe el tiempo!</p>';

function renderPokerusRound(prevOverlay) {
  const content = $('game-content');
  const ms = state.modeState;
  const alivePlayers = ms.order.map(u => ms.players[u]).filter(p => p.alive);
  const infectedCount = alivePlayers.filter(p => p.infected).length;

  // IMPORTANTE: #pokerus-field es el elemento que entra en pantalla completa
  // (.game-scene). Si en cada ronda se reconstruyera con content.innerHTML,
  // el navegador destruye ese nodo y sale de pantalla completa automáticamente
  // (así funciona la Fullscreen API: si el elemento en pantalla completa se
  // elimina del documento, se sale de pantalla completa). Por eso, a partir
  // de la segunda ronda, el nodo #pokerus-field NUNCA se recrea: solo se
  // actualiza su contenido en el sitio.
  let field = $('pokerus-field');

  if (!field) {
    // Primera ronda de la partida: se construye toda la escena desde cero.
    // El temporizador no lleva ninguna barra de progreso: solo el icono del
    // cronómetro y el número de segundos que quedan.
    content.innerHTML = `
      <div class="pokerus-wrap">
        <div class="pokerus-topbar">
          <div class="stat">🌀 Ronda: <b id="pokerus-round-num">${ms.roundNumber}</b></div>
          <div class="stat">🟢 Vivos: <b id="pokerus-alive-count">${alivePlayers.length}</b></div>
          <div class="stat pokerus-infected-stat">🦠 Infectados: <b id="pokerus-infected-count">${infectedCount}</b></div>
          <div class="stat pokerus-timer-stat"><span class="pokerus-timer-icon">⏱️</span><b id="pokerus-timer-text">${ms.timeLeft}s</b></div>
        </div>
        <div class="pokerus-field game-scene" id="pokerus-field">
          <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
          <div class="pokerus-field-fs-timer" id="pokerus-fs-timer">
            <span class="pokerus-timer-icon">⏱️</span><b id="pokerus-fs-timer-text">${ms.timeLeft}s</b>
          </div>
          <div class="pokerus-field-floor" id="pokerus-field-floor"></div>
        </div>
        <div class="pokerus-info-grid">
          <div class="ranking-panel" id="pokerus-status-panel">
            <div class="ranking-title">🧪 Estado de los jugadores</div>
            <div id="pokerus-status-list"></div>
          </div>
          <div class="battle-log" id="pokerus-log">${POKERUS_LOG_PLACEHOLDER}</div>
        </div>
      </div>
    `;
    field = $('pokerus-field');
  } else {
    // Rondas siguientes: se actualiza el contenido EN el mismo nodo, sin
    // tocar #pokerus-field, para conservar el estado de pantalla completa.
    const roundNumEl = $('pokerus-round-num');
    if (roundNumEl) roundNumEl.textContent = ms.roundNumber;
    const aliveEl = $('pokerus-alive-count');
    if (aliveEl) aliveEl.textContent = alivePlayers.length;
    const infEl = $('pokerus-infected-count');
    if (infEl) infEl.textContent = infectedCount;
    const timerText = $('pokerus-timer-text');
    if (timerText) timerText.textContent = ms.timeLeft + 's';
    const fsTimerText = $('pokerus-fs-timer-text');
    if (fsTimerText) fsTimerText.textContent = ms.timeLeft + 's';
    const log = $('pokerus-log');
    if (log) log.innerHTML = POKERUS_LOG_PLACEHOLDER;
    // El overlay negro con el resumen de la noche anterior (prevOverlay) NO
    // se retira aquí de golpe: se reutiliza más abajo para el fundido
    // inverso de vuelta al mapa. Solo se limpia aquí algún overlay
    // "huérfano" que no sea ese (no debería darse; es un resguardo).
    field.querySelectorAll('.pokerus-fade-overlay').forEach(el => {
      if (el !== prevOverlay) el.remove();
    });
  }

  // El suelo se reconstruye entero cada ronda (salas y caminantes son
  // efímeros), pero el "muro" que lo contiene (#pokerus-field) no se toca.
  const floor = $('pokerus-field-floor');
  if (floor) {
    const pz = POKERUS_PLAZA_AREA;
    const centerLeft = (pz.xPct + pz.wPct / 2).toFixed(2);
    const centerTop = (pz.yPct + pz.hPct / 2).toFixed(2);
    floor.innerHTML = `
      <div class="pokerus-plaza-zone" style="left:${pz.xPct}%; top:${pz.yPct}%; width:${pz.wPct}%; height:${pz.hPct}%;"></div>
      ${POKERUS_TORCH_POSITIONS.map((t, i) => `<div class="pokerus-torch-glow" style="left:${t.xPct}%; top:${t.yPct}%; animation-delay:${(i * 0.4).toFixed(2)}s;"></div>`).join('')}
      <div class="pokerus-field-center" style="left:${centerLeft}%; top:${centerTop}%;">
        <div class="pokerus-field-hint">Escribe el número de puerta con ! delante<br><span>ej: <b>!3</b> o <b>!puerta 3</b> · quédate aquí o escribe <b>!plaza</b> para dormir fuera</span></div>
      </div>
    `;
  }
  renderPokerusRooms();
  initPokerusRoundWalkers();
  renderPokerusStatusList();

  if (prevOverlay && prevOverlay.isConnected) {
    // Fin de la noche: en vez de crear un overlay nuevo, se reutiliza el
    // MISMO overlay negro que tapó la pantalla al caer la noche (ver
    // pokerusFadeToNight) y que todavía muestra el resumen ("Día X"). Con
    // el mapa de la nueva ronda ya montado debajo, quitarle la clase "show"
    // dispara la MISMA transición CSS que el fundido a negro de entrada,
    // pero en sentido inverso: el resumen se desvanece a la vez que aparece
    // el mapa, en un único fundido suave y simétrico ("fundido a negro
    // inverso"), sin ningún salto ni overlay adicional de por medio.
    void prevOverlay.offsetWidth; // fuerza el reflow antes de revertir la clase
    prevOverlay.classList.remove('show');
    setTimeout(() => prevOverlay.remove(), POKERUS_NIGHT_FADE_MS + 100);
  } else {
    // Primera ronda de la partida: no hay noche previa que desvanecer, así
    // que la escena arranca cubierta de negro y se desvanece justo después
    // de estar montada, para que la entrada nunca sea un salto brusco.
    const enterOverlay = document.createElement('div');
    enterOverlay.className = 'pokerus-round-enter-overlay';
    enterOverlay.id = 'pokerus-round-enter';
    field.appendChild(enterOverlay);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      enterOverlay.classList.add('hide');
      setTimeout(() => enterOverlay.remove(), POKERUS_ROUND_ENTER_FADE_MS + 100);
    }));
  }
}

// Crea el decorado (etiqueta con el nombre y el aforo) de las 10 salas
// fijas del mapa. Las que están en ms.doors esta ronda se dibujan ABIERTAS
// (con su nombre y aforo); las 10 - ms.doors.length restantes se dibujan
// CERRADAS (solo la etiqueta "CERRADA", sin función), siempre en su misma
// posición fija — así las 10 salas están siempre presentes en el mapa,
// jueguen los jugadores que jueguen.
function renderPokerusRooms() {
  const ms = state.modeState;
  const floor = $('pokerus-field-floor');
  if (!ms || !floor) return;
  ms.roomEls = {};
  const openById = new Map(ms.doors.map(d => [d.id, d]));
  POKERUS_ROOM_LAYOUT.forEach(room => {
    const door = openById.get(room.id);
    const isOpen = !!door;
    const roomEl = document.createElement('div');
    roomEl.className = 'pokerus-room' + (isOpen ? '' : ' closed');
    roomEl.id = 'pokerus-room-' + room.id;
    roomEl.innerHTML = `
      <div class="pokerus-room-tag">
        <div class="pokerus-room-label pixel">${isOpen ? 'SALA ' + room.id : 'CERRADA'}</div>
        ${isOpen ? '<div class="pokerus-room-cap"></div>' : ''}
      </div>
    `;
    floor.appendChild(roomEl);
    applyPokerusRoomPosition(roomEl, room);
    if (isOpen) {
      ms.roomEls[room.id] = { roomEl, capEl: roomEl.querySelector('.pokerus-room-cap') };
      updateRoomMeta(door);
    }
  });
}

function updateRoomMeta(door) {
  const ms = state.modeState;
  const room = ms.roomEls && ms.roomEls[door.id];
  if (!room) return;
  room.capEl.textContent = `${door.occupants.length}/${door.capacity}`;
  room.roomEl.classList.toggle('full', door.occupants.length >= door.capacity);
}

function renderPokerusStatusList() {
  const ms = state.modeState;
  const list = $('pokerus-status-list');
  if (!ms || !list) return;
  const players = ms.order.map(u => ms.players[u]);
  if (players.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);">Sin jugadores</div>';
    return;
  }
  list.innerHTML = players.map(p => {
    let icon = '💚', label = 'Sano', cls = 'ok';
    if (!p.alive) { icon = '☠️'; label = 'Eliminado'; cls = 'dead'; }
    else if (isPokerusSymptomatic(p)) { icon = '🦠'; label = 'Infectado'; cls = 'infected'; }
    return `
      <div class="pokerus-status-row ${cls}">
        <img src="${getPokemonSprite(p.pokemon.sprite)}" alt="">
        <span>@${p.user}</span>
        <span class="pokerus-status-badge">${icon} ${label}</span>
      </div>
    `;
  }).join('');
}

function pokerusLog(text, cls = '') {
  const log = $('pokerus-log');
  if (!log) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}

/* ---------------------------------------------------------
   FUNDIDO A NEGRO Y RESUMEN DE RONDA
   -----------------------------------------------------------
   Igual que la transición de noche del modo Zoroarks (ver
   zorShowNightTransition/zorPlayNightMessages en zoroarks.js): primero la
   pantalla se funde del todo a negro (POKERUS_NIGHT_FADE_MS) y SOLO
   entonces, con el mapa ya completamente oculto, se resuelve la noche
   (contagios, progresión de la enfermedad y muertes); así ningún cambio
   (un sprite que se vuelve verde, una puerta que se vacía) llega a verse
   en el mapa antes del fundido. Sobre ese fondo negro se muestran, uno
   detrás de otro y con un breve fundido entre ambos, dos mensajes: primero
   cuántos han muerto esa noche, después el día que empieza ("Día X"). Al
   terminar el segundo se llama a onDone, que arranca la siguiente ronda
   (o la pantalla final, según corresponda).
   --------------------------------------------------------- */
function pokerusPlayNightMessages(overlay, messages, onDone) {
  const ms = state.modeState;
  const content = overlay && overlay.querySelector('.pokerus-fade-content');
  if (!ms || !content) { onDone(); return; }

  let i = 0;
  const showNext = () => {
    if (i >= messages.length) { onDone(); return; }
    const msg = messages[i];
    content.innerHTML = msg.html;
    content.classList.remove('show');
    void content.offsetWidth; // fuerza el reflow para que el fundido de entrada se aplique
    content.classList.add('show');
    if (msg.onShow) msg.onShow();
    i++;
    clearTimeout(ms.autoAdvanceTimeout);
    ms.autoAdvanceTimeout = setTimeout(() => {
      if (i >= messages.length) { onDone(); return; }
      content.classList.remove('show');
      ms.autoAdvanceTimeout = setTimeout(showNext, POKERUS_NIGHT_MSG_FADE_MS);
    }, msg.holdMs);
  };
  showNext();
}

// Primer paso de la transición de noche: crea el overlay negro (todavía
// sin contenido, ver pokerusPlayNightMessages) y lo funde a opacidad 1;
// solo cuando ese fundido termina (POKERUS_NIGHT_FADE_MS) se llama a
// "onBlack", con la pantalla ya completamente a negro.
function pokerusFadeToNight(onBlack) {
  const ms = state.modeState;
  const field = $('pokerus-field');
  if (!ms || !field) { onBlack(null); return; }

  playPokerusNightFall();
  const overlay = document.createElement('div');
  overlay.className = 'pokerus-fade-overlay';
  overlay.innerHTML = '<div class="pokerus-fade-content"></div>';
  field.appendChild(overlay);
  // Doble rAF para asegurar que el navegador pinta antes el estado inicial
  // (opacidad 0) antes de añadir la clase que dispara la transición CSS.
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

  clearTimeout(ms.autoAdvanceTimeout);
  ms.autoAdvanceTimeout = setTimeout(() => onBlack(overlay), POKERUS_NIGHT_FADE_MS);
}

/* ---------------------------------------------------------
   RESOLUCIÓN DE LA RONDA
   --------------------------------------------------------- */
function resolvePokerusRound() {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'resolving';
  pokerusLog('🌙 ¡Cae la noche!', 'crit');

  // La pantalla se funde a negro ANTES de calcular nada: la resolución de
  // la noche (contagios, síntomas, muertes) ocurre ya con el mapa oculto.
  pokerusFadeToNight(overlay => resolvePokerusNightEvents(overlay));
}

function resolvePokerusNightEvents(overlay) {
  const ms = state.modeState;
  if (!ms) return;

  const alivePlayers = ms.order.map(u => ms.players[u]).filter(p => p.alive);

  // Se recuerda quién se contagia justo esta noche (newlyInfectedUsers):
  // entra en Día 0 y no avanza de día hasta la noche siguiente.
  const newlyInfectedUsers = new Set();

  // 1) Contagio en las salas: el riesgo depende de cuántos infectados haya
  // dentro (ver POKERUS_INFECT_CHANCE_*), no de si hay "al menos uno".
  ms.doors.forEach(door => {
    if (door.occupants.length === 0) return;
    const infectedOccupants = door.occupants.filter(u => ms.players[u].infected);
    if (infectedOccupants.length === 0) return;
    const chance = infectedOccupants.length >= 2 ? POKERUS_INFECT_CHANCE_MULTI_SICK : POKERUS_INFECT_CHANCE_ONE_SICK;
    const susceptible = door.occupants.filter(u => !ms.players[u].infected);
    const newlyInfected = [];
    susceptible.forEach(u => {
      if (Math.random() < chance) {
        const p = ms.players[u];
        p.infected = true;
        p.infectionDay = 0;
        newlyInfected.push(u);
        newlyInfectedUsers.add(u);
      }
    });
    const pct = Math.round(chance * 100);
    if (newlyInfected.length > 0) {
      pokerusLog(`🦠 Puerta ${door.id}: ${infectedOccupants.length} infectado(s) dentro (${pct}% de riesgo). Se contagian: ${newlyInfected.map(u => '@' + u).join(', ')}`, 'dmg');
    } else if (susceptible.length > 0) {
      pokerusLog(`🍀 Puerta ${door.id}: ${infectedOccupants.length} infectado(s) dentro (${pct}% de riesgo), pero nadie se contagia esta noche`, '');
    } else {
      pokerusLog(`🦠 Puerta ${door.id}: todos los ocupantes ya estaban infectados`, 'dmg');
    }
  });

  // 2) Contagio en la plaza: quien no haya entrado en ninguna sala (por
  // elección, con !plaza, o por no elegir a tiempo) duerme a la intemperie,
  // con un riesgo fijo de contagio.
  const plazaPlayers = alivePlayers.filter(p => p.doorId == null);
  if (plazaPlayers.length > 0) {
    const plazaSusceptible = plazaPlayers.filter(p => !p.infected);
    const plazaNewlyInfected = [];
    plazaSusceptible.forEach(p => {
      if (Math.random() < POKERUS_INFECT_CHANCE_PLAZA) {
        p.infected = true;
        p.infectionDay = 0;
        plazaNewlyInfected.push(p.user);
        newlyInfectedUsers.add(p.user);
      }
    });
    const pct = Math.round(POKERUS_INFECT_CHANCE_PLAZA * 100);
    if (plazaNewlyInfected.length > 0) {
      pokerusLog(`🌌 Plaza: dormir a la intemperie tiene sus riesgos (${pct}%). Se contagian: ${plazaNewlyInfected.map(u => '@' + u).join(', ')}`, 'dmg');
    } else {
      pokerusLog(`🌌 Plaza: ${plazaPlayers.length} jugador(es) durmieron fuera sin contagiarse esta noche`, '');
    }
  }

  // 3) Progresión de la enfermedad: cada infectado que ya lo estaba ANTES de
  // esta noche avanza un día. Quien se acaba de contagiar esta misma noche
  // se queda en Día 0 (no avanza hasta la próxima). Al llegar al día
  // sintomático se revela; al llegar al día de muerte, muere sin más tiradas.
  let diedThisRound = 0;
  const diedUsers = [];
  const progressing = ms.order.map(u => ms.players[u])
    .filter(p => p.alive && p.infected && !newlyInfectedUsers.has(p.user));
  progressing.forEach(p => {
    p.infectionDay++;
    if (p.infectionDay === POKERUS_DAY_SYMPTOMATIC) {
      pokerusLog(`😷 @${p.user} (${p.pokemon.name}) empieza a mostrar síntomas visibles de Pokerus`, 'dmg');
      addChatMessage(null, `😷 @${p.user} empieza a mostrar síntomas de Pokerus`, 'wrong', { mirror: false });
    }
    if (p.infectionDay >= POKERUS_DAY_DEATH) {
      p.alive = false;
      diedThisRound++;
      diedUsers.push(p.user);
      pokerusLog(`💀 @${p.user} (${p.pokemon.name}) llega al día ${p.infectionDay} de Pokerus y muere`, 'crit');
    }
  });
  if (diedUsers.length > 0) {
    addChatMessage(null, `💀 ${diedUsers.length > 1 ? 'Mueren' : 'Muere'} por el Pokerus: ${diedUsers.map(u => '@' + u).join(', ')}`, 'wrong');
  }

  ms.order.forEach(u => updatePokerusInfectedVisual(u));
  renderPokerusStatusList();
  const aliveEl = $('pokerus-alive-count');
  const infEl = $('pokerus-infected-count');
  const aliveNow = ms.order.map(u => ms.players[u]).filter(p => p.alive);
  const infectedAliveNow = aliveNow.filter(p => p.infected).length;
  if (aliveEl) aliveEl.textContent = aliveNow.length;
  if (infEl) infEl.textContent = infectedAliveNow;

  // Sobre el fondo ya completamente en negro (el mismo overlay creado por
  // pokerusFadeToNight) se muestran, uno detrás de otro, solo el número de
  // muertos de esta noche y después el día que empieza; nadie llega a ver
  // el mapa cambiar, solo estos dos mensajes ya resueltos.
  const dayNumber = ms.roundNumber + 1;
  pokerusPlayNightMessages(overlay, [
    { html: `<div class="pokerus-fade-stat dmg">💀 Muertes esta noche: <b>${diedThisRound}</b></div>`, holdMs: POKERUS_NIGHT_DEATHS_HOLD_MS },
    { html: `<div class="pokerus-fade-title pixel">Día ${dayNumber}</div>`, holdMs: POKERUS_NIGHT_DAY_HOLD_MS, onShow: playPokerusDayStart },
  ], () => {
    if (aliveNow.length === 0) { endPokerus('extinct'); return; }
    if (!aliveNow.some(p => p.infected)) { endPokerus('cured'); return; }
    ms.phase = 'round';
    startPokerusRound(overlay);
  });
}

/* ---------------------------------------------------------
   FIN DE PARTIDA
   --------------------------------------------------------- */
function endPokerus(result) {
  const ms = state.modeState;
  if (!ms) return;
  ms.phase = 'ended';
  clearInterval(ms.timer);
  clearTimeout(ms.autoAdvanceTimeout);
  ms.timer = null;
  ms.autoAdvanceTimeout = null;
  destroyPokerusSprites(ms.fieldSprites);
  ms.fieldSprites = {};

  const survivors = ms.order.map(u => ms.players[u]).filter(p => p.alive);

  if (result === 'cured') {
    survivors.forEach(p => addScore(p.user, 400));
    addChatMessage(null, `💚 ¡El Pokerus ha sido erradicado! Sobreviven ${survivors.length} jugadores`, 'correct');
    playPokerusVictory();
  } else {
    addChatMessage(null, '☠️ El Pokerus acaba con todos los jugadores...', 'wrong');
    playPokerusDefeat();
  }

  const listHtml = survivors.length === 0
    ? '<p style="font-size:12px;color:var(--muted);text-align:center;">Nadie sobrevivió a esta partida.</p>'
    : '<div class="modal-stats-list">' + survivors.map((p, i) => `
        <div class="modal-stats-row ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
          <span class="modal-stats-pos">${i + 1}</span>
          <span class="modal-stats-name">@${escapeHtml(p.user)} (${escapeHtml(p.pokemon.name)})</span>
          <span class="modal-stats-count">+400 pts</span>
        </div>
      `).join('') + '</div>';

  showModal(
    result === 'cured' ? '💚 ¡Pokerus erradicado!' : '☠️ Brote sin supervivientes',
    (result === 'cured'
      ? `<p>Tras ${ms.roundNumber} rondas, ya no queda nadie infectado.</p>`
      : `<p>Tras ${ms.roundNumber} rondas, el Pokerus ha eliminado a todos los jugadores.</p>`) + listHtml,
    [
      { label: '🔁 Volver a jugar', class: 'btn-primary', onClick: startPokerus },
      { label: 'Volver al menú', class: 'btn-secondary', onClick: backToMenu },
    ]
  );
}
