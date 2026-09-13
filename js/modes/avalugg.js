import { addChatMessage, escapeHtml } from '../chat.js';
import { playVeJoin, playAvaluggVictory, playAvaluggMatchStart, playAvaluggFall, playModeMusic } from '../audio.js';
import { applyOwNpcSprite, getRandomOwNpc } from '../data/owNpcDb.js';
import { currentFullscreenElement, requestSceneFullscreen } from '../fullscreen.js';
import { toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { backToMenu } from '../modeLauncher.js';
import { OwWalker } from '../owWalker.js';
import { state } from '../state.js';
import { $, addScore, toast } from '../utils.js';

/* =========================================================
   MODO GLACIAL AVALUGG
   -----------------------------------------------------------
   - Lobby: los viewers se apuntan con !participo. A cada uno se le
     asigna un sprite OW de NPC (igual que en Vista Lince / Control de
     Extranjería), mostrado en una tarjeta dentro de la cuadrícula de
     apuntados.
   - Mapa: una cuadrícula interna de AVL_ROWS (alto) x AVL_COLS (ancho).
     El 10% superior de la escena es solo fondo decorativo (cielo/
     montañas) y NO forma parte de la cuadrícula jugable, que ocupa el
     90% restante.
   - Al empezar la partida, todos los jugadores "entran andando" desde
     el extremo izquierdo de la pantalla y se reparten (una fila al
     azar cada uno, sin repetir mientras haya huecos) en la SEGUNDA
     columna (AVL_START_COL), que junto con la primera nunca se puede
     romper.
   - Desde la TERCERA columna hasta la ÚLTIMA (AVL_BREAK_MIN_COL ..
     AVL_LAST_COL) todas las casillas son hielo quebradizo: antes de que
     empiece la partida (nunca durante) se precalcula por completo, al
     azar, un único camino de casillas "correctas" que nunca se rompen y
     que es el ÚNICO que llega hasta las 3 filas centrales de la última
     columna (el trofeo); puede entrar a la meta desde la izquierda,
     desde arriba o desde abajo, también al azar. Puede haber
     ramificaciones y caminos señuelo que lleguen lejos, pero solo ese
     camino principal conecta de verdad con la meta. En todo el tablero,
     ningún tramo recto (arriba/abajo/derecha) mide más de 5 casillas
     seguidas, y en ningún punto el camino seguro llega a tener 2 (o más)
     casillas de ancho en paralelo. Ese camino NUNCA se muestra a los
     jugadores: todas las casillas del hielo quebradizo se ven
     exactamente igual hasta que alguien las pisa.
   - Comandos de movimiento: !<letras wasd>, p.ej. "!a" (1 paso a la
     izquierda) o "!aasaa" (2 izquierda, 1 abajo, 2 izquierda). Cada
     letra mueve al jugador una casilla; se procesan en orden, UNA
     casilla a la vez (con animación de "andar" de por medio, ver
     OwWalker), y si en algún paso intermedio el jugador pisa una
     casilla incorrecta o cae fuera de la cuadrícula, se corta ahí el
     resto del comando. Si llega un nuevo comando mientras el jugador
     todavía está a mitad de una animación de movimiento, sus letras
     se encolan y se procesan en cuanto el paso actual termina.
   - Si un jugador pisa una casilla incorrecta del hielo quebradizo,
     esa casilla se rompe (queda visualmente hundida/agrietada para
     siempre: cualquiera que la pise después también caerá) y el
     jugador es reubicado en una fila aleatoria de la segunda columna.
   - Gana el primer jugador que toque cualquiera de las 3 filas
     centrales de la última columna (el trofeo). Termina la partida.
   ========================================================= */

const AVL_ROWS = 14;
const AVL_COLS = 20;
const AVL_START_COL = 1;       // segunda columna (0-indexado): donde reaparecen/empiezan los jugadores
const AVL_BREAK_MIN_COL = 2;   // tercera columna: a partir de aquí todo es hielo quebradizo
const AVL_LAST_COL = AVL_COLS - 1; // última (vigésima) columna: ahí está el trofeo
const AVL_CENTER_ROWS = [5, 6, 7]; // 3 filas centrales de la última columna (de 14 filas: 0-13)
const AVL_FALL_ANIM_MS = 420;  // debe casar con la animación CSS "avlFall"
const AVL_ENTRANCE_MS = 20;    // pequeño respiro antes de animar la entrada (para que el navegador pinte el estado "fuera de pantalla")
const AVL_ENTRANCE_WALK_MS = 1400; // duración de la entrada caminando desde fuera de pantalla (debe casar con la transición inline que se aplica en ese momento)
const AVL_STEP_MS = 520;       // duración de cada paso individual (una casilla) de una animación de movimiento
const AVL_MAX_MOVE_LETTERS = 60; // límite de seguridad por si alguien manda un comando absurdamente largo
const AVL_MAX_QUEUE_LETTERS = 120; // límite de seguridad para la cola de movimientos pendientes de un jugador

const AVL_DIR = {
  w: [-1, 0], // arriba
  s: [1, 0],  // abajo
  a: [0, -1], // izquierda
  d: [0, 1],  // derecha
};
const AVL_DIR_NAME = {
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

function sanitizeUser(user) {
  return user.replace(/[^a-zA-Z0-9_-]/g, '');
}

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isAvaluggTrophy(row, col) {
  return col === AVL_LAST_COL && AVL_CENTER_ROWS.includes(row);
}

const AVL_MAX_RUN = 5; // máximo de casillas seguidas en la misma dirección (arriba/abajo/derecha); se respeta SIEMPRE (camino principal, ramificaciones y señuelos), nunca hay un tramo recto de más de 5 casillas
const AVL_DECOY_MIN = 5; // mínimo de caminos señuelo por partida
const AVL_DECOY_MAX = 9; // máximo de caminos señuelo por partida
const AVL_BRANCH_COUNT = 5; // formas de llegar al camino principal desde la 1ª columna quebradiza
const AVL_BRANCH_MAX_JOIN_COL = 5; // columna límite (inclusive) en la que una ramificación debe haberse unido ya al camino principal

// Comprueba si colocar una casilla segura en (row, col) completaría un
// bloque de 2x2 casillas todas seguras, es decir, un tramo de camino de
// 2 (o más) casillas de ancho en paralelo. Se consulta contra TODO lo que
// ya es seguro en la partida en el momento de la llamada (lo que llevamos
// generado del camino principal + ramificaciones + señuelos), así que
// ninguna combinación de hebras puede terminar formando un pasillo ancho,
// aunque provengan de caminos distintos que se crucen.
function formsWideBlock(row, col, safeSet) {
  if (!safeSet) return false;
  const has = (r, c) => safeSet.has(r + ',' + c);
  const origins = [[row - 1, col - 1], [row - 1, col], [row, col - 1], [row, col]];
  return origins.some(([r0, c0]) => (
    [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]]
      .every(([r, c]) => (r === row && c === col) || has(r, c))
  ));
}

// Anda una "hebra" de casillas seguras, casilla a casilla, desde
// (startRow, startCol) hasta que la columna llega a colLimit (sin incluirla
// como límite: se detiene justo AL llegar a esa columna). Si capRuns es
// true (por defecto), nunca se mueve más de AVL_MAX_RUN casillas seguidas
// en la misma dirección (derecha, arriba o abajo); si es false, esa regla
// se puede saltar libremente (para las ramificaciones tempranas, que
// necesitan poder converger sí o sí en muy pocas columnas). Si se pasa
// targetRow, el serpenteo vertical se sesga hacia esa fila y se fuerza la
// convergencia exacta según van quedando menos columnas por recorrer
// (para el camino correcto y las ramificaciones, que deben llegar
// exactamente a una fila concreta). Si no se pasa targetRow, el serpenteo
// es libre (para los caminos señuelo, que no tienen que llegar a ningún
// sitio en concreto).
function walkAvaluggStrand(startRow, startCol, colLimit, targetRow, capRuns = true, safeSet = null) {
  const cells = [];
  let row = startRow;
  let col = startCol;

  function place(r, c) {
    cells.push({ row: r, col: c });
    if (safeSet) safeSet.add(r + ',' + c);
  }
  // La propia casilla de arranque también puede ensanchar el camino: varias
  // hebras (principal, ramificaciones, señuelos) arrancan en la misma
  // columna (AVL_BREAK_MIN_COL) con filas al azar, así que dos podrían
  // empezar en filas contiguas y formar un bloque 2x2 justo ahí. Si esta
  // casilla de arranque ya ensancharía el camino, esta hebra no aporta
  // nada (cells vacío): es perfectamente válido para una ramificación o un
  // señuelo (sencillamente no se genera esa vez) y el camino principal
  // siempre arranca con el tablero vacío, así que nunca le afecta.
  if (formsWideBlock(row, col, safeSet)) return cells;
  place(row, col);

  let lastDir = null; // 'R' | 'U' | 'D'
  let runLen = 0;

  function candidate(dir) {
    if (dir === 'R') return { r: row, c: col + 1 };
    if (dir === 'U') return { r: Math.max(0, row - 1), c: col };
    return { r: Math.min(AVL_ROWS - 1, row + 1), c: col }; // 'D'
  }

  // Recorre la lista de direcciones candidatas (en orden de preferencia) y
  // devuelve la primera que no esté bloqueada (borde/racha máxima, salvo
  // que ignoreCap sea true) y que además NO complete un bloque de 2x2
  // (nunca se ensancha el camino a 2 casillas, pase lo que pase).
  function pickDir(order, blockedMap, ignoreCap) {
    for (const dir of order) {
      if (!ignoreCap && blockedMap[dir]) continue;
      const { r, c } = candidate(dir);
      if (r === row && c === col) continue; // no-op en el borde del tablero
      if (formsWideBlock(r, c, safeSet)) continue;
      return dir;
    }
    return null;
  }

  function commit(dir) {
    const { r, c } = candidate(dir);
    row = r; col = c;
    place(row, col);
    if (dir === lastDir) runLen++; else { lastDir = dir; runLen = 1; }
  }

  let guard = 0;
  while (col < colLimit && guard < 8000) {
    guard++;
    const remainingCols = colLimit - col;
    const rowDiff = targetRow != null ? targetRow - row : 0;
    const rightBlocked = capRuns && lastDir === 'R' && runLen >= AVL_MAX_RUN;
    const upBlocked = row <= 0 || (capRuns && lastDir === 'U' && runLen >= AVL_MAX_RUN);
    const downBlocked = row >= AVL_ROWS - 1 || (capRuns && lastDir === 'D' && runLen >= AVL_MAX_RUN);
    const blockedMap = { R: rightBlocked, U: upBlocked, D: downBlocked };

    let prefOrder;
    if (targetRow != null && rowDiff !== 0 && Math.abs(rowDiff) >= remainingCols) {
      // Ya no queda margen: hay que acercarse a la fila objetivo sí o sí en
      // este paso (si está bloqueada por el tope de racha, se prueba antes
      // un paso a la derecha para romperla, y como último recurso la
      // dirección vertical opuesta).
      const wantDir = rowDiff > 0 ? 'D' : 'U';
      const altDir = wantDir === 'D' ? 'U' : 'D';
      prefOrder = [wantDir, 'R', altDir];
    } else {
      // Serpenteo libre: sesgado hacia targetRow si existe (camino
      // principal/ramificaciones), o puramente aleatorio (señuelos).
      const goRightFirst = Math.random() < 0.62;
      let vertFirst;
      if (rowDiff > 0) vertFirst = Math.random() < 0.7 ? 'D' : 'U';
      else if (rowDiff < 0) vertFirst = Math.random() < 0.7 ? 'U' : 'D';
      else vertFirst = Math.random() < 0.5 ? 'U' : 'D';
      const vertSecond = vertFirst === 'U' ? 'D' : 'U';
      prefOrder = goRightFirst ? ['R', vertFirst, vertSecond] : [vertFirst, 'R', vertSecond];
    }

    // El tope de racha (AVL_MAX_RUN) y la prohibición de ensanchar el
    // camino a 2 casillas son las dos reglas absolutas: ninguna de las dos
    // se relaja nunca, ni siquiera como último recurso.
    const dir = pickDir(prefOrder, blockedMap, false);
    if (!dir) {
      // De verdad no hay ninguna casilla vecina a la que se pueda avanzar
      // sin crear un tramo de 2 de ancho (tablero ya muy saturado de otras
      // hebras). Se corta la hebra aquí mismo en vez de forzar nunca un
      // ensanchamiento: quien llama a walkAvaluggStrand comprueba si hizo
      // falta y, para el camino principal, vuelve a generar toda la
      // partida desde cero si esto le impidió llegar a su destino.
      break;
    }
    commit(dir);
  }

  // Estas dos salvaguardas solo entran en juego si el bucle de arriba se
  // quedó corto por el guard de seguridad (guard >= 8000, prácticamente
  // nunca ocurre): respetan las dos reglas absolutas igual que el bucle
  // principal (ni ensanchan el camino ni superan el tope de racha),
  // cortando la hebra ahí mismo si de verdad no hay forma de continuar.
  while (col < colLimit) {
    if ((lastDir === 'R' && runLen >= AVL_MAX_RUN)) break;
    const { r, c } = candidate('R');
    if (formsWideBlock(r, c, safeSet)) break;
    commit('R');
  }
  if (targetRow != null) {
    while (row !== targetRow) {
      const stepDir = row < targetRow ? 'D' : 'U';
      if (lastDir === stepDir && runLen >= AVL_MAX_RUN) break;
      const { r, c } = candidate(stepDir);
      if (r === row && c === col) break; // borde del tablero
      if (formsWideBlock(r, c, safeSet)) break;
      commit(stepDir);
    }
  }
  return cells;
}

// Genera el camino "correcto" prediseñado (casillas que nunca se rompen)
// desde algún punto de la tercera columna hasta una de las 3 filas
// centrales de la última columna, con serpenteo aleatorio y sin más de
// AVL_MAX_RUN casillas seguidas en la misma dirección. Además genera:
//  - AVL_BRANCH_COUNT RAMIFICACIONES que arrancan cada una en una fila
//    distinta de esa misma primera columna quebradiza y se unen al
//    camino principal como muy tarde en la columna
//    AVL_BRANCH_MAX_JOIN_COL: son 5 formas distintas de engancharse a la
//    ruta correcta desde el principio, no un único punto de entrada
//    obvio. Como tienen muy pocas columnas para converger, ANTES de esa
//    columna límite se les permite saltarse la regla de las 4 casillas
//    seguidas (solo a ellas: el resto del tablero la sigue respetando);
//  - varios caminos SEÑUELO independientes que también son seguros pero
//    que se cortan antes de llegar a la última columna, así que nunca
//    llevan a la meta.
// Todo el hielo se ve exactamente igual hasta que se pisa, así que estas
// hebras adicionales sirven para despistar sin dar pistas visuales.
const AVL_GEN_MAX_ATTEMPTS = 40; // reintentos si una tirada de dados deja el camino principal sin llegar a la meta (evita violar NUNCA la regla de ancho)

function generateAvaluggPath() {
  // Todo lo que se genera aquí se calcula ENTERO antes de que empiece la
  // partida (se llama una sola vez, desde startAvaluggMatch, antes de
  // poner ms.phase en 'playing'): el laberinto está totalmente
  // predefinido de antemano, nunca se improvisa casilla a casilla durante
  // el juego. Como el generador nunca se permite ensanchar el camino a 2
  // casillas ni superar el tope de racha, un intento muy saturado de
  // señuelos podría (rarísima vez) cortar el camino principal antes de
  // llegar al trofeo; en ese caso se reintenta desde cero en vez de
  // relajar ninguna regla.
  let safe = buildAvaluggPathAttempt();
  let attempts = 1;
  while (!avaluggPathReachesTrophy(safe) && attempts < AVL_GEN_MAX_ATTEMPTS) {
    safe = buildAvaluggPathAttempt();
    attempts++;
  }
  return safe;
}

function avaluggPathReachesTrophy(safe) {
  // Los señuelos y las ramificaciones nunca llegan a la última columna
  // (por construcción), así que si hay una casilla segura del trofeo es,
  // necesariamente, porque el camino principal llegó hasta ella.
  return AVL_CENTER_ROWS.some(row => safe.has(row + ',' + AVL_LAST_COL));
}

function buildAvaluggPathAttempt() {
  const safe = new Set();
  const centerFirst = AVL_CENTER_ROWS[0];
  const centerLast = AVL_CENTER_ROWS[AVL_CENTER_ROWS.length - 1];

  // El camino correcto entra a la meta de forma aleatoria: la mayoría de
  // las veces desde la izquierda (aproximación horizontal clásica), pero
  // también puede entrar desde arriba o desde abajo. Para esos dos casos,
  // el camino llega antes a la última columna (por una fila fuera de las
  // 3 centrales) y termina caminando en vertical, dentro de esa misma
  // columna, hasta la fila central más cercana.
  const startRow = Math.floor(Math.random() * AVL_ROWS);
  const sideRoll = Math.random();
  const entrySide = sideRoll < 0.6 ? 'left' : (sideRoll < 0.8 ? 'top' : 'bottom');

  let mainCells;
  if (entrySide === 'left') {
    const trophyRow = AVL_CENTER_ROWS[Math.floor(Math.random() * AVL_CENTER_ROWS.length)];
    mainCells = walkAvaluggStrand(startRow, AVL_BREAK_MIN_COL, AVL_LAST_COL, trophyRow, true, safe);
  } else {
    const isTop = entrySide === 'top';
    const trophyRow = isTop ? centerFirst : centerLast;
    // Filas "exteriores" (fuera de las 3 centrales) desde las que se puede
    // entrar en la última columna sin que el tramo vertical final supere
    // el tope de AVL_MAX_RUN casillas seguidas.
    const outerRows = [];
    for (let r = 0; r < AVL_ROWS; r++) {
      if (r >= centerFirst && r <= centerLast) continue;
      if (isTop ? r < centerFirst : r > centerLast) {
        if (Math.abs(r - trophyRow) <= AVL_MAX_RUN) outerRows.push(r);
      }
    }
    const entryRow = outerRows.length
      ? outerRows[Math.floor(Math.random() * outerRows.length)]
      : trophyRow; // salvaguarda, no debería hacer falta con la configuración actual
    mainCells = walkAvaluggStrand(startRow, AVL_BREAK_MIN_COL, AVL_LAST_COL, entryRow, true, safe);
    // Tramo final: camina en vertical dentro de la última columna desde
    // donde entró hasta la fila central más cercana. El paso previo que
    // entra en esta columna es siempre horizontal (a la derecha), así que
    // esta racha vertical empieza limpia y nunca se encadena con la
    // anterior.
    let row = entryRow;
    while (row !== trophyRow) {
      const nextRow = row + (isTop ? 1 : -1);
      if (formsWideBlock(nextRow, AVL_LAST_COL, safe)) break; // se corta aquí; el intento se descarta y se reintenta
      row = nextRow;
      mainCells.push({ row, col: AVL_LAST_COL });
      safe.add(row + ',' + AVL_LAST_COL);
    }
  }

  // Mapa columna -> filas que ocupa el camino principal en esa columna
  // (puede haber varias, por el serpenteo vertical mientras la columna
  // no avanza). Se usa para que las ramificaciones tengan una fila
  // concreta del camino principal a la que converger.
  const mainRowsByCol = new Map();
  mainCells.forEach(c => {
    if (!mainRowsByCol.has(c.col)) mainRowsByCol.set(c.col, []);
    mainRowsByCol.get(c.col).push(c.row);
  });

  // Ramificaciones: exactamente AVL_BRANCH_COUNT, cada una arranca en una
  // fila de la primera columna quebradiza y se une al camino principal
  // como muy tarde en la columna AVL_BRANCH_MAX_JOIN_COL: son varias
  // formas distintas de engancharse a la ruta correcta desde el
  // principio, no un único punto de entrada obvio. Respetan SIEMPRE el
  // tope de AVL_MAX_RUN casillas seguidas, así que la fila de arranque se
  // limita al margen vertical que de verdad se puede cubrir sin romper
  // ese tope dado el número de columnas disponibles hasta unirse.
  const branchColMax = Math.min(AVL_LAST_COL - 1, AVL_BRANCH_MAX_JOIN_COL);
  const joinColCandidates = [];
  for (let c = AVL_BREAK_MIN_COL + 1; c <= branchColMax; c++) {
    if (mainRowsByCol.has(c)) joinColCandidates.push(c);
  }
  for (let i = 0; i < AVL_BRANCH_COUNT; i++) {
    if (joinColCandidates.length === 0) break; // salvaguarda, no debería pasar
    const joinCol = joinColCandidates[Math.floor(Math.random() * joinColCandidates.length)];
    const joinRows = mainRowsByCol.get(joinCol);
    const joinRow = joinRows[Math.floor(Math.random() * joinRows.length)];
    // Cada columna recorrida hasta joinCol permite "cortar" un tramo recto
    // de por medio, así que el alcance máximo alcanzable sin superar el
    // tope es (nº de columnas + 1) tramos de hasta AVL_MAX_RUN casillas.
    const numCols = joinCol - AVL_BREAK_MIN_COL;
    const maxReach = (numCols + 1) * AVL_MAX_RUN;
    const minRow = Math.max(0, joinRow - maxReach);
    const maxRow = Math.min(AVL_ROWS - 1, joinRow + maxReach);
    const branchStartRow = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
    walkAvaluggStrand(branchStartRow, AVL_BREAK_MIN_COL, joinCol, joinRow, true, safe);
  }

  // Señuelos: arrancan en una fila al azar de la tercera columna y se
  // detienen en una columna al azar ANTES de la última, así que por
  // diseño nunca pueden alcanzar el trofeo (que solo está en la última
  // columna). Solo puede haber UN camino que de verdad llegue a la meta:
  // el principal (con sus ramificaciones, que son formas de entrar a ese
  // mismo camino, no metas alternativas).
  const decoyCount = AVL_DECOY_MIN + Math.floor(Math.random() * (AVL_DECOY_MAX - AVL_DECOY_MIN + 1));
  for (let i = 0; i < decoyCount; i++) {
    const decoyStartRow = Math.floor(Math.random() * AVL_ROWS);
    const minLen = 3;
    const maxLen = Math.max(minLen, AVL_LAST_COL - AVL_BREAK_MIN_COL - 1); // se queda corto, nunca llega a la última columna
    const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
    const decoyEndCol = Math.min(AVL_LAST_COL - 1, AVL_BREAK_MIN_COL + len);
    walkAvaluggStrand(decoyStartRow, AVL_BREAK_MIN_COL, decoyEndCol, null, true, safe);
  }

  return safe;
}

export function startAvalugg() {
  // Igual que en Rayo Solar (ver el comentario largo en startRayoSolar,
  // rayosolar.js): al pulsar "Nueva Partida" (ver el botón #avl-again-btn
  // en showAvaluggVictoryBanner) esta misma función reconstruye el lobby,
  // lo que destruye por completo el contenido anterior de #game-content
  // -incluido el campo (#avl-field-outer) que estaba en pantalla completa
  // mientras se jugaba-. Eso hace que el navegador salga de pantalla
  // completa por su cuenta y, en el modo simulado (.fs-fallback), deja
  // colgada la referencia al nodo ya destruido. Por eso aquí se guarda si
  // había pantalla completa activa ANTES de reconstruir nada, para
  // restaurarla sobre el lobby nuevo justo después (ver más abajo).
  const wasFullscreen = !!currentFullscreenElement();
  // Si venimos de una partida anterior que quedó a medias (p.ej. "Nueva
  // Partida" antes de que todo el mundo terminara de caer), detenemos
  // cualquier walker/temporizador que pudiera seguir corriendo en segundo
  // plano sobre elementos ya descartados.
  const prev = state.modeState;
  if (prev && prev.players) {
    Object.values(prev.players).forEach(p => { if (p.walker) p.walker.destroy(); });
  }
  [prev && prev.fallTimeouts, prev && prev.entranceTimeouts, prev && prev.stepTimeouts]
    .forEach(list => { if (list) list.forEach(id => clearTimeout(id)); });

  state.modeState = {
    phase: 'lobby',       // 'lobby' | 'playing' | 'ended'
    players: {},           // user -> { user, npc, elId, row, col, walker, stepQueue, stepping }
    order: [],
    lobbyImgs: {},
    lobbyCards: {},          // user -> elemento de la tarjeta del lobby (para poder expulsarlo)
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida (se resetea al llamar de nuevo a
    // startAvalugg(), es decir, al empezar una nueva partida).
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    cellEls: null,          // array plano (row*AVL_COLS+col) con las celdas del DOM, para acceso O(1)
    safePath: null,          // Set "row,col" de casillas que nunca se rompen (solo válido en 'playing')
    brokenCells: new Set(),  // Set "row,col" de casillas ya rotas (solo visual/registro)
    winner: null,
    fallTimeouts: [],
    entranceTimeouts: [],
    stepTimeouts: [],       // temporizadores del movimiento paso a paso, para poder cancelarlos
  };
  renderAvaluggLobby();
  if (wasFullscreen) {
    // Restaura la pantalla completa sobre el lobby recién creado (ver el
    // comentario de arriba). Se pide directamente porque ya sabemos con
    // certeza que había pantalla completa activa.
    requestSceneFullscreen($('avl-lobby-scene'));
  }
  addChatMessage(null, '❄️ ¡Glaciar de Avalugg abierto! Escribe !participo para apuntarte', 'system');
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleAvaluggCmd(user, cmd, parts, text) {
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
      user, npc,
      elId: 'avl-p-' + sanitizeUser(user),
      row: 0,
      col: AVL_START_COL,
      walker: null,      // instancia de OwWalker, creada al entrar al tablero
      stepQueue: [],      // letras wasd pendientes de animar, una casilla a la vez
      stepping: false,    // true mientras se está animando el paso actual
    };
    ms.order.push(user);
    addChatMessage(null, `✅ ${user} se apunta a Glaciar de Avalugg!`, 'correct', { mirror: false });
    playVeJoin();
    renderAvaluggLobbyGrid();
    return;
  }

  if (ms.phase !== 'playing' || ms.winner) return;
  const p = ms.players[user];
  if (!p) return; // solo pueden moverse quienes se apuntaron antes de que empezara la partida

  const m = /^!([wasd]{1,60})$/.exec(cmd);
  if (!m) return;
  processAvaluggMove(user, m[1].slice(0, AVL_MAX_MOVE_LETTERS));
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderAvaluggLobby() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="avl-lobby-box game-scene" id="avl-lobby-scene">
      <div class="avl-lobby-head">
        <div class="big-count pixel" id="avl-lobby-count">0</div>
        <div style="color:var(--muted);font-size:12px;">jugadores apuntados · escribe <b style="color:var(--yellow)">!participo</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:560px;margin:6px auto 0;line-height:1.6;">
          Cruza el glaciar hasta el trofeo sin caer por el hielo quebradizo. Muévete con
          <b style="color:#7be0ff">!w</b> <b style="color:#7be0ff">!a</b> <b style="color:#7be0ff">!s</b> <b style="color:#7be0ff">!d</b>
          (arriba / izquierda / abajo / derecha) y encadénalas en un único mensaje, p.ej. <b style="color:#7be0ff">!aasaa</b>.
          Si pisas hielo incorrecto caerás y volverás al principio. ¡El primero en llegar al trofeo gana!
        </div>
      </div>
      <div class="avl-lobby-grid" id="avl-lobby-grid">
        <div class="avl-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="avl-start-btn" id="avl-start-btn" disabled>▶ Comenzar Partida</button>
    </div>
  `;
  $('avl-start-btn').onclick = () => startAvaluggMatch();
  renderAvaluggLobbyGrid();
}

function renderAvaluggLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('avl-lobby-grid');
  const countEl = $('avl-lobby-count');
  const btn = $('avl-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (btn) btn.disabled = players.length < 1;
  if (players.length === 0) {
    grid.innerHTML = '<div class="avl-lobby-empty">Esperando a que el chat se apunte...</div>';
    ms.lobbyImgs = {};
    ms.lobbyCards = {};
    return;
  }
  const emptyMsg = grid.querySelector('.avl-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    if (ms.lobbyImgs[p.user]) return; // ya tiene tarjeta creada
    const card = document.createElement('div');
    card.className = 'avl-lobby-card';
    card.title = 'Clic para expulsar de la partida';
    const imgId = 'avl-lobby-img-' + sanitizeUser(p.user);
    card.innerHTML = `
      <div class="avl-ow-slot"><img id="${imgId}" class="avl-ow-img" alt=""></div>
      <div class="p-user">@${escapeHtml(p.user)}</div>
    `;
    // El streamer puede hacer clic en cualquier jugador inscrito para que
    // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleLobbyExpelPopover(ms, p.user, card, expelFromAvaluggLobby);
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
// la siguiente partida (nueva llamada a startAvalugg()).
function expelFromAvaluggLobby(user) {
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
  renderAvaluggLobbyGrid();
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA
   --------------------------------------------------------- */
function startAvaluggMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const users = ms.order.slice();
  if (users.length < 1) {
    toast('Necesitas al menos 1 jugador para empezar');
    return;
  }

  ms.safePath = generateAvaluggPath();
  ms.brokenCells = new Set();
  ms.winner = null;
  ms.phase = 'playing';
  // La música de este modo no suena durante el lobby de inscripción (ahí
  // sigue la del menú principal): arranca justo aquí, al cerrarse el lobby
  // y empezar la partida de verdad (ver MODES_WITHOUT_LOBBY_MUSIC en
  // modeLauncher.js).
  playModeMusic('glaciar');
  playAvaluggMatchStart();

  // Reparte a los jugadores por las filas de la segunda columna, sin
  // repetir fila mientras queden huecos (si hay más jugadores que filas,
  // se reparte cíclicamente).
  const rowsPool = shuffledIndices(AVL_ROWS);
  users.forEach((u, i) => {
    const p = ms.players[u];
    p.row = rowsPool[i % AVL_ROWS];
    p.col = AVL_START_COL;
  });

  renderAvaluggBoard();
  renderAvaluggPlayersList();

  // Crea a todos los jugadores fuera de la pantalla (a la izquierda), con
  // el sprite "andando" hacia la derecha ya activo, y luego los anima
  // entrando (deslizándose/caminando) hasta su casilla de la 2ª columna:
  // una entrada larga y pausada (AVL_ENTRANCE_WALK_MS) en vez del salto
  // instantáneo de antes.
  users.forEach(u => {
    const p = ms.players[u];
    createAvaluggPlayerEl(p, true);
    if (p.walker) {
      p.walker.setDirection('right');
      p.walker.startWalking();
    }
  });
  const entranceId = setTimeout(() => {
    users.forEach(u => {
      const p = ms.players[u];
      const el = $(p.elId);
      if (!el) return;
      el.style.transition = `left ${AVL_ENTRANCE_WALK_MS}ms ease, top ${AVL_ENTRANCE_WALK_MS}ms ease`;
      el.style.left = avlCellLeftPct(p.col);
    });
    const settleId = setTimeout(() => {
      users.forEach(u => {
        const p = ms.players[u];
        const el = $(p.elId);
        if (el) el.style.transition = ''; // vuelve a la transición CSS por defecto (pasos normales de AVL_STEP_MS)
        if (p.walker) p.walker.stopWalking();
      });
    }, AVL_ENTRANCE_WALK_MS);
    ms.entranceTimeouts.push(settleId);
  }, AVL_ENTRANCE_MS);
  ms.entranceTimeouts.push(entranceId);

  avlLog('❄️ ¡Todos entran caminando al glaciar!', '');
  addChatMessage(null, `❄️ ¡Comienza Glaciar de Avalugg con ${users.length} jugadores! Usa !w !a !s !d para moverte (ej: !aasaa)`, 'system');
}

/* ---------------------------------------------------------
   TABLERO
   --------------------------------------------------------- */
function renderAvaluggBoard() {
  const content = $('game-content');
  const ms = state.modeState;
  content.innerHTML = `
    <div class="avl-wrap">
      <div class="avl-topbar">
        <div class="stat">🧊 Jugadores: <b id="avl-players-count">${ms.order.length}</b></div>
        <div class="stat avl-phase-hint" id="avl-phase-hint">¡Todos a por el trofeo!</div>
      </div>
      <div class="avl-field-outer game-scene" id="avl-field-outer">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <div class="avl-field-inner" id="avl-field-inner">
          <div class="avl-sky">
            <div class="avl-mountains avl-mountains-back"></div>
            <div class="avl-mountains avl-mountains-front"></div>
          </div>
          <div class="avl-board" id="avl-board">
            <div class="avl-grid" id="avl-grid"></div>
            <div class="avl-goal-outline" id="avl-goal-outline"></div>
            <div class="avl-ice-shine"></div>
            <div class="avl-players-layer" id="avl-players-layer"></div>
          </div>
          <div class="avl-status-sign">
            <div class="zor-sign-board">
              <div class="zor-sign-title pixel">Muévete con</div>
              <div class="zor-sign-cmds">
                <span>!w</span><span>!a</span><span>!s</span><span>!d</span>
              </div>
            </div>
          </div>
          <div class="avl-snowfall">
            <span class="avl-snow-layer1"></span>
            <span class="avl-snow-layer2"></span>
            <span class="avl-snow-layer3"></span>
          </div>
        </div>
      </div>
      <div class="avl-info-grid">
        <div class="ranking-panel" id="avl-players-panel">
          <div class="ranking-title">🧊 Jugadores</div>
          <div id="avl-players-list"></div>
        </div>
        <div class="battle-log" id="avl-log"><p style="color:var(--muted);font-style:italic;">¡Que empiece la carrera sobre el hielo!</p></div>
      </div>
    </div>
  `;
  buildAvaluggGridCells();
}

function buildAvaluggGridCells() {
  const ms = state.modeState;
  const grid = $('avl-grid');
  if (!ms || !grid) return;
  let html = '';
  for (let r = 0; r < AVL_ROWS; r++) {
    for (let c = 0; c < AVL_COLS; c++) {
      const trophy = isAvaluggTrophy(r, c);
      const safeZone = c < AVL_BREAK_MIN_COL; // 1ª y 2ª columna: nunca se rompen
      let cls = 'avl-cell';
      if (safeZone) cls += ' avl-cell-safe';
      // Las 3 casillas de madera del final ya no llevan icono de trofeo
      // encima: se marcan con la textura de madera (avl-cell-trophy). El
      // contorno dorado animado de la meta NO va por celda (ver
      // .avl-goal-outline más abajo): las 3 juntas se tratan como una
      // única zona de 3 de alto x 1 de ancho.
      if (trophy) cls += ' avl-cell-trophy';
      html += `<div class="${cls}" data-row="${r}" data-col="${c}"></div>`;
    }
  }
  grid.innerHTML = html;
  ms.cellEls = Array.from(grid.children);
  positionAvaluggGoalOutline();
}

// Coloca el contorno dorado animado de la meta como una única capa
// superpuesta que abarca las 3 filas centrales x 1 columna de la última
// columna (AVL_CENTER_ROWS x AVL_LAST_COL), en vez de un borde por
// celda: así el contorno rodea de verdad una zona de 3 de alto por 1 de
// ancho, no 3 contornos individuales pegados.
function positionAvaluggGoalOutline() {
  const el = $('avl-goal-outline');
  if (!el) return;
  const top = (AVL_CENTER_ROWS[0] / AVL_ROWS) * 100;
  const height = (AVL_CENTER_ROWS.length / AVL_ROWS) * 100;
  const left = (AVL_LAST_COL / AVL_COLS) * 100;
  const width = (1 / AVL_COLS) * 100;
  el.style.top = top + '%';
  el.style.height = height + '%';
  el.style.left = left + '%';
  el.style.width = width + '%';
}

function avlCellEl(row, col) {
  const ms = state.modeState;
  if (!ms || !ms.cellEls) return null;
  return ms.cellEls[row * AVL_COLS + col] || null;
}

function markAvaluggCellBroken(row, col) {
  const el = avlCellEl(row, col);
  if (el) spawnAvaluggIceBreak(el);
}

// Efecto visual del hielo al romperse: la celda pasa a su estado "roto"
// permanente (agujero de agua con forma irregular, ver CSS) y, solo en
// el instante del impacto, se lanzan unas esquirlas de hielo + un anillo
// de salpicadura (elementos de usar y tirar, se autodestruyen al acabar
// su animación) y quedan 2-3 trocitos de hielo flotando de forma
// permanente sobre el agujero para rematar el detalle.
function spawnAvaluggIceBreak(el) {
  el.classList.add('avl-cell-broken', 'avl-cell-shatter');
  setTimeout(() => el.classList.remove('avl-cell-shatter'), 450);

  const shardCount = 7;
  for (let i = 0; i < shardCount; i++) {
    const shard = document.createElement('span');
    shard.className = 'avl-ice-shard';
    const angle = (360 / shardCount) * i + (Math.random() * 26 - 13);
    const dist = 55 + Math.random() * 35;
    const rad = angle * Math.PI / 180;
    shard.style.setProperty('--tx', (Math.cos(rad) * dist).toFixed(1) + 'px');
    shard.style.setProperty('--ty', (Math.sin(rad) * dist).toFixed(1) + 'px');
    shard.style.setProperty('--rot', (Math.random() * 360 - 180).toFixed(0) + 'deg');
    shard.style.animationDelay = (Math.random() * 50).toFixed(0) + 'ms';
    shard.addEventListener('animationend', () => shard.remove());
    el.appendChild(shard);
  }

  const splash = document.createElement('span');
  splash.className = 'avl-ice-splash';
  splash.addEventListener('animationend', () => splash.remove());
  el.appendChild(splash);

  const floaterCount = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < floaterCount; i++) {
    const f = document.createElement('span');
    f.className = 'avl-ice-floater';
    f.style.setProperty('--fx', (18 + Math.random() * 64).toFixed(0) + '%');
    f.style.setProperty('--fy', (22 + Math.random() * 56).toFixed(0) + '%');
    f.style.setProperty('--fr', (Math.random() * 50 - 25).toFixed(0) + 'deg');
    f.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
    el.appendChild(f);
  }
}

function avlCellLeftPct(col) { return ((col + 0.5) / AVL_COLS * 100) + '%'; }
function avlCellTopPct(row) { return ((row + 0.5) / AVL_ROWS * 100) + '%'; }

function createAvaluggPlayerEl(p, offscreen) {
  const layer = $('avl-players-layer');
  if (!layer) return null;
  const el = document.createElement('div');
  el.className = 'avl-player';
  el.id = p.elId;
  const imgId = p.elId + '-img';
  el.innerHTML = `
    <div class="avl-ow-slot"><img id="${imgId}" class="avl-ow-img" alt=""></div>
    <div class="avl-player-name">@${escapeHtml(p.user)}</div>
  `;
  el.style.top = avlCellTopPct(p.row);
  el.style.left = offscreen ? '-10%' : avlCellLeftPct(p.col);
  layer.appendChild(el);
  p.walker = new OwWalker($(imgId), p.npc, 'down');
  return el;
}

function moveAvaluggPlayerDom(p) {
  const el = $(p.elId);
  if (!el) return;
  el.style.left = avlCellLeftPct(p.col);
  el.style.top = avlCellTopPct(p.row);
}

/* ---------------------------------------------------------
   MOVIMIENTO
   -----------------------------------------------------------
   El movimiento ya no salta de golpe a la casilla final: cada letra
   del comando se anima una casilla a la vez (AVL_STEP_MS por paso,
   con el ciclo de "andar" de OwWalker activo durante el paso) y solo
   al terminar ese paso se comprueba si el jugador ganó, cayó o debe
   seguir con la siguiente letra. Las letras se guardan en p.stepQueue
   y, si llega un comando nuevo mientras el jugador todavía se está
   moviendo, sus letras simplemente se añaden al final de la cola.
   --------------------------------------------------------- */
function processAvaluggMove(user, letters) {
  const ms = state.modeState;
  const p = ms.players[user];
  if (!ms || !p) return;

  for (const ch of letters) {
    if (!AVL_DIR[ch]) continue;
    if (p.stepQueue.length >= AVL_MAX_QUEUE_LETTERS) break; // salvaguarda: cola ya muy larga
    p.stepQueue.push(ch);
  }
  if (!p.stepping) stepAvaluggPlayer(user);
}

// Anima UN paso (una casilla) de la cola de movimientos de un jugador y, al
// terminar su transición CSS, se llama a sí misma para encadenar el
// siguiente hasta vaciar la cola (o hasta que el jugador gane/caiga).
function stepAvaluggPlayer(user) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;

  if (ms.phase !== 'playing' || ms.winner) {
    p.stepQueue = [];
    p.stepping = false;
    if (p.walker) p.walker.stopWalking();
    return;
  }

  const ch = p.stepQueue.shift();
  if (!ch) {
    p.stepping = false;
    if (p.walker) p.walker.stopWalking(); // fin del comando: vuelve a la pose "de pie"
    return;
  }
  p.stepping = true;

  const d = AVL_DIR[ch];
  const nrow = Math.max(0, Math.min(AVL_ROWS - 1, p.row + d[0]));
  const ncol = Math.max(0, Math.min(AVL_COLS - 1, p.col + d[1]));

  if (nrow === p.row && ncol === p.col) {
    // se queda clavado en el borde: no hay casilla que animar, sigue
    // directamente con la siguiente letra de la cola
    stepAvaluggPlayer(user);
    return;
  }

  if (p.walker) {
    p.walker.setDirection(AVL_DIR_NAME[ch]);
    p.walker.startWalking();
  }
  p.row = nrow; p.col = ncol;
  moveAvaluggPlayerDom(p);

  const timeoutId = setTimeout(() => {
    if (!ms || ms.phase !== 'playing' || ms.winner) { p.stepping = false; return; }

    if (isAvaluggTrophy(p.row, p.col)) {
      p.stepQueue = [];
      p.stepping = false;
      if (p.walker) p.walker.stopWalking();
      finishAvaluggMatch(user);
      return;
    }
    if (p.col >= AVL_BREAK_MIN_COL && !ms.safePath.has(p.row + ',' + p.col)) {
      p.stepQueue = []; // se corta el resto del comando que causó la caída
      handleAvaluggFall(user);
      return;
    }
    stepAvaluggPlayer(user);
  }, AVL_STEP_MS);
  ms.stepTimeouts.push(timeoutId);
}

function handleAvaluggFall(user) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;
  const row = p.row, col = p.col;
  const key = row + ',' + col;
  if (!ms.brokenCells.has(key)) {
    ms.brokenCells.add(key);
    markAvaluggCellBroken(row, col);
  }
  playAvaluggFall();
  avlLog(`❄️ @${user} pisa hielo quebradizo y cae al agua helada...`, 'dmg');
  addChatMessage(null, `❄️💦 @${user} se cae por el hielo roto y vuelve a la 2ª columna`, 'wrong', { mirror: false });
  if (p.walker) p.walker.stopWalking();
  const el = $(p.elId);
  if (el) el.classList.add('avl-fall');
  const timeoutId = setTimeout(() => {
    respawnAvaluggPlayer(user);
    // si mientras caía llegaron letras nuevas, retoma la cola desde la
    // casilla de reaparición; si no hay nada encolado, se queda quieto.
    stepAvaluggPlayer(user);
  }, AVL_FALL_ANIM_MS);
  ms.fallTimeouts.push(timeoutId);
}

function respawnAvaluggPlayer(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'playing') return;
  const p = ms.players[user];
  if (!p) return;
  p.row = Math.floor(Math.random() * AVL_ROWS);
  p.col = AVL_START_COL;
  const el = $(p.elId);
  if (!el) return;
  el.classList.remove('avl-fall');
  if (p.walker) p.walker.setDirection('down');
  // Reposiciona sin animación de deslizamiento (el jugador "reaparece" de
  // golpe en su nueva fila, no camina hasta allí desde donde cayó).
  el.style.transition = 'none';
  el.style.left = avlCellLeftPct(p.col);
  el.style.top = avlCellTopPct(p.row);
  void el.offsetWidth; // fuerza el reflow para poder reactivar la transición justo después
  el.style.transition = '';
}

/* ---------------------------------------------------------
   FIN DE PARTIDA
   --------------------------------------------------------- */
function finishAvaluggMatch(user) {
  const ms = state.modeState;
  if (!ms || ms.winner) return;
  ms.phase = 'ended';
  ms.winner = user;
  ms.fallTimeouts.forEach(id => clearTimeout(id));
  ms.entranceTimeouts.forEach(id => clearTimeout(id));
  ms.stepTimeouts.forEach(id => clearTimeout(id));
  ms.fallTimeouts = [];
  ms.entranceTimeouts = [];
  ms.stepTimeouts = [];
  // Congela a todo el mundo en el sitio: se vacían las colas de movimiento
  // pendientes y cada sprite vuelve a su pose "de pie".
  Object.values(ms.players).forEach(p => {
    p.stepQueue = [];
    p.stepping = false;
    if (p.walker) p.walker.stopWalking();
  });

  addScore(user, 500);
  avlLog(`🏆 ¡@${user} llega al trofeo y gana Glaciar de Avalugg!`, 'crit');
  addChatMessage(null, `🏆 ¡@${user} gana Glaciar de Avalugg!`, 'correct');
  playAvaluggVictory();

  const el = $(ms.players[user].elId);
  if (el) el.classList.add('avl-winner');
  renderAvaluggPlayersList();
  showAvaluggVictoryBanner(user);
}

function showAvaluggVictoryBanner(user) {
  const ms = state.modeState;
  const field = $('avl-field-outer');
  if (!ms || !field) return;
  const p = ms.players[user];
  const banner = document.createElement('div');
  banner.className = 'avl-victory-banner';
  banner.innerHTML = `
    <div class="avl-ow-slot big"><img id="avl-winner-img" class="avl-ow-img" alt=""></div>
    <div class="win-title pixel">¡VICTORIA!</div>
    <div class="win-sub">@${escapeHtml(user)} alcanza el trofeo del glaciar</div>
    <div class="mode-end-actions">
      <button class="avl-start-btn" id="avl-again-btn">🔁 Nueva Partida</button>
      <button class="mode-end-menu-btn" id="avl-menu-btn">🏠 Menú Principal</button>
    </div>
  `;
  field.appendChild(banner);
  applyOwNpcSprite($('avl-winner-img'), p.npc);
  const again = $('avl-again-btn');
  if (again) again.onclick = () => startAvalugg();
  const menuBtn = $('avl-menu-btn');
  if (menuBtn) menuBtn.onclick = () => backToMenu();
}

/* ---------------------------------------------------------
   PANEL LATERAL Y LOG
   --------------------------------------------------------- */
function renderAvaluggPlayersList() {
  const ms = state.modeState;
  const list = $('avl-players-list');
  const countEl = $('avl-players-count');
  if (!ms || !list) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (players.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);">Sin jugadores</div>';
    return;
  }
  list.innerHTML = players.map(p => `
    <div class="avl-player-row${ms.winner === p.user ? ' winner' : ''}">
      <span>@${escapeHtml(p.user)}</span>
      <span class="avl-player-status">${ms.winner === p.user ? '🏆' : ''}</span>
    </div>
  `).join('');
}

function avlLog(text, cls = '') {
  const log = $('avl-log');
  if (!log) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}
