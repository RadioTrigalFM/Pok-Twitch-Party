import {
  playPpNewLetter, playPpCorrectStreamer, playPpCorrectChat, playPpWrong,
  playPpTimeout, playPpRoscoComplete, playPpVictory, playPpDraw,
} from '../audio.js';
import { addChatMessage, escapeHtml } from '../chat.js';
import { pickPasapalabraQuestions } from '../data/questionsDb.js';
import { backToMenu } from '../modeLauncher.js';
import { state } from '../state.js';
import { $, addScore, normalizeAnswer, showModal } from '../utils.js';

/* =========================================================
   PASAPALABRA MODE — Streamer vs Chat
   ========================================================= */
let PASAPALABRA_QUESTIONS = pickPasapalabraQuestions();

// Normaliza una respuesta para compararla: quita tildes/mayúsculas (vía
// normalizeAnswer) y además elimina espacios, guiones y cualquier otro
// carácter que no sea letra o número, para que "Ho-Oh", "ho oh", "HOOH" y
// "hooh" se consideren todas la misma respuesta (mismo criterio que
// veNorm en voltorbexplosivo.js). Se usa tanto para la respuesta del
// Streamer (submitStreamerAnswer) como para la del chat
// (handlePasapalabraCmd).
function ppNorm(s) {
  return normalizeAnswer(s).replace(/[^a-z0-9]/g, '');
}

// Comprueba una respuesta contra la respuesta principal de la pregunta
// (qData.a) y, si las tiene, sus respuestas alternativas válidas
// (qData.alts, p.ej. singular/plural o nombre corto/largo del mismo
// objeto: "Bici"/"Bicicleta", "Ficha"/"Fichas" — ver questionsDb.js). Cada
// candidata se compara con el mismo criterio de siempre (substring en
// cualquiera de los dos sentidos tras ppNorm), así que un acierto contra
// cualquiera de las alternativas cuenta igual que contra la principal.
function ppAnswerCorrect(qData, rawAnswer) {
  const answer = ppNorm(rawAnswer);
  if (!answer) return false;
  const candidates = [qData.a, ...(Array.isArray(qData.alts) ? qData.alts : [])];
  return candidates.some(c => {
    const correctAnswer = ppNorm(c);
    return answer.includes(correctAnswer) || correctAnswer.includes(answer);
  });
}

export function startPasapalabra() {
  PASAPALABRA_QUESTIONS = pickPasapalabraQuestions();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  state.modeState = {
    letters,
    currentIndex: -1,   // se incrementa antes de usarse, así el primero es índice 0
    visitCount: 0,       // nº de letras visitadas; tope = letters.length * 2 (dos vueltas)
    statuses: {},         // letter -> 'pending' | 'streamer' | 'chat'
    currentLetter: null,
    resolved: false,      // true mientras se espera el cambio a la siguiente letra
    timer: null,
    timeLeft: 30,
    totalTime: 30,
    streamerScore: 0,
    chatScore: 0,
    correctByUser: {},   // usuario -> nº de letras acertadas por esa persona
    // Si el streamer activa el bloqueo (ver togglePasapalabraChatLock/el
    // botón #pp-chat-lock-btn), el chat deja de poder participar mediante
    // comandos (!<respuesta>, !puntos...): se ignoran por completo en
    // handlePasapalabraCmd hasta que se reactive. El Streamer sigue
    // respondiendo con normalidad desde su propio campo de texto, que no
    // pasa por ahí.
    chatLocked: false,
  };
  letters.forEach(l => state.modeState.statuses[l] = 'pending');
  renderPasapalabra();
  nextPasapalabraLetter();
}

