import { addChatMessage, escapeHtml } from '../chat.js';
import {
  playVeJoin, playExtrArrive, playExtrPassportDrop,
  playExtrStampAllow, playExtrStampDeny,
} from '../audio.js';
import { applyOwNpcSprite, getRandomOwNpc, owNpcHeadTopRatio } from '../data/owNpcDb.js';
import { state } from '../state.js';
import { $, addScore, showModal, toast } from '../utils.js';

/* =========================================================
   MODO CONTROL DE EXTRANJERÍA
   -----------------------------------------------------------
   - Los viewers se apuntan con !participo. A cada uno se le asigna un
     sprite OW de NPC (mitad de las veces femenino, mitad masculino,
     usando el campo "gender" de owNpcDb.js) y se incorpora al final de
     la cola, con una pequeña animación de "andar" al entrar en fila.
   - La partida se ve como Papers Please desde el primer momento: una
     fila de NPCs esperando arriba, tras una valla/garita, y abajo el
     mostrador del funcionario con los papeles.
   - El streamer pulsa "Llamar Siguiente": el primero de la cola
     desaparece por la garita (extremo izquierdo de la fila) y
     reaparece en primer plano, en el mostrador, más grande y centrado.
     Al llegar, deja caer su pasaporte sobre la mesa con una animación;
     el streamer puede pulsar sobre el pasaporte para ampliarlo y ver
     nombre, edad, región de nacimiento, profesión y equipaje.
   - Mientras el NPC está siendo atendido, todo lo que escribe en el
     chat aparece en un bocadillo de diálogo sobre su cabeza.
   - En cada ronda el chat vota con !si / !no si debe dejarle pasar o
     no; el resultado se refleja en una barra bajo los botones de
     decisión (el streamer no está obligado a seguir la votación).
   - El streamer decide con dos botones (✔ verde / ✗ rojo) si le deja
     pasar o no. Cada caso tiene, en secreto, algún dato sospechoso con
     cierta probabilidad: acertar la decisión da más puntos.
   - No hay fin de partida: es un modo continuo, la gente se apunta y
     se procesa mientras el streamer quiera.
   ========================================================= */

const EXTR_ORIGINS = [
  'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar',
  'Paldea', 'Noroteo', 'Floresta', 'Almia', 'Oblivia', 'Aura', 'Islas Naranja', 'Archi7',
  'Hisui',
];

// Nombres propios según el género del sprite OW asignado al jugador, para
// que el pasaporte muestre siempre un nombre coherente con el NPC (nunca
// nombre de mujer en un sprite masculino ni viceversa).
const EXTR_NAMES_F = [
  'Lucía', 'Sofía', 'Martina', 'Valentina', 'Elena', 'Carmen', 'Aitana', 'Noa',
  'Alba', 'Paula', 'Julia', 'Vega', 'Irene', 'Marta', 'Daniela', 'Rocío',
  'Candela', 'Nerea', 'Ainhoa', 'Bianca', 'Celia', 'Olivia', 'Ariadna',
];
const EXTR_NAMES_M = [
  'Mateo', 'Hugo', 'Lucas', 'Martín', 'Leo', 'Daniel', 'Pablo', 'Álvaro',
  'Adrián', 'Diego', 'Marcos', 'Bruno', 'Iker', 'Rodrigo', 'Gael', 'Izan',
  'Thiago', 'Enzo', 'Nicolás', 'Óscar', 'Rubén', 'Ismael', 'Darío',
];

// Apellidos (no cambian de forma según el género) para que el pasaporte
// muestre nombre completo, como un documento real.
const EXTR_SURNAMES = [
  'García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez',
  'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández',
  'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro',
  'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Ortiz', 'Castro', 'Ortega',
  'Rubio', 'Marín', 'Iglesias', 'Núñez', 'Medina', 'Vidal', 'Santos',
  'Cortés', 'Lozano', 'Guerrero', 'Cano', 'Prieto', 'Cabrera',
];

// Cada profesión incluye su forma masculina y femenina para que el
// pasaporte concuerde en género con el sprite OW del NPC.
const EXTR_PROFESSIONS = [
  { m: 'Criador Pokémon', f: 'Criadora Pokémon' },
  { m: 'Entrenador Pokémon', f: 'Entrenadora Pokémon' },
  { m: 'Líder de gimnasio', f: 'Líder de gimnasio' },
  { m: 'Artista', f: 'Artista' },
  { m: 'Enfermero', f: 'Enfermera' },
  { m: 'Profesor Pokémon', f: 'Profesora Pokémon' },
  { m: 'Mamporrero de Mudsdale', f: 'Mamporrera de Mudsdale' },
  { m: 'Monitor de aquagym', f: 'Monitora de aquagym' },
  { m: 'Desempleado', f: 'Desempleada' },
  { m: 'Comerciante', f: 'Comerciante' },
  { m: 'Cocinero', f: 'Cocinera' },
  { m: 'Fotógrafo', f: 'Fotógrafa' },
  { m: 'Recluta del Team Rocket', f: 'Recluta del Team Rocket' },
  { m: 'Cazabichos', f: 'Cazabichos' },
  { m: 'Marinero', f: 'Marinera' },
  { m: 'Músico', f: 'Música' },
  { m: 'Streamer', f: 'Streamer' },
  { m: 'Tiktoker', f: 'Tiktoker' },
  { m: 'Actor', f: 'Actriz' },
  { m: 'Agente de criptomonedas', f: 'Agente de criptomonedas' },
  { m: 'Payaso', f: 'Payasa' },
  { m: 'Futbolista', f: 'Futbolista' },
  { m: 'Informático', f: 'Informática' },
  { m: 'Pulidor de calvas', f: 'Pulidora de calvas' },
  { m: 'Farmeador de aura', f: 'Farmeadora de aura' },
  { m: 'Actor de películas para adultos', f: 'Actriz de películas para adultos' },
];

