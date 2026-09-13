/* =========================================================
   GLOBAL STATE
   ========================================================= */
export const state = {
  channel: '',
  token: '',
  client: null,
  demoMode: false,
  demoInterval: null,
  demoBotCounter: 0, // contador para nombrar cada mensaje del streamer como bot 1, bot 2, bot 3...
  currentMode: null,
  scores: {},        // user -> total score
  viewers: new Set(),
  modeState: null,
  subsMode: false,     // Modo Subs: si está activo, solo pueden inscribirse/participar suscriptores del canal
  subscribers: new Set(), // logins (en minúsculas) que las tags de Twitch han marcado como suscriptores/fundadores en algún mensaje reciente
  unlockedBossSprites: new Set(), // nombres (en minúsculas) de sprites especiales del Boss (Wishiwashi Banco, Aegislash Espada...) ya desbloqueados para !pokemon (ver bossSpriteLocks.js)
};