function renderPasapalabra() {
  const content = $('game-content');
  content.innerHTML = `
    <div class="pasapalabra-wrap">
      <div class="pp-scene game-scene" id="pp-scene">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <!-- pp-fs-layout: fuera de pantalla completa es un simple "display:contents"
             (ver .pp-fs-layout/.pp-fs-col en styles.css), así que sus tres columnas
             se disuelven y el contenido fluye exactamente igual que antes dentro del
             flex column de #pp-scene (mismo orden: marcador, rosco, barra de tiempo,
             pregunta, campo de respuesta oculto). Solo en pantalla completa
             (#pp-scene:fullscreen/.fs-fallback) pasa a ser una rejilla de 3 columnas
             (izquierda: aciertos, centro: rosco+pregunta+respuesta, derecha: ranking
             del chat), ver el bloque "Pasapalabra: layout de pantalla completa" en
             styles.css. -->
        <div class="pp-fs-layout">
          <div class="pp-fs-col pp-fs-col-left">
            <div class="pp-scoreboard">
              <div class="pp-score-side pp-score-streamer">
                <div class="pp-score-label">🎤 Streamer</div>
                <div class="pp-score-value" id="pp-score-streamer">0</div>
              </div>
              <div class="pp-score-vs">VS</div>
              <div class="pp-score-side pp-score-chat">
                <div class="pp-score-label">💬 Chat</div>
                <div class="pp-score-value" id="pp-score-chat">0</div>
              </div>
            </div>
          </div>
          <div class="pp-fs-col pp-fs-col-center">
            <div class="rosco">
              <svg viewBox="0 0 500 500" id="rosco-svg"></svg>
            </div>
            <div class="timer-bar"><div class="timer-bar-fill" id="pp-timer" style="width:100%"></div></div>
            <div class="question-box" id="pp-question">
              <div class="question-letter" id="pp-letter">Preparando...</div>
              <div class="question-text" id="pp-text">Esperando primera pregunta</div>
            </div>
            <div class="pp-streamer-form pp-fs-answer">
              <input type="text" id="pp-streamer-input-fs" placeholder="Escribe tu respuesta..." autocomplete="off">
              <button id="pp-streamer-submit-fs">Responder</button>
            </div>
          </div>
          <div class="pp-fs-col pp-fs-col-right">
            <!-- Ranking en vivo de aciertos del chat, solo visible en pantalla
                 completa (ver .pp-fs-ranking en styles.css); se repuebla en cada
                 acierto del chat desde renderPasapalabraFsRanking(). -->
            <div class="ranking-panel pp-fs-ranking" id="pp-fs-ranking">
              <div class="ranking-title">💬 Ranking del chat</div>
              <div id="pp-fs-ranking-list"></div>
            </div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%;max-width:700px;">
        <div class="ranking-panel" id="pp-status">
          <div class="ranking-title">🎤 Tu respuesta (Streamer)</div>
          <div class="pp-streamer-form">
            <input type="text" id="pp-streamer-input" placeholder="Escribe tu respuesta..." autocomplete="off">
            <button id="pp-streamer-submit">Responder</button>
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.6;">
            Puedes probar tantas veces como quieras mientras haya tiempo.
          </p>
        </div>
        <div class="ranking-panel" id="pp-chat-info">
          <div class="ranking-title">💬 El chat responde</div>
          <button class="pp-chat-lock-btn" id="pp-chat-lock-btn" type="button">🔒 Bloquear participación del chat</button>
          <p style="font-size:12px;color:var(--muted);line-height:1.8;">
            Escribe <b style="color:var(--yellow)">!</b> seguido de tu respuesta, pegada, en el chat.<br>
            Ejemplo: <b style="color:var(--yellow)">!charizard</b>
          </p>
          <div class="pp-legend">
            <span><i class="pp-dot pp-dot-blue"></i> Pendiente</span>
            <span><i class="pp-dot pp-dot-green"></i> Streamer</span>
            <span><i class="pp-dot pp-dot-purple"></i> Chat</span>
          </div>
        </div>
      </div>
    </div>
  `;
  renderRosco();
  updatePasapalabraScoreboard();
  renderPasapalabraFsRanking();
  // El campo de respuesta del Streamer se duplica dentro de #pp-scene
  // (#pp-streamer-input-fs/#pp-streamer-submit-fs, ver .pp-fs-answer en
  // styles.css): en pantalla completa solo #pp-scene queda visible -el
  // panel de abajo (#pp-status) con el campo "normal" se queda fuera de
  // la pantalla completa junto con el resto de la página-, así que sin
  // esta copia el Streamer no tendría forma de responder mientras esté
  // en pantalla completa. Fuera de pantalla completa la copia queda
  // oculta por CSS y basta con el campo de siempre. Ambas copias se
  // mantienen sincronizadas entre sí en el resto de este fichero (ver
  // getStreamerInputEls), así que cualquiera de las dos sirve para
  // responder en cualquier momento.
  getStreamerInputEls().forEach(({ input, btn }) => {
    if (!input || !btn) return;
    btn.onclick = () => submitStreamerAnswer(input);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitStreamerAnswer(input);
    });
  });
  $('pp-chat-lock-btn').onclick = togglePasapalabraChatLock;
  updatePasapalabraChatLockUI();
}