const EXTR_LUGGAGE = [
  'pene de goma', 'pokeballs', 'leche mu-mu', 'cámara de fotos', 'nintendo ds', 'fósil',
  'tijeras', 'cuchillo', 'pistola', 'espejo', 'microscopio', 'caja de medallas',
  'botella de alcohol', 'bolsa de marihuana', 'papel higiénico', 'cortauñas',
  'gafas sin cristales', 'disfraz de policía', 'pasamontañas', 'peluca', 'medicamentos',
  'máscara de Ogerpon', 'libro', 'discos de música', 'bolsa con piedras extrañas',
  'cartas de pokémon', 'altavoz portátil', 'mechero', 'fruta', 'uniforme de trabajo',
  'fotografías', 'guantes de boxeo', 'pañales para adultos', 'miel', 'cola de Slowpoke',
  'ropa interior', 'vaper', 'esposas', 'ordenador portátil', 'ukelele', 'tambor',
  'pokeflauta', 'bayas aranja', 'pico de minero', 'velas negras', 'cuchara torcida',
  'cinturón negro', 'casco dentado', 'pokemuñeco', 'caramelos raros',
  'paquete de cigarrillos', 'somníferos', 'hacha', 'tabla de surf',
  'gafas de visión nocturna', 'prismáticos', 'bombones derretidos', 'bote de orina',
  'pluma feérica', 'pañuelo de seda', 'dinamita', 'carbón', 'caja con semillas',
  'sombrero de paja', 'imán', 'garra afilada', 'escama de dragón', 'gafas de sol',
  'bolsa de arena fina', 'preservativos', 'bote de proteínas', 'repelente',
];

const EXTR_PROBLEM_CHANCE = 0.4;   // probabilidad de que el caso tenga algo sospechoso en secreto
const EXTR_QUEUE_LEAVE_MS = 420;   // duración de la animación de salida de la cola (debe casar con el CSS)
const EXTR_QUEUE_JOIN_MS = 650;    // duración de la animación de entrada andando a la cola

// Rango de edad del pasaporte según el grupo de edad del sprite OW
// asignado (ver ageGroup en owNpcDb.js), para que un NPC con pinta de
// "youngster" o "little_girl" no salga con 60 años ni un "old_man" con
// 20. Los tres rangos son siempre de adulto (18+) a propósito, incluso
// para 'young': el juego nunca genera una edad de menor de edad, sea
// cual sea el sprite (ver comentario de OW_RUBY_AGE en owNpcDb.js).
const EXTR_AGE_RANGES = {
  young: [18, 30],
  adult: [31, 55],
  old: [56, 80],
};
const EXTR_BOOTH_ENTER_MS = 550;   // duración de la animación de llegada al mostrador
const EXTR_PASSPORT_DROP_MS = 550; // duración de la animación de caída del pasaporte sobre la mesa
const EXTR_BUBBLE_HOLD_MS = 4500;  // tiempo que se mantiene visible cada mensaje del bocadillo antes de desvanecerse
const EXTR_BUBBLE_HIDE_MS = 250;   // duración de la animación de desvanecido (debe casar con el CSS)
const EXTR_BUBBLE_MAX = 4;         // nº máximo de mensajes apilados a la vez sobre la cabeza del NPC
const EXTR_RESOLVE_EXIT_MS = 650;  // duración de la animación de salida del mostrador tras la decisión

export function startExtranjeria() {
  state.modeState = {
    phase: 'playing',
    players: {},        // user -> { user, npc, gender, elId }
    queue: [],           // orden de la cola (usernames)
    queueDom: {},         // user -> { el }
    current: null,         // username en el mostrador (o null)
    currentData: null,      // { name, age, origin, profession, items, problem }
    processed: 0,
    allowed: 0,
    denied: 0,
    correctCalls: 0,
    resolving: false,       // evita doble-click mientras se resuelve/anima
    votes: { yes: 0, no: 0 },
    votedUsers: new Set(),
    bubbleTimers: [],       // timeouts activos de los bocadillos apilados (ver extrShowBubble)
    newspaper: extrRollNewspaper(), // edición sorteada al entrar en el modo (ver extrOpenNewspaperModal)
  };
  renderExtranjeria();
  addChatMessage(null, '🛂 ¡Control de Extranjería abierto! Escribe !participo para ponerte en la cola', 'system');
}

function sanitizeUser(user) {
  return user.replace(/[^a-zA-Z0-9_-]/g, '');
}

/* ---------------------------------------------------------
   COMANDOS Y MENSAJES DE CHAT
   --------------------------------------------------------- */
