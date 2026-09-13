import { state } from './state.js';

/* =========================================================
   MODO SUBS
   -----------------------------------------------------------
   Cuando state.subsMode está activo, únicamente los usuarios
   marcados como suscriptores (o el propio streamer) pueden
   ejecutar el comando que les inscribe/apunta en un modo de
   juego. El resto de comandos (atacar, responder, moverse...)
   no se ven afectados: solo se filtra la inscripción.
   ========================================================= */

const SUBS_MODE_STORAGE_KEY = 'pokekukoro_subs_mode';

// Comando(s) que sirven para "apuntarse"/entrar a la partida en cada modo.
// Para pasapalabra, que no tiene lobby de inscripción, se considera que
// "inscribirse" es responder por primera vez. A diferencia del resto de
// modos, en pasapalabra ese comando no es una palabra fija: la propia
// respuesta del chat ES el comando (p.ej. "!charizard", ver
// handlePasapalabraCmd en pasapalabra.js), así que no puede listarse aquí
// como el resto y se trata como caso especial en isJoinCommandBlocked, más
// abajo.
export const JOIN_COMMANDS_BY_MODE = {
  arena: ['!pokemon'],
  boss: ['!pokemon'],
  pokerus: ['!pokemon'],
  safari: ['!pokemon'],
  volcan: ['!pokemon'],
  rayosolar: ['!pokemon'],
  avalugg: ['!participo'],
  extranjeria: ['!participo'],
  vistalince: ['!participo'],
  voltorb: ['!participo'],
  zoroarks: ['!participo'],
};

export function loadSubsModePref() {
  try {
    state.subsMode = localStorage.getItem(SUBS_MODE_STORAGE_KEY) === '1';
  } catch (e) {
    // localStorage puede no estar disponible (p.ej. en algunos navegadores embebidos)
    state.subsMode = false;
  }
  return state.subsMode;
}

export function setSubsMode(enabled) {
  state.subsMode = !!enabled;
  try {
    localStorage.setItem(SUBS_MODE_STORAGE_KEY, state.subsMode ? '1' : '0');
  } catch (e) {
    // ignoramos si no se puede persistir
  }
}

// Actualiza el registro de suscriptores a partir de las tags IRC de Twitch
// de un mensaje (badges="subscriber/12,...", o founder/0). Se actualiza en
// cada mensaje para reflejar el estado real (altas y bajas de suscripción).
export function markSubscriberFromTags(user, tags) {
  if (!user || !tags) return;
  const login = user.toLowerCase();
  const badges = tags.badges || '';
  const isSub = /(^|,)(subscriber|founder)\//.test(badges);
  if (isSub) state.subscribers.add(login);
  else state.subscribers.delete(login);
}

// El streamer (dueño del canal) siempre puede participar, aunque no
// aparezca como "suscrito" a su propio canal. Se exporta porque otros
// modos (ver !levelup @usuario en boss.js) también necesitan reconocer
// comandos exclusivos del streamer, no solo el filtro del Modo Subs.
export function isBroadcaster(user) {
  return !!state.channel && user.toLowerCase() === state.channel.toLowerCase();
}

export function isAllowedInSubsMode(user) {
  if (!state.subsMode) return true;
  if (isBroadcaster(user)) return true;
  return state.subscribers.has(String(user).toLowerCase());
}

// Devuelve true si el comando debe bloquearse por no ser el usuario
// suscriptor (con el Modo Subs activo) intentando inscribirse.
export function isJoinCommandBlocked(mode, cmd, user) {
  if (!state.subsMode) return false;
  // Caso especial de pasapalabra (ver el comentario largo de
  // JOIN_COMMANDS_BY_MODE, arriba): cualquier "!<respuesta>" cuenta como
  // intento de responder/inscribirse, salvo "!puntos", que solo consulta
  // la puntuación y no hace falta filtrarlo.
  if (mode === 'pasapalabra') {
    if (cmd === '!puntos' || !cmd.startsWith('!') || cmd.length < 2) return false;
    return !isAllowedInSubsMode(user);
  }
  const joinCmds = JOIN_COMMANDS_BY_MODE[mode];
  if (!joinCmds || !joinCmds.includes(cmd)) return false;
  return !isAllowedInSubsMode(user);
}