// Devuelve los dos pares input+botón de respuesta del Streamer (el normal
// y su copia de pantalla completa, ver el comentario de renderPasapalabra
// de arriba), para poder aplicarles el mismo cambio (habilitar/
// deshabilitar, limpiar valor...) a la vez sin duplicar cada sitio que lo
// necesita.
function getStreamerInputEls() {
  return [
    { input: $('pp-streamer-input'), btn: $('pp-streamer-submit') },
    { input: $('pp-streamer-input-fs'), btn: $('pp-streamer-submit-fs') },
  ];
}

// Bloquea/reactiva la participación del chat por comandos (ver el comentario
// de ms.chatLocked en startPasapalabra y el chequeo al principio de
// handlePasapalabraCmd, más abajo). No afecta en nada al Streamer, que
// responde desde su propio campo de texto (#pp-streamer-input).
function togglePasapalabraChatLock() {
  const ms = state.modeState;
  if (!ms) return;
  ms.chatLocked = !ms.chatLocked;
  updatePasapalabraChatLockUI();
  addChatMessage(null, ms.chatLocked
    ? '🔒 El streamer ha bloqueado la participación del chat: los comandos (!<respuesta>, !puntos...) dejan de funcionar hasta que se reactive.'
    : '🔓 El streamer ha reactivado la participación del chat: los comandos vuelven a funcionar.', 'system');
}

function updatePasapalabraChatLockUI() {
  const ms = state.modeState;
  const btn = $('pp-chat-lock-btn');
  const panel = $('pp-chat-info');
  if (btn) {
    btn.textContent = ms.chatLocked ? '🔓 Reactivar participación del chat' : '🔒 Bloquear participación del chat';
    btn.classList.toggle('active', !!ms.chatLocked);
  }
  if (panel) panel.classList.toggle('pp-locked', !!ms.chatLocked);
}

function updatePasapalabraScoreboard() {
  const ms = state.modeState;
  const se = $('pp-score-streamer');
  const ce = $('pp-score-chat');
  if (se) se.textContent = ms.streamerScore;
  if (ce) ce.textContent = ms.chatScore;
}

// Repuebla el ranking de aciertos del chat que se ve en la columna derecha
// del modo pantalla completa (ver #pp-fs-ranking en styles.css/renderPasapalabra).
// Se llama al iniciar la partida (lista vacía) y cada vez que alguien del
// chat acierta una letra (ver resolvePasapalabraLetter), para que se
// mantenga siempre actualizado sin esperar a la pantalla de fin de partida.
function renderPasapalabraFsRanking() {
  const ms = state.modeState;
  const list = $('pp-fs-ranking-list');
  if (!list || !ms) return;
  const standings = Object.entries(ms.correctByUser || {})
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  if (standings.length === 0) {
    list.innerHTML = '<p style="font-size:11px;color:var(--muted);text-align:center;">Nadie ha acertado todavía</p>';
    return;
  }
  list.innerHTML = standings.map((s, i) => `
    <div class="ranking-row ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
      <span class="ranking-pos">${i + 1}</span>
      <span class="ranking-name">@${escapeHtml(s.user)}</span>
      <span class="ranking-score">${s.count}</span>
    </div>
  `).join('');
}

function renderRosco() {
  const svg = $('rosco-svg');
  if (!svg) return;
  svg.innerHTML = '';
  const letters = state.modeState.letters;
  const cx = 250, cy = 250, r = 200;
  const n = letters.length;
  letters.forEach((l, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const status = state.modeState.statuses[l];
    const active = i === state.modeState.currentIndex && !state.modeState.resolved;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `letter-cell ${status} ${active ? 'active' : ''}`);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', 22);
    g.appendChild(circle);
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', x);
    txt.setAttribute('y', y);
    txt.textContent = l;
    g.appendChild(txt);
    svg.appendChild(g);
  });
}