export function handleExtranjeriaCmd(user, cmd, parts, text) {
  const ms = state.modeState;
  if (!ms) return;

  // El bocadillo SOLO muestra mensajes reales del chat del usuario que
  // está siendo atendido en ese momento; nunca un texto fijo/de relleno.
  if (ms.current && user === ms.current && typeof text === 'string' && text.trim()) {
    extrShowBubble(text.trim());
  }

  if (cmd === '!participo') {
    if (ms.players[user]) return; // ya está en la cola o siendo atendido
    const gender = Math.random() < 0.5 ? 'f' : 'm';
    const npc = getRandomOwNpc(gender);
    ms.players[user] = {
      user, npc, gender,
      elId: 'extr-q-' + sanitizeUser(user),
      // Se genera el caso (pasaporte) ya desde que se apunta a la cola,
      // en vez de al llegar al mostrador, para que !info pueda
      // consultarlo mientras espera y sea el MISMO caso que se resuelva
      // luego en la ventanilla (no uno nuevo generado al azar otra vez).
      data: extrGenerateCase(user, gender, npc),
    };
    ms.queue.push(user);
    addChatMessage(null, `🛂 ${user} se pone en la cola de Control de Extranjería!`, 'correct', { mirror: false });
    playVeJoin();
    extrAddQueueDom(user);
    extrUpdateStats();
    extrRenderQueuePanel();
    return;
  }

  if (cmd === '!info') {
    // Solo disponible mientras el usuario sigue esperando en la cola: una
    // vez llamado al mostrador, sus datos ya se ven en pantalla.
    if (!ms.players[user] || !ms.queue.includes(user)) return;
    const d = ms.players[user].data;
    if (!d) return;
    addChatMessage(null, `📄 @${user}, tu pasaporte: ${d.name} ${d.surname}, ${d.age} años, de ${d.origin}. Profesión: ${d.profession}. Equipaje: ${d.items.join(', ')}`, 'system');
    return;
  }

  if (cmd === '!si' || cmd === '!no') {
    if (!ms.current) return; // no hay votación activa
    if (ms.votedUsers.has(user)) return; // un voto por usuario y ronda
    ms.votedUsers.add(user);
    if (cmd === '!si') ms.votes.yes++; else ms.votes.no++;
    extrUpdateVoteBar();
  }
}

/* ---------------------------------------------------------
   ESCENA PRINCIPAL
   --------------------------------------------------------- */
function renderExtranjeria() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="extr-wrap">
      <div class="extr-topbar">
        <div class="stat">🧍 En cola: <b id="extr-queue-count">0</b></div>
        <div class="stat">✅ Admitidos: <b id="extr-allowed-count">0</b></div>
        <div class="stat">⛔ Rechazados: <b id="extr-denied-count">0</b></div>
      </div>
      <div class="extr-scene game-scene" id="extr-scene">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>

        <div class="extr-queue-area">
          <div class="extr-queue-gate">🚪</div>
          <div class="extr-queue-line" id="extr-queue-line">
            <div class="extr-queue-empty" id="extr-queue-empty">Nadie en la cola todavía... ¡escribe !participo!</div>
          </div>
        </div>

        <!-- Zona intermedia: el NPC atendido se muestra aquí, de cuerpo
             entero y en primer plano, por encima del mostrador (como la
             ventanilla de un control fronterizo en Papers, Please). -->
        <div class="extr-office-area">
          <div class="extr-office-bars"></div>
          <!-- Empieza ya con la clase "entering" (oculto/fuera de escena):
               igual que queda tras resolver cada caso, para que la
               PRIMERA llamada anime igual que las siguientes (un solo
               deslizamiento de entrada) en vez de arrancar "visible" y
               dar un tirón de salida-y-entrada la primera vez. -->
          <div class="extr-booth-npc entering" id="extr-booth-npc">
            <div class="extr-bubble-stack" id="extr-bubble-stack"></div>
            <div class="extr-booth-spotlight"></div>
            <img id="extr-booth-img" class="extr-booth-img" alt="">
          </div>
        </div>

        <!-- Mostrador del streamer: ocupa toda la franja inferior de la
             escena (30% de la altura), con el pasaporte y los controles
             de decisión colocados sobre la propia mesa de madera. -->
        <div class="extr-desk-bar">
          <div class="extr-desk-lamp-glow"></div>
          <div class="extr-desk-left">
            <button class="extr-next-btn" id="extr-next-btn">👉 Llamar<br>Siguiente</button>
          </div>
          <div class="extr-desk-center">
            <div class="extr-passport" id="extr-passport" title="Click para ampliar el pasaporte">
              <div class="extr-passport-emblem">🛂</div>
              <div class="extr-passport-title">PASAPORTE</div>
            </div>
          </div>
          <div class="extr-desk-right">
            <div class="extr-decision-row">
              <button class="extr-btn extr-btn-allow" id="extr-allow-btn" disabled title="Dejar pasar">
                <span class="extr-btn-stamp">✔</span>
              </button>
              <button class="extr-btn extr-btn-deny" id="extr-deny-btn" disabled title="Denegar entrada">
                <span class="extr-btn-stamp">✗</span>
              </button>
            </div>
            <div class="extr-vote-wrap" id="extr-vote-wrap">
              <div class="extr-vote-bar">
                <div class="extr-vote-fill-yes" id="extr-vote-yes"></div>
                <div class="extr-vote-fill-no" id="extr-vote-no"></div>
              </div>
              <div class="extr-vote-label" id="extr-vote-label">🗳️ !si / !no — 0 votos</div>
            </div>
          </div>
          <!-- Periódico sobre la mesa, a la derecha del todo: a diferencia
               del pasaporte (que cambia con cada NPC atendido y solo
               aparece tras llamarlo), este es un elemento fijo de la
               escena -se monta una única vez al renderizar la mesa y no se
               toca en ningún otro punto del modo-, con su propio titular
               inventado siempre igual. Interactuable igual que el
               pasaporte: al pulsarlo despliega el mismo tipo de modal (ver
               extrOpenNewspaperModal más abajo). -->
          <div class="extr-newspaper" id="extr-newspaper" title="Click para leer el periódico">
            <div class="extr-newspaper-prop-mast">EL HERALDO POKÉMON</div>
            <div class="extr-newspaper-prop-lines">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="extr-info-grid">
        <div class="ranking-panel" id="extr-queue-panel">
          <div class="ranking-title">🧍 Cola</div>
          <div id="extr-queue-list"></div>
        </div>
        <div class="battle-log" id="extr-log"><p style="color:var(--muted);font-style:italic;">¡Que empiece el control fronterizo!</p></div>
      </div>
    </div>
  `;
  $('extr-next-btn').onclick = () => extrCallNext();
  $('extr-allow-btn').onclick = () => extrResolve(true);
  $('extr-deny-btn').onclick = () => extrResolve(false);
  $('extr-passport').onclick = () => extrOpenPassportModal();
  $('extr-newspaper').onclick = () => extrOpenNewspaperModal();
  extrUpdateVoteBar();
}

/* ---------------------------------------------------------
   COLA
   --------------------------------------------------------- */
function extrAddQueueDom(user) {
  const ms = state.modeState;
  const line = $('extr-queue-line');
  if (!ms || !line) return;
  const emptyMsg = $('extr-queue-empty');
  if (emptyMsg) emptyMsg.remove();

  const p = ms.players[user];
  const el = document.createElement('div');
  el.className = 'extr-queue-npc joining';
  el.id = p.elId;
  const imgId = p.elId + '-img';
  el.innerHTML = `
    <div class="extr-queue-ow-slot"><img id="${imgId}" class="extr-queue-ow-img" alt=""></div>
    <div class="extr-queue-name">@${escapeHtml(user)}</div>
  `;
  line.appendChild(el);
  applyOwNpcSprite($(imgId), p.npc);
  ms.queueDom[user] = { el };
  setTimeout(() => { if (el.isConnected) el.classList.remove('joining'); }, EXTR_QUEUE_JOIN_MS);
}

function extrUpdateStats() {
  const ms = state.modeState;
  if (!ms) return;
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('extr-queue-count', ms.queue.length);
  set('extr-allowed-count', ms.allowed);
  set('extr-denied-count', ms.denied);
}

function extrRenderQueuePanel() {
  const ms = state.modeState;
  const list = $('extr-queue-list');
  if (!ms || !list) return;
  const rows = [];
  if (ms.current) {
    rows.push(`<div class="extr-queue-row current"><span>🛂 @${escapeHtml(ms.current)}</span><span>en el mostrador</span></div>`);
  }
  ms.queue.forEach((u, i) => {
    rows.push(`<div class="extr-queue-row"><span>#${i + 1} @${escapeHtml(u)}</span><span></span></div>`);
  });
  list.innerHTML = rows.length
    ? rows.join('')
    : '<div style="font-size:12px;color:var(--muted);">Sin nadie esperando</div>';
}

