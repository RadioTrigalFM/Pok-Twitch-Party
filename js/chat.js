import { state } from './state.js';
import { $ } from './utils.js';
import { handleChatCommand } from './commandRouter.js';
import { markSubscriberFromTags } from './subsMode.js';

/* =========================================================
   CHAT
   ========================================================= */
export function addChatMessage(user, text, type = '', { mirror = true } = {}) {
  const el = document.createElement('div');
  el.className = 'chat-msg ' + type;
  // Si no hay usuario (mensajes del propio juego: "acierta", "falla", etc.)
  // se muestra como texto plano, igual que los mensajes de sistema. Antes,
  // cualquier mensaje con user=null y type !== 'system' intentaba calcular
  // el color del usuario (userColor(null)) y lanzaba un error que detenía
  // en seco la partida (por eso el juego se quedaba "atascado" al acertar).
  if (!user || type === 'system') {
    el.textContent = text;
  } else {
    el.innerHTML = `<span class="user" style="color:${userColor(user)}">@${user}</span>${escapeHtml(text)}`;
  }
  const box = $('chat-messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  // limit
  while (box.children.length > 100) box.removeChild(box.firstChild);

  // Además de pintarlo en el panel, este mismo mensaje se manda también al
  // chat REAL de Twitch (ver mirrorToTwitch más abajo), para que los
  // espectadores lo vean directamente en su chat sin tener que mirar la
  // pantalla del streamer. Los únicos mensajes que se excluyen de esto
  // (mirror: false) son los que YA vienen del chat real (o del chat
  // simulado del Modo Demo) y los avisos de conexión que solo interesan al
  // streamer: todo lo demás son mensajes que genera el propio juego
  // (anuncios de ronda, resultados, textos dirigidos a un viewer como el
  // pasaporte de Extranjería...) y se retransmiten tal cual.
  if (mirror) {
    const line = (!user || type === 'system') ? text : `@${user} ${text}`;
    mirrorToTwitch(line);
  }
}
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function userColor(name) {
  const colors = ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#9B59B6','#E67E22','#3498DB','#F06292','#AED581','#4DD0E1'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
function updateViewerCount() {
  $('viewer-count').textContent = state.viewers.size + ' viewers';
}

/* =========================================================
   ENVÍO DE MENSAJES AL CHAT REAL DE TWITCH
   -----------------------------------------------------------
   Twitch limita cuántos PRIVMSG puede mandar una cuenta por canal en 30
   segundos (20 si el bot no es moderador del canal, 100 si lo es). Como no
   sabemos si el bot es moderador, usamos el límite más conservador con
   margen de sobra: 1 mensaje cada 1.6s (~18-19 cada 30s) a través de una
   cola, en vez de mandarlos todos de golpe según se van generando. Así,
   aunque el juego produzca varios mensajes seguidos (p.ej. resultados de
   varios jugadores a la vez), se van soltando poco a poco sin arriesgarnos
   a que Twitch nos silencie por spam.
   ========================================================= */
const TWITCH_SEND_INTERVAL_MS = 1600;
const TWITCH_SEND_MAX_LEN = 480; // Twitch corta los mensajes a partir de ~500 caracteres
const TWITCH_SEND_QUEUE_LIMIT = 30; // si se acumulan más que esto, se descartan los más antiguos sin enviar

let twitchSender = null; // { send(line) } — solo existe mientras hay una conexión real con permiso de escritura
let twitchSendQueue = [];
let twitchSendTimer = null;

function setTwitchSender(sender) {
  twitchSender = sender;
  twitchSendQueue = [];
  if (twitchSendTimer) { clearTimeout(twitchSendTimer); twitchSendTimer = null; }
}

function mirrorToTwitch(line) {
  if (!twitchSender) return;
  const trimmed = line.length > TWITCH_SEND_MAX_LEN ? line.slice(0, TWITCH_SEND_MAX_LEN - 1) + '…' : line;
  twitchSendQueue.push(trimmed);
  while (twitchSendQueue.length > TWITCH_SEND_QUEUE_LIMIT) twitchSendQueue.shift();
  if (!twitchSendTimer) processTwitchSendQueue();
}

function processTwitchSendQueue() {
  if (!twitchSender || twitchSendQueue.length === 0) {
    twitchSendTimer = null;
    return;
  }
  const next = twitchSendQueue.shift();
  twitchSender.send(next);
  twitchSendTimer = setTimeout(processTwitchSendQueue, TWITCH_SEND_INTERVAL_MS);
}

// Cliente de chat de Twitch escrito a mano sobre WebSocket (protocolo IRC de Twitch).
// No depende de ninguna librería externa (tmi.js, CDNs, etc.), así que no puede
// romperse por bloqueadores de anuncios, antivirus o CDNs caídos: solo necesita
// una conexión normal a internet.
//
// Documentación del protocolo: https://dev.twitch.tv/docs/chat/irc/
export function connectTwitch(channel, token) {
  return new Promise((resolve, reject) => {
    const chan = channel.toLowerCase().replace(/^#/, '');

    // Si hay token, lo validamos primero contra la API de Twitch para saber
    // el login REAL asociado a ese token. Antes se asumía que el usuario del
    // token era siempre igual al nombre del canal introducido, pero eso solo
    // es cierto si conectas con tu propia cuenta de streamer; si usas una
    // cuenta de bot distinta (lo habitual), Twitch autentica con el login
    // real del token e ignora el NICK que le mandemos, y el código nunca
    // reconocía la confirmación de conexión (JOIN) porque comparaba con el
    // nombre de canal en vez del login real, dejando el chat "colgado" o sin
    // mostrar mensajes. Validar el token de antemano evita todo eso y además
    // permite dar un error claro si el token no es válido, antes de intentar
    // conectar por WebSocket.
    if (token) {
      const bare = token.startsWith('oauth:') ? token.slice(6) : token;
      fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: 'OAuth ' + bare }
      })
        .then(res => {
          if (!res.ok) {
            throw new Error('Token OAuth inválido o caducado. Genera uno nuevo en twitchtokengenerator.com');
          }
          return res.json();
        })
        .then(data => {
          // OJO: para RECIBIR mensajes por el gateway IRC de Twitch (que es
          // el que usa este cliente) hace falta el scope "chat:read". Este
          // es el motivo real de que, con algunos tokens, el bot se
          // conectara y confirmara el JOIN con normalidad pero el chat se
          // quedara completamente vacío durante los modos de juego: Twitch
          // no manda NINGÚN PRIVMSG si el token no tiene ese scope, y no
          // hay ningún NOTICE ni error que lo avise (falla en silencio). El
          // scope "user:read:chat" (el nuevo, pensado para la API de
          // EventSub) NO sirve para esto: es habitual que generadores de
          // tokens den por defecto "user:read:chat"/"user:write:chat" en
          // vez de los antiguos "chat:read"/"chat:edit" que pide IRC, así
          // que hay que cortar aquí con un error claro en vez de dejar que
          // el streamer piense que el juego está roto.
          // Antes solo se comprobaba el scope de ESCRITURA (chat:edit /
          // user:write:chat) y solo se avisaba con un aviso leve, dando a
          // entender que la lectura del chat funcionaría igualmente pase lo
          // que pase, lo cual era falso.
          const scopes = data.scopes || [];
          if (!scopes.includes('chat:read')) {
            throw new Error('El token no tiene el permiso "chat:read", así que Twitch no le enviará ningún mensaje del chat (aunque la conexión parezca ir bien). Genera uno nuevo en twitchtokengenerator.com asegurándote de marcar los scopes "chat:read" y "chat:edit".');
          }
          if (!scopes.includes('chat:edit') && !scopes.includes('user:write:chat')) {
            addChatMessage(null, '⚠️ Aviso: el token no parece tener permisos para enviar mensajes (chat:edit). El bot solo podrá leer el chat.', 'system', { mirror: false });
          }
          const canSend = scopes.includes('chat:edit') || scopes.includes('user:write:chat');
          openSocket(bare, data.login, canSend);
        })
        .catch(err => reject(err));
    } else {
      openSocket(null, null, false);
    }

    function openSocket(bareToken, realLogin, canSend) {
    let settled = false;
    let ownLogin = null;
    let ws;

    try {
      ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (e) {
      reject(new Error('No se pudo crear la conexión WebSocket: ' + e.message));
      return;
    }

    const client = {
      disconnect() {
        setTwitchSender(null);
        try { ws.close(); } catch (e) { /* noop */ }
      }
    };

    const connectTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch (e) { /* noop */ }
        reject(new Error('Tiempo de espera agotado al conectar con Twitch. Revisa tu conexión a internet.'));
      }
    }, 15000);

    function finishOk() {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      if (canSend) {
        setTwitchSender({
          send(line) {
            try { ws.send('PRIVMSG #' + chan + ' :' + line); } catch (e) { /* noop */ }
          }
        });
      }
      addChatMessage(null, `✅ Conectado a #${chan}`, 'system', { mirror: false });
      resolve(client);
    }

    function finishError(err) {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      try { ws.close(); } catch (e) { /* noop */ }
      reject(err);
    }

    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      if (bareToken) {
        ownLogin = realLogin;
        ws.send('PASS oauth:' + bareToken);
        ws.send('NICK ' + realLogin);
      } else {
        ownLogin = 'justinfan' + Math.floor(10000 + Math.random() * 89999);
        ws.send('NICK ' + ownLogin);
      }
      ws.send('JOIN #' + chan);
    };

    ws.onmessage = (event) => {
      const lines = String(event.data).split('\r\n').filter(Boolean);
      for (const line of lines) handleIrcLine(line);
    };

    ws.onerror = () => {
      finishError(new Error('Error de conexión con el chat de Twitch. Revisa tu conexión a internet.'));
    };

    ws.onclose = () => {
      clearTimeout(connectTimeout);
      setTwitchSender(null);
      if (settled) {
        addChatMessage(null, '⚠️ Desconectado de Twitch', 'system', { mirror: false });
      } else {
        finishError(new Error('La conexión con Twitch se cerró antes de completarse. Comprueba el nombre del canal.'));
      }
    };

    function handleIrcLine(line) {
      if (line.startsWith('PING')) {
        ws.send('PONG :tmi.twitch.tv');
        return;
      }

      let rest = line;
      let tags = {};
      if (rest.startsWith('@')) {
        const sp = rest.indexOf(' ');
        rawTagsToObject(rest.slice(1, sp), tags);
        rest = rest.slice(sp + 1);
      }

      let username = '';
      if (rest.startsWith(':')) {
        const sp = rest.indexOf(' ');
        username = rest.slice(1, sp).split('!')[0];
        rest = rest.slice(sp + 1);
      }

      const sepIdx = rest.indexOf(' :');
      const head = (sepIdx === -1 ? rest : rest.slice(0, sepIdx)).trim().split(' ');
      const trailing = sepIdx === -1 ? '' : rest.slice(sepIdx + 2);
      const command = head[0];
      const params = head.slice(1);

      if (command === 'NOTICE') {
        if (/authentication failed|improperly formatted auth/i.test(trailing)) {
          finishError(new Error('Token OAuth inválido o caducado. Genera uno nuevo en twitchtokengenerator.com'));
        } else if (/login unsuccessful|login authentication failed/i.test(trailing)) {
          finishError(new Error('No se pudo iniciar sesión en Twitch con ese usuario/token.'));
        }
        return;
      }

      if (command === 'JOIN' && username === ownLogin) {
        finishOk();
        return;
      }

      if (command === 'PRIVMSG') {
        // Antes se descartaba aquí cualquier mensaje cuyo autor coincidiera
        // con ownLogin (el login con el que se autentica esta conexión),
        // asumiendo que serían "ecos" de mensajes enviados por el propio
        // bot. Pero este cliente NUNCA envía PRIVMSG a Twitch (no hay
        // ningún ws.send('PRIVMSG ...') en todo el fichero), así que ese
        // filtro no evitaba ningún eco: lo único que hacía era tirar a la
        // basura, en silencio, los mensajes escritos por la cuenta del
        // token usado para conectar. Como el caso más habitual es que el
        // streamer genere el token con SU PROPIA cuenta (no con una cuenta
        // de bot aparte), sus propios mensajes en el chat nunca llegaban a
        // verse ni a contar como comandos, y como sin token el login usado
        // es un "justinfanXXXXX" aleatorio que nunca coincide con nadie
        // real, el problema solo aparecía con token puesto: exactamente el
        // síntoma reportado.
        state.viewers.add(username);
        updateViewerCount();
        // Las tags de Twitch (badges) llegan en cada PRIVMSG y nos dicen si
        // el usuario está suscrito al canal ahora mismo (se usan para el
        // Modo Subs, ver subsMode.js).
        markSubscriberFromTags(username, tags);
        addChatMessage(username, trailing, '', { mirror: false });
        handleChatCommand(username, trailing);
      }
    }

    function rawTagsToObject(raw, out) {
      raw.split(';').forEach(kv => {
        const eq = kv.indexOf('=');
        if (eq > -1) out[kv.slice(0, eq)] = kv.slice(eq + 1);
      });
    }
    } // fin openSocket
  });
}

