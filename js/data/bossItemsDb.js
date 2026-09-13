/* =========================================================
   OBJETOS DEL MODO BOSS COOPERATIVO
   -----------------------------------------------------------
   Catálogo fijo de objetos que pueden salir de los cofres del modo Boss
   (ver bossDefeated/openBossChestModal en boss.js): al derrotar al jefe de
   la fase 10 y al de la fase final (15) de cada nivel, el streamer gana un
   cofre que, al abrirlo, ofrece 3 objetos aleatorios de esta lista para
   elegir uno. El objeto elegido se guarda en el almacén interno
   (ms.itemsInventory) hasta que el streamer lo asigna a un combatiente
   concreto desde el panel de objetos (ver openBossItemsPanel), donde queda
   equipado (ms.players[user].itemId) mientras el streamer no lo cambie.
   Sus efectos en combate se aplican en performDuelAttack/playerEffectiveStats.
   `icon` es un emoji usado solo como adorno en mensajes de chat en texto
   plano (donde no se puede mostrar una imagen). `iconUrl` es el icono
   OFICIAL del objeto (sprite descargado de PokeAPI, ver assets/items/),
   el que se muestra de verdad en toda la interfaz: panel de objetos,
   cofre y ficha de cada combatiente (ver bossItemIconHtml en boss.js).
   ========================================================= */
export const BOSS_ITEMS = [
  {
    id: 'restos',
    name: 'Restos',
    icon: '🍂',
    iconUrl: 'assets/items/restos.png',
    desc: 'Cura un 16% cada vez que otro aliado hace daño (en vez de un 5%).',
  },
  {
    id: 'garra_rapida',
    name: 'Garra Rápida',
    icon: '🦴',
    iconUrl: 'assets/items/garra_rapida.png',
    desc: 'Sube la velocidad de ataque un 20%.',
  },
  {
    id: 'baya_zidra',
    name: 'Baya Zidra',
    icon: '🍒',
    iconUrl: 'assets/items/baya_zidra.png',
    desc: 'Recupera un 30% de salud cuando la salud está al 50% o menos (no se activa si ya está debilitado).',
  },
  {
    id: 'cascabel_concha',
    name: 'Cascabel Concha',
    icon: '🐚',
    iconUrl: 'assets/items/cascabel_concha.png',
    desc: 'Recupera vida en función de un 10% del daño causado mientras combate.',
  },
  {
    id: 'cinta_xperto',
    name: 'Cinta Xperto',
    icon: '🎗️',
    iconUrl: 'assets/items/cinta_xperto.png',
    desc: 'Hace un 30% más de daño si el movimiento es supereficaz (x2 o x4).',
  },
  {
    id: 'polvo_brillo',
    name: 'Polvo Brillo',
    icon: '✨',
    iconUrl: 'assets/items/polvo_brillo.png',
    desc: 'Aumenta la probabilidad de esquivar a un 25%.',
  },
  {
    id: 'vidasfera',
    name: 'Vidasfera',
    icon: '🔮',
    iconUrl: 'assets/items/vidasfera.png',
    desc: 'Aumenta el ataque un 50%, pero pierde un 10% de su vida máxima con cada ataque.',
  },
  {
    id: 'lupa',
    name: 'Lupa',
    icon: '🔍',
    iconUrl: 'assets/items/lupa.png',
    desc: 'Elimina por completo la probabilidad de fallar un ataque (0%).',
  },
  {
    id: 'cinta_focus',
    name: 'Cinta Focus',
    icon: '🎀',
    iconUrl: 'assets/items/cinta_focus.png',
    desc: 'Otorga un 50% de probabilidad de sobrevivir con 1 PS a un ataque que le habría debilitado.',
  },
  {
    id: 'casco_dentado',
    name: 'Casco Dentado',
    icon: '⛑️',
    iconUrl: 'assets/items/casco_dentado.png',
    desc: 'Devuelve un 20% del daño recibido a quien golpea.',
  },
  {
    id: 'seguro_debilidad',
    name: 'Seguro Debilidad',
    icon: '🛡️',
    iconUrl: 'assets/items/seguro_debilidad.png',
    desc: 'Aumenta un 100% el ataque si recibe un golpe muy eficaz o supereficaz (x2 o x4).',
  },
  {
    id: 'periscopio',
    name: 'Periscopio',
    icon: '🔭',
    iconUrl: 'assets/items/periscopio.png',
    desc: 'Aumenta la probabilidad de golpe crítico a un 35%.',
  },
];

// Devuelve la definición de un objeto a partir de su id, o null si no existe.
export function bossItemById(id) {
  return BOSS_ITEMS.find(it => it.id === id) || null;
}