/* ---------------------------------------------------------
   VOTACIÓN DEL CHAT (!si / !no)
   --------------------------------------------------------- */
function extrResetVotes() {
  const ms = state.modeState;
  if (!ms) return;
  ms.votes = { yes: 0, no: 0 };
  ms.votedUsers = new Set();
  extrUpdateVoteBar();
}

function extrUpdateVoteBar() {
  const ms = state.modeState;
  const yesEl = $('extr-vote-yes');
  const noEl = $('extr-vote-no');
  const labelEl = $('extr-vote-label');
  if (!ms || !yesEl || !noEl || !labelEl) return;
  const total = ms.votes.yes + ms.votes.no;
  const yesPct = total ? (ms.votes.yes / total) * 100 : 50;
  const noPct = total ? (ms.votes.no / total) * 100 : 50;
  yesEl.style.width = yesPct + '%';
  noEl.style.width = noPct + '%';
  labelEl.textContent = total
    ? `🗳️ ✔ ${ms.votes.yes} — ${ms.votes.no} ✗  (${total} votos)`
    : '🗳️ !si / !no — 0 votos';
}

/* ---------------------------------------------------------
   BOCADILLO DE DIÁLOGO
   -----------------------------------------------------------
   Solo se usa para reflejar mensajes reales del chat del usuario en
   ventanilla; nunca muestra frases fijas ni de relleno.
   Cada mensaje nuevo se apila en su propio bocadillo sobre la cabeza del
   NPC: los anteriores se recolocan encima (más arriba) en vez de
   desaparecer, y cada uno se desvanece por su cuenta cuando pasa
   EXTR_BUBBLE_HOLD_MS desde que se escribió.
   --------------------------------------------------------- */