export function startDemoMode() {
  state.demoMode = true;
  state.demoBotCounter = 0;
  const demoUsers = ['ashKetchum','mistyWaterflower','brockStone','garyOak','traceySketch','traceyFan','trainer_red','trainer_leaf','trainer_brendan','trainer_may','nurse_joy','officer_jenny'];
  // En demo no hay tags reales de Twitch: para poder probar el Modo Subs,
  // la mitad de los bots se marcan como suscriptores y la otra mitad no.
  demoUsers.forEach((u, i) => {
    markSubscriberFromTags(u, { badges: i % 2 === 0 ? 'subscriber/1' : '' });
  });
  const demoMessages = [
    '!pokemon pikachu','!pokemon charizard','hola!','!1','!2','!3','!4',
    '!atacar','!habilidad','!r a bulbasaur','!r c pikachu','!izq','!der',
    '!huir','!batalla','!esperar','!go','!stop','!participo',
    'vamos!','qué buen juego','!puntos','gg','!pokemon mewtwo',
    '!puerta 2'
  ];
  addChatMessage(null, '🎮 Modo demo activado - simulando chat...', 'system', { mirror: false });
  state.demoInterval = setInterval(() => {
    const user = demoUsers[Math.floor(Math.random() * demoUsers.length)];
    const msg = demoMessages[Math.floor(Math.random() * demoMessages.length)];
    state.viewers.add(user);
    updateViewerCount();
    addChatMessage(user, msg, '', { mirror: false });
    handleChatCommand(user, msg);
  }, 2200);
  showStreamerChatBox();
  refreshStreamerBotSelect();
}

