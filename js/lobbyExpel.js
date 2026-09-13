/* =========================================================
   POPOVER "EXPULSAR" DE LAS PANTALLAS DE LOBBY
   -----------------------------------------------------------
   Lógica compartida por todos los modos cuyo lobby permite al
   streamer expulsar a un jugador ya inscrito haciendo clic sobre su
   tarjeta (aparece un pequeño botón "Expulsar" encima). Reutiliza
   las mismas clases CSS que el popover de la cola del Coliseo
   (.queue-expel-popover / .queue-expel-btn, ver styles.css).

   Cada modo guarda en su propio state.modeState:
     - lobbyExpelPopoverUser: usuario cuyo popover está abierto (o null)
     - lobbyExpelPopoverEl:   el propio elemento del popover (o null)
     - expelledUsers:         Set de usuarios expulsados en ESTA partida,
                               para que no puedan volver a apuntarse hasta
                               la siguiente (se resetea al reiniciar el modo)
   ========================================================= */

// Abre (o cierra, si ya estaba abierto para el mismo jugador) el popover
// con el botón "Expulsar" sobre la tarjeta del lobby en la que el
// streamer ha hecho clic. Solo puede haber un popover abierto a la vez
// por modo. onExpel(user) se llama al pulsar el botón.
export function toggleLobbyExpelPopover(ms, user, cardEl, onExpel) {
  if (!ms) return;
  if (ms.lobbyExpelPopoverUser === user) {
    closeLobbyExpelPopover(ms);
    return;
  }
  closeLobbyExpelPopover(ms);
  const pop = document.createElement('div');
  pop.className = 'queue-expel-popover';
  pop.innerHTML = `<button type="button" class="queue-expel-btn">Expulsar</button>`;
  pop.querySelector('.queue-expel-btn').onclick = (ev) => {
    ev.stopPropagation();
    closeLobbyExpelPopover(ms);
    onExpel(user);
  };
  cardEl.appendChild(pop);
  ms.lobbyExpelPopoverUser = user;
  ms.lobbyExpelPopoverEl = pop;
}

export function closeLobbyExpelPopover(ms) {
  if (!ms) return;
  if (ms.lobbyExpelPopoverEl) ms.lobbyExpelPopoverEl.remove();
  ms.lobbyExpelPopoverEl = null;
  ms.lobbyExpelPopoverUser = null;
}