function extrShowBubble(text) {
  const ms = state.modeState;
  const stack = $('extr-bubble-stack');
  if (!ms || !stack) return;

  const shown = text.length > 90 ? text.slice(0, 87) + '…' : text;
  const el = document.createElement('div');
  el.className = 'extr-bubble';
  el.textContent = shown;
  stack.appendChild(el);
  void el.offsetWidth; // fuerza el reflow para que la animación de entrada se aplique
  el.classList.add('show');

  // No dejar que se acumulen mensajes indefinidamente: si hay demasiados
  // bocadillos a la vez, el más antiguo se retira ya (los que quedan siguen
  // teniendo su propio temporizador de desvanecido intacto).
  // OJO: extrRemoveBubble() NO saca el nodo del DOM al instante, solo le
  // pone la clase "hide" y programa su borrado real 250ms después (para
  // que se vea la animación de desvanecido). Por eso aquí NO podemos mirar
  // "stack.children.length" (ese nodo sigue contando mientras se desvanece)
  // ni volver a pasarle el mismo nodo ya "hide" a extrRemoveBubble: si un
  // usuario escribe muchos mensajes muy rápido (más rápido que esos
  // 250ms), stack.children.length nunca bajaba dentro de este bucle
  // síncrono y se quedaba girando para siempre, bloqueando el juego.
  // Filtramos los que aún NO se están desvaneciendo y vamos retirando el
  // más antiguo de esa lista, que sí que baja en cada vuelta.
  const visible = Array.from(stack.children).filter(c => c !== el && !c.classList.contains('hide'));
  while (visible.length + 1 > EXTR_BUBBLE_MAX) {
    extrRemoveBubble(visible.shift());
  }

  const timer = setTimeout(() => extrRemoveBubble(el), EXTR_BUBBLE_HOLD_MS);
  ms.bubbleTimers.push(timer);
}

function extrRemoveBubble(el) {
  // El "el.classList.contains('hide')" evita reprogramar el borrado de un
  // bocadillo que ya se está desvaneciendo (podría pasarle de nuevo si se
  // llama dos veces seguidas para el mismo nodo).
  if (!el || !el.isConnected || el.classList.contains('hide')) return;
  el.classList.remove('show');
  el.classList.add('hide');
  setTimeout(() => { if (el.isConnected) el.remove(); }, EXTR_BUBBLE_HIDE_MS);
}

// Vacía de golpe (sin animación de desvanecido) todos los bocadillos
// apilados y cancela sus temporizadores: se usa al llamar a un nuevo NPC o
// al resolver el caso actual, para que no queden mensajes del anterior.
function extrClearBubbles() {
  const ms = state.modeState;
  const stack = $('extr-bubble-stack');
  if (ms) {
    ms.bubbleTimers.forEach(t => clearTimeout(t));
    ms.bubbleTimers = [];
  }
  if (stack) stack.innerHTML = '';
}

/* ---------------------------------------------------------
   GENERACIÓN DEL CASO (pasaporte)
   --------------------------------------------------------- */
