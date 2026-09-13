import { addChatMessage } from './chat.js';
import { playModeMusic, stopModeMusic } from './audio.js';
import { exitSceneFullscreen } from './fullscreen.js';
import { startArena } from './modes/arena.js';
import { startAvalugg } from './modes/avalugg.js';
import { startExtranjeria } from './modes/extranjeria.js';
import { startBoss } from './modes/boss.js';
import { startPasapalabra } from './modes/pasapalabra.js';
import { startPokerus } from './modes/pokerus.js';
import { startRayoSolar } from './modes/rayosolar.js';
import { startSafari } from './modes/safari.js';
import { startVistaLince } from './modes/vistalince.js';
import { startVoltorbExplosivo } from './modes/voltorbexplosivo.js';
import { startVolcan } from './modes/volcan.js';
import { startZoroarks } from './modes/zoroarks.js';
import { state } from './state.js';
import { $, showScreen } from './utils.js';

/* =========================================================
   MODE LAUNCHER
   ========================================================= */
// Pista de música de fondo (ver MODE_MUSIC_SRC en audio.js) asociada a cada
// modo. Pokerus empieza sonando con la pista del primer día (pokerus1); el
// propio modo se encarga de pasar a pokerus2 en cuanto arranca el segundo
// día (ver startPokerusRound en pokerus.js). El modo Boss no aparece aquí:
// su música depende del nivel/fase en curso, así que la gestiona él mismo
// (ver updateBossMusic en modes/boss.js) en vez de esta tabla de una sola
// pista fija por modo.
const MODE_MUSIC_KEY = {
  zoroarks: 'zoroarks',
  safari: 'zona-safari',
  volcan: 'volcan',
  vistalince: 'vista-lince',
  extranjeria: 'extranjeria',
  voltorb: 'voltorb-explosivo',
  avalugg: 'glaciar',
  pokerus: 'pokerus1',
  arena: 'arena',
  rayosolar: 'rayosolar',
  pasapalabra: 'pasapalabra',
};

// Modos cuya pantalla previa de inscripción (lobby, antes de pulsar
// "Comenzar Partida"/"Comenzar Combate") NO debe interrumpir la música del
// menú principal con la propia del modo: esta sigue sonando la de 'menu'
// (ver playModeMusic('menu') más abajo) mientras se apuntan los viewers, y
// es cada modo el que arranca su música (playModeMusic con la clave de
// MODE_MUSIC_KEY) en el momento en que el lobby se cierra y empieza el
// juego de verdad (ver startXxxMatch/startBossFight en su módulo). El modo
// Boss no está aquí porque, al no tener una pista fija en MODE_MUSIC_KEY,
// ya gestiona esto él mismo (updateBossMusic solo se llama al cerrarse el
// lobby, nunca durante la inscripción).
const MODES_WITHOUT_LOBBY_MUSIC = new Set([
  'rayosolar', 'zoroarks', 'safari', 'boss', 'pokerus', 'volcan', 'vistalince', 'voltorb', 'avalugg',
]);

// Título (con icono) de cada modo de juego.
export const MODE_TITLES = {
  pasapalabra: '🎯 Pasapalabra',
  rayosolar: '☀️ Rayo Solar',
  arena: '⚔️ Arena Pokémon',
  zoroarks: '🦊 Zoroarks',
  safari: '🌿 Zona Safari',
  boss: '👹 Boss Cooperativo',
  pokerus: '🧬 Pokerus',
  volcan: '🌋 El Volcán',
  vistalince: '🦅 Vista Lince',
  extranjeria: '🛂 Control de Extranjería',
  voltorb: '💣 Voltorb Explosivo',
  avalugg: '❄️ Glaciar de Avalugg',
};

