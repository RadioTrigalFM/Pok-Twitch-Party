import { addChatMessage } from '../chat.js';
import { handleBossJoin } from './boss.js';
import { state } from '../state.js';
import { handleChatCommand, setHandleChatCommand } from '../commandRouter.js';
import { isJoinCommandBlocked } from '../subsMode.js';

/* =========================================================
   POKEBALL !pokemon HANDLER (shared)
   -----------------------------------------------------------
   Intercepta !pokemon antes de que llegue al router normal cuando el modo
   activo es Boss: la lógica de inscripción en sí (validar el Pokémon,
   comprobar el lobby, fijar el puesto interno del combatiente...) vive en
   handleBossJoin (ver boss.js), para no duplicarla aquí.
   ========================================================= */
const _origRouter = handleChatCommand;
setHandleChatCommand(function(user, msg) {
  const text = msg.trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  if (cmd === '!pokemon' && state.currentMode === 'boss') {
    if (isJoinCommandBlocked('boss', cmd, user)) {
      addChatMessage(null, `🔒 @${user}: el Modo Subs está activado, solo pueden apuntarse los suscriptores del canal.`, 'system', { mirror: false });
      return;
    }
    handleBossJoin(user, parts);
    return;
  }
  _origRouter(user, msg);
});