function extrGenerateCase(user, gender, npc) {
  const origin = EXTR_ORIGINS[Math.floor(Math.random() * EXTR_ORIGINS.length)];
  const [ageMin, ageMax] = EXTR_AGE_RANGES[npc && npc.ageGroup] || EXTR_AGE_RANGES.adult;
  const age = ageMin + Math.floor(Math.random() * (ageMax - ageMin + 1));
  const professionPair = EXTR_PROFESSIONS[Math.floor(Math.random() * EXTR_PROFESSIONS.length)];
  const profession = gender === 'f' ? professionPair.f : professionPair.m;
  const nameList = gender === 'f' ? EXTR_NAMES_F : EXTR_NAMES_M;
  const name = nameList[Math.floor(Math.random() * nameList.length)];
  const surname = EXTR_SURNAMES[Math.floor(Math.random() * EXTR_SURNAMES.length)];
  const hasProblem = Math.random() < EXTR_PROBLEM_CHANCE;

  const items = [];
  const pool = EXTR_LUGGAGE.slice();
  for (let i = 0; i < 3 && pool.length; i++) {
    items.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  return {
    name, surname, age, origin, profession, items,
    problem: hasProblem,
  };
}

/* ---------------------------------------------------------
   LLAMAR AL SIGUIENTE DE LA COLA
   --------------------------------------------------------- */
function extrCallNext() {
  const ms = state.modeState;
  if (!ms) return;
  if (ms.current) { toast('Resuelve primero al que está en el mostrador'); return; }
  if (ms.queue.length === 0) { toast('No hay nadie en la cola'); return; }

  const user = ms.queue.shift();
  const p = ms.players[user];
  const dom = ms.queueDom[user];
  delete ms.queueDom[user];
  if (dom && dom.el) {
    dom.el.classList.add('leaving');
    setTimeout(() => { if (dom.el.isConnected) dom.el.remove(); }, EXTR_QUEUE_LEAVE_MS);
  }
  extrUpdateStats();

  ms.current = user;
  // Reutiliza el caso ya generado al apuntarse (para que coincida con lo
  // que !info pudo haberle contado mientras esperaba en la cola), en vez
  // de generar uno nuevo al llegar al mostrador.
  ms.currentData = (p && p.data) ? p.data : extrGenerateCase(user, p ? p.gender : 'm', p ? p.npc : getRandomOwNpc('m'));
  extrResetVotes();
  extrRenderQueuePanel();
  extrRenderBooth();
}

function extrRenderBooth() {
  const ms = state.modeState;
  if (!ms || !ms.current) return;
  const p = ms.players[ms.current];
  const data = ms.currentData;

  const npcEl = $('extr-booth-npc');
  const img = $('extr-booth-img');
  const bubbleStack = $('extr-bubble-stack');
  const currentUser = ms.current;
  applyOwNpcSprite(img, p.npc);
  // La hoja de sprites OW trae bastante margen transparente por encima de
  // la cabeza dentro del fotograma (varía según el NPC), así que hay que
  // medirlo para anclar el bocadillo justo encima de la cabeza real y no
  // del recuadro completo del fotograma (eso es lo que lo hacía verse
  // "flotando" muy por encima del sprite). Se limpia el ajuste anterior
  // mientras se mide el nuevo, para no arrastrar el offset del NPC previo.
  if (bubbleStack) bubbleStack.style.bottom = '';
  owNpcHeadTopRatio(p.npc).then(ratio => {
    const ms2 = state.modeState;
    if (!ms2 || ms2.current !== currentUser || !bubbleStack) return;
    const displayedH = img.clientHeight || img.offsetHeight || 258;
    const headTopPx = Math.round(ratio * displayedH);
    bubbleStack.style.bottom = `calc(100% - ${headTopPx}px + 4px)`;
  });
  npcEl.classList.remove('exit-allow', 'exit-deny');
  npcEl.classList.add('entering');
  playExtrArrive();
  setTimeout(() => { if (npcEl) npcEl.classList.remove('entering'); }, EXTR_BOOTH_ENTER_MS);

  // El pasaporte cae sobre la mesa con una animación tras la llegada del NPC.
  const passport = $('extr-passport');
  passport.classList.remove('show', 'drop-in');
  void passport.offsetWidth; // reinicia la animación aunque sea el mismo elemento
  setTimeout(() => {
    const ms2 = state.modeState;
    if (!ms2 || ms2.current !== ms.current) return;
    passport.classList.add('show', 'drop-in');
    playExtrPassportDrop();
  }, EXTR_BOOTH_ENTER_MS * 0.6);

  extrClearBubbles();

  $('extr-allow-btn').disabled = false;
  $('extr-deny-btn').disabled = false;

  extrLog(`🛂 Atendiendo a ${data.name} ${data.surname} / @${ms.current} (${data.origin}, ${data.profession})`, '');
  addChatMessage(null, `🛂 @${ms.current} se presenta ante el mostrador con su pasaporte...`, 'system', { mirror: false });
}

/* ---------------------------------------------------------
   PASAPORTE AMPLIADO (click sobre el pasaporte)
   --------------------------------------------------------- */
function extrOpenPassportModal() {
  const ms = state.modeState;
  if (!ms || !ms.current || !ms.currentData) { toast('No hay ningún pasaporte sobre la mesa'); return; }
  const p = ms.players[ms.current];
  const data = ms.currentData;

  const body = `
    <div class="extr-modal-passport">
      <div class="extr-modal-passport-head">
        <div class="extr-modal-passport-photo"><img id="extr-modal-passport-img" alt=""></div>
        <div>
          <div class="extr-modal-passport-name">${escapeHtml(data.name)} ${escapeHtml(data.surname)}</div>
          <div class="extr-modal-passport-user">@${escapeHtml(ms.current)}</div>
        </div>
      </div>
      <div class="extr-modal-passport-row"><span class="extr-modal-passport-label">🎂 Edad</span><span>${data.age} años</span></div>
      <div class="extr-modal-passport-row"><span class="extr-modal-passport-label">🌍 Región de nacimiento</span><span>${escapeHtml(data.origin)}</span></div>
      <div class="extr-modal-passport-row"><span class="extr-modal-passport-label">🛠️ Profesión</span><span>${escapeHtml(data.profession)}</span></div>
      <div class="extr-modal-passport-row"><span class="extr-modal-passport-label">🎒 Equipaje</span><span>${escapeHtml(data.items.join(', '))}</span></div>
    </div>
  `;
  showModal('🛂 Pasaporte', body, [{ label: 'Cerrar', class: 'btn-primary' }]);
  applyOwNpcSprite($('extr-modal-passport-img'), p.npc);
}

/* ---------------------------------------------------------
   PERIÓDICO DE LA MESA (click sobre el periódico)
   ---------------------------------------------------------
   Las noticias son ficticias, pensadas solo para ambientar la mesa del
   control fronterizo. Desde que el periódico pasó a ser aleatorio, en vez
   de un contenido fijo hay tres "pools" de noticias (principal, secundaria
   y otros/breves) de las que se sortean 1 + 2 + 2 cada vez que el
   streamer abre el modo (ver startExtranjeria/extrRollNewspaper); el
   resultado se guarda en ms.newspaper y se mantiene fijo mientras el
   streamer siga en la mesa, así que abrir el periódico varias veces en la
   misma partida siempre muestra la misma edición. */
const EXTR_NEWS_PRINCIPAL = [
  {
    headline: 'Avistado un Pokémon legendario sobrevolando el Monte Plateado',
    byline: 'Redacción · Ciudad Verde',
    lead: 'Decenas de vecinos aseguran haber visto anoche una silueta descomunal recortada contra la luna, envuelta en un resplandor que «no era de este mundo». Ornitólogos, cazadores de leyendas y algún que otro Team Rocket disfrazado de turista ya acampan a las puertas del monte a la espera de una segunda aparición.',
  },
  {
    headline: 'El Monte Cenizo entra en erupción sin previo aviso',
    byline: 'Redacción · Pueblo Lavacalda',
    lead: 'La ladera norte del volcán empezó a expulsar ceniza y lava pasada la medianoche, obligando a evacuar a los entrenadores acampados en la zona. Los servicios de emergencia coordinan la salida junto a una hilera de Rapidash y Ponyta que, según testigos, «parecían saber el camino mejor que nadie».',
  },
  {
    headline: 'Un apagón deja a oscuras toda Ciudad Luminalia',
    byline: 'Redacción · Ciudad Luminalia',
    lead: 'Un fallo en la central eléctrica dejó sin suministro a medio millón de vecinos durante casi tres horas. La compañía asegura que sigue investigando las causas, aunque varios testigos apuntan a un Electrode que «se puso nervioso» junto a un transformador.',
  },
  {
    headline: 'La Liga Pokémon vive hoy su gran final',
    byline: 'Redacción · Meseta Añil',
    lead: 'Miles de aficionados llenan las gradas de la Meseta Añil para presenciar el combate que coronará al nuevo Campeón de la Liga. Los puestos de merchandising ya han agotado existencias de bufandas y las apuestas siguen abiertas hasta el primer lanzamiento.',
  },
  {
    headline: 'Un grupo de jóvenes provoca un incendio al intentar encender la barbacoa con un Charizard',
    byline: 'Redacción · Ciudad Carmín',
    lead: 'Los bomberos tuvieron que intervenir tras una fiesta que se les fue «un poco» de las manos: varios asistentes, con más alcohol que sentido común, pidieron a un Charizard que echara «una llamita» sobre el carbón. El jardín ardió por completo; las salchichas, sorprendentemente, sobrevivieron.',
  },
];

const EXTR_NEWS_SECUNDARIAS = [
  {
    title: 'Snorlax corta la Ruta 12 por sexta semana consecutiva',
    text: 'Los vecinos piden turnos organizados de Pokéflauta después de comprobar que gritarle «¡muévete!» no ha servido absolutamente de nada.',
  },
  {
    title: 'La migración de los Wingull tiñe el cielo de Ciudad Portual',
    text: 'Bandadas enteras sobrevuelan el puerto camino al sur, y los pescadores locales ya se han acostumbrado a compartir la captura del día con más de un pico curioso.',
  },
  {
    title: 'Un Magikarp bate el récord de salto en el concurso anual',
    text: 'El pequeño pez alcanzó una altura nunca vista usando solo Salpicadura, dejando a los jueces —y a su entrenador— boquiabiertos ante semejante hazaña de determinación.',
  },
  {
    title: '¿Cómo funcionan realmente las piedras evolutivas?',
    text: 'Un equipo de investigadores de Ciudad Celeste publica el primer estudio detallado sobre la reacción energética que desencadenan las piedras evolutivas, aunque reconocen que «todavía no saben muy bien por qué brillan».',
  },
  {
    title: 'Un entrenador confunde una Poké Ball con un Voltorb',
    text: 'El incidente, ocurrido en plena calle, terminó con una pequeña explosión, un chichón y una anécdota que el protagonista promete no volver a contar en ninguna cena.',
  },
  {
    title: 'Sube el precio de las Poké Balls antes de la temporada de gimnasios',
    text: 'Las tiendas achacan la subida a la alta demanda de entrenadores que se preparan para la nueva temporada; los aficionados achacan la subida a las tiendas.',
  },
  {
    title: 'La policía busca a un entrenador que abandonó a sus Pokémon',
    text: 'Se solicita colaboración ciudadana para localizar al responsable, después de que varios vecinos encontraran a los Pokémon esperando pacientemente frente al Centro Pokémon.',
  },
  {
    title: 'Una tormenta eléctrica provoca cortes de luz en varias rutas',
    text: 'Los técnicos trabajan contrarreloj para restablecer el suministro, mientras algunos vecinos aseguran que el apagón coincidió, «sospechosamente», con el paso de un ave misteriosa.',
  },
  {
    title: 'Devon S.A. presenta su nuevo Pokénav',
    text: 'La compañía promete mapa, videollamada y conexión inalámbrica en un solo dispositivo, aunque los primeros usuarios ya se quejan de que «pesa como una Master Ball».',
  },
  {
    title: 'El concurso de belleza Pokémon bate récord de audiencia',
    text: 'La gala, retransmitida en directo, superó todas las expectativas de público gracias a un cierre por todo lo alto protagonizado por un Milotic y mucha purpurina.',
  },
];

const EXTR_NEWS_OTROS = [
  {
    title: '☀️ El tiempo en Kanto',
    text: 'Soleado, con probabilidad de nubes por la tarde.',
  },
  {
    title: '📋 Clasificados',
    text: 'SE BUSCA compañero de viaje para completar la Pokédex Nacional. Imprescindible Master Ball auténtica; abstenerse charlatanes.',
  },
  {
    title: '🍊 Mercado',
    text: 'La baya aranja baja de precio tras una cosecha récord esta temporada.',
  },
  {
    title: '💉 Sanidad',
    text: 'El Centro Pokémon anuncia una campaña de vacunación gratuita para Pokémon de la zona.',
  },
  {
    title: '💼 Empleo',
    text: 'La Tienda Pokémon del centro busca dependientes con experiencia; imprescindible no tener miedo a los Growlithe guardianes.',
  },
  {
    title: '🚲 Anuncios',
    text: 'Compra tu bici en la tienda de Anacleto: «la más rápida de la región, garantizado o te devolvemos el sillín».',
  },
  {
    title: '🎙️ Entrevista',
    text: 'El profesor Oak repasa cuarenta años de investigación Pokémon: «sigo sin recordar el nombre de mi vecino, pero el de cada Pokémon sí».',
  },
  {
    title: '🚨 Sucesos',
    text: 'Un Hypno distrajo con su péndulo a una niña durante unos minutos en el bosque; la Agente Mara la encontró enseguida sana y salva, merendando con un grupo de Pikachu.',
  },
  {
    title: '🚌 Transporte',
    text: 'Una nueva línea del Magnetotren conectará Ciudad Azafrán con Ciudad Fucsia a partir del mes que viene.',
  },
  {
    title: '🏠 Inmobiliaria',
    text: 'Se alquila piso con vistas al Faro de la ciudad; se ruega no traer Gyarados a la piscina comunitaria.',
  },
];

// Elige n elementos distintos al azar de un array (sin repetir), para
// sortear las noticias secundarias y de "otros" de cada edición.
function extrPickRandomDistinct(arr, n) {
  const pool = arr.slice();
  const picked = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// Sortea una nueva edición del periódico (1 noticia principal + 2
// secundarias + 2 de "otros") y la guarda en ms.newspaper. Se llama una
// vez al entrar en el modo (ver startExtranjeria), así toda la partida
// lee la misma edición aunque el streamer abra el periódico varias veces.
function extrRollNewspaper() {
  return {
    principal: EXTR_NEWS_PRINCIPAL[Math.floor(Math.random() * EXTR_NEWS_PRINCIPAL.length)],
    secundarias: extrPickRandomDistinct(EXTR_NEWS_SECUNDARIAS, 2),
    otros: extrPickRandomDistinct(EXTR_NEWS_OTROS, 2),
  };
}

// A diferencia del pasaporte, el contenido no depende de ms.current ni de
// ms.currentData en absoluto, así que no hace falta comprobar que haya
// ningún caso en curso: el streamer puede leerlo en cualquier momento,
// incluso con la mesa vacía entre un NPC y el siguiente.
function extrOpenNewspaperModal() {
  const ms = state.modeState;
  const news = (ms && ms.newspaper) || extrRollNewspaper();
  const body = `
    <div class="extr-newspaper-modal">
      <div class="extr-newspaper-masthead">
        <div class="extr-newspaper-name">EL HERALDO POKÉMON</div>
        <div class="extr-newspaper-meta">
          <span>Edición de Kanto</span><span>·</span><span>Nº 214</span><span>·</span><span>15 sabuesos de cobre</span>
        </div>
      </div>
      <div class="extr-newspaper-rule extr-newspaper-rule--thick"></div>
      <div class="extr-newspaper-headline">${escapeHtml(news.principal.headline)}</div>
      <div class="extr-newspaper-byline">${escapeHtml(news.principal.byline)}</div>
      <p class="extr-newspaper-lead">${escapeHtml(news.principal.lead)}</p>
      <div class="extr-newspaper-rule"></div>
      <div class="extr-newspaper-columns">
        ${news.secundarias.map(n => `
        <div class="extr-newspaper-col">
          <div class="extr-newspaper-col-title">${escapeHtml(n.title)}</div>
          <p>${escapeHtml(n.text)}</p>
        </div>`).join('')}
      </div>
      <div class="extr-newspaper-rule"></div>
      <div class="extr-newspaper-bottom">
        ${news.otros.map(n => `
        <div class="extr-newspaper-box">
          <div class="extr-newspaper-box-title">${escapeHtml(n.title)}</div>
          <div>${escapeHtml(n.text)}</div>
        </div>`).join('')}
      </div>
    </div>
  `;
  showModal('📰 Periódico', body, [{ label: 'Cerrar', class: 'btn-primary' }]);
}


/* ---------------------------------------------------------
   DECISIÓN DEL STREAMER
   --------------------------------------------------------- */
function extrResolve(allow) {
  const ms = state.modeState;
  if (!ms || !ms.current || ms.resolving) return;
  ms.resolving = true;
  $('extr-allow-btn').disabled = true;
  $('extr-deny-btn').disabled = true;
  if (allow) playExtrStampAllow(); else playExtrStampDeny();

  const user = ms.current;
  const data = ms.currentData;
  const correct = allow ? !data.problem : data.problem;

  ms.processed++;
  if (allow) ms.allowed++; else ms.denied++;
  if (correct) ms.correctCalls++;

  const basePts = 40;
  const bonusPts = correct ? 80 : 0;
  addScore(user, basePts + bonusPts);

  if (allow) {
    extrLog(`✅ @${user} pasa el control${correct ? ' (decisión acertada)' : ''}`, correct ? 'crit' : '');
    addChatMessage(null, `✅ @${user} ha sido admitido en el país${correct ? ', ¡buen ojo!' : ''}`, 'correct');
  } else {
    extrLog(`⛔ @${user} es rechazado${correct ? ' (decisión acertada)' : ''}`, correct ? 'crit' : 'dmg');
    addChatMessage(null, `⛔ @${user} ha sido rechazado en la frontera${correct ? ', ¡buen ojo!' : ''}`, 'wrong');
  }

  const npcEl = $('extr-booth-npc');
  npcEl.classList.add(allow ? 'exit-allow' : 'exit-deny');
  const passport = $('extr-passport');
  passport.classList.remove('show', 'drop-in');
  extrClearBubbles();

  setTimeout(() => {
    const ms2 = state.modeState;
    if (!ms2) return;
    delete ms2.players[user];
    ms2.current = null;
    ms2.currentData = null;
    ms2.resolving = false;
    // Al terminar la animación de salida hay que dejar al NPC oculto
    // (no solo quitar las clases de salida, o el sprite "reaparecería"
    // de golpe y se quedaría visible hasta la siguiente llamada).
    npcEl.classList.remove('exit-allow', 'exit-deny');
    npcEl.classList.add('entering');
    extrUpdateStats();
    extrRenderQueuePanel();
  }, EXTR_RESOLVE_EXIT_MS);
}

function extrLog(text, cls = '') {
  const log = $('extr-log');
  if (!log) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}