function nextPasapalabraLetter() {
  clearInterval(state.modeState.timer);
  const ms = state.modeState;
  const letters = ms.letters;
  const total = letters.length;

  // Si ya no quedan letras pendientes, termina la partida
  if (letters.every(l => ms.statuses[l] !== 'pending')) {
    playPpRoscoComplete();
    endPasapalabra();
    return;
  }

  // Busca la siguiente letra pendiente, permitiendo como máximo 2 vueltas completas al rosco
  let found = null;
  while (ms.visitCount < total * 2) {
    ms.currentIndex = (ms.currentIndex + 1) % total;
    ms.visitCount++;
    const l = letters[ms.currentIndex];
    if (ms.statuses[l] === 'pending') {
      found = l;
      break;
    }
  }

  if (!found) {
    // Se completaron las 2 vueltas sin resolver todas las letras: fin de partida
    endPasapalabra();
    return;
  }

  const letter = found;
  const qData = PASAPALABRA_QUESTIONS[letter];
  ms.currentLetter = letter;
  ms.resolved = false;
  ms.timeLeft = ms.totalTime;
  $('pp-letter').textContent = qData && qData.prefix ? qData.prefix : `Letra ${letter}`;
  $('pp-text').textContent = qData ? qData.q : 'Pregunta no disponible';
  getStreamerInputEls().forEach(({ input, btn }) => {
    if (input) { input.value = ''; input.disabled = false; }
    if (btn) btn.disabled = false;
  });
  renderRosco();
  const bar = $('pp-timer');
  if (bar) bar.style.width = '100%';
  playPpNewLetter();
  addChatMessage(null, `🎯 Letra ${letter} - ¡Responded con ! seguido de vuestra respuesta (p.ej. !charizard)!`, 'system', { mirror: false });
  ms.timer = setInterval(() => {
    ms.timeLeft--;
    const pct = (ms.timeLeft / ms.totalTime) * 100;
    if (bar) bar.style.width = Math.max(0, pct) + '%';
    if (ms.timeLeft <= 0) {
      clearInterval(ms.timer);
      playPpTimeout();
      addChatMessage(null, `⏰ Tiempo agotado para la letra ${letter} - la letra pasa a la siguiente vuelta`, 'system', { mirror: false });
      ms.resolved = true;
      // Permanece 'pending' (azul) para poder volver a salir en la siguiente vuelta
      nextPasapalabraLetter();
    }
  }, 1000);
}

function resolvePasapalabraLetter(winnerSide, who) {
  const ms = state.modeState;
  const letter = ms.currentLetter;
  if (!letter || ms.resolved) return;
  const qData = PASAPALABRA_QUESTIONS[letter];
  ms.resolved = true;
  clearInterval(ms.timer);
  ms.statuses[letter] = winnerSide; // 'streamer' | 'chat'
  getStreamerInputEls().forEach(({ input, btn }) => {
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
  });
  if (winnerSide === 'streamer') {
    ms.streamerScore++;
    playPpCorrectStreamer();
    addChatMessage(null, `🎤 ¡El Streamer acierta la letra ${letter}!`, 'correct', { mirror: false });
  } else {
    ms.chatScore++;
    ms.correctByUser[who] = (ms.correctByUser[who] || 0) + 1;
    addScore(who, 100);
    playPpCorrectChat();
    addChatMessage(null, `💬 ¡${who} acierta la letra ${letter} para el chat! +100 pts`, 'correct', { mirror: false });
    renderPasapalabraFsRanking();
  }
  renderRosco();
  updatePasapalabraScoreboard();
  // Aviso grande sobre la propia pregunta, visible en pantalla (no solo en el chat lateral)
  const box = $('pp-question');
  const letterEl = $('pp-letter');
  const textEl = $('pp-text');
  if (box) {
    box.classList.remove('pp-solved-streamer', 'pp-solved-chat');
    box.classList.add(winnerSide === 'chat' ? 'pp-solved-chat' : 'pp-solved-streamer');
  }
  if (letterEl) {
    letterEl.textContent = winnerSide === 'chat'
      ? `✅ Pregunta acertada por ${who}`
      : '✅ Pregunta acertada por el Streamer';
  }
  if (textEl) {
    const altsTxt = qData && Array.isArray(qData.alts) && qData.alts.length
      ? ` (o ${qData.alts.join(', ')})`
      : '';
    textEl.textContent = `Respuesta correcta: ${qData ? qData.a : '—'}${altsTxt}`;
  }
  setTimeout(() => {
    if (box) box.classList.remove('pp-solved-streamer', 'pp-solved-chat');
    nextPasapalabraLetter();
  }, 1500);
}

