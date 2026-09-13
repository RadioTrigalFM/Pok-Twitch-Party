import { addChatMessage } from './chat.js';
import { handleArenaCmd } from './modes/arena.js';
import { handleAvaluggCmd } from './modes/avalugg.js';
import { handleBossCmd } from './modes/boss.js';
import { handleExtranjeriaCmd } from './modes/extranjeria.js';
import { handlePasapalabraCmd } from './modes/pasapalabra.js';
import { handlePokerusCmd } from './modes/pokerus.js';
import { handleRayoSolarCmd } from './modes/rayosolar.js';
import { handleSafariCmd } from './modes/safari.js';
import { handleVistaLinceCmd } from './modes/vistalince.js';
import { handleVoltorbCmd } from './modes/voltorbexplosivo.js';
import { handleVolcanCmd } from './modes/volcan.js';
import { handleZoroarksCmd } from './modes/zoroarks.js';
import { state } from './state.js';
import { isJoinCommandBlocked } from './subsMode.js';

/* =========================================================
   COMMAND ROUTER
   ========================================================= */
export let handleChatCommand = function (user, msg) {
  const text = msg.trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (!state.currentMode) return;

  // Modo Subs: si está activo, solo los suscriptores (o el streamer) pueden
  // usar el comando de inscripción/participación de cada modo. El resto de
  // comandos del juego no se ven afectados.
  if (isJoinCommandBlocked(state.currentMode, cmd, user)) {
    addChatMessage(null, `🔒 @${user}: el Modo Subs está activado, solo pueden apuntarse los suscriptores del canal.`, 'system', { mirror: false });
    return;
  }

  switch (state.currentMode) {
    case 'pasapalabra': handlePasapalabraCmd(user, cmd, parts, text); break;
    case 'rayosolar': handleRayoSolarCmd(user, cmd, parts); break;
    case 'arena': handleArenaCmd(user, cmd, parts, text); break;
    case 'zoroarks': handleZoroarksCmd(user, cmd, parts, text); break;
    case 'safari': handleSafariCmd(user, cmd, parts); break;
    case 'boss': handleBossCmd(user, cmd, parts); break;
    case 'pokerus': handlePokerusCmd(user, cmd, parts); break;
    case 'volcan': handleVolcanCmd(user, cmd, parts); break;
    case 'vistalince': handleVistaLinceCmd(user, cmd, parts); break;
    case 'extranjeria': handleExtranjeriaCmd(user, cmd, parts, text); break;
    case 'voltorb': handleVoltorbCmd(user, cmd, parts, text); break;
    case 'avalugg': handleAvaluggCmd(user, cmd, parts, text); break;
  }
};

export function setHandleChatCommand(fn) {
  handleChatCommand = fn;
}