// Muestra la caja que permite al streamer escribir comandos directamente
// en el chat mientras está en Modo Demo (no aplica al chat real de Twitch,
// donde los mensajes ya llegan del propio chat).
function showStreamerChatBox() {
  const form = $('streamer-chat-form');
  const note = $('streamer-chat-note');
  if (form) form.classList.add('is-visible');
  if (note) note.classList.add('is-visible');
}
export function hideStreamerChatBox() {
  const form = $('streamer-chat-form');
  const note = $('streamer-chat-note');
  if (form) form.classList.remove('is-visible');
  if (note) note.classList.remove('is-visible');
}

// Reconstruye el desplegable con la lista de bots disponibles: "🆕 Nuevo
// bot" (crea uno nuevo, "botN+1") más un elemento por cada bot que ya ha
// hablado ("bot1", "bot2"...). Los nombres van sin espacio a propósito:
// varios modos de juego (p.ej. Zoroarks) reconocen a los jugadores en el
// chat con comandos tipo !nombredeusuario, que al partirse el mensaje por
// espacios solo pueden apuntar a un nombre de una sola palabra; si el bot
// se llamara "bot 1" nunca se podría votar/nombrar con "!bot1". Si se le
// pasa `keepSelected`, ese es el valor que queda seleccionado al terminar
// (si ya no existiera, se cae a "🆕 Nuevo bot"); si no se pasa, intenta
// conservar la selección actual.
export function refreshStreamerBotSelect(keepSelected) {
  const select = $('streamer-chat-bot-select');
  if (!select) return;
  const wanted = keepSelected || select.value || 'new';
  const options = ['<option value="new">🆕 Nuevo bot</option>'];
  for (let i = 1; i <= state.demoBotCounter; i++) {
    options.push(`<option value="bot${i}">bot${i}</option>`);
  }
  select.innerHTML = options.join('');
  const stillExists = Array.from(select.options).some(o => o.value === wanted);
  select.value = stillExists ? wanted : 'new';
}

// Envía el mensaje escrito por el streamer en Modo Demo, en nombre del bot
// elegido en el desplegable: si elige "🆕 Nuevo bot" se crea uno nuevo
// ("bot1", "bot2"...) y queda seleccionado para poder seguir escribiendo
// como él; si elige un bot ya existente, el mensaje se envía como si lo
// hubiera escrito ese mismo espectador.
export function sendStreamerDemoMessage() {
  if (!state.demoMode) return;
  const input = $('streamer-chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  const select = $('streamer-chat-bot-select');
  const chosen = select ? select.value : 'new';
  let user;
  if (chosen && chosen !== 'new') {
    user = chosen;
  } else {
    state.demoBotCounter++;
    user = 'bot' + state.demoBotCounter;
    refreshStreamerBotSelect(user);
  }
  state.viewers.add(user);
  updateViewerCount();
  addChatMessage(user, msg, '', { mirror: false });
  handleChatCommand(user, msg);
}