// inputEl: el campo concreto (el normal o su copia de pantalla completa,
// ver getStreamerInputEls) desde el que se ha pulsado Enter o el botón
// "Responder" — solo se usa para saber dónde aplicar el "shake" de fallo y
// el foco; el valor a comprobar y la limpieza tras acertar/fallar se
// aplican a las DOS copias por igual, para que ambas se mantengan siempre
// sincronizadas sea cual sea la que haya usado el Streamer.
function submitStreamerAnswer(inputEl) {
  const ms = state.modeState;
  if (!ms || !ms.currentLetter || ms.resolved) return;
  const input = inputEl || $('pp-streamer-input');
  if (!input) return;
  if (!ppNorm(input.value)) return;
  const letter = ms.currentLetter;
  const qData = PASAPALABRA_QUESTIONS[letter];
  if (!qData) return;
  const correct = ppAnswerCorrect(qData, input.value);
  if (correct) {
    getStreamerInputEls().forEach(({ input: el }) => { if (el) el.value = ''; });
    resolvePasapalabraLetter('streamer', null);
  } else {
    getStreamerInputEls().forEach(({ input: el }) => { if (el) el.value = ''; });
    playPpWrong();
    input.classList.add('pp-shake');
    setTimeout(() => input.classList.remove('pp-shake'), 400);
    input.focus();
  }
}

export function handlePasapalabraCmd(user, cmd, parts, text) {
  const ms = state.modeState;
  // El chat no puede participar mientras el streamer tenga el bloqueo
  // activado (ver togglePasapalabraChatLock/#pp-chat-lock-btn): se ignora
  // cualquier comando, incluido !puntos.
  if (ms && ms.chatLocked) return;
  if (cmd === '!puntos') {
    const s = state.scores[user] || 0;
    addChatMessage(null, `${user} tienes ${s} puntos`, 'system', { mirror: false });
    return;
  }
  // Ya no existe un comando fijo para responder (antes "!r"/"!responder",
  // con la letra como argumento aparte): ahora la propia respuesta ES el
  // comando, pegada al "!" (p.ej. "!carmin", "!pikachu"). Se toma el
  // mensaje completo tras el "!" -no solo la primera palabra de parts/
  // cmd- para que también funcione si a alguien se le escapa un espacio
  // (p.ej. "!ho oh"): ppNorm quita los espacios igualmente, así que da
  // igual que la respuesta se escriba pegada o no.
  if (!cmd.startsWith('!') || cmd.length < 2) return;
  if (!ms || !ms.currentLetter || ms.resolved) return;
  const letter = ms.currentLetter;
  const qData = PASAPALABRA_QUESTIONS[letter];
  if (!qData) return;
  const rawAnswer = text.slice(1);
  if (!ppNorm(rawAnswer)) return;
  const correct = ppAnswerCorrect(qData, rawAnswer);
  if (correct) {
    resolvePasapalabraLetter('chat', user);
  } else {
    // El efecto de sonido de fallo solo debe sonar cuando falla el
    // Streamer (ver submitStreamerAnswer); cuando falla un usuario del
    // chat no debe sonar ningún efecto de sonido.
    addChatMessage(null, `❌ ${user} falló`, 'wrong', { mirror: false });
  }
}

function endPasapalabra() {
  clearInterval(state.modeState.timer);
  const ms = state.modeState;
  let resultText;
  if (ms.streamerScore > ms.chatScore) {
    resultText = `🎤 ¡Gana el Streamer! ${ms.streamerScore} - ${ms.chatScore}`;
    playPpVictory();
  } else if (ms.chatScore > ms.streamerScore) {
    resultText = `💬 ¡Gana el Chat! ${ms.chatScore} - ${ms.streamerScore}`;
    playPpVictory();
  } else {
    resultText = `🤝 ¡Empate! ${ms.streamerScore} - ${ms.chatScore}`;
    playPpDraw();
  }

  const standings = Object.entries(ms.correctByUser || {})
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count);

  let statsHtml = '<div class="modal-stats-title" style="font-size:12px;color:var(--muted);margin-top:16px;margin-bottom:4px;">📊 Preguntas acertadas por usuario</div>';
  if (standings.length === 0) {
    statsHtml += '<p style="font-size:12px;color:var(--muted);text-align:center;">Nadie del chat acertó ninguna pregunta.</p>';
  } else {
    statsHtml += '<div class="modal-stats-list">' + standings.map((s, i) => `
      <div class="modal-stats-row ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
        <span class="modal-stats-pos">${i + 1}</span>
        <span class="modal-stats-name">@${escapeHtml(s.user)}</span>
        <span class="modal-stats-count">${s.count} ${s.count === 1 ? 'acierto' : 'aciertos'}</span>
      </div>
    `).join('') + '</div>';
  }

  showModal('🏆 ¡Fin del Pasapalabra!',
    `<p>${escapeHtml(resultText)}</p>${statsHtml}`,
    [
      { label: '🔁 Volver a jugar', class: 'btn-primary', onClick: startPasapalabra },
      { label: 'Volver al menú', class: 'btn-secondary', onClick: backToMenu },
    ]
  );
}