export function launchMode(mode) {
  state.currentMode = mode;
  state.scores = {};
  $('game-title').textContent = MODE_TITLES[mode];
  showScreen('game-screen');
  $('chat-messages').innerHTML = '';
  addChatMessage(null, `🎮 Iniciando ${MODE_TITLES[mode]}...`, 'system', { mirror: false });
  switch (mode) {
    case 'pasapalabra': startPasapalabra(); break;
    case 'rayosolar': startRayoSolar(); break;
    case 'arena': startArena(); break;
    case 'zoroarks': startZoroarks(); break;
    case 'safari': startSafari(); break;
    case 'boss': startBoss(); break;
    case 'pokerus': startPokerus(); break;
    case 'volcan': startVolcan(); break;
    case 'vistalince': startVistaLince(); break;
    case 'extranjeria': startExtranjeria(); break;
    case 'voltorb': startVoltorbExplosivo(); break;
    case 'avalugg': startAvalugg(); break;
  }
  // El modo Boss no tiene una única pista fija: depende del nivel/fase con
  // que arranque (ver updateBossMusic en modes/boss.js, llamada desde el
  // propio startBoss() de arriba), así que aquí se le deja gestionar su
  // propia música en vez de aplicarle esta tabla genérica.
  if (mode === 'boss') {
    // no-op: startBoss() ya ha puesto en marcha la pista que corresponda
    // (o ninguna, si el lobby inicial no debe sonar con música propia).
  } else if (MODES_WITHOUT_LOBBY_MUSIC.has(mode)) {
    // Estos modos no arrancan su música al lanzarse: la pantalla de
    // inscripción sigue sonando con la del menú, y es el propio modo quien
    // llama a playModeMusic() al cerrarse el lobby (ver startXxxMatch en su
    // módulo).
  } else {
    const musicKey = MODE_MUSIC_KEY[mode];
    if (musicKey) playModeMusic(musicKey); else stopModeMusic();
  }
  // Se avisa con un evento (en vez de importar directamente la lógica de
  // pantalla completa desde eventListeners.js) para no crear una
  // dependencia circular entre módulos: eventListeners.js ya importa
  // launchMode desde aquí. El listener decide si corresponde pedir
  // pantalla completa automática según la preferencia guardada.
  document.dispatchEvent(new CustomEvent('pk-mode-launched'));
}

export function backToMenu() {
  // Si la escena del modo que se abandona estaba en pantalla completa
  // (nativa o simulada con ".fs-fallback"), hay que salir explícitamente
  // ANTES de cambiar de pantalla con showScreen() más abajo. Si no se hace,
  // el elemento fullscreen nativo queda en el "top layer" del navegador
  // -que ignora el display:none que showScreen() le pone a #game-screen al
  // desactivarlo- y se sigue viendo (y bloqueando toda interacción) por
  // encima del menú recién mostrado, aunque la interfaz ya "crea" que se ha
  // salido del modo. En el caso del fallback simulado (position:fixed) el
  // efecto es el mismo si nadie llama a exitFallbackFullscreen().
  exitSceneFullscreen();
  state.currentMode = null;
  // Al volver al menú principal (pantalla de selección de modo) suena su
  // propia pista de fondo (ver 'menu' en MODE_MUSIC_SRC, audio.js), en vez
  // de quedarse en silencio: playModeMusic ya hace el cruce de fundidos con
  // la que estuviera sonando en el modo que se acaba de abandonar.
  playModeMusic('menu');
  if (state.modeState && state.modeState.timer) clearInterval(state.modeState.timer);
  if (state.modeState && state.modeState.bossAttackTimer) clearInterval(state.modeState.bossAttackTimer);
  if (state.modeState && state.modeState.tickInterval) clearInterval(state.modeState.tickInterval);
  if (state.modeState && state.modeState.zoneTimeoutId) clearTimeout(state.modeState.zoneTimeoutId);
  if (state.modeState && state.modeState.autoAdvanceTimeout) clearTimeout(state.modeState.autoAdvanceTimeout);
  if (state.modeState && state.modeState.champWaitTimeout) clearTimeout(state.modeState.champWaitTimeout);
  // Torneo del Coliseo (ver arena.js): todos sus temporizadores pendientes
  // (anuncios de combate, de ganador, de ronda, autoarranque del cuadro...)
  // cuelgan de un único array para poder cancelarlos de golpe al salir del
  // modo sin pasar por "Volver a Arena Infinita".
  if (state.modeState && state.modeState.tournament && state.modeState.tournament.timeouts) {
    state.modeState.tournament.timeouts.forEach(id => clearTimeout(id));
  }
  if (state.modeState && state.modeState.spawnTimeout) clearTimeout(state.modeState.spawnTimeout);
  if (state.modeState && state.modeState.guessCountdownInterval) clearInterval(state.modeState.guessCountdownInterval);
  if (state.modeState && state.modeState.nextRoundTimeout) clearTimeout(state.modeState.nextRoundTimeout);
  if (state.modeState && state.modeState.categoryBannerTimeout) clearTimeout(state.modeState.categoryBannerTimeout);
  if (state.modeState && state.modeState.moveTimeout) clearTimeout(state.modeState.moveTimeout);
  if (state.modeState && state.modeState.growTimeout) clearTimeout(state.modeState.growTimeout);
  if (state.modeState && state.modeState.blastTimeout) clearTimeout(state.modeState.blastTimeout);
  if (state.modeState && state.modeState.voltorbSprite) state.modeState.voltorbSprite.destroy();
  if (state.modeState && state.modeState.crossers) {
    Object.values(state.modeState.crossers).forEach(c => c.sprite && c.sprite.destroy());
  }
  if (state.modeState && state.modeState.arenaSprites) {
    if (state.modeState.arenaSprites.left) state.modeState.arenaSprites.left.destroy();
    if (state.modeState.arenaSprites.right) state.modeState.arenaSprites.right.destroy();
  }
  if (state.modeState && state.modeState.queueDom) {
    Object.values(state.modeState.queueDom).forEach(d => d.sprite && d.sprite.destroy());
  }
  if (state.modeState && state.modeState.lobbySprites) {
    Object.values(state.modeState.lobbySprites).forEach(d => d.sprite && d.sprite.destroy());
  }
  // Modo Boss: sprite PMD del jefe y el de cada combatiente apuntado (con
  // su posible trayecto pendiente de ida o vuelta).
  if (state.modeState && state.modeState.bossSprite) state.modeState.bossSprite.destroy();
  // Segundo jefe simultáneo (ver ms.boss2/BOSS_FINAL_BOSS_NAMES en
  // boss.js): solo existe en la fase final de los niveles con dos jefes a
  // la vez, pero se limpia siempre por si acaso.
  if (state.modeState && state.modeState.bossSprite2) state.modeState.bossSprite2.destroy();
  if (state.modeState && state.modeState.fighterSprites) {
    Object.values(state.modeState.fighterSprites).forEach(entry => {
      if (entry.walkTimer) clearTimeout(entry.walkTimer);
      if (entry.sprite) entry.sprite.destroy();
    });
  }
  // Ficha de combatiente del modo Boss (ver showBossFiche en boss.js): se
  // añade directamente a <body>, fuera de #game-content, así que hay que
  // quitarla a mano al salir del modo o quedaría huérfana en el DOM.
  if (state.modeState && state.modeState.bossFicheEl) state.modeState.bossFicheEl.remove();
  // Votación del Modo AFK del modo Boss (ver ms.afkVote/queueBossAfkVote en
  // boss.js), si quedó alguna a medias al salir del modo: se para su
  // cuenta atrás y se quita su overlay, añadido directamente a <body> o al
  // elemento a pantalla completa (fuera de #game-content también).
  if (state.modeState && state.modeState.afkVote && state.modeState.afkVote.tickInterval) {
    clearInterval(state.modeState.afkVote.tickInterval);
  }
  const staleBossAfkVoteOverlay = document.getElementById('boss-afk-vote-overlay');
  if (staleBossAfkVoteOverlay) staleBossAfkVoteOverlay.remove();
  if (state.modeState && state.modeState.fallTimeouts) {
    state.modeState.fallTimeouts.forEach(id => clearTimeout(id));
  }
  if (state.modeState && state.modeState.entranceTimeouts) {
    state.modeState.entranceTimeouts.forEach(id => clearTimeout(id));
  }
  if (state.modeState && state.modeState.fieldSprites) {
    Object.values(state.modeState.fieldSprites).forEach(d => {
      if (d.arriveTimeout) clearTimeout(d.arriveTimeout);
      if (d.sprite) d.sprite.destroy();
    });
  }
  // Modo El Volcán: sprite PMD de Heatran, si sigue en pantalla (cayendo,
  // disparando o subiendo) al salir del modo.
  if (state.modeState && state.modeState.heatran) {
    if (state.modeState.heatran.sprite) state.modeState.heatran.sprite.destroy();
    if (state.modeState.heatran.el) state.modeState.heatran.el.remove();
  }
  state.modeState = null;
  showScreen('menu-screen');
}
