import { addChatMessage, escapeHtml } from '../chat.js';
import { ARENA_POKEMON_DB } from '../data/arenaPokemonDb.js';
import { bossSpriteLockBlockMessage, unlockBossLevelSprites } from '../bossSpriteLocks.js';
import { getBossLevelPool } from '../data/bossLevelPoolsDb.js';
import { getBossFinalBossTemplates } from '../data/bossFinalBossDb.js';
import { getBossPhaseFiveBossTemplates } from '../data/bossPhaseFiveBossDb.js';
import { getBossMidfightTransformTemplate } from '../data/bossMidfightTransformDb.js';
import { getArceusTypeFormTemplate } from '../data/arceusTypeFormsDb.js';
import { getBossLevelBackground } from '../data/bossLevelBackgroundsDb.js';
import { getBossSpriteAdjustment } from '../data/bossSpriteAdjustmentsDb.js';
import { getPokemonSprite } from '../data/pokemonDb.js';
import { BOSS_ITEMS, bossItemById } from '../data/bossItemsDb.js';
import {
  playVeJoin, playModeMusic, playBossHit, playBossCrit, playBossDodge,
  playBossFaint, playBossChestOpen, playBossTransform, playBossGameOver,
} from '../audio.js';
import { backToMenu } from '../modeLauncher.js';
import { toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { PMDSprite, PMD_DIR, arenaDirectionFor, pmdHasLocalSprite, pmdPreload } from '../pmdSprite.js';
import { rollShinyPokemon } from '../pokemonShiny.js';
import { state } from '../state.js';
import { isBroadcaster } from '../subsMode.js';
import { $, addScore, showModal, toast } from '../utils.js';
import { currentFullscreenElement } from '../fullscreen.js';

// Icono OFICIAL de un objeto (sprite descargado de PokeAPI, ver
// assets/items/ y bossItemsDb.js), para usar en cualquier sitio de la
// interfaz que admita HTML de verdad (no sirve dentro de un <option> de
// <select>: los navegadores solo pintan su texto, nunca imágenes — ver
// openBossItemsPanel más abajo para cómo se resuelve ese caso concreto).
function bossItemIconHtml(it, sizePx = 18) {
  if (!it || !it.iconUrl) return '';
  return `<img class="boss-item-icon" src="${it.iconUrl}" width="${sizePx}" height="${sizePx}" alt="${escapeHtml(it.name)}" title="${escapeHtml(it.name)}">`;
}

/* =========================================================
   BOSS MODE — COOPERATIVO 1 VS 1
   -----------------------------------------------------------
   Fase de lobby: los espectadores se apuntan con !pokemon [nombre],
   eligiendo entre toda la Pokédex Nacional (misma base de datos que el
   Coliseo del modo Arena), y quedan a la espera en una pantalla previa
   de inscripción, igual que en Pokerus o Voltorb Explosivo. Cada uno se
   ve en el lobby con su sprite animado PMD (Pokémon Mundo Misterioso).
   Es en este momento de inscripción cuando cada combatiente recibe, por
   orden de llegada, el puesto fijo que ocupará en el mapa del jefe (ver
   BOSS_PLAYER_SLOTS): una asignación puramente interna, que nunca se
   muestra en el lobby ni en ningún otro sitio, y que solo se usa después
   para colocar su icono en la escena de combate.

   Cuando el streamer pulsa "Comenzar Combate", el lobby se cierra (ya no
   se admiten más inscripciones) y arranca el combate: siempre es 1 vs 1
   contra el jefe actual. El combate en sí NO se controla por chat: es
   automático, igual que en el Coliseo del modo Arena (turnos alternos,
   esquivas, críticos y tabla de tipos), incluidas las mismas animaciones
   PMD de Walk/Attack/Hurt para el combatiente activo y para el jefe. Es
   el streamer quien decide, haciendo clic sobre el icono de un
   combatiente ya apuntado, quién sube a luchar. Cuando el combatiente
   actual cae derrotado, su duelo termina y el streamer puede elegir a
   otro para seguir desgastando al mismo jefe.

   CAMBIOS DE POKÉMON DURANTE LA FASE 1: mientras dura la fase 1 de cada
   nivel (tanto la primerísima vez, en el propio lobby de inscripción de
   arriba, como en cada subida de nivel posterior, ver ms.phase ===
   'levelSelect' y showBossLevelSelectPanel, disparado desde spawnNewBoss)
   los combatientes YA APUNTADOS pueden cambiar de Pokémon escribiendo de
   nuevo !pokemon [nombre] en el chat (ver handleBossJoin) — nunca se
   admiten combatientes NUEVOS fuera del lobby inicial. A diferencia de
   antes, esto ya no se limita a la pantalla de pausa "levelSelect": se
   admite en cualquier momento de la fase 1, incluso con el combate ya en
   marcha (ms.phase === 'fight'), hasta que el streamer elige a su PRIMER
   combatiente de esa fase 1 (ver selectChallenger/ms.bossChangesLocked):
   en ese instante se avisa por chat y se bloquea cualquier cambio de
   Pokémon hasta la fase 1 del nivel siguiente (ver bossChangesAllowed,
   usada por handleBossJoin).

   OBJETOS: a diferencia de los Pokémon, equipar un objeto NUEVO (pasar de
   "sin objeto" a "con objeto") se admite a un combatiente en CUALQUIER
   momento de la partida, sin ninguna ventana que lo restrinja (ver
   assignBossItem/openBossItemsPanel). Una vez equipado, en cambio, ya no
   se puede quitar ni cambiar a mano salvo durante la fase 1 del nivel
   (mismo criterio y misma ventana que los cambios de Pokémon, ver
   bossChangesAllowed): mientras esa fase 1 siga abierta, el streamer
   puede quitarle el objeto (vuelve a la mochila) o cambiárselo por otro
   desde el panel de objetos 🎒. Pasada la fase 1 (o bloqueados ya los
   cambios, ver ms.bossChangesLocked), la asignación vuelve a quedar
   definitiva hasta la fase 1 del nivel siguiente. Ya no existe ningún
   desequipado automático masivo al completar la fase 15 (final) de un
   nivel: los objetos puestos se quedan puestos hasta que el streamer los
   quite a mano en la ventana de arriba.

   MODO AFK (checkbox propio del lobby, ms.bossAfk): activable desde la
   propia pantalla de inscripción (ver renderBossLobby). Mientras está
   activo:
     - Cada vez que el combate llega a una fase de espera sin nadie
       luchando (justo tras pulsar "Comenzar Combate", tras caer
       derrotado el combatiente activo, o tras el respiro entre jefes o
       niveles, ver maybeStartBossAfkChallengerVote) se abre una
       votación de chat de 40s con un candidato por combatiente en pie
       (!1, !2...) en vez de esperar el clic del streamer; gana el más
       votado y, en empate, se sortea entre los empatados (ver
       resolveBossAfkVote).
     - Al abrir un cofre (ver openBossChestModal) los 3 objetos posibles
       también se deciden por esa misma votación de chat, y en cuanto se
       resuelve se abre una SEGUNDA votación para elegir a qué
       combatiente (de los que todavía no llevan objeto puesto) se le
       entrega (ver maybeStartBossAfkItemRecipientVote); fuera del Modo
       AFK esto lo decide el streamer a mano, primero en el propio
       cofre y luego desde el panel de objetos 🎒.
   Todas las votaciones comparten la misma cola e infraestructura (ver
   queueBossAfkVote/beginBossAfkVote/resolveBossAfkVote): nunca hay dos
   a la vez, se procesan una detrás de otra si se encolan varias.

   El jefe es un Pokémon normal más, elegido al azar de la misma Pokédex
   Nacional que usa el Coliseo del modo Arena (ARENA_POKEMON_DB), con la
   misma vida y el mismo ataque base que cualquier combatiente (BOSS_HP y
   BOSS_ATK, los mismos valores que ARENA_BASE_STATS en arena.js): no es
   más fuerte ni aguanta más que un combatiente cualquiera. Lo que lo hace
   un "jefe" es que el combate es interminable: en cuanto cae derrotado,
   aparece automáticamente otro jefe distinto (ver spawnNewBoss), entrando
   caminando desde el borde derecho de la pantalla hasta su puesto, y el
   streamer puede seguir eligiendo combatientes contra él sin parar.

   FIN DE PARTIDA: si TODOS los combatientes apuntados se quedan a la vez
   con 0 de vida (ver allFightersDefeated, comprobado desde endDuel), la
   partida sí termina: se congela el combate y se muestra una pantalla de
   fin de partida con un botón para volver al menú (ver
   triggerBossGameOver). Fuera de eso, superar el nivel 20 simplemente
   reinicia por el nivel 1: el combate sigue siendo interminable.

   PROGRESO GUARDADO: cada vez que empieza un nivel nuevo, en su fase 1
   (tanto al arrancar el modo por primera vez, en startBoss, como al subir
   de nivel, en spawnNewBoss), se guarda internamente ese punto — nivel,
   fase y objetos ya conseguidos en el almacén (ver saveBossProgress) — en
   localStorage. Es ese progreso el que se retoma la próxima vez que
   arranca el modo Boss (ver loadSavedBossProgress, usado en startBoss),
   tanto si el streamer sale del modo (backToMenu en modeLauncher.js) como
   si la partida termina por el motivo de arriba (todos derrotados a la
   vez): en ambos casos se pierde el avance hecho DENTRO del nivel en
   curso (fases superadas, objetos ganados en cofres) desde su fase 1.
   ========================================================= */

// Máximo de combatientes que pueden apuntarse en el lobby: el mapa (ver
// renderBossPlayersZone) reserva exactamente esta cantidad de puestos
// fijos, uno por posición de BOSS_PLAYER_SLOTS, para que todos queden
// colocados de forma estable y sin solaparse nunca. Coincide con el
// límite del modo Arena (ARENA_MAX_QUEUE) por consistencia.
export const BOSS_MAX_PLAYERS = 16;

// Posición (en % del ancho/alto de #boss-scene) de cada uno de los 16
// puestos de combatientes, marcada a mano sobre la imagen de fondo con la
// herramienta de edición del mapa. El orden es el mismo en que se van
// rellenando los puestos: el primer espectador en apuntarse en el lobby
// ocupa BOSS_PLAYER_SLOTS[0] (su índice en ms.order), el segundo
// BOSS_PLAYER_SLOTS[1], etc. Esa asignación se fija ya en el lobby (ver
// handleBossJoin) y es puramente interna: no se representa visualmente
// hasta que arranca el combate.
const BOSS_PLAYER_SLOTS = [
  { x: 33.4, y: 54.2 },
  { x: 32.7, y: 39.0 },
  { x: 33.1, y: 69.7 },
  { x: 23.6, y: 67.2 },
  { x: 23.8, y: 51.7 },
  { x: 24.4, y: 37.0 },
  { x: 28.6, y: 79.7 },
  { x: 17.7, y: 79.0 },
  { x: 16.8, y: 58.6 },
  { x: 16.2, y: 42.6 },
  { x: 18.1, y: 28.4 },
  { x: 10.3, y: 37.7 },
  { x: 9.1,  y: 53.5 },
  { x: 9.5,  y: 68.5 },
  { x: 8.9,  y: 83.5 },
  { x: 28.5, y: 24.1 },
];

// Posición (en % del ancho/alto de #boss-scene) donde se planta el
// enemigo (por ahora, el jefe), marcada a mano con la misma herramienta.
const BOSS_ENEMY_SPOT = { x: 71.1, y: 52.9 };

// Puesto del SEGUNDO enemigo, usado únicamente en la fase final (15) de
// los niveles cuyo BOSS_FINAL_BOSS_NAMES (ver bossFinalBossDb.js) trae dos
// nombres — dos jefes vivos a la vez en pantalla (ver ms.bosses más abajo).
// Colocado por encima de BOSS_ENEMY_SPOT, en el mismo eje x, para no
// solaparse; ajustar a mano junto con BOSS_ENEMY_SPOT si el fondo del mapa
// cambia.
const BOSS_ENEMY_SPOT_2 = { x: 71.1, y: 30.0 };

// Camino (en % del ancho/alto de #boss-scene) que recorre el combatiente
// elegido al salir a luchar: su propio sprite, que ya estaba esperando en
// su puesto (BOSS_PLAYER_SLOTS), avanza por estos puntos en orden hasta
// llegar al puesto de combate, justo delante del jefe (ver
// walkFighterAlong); admite más de dos puntos si en el futuro se marca un
// camino con recodos. Al volver (ver sendFighterHome) se recorre en
// sentido inverso.
const BOSS_WALK_PATH = [
  { x: 41.3, y: 52.7 },
  { x: 55.4, y: 52.6 },
];

// Duración (ms) de cada tramo del camino de entrada del combatiente:
// mientras dura, el duelo está en pausa (bossAutoTick no actúa porque
// ms.battle todavía es null) y solo se ve al Pokémon caminando hacia su
// puesto de combate.
const BOSS_WALK_STEP_MS = 550;

// La Velocidad de cada combatiente (y del jefe) se define más abajo,
// junto al resto de estadísticas compartidas por todos los combatientes
// (ver BOSS_ATK_SPEED_MS, junto a BOSS_HP/BOSS_ATK). Determina la
// frecuencia con la que cada bando obtiene turnos de ataque a través del
// sistema de iniciativa (ver advanceBattleTurn, más abajo, junto a
// "Velocidad y orden de turnos").

// La animación de "Attack" se lanza de inmediato, pero tarda un poco en
// volverse realmente ofensiva. Por eso el impacto (daño aplicado, bajada
// de vida, textos flotantes y animación de "Hurt" del rival) se retrasa
// BOSS_HIT_DELAY_MS: mismo mecanismo que ARENA_HIT_DELAY_MS en el
// Coliseo del modo Arena, para que el golpe se vea y se sienta en el
// mismo instante en que el Pokémon atacante conecta.
const BOSS_HIT_DELAY_MS = 500;

// Multiplicador de velocidad de las animaciones PMD (Walk/Attack/Hurt) de
// los combatientes y del jefe: al valer 2, cada frame dura el doble, así
// que la animación se reproduce al doble de lenta. Mismo valor que
// ARENA_ANIM_SPEED en el Coliseo del modo Arena.
const BOSS_ANIM_SPEED = 2;

// Duración (ms) del desvanecimiento de quien cae derrotado (el
// combatiente actual o el propio jefe) antes de resolver el fin del
// duelo: da tiempo a que se vea completa su animación de Hurt. Mismo
// mecanismo que ARENA_FAINT_FADE_MS en el Coliseo del modo Arena.
const BOSS_FAINT_FADE_MS = 900;

// Tras derrotar a un jefe, se espera este tiempo (ms) antes de que
// aparezca el siguiente: da un respiro para ver el resultado del duelo
// (recompensas incluidas) antes de que el nuevo jefe entre caminando. Solo
// se usa al superar una fase normal (no la final): el paso de nivel, tras
// la fase final, no usa este temporizador fijo, sino un fundido a negro
// disparado por la elección del cofre (ver runBossLevelTransition, más
// abajo, y BOSS_LEVEL_FADE_MS).
const BOSS_NEW_BOSS_DELAY_MS = 1600;

// Duración (ms) del fundido a negro de la transición al nivel siguiente
// (ver runBossLevelTransition): mismo mecanismo (fundido a negro, cambio de
// contenido con la pantalla ya completamente negra, fundido inverso de
// vuelta) que usan las transiciones de noche de los modos Pokerus/
// Zoroarks, aunque aquí sin ninguna secuencia de rótulos intermedia — solo
// el fundido, para acompañar visualmente el salto de un nivel a otro.
// (Mismo valor que la transición "opacity" de .boss-level-fade-overlay en
// styles.css: si se cambia aquí hay que cambiarlo también ahí.)
const BOSS_LEVEL_FADE_MS = 1400;

// Tiempo (ms) que se mantiene la pantalla completamente negra —con el
// nuevo jefe del nivel siguiente ya montado detrás, ver spawnNewBoss—
// antes de empezar el fundido inverso que lo revela.
const BOSS_LEVEL_FADE_HOLD_MS = 1300;

// Punto de partida (en % del ancho de #boss-scene), fuera de la pantalla
// por el borde derecho, desde el que entra caminando cada jefe nuevo (ver
// spawnNewBoss): #boss-scene recorta con overflow:hidden, así que no se ve
// hasta que cruza hacia dentro. Comparte la misma altura (y) que
// BOSS_ENEMY_SPOT, su puesto final.
const BOSS_ENTRY_START_X = 118;

// Estadísticas de combate compartidas por todos los combatientes del
// Boss, igual que ARENA_BASE_STATS en el Coliseo del modo Arena (todos
// los Pokémon de la Pokédex Nacional comparten la misma vida, el mismo
// ataque base y la misma velocidad de ataque; lo único que cambia es el
// tipo de su ataque principal).
const BOSS_PLAYER_HP = 120;

// Velocidad de ataque BASE (ms): a partir de este intervalo se deriva el
// valor de Velocidad (ver speedValueFromMs) de cualquier combatiente o
// jefe sin ninguna mejora de !levelup velocidad invertida — con este
// intervalo exacto, su Velocidad vale siempre BOSS_SPEED_BASE_VALUE (100),
// igual que dos Pokémon con la misma Velocidad base en los juegos
// originales. Es una estadística más, compartida por igual entre todos
// los combatientes y el jefe (mismo valor base que ARENA_TURN_MS en el
// Coliseo del modo Arena): cuanto MENOR sea el intervalo resultante tras
// las mejoras, MÁS Velocidad tiene ese bando (ver effectiveStats).
//
// El propio RITMO al que se resuelven los turnos (uno cada cuánto tiempo,
// sea normal o extra) es fijo y no depende de la Velocidad de nadie: ver
// BOSS_TICK_INTERVAL_MS, más abajo junto a scheduleBossTick. La Velocidad
// ya no acelera el reloj del duelo, sino que decide el ORDEN/frecuencia
// de turnos vía el sistema de iniciativa.
const BOSS_ATK_SPEED_MS = 1800;

// Ritmo fijo (ms) al que se resuelve un turno del duelo, sea de quien
// sea: a diferencia de BOSS_ATK_SPEED_MS (que ahora solo define la
// Velocidad BASE de referencia, ver más arriba), este intervalo no
// cambia con ninguna mejora de !levelup velocidad ni objeto — la
// Velocidad ya no acelera el reloj, sino que decide cuántos turnos le
// tocan a cada bando dentro de ese mismo reloj (ver scheduleBossTick,
// advanceBattleTurn).
const BOSS_TICK_INTERVAL_MS = BOSS_ATK_SPEED_MS;

// ---------------------------------------------------------------------
// Sistema de efectividades, críticos y esquivas — idéntico al del modo
// Arena (ver arena.js): misma tabla de tipos, mismas probabilidades de
// esquiva y golpe crítico, mismo multiplicador de crítico. Se aplica en
// ambas direcciones del duelo 1 vs 1: los golpes del combatiente (según el
// tipo primario de su Pokémon, o el secundario si lo ha elegido con
// !habilidad1/!habilidad2, ver handleBossAbility) contra el jefe, y los del
// jefe (según su propio tipo primario, sin poder cambiarlo) contra el
// combatiente actual. Cada Pokémon tiene un único movimiento, que se usa
// automáticamente en todos sus turnos (ver moves[0] en performDuelAttack):
// no hay cooldown ni ataques distintos entre los que elegir, solo esa misma
// probabilidad de esquiva y de crítico para todos; lo único seleccionable
// es de qué tipo cuenta ese ataque, cuando el Pokémon tiene dos.
// ---------------------------------------------------------------------
const BOSS_DODGE_CHANCE = 0.10;
const BOSS_CRIT_CHANCE = 0.10;
const BOSS_CRIT_MULT = 1.5;

// El jefe usa la misma vida, el mismo ataque base y la misma velocidad de
// ataque que cualquier combatiente del Coliseo: no es "más fuerte" ni más
// rápido, solo interminable (ver spawnNewBoss, en boss.js más abajo). Hay
// dos excepciones, ambas solo de vida máxima (ataque y velocidad se dejan
// igual que en el resto de fases):
//  - la fase final de cada nivel (ver isFinalStage), cuya vida máxima se
//    multiplica por bossFinalStageHpMultiplier(nivel);
//  - el Pokémon fijo de la fase intermedia (10) de cada nivel (ver
//    BOSS_PHASE_FIVE_STAGE y bossPhaseFiveBossDb.js), cuya vida máxima se
//    multiplica por bossPhaseFiveHpMultiplier(nivel) — solo cuando esa fase
//    resuelve a un jefe fijo; si el nivel no tiene entrada propia y cae al
//    sorteo normal de la pool, no aplica multiplicador alguno (ver
//    spawnNewBoss).
const BOSS_ATK = 22;
const BOSS_HP = BOSS_PLAYER_HP;

// Antes estos dos multiplicadores eran constantes fijas (x5 y x3 en
// cualquier nivel). Ahora dependen linealmente del nivel de la mazmorra
// (ms.bossLevel) para que la dificultad, incluso cuando los combatientes
// reparten bien su presupuesto de !levelup en cada nivel (ver
// bossLevelUpsAvailable/effectiveStats más abajo, cuyo crecimiento por
// nivel iguala casi del todo la única mejora aleatoria que gana el jefe
// por nivel, ver spawnNewBoss), tenga una ligera tendencia ascendente en
// vez de quedar completamente plana entre el nivel 1 y el 20: la fase
// final pasa de x4 (nivel 1) a x7 (nivel BOSS_TOTAL_LEVELS) y la fase
// intermedia de x2 a x3.5, ambas de forma lineal. BOSS_TOTAL_LEVELS se
// declara más abajo en este mismo fichero, pero al ser funciones (no se
// evalúan hasta que las llama spawnNewBoss, mucho después de que el
// módulo entero ya esté cargado) no hay problema de orden de declaración.
//
// BOSS_FINAL_STAGE_HP_MULTIPLIER_OVERRIDES fija el multiplicador exacto de
// la fase final para niveles concretos, en vez de dejar que salga de la
// fórmula lineal de arriba (que daría x6,05 en el nivel 14): por ahora
// solo el nivel 14 (Dialga Primario, ver BOSS_FINAL_BOSS_NAMES en
// bossFinalBossDb.js), fijado a mano en x6,50.
const BOSS_FINAL_STAGE_HP_MULTIPLIER_OVERRIDES = {
  14: 6.5, // Dialga Primario
};
function bossFinalStageHpMultiplier(level) {
  if (Object.prototype.hasOwnProperty.call(BOSS_FINAL_STAGE_HP_MULTIPLIER_OVERRIDES, level)) {
    return BOSS_FINAL_STAGE_HP_MULTIPLIER_OVERRIDES[level];
  }
  return 4 + (level - 1) * (3 / (BOSS_TOTAL_LEVELS - 1));
}
function bossPhaseFiveHpMultiplier(level) {
  return 2 + (level - 1) * (1.5 / (BOSS_TOTAL_LEVELS - 1));
}

// Fracción de la vida de un jefe único de fase final que recibe CADA uno
// de los dos jefes simultáneos de los niveles con pareja (6, 15 y 18, ver
// BOSS_FINAL_BOSS_NAMES en bossFinalBossDb.js): con 0.6, entre los dos
// suman un 120% de la vida de un jefe único de esa misma fase, en vez del
// 200% que sumarían si cada uno recibiera el 100% completo (ver
// spawnNewBoss, donde se aplica). El bando enemigo no ataca más rápido por
// tener dos jefes (se turnan, pero comparten la cadencia de un jefe
// único), así que iguala mejor la duración total del combate a la de una
// fase final de un solo jefe.
const BOSS_DUAL_BOSS_HP_SHARE = 0.6;

// ---------------------------------------------------------------------
// NIVELES Y FASES — el modo Boss cooperativo se organiza en
// BOSS_TOTAL_LEVELS niveles, cada uno con BOSS_STAGES_PER_LEVEL fases
// (ver ms.bossLevel / ms.bossStage, inicializados en startBoss). En las
// primeras BOSS_STAGES_PER_LEVEL - 1 fases de cada nivel el enemigo
// aparece con el tamaño normal de sprite (igual que un combatiente
// cualquiera, ver la clase "enemy-normal-size" en styles.css); en la
// última fase (BOSS_FINAL_STAGE) aparece con el tamaño extra grande que
// tenía "el jefe" hasta ahora. Al derrotar al enemigo de esa última fase
// se avanza al siguiente nivel (ver spawnNewBoss); tras completar el
// nivel BOSS_TOTAL_LEVELS se vuelve a empezar por el nivel 1, ya que el
// combate contra "el jefe" sigue siendo interminable.
const BOSS_TOTAL_LEVELS = 20;
const BOSS_STAGES_PER_LEVEL = 15;
const BOSS_FINAL_STAGE = BOSS_STAGES_PER_LEVEL;
// Nivel cuya fase final (15) enfrenta a Arceus (ver BOSS_FINAL_BOSS_NAMES
// en bossFinalBossDb.js) con su mecánica especial de cambio de tipo antes
// de cada ataque (ver el bloque "MECÁNICA ESPECIAL DE ARCEUS" en
// performDuelAttack, más abajo, y arceusTypeFormsDb.js).
const ARCEUS_SPECIAL_LEVEL = 20;
// Fase intermedia (10) de cada nivel: igual que BOSS_FINAL_STAGE, pero a
// mitad de camino. Se usa para consultar BOSS_PHASE_FIVE_BOSS_NAMES (ver
// bossPhaseFiveBossDb.js) en spawnNewBoss y así fijar el Pokémon que
// aparece en esa fase concreta, en vez de sortearlo de la pool del nivel;
// a diferencia de la fase final, la fase 10 NO agranda el sprite — es un
// enemigo de tamaño normal, solo que fijo y con más vida (ver
// bossPhaseFiveHpMultiplier).
const BOSS_PHASE_FIVE_STAGE = 10;

// Transformación a mitad de combate de varios jefes fijos de fase final
// (ver BOSS_MIDFIGHT_TRANSFORM_DB en bossMidfightTransformDb.js): en
// cuanto un jefe con entrada en esa tabla pierde suficiente vida (queda
// al ratio fijado ahí, o menos) cambia a su otra forma a media pelea (ver
// shouldTransformBossMidfight en performDuelAttack y
// startBossMidfightTransform más abajo). Empezó siendo un caso especial
// solo de Wishiwashi (jefe fijo del nivel 3); ahora es genérico y cubre
// también a Aegislash, Meloetta, Shaymin, Hoopa, Palkia, Zacian,
// Zamazenta, Zygarde, Giratina, Groudon, Kyogre y Necrozma, cada uno con
// su propio Pokémon de destino y su propio ratio, fijados en la tabla.
//
// Duración de cada tramo de la animación de transformación (ver
// startBossMidfightTransform): la luz blanca envuelve al Pokémon
// (WRAP_MS), se queda un instante cubriéndolo del todo -momento en el que
// se cambia el sprite por dentro, sin que llegue a verse el cambio-
// (HOLD_MS) y por último se desvanece revelando la nueva forma
// (REVEAL_MS). El combate queda en pausa durante los tres tramos.
const BOSS_MIDFIGHT_TRANSFORM_WRAP_MS = 650;
const BOSS_MIDFIGHT_TRANSFORM_HOLD_MS = 400;
const BOSS_MIDFIGHT_TRANSFORM_REVEAL_MS = 850;

// Zoom de cámara sobre el jefe en cuanto termina de entrar caminando a su
// puesto (BOSS_ENEMY_SPOT) al principio de la fase final (15) de cada
// nivel (ver spawnNewBoss, que dispara bossZoomCameraTo al terminar la
// transición de "left" de #boss-enemies-zone): se mantiene acercada
// BOSS_FINAL_STAGE_ZOOM_MS (3 segundos) antes de que la cámara se aleje de
// nuevo (bossResetCameraZoom), para remarcar la llegada del enemigo grande
// de esa fase. No se usa en el resto de fases, donde el enemigo entra
// igual pero sin zoom. Mismo criterio que ZOR_CAMERA_ZOOM_SCALE/
// ZOR_WOLF_REVEAL_HURT_MS en zoroarks.js.
//
// BOSS_CAMERA_ZOOM_SCALE ya no es una escala fija para todos los jefes:
// se usa solo como referencia ("cuánto zoom le corresponde a un sprite de
// tamaño estándar", scaleAdj 1.00) de la que parte
// bossFinalStageZoomScale, más abajo, para calcular un zoom propio por
// jefe según lo grande o pequeño que quede su sprite en pantalla (ver
// BOSS_SPRITE_ADJUSTMENTS/getBossSpriteAdjustment en
// bossSpriteAdjustmentsDb.js): así el encuadre final ocupa siempre un
// poco más que el sprite del jefe en cuestión, ni de más (jefes grandes
// como Arceus, scaleAdj 1.50) ni de menos (jefes pequeños como Aegislash
// Espada, scaleAdj 0.56), en vez del mismo acercamiento fijo para todos.
const BOSS_CAMERA_ZOOM_SCALE = 1.8;
// Límites del zoom calculado por jefe (ver bossFinalStageZoomScale): evita
// que un scaleAdj muy extremo se traduzca en un acercamiento demasiado
// discreto (por debajo de MIN) o que llegue a recortar al propio jefe por
// pasarse de largo (por encima de MAX).
const BOSS_CAMERA_ZOOM_MIN_SCALE = 1.35;
const BOSS_CAMERA_ZOOM_MAX_SCALE = 2.35;
const BOSS_FINAL_STAGE_ZOOM_MS = 3000;

// Progreso persistido en localStorage entre sesiones: nivel, fase y objetos
// ya conseguidos (almacén sin asignar, ver ms.itemsInventory) en el momento
// del último "punto de guardado". Ese punto de guardado se fija SIEMPRE al
// empezar un nivel nuevo, en su fase 1 (ver saveBossProgress, llamado desde
// startBoss y desde spawnNewBoss al subir de nivel): así, tanto si el
// streamer sale del modo Boss (ver backToMenu en modeLauncher.js) como si
// la partida termina porque todos los combatientes caen a la vez (ver
// triggerBossGameOver), la próxima partida retoma exactamente ese punto — el
// avance hecho DENTRO del nivel en curso (fases superadas desde entonces,
// objetos ganados en cofres de ese nivel) no se persiste hasta llegar a la
// fase 1 del nivel siguiente.
const BOSS_PROGRESS_STORAGE_KEY = 'pk_boss_progress';

// Lee el progreso guardado la última vez (ver saveBossProgress); si no hay
// nada guardado, o lo guardado es inválido o está corrupto (incluida la
// versión antigua de este mismo dato, que solo guardaba el nivel como texto
// plano bajo otra clave), se empieza desde cero: nivel 1, sin objetos.
function loadSavedBossProgress() {
  try {
    const raw = localStorage.getItem(BOSS_PROGRESS_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    const level = parsed && parsed.level;
    if (Number.isInteger(level) && level >= 1 && level <= BOSS_TOTAL_LEVELS) {
      const items = {};
      const savedItems = parsed.items;
      if (savedItems && typeof savedItems === 'object') {
        Object.entries(savedItems).forEach(([itemId, qty]) => {
          if (bossItemById(itemId) && Number.isInteger(qty) && qty > 0) items[itemId] = qty;
        });
      }
      return { level, items };
    }
  } catch (e) {
    // localStorage puede no estar disponible (p.ej. en algunos navegadores
    // embebidos), o el JSON guardado puede venir corrupto: en ambos casos
    // se empieza desde cero.
  }
  return { level: 1, items: {} };
}

// Guarda el punto de guardado actual: el nivel y la fase en curso de `ms`
// (en el instante en que se llama siempre es la fase 1 de ese nivel, ver el
// comentario junto a BOSS_PROGRESS_STORAGE_KEY) y una copia del almacén de
// objetos sin asignar (ver ms.itemsInventory).
function saveBossProgress(ms) {
  try {
    localStorage.setItem(BOSS_PROGRESS_STORAGE_KEY, JSON.stringify({
      level: ms.bossLevel,
      stage: ms.bossStage,
      items: { ...ms.itemsInventory },
    }));
  } catch (e) {
    // localStorage puede no estar disponible: sin persistencia, sin más
  }
}

// Devuelve si la fase actual (ms.bossStage) es la fase final del nivel:
// la que enfrenta al enemigo con el tamaño grande de jefe.
function isFinalStage(ms) {
  return ms.bossStage === BOSS_FINAL_STAGE;
}

/* ---------------------------------------------------------
   MÚSICA DE FONDO POR NIVEL/FASE
   -----------------------------------------------------------
   Dos pistas por nivel (ver MODE_MUSIC_SRC en audio.js, generadas para
   'boss-nivel-N' y 'boss-boss-nivel-N' con N de 1 a BOSS_TOTAL_LEVELS):
   la primera suena en bucle durante las BOSS_STAGES_PER_LEVEL - 1 fases
   normales de cada nivel (1 a 14), y la segunda toma el relevo solo en la
   fase final (15, el jefe grande). playModeMusic ya se encarga de no
   reiniciar la pista si sigue siendo la misma (p.ej. al pasar de la fase 3
   a la 4, ambas comparten 'boss-nivel-N') y de cruzar con un fundido de
   salida/entrada la que suene con la que la sustituya en cualquier otro
   caso — incluido el cambio de la pista de jefe a la del nivel siguiente,
   que ocurre en pleno fundido a negro de la transición de nivel (ver
   spawnNewBoss, llamada desde runBossLevelTransition con la pantalla ya
   completamente negra).
   --------------------------------------------------------- */
function updateBossMusic(ms) {
  if (!ms) return;
  const key = isFinalStage(ms) ? `boss-boss-nivel-${ms.bossLevel}` : `boss-nivel-${ms.bossLevel}`;
  playModeMusic(key);
}

// Devuelve si TODAVÍA se admiten cambios de Pokémon (!pokemon, ver
// handleBossJoin): durante el lobby inicial, siempre (ms.bossStage ya
// vale 1 ahí, pero se comprueba la fase para dejarlo explícito); y
// durante la fase 1 de cualquier nivel posterior —tanto en la pausa
// "levelSelect" como ya en pleno combate (ms.phase === 'fight')— hasta
// que el streamer elige a su primer combatiente de esa fase 1 (ver
// selectChallenger, que pone ms.bossChangesLocked a true en ese momento).
// Pasada la fase 1 (ms.bossStage > 1), o ya bloqueados los cambios, no se
// admite ninguno hasta la fase 1 del nivel siguiente, donde spawnNewBoss
// vuelve a poner ms.bossChangesLocked a false. Los objetos usan esta
// misma función, pero solo para decidir si se puede QUITAR o CAMBIAR un
// objeto YA equipado (ver assignBossItem/openBossItemsPanel): equipar
// uno nuevo desde "sin objeto" se sigue admitiendo en cualquier momento
// de la partida, sin depender de esta ventana.
function bossChangesAllowed(ms) {
  return ms.phase === 'lobby' || (ms.bossStage === 1 && !ms.bossChangesLocked);
}

// ---------------------------------------------------------------------
// DOS JEFES A LA VEZ — en la fase final (15) de los niveles cuyo
// BOSS_FINAL_BOSS_NAMES (ver bossFinalBossDb.js) trae dos nombres, ms.boss2
// deja de ser null y hay dos jefes vivos en pantalla a la vez (ver
// spawnNewBoss). El resto del combate (turnos, daño, HP) sigue tratando a
// ms.boss como el jefe "principal" en casi todo, pero estas funciones
// centralizan las pocas decisiones que cambian cuando hay un segundo jefe:
// a quién ataca el combatiente (siempre el primero con vida, ms.boss antes
// que ms.boss2) y quién de los dos ataca en cada turno del bando enemigo
// (se alternan si ambos siguen en pie).
// ---------------------------------------------------------------------

// Devuelve, en orden [ms.boss, ms.boss2], los jefes actualmente vivos
// (currentHp > 0). ms.boss2 puede no existir (null) en la mayoría de fases.
function aliveBossSlots(ms) {
  const slots = [];
  if (ms.boss && ms.boss.currentHp > 0) slots.push({ index: 0, boss: ms.boss, sprite: ms.bossSprite, zoneId: 'boss-enemies-zone', hpFillId: 'boss-hp-fill' });
  if (ms.boss2 && ms.boss2.currentHp > 0) slots.push({ index: 1, boss: ms.boss2, sprite: ms.bossSprite2, zoneId: 'boss-enemies-zone-2', hpFillId: 'boss-hp-fill-2' });
  return slots;
}

// El objetivo de los golpes del combatiente: siempre el primero con vida,
// en el mismo orden de siempre (ms.boss antes que ms.boss2) — así, con un
// solo jefe, el comportamiento es exactamente el de antes.
function currentBossTarget(ms) {
  const slots = aliveBossSlots(ms);
  return slots.length ? slots[0] : null;
}

// Quién de los (uno o dos) jefes vivos ataca en el turno del bando
// enemigo: con un solo jefe vivo, siempre ese; con los dos vivos, se
// alternan (ver ms.bossTurnPointer) para que ambos participen en el
// combate por igual en vez de que uno se quede callado.
function currentBossAttacker(ms) {
  const slots = aliveBossSlots(ms);
  if (!slots.length) return null;
  if (slots.length === 1) return slots[0];
  const pointer = (ms.bossTurnPointer || 0) % slots.length;
  ms.bossTurnPointer = pointer + 1;
  return slots[pointer];
}

// Cuántos turnos por delante se muestran en la tabla de la esquina
// inferior derecha (ver #boss-turn-queue en renderBoss/updateBossTurnQueue
// más abajo).
const BOSS_TURN_QUEUE_SIZE = 3;

// Portrait PMD (retrato de cara, distinto del sprite de cuerpo entero
// animado) de cada Pokémon, descargado de PMDCollab/SpriteCollab en
// assets/pmd/<dex>/Portrait.png -mismo dex que usan ya los sprites
// Walk/Attack/Hurt/Sleep, ver pmdSprite.js-, usado por la lista de
// "Próximos turnos" (ver renderBossTurnQueuePortraitHtml/
// updateBossTurnQueue más abajo) en lugar del nombre en texto.
// De las 86 formas especiales añadidas a mano a ARENA_POKEMON_DB con dex
// 9001-9086 (Megaevoluciones, formas de Arceus, formas regionales... ver
// README_PMD_LOCAL.md), las formas regionales (Alola/Galar/Hisui, dex
// 9021-9023 y 9068-9084) SÍ tienen su propio retrato en PMDCollab/
// SpriteCollab (portrait/<dex base>/<forma>/Normal.png) y ya se han
// descargado a su propia carpeta assets/pmd/<dex especial>/Portrait.png,
// así que no necesitan fallback. El resto (Megaevoluciones, formas de
// Arceus, formas Origin/Primal/Therian/Crowned/Sombra...) no tienen
// retrato propio subido en ese repositorio -solo tienen el sprite de
// cuerpo entero-, así que para esas se usa aquí el retrato de su especie
// base (p.ej. "Charizard Mega X" reutiliza el retrato de Charizard, dex
// 6) en vez de dejar el hueco vacío.
const BOSS_PORTRAIT_BASE_DEX_FALLBACK = {
  9001: 681, 9002: 746, 9003: 669, 9004: 648, 9005: 492, 9006: 645, 9007: 720,
  9008: 249, 9009: 484, 9010: 483, 9011: 483, 9012: 487, 9013: 718, 9014: 1024,
  9015: 889, 9016: 888, 9017: 382, 9018: 383, 9019: 800, 9020: 902, 9024: 150,
  9025: 493, 9026: 493, 9027: 493, 9028: 493, 9029: 493, 9030: 493, 9031: 493,
  9032: 493, 9033: 493, 9034: 493, 9035: 493, 9036: 493, 9037: 493, 9038: 493,
  9039: 493, 9040: 493, 9041: 493,
  9042: 6, 9043: 65, 9044: 94, 9045: 115, 9046: 142, 9047: 150, 9048: 208,
  9049: 229, 9050: 248, 9051: 282, 9052: 302, 9053: 303, 9054: 308, 9055: 310,
  9056: 323, 9057: 334, 9058: 354, 9059: 359, 9060: 362, 9061: 380, 9062: 381,
  9063: 384, 9064: 428, 9065: 448, 9066: 475, 9067: 719,
};

// Ruta al retrato PMD de un dex dado, resolviendo primero el fallback de
// forma especial de arriba (ver BOSS_PORTRAIT_BASE_DEX_FALLBACK).
function bossPortraitPath(dexId) {
  const resolved = BOSS_PORTRAIT_BASE_DEX_FALLBACK[dexId] || dexId;
  return `assets/pmd/${String(resolved).padStart(4, '0')}/Portrait.png`;
}

// Calcula, SIN mutar el estado real, quién atacará en los próximos
// `count` turnos a partir de la situación actual del duelo (ver
// advanceBattleTurn, que decide cada turno según la Velocidad de ambos
// bandos y sus medidores de iniciativa). Se simula sobre una copia local
// de los medidores de iniciativa (ver ms.battle.initiativeGauge) y,
// aparte, con una copia local del puntero de qué jefe ataca en cada
// turno del bando enemigo cuando hay dos jefes vivos a la vez (ver
// currentBossAttacker/ms.bossTurnPointer) — ninguno de los dos punteros
// reales se adelanta antes de tiempo.
function predictBossTurnOrder(ms, count) {
  const b = ms.battle;
  if (!b) return [];
  const slots = aliveBossSlots(ms);
  const sim = {
    initiativeGauge: { player: b.initiativeGauge.player, boss: b.initiativeGauge.boss },
    lastActor: b.lastActor,
  };
  let bossPointer = ms.bossTurnPointer || 0;
  const result = [];
  for (let i = 0; i < count; i++) {
    const side = advanceBattleTurn(ms, sim);
    if (side === 'player') {
      result.push({ side: 'player', name: b.player.pokemon.name, dex: b.player.pokemon.sprite });
    } else {
      if (!slots.length) break; // no debería darse con un duelo activo, pero por si acaso
      const idx = bossPointer % slots.length;
      if (slots.length > 1) bossPointer++;
      result.push({ side: 'boss', name: slots[idx].boss.name, dex: slots[idx].boss.sprite });
    }
  }
  return result;
}

// Estado recordado entre llamadas a updateBossTurnQueue (ver más abajo)
// para poder animar la lista como un scroll suave hacia arriba en vez de
// repintarla entera de golpe: guardamos el pedido mostrado la última vez
// y quién luchaba entonces, así la siguiente llamada puede comparar
// "¿la fila que ahora va primera es la misma que antes iba segunda?" y,
// si es así, tratarla como la MISMA fila que ha subido un puesto (con su
// desplazamiento animado) en vez de como una fila nueva que aparece de la
// nada. Se resetea a null en cuanto la tabla se oculta o cambia el
// combatiente activo, para no arrastrar comparaciones sin sentido entre
// duelos distintos.
let bossTurnQueuePrevOrder = null;
let bossTurnQueuePrevActiveUser = null;

// Actualiza la tabla de próximos turnos (ver predictBossTurnOrder de
// arriba): oculta por completo mientras no haya un duelo activo (nadie ha
// elegido combatiente todavía, o el que luchaba acaba de caer/ser
// relevado). Si lo hay, la repinta con los próximos BOSS_TURN_QUEUE_SIZE
// turnos, animando la transición como un scroll continuo hacia arriba:
// las filas que ya aparecían en el pedido anterior, un puesto por debajo,
// se deslizan suavemente hasta su nueva posición (técnica FLIP: se
// coloca cada fila donde estaba antes sin transición y, al frame
// siguiente, se deja que la transición CSS la lleve sola hasta su sitio
// real -ver .boss-turn-queue-row en styles.css-), la fila que sale por
// arriba se anima escapando y desvaneciéndose (ver
// .boss-turn-queue-row--exiting) y la fila nueva que entra por abajo
// aparece con un desvanecimiento suave en vez de saltar de golpe. La
// primera vez que se muestra la tabla (o tras cambiar de combatiente) no
// hay nada que comparar, así que usa en su lugar la entrada en cascada de
// siempre (ver .boss-turn-queue-row--enter). Se llama desde
// renderDuelPanel (mismo punto en que ya se actualiza todo lo demás del
// duelo: elección de combatiente, relevo, derrota de cualquiera de los
// dos bandos...) y además, aparte, tras cada golpe resuelto en
// performDuelAttack, para que se note al instante en cuanto avanza un
// turno de verdad.
function updateBossTurnQueue() {
  const ms = state.modeState;
  const panel = $('boss-turn-queue');
  const list = $('boss-turn-queue-list');
  if (!ms || !panel || !list) return;
  const order = (ms.battle && ms.activeUser) ? predictBossTurnOrder(ms, BOSS_TURN_QUEUE_SIZE) : [];
  if (!order.length) {
    panel.style.display = 'none';
    bossTurnQueuePrevOrder = null;
    bossTurnQueuePrevActiveUser = null;
    return;
  }
  const wasVisible = panel.style.display === 'flex' && list.children.length > 0;
  const sameFighter = wasVisible && bossTurnQueuePrevActiveUser === ms.activeUser;
  panel.style.display = 'flex';

  // Antes de repintar (solo si de verdad hay algo previo comparable),
  // capturamos la posición actual de cada fila -relativa al contenedor de
  // la lista- y nos quedamos con un clon de la primera (la que va a salir
  // de la tabla) para poder animarla saliendo mientras el resto sube.
  let prevTops = null;
  let exitingClone = null;
  const prevOrder = sameFighter ? bossTurnQueuePrevOrder : null;
  if (sameFighter && prevOrder) {
    const listRect = list.getBoundingClientRect();
    const oldRows = Array.from(list.children);
    prevTops = oldRows.map(row => row.getBoundingClientRect().top - listRect.top);
    if (oldRows[0]) {
      exitingClone = oldRows[0].cloneNode(true);
      exitingClone.classList.add('boss-turn-queue-row--exiting');
      exitingClone.style.top = prevTops[0] + 'px';
    }
  }
  bossTurnQueuePrevOrder = order;
  bossTurnQueuePrevActiveUser = ms.activeUser;

  const useFlip = !!prevTops;
  list.innerHTML = order.map((entry, i) => `
    <div class="boss-turn-queue-row${useFlip ? '' : ' boss-turn-queue-row--enter'}" data-flip-i="${i}"${useFlip ? '' : ` style="animation-delay:${i * 90}ms"`}>
      <span class="boss-turn-queue-num">${i + 1}</span>
      <span class="boss-turn-queue-icon">${entry.side === 'player' ? '🟢' : '👹'}</span>
      <img class="boss-turn-queue-portrait" src="${bossPortraitPath(entry.dex)}" alt="${escapeHtml(entry.name)}" title="${escapeHtml(entry.name)}">
    </div>
  `).join('');
  if (exitingClone) list.appendChild(exitingClone);
  if (!useFlip) return;

  const listRect = list.getBoundingClientRect();
  const rows = Array.from(list.querySelectorAll('.boss-turn-queue-row[data-flip-i]'));
  rows.forEach((row, i) => {
    const prevEntry = prevOrder[i + 1];
    const newEntry = order[i];
    const matches = prevEntry && newEntry && prevTops[i + 1] !== undefined
      && prevEntry.side === newEntry.side && prevEntry.dex === newEntry.dex && prevEntry.name === newEntry.name;
    row.style.transition = 'none';
    if (matches) {
      // Misma fila que antes iba un puesto más abajo: la colocamos primero
      // en su posición anterior (el delta puede ser 0 si no hay hueco que
      // recorrer) para que la transición la lleve hasta su sitio nuevo.
      const delta = prevTops[i + 1] - (row.getBoundingClientRect().top - listRect.top);
      row.style.transform = `translateY(${delta}px)`;
    } else {
      // Fila realmente nueva, incorporada al final de la cola: entra con
      // un desvanecimiento suave desde un poco más abajo, no de golpe.
      row.style.transform = 'translateY(10px)';
      row.style.opacity = '0';
    }
  });
  // Fuerza el reflow para que el navegador registre esas posiciones de
  // partida antes de activar la transición (patrón FLIP).
  void list.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      rows.forEach(row => {
        row.style.transition = '';
        row.style.transform = '';
        row.style.opacity = '';
      });
      if (exitingClone) exitingClone.classList.add('is-leaving');
    });
  });
  if (exitingClone) {
    exitingClone.addEventListener('transitionend', () => exitingClone.remove(), { once: true });
    // Red de seguridad por si transitionend no llega (p.ej. la tabla se
    // oculta u otra actualización la sustituye antes de tiempo).
    setTimeout(() => { if (exitingClone.parentNode) exitingClone.remove(); }, 800);
  }
}

// Devuelve si TODOS los jefes de la fase en curso están derrotados (0 de
// vida): con un solo jefe, equivale a boss.currentHp <= 0 de siempre; con
// dos, hace falta que caigan los dos para que se considere superada la
// fase (ver bossDefeated/performDuelAttack).
function allBossesDefeated(ms) {
  const bossDown = !ms.boss || ms.boss.currentHp <= 0;
  const boss2Down = !ms.boss2 || ms.boss2.currentHp <= 0;
  return bossDown && boss2Down;
}

// Nombre para mostrar en chat/paneles: con un solo jefe, el suyo de
// siempre; con dos, ambos nombres unidos ("X y Z"), estén ya derrotados o
// no — para que los mensajes de "aparece..."/"fin de la partida frente
// a..." los mencionen a ambos.
function bossDisplayName(ms) {
  if (ms.boss2) return `${ms.boss.name} y ${ms.boss2.name}`;
  return ms.boss ? ms.boss.name : '';
}

// ---------------------------------------------------------------------
// SUBIDA DE NIVEL DE ESTADÍSTICAS — cada vez que la partida sube de nivel
// (ver spawnNewBoss, cuando cae el enemigo de la fase final) los Pokémon
// pueden mejorar una estadística: +5 de ataque, +30 de vida máxima, o un
// 10% más de velocidad de ataque respecto al nivel anterior (el intervalo
// de turno se reduce restando LEVELUP_SPEED_STEP de forma lineal por cada
// nivel de velocidad invertido, de modo que cada nivel aporta siempre un
// +10% exacto respecto a la base, sin ir menguando con los niveles
// siguientes: +10%, +20%, +30%... en vez de +10%, +9%, +8%...).
//
// Para el jefe (y cualquier enemigo que aparezca durante ese nivel) la
// mejora se calcula al azar entre las tres estadísticas (ver spawnNewBoss),
// y se acumula durante toda la partida: el enemigo nunca "resetea" sus
// mejoras, ya que el combate contra él es interminable.
//
// Para cada combatiente aliado, la mejora la elige el propio usuario
// escribiendo !levelup ataque / vida / velocidad en el chat (ver
// handleBossLevelUp), pero con un presupuesto limitado: una mejora por
// cada nivel de USUARIO que tenga por encima del 1, y el nivel de usuario
// siempre coincide con el nivel de la mazmorra (ver bossLevelUpsAvailable)
// — quien llega al Nivel 12, por ejemplo, dispone de 11 mejoras para
// repartir. Esas mejoras (y el presupuesto que representan) se resetean a
// cero en cuanto la partida sube de nivel (ver spawnNewBoss), para que
// todos vuelvan a buildear desde cero, con el presupuesto más alto que les
// da el nivel nuevo.
const LEVELUP_ATK_BONUS = 5;
const LEVELUP_HP_BONUS = 30;
const LEVELUP_SPEED_STEP = 0.1; // cada nivel de velocidad = +10% siempre (lineal, no acumulativo/compuesto)
// Suelo de seguridad para el intervalo de turno: evita que acumular muchos
// niveles de velocidad dispare turnos absurdamente rápidos.
const LEVELUP_MIN_ATK_SPEED_MS = 300;

// Alias aceptados tras "!levelup " (en minúsculas) -> clave interna del
// objeto de niveles ('atk' | 'hp' | 'speed').
const LEVELUP_STAT_ALIASES = {
  ataque: 'atk',
  atk: 'atk',
  vida: 'hp',
  hp: 'hp',
  velocidad: 'speed',
  vel: 'speed',
};

// Nombre en pantalla de cada estadística, para los mensajes de chat.
const LEVELUP_STAT_LABEL = { atk: 'Ataque', hp: 'Vida', speed: 'Velocidad de ataque' };

// Objeto "en blanco" de niveles invertidos: uno por combatiente (ver
// ms.players[user].levels) y uno para el enemigo (ver ms.enemyLevels).
function freshLevels() {
  return { atk: 0, hp: 0, speed: 0 };
}

// El nivel de USUARIO (distinto del nivel de estadísticas invertidas, ver
// freshLevels) siempre coincide con el nivel actual de la mazmorra
// (ms.bossLevel): en cuanto la partida sube de nivel, todos los
// combatientes apuntados pasan a ese mismo nivel, se apunten cuando se
// apunten (ver spawnNewBoss, donde se resetean sus mejoras, y
// handleBossJoin, donde entran directamente al nivel en curso).
//
// El "presupuesto" de mejoras pendientes por elegir con !levelup es de una
// mejora por cada nivel por encima del 1 (en el nivel 1 nadie tiene ninguna
// mejora todavía), menos las que ya haya invertido en el nivel actual (ver
// ms.players[user].levels, que se resetea a freshLevels() en cada subida de
// nivel): así, si la mazmorra sube al nivel 12, cada combatiente dispone de
// 11 mejoras pendientes para repartir como quiera entre ataque/vida/velocidad.
function bossLevelUpsAvailable(ms, player) {
  const levels = (player && player.levels) || freshLevels();
  const used = levels.atk + levels.hp + levels.speed;
  return Math.max(0, (ms.bossLevel - 1) - used);
}

// Calcula las estadísticas efectivas (ataque, vida máxima e intervalo de
// turno en ms) a partir de unas estadísticas base y unos niveles invertidos
// en cada una. Se usa tanto para el jefe (ver bossEffectiveStats) como para
// cada combatiente aliado (ver playerEffectiveStats), ya que ambos
// comparten exactamente las mismas estadísticas base y los mismos
// incrementos por nivel.
function effectiveStats(baseAtk, baseHp, baseSpeedMs, levels) {
  const lv = levels || freshLevels();
  return {
    atk: baseAtk + lv.atk * LEVELUP_ATK_BONUS,
    maxHp: baseHp + lv.hp * LEVELUP_HP_BONUS,
    speedMs: Math.max(LEVELUP_MIN_ATK_SPEED_MS, baseSpeedMs * (1 - LEVELUP_SPEED_STEP * lv.speed)),
  };
}

// Estadísticas efectivas actuales del jefe (o del enemigo que le suceda
// durante el mismo nivel), según ms.enemyLevels.
function bossEffectiveStats(ms) {
  return effectiveStats(BOSS_ATK, BOSS_HP, BOSS_ATK_SPEED_MS, ms.enemyLevels);
}

// Estadísticas efectivas actuales de un combatiente aliado, según los
// niveles que él mismo ha invertido con !levelup (ms.players[user].levels)
// y el objeto que lleve equipado (ver BOSS_ITEMS): Garra Rápida sube un
// 20% su velocidad de ataque y Vidasfera sube un 50% su ataque (su
// contrapartida, el 10% de vida máxima que pierde con cada golpe, se
// resuelve aparte, en performDuelAttack, porque es un efecto por turno, no
// una estadística fija).
function playerEffectiveStats(ms, user) {
  const p = ms.players[user];
  const stats = effectiveStats(BOSS_ATK, BOSS_PLAYER_HP, BOSS_ATK_SPEED_MS, p && p.levels);
  const itemId = p && p.itemId;
  if (itemId === 'garra_rapida') {
    stats.speedMs = Math.max(LEVELUP_MIN_ATK_SPEED_MS, Math.round(stats.speedMs * 0.8));
  }
  if (itemId === 'vidasfera') {
    stats.atk = Math.round(stats.atk * 1.5);
  }
  return stats;
}

// ---------------------------------------------------------------------
// Velocidad y orden de turnos
// ---------------------------------------------------------------------
// La Velocidad de cada combatiente determina la frecuencia con la que
// obtiene turnos de ataque, no cuánto se espera entre uno y otro (eso lo
// fija BOSS_TICK_INTERVAL_MS por igual para todos). Se expresa como un
// valor comparable entre bandos (BOSS_SPEED_BASE_VALUE = 100 a velocidad
// de ataque base, ver BOSS_ATK_SPEED_MS): cuanto menor sea el intervalo
// de turno tras las mejoras de !levelup velocidad/objetos, mayor
// Velocidad. Al comienzo (y en todo momento, ya que se recalcula en
// caliente) ambos bandos comparan su Velocidad:
//  - Si es idéntica, los turnos se alternan sin más (uno ataca y después
//    el otro), ver advanceBattleTurn.
//  - Si un bando es más rápido, la diferencia porcentual entre ambos
//    (p.ej. 120 de Velocidad contra 100 = 20% de ventaja) se acumula
//    como progreso de iniciativa al final de cada turno. Al llegar al
//    100%, el bando más rápido obtiene un turno adicional consecutivo y
//    el progreso vuelve a acumularse desde 0%.
//
// Implementación (ver advanceBattleTurn): en vez de guardar el "% de
// ventaja" como un único número aparte, cada bando lleva su propio
// medidor de iniciativa (0-100%, ver ms.battle.initiativeGauge) que sube
// cada turno en proporción a su Velocidad. En cuanto el medidor de un
// bando llega al 100%, ese bando actúa YA (sin esperar a que le "toque"
// por alternancia) y su medidor vuelve a 0%; el del rival conserva lo que
// llevaba acumulado. Con la misma Velocidad ambos medidores suben igual
// de rápido y llegan a 100% siempre a la vez, lo que produce exactamente
// la alternancia estricta descrita arriba; con Velocidades distintas, el
// más rápido llega antes (y a veces, si la diferencia es grande, más de
// una vez seguida sin que el rival llegue a completar el suyo entre
// medias) — el resultado es idéntico en espíritu a "acumular el % de
// ventaja hasta el 100% para un turno extra", pero sin ningún caso límite
// raro cuando la ventaja es enorme (p. ej. el doble de Velocidad, que
// haría que un simple contador de "% de ventaja por turno" se disparara
// sin parar): aquí el medidor del rival SIEMPRE sigue subiendo entre
// turno y turno, así que tarde o temprano le toca a él también.
const BOSS_SPEED_BASE_VALUE = 100;

// Umbral (%) que el medidor de iniciativa de un bando debe alcanzar para
// que le toque turno (ver advanceBattleTurn).
const INITIATIVE_THRESHOLD = 100;

// Convierte un intervalo de turno (ms, MENOR = más rápido) en un valor de
// Velocidad comparable (mayor = más rápido), con BOSS_SPEED_BASE_VALUE
// (100) como referencia a velocidad de ataque base (ver BOSS_ATK_SPEED_MS).
function speedValueFromMs(speedMs) {
  if (!speedMs) return BOSS_SPEED_BASE_VALUE;
  return BOSS_SPEED_BASE_VALUE * (BOSS_ATK_SPEED_MS / speedMs);
}

// Valor de Velocidad actual de un bando ('player' o 'boss') del duelo
// activo, según sus mejoras de !levelup velocidad y objetos equipados
// (Garra Rápida) invertidos hasta ahora — se lee siempre "en caliente".
function sideSpeedValue(ms, side) {
  if (side === 'boss') return speedValueFromMs(bossEffectiveStats(ms).speedMs);
  return speedValueFromMs(playerEffectiveStats(ms, ms.battle.player.user).speedMs);
}

// Decide quién actúa en el turno siguiente y actualiza los medidores de
// iniciativa de ambos bandos, operando sobre `sim` — un objeto con:
//   - initiativeGauge: { player, boss }, el progreso (0-100%) de cada
//     bando hacia su próximo turno.
//   - lastActor: 'player' | 'boss' | null, quién actuó la última vez —
//     solo se usa para desempatar cuando los dos medidores llegan a
//     100% EXACTAMENTE a la vez (lo normal con la misma Velocidad, ver
//     más abajo), alternando entre ambos en vez de dejar siempre a uno
//     con prioridad.
// `sim` puede ser el propio ms.battle (para hacer avanzar el duelo de
// verdad, ver bossAutoTick) o una copia local de esos dos campos, para
// predecir los próximos turnos sin mutar nada real (ver
// predictBossTurnOrder).
//
// En cada llamada se calcula, para cada bando, cuánto le falta para
// llegar al 100% (INITIATIVE_THRESHOLD) a su Velocidad actual — el bando
// al que menos le falte actúa ahora. Ambos medidores avanzan ese mismo
// "tiempo" (el que ha tardado en llegar el que actúa), así que el rival
// siempre se queda con parte de su progreso ya hecho para el turno
// siguiente; el propio medidor de quien actúa vuelve a 0%.
function advanceBattleTurn(ms, sim) {
  const gauge = sim.initiativeGauge;
  const playerSpeed = sideSpeedValue(ms, 'player');
  const bossSpeed = sideSpeedValue(ms, 'boss');
  const timeToReady = (side, speed) => (INITIATIVE_THRESHOLD - gauge[side]) / speed;
  const playerWait = timeToReady('player', playerSpeed);
  const bossWait = timeToReady('boss', bossSpeed);
  let actor;
  if (playerWait < bossWait) actor = 'player';
  else if (bossWait < playerWait) actor = 'boss';
  else actor = sim.lastActor === 'player' ? 'boss' : 'player'; // empate exacto (Velocidades iguales): alterna
  const elapsed = actor === 'player' ? playerWait : bossWait;
  gauge.player += playerSpeed * elapsed;
  gauge.boss += bossSpeed * elapsed;
  gauge[actor] = 0; // ya actuó: su medidor vuelve a empezar desde 0%
  sim.lastActor = actor;
  return actor;
}

// Misma tabla de tipos oficial que usa el Coliseo del modo Arena.
// TYPE_CHART[tipoAtacante][tipoDefensor] = multiplicador. Si no aparece, es x1.
const TYPE_CHART = {
  'Normal':    { 'Roca': 0.5, 'Fantasma': 0, 'Acero': 0.5 },
  'Fuego':     { 'Planta': 2, 'Hielo': 2, 'Bicho': 2, 'Acero': 2, 'Fuego': 0.5, 'Agua': 0.5, 'Roca': 0.5, 'Dragón': 0.5 },
  'Agua':      { 'Fuego': 2, 'Tierra': 2, 'Roca': 2, 'Agua': 0.5, 'Planta': 0.5, 'Dragón': 0.5 },
  'Eléctrico': { 'Agua': 2, 'Volador': 2, 'Eléctrico': 0.5, 'Planta': 0.5, 'Dragón': 0.5, 'Tierra': 0 },
  'Planta':    { 'Agua': 2, 'Tierra': 2, 'Roca': 2, 'Fuego': 0.5, 'Planta': 0.5, 'Veneno': 0.5, 'Volador': 0.5, 'Bicho': 0.5, 'Dragón': 0.5, 'Acero': 0.5 },
  'Hielo':     { 'Planta': 2, 'Tierra': 2, 'Volador': 2, 'Dragón': 2, 'Fuego': 0.5, 'Agua': 0.5, 'Hielo': 0.5, 'Acero': 0.5 },
  'Lucha':     { 'Normal': 2, 'Hielo': 2, 'Roca': 2, 'Siniestro': 2, 'Acero': 2, 'Veneno': 0.5, 'Volador': 0.5, 'Psíquico': 0.5, 'Bicho': 0.5, 'Hada': 0.5, 'Fantasma': 0 },
  'Veneno':    { 'Planta': 2, 'Hada': 2, 'Veneno': 0.5, 'Tierra': 0.5, 'Roca': 0.5, 'Fantasma': 0.5, 'Acero': 0 },
  'Tierra':    { 'Fuego': 2, 'Eléctrico': 2, 'Veneno': 2, 'Roca': 2, 'Acero': 2, 'Planta': 0.5, 'Bicho': 0.5, 'Volador': 0 },
  'Volador':   { 'Planta': 2, 'Lucha': 2, 'Bicho': 2, 'Eléctrico': 0.5, 'Roca': 0.5, 'Acero': 0.5 },
  'Psíquico':  { 'Lucha': 2, 'Veneno': 2, 'Psíquico': 0.5, 'Acero': 0.5, 'Siniestro': 0 },
  'Bicho':     { 'Planta': 2, 'Psíquico': 2, 'Siniestro': 2, 'Fuego': 0.5, 'Lucha': 0.5, 'Veneno': 0.5, 'Volador': 0.5, 'Fantasma': 0.5, 'Acero': 0.5, 'Hada': 0.5 },
  'Roca':      { 'Fuego': 2, 'Hielo': 2, 'Volador': 2, 'Bicho': 2, 'Lucha': 0.5, 'Tierra': 0.5, 'Acero': 0.5 },
  'Fantasma':  { 'Psíquico': 2, 'Fantasma': 2, 'Siniestro': 0.5, 'Normal': 0 },
  'Dragón':    { 'Dragón': 2, 'Acero': 0.5, 'Hada': 0 },
  'Siniestro': { 'Psíquico': 2, 'Fantasma': 2, 'Lucha': 0.5, 'Siniestro': 0.5, 'Hada': 0.5 },
  'Acero':     { 'Hielo': 2, 'Roca': 2, 'Hada': 2, 'Fuego': 0.5, 'Agua': 0.5, 'Eléctrico': 0.5, 'Acero': 0.5 },
  'Hada':      { 'Lucha': 2, 'Dragón': 2, 'Siniestro': 2, 'Fuego': 0.5, 'Veneno': 0.5, 'Acero': 0.5 },
};

// Devuelve el multiplicador total de daño de un tipo de ataque contra los
// (uno o dos) tipos de un Pokémon defensor.
function bossTypeMultiplier(moveType, defenderTypes) {
  let mult = 1;
  const table = TYPE_CHART[moveType];
  if (table) {
    (defenderTypes || []).forEach(defType => {
      if (table[defType] !== undefined) mult *= table[defType];
    });
  }
  return mult;
}

// Mecánica especial del jefe Arceus (fase final del nivel 20, ver
// ARCEUS_SPECIAL_LEVEL más abajo y arceusTypeFormsDb.js): de entre los 18
// tipos de TYPE_CHART, devuelve el que más daño haría (según
// bossTypeMultiplier) contra los tipos del Pokémon defensor dado. Con
// varios tipos empatados al máximo (p.ej. contra un Pokémon sin ninguna
// doble debilidad), se queda con el primero según el orden de TYPE_CHART,
// para que el resultado sea siempre el mismo ante el mismo rival.
function bestAttackingTypeAgainst(defenderTypes) {
  let bestType = null;
  let bestMult = -Infinity;
  Object.keys(TYPE_CHART).forEach(type => {
    const mult = bossTypeMultiplier(type, defenderTypes);
    if (mult > bestMult) {
      bestMult = mult;
      bestType = type;
    }
  });
  return bestType;
}

// Texto (registro de chat) y clase (número flotante) según la efectividad.
function effectivenessInfo(mult) {
  if (mult === 0) return { chatMsg: ' ¡No afecta! (Inmune)', floatText: 'Inmune', floatClass: 'immune-number' };
  if (mult >= 4) return { chatMsg: ' ¡Es hipereficaz!', floatText: 'Hipereficaz', floatClass: 'hyper-number' };
  if (mult >= 2) return { chatMsg: ' ¡Es súper efectivo!', floatText: 'Superefectivo', floatClass: 'super-number' };
  if (mult <= 0.5) return { chatMsg: ' No es muy eficaz...', floatText: 'No muy eficaz', floatClass: 'weak-number' };
  return { chatMsg: '', floatText: '', floatClass: '' };
}

// Muestra un texto flotante (daño, crítico, esquiva o efectividad) sobre un
// elemento concreto de la escena (el sprite del jefe o el del combatiente
// actual en el mapa de combate), igual que hace el modo Arena.
function showBossFloatText(el, text, extraClass) {
  if (!el) return;
  const num = document.createElement('div');
  num.className = 'damage-number' + (extraClass ? ' ' + extraClass : '');
  num.style.left = '50%';
  num.style.top = '0px';
  num.textContent = text;
  el.appendChild(num);
  setTimeout(() => num.remove(), 1500);
}

export function startBoss() {
  // Por si quedara huérfana de una sesión anterior (no debería, ver el
  // cleanup en backToMenu de modeLauncher.js, pero startBoss() es el punto
  // de entrada único de este modo): se quita cualquier ficha de combatiente
  // ya presente en el documento antes de crear el estado nuevo.
  const staleFiche = document.getElementById('boss-fiche');
  if (staleFiche) staleFiche.remove();
  // Punto de guardado más reciente (ver loadSavedBossProgress/
  // BOSS_PROGRESS_STORAGE_KEY): nivel y objetos ya conseguidos con los que
  // arranca esta partida. La fase, en cambio, siempre empieza desde 1, se
  // haya guardado lo que se haya guardado (el punto de guardado en sí
  // SIEMPRE corresponde a una fase 1, ver saveBossProgress).
  const savedProgress = loadSavedBossProgress();
  // El jefe es un Pokémon cualquiera de la pool del nivel en que arranca la
  // partida (ver BOSS_LEVEL_POOLS/getBossLevelPool en bossLevelPoolsDb.js),
  // no un Pokémon especial: mismo tipo/movimientos/sprite que tendría como
  // combatiente normal en el modo Arena. Se elige ya aquí, antes del lobby,
  // para poder anunciarlo desde la propia pantalla de inscripción.
  const bossLevelPool = getBossLevelPool(savedProgress.level, ARENA_POKEMON_DB);
  const bossTemplate = bossLevelPool[Math.floor(Math.random() * bossLevelPool.length)];
  // En el nivel 1 nadie tiene ninguna mejora todavía (ver freshLevels): el
  // jefe empieza con sus estadísticas base, iguales a las de un combatiente.
  const enemyLevels = freshLevels();
  const bossStats = effectiveStats(BOSS_ATK, BOSS_HP, BOSS_ATK_SPEED_MS, enemyLevels);
  state.modeState = {
    phase: 'lobby',     // 'lobby' (pantalla previa de inscripción) | 'fight' (combate en curso) | 'levelSelect' (pausa al principio de la fase 1 de cada nivel para cambiar de Pokémon, ver showBossLevelSelectPanel/advanceBossLevelSelect) | 'gameover' (todos derrotados a la vez, ver triggerBossGameOver)
    // Nivel (1..BOSS_TOTAL_LEVELS) y fase dentro de ese nivel
    // (1..BOSS_STAGES_PER_LEVEL) en que se encuentra el combate.
    bossLevel: savedProgress.level,
    bossStage: 1,
    // Mejoras de estadística acumuladas por el bando enemigo (ver
    // bossEffectiveStats): una al azar por cada nivel superado (ver
    // spawnNewBoss), nunca se resetea, el jefe es interminable.
    enemyLevels,
    boss: { ...bossTemplate, atk: bossStats.atk, currentHp: bossStats.maxHp, maxHp: bossStats.maxHp },
    // Segundo jefe simultáneo (ver BOSS_FINAL_BOSS_NAMES en
    // bossFinalBossDb.js): null salvo en la fase final de los niveles que
    // enfrentan a dos jefes a la vez (ver spawnNewBoss). startBoss() SIEMPRE
    // arranca en la fase 1 de un nivel (nunca la final), así que aquí
    // siempre empieza a null.
    boss2: null,
    players: {},        // user -> { pokemon, dmg, levels } — combatientes apuntados; "levels" son sus mejoras de !levelup del nivel actual (ver freshLevels)
    // Orden de inscripción en el lobby: fija, para cada combatiente, el
    // índice de BOSS_PLAYER_SLOTS que ocupará en el mapa de combate (su
    // posición = su índice en este array). Es una asignación puramente
    // interna que se decide ya en el momento de apuntarse (ver
    // handleBossJoin) y que nunca se representa visualmente en el lobby.
    order: [],
    lobbySprites: {},   // user -> { el, sprite, dex } — caminantes PMD del lobby
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTE Boss (se resetea al llamar de nuevo a
    // startBoss(), es decir, al empezar un nuevo Boss).
    expelledUsers: new Set(),
    // Contador de bots añadidos por el streamer en esta partida (ver
    // addBossBot/nextBossBotName): asegura que cada bot tenga un nombre
    // único aunque se expulse alguno; se reinicia solo al llamar de nuevo
    // a startBoss() (nuevo Boss desde cero).
    botSeq: 0,
    lobbyExpelPopoverUser: null, // usuario cuyo popover "Expulsar" está abierto en el lobby (null si ninguno)
    lobbyExpelPopoverEl: null,
    // Almacén interno de objetos ya conseguidos en cofres pero todavía sin
    // asignar a ningún combatiente: itemId (ver BOSS_ITEMS) -> cantidad en
    // stock. Se reparte desde el panel de objetos (ver openBossItemsPanel)
    // hacia ms.players[user].itemId, el objeto que lleva puesto cada uno.
    // Arranca con los objetos del último punto de guardado (ver
    // savedProgress/saveBossProgress), no siempre vacío.
    itemsInventory: { ...savedProgress.items },
    // Cofres pendientes de abrir (ver bossDefeated): uno por cada vez que
    // cae el jefe de la fase 10 o de la fase final (15) de un nivel. Se
    // abren desde el botón 🎁 de la escena (ver openBossChestModal), que
    // ofrece 3 objetos aleatorios entre los que elegir uno.
    chestsAvailable: 0,
    // user -> { el, sprite, slotIndex, atCombat, moveToken, walkTimer } — el
    // sprite PMD (Walk/Attack/Hurt) de CADA combatiente apuntado, creado una
    // sola vez al empezar el combate (ver renderBoss) y que existe siempre,
    // de principio a fin: espera ya en su puesto fijo (BOSS_PLAYER_SLOTS) y,
    // al ser elegido, es ese mismo sprite el que recorre el camino hasta el
    // jefe (y vuelve a su puesto cuando termina su duelo) — nunca aparece ni
    // desaparece de repente.
    fighterSprites: {},
    activeUser: null,   // user que está luchando 1 vs 1 contra el jefe ahora mismo, o camino a hacerlo (o null)
    battle: null,       // { player: {user,pokemon,hp,maxHp}, initiativeGauge, lastActor, noDamageStreak, struggling } — solo existe una vez que ha llegado a su puesto; mientras es null el duelo está en pausa (ver bossAutoTick)
    bossSprite: null,   // PMDSprite animado (Walk/Attack/Hurt) del jefe
    bossSprite2: null,  // PMDSprite animado del segundo jefe (ver boss2), o null si no hay
    bossTurnPointer: 0, // con dos jefes vivos, alterna cuál de los dos ataca en cada turno del bando enemigo (ver performDuelAttack)
    tickInterval: null, // late que hace avanzar el duelo activo en solitario, turno a turno
    // Elemento (añadido a <body>, ver ensureBossFicheEl) de la ficha que se
    // muestra a la derecha de la pantalla al pasar el cursor sobre un
    // combatiente en espera; null hasta que se muestra la primera vez.
    bossFicheEl: null,
    // true justo después de caer el jefe de la fase final (15) de un nivel,
    // mientras se espera a que el streamer ELIJA un objeto del cofre recién
    // ganado (ver openBossChestModal/resolveBossChestChosen; ya no se puede
    // cerrar el modal sin elegir): ese momento es el que dispara la
    // transición con fundido a negro al nivel siguiente (ver
    // runBossLevelTransition, llamada desde resolveBossChestChosen). Se
    // vuelve a false en cuanto se dispara. Mientras está a true (y también
    // mientras pendingStageAdvance lo está, ver abajo) el combate queda en
    // pausa (ver ms.phase === 'chestPause', fijado en bossDefeated).
    pendingLevelTransition: false,
    // Igual que pendingLevelTransition, pero para el cofre de la fase 10
    // (mitad de nivel, sin cambio de nivel ni fundido a negro):
    // resolveBossChestChosen llama directamente a spawnNewBoss() en cuanto
    // el streamer elige objeto.
    pendingStageAdvance: false,
    // true en cuanto el streamer elige a su PRIMER combatiente de la fase
    // 1 de este nivel (ver selectChallenger): a partir de ahí se bloquean
    // los cambios de Pokémon y, para los objetos ya equipados, la
    // posibilidad de quitarlos o cambiarlos (ver bossChangesAllowed) hasta
    // la fase 1 del nivel siguiente, donde spawnNewBoss lo vuelve a poner
    // a false. Arranca en false: en la fase 1 de este primer nivel
    // (todavía) no se ha elegido a nadie.
    bossChangesLocked: false,
    // Ids (ARENA_POKEMON_DB) de todos los Pokémon que ya han salido como
    // enemigo en el nivel actual (jefe inicial, cada relevo de fase y
    // ambos jefes de una fase final con dos a la vez, ver spawnNewBoss):
    // dentro de un mismo nivel nunca debe repetirse un mismo Pokémon
    // mientras la pool tenga alguno sin usar (ver la exclusión en
    // spawnNewBoss). Se reinicia a un set nuevo, ya con el id de este
    // primer jefe, cada vez que empieza un nivel (aquí, y de nuevo en
    // spawnNewBoss cuando leveledUp).
    bossLevelSeenIds: new Set([bossTemplate.id]),
    // Modo AFK propio de este Boss (checkbox del lobby, ver
    // renderBossLobby): mientras está a true, las votaciones de chat
    // sustituyen al streamer para elegir combatiente y objetos (ver el
    // bloque "MODO AFK" del comentario de cabecera de este fichero). Se
    // puede activar o desactivar en cualquier momento del lobby, antes de
    // pulsar "Comenzar Combate"; una vez empezado el combate queda fijado
    // tal y como estuviera en ese instante.
    bossAfk: false,
    // Votación de chat en curso (ver queueBossAfkVote/beginBossAfkVote), o
    // null si no hay ninguna abierta ahora mismo: { kind, options, votes
    // (Map user->índice), secondsLeft, tickInterval, prompt, onResolve }.
    afkVote: null,
    // Votaciones pendientes de empezar en cuanto termine la actual (ver
    // processBossAfkVoteQueue): normalmente vacía o con como mucho una
    // esperando (p.ej. la de "quién recibe el objeto" mientras todavía
    // dura la de "qué objeto sale del cofre").
    afkVoteQueue: [],
  };
  // Se fija ya aquí el punto de guardado con el que arranca esta partida
  // (nivel, fase 1 y objetos con los que empieza, ver saveBossProgress):
  // así queda guardado el nivel también la primerísima vez que se juega a
  // este modo, y el dato en localStorage siempre refleja el punto de
  // guardado vigente aunque el streamer no llegue a subir de nivel.
  saveBossProgress(state.modeState);
  // Música del nivel: NO arranca ya en el lobby de inscripción (ahí sigue
  // sonando la del menú principal), sino al pulsar "Comenzar Combate" (ver
  // updateBossMusic en startBossFight, más abajo).
  renderBossLobby();
  addChatMessage(null, `👹 ¡${bossTemplate.name} os espera en el Nivel ${state.modeState.bossLevel}, Fase 1/${BOSS_STAGES_PER_LEVEL}! Escribe !pokemon [nombre] para apuntarte a la lucha (máx. ${BOSS_MAX_PLAYERS}, toda la Pokédex Nacional disponible). Cuando el streamer pulse "Comenzar Combate", empezará el duelo.`, 'system');
}

/* ---------------------------------------------------------
   LOBBY — pantalla previa de inscripción
   --------------------------------------------------------- */
function renderBossLobby() {
  const content = $('game-content');
  const b = state.modeState.boss;
  content.innerHTML = `
    <!-- La clase "game-scene" (además del propio id, que no se usaba en
         ningún otro sitio) es la misma que llevan las escenas de lobby del
         resto de modos (ver p.ej. #safari-lobby-scene): sin ella, el
         listener de 'pk-mode-launched' en eventListeners.js -que busca
         "#game-content .game-scene" para la pantalla completa
         automática- no encontraba nada mientras se estaba en el lobby, y
         la preferencia de Ajustes se quedaba sin efecto en este modo hasta
         llegar al combate de verdad (donde #boss-scene sí la lleva). -->
    <div class="boss-lobby-box game-scene" id="boss-lobby-scene">
      <div class="boss-lobby-head">
        <div class="boss-lobby-icon">👹</div>
        <div class="big-count pixel" id="boss-count">0</div>
        <div style="color:var(--muted);font-size:12px;">/ ${BOSS_MAX_PLAYERS} combatientes apuntados · escribe <b style="color:var(--yellow)">!pokemon [nombre]</b> en el chat</div>
        <div style="color:var(--muted);font-size:11px;max-width:540px;margin:6px auto 0;line-height:1.6;">
          Os enfrentaréis, de uno en uno, contra <b style="color:var(--red)">${escapeHtml(b.name)}</b> y, cuando caiga, contra
          el siguiente jefe, y el siguiente... ¡sin parar! El streamer elegirá con quién lucha el jefe en cada duelo;
          si tu Pokémon cae, puedes volver a ser elegido más adelante con la vida repuesta.
        </div>
      </div>
      <div class="boss-lobby-grid" id="boss-lobby-grid">
        <div class="boss-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <label class="boss-afk-toggle" style="display:flex;align-items:flex-start;gap:8px;max-width:540px;margin:10px auto 0;font-size:11px;color:var(--muted);line-height:1.5;text-align:left;">
        <input type="checkbox" id="boss-afk-checkbox" ${state.modeState.bossAfk ? 'checked' : ''} style="margin-top:2px;">
        <span>🤖 <b style="color:var(--text);">Modo AFK</b>: el propio chat vota, con 40s por votación, quién sube a luchar en cada pausa y qué objetos se reparten (y a quién).</span>
      </label>
      <div class="boss-lobby-actions">
        <button class="btn-secondary boss-addbot-btn" id="boss-addbot-btn">🤖 Añadir Bot</button>
        <button class="boss-start-btn" id="boss-start-btn" disabled>▶ Comenzar Combate</button>
      </div>
    </div>
  `;
  $('boss-start-btn').onclick = () => startBossFight();
  $('boss-addbot-btn').onclick = () => addBossBot();
  $('boss-afk-checkbox').onchange = (e) => {
    if (state.modeState) state.modeState.bossAfk = !!e.target.checked;
  };
  renderBossLobbyGrid();
}

// Renderizado incremental: cada combatiente tiene su propia tarjeta con un
// sprite PMD animado (igual que los caminantes del modo Arena) que se crea
// una sola vez y se conserva mientras esté en el lobby, en vez de
// reconstruir todo el grid (lo que destruiría y relanzaría las animaciones
// en cada inscripción).
function renderBossLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('boss-lobby-grid');
  const countEl = $('boss-count');
  const btn = $('boss-start-btn');
  const addBotBtn = $('boss-addbot-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]).filter(Boolean);
  if (countEl) countEl.textContent = players.length;
  if (btn) btn.disabled = players.length < 1;
  // El botón de bots se deshabilita igual que dejaría de admitir
  // inscripciones nuevas del chat en cuanto se llega al límite (ver
  // BOSS_MAX_PLAYERS, mismo tope que handleBossJoin).
  if (addBotBtn) addBotBtn.disabled = ms.order.length >= BOSS_MAX_PLAYERS;

  if (players.length === 0) {
    grid.innerHTML = '<div class="boss-lobby-empty">Esperando a que el chat se apunte...</div>';
    ms.lobbySprites = {};
    return;
  }
  const emptyMsg = grid.querySelector('.boss-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  ms.order.forEach(user => {
    const p = ms.players[user];
    if (!p) return;
    let entry = ms.lobbySprites[user];
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'boss-lobby-card' + (p.isBot ? ' is-bot' : '');
      el.title = 'Clic para expulsar de la partida';
      const spriteId = 'boss-lobby-' + user.replace(/[^a-zA-Z0-9_-]/g, '');
      // Los bots no tienen un usuario real de chat detrás: en vez de
      // "@usuario" se muestra la etiqueta "🤖 CPU" para distinguirlos a
      // simple vista de los combatientes apuntados desde el chat.
      const userLabel = p.isBot ? '🤖 CPU' : `@${escapeHtml(user)}`;
      el.innerHTML = `
        <div class="pmd-slot pmd-mini" id="${spriteId}"></div>
        <div class="p-name">${escapeHtml(p.pokemon.name)}</div>
        <div class="p-user">${userLabel}</div>
        <div class="p-level">Nivel ${ms.bossLevel}</div>
      `;
      // El streamer puede hacer clic en cualquier combatiente inscrito para
      // que aparezca un pequeño botón "Expulsar" sobre su tarjeta.
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleLobbyExpelPopover(ms, user, el, expelFromBossLobby);
      });
      grid.appendChild(el);
      const sprite = new PMDSprite($(spriteId), getPokemonSprite(p.pokemon.sprite));
      sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      sprite.play('Walk', PMD_DIR.down, true, null, BOSS_ANIM_SPEED);
      ms.lobbySprites[user] = { el, sprite, dex: p.pokemon.sprite };
    } else if (entry.dex !== p.pokemon.sprite) {
      // El jugador cambió de Pokémon: se relanza la animación con el nuevo sprite.
      entry.sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
      entry.sprite.play('Walk', PMD_DIR.down, true, null, BOSS_ANIM_SPEED);
      entry.dex = p.pokemon.sprite;
      const nameEl = entry.el.querySelector('.p-name');
      if (nameEl) nameEl.textContent = p.pokemon.name;
    }
  });
}

// Expulsa a un combatiente inscrito del lobby (acción del streamer, no del
// propio usuario): se retira de la partida en curso y se le añade a
// expelledUsers para que no pueda volver a apuntarse con !pokemon hasta el
// siguiente Boss (nueva llamada a startBoss()).
function expelFromBossLobby(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby' || !ms.players[user]) return;
  const idx = ms.order.indexOf(user);
  if (idx !== -1) ms.order.splice(idx, 1);
  delete ms.players[user];
  const entry = ms.lobbySprites[user];
  if (entry) {
    entry.sprite.destroy();
    entry.el.remove();
  }
  delete ms.lobbySprites[user];
  ms.expelledUsers.add(user);
  addChatMessage(null, `🚫 @${user} ha sido expulsado del Boss por el streamer`, 'system', { mirror: false });
  renderBossLobbyGrid();
}

// Nombre único para cada bot añadido en esta partida (ver addBossBot):
// ms.botSeq nunca vuelve atrás, ni siquiera si se expulsa un bot, así que
// dos bots de la misma partida nunca comparten nombre. Se reinicia solo al
// llamar de nuevo a startBoss() (nuevo Boss desde cero).
function nextBossBotName(ms) {
  ms.botSeq = (ms.botSeq || 0) + 1;
  return `🤖 Bot ${ms.botSeq}`;
}

// Reparte al azar, entre ataque/vida/velocidad, TODAS las mejoras de
// !levelup que le queden pendientes a un bot en el nivel actual (ver
// bossLevelUpsAvailable): un bot no puede escribir !levelup por chat para
// elegirlas él mismo, así que se le asignan solas en cuanto tiene algún
// presupuesto pendiente. Se llama tanto al añadirlo desde un nivel ya
// avanzado (ver addBossBot, si la partida viene de una sesión guardada, ver
// loadSavedBossProgress) como cada vez que la mazmorra sube de nivel y las
// mejoras de todos se resetean a freshLevels() (ver spawnNewBoss). Deja la
// vida (hp) a la máxima resultante tras el reparto, igual que hace
// handleBossLevelUp con cada mejora manual de vida.
function randomizeBotLevels(ms, player) {
  if (!player || !player.isBot) return;
  const STATS = ['atk', 'hp', 'speed'];
  let available = bossLevelUpsAvailable(ms, player);
  while (available > 0) {
    const stat = STATS[Math.floor(Math.random() * STATS.length)];
    player.levels[stat]++;
    available--;
  }
  player.hp = effectiveStats(BOSS_ATK, BOSS_PLAYER_HP, BOSS_ATK_SPEED_MS, player.levels).maxHp;
}

// Botón "🤖 Añadir Bot" del streamer (ver renderBossLobby, solo visible en
// la pantalla de inscripción): añade un combatiente CPU al lobby, tal y
// como si alguien del chat hubiera escrito !pokemon [nombre] (ver
// handleBossJoin) — mismo límite de plazas (BOSS_MAX_PLAYERS), mismo puesto
// fijo por orden de llegada (ms.order) y mismos requisitos de sprite PMD
// local — pero con un Pokémon elegido al azar en vez de a elección de quien
// se apunta, y con sus mejoras de !levelup repartidas solas y al azar (ver
// randomizeBotLevels) si la partida ya viene de un nivel superior al 1.
// Los bots luchan exactamente igual que cualquier otro combatiente: el
// streamer los elige con un clic igual que a los demás.
function addBossBot() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  if (ms.order.length >= BOSS_MAX_PLAYERS) {
    toast(`Ya hay ${BOSS_MAX_PLAYERS} combatientes apuntados, no caben más bots`);
    return;
  }
  // Mismo filtro que handleBossJoin: solo Pokémon con sprite PMD local
  // disponible, para no depender de la red ni verse a medias en pantalla.
  const pool = ARENA_POKEMON_DB.filter(p => pmdHasLocalSprite(p.sprite));
  const source = pool.length ? pool : ARENA_POKEMON_DB;
  const pokemon = source[Math.floor(Math.random() * source.length)];
  const botUser = nextBossBotName(ms);
  const levels = freshLevels();
  ms.players[botUser] = {
    pokemon: { ...pokemon },
    dmg: 0,
    levels,
    hp: effectiveStats(BOSS_ATK, BOSS_PLAYER_HP, BOSS_ATK_SPEED_MS, levels).maxHp,
    attackTypeIndex: 0,
    itemId: null,
    // Marca que este combatiente es un bot del streamer (sin usuario real
    // de chat detrás): se usa para mostrar la etiqueta "🤖 CPU" en el lobby
    // (ver renderBossLobbyGrid) y para repartirle solo, y al azar, sus
    // mejoras de !levelup en cada subida de nivel (ver randomizeBotLevels,
    // spawnNewBoss).
    isBot: true,
  };
  ms.order.push(botUser);
  // Si la partida arranca ya en un nivel superior al 1 (progreso guardado,
  // ver loadSavedBossProgress), el bot tiene mejoras pendientes desde ya:
  // se le reparten solas y al azar en el mismo momento de apuntarse.
  randomizeBotLevels(ms, ms.players[botUser]);
  pmdPreload(pokemon.sprite);
  playVeJoin();
  addChatMessage(null, `🤖 El streamer añade un bot: ${botUser} se apunta con ${pokemon.name}!`, 'correct', { mirror: false });
  renderBossLobbyGrid();
}

/* ---------------------------------------------------------
   MODO AFK — votaciones de chat (40s)
   -----------------------------------------------------------
   Infraestructura genérica usada tanto para elegir combatiente (ver
   maybeStartBossAfkChallengerVote) como para elegir objeto de un cofre y
   a quién se le entrega (ver openBossChestModal/
   maybeStartBossAfkItemRecipientVote). Solo hay una votación a la vez
   (ver ms.afkVote); si se necesita abrir otra mientras dura, se encola
   (ver ms.afkVoteQueue) y se procesa en cuanto la actual se resuelve.
   --------------------------------------------------------- */
const BOSS_AFK_VOTE_SECONDS = 40;

function bossAfkVoteOverlayParent() {
  return currentFullscreenElement() || document.body;
}

function removeBossAfkVoteOverlay() {
  const el = document.getElementById('boss-afk-vote-overlay');
  if (el) el.remove();
}

function bossAfkTallyVotes() {
  const ms = state.modeState;
  const counts = {};
  if (ms && ms.afkVote) ms.afkVote.votes.forEach(i => { counts[i] = (counts[i] || 0) + 1; });
  return counts;
}

function renderBossAfkVoteOptions(winnerIndex) {
  const box = document.getElementById('boss-afk-vote-options');
  const ms = state.modeState;
  if (!box || !ms || !ms.afkVote) return;
  const counts = bossAfkTallyVotes();
  box.innerHTML = ms.afkVote.options.map((opt, i) => `
    <div class="afk-vote-option${winnerIndex === i ? ' is-winner' : ''}">
      <div class="afk-vote-num pixel">${i + 1}</div>
      <div class="afk-vote-texts">
        <div class="afk-vote-label">${escapeHtml(opt.label)}</div>
        ${opt.sub ? `<div class="afk-vote-modename">${escapeHtml(opt.sub)}</div>` : ''}
      </div>
      <div class="afk-vote-count">${counts[i] || 0} ${counts[i] === 1 ? 'voto' : 'votos'}</div>
    </div>
  `).join('');
}

function renderBossAfkVoteOverlay() {
  removeBossAfkVoteOverlay();
  const ms = state.modeState;
  if (!ms || !ms.afkVote) return;
  const overlay = document.createElement('div');
  overlay.className = 'afk-vote-overlay';
  overlay.id = 'boss-afk-vote-overlay';
  overlay.innerHTML = `
    <div class="afk-vote-box">
      <div class="afk-vote-title pixel">🤖 Modo AFK</div>
      <div class="afk-vote-sub">${escapeHtml(ms.afkVote.prompt)} Escribe ${ms.afkVote.options.map((_, i) => `<b>!${i + 1}</b>`).join(', ')} en el chat</div>
      <div class="afk-vote-timer pixel" id="boss-afk-vote-timer">${ms.afkVote.secondsLeft}</div>
      <div class="afk-vote-options" id="boss-afk-vote-options"></div>
    </div>
  `;
  bossAfkVoteOverlayParent().appendChild(overlay);
  renderBossAfkVoteOptions();
}

// Añade una votación a la cola y arranca de inmediato si no hay ninguna en
// curso (ver processBossAfkVoteQueue). `options` es un array de { label,
// sub, ...cualquier dato propio que necesite onResolve(winnerOption) }.
function queueBossAfkVote(kind, options, prompt, onResolve) {
  const ms = state.modeState;
  if (!ms || !options.length) return;
  ms.afkVoteQueue = ms.afkVoteQueue || [];
  ms.afkVoteQueue.push({ kind, options, prompt, onResolve });
  processBossAfkVoteQueue();
}

function processBossAfkVoteQueue() {
  const ms = state.modeState;
  if (!ms || ms.afkVote) return;
  const queue = ms.afkVoteQueue || [];
  const next = queue.shift();
  if (!next) return;
  beginBossAfkVote(next);
}

function beginBossAfkVote({ kind, options, prompt, onResolve }) {
  const ms = state.modeState;
  if (!ms) return;
  ms.afkVote = { kind, options, votes: new Map(), secondsLeft: BOSS_AFK_VOTE_SECONDS, tickInterval: null, prompt, onResolve };
  addChatMessage(null, `🤖 Modo AFK: ${prompt} Escribe ${options.map((_, i) => `!${i + 1}`).join(', ')} en el chat (40s).`, 'system');
  renderBossAfkVoteOverlay();
  ms.afkVote.tickInterval = setInterval(() => {
    const cur = state.modeState;
    if (!cur || !cur.afkVote) return;
    cur.afkVote.secondsLeft--;
    const timerEl = document.getElementById('boss-afk-vote-timer');
    if (timerEl) timerEl.textContent = String(Math.max(cur.afkVote.secondsLeft, 0));
    if (cur.afkVote.secondsLeft <= 0) {
      clearInterval(cur.afkVote.tickInterval);
      resolveBossAfkVote();
    }
  }, 1000);
}

// Al terminar el tiempo, gana la opción más votada; en caso de empate (o
// si nadie ha votado, que es un empate a 0 entre todas) se sortea al azar
// entre las empatadas — nunca queda sin resolverse.
function resolveBossAfkVote() {
  const ms = state.modeState;
  if (!ms || !ms.afkVote) return;
  const vote = ms.afkVote;
  const counts = bossAfkTallyVotes();
  const maxVotes = Math.max(0, ...vote.options.map((_, i) => counts[i] || 0));
  const winners = vote.options.map((_, i) => i).filter(i => (counts[i] || 0) === maxVotes);
  const winnerIndex = winners[Math.floor(Math.random() * winners.length)];
  renderBossAfkVoteOptions(winnerIndex);
  addChatMessage(null, `🏆 Modo AFK: gana la opción ${winnerIndex + 1} (${vote.options[winnerIndex].label}).`, 'correct');
  const onResolve = vote.onResolve;
  const winnerOption = vote.options[winnerIndex];
  ms.afkVote = null;
  setTimeout(() => {
    removeBossAfkVoteOverlay();
    if (state.modeState === ms) {
      onResolve(winnerOption);
      processBossAfkVoteQueue();
    }
  }, 2500);
}

// Registra el voto de `user` (!1, !2...) mientras dura una votación del
// Modo AFK: se llama desde handleBossCmd, que bloquea el resto de
// comandos mientras tanto (igual que ya hacen las pausas de "levelSelect"
// o "chestPause").
function handleBossAfkVoteCommand(user, cmd) {
  const ms = state.modeState;
  if (!ms || !ms.afkVote) return false;
  const match = /^!(\d{1,2})$/.exec(cmd);
  if (match) {
    const idx = Number(match[1]) - 1;
    if (idx >= 0 && idx < ms.afkVote.options.length) {
      ms.afkVote.votes.set(String(user).toLowerCase(), idx);
      renderBossAfkVoteOptions();
    }
  }
  return true;
}

// Combatientes en pie (con vida, ver isFighterFainted) entre los que se
// puede votar el próximo duelo: se llama en cada fase de espera (ver el
// comentario "MODO AFK" de cabecera para la lista de puntos exactos donde
// se dispara). Si no queda ninguno no se abre nada (no debería darse: en
// cuanto no queda ninguno en pie ya se dispara triggerBossGameOver desde
// endDuel, antes de llegar aquí).
function bossAfkEligibleChallengers(ms) {
  return ms.order.filter(u => ms.players[u] && !isFighterFainted(u));
}

function maybeStartBossAfkChallengerVote() {
  const ms = state.modeState;
  if (!ms || !ms.bossAfk) return;
  if (ms.phase !== 'fight' || ms.activeUser || ms.battle) return;
  const eligible = bossAfkEligibleChallengers(ms);
  if (!eligible.length) return;
  const options = eligible.map(u => ({ label: `@${u}`, sub: ms.players[u].pokemon.name, user: u }));
  queueBossAfkVote('challenger', options, 'votad quién sale a luchar contra el jefe.', (winner) => {
    selectChallenger(winner.user);
  });
}

// Combatientes apuntados que todavía no llevan ningún objeto puesto: los
// únicos que se pueden votar para recibir el que acaba de salir del
// cofre (ver maybeStartBossAfkItemRecipientVote) — igual que en la
// asignación manual (ver assignBossItem), un objeto ya equipado es
// definitivo hasta que se desequipa solo.
function bossAfkEligibleItemRecipients(ms) {
  return ms.order.filter(u => ms.players[u] && !ms.players[u].itemId);
}

function maybeStartBossAfkItemRecipientVote(itemId) {
  const ms = state.modeState;
  if (!ms) return;
  const itemDef = bossItemById(itemId);
  const eligible = bossAfkEligibleItemRecipients(ms);
  if (!eligible.length) {
    addChatMessage(null, `🎒 Modo AFK: ningún combatiente puede recibir ${itemDef ? itemDef.name : 'el objeto'} ahora mismo (todos llevan ya uno puesto), se queda en el almacén hasta que alguno se quede sin objeto.`, 'system');
    return;
  }
  const options = eligible.map(u => ({ label: `@${u}`, sub: ms.players[u].pokemon.name, user: u }));
  queueBossAfkVote('itemRecipient', options, `votad quién recibe ${itemDef ? itemDef.icon + ' ' + itemDef.name : 'el objeto del cofre'}.`, (winner) => {
    assignBossItem(winner.user, itemId);
  });
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
// Gestiona !pokemon [nombre]: se llama desde pokeballSharedHandler.js.
// Funciona en dos momentos: durante el lobby inicial (fase de inscripción,
// admite combatientes nuevos y cambios), y en cualquier momento de la fase
// 1 de cada nivel posterior —tanto en la pausa "levelSelect" como ya en
// pleno combate— hasta que el streamer elige a su primer combatiente de
// esa fase 1 (ver bossChangesAllowed/ms.bossChangesLocked); en ese segundo
// caso solo para combatientes YA apuntados, nunca para apuntarse por
// primera vez. Pasada la fase 1, o ya bloqueados los cambios, no se
// admite ningún uso.
export function handleBossJoin(user, parts) {
  const ms = state.modeState;
  if (!ms) return;
  const isLobby = ms.phase === 'lobby';
  if (!isLobby && !bossChangesAllowed(ms)) {
    const msg = ms.bossStage !== 1
      ? `${user}: ya se ha pasado la Fase 1 de este nivel, no se puede cambiar de Pokémon hasta la Fase 1 del nivel siguiente.`
      : `${user}: el streamer ya ha elegido con quién luchar en esta Fase 1, no se puede cambiar de Pokémon hasta la Fase 1 del nivel siguiente.`;
    addChatMessage(null, msg, 'system', { mirror: false });
    return;
  }
  if (ms.expelledUsers && ms.expelledUsers.has(user)) {
    addChatMessage(null, `${user}: el streamer te ha expulsado de este Boss, no puedes volver a apuntarte hasta el siguiente`, 'system', { mirror: false });
    return;
  }
  const name = parts.slice(1).join(' ').toLowerCase().trim();
  if (!name) return;
  const foundPokemon = ARENA_POKEMON_DB.find(p => p.name.toLowerCase() === name);
  if (!foundPokemon) {
    addChatMessage(null, `${user}: "${parts.slice(1).join(' ')}" no es un Pokémon válido. Escribe el nombre exacto de cualquier Pokémon de la Pokédex Nacional (ej: !pokemon Pikachu, !pokemon Greninja, !pokemon Charizard...)`, 'system');
    return;
  }
  // Formas especiales todavía no desbloqueadas (Wishiwashi Banco,
  // Aegislash Espada...; ver bossSpriteLocks.js): no se dejan elegir
  // hasta superar la fase del Boss que las desbloquea.
  const lockMsg = bossSpriteLockBlockMessage(foundPokemon.name, user);
  if (lockMsg) {
    addChatMessage(null, lockMsg, 'system');
    return;
  }
  // Un puñado de Pokémon (ver README_PMD_LOCAL.md) todavía no tienen su
  // sprite PMD completo en el repositorio comunitario de PMDCollab: no se
  // dejan elegir, para no depender de la red ni verse a medias en pantalla.
  if (!pmdHasLocalSprite(foundPokemon.sprite)) {
    addChatMessage(null, `Lo sentimos, el Pokémon ${foundPokemon.name} aún no tiene sprite en el juego, por favor elige otro.`, 'system');
    return;
  }
  // rollShinyPokemon() devuelve una copia nueva (0.5% de isShiny:true, ver
  // js/pokemonShiny.js), nunca la entrada original compartida de
  // ARENA_POKEMON_DB.
  const pokemon = rollShinyPokemon(foundPokemon);
  // Si ya está apuntado, se le deja cambiar de Pokémon sin contar como
  // plaza nueva ni tocar el puesto que ya tenía asignado; el límite de
  // combatientes solo aplica a quien se apunta por primera vez.
  const isNew = !ms.players[user];
  // Fuera del lobby inicial (fase 1 ya en marcha, en pausa o en pleno
  // combate) no se admiten combatientes nuevos, solo el cambio de quienes
  // ya estaban apuntados: apuntarse por primera vez solo es posible en el
  // lobby inicial de este mismo Boss (ver el aviso de arriba).
  if (!isLobby && isNew) {
    addChatMessage(null, `${user}: solo los combatientes ya apuntados pueden cambiar de Pokémon aquí; para apuntarte por primera vez espera al siguiente Boss.`, 'system', { mirror: false });
    return;
  }
  if (isNew && ms.order.length >= BOSS_MAX_PLAYERS) {
    addChatMessage(null, `🚫 @${user}: ya hay ${BOSS_MAX_PLAYERS} combatientes apuntados, no caben más en este Boss`, 'system', { mirror: false });
    return;
  }
  // Si ya estaba apuntado (solo cambia de Pokémon), conserva las mejoras de
  // estadística que ya hubiera invertido con !levelup en el nivel actual.
  const existingLevels = ms.players[user] && ms.players[user].levels;
  const levels = existingLevels || freshLevels();
  // El objeto equipado (ver ms.players[user].itemId, asignado desde el
  // panel de objetos) también se conserva si el combatiente ya estaba
  // apuntado y solo cambia de Pokémon.
  const existingItemId = (ms.players[user] && ms.players[user].itemId) || null;
  // "hp" es la vida ACTUAL persistida del combatiente fuera de combate (ver
  // comentario junto a ms.battle más abajo): al apuntarse por primera vez
  // (o al cambiar de Pokémon, lo que reinicia su build) empieza a vida
  // máxima; si ya estaba apuntado con el mismo Pokémon nunca se llega aquí
  // dos veces con el mismo nombre porque el chat ya lo tiene registrado.
  ms.players[user] = {
    pokemon,
    dmg: 0,
    levels,
    hp: effectiveStats(BOSS_ATK, BOSS_PLAYER_HP, BOSS_ATK_SPEED_MS, levels).maxHp,
    // Tipo de ataque activo (índice sobre pokemon.types): 0 = primario
    // (por defecto), 1 = secundario. Solo tiene sentido si el Pokémon tiene
    // dos tipos (ver !habilidad1/!habilidad2, handleBossAbility); se
    // reinicia al primario cada vez que se apunta o cambia de Pokémon, ya
    // que el nuevo Pokémon puede no tener el mismo segundo tipo (o ninguno).
    attackTypeIndex: 0,
    // Objeto equipado (ver BOSS_ITEMS), o null si no lleva ninguno; se
    // asigna desde el panel de objetos (ver assignBossItem).
    itemId: existingItemId,
  };
  if (isNew) {
    // El puesto interno que ocupará este combatiente en el mapa del jefe
    // (su índice en BOSS_PLAYER_SLOTS) queda fijado ya aquí, por simple
    // orden de llegada: no se muestra en ningún sitio del lobby, solo se
    // usa después para colocar su icono en la escena de combate (ver
    // renderBossPlayersZone).
    ms.order.push(user);
  }
  pmdPreload(pokemon.sprite);
  playVeJoin();
  if (!isLobby) {
    // Ya apuntado desde antes: solo cambia de Pokémon, así que se refleja
    // al instante en su sprite ya existente sobre el mapa de combate (ver
    // updateBossFighterVisual), en vez de reconstruir el lobby (que aquí
    // ni siquiera está montado).
    addChatMessage(null, `🔄 @${user} cambia a ${pokemon.name} durante la Fase 1.`, 'correct', { mirror: false });
    updateBossFighterVisual(user);
  } else {
    addChatMessage(null, `✅ ${user} se apunta con ${pokemon.name}!`, 'correct', { mirror: false });
    renderBossLobbyGrid();
  }
}

// Actualiza el sprite PMD ya existente de `user` sobre el mapa de combate
// (ver createFighterSprite) para reflejar el nuevo Pokémon elegido durante
// la pantalla de cambio de Pokémon al principio de la fase 1 de cada nivel
// (ver ms.phase === 'levelSelect', handleBossJoin más arriba): relanza su
// animación de espera con el nuevo dex (Walk, o Sleep si por lo que fuera
// seguía derrotado — aunque cambiar de Pokémon ya lo revive, ver el reseteo
// de "hp" a vida máxima más arriba) y refresca el tooltip de su etiqueta.
// El resto de sitios que muestran su Pokémon (ficha, ranking...) ya leen
// siempre en caliente de ms.players[user], así que no hace falta tocar
// nada más.
function updateBossFighterVisual(user) {
  const ms = state.modeState;
  const entry = ms && ms.fighterSprites[user];
  const p = ms && ms.players[user];
  if (!entry || !p) return;
  entry.sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
  playFighterRestAnim(user);
  if (entry.nameEl) {
    entry.nameEl.title = `@${user} · ${p.pokemon.name} — clic para que luche contra el jefe`;
  }
}

// El chat ya NO elige el ataque en sí: !atacar y !habilidad (a secas) han
// perdido su función (el duelo es automático, ver
// bossAutoTick/performDuelAttack). Los comandos que sí siguen haciendo algo
// aquí son !puntos, !levelup, !stats, !ready y !habilidad1/!habilidad2 (que
// solo cambian el TIPO del ataque automático, ver handleBossAbility, no
// controlan cuándo se ataca); el resto solo recuerda que es el streamer
// quien elige al combatiente con un clic.
export function handleBossCmd(user, cmd, parts) {
  const ms = state.modeState;
  if (!ms) return;

  // Mientras dura una votación del Modo AFK (ver el bloque "MODO AFK" de
  // la cabecera del fichero) solo se procesan los votos !1, !2...; el
  // resto de comandos de juego se ignoran hasta que se resuelva, igual
  // que ya pasa durante las pausas "levelSelect" o "chestPause".
  if (handleBossAfkVoteCommand(user, cmd)) return;

  // !levelup se gestiona aparte de la comprobación de abajo porque el
  // streamer puede usarlo para mejorar a OTRO combatiente (!levelup
  // @usuario ...) sin estar él mismo apuntado a la partida.
  if (cmd === '!levelup') {
    handleBossLevelUp(user, parts || []);
    return;
  }

  if (!ms.players[user]) {
    addChatMessage(null, `${user}: usa !pokemon [nombre] primero`, 'system', { mirror: false });
    return;
  }
  if (cmd === '!atacar' || cmd === '!habilidad') {
    addChatMessage(null, `${user}: el combate contra el jefe es automático, el streamer elige quién sube a luchar.`, 'system', { mirror: false });
    return;
  }
  if (cmd === '!habilidad1' || cmd === '!habilidad2') {
    handleBossAbility(user, cmd);
    return;
  }
  if (cmd === '!puntos') {
    const player = ms.players[user];
    addChatMessage(null, `${user}: ${state.scores[user] || 0} pts, ${player.dmg} daño al jefe`, 'system', { mirror: false });
    return;
  }
  if (cmd === '!stats') {
    handleBossStats(user);
    return;
  }
  if (cmd === '!ready') {
    handleBossReady(user);
  }
}

// Busca, sin distinguir mayúsculas/minúsculas, la clave real (tal y como
// llegó por chat) con la que está registrado un combatiente en ms.players;
// se usa para que el streamer pueda escribir !levelup @usuario con
// cualquier capitalización y aun así encontrarlo.
function findPlayerKey(ms, rawName) {
  const target = String(rawName || '').toLowerCase();
  return Object.keys(ms.players).find(u => u.toLowerCase() === target);
}

// Interpreta los argumentos de !levelup que vienen después del target
// (stat[cantidad] repetidos, ver cabecera de handleBossLevelUp) y devuelve
// un objeto { atk, hp, speed } con la cantidad de mejoras pedidas para
// cada estadística. Admite tanto la forma clásica de una mejora por
// mensaje ("!levelup vida", sin número -> 1 mejora) como el reparto de
// varias mejoras a la vez en un único mensaje, con el número pegado al
// nombre de la estadística ("!levelup vida2 ataque3 velocidad1") o
// separado de él ("!levelup vida 2 ataque 3 velocidad 1") — cualquier
// token que no encaje con ninguna estadística conocida simplemente se
// ignora, para no romper el parseo por una errata.
function parseLevelUpAssignments(parts, startIndex) {
  const result = { atk: 0, hp: 0, speed: 0 };
  let i = startIndex;
  while (i < parts.length) {
    const tok = parts[i] || '';
    const m = tok.toLowerCase().match(/^([a-záéíóúñ]+)(\d+)?$/i);
    if (!m) { i++; continue; }
    const stat = LEVELUP_STAT_ALIASES[m[1]];
    if (!stat) { i++; continue; }
    if (m[2]) {
      result[stat] += parseInt(m[2], 10);
      i++;
    } else if (parts[i + 1] && /^\d+$/.test(parts[i + 1])) {
      result[stat] += parseInt(parts[i + 1], 10);
      i += 2;
    } else {
      result[stat] += 1; // sin número: se entiende como una sola mejora
      i++;
    }
  }
  return result;
}

// Gestiona !levelup ataque | vida | velocidad (y variantes con cantidad,
// ver parseLevelUpAssignments): el usuario invierte una o varias mejoras
// de nivel en las estadísticas elegidas de SU combatiente (ver
// playerEffectiveStats), dentro del presupuesto de mejoras pendientes que
// le quede en el nivel actual (ver bossLevelUpsAvailable): una por cada
// nivel de usuario por encima del 1. Puede repartir las mejoras en varios
// mensajes ("!levelup ataque", luego "!levelup vida"...) o de golpe en uno
// solo ("!levelup vida2 ataque3 velocidad1"), como prefiera, hasta agotar
// el presupuesto. El presupuesto (y las mejoras ya invertidas) se resetea
// al subir de nivel (ver spawnNewBoss).
//
// El streamer (ver isBroadcaster) tiene, además, una variante propia:
// !levelup @nombredeusuario ataque|vida|velocidad[...], que aplica la(s)
// mejora(s) al combatiente de OTRO usuario en lugar de al suyo propio
// (útil para repartir mejoras a quien lo necesite, o si el streamer no
// está jugando).
//
// !levelup info (sin target de streamer) no gasta ninguna mejora: solo
// contesta en el chat cuántas le quedan pendientes al propio combatiente
// del usuario y recuerda los comandos para gastarlas (ver
// handleBossLevelUpInfo).
function handleBossLevelUp(user, parts) {
  const ms = state.modeState;
  const streamer = isBroadcaster(user);
  const targetsOther = streamer && !!parts[1] && parts[1].startsWith('@');

  let targetUser, statsStartIndex;
  if (targetsOther) {
    const rawName = parts[1].slice(1);
    const matched = findPlayerKey(ms, rawName);
    if (!matched) {
      addChatMessage(null, `${user}: @${rawName} no está apuntado en este Boss.`, 'system', { mirror: false });
      return;
    }
    targetUser = matched;
    statsStartIndex = 2;
  } else {
    if (!ms.players[user]) {
      addChatMessage(null, `${user}: usa !pokemon [nombre] primero`, 'system', { mirror: false });
      return;
    }
    if ((parts[1] || '').toLowerCase() === 'info') {
      handleBossLevelUpInfo(user);
      return;
    }
    targetUser = user;
    statsStartIndex = 1;
  }

  const requested = parseLevelUpAssignments(parts, statsStartIndex);
  const requestedTotal = requested.atk + requested.hp + requested.speed;
  if (requestedTotal === 0) {
    const hint = streamer ? ' (o !levelup @usuario ataque/vida/velocidad para mejorar a otro combatiente)' : '';
    addChatMessage(null, `${user}: usa !levelup ataque, !levelup vida o !levelup velocidad${hint}. También puedes repartir varias de golpe, p.ej. !levelup vida2 ataque3 velocidad1, o escribir !levelup info para ver cuántas te quedan.`, 'system');
    return;
  }

  const player = ms.players[targetUser];
  if (!player.levels) player.levels = freshLevels();

  // Solo se puede invertir una mejora por cada nivel que el combatiente
  // haya subido (ver bossLevelUpsAvailable): en cuanto se agota ese
  // presupuesto en el nivel actual, !levelup deja de tener efecto hasta
  // que la mazmorra vuelva a subir de nivel. Si lo que se pide de golpe
  // supera el presupuesto disponible, se rechaza el reparto completo (no
  // se aplica una parte) para que el usuario pueda corregir la cantidad.
  const available = bossLevelUpsAvailable(ms, player);
  if (available <= 0) {
    const who = targetsOther ? `@${targetUser}` : `${user}`;
    addChatMessage(null, `${who}: ${player.pokemon.name} ya no tiene mejoras pendientes en el Nivel ${ms.bossLevel}, ¡espera a subir de nivel!`, 'system');
    return;
  }
  if (requestedTotal > available) {
    const who = targetsOther ? `@${targetUser}` : `${user}`;
    addChatMessage(null, `${who}: solo te quedan ${available} mejora${available === 1 ? '' : 's'} pendiente${available === 1 ? '' : 's'} en el Nivel ${ms.bossLevel} (pediste ${requestedTotal}).`, 'system');
    return;
  }

  player.levels.atk += requested.atk;
  player.levels.hp += requested.hp;
  player.levels.speed += requested.speed;
  const stats = playerEffectiveStats(ms, targetUser);

  // Al subir la estadística de vida, se suma la cantidad máxima aumentada
  // (LEVELUP_HP_BONUS por cada punto invertido) tanto a la vida máxima
  // como a la vida ACTUAL, tanto si el combatiente está esperando (se
  // actualiza su vida persistida, ver ms.players[user].hp) como si está
  // luchando ahora mismo contra el jefe (además se refleja al instante en
  // el duelo en curso); el ataque y la velocidad ya se leen "en caliente"
  // en cada turno (ver performDuelAttack y sideAtkSpeedMs), así que no
  // hace falta tocar nada más para esas dos.
  if (requested.hp > 0) {
    const prevHp = typeof player.hp === 'number' ? player.hp : stats.maxHp;
    player.hp = Math.min(stats.maxHp, prevHp + LEVELUP_HP_BONUS * requested.hp);
    if (ms.battle && ms.battle.player.user === targetUser) {
      ms.battle.player.maxHp = stats.maxHp;
      ms.battle.player.hp = player.hp;
      updateDuelHP();
    } else {
      // No está luchando ahora mismo: refleja el aumento en su barra de
      // vida flotante mientras espera turno (ver updateWaitingFighterHP).
      updateWaitingFighterHP(targetUser);
    }
  }

  const labelParts = [];
  if (requested.atk) labelParts.push(`${LEVELUP_STAT_LABEL.atk} x${requested.atk}`);
  if (requested.hp) labelParts.push(`${LEVELUP_STAT_LABEL.hp} x${requested.hp}`);
  if (requested.speed) labelParts.push(`${LEVELUP_STAT_LABEL.speed} x${requested.speed}`);
  const label = labelParts.join(', ');
  const who = targetsOther
    ? `${player.pokemon.name} de @${targetUser} (elegido por el streamer @${user})`
    : `${player.pokemon.name} de @${user}`;
  // Si aún le quedan mejoras pendientes por elegir en este nivel se lo
  // recordamos; si ya las ha gastado todas, se omite ese aviso (ver mismo
  // criterio en showBossFiche/handleBossStats).
  const remaining = bossLevelUpsAvailable(ms, player);
  const remainingText = remaining > 0 ? ` · Mejoras pendientes: ${remaining}` : '';
  addChatMessage(null, `⬆️ ${who} sube ${label}! Nivel ${ms.bossLevel} · Ataque: ${stats.atk} · Vida: ${stats.maxHp} · Velocidad: ${Math.round((1 - stats.speedMs / BOSS_ATK_SPEED_MS) * 100)}% más rápido${remainingText}`, 'correct');
}

// Gestiona !levelup info: responde en el chat con cuántas mejoras de nivel
// tiene todavía pendientes de elegir el combatiente del usuario (ver
// bossLevelUpsAvailable) y le recuerda los comandos para repartirlas, uno
// a uno o varias de golpe en el mismo mensaje (ver parseLevelUpAssignments
// y handleBossLevelUp). No consume ninguna mejora, es solo una consulta.
function handleBossLevelUpInfo(user) {
  const ms = state.modeState;
  const player = ms.players[user];
  const available = bossLevelUpsAvailable(ms, player);
  if (available <= 0) {
    addChatMessage(null, `${user}: ${player.pokemon.name} ya no tiene mejoras pendientes en el Nivel ${ms.bossLevel}, ¡espera a subir de nivel!`, 'system', { mirror: false });
    return;
  }
  addChatMessage(null, `📈 @${user}: tienes ${available} mejora${available === 1 ? '' : 's'} disponible${available === 1 ? '' : 's'} en el Nivel ${ms.bossLevel}. Repártelas con !levelup ataque / !levelup vida / !levelup velocidad, o todas de golpe en un mismo mensaje, p.ej. !levelup vida2 ataque3 velocidad1.`, 'system', { mirror: false });
}

// Gestiona !stats: muestra en el chat las estadísticas concretas del
// combatiente de quien escribió el comando (las suyas, no las de nadie
// más), incluyendo su vida actual si está en pleno duelo contra el jefe.
function handleBossStats(user) {
  const ms = state.modeState;
  const player = ms.players[user];
  const stats = playerEffectiveStats(ms, user);
  const speedPct = Math.round((1 - stats.speedMs / BOSS_ATK_SPEED_MS) * 100);
  const inBattle = ms.battle && ms.battle.player.user === user;
  // Fuera de combate se muestra la vida ACTUAL persistida (con la que
  // terminó su último duelo, o la curación pasiva recibida mientras
  // esperaba), no la vida máxima (ver ms.players[user].hp).
  const currentHp = inBattle ? ms.battle.player.hp : (typeof player.hp === 'number' ? player.hp : stats.maxHp);
  const hpText = `${Math.max(0, currentHp)}/${stats.maxHp}`;
  const available = bossLevelUpsAvailable(ms, player);
  const availableText = available > 0 ? ` · Mejoras pendientes: ${available}` : '';
  addChatMessage(null, `📊 @${user} (${player.pokemon.name}) · Nivel ${ms.bossLevel} · Ataque: ${stats.atk} · Vida: ${hpText} · Velocidad: ${speedPct}% más rápido que la base${availableText}`, 'system');
}

// Gestiona !ready: mientras el combatiente de "user" espera en su puesto
// (no es quien está luchando ni caminando hacia el jefe ahora mismo), su
// sprite reproduce una vez la animación "Attack" a modo de gesto de "estoy
// listo/preparado" — puramente cosmético, no consume turno ni afecta al
// combate de ninguna forma ("no tendrá mayor efecto"). Se reproduce siempre
// que "user" no sea el combatiente activo (ms.activeUser), tanto si hay un
// duelo en marcha contra otro combatiente como si NO hay ningún duelo
// activo y todos están esperando en su puesto (ms.activeUser es null en
// ese caso, así que la comprobación de abajo nunca lo bloquea).
function handleBossReady(user) {
  const ms = state.modeState;
  const fighter = ms.fighterSprites[user];
  if (ms.phase !== 'fight' || !fighter) {
    addChatMessage(null, `${user}: espera a que empiece el combate para usar !ready`, 'system', { mirror: false });
    return;
  }
  if (ms.activeUser === user) {
    addChatMessage(null, `${user}: tu Pokémon ya está luchando contra el jefe.`, 'system', { mirror: false });
    return;
  }
  // Un combatiente derrotado (0 de vida) está descansando con "Sleep": no
  // hace el gesto de "estoy listo", sigue durmiendo hasta que reviva.
  if (isFighterFainted(user)) {
    addChatMessage(null, `${user}: ${ms.players[user].pokemon.name} está descansando derrotado, no puede usar !ready hasta que reviva.`, 'system', { mirror: false });
    return;
  }
  fighter.sprite.play('Attack', PMD_DIR.down, false, () => {
    const cur = state.modeState && state.modeState.fighterSprites[user];
    // Solo retoma el "Walk" de espera si, mientras duraba el gesto, no ha
    // sido elegido para luchar (en ese caso ya está caminando hacia el
    // jefe con su propia animación, y no hay que interrumpirla) ni ha caído
    // derrotado por algún otro medio mientras tanto.
    if (cur && state.modeState.activeUser !== user) {
      playFighterRestAnim(user);
    }
  }, BOSS_ANIM_SPEED);
}

// Gestiona !habilidad1 / !habilidad2: cambia el tipo del ataque del
// combatiente de "user" (ver attackTypeIndex, leído en performDuelAttack)
// al tipo primario (!habilidad1, índice 0 de pokemon.types) o secundario
// (!habilidad2, índice 1). Solo tiene efecto si su Pokémon tiene dos tipos:
// si solo tiene uno, no hay tipo secundario entre el que elegir y el
// comando no hace nada (aparte de avisar en el chat). Igual que !ready
// (ver handleBossReady), solo se puede usar mientras el combatiente espera
// en su puesto: ni mientras lucha ni mientras camina de o hacia el jefe
// (ms.activeUser === user cubre ambos casos).
function handleBossAbility(user, cmd) {
  const ms = state.modeState;
  const player = ms.players[user];
  const types = (player.pokemon.types || []).filter(Boolean);
  if (types.length < 2) {
    addChatMessage(null, `${user}: ${player.pokemon.name} solo tiene un tipo, no puede cambiar el tipo de su ataque con ${cmd}.`, 'system');
    return;
  }
  const fighter = ms.fighterSprites[user];
  if (ms.phase !== 'fight' || !fighter) {
    addChatMessage(null, `${user}: espera a que empiece el combate para usar ${cmd}.`, 'system');
    return;
  }
  if (ms.activeUser === user) {
    addChatMessage(null, `${user}: no puedes cambiar el tipo de ataque de ${player.pokemon.name} mientras lucha o está de camino al jefe, espera a estar de nuevo en tu puesto.`, 'system');
    return;
  }
  const index = cmd === '!habilidad1' ? 0 : 1;
  const label = index === 0 ? 'primario' : 'secundario';
  if (player.attackTypeIndex === index) {
    addChatMessage(null, `${user}: ${player.pokemon.name} ya está usando su tipo ${label} (${types[index]}).`, 'system');
    return;
  }
  player.attackTypeIndex = index;
  addChatMessage(null, `🔄 ${user}: ${player.pokemon.name} cambia el tipo de su próximo ataque a ${types[index]} (tipo ${label}).`, 'correct');
}

/* ---------------------------------------------------------
   INICIO DEL COMBATE — cierra el lobby y monta la escena
   --------------------------------------------------------- */
function startBossFight() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  if (ms.order.length < 1) {
    toast('Se necesita al menos 1 combatiente para empezar');
    return;
  }
  // El lobby (y sus sprites PMD) deja de existir al pasar al combate: cada
  // combatiente ya tiene fijado su puesto interno desde que se apuntó (ver
  // handleBossJoin), sin haberlo visto representado en ningún momento del
  // lobby.
  Object.values(ms.lobbySprites).forEach(entry => { entry.sprite.destroy(); entry.el.remove(); });
  ms.lobbySprites = {};
  ms.phase = 'fight';
  // Música del nivel en el que arranca la partida (ver updateBossMusic):
  // ahora sí, al cerrarse el lobby de inscripción, empieza a sonar en
  // bucle la pista de ese nivel (fase 1, nunca la final en este punto).
  updateBossMusic(ms);
  renderBoss();
  scheduleBossTick();
  addChatMessage(null, ms.bossAfk
    ? `👹 ¡Comienza el combate contra ${bossDisplayName(ms)} con ${ms.order.length} combatientes! Modo AFK activo: el chat votará quién lucha primero.`
    : `👹 ¡Comienza el combate contra ${bossDisplayName(ms)} con ${ms.order.length} combatientes! El streamer elegirá con quién lucha primero.`, 'system', { mirror: false });
  maybeStartBossAfkChallengerVote();
}

// Color de fondo de cada chip de tipo en la ficha de combatiente (ver
// showBossFiche): mismos colores aproximados que usa la franquicia para
// cada tipo, uno por cada clave que puede aparecer en TYPE_CHART.
const BOSS_TYPE_COLORS = {
  'Normal': '#A8A878', 'Fuego': '#F08030', 'Agua': '#6890F0',
  'Eléctrico': '#F8D030', 'Planta': '#78C850', 'Hielo': '#98D8D8',
  'Lucha': '#C03028', 'Veneno': '#A040A0', 'Tierra': '#E0C068',
  'Volador': '#A890F0', 'Psíquico': '#F85888', 'Bicho': '#A8B820',
  'Roca': '#B8A038', 'Fantasma': '#705898', 'Dragón': '#7038F8',
  'Siniestro': '#705848', 'Acero': '#B8B8D0', 'Hada': '#EE99AC',
};

// Construye (o reutiliza) el elemento de la ficha de combatiente: se añade
// directamente a <body>, fuera de #boss-scene, para que su position:fixed
// no se vea afectado por el "container-type" de la escena, que crearía su
// propio contenedor de posicionamiento (ver el comentario de .boss-fiche
// en styles.css). Se guarda en ms.bossFicheEl para reutilizarlo mientras
// dure este Boss, y se limpia al salir del modo (ver backToMenu en
// modeLauncher.js).
function ensureBossFicheEl() {
  const ms = state.modeState;
  if (!ms) return null;
  if (ms.bossFicheEl && document.body.contains(ms.bossFicheEl)) return ms.bossFicheEl;
  const el = document.createElement('div');
  el.className = 'boss-fiche';
  el.id = 'boss-fiche';
  document.body.appendChild(el);
  ms.bossFicheEl = el;
  return el;
}

// Reubica la ficha dentro de la escena en pantalla completa (nativa o
// simulada), igual que relocateModal hace con el modal global (ver
// utils.js): al vivir por defecto colgada de <body>, si #boss-scene está
// en pantalla completa el navegador solo pinta lo que cuelga de esa
// escena, así que la ficha se queda invisible aunque tenga z-index alto.
// Se llama justo antes de cada showBossFiche para que también funcione si
// se entra o sale de pantalla completa con la ficha ya abierta.
function relocateBossFiche(el) {
  const target = currentFullscreenElement() || document.body;
  if (el.parentElement !== target) target.appendChild(el);
}

// Muestra, a la derecha de la pantalla, la ficha de `user`: su nombre de
// usuario, el Pokémon elegido, sus tipos y sus estadísticas (vida actual y
// máxima, ataque y velocidad). Solo se muestra si, ahora mismo, nadie está
// combatiendo ni de camino al duelo (ms.activeUser === null): en cuanto el
// streamer elige a alguien la ficha deja de poder consultarse (ver también
// hideBossFiche, llamada de inmediato al principio de selectChallenger).
// Se llama al pasar el cursor sobre un combatiente ya apuntado que esté
// esperando en su puesto (ver el mouseenter añadido en createFighterSprite).
function showBossFiche(user) {
  const ms = state.modeState;
  if (!ms || ms.activeUser) return;
  const p = ms.players[user];
  if (!p) return;
  const el = ensureBossFicheEl();
  if (!el) return;
  relocateBossFiche(el);
  const stats = playerEffectiveStats(ms, user);
  // Fuera de combate se muestra la vida ACTUAL persistida (con la que
  // terminó su último duelo, o la curación pasiva recibida mientras
  // esperaba), no la vida máxima — mismo criterio que !stats (ver
  // handleBossStats).
  const currentHp = Math.max(0, typeof p.hp === 'number' ? p.hp : stats.maxHp);
  const speedPct = Math.round((1 - stats.speedMs / BOSS_ATK_SPEED_MS) * 100);
  // Se resalta (ver .boss-fiche-type-chip.active en styles.css) el tipo con
  // el que atacará su próximo golpe (ver attackTypeIndex, cambiado con
  // !habilidad1/!habilidad2 en handleBossAbility): el primario salvo que
  // haya un segundo tipo y lo haya elegido explícitamente.
  const activeTypeIdx = p.attackTypeIndex === 1 && p.pokemon.types[1] ? 1 : 0;
  const typesHtml = p.pokemon.types.map((t, i) => {
    const color = BOSS_TYPE_COLORS[t] || '#888';
    const activeClass = i === activeTypeIdx ? ' active' : '';
    return `<span class="boss-fiche-type-chip${activeClass}" style="background:${color}">${escapeHtml(t)}</span>`;
  }).join('');
  // Barra de vida: mismo criterio de color que updateDuelHP (verde por
  // defecto, amarillo al 50% o menos, rojo al 25% o menos), reutilizando
  // las clases .hp-bar/.hp-bar-fill ya usadas en el resto del modo.
  const hpPct = Math.max(0, Math.min(100, (currentHp / stats.maxHp) * 100));
  const hpColorClass = hpPct <= 25 ? ' low' : hpPct <= 50 ? ' mid' : '';
  // Mejoras de !levelup que le quedan por elegir en el nivel actual (ver
  // bossLevelUpsAvailable): si no le queda ninguna, no se muestra esa fila,
  // para no ensuciar la ficha con un "0" permanente la mayor parte del nivel.
  const available = bossLevelUpsAvailable(ms, p);
  const availableRow = available > 0
    ? `<div class="boss-fiche-stat-row"><span>🔧 Mejoras pendientes</span><b>${available}</b></div>`
    : '';
  // Objeto equipado (ver BOSS_ITEMS/assignBossItem): se omite la fila si no
  // lleva ninguno.
  const equippedItem = p.itemId && bossItemById(p.itemId);
  const itemRow = equippedItem
    ? `<div class="boss-fiche-stat-row"><span>🎒 Objeto</span><b>${bossItemIconHtml(equippedItem, 16)} ${escapeHtml(equippedItem.name)}</b></div>`
    : '';
  el.innerHTML = `
    <div class="boss-fiche-user">@${escapeHtml(user)}</div>
    <div class="boss-fiche-pokemon">${escapeHtml(p.pokemon.name)}</div>
    <div class="boss-fiche-types">${typesHtml}</div>
    <div class="boss-fiche-hp-bar hp-bar"><div class="hp-bar-fill${hpColorClass}" style="width:${hpPct}%"></div></div>
    <div class="boss-fiche-stat-row"><span>🏅 Nivel</span><b>${ms.bossLevel}</b></div>
    <div class="boss-fiche-stat-row"><span>❤️ Vida</span><b>${currentHp} / ${stats.maxHp}</b></div>
    <div class="boss-fiche-stat-row"><span>⚔️ Ataque</span><b>${stats.atk}</b></div>
    <div class="boss-fiche-stat-row"><span>⚡ Velocidad</span><b>${speedPct > 0 ? `+${speedPct}%` : 'Base'}</b></div>
    ${itemRow}
    ${availableRow}
  `;
  el.classList.add('visible');
}

// Oculta la ficha (si estaba visible): al dejar de pasar el cursor sobre un
// combatiente, o de inmediato en cuanto el streamer elige a alguien para
// luchar (ver selectChallenger), momento en que deja de tener sentido
// seguir consultando fichas.
function hideBossFiche() {
  const ms = state.modeState;
  if (ms && ms.bossFicheEl) ms.bossFicheEl.classList.remove('visible');
}

// Misma ficha que showBossFiche, pero para el Pokémon RIVAL (el jefe, o el
// segundo jefe en la fase final con dos a la vez): se llama al pasar el
// cursor sobre su tarjeta de nombre (#boss-name-text/#boss-name-text-2, ver
// el mouseenter añadido en renderBoss/ensureBossZone2). A diferencia de la
// ficha de un aliado, aquí NUNCA se marca ningún tipo como "activo": el
// concepto de tipo de ataque seleccionado (ver attackTypeIndex/
// !habilidad1/!habilidad2) es exclusivo de los combatientes aliados, el
// jefe no elige tipo de ataque, así que todos sus chips de tipo se pintan
// iguales, sin resaltar. Por lo demás, siempre puede consultarse (a
// diferencia de showBossFiche, no depende de que nadie esté combatiendo
// ahora mismo: el jefe está siempre en pantalla, duelo en marcha o no).
function showBossEnemyFiche(boss) {
  const ms = state.modeState;
  if (!ms || !boss) return;
  const el = ensureBossFicheEl();
  if (!el) return;
  relocateBossFiche(el);
  const stats = bossEffectiveStats(ms);
  const speedPct = Math.round((1 - stats.speedMs / BOSS_ATK_SPEED_MS) * 100);
  // Sin la clase "active" (ver el comentario de la función): pero, para que
  // eso no deje TODOS los chips atenuados a la vez (.boss-fiche-type-chip
  // sin "active" tiene opacity:.55 por defecto en styles.css, pensado para
  // dejar solo uno resaltado), se fuerza aquí opacidad plena por estilo en
  // línea — ninguno debe verse ni más ni menos destacado que el resto.
  const typesHtml = (boss.types || []).map((t) => {
    const color = BOSS_TYPE_COLORS[t] || '#888';
    return `<span class="boss-fiche-type-chip" style="background:${color};opacity:1">${escapeHtml(t)}</span>`;
  }).join('');
  const hpPct = Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100));
  const hpColorClass = hpPct <= 25 ? ' low' : hpPct <= 50 ? ' mid' : '';
  el.innerHTML = `
    <div class="boss-fiche-pokemon">${escapeHtml(boss.name)}</div>
    <div class="boss-fiche-types">${typesHtml}</div>
    <div class="boss-fiche-hp-bar hp-bar"><div class="hp-bar-fill${hpColorClass}" style="width:${hpPct}%"></div></div>
    <div class="boss-fiche-stat-row"><span>🏅 Nivel</span><b>${ms.bossLevel}</b></div>
    <div class="boss-fiche-stat-row"><span>❤️ Vida</span><b>${boss.currentHp} / ${boss.maxHp}</b></div>
    <div class="boss-fiche-stat-row"><span>⚔️ Ataque</span><b>${boss.atk}</b></div>
    <div class="boss-fiche-stat-row"><span>⚡ Velocidad</span><b>${speedPct > 0 ? `+${speedPct}%` : 'Base'}</b></div>
  `;
  el.classList.add('visible');
}

// Aplica el ajuste fino de altura/escala (ver BOSS_SPRITE_ADJUSTMENTS en
// bossSpriteAdjustmentsDb.js) al sprite de un jefe concreto, por dex: se
// fija como custom properties CSS sobre el propio contenedor (#boss-sprite
// o #boss-sprite-2, un .pmd-slot), que heredan hasta su .pmd-frame hijo
// (ver .boss-sprite.pmd-slot .pmd-frame / .boss-sprite.enemy-normal-size.
// pmd-slot .pmd-frame en styles.css: ahí es donde --boss-offset-y se usa
// como margin-top y --boss-scale-adj multiplica la escala base del jefe).
// Un dex sin entrada propia en la tabla deja ambas custom properties a sus
// valores neutros (0px / 1), sin efecto visible alguno.
// `scaleOverride`, si se pasa, sustituye al scaleAdj propio de `dexId` (ver
// startBossMidfightTransform, que lo usa para conservar la escala que ya
// tenía el jefe antes de transformarse en vez de recalcularla para la
// forma de destino).
function applyBossSpriteAdjustment(spriteEl, dexId, scaleOverride) {
  if (!spriteEl) return;
  const { offsetY, scaleAdj } = getBossSpriteAdjustment(dexId);
  spriteEl.style.setProperty('--boss-offset-y', offsetY + 'px');
  spriteEl.style.setProperty('--boss-scale-adj', scaleOverride != null ? scaleOverride : scaleAdj);
}

// Muestra u oculta el cartel de comandos de la fase 1 (ver
// #boss-commands-banner en renderBoss) según toque en cada momento:
// visible mientras ms.bossStage === 1 y todavía no se ha elegido a nadie
// para luchar (!ms.bossChangesLocked, mismo criterio que bossChangesAllowed
// salvo por la fase 'lobby', que no aplica aquí porque este cartel solo
// vive dentro de la pantalla de combate). Se llama al montar la escena
// (renderBoss), cada vez que aparece un enemigo nuevo (spawnNewBoss) y en
// cuanto se bloquean los cambios al elegir al primer combatiente
// (selectChallenger).
function updateBossCommandsBanner() {
  const ms = state.modeState;
  const banner = $('boss-commands-banner');
  if (!ms || !banner) return;
  banner.style.display = (ms.bossStage === 1 && !ms.bossChangesLocked) ? 'flex' : 'none';
}

// Sprite pixel-art del cofre del botón de recompensa (ver
// .boss-chest-overlay más abajo): sustituye al antiguo emoji 🎁, que
// desentonaba con el resto de iconos pixelados de la interfaz. Se dibuja
// en dos piezas -cuerpo fijo y tapa (#boss-chest-lid)- para poder animar
// solo la tapa al abrirse (ver .boss-chest-sprite.is-opening en
// styles.css y el onclick del botón, más abajo), más un destello dorado
// (.boss-chest-burst) que aparece detrás en ese mismo instante.
const BOSS_CHEST_SPRITE_SVG = `
  <svg viewBox="0 0 68 60" xmlns="http://www.w3.org/2000/svg">
    <g class="boss-chest-burst">
      <circle cx="34" cy="27" r="22" fill="var(--yellow)" opacity=".35" />
      <g stroke="var(--yellow)" stroke-width="3" stroke-linecap="round">
        <line x1="34" y1="2" x2="34" y2="-6" />
        <line x1="34" y1="52" x2="34" y2="60" />
        <line x1="9" y1="27" x2="1" y2="27" />
        <line x1="59" y1="27" x2="67" y2="27" />
        <line x1="16" y1="9" x2="10" y2="3" />
        <line x1="52" y1="9" x2="58" y2="3" />
        <line x1="16" y1="45" x2="10" y2="51" />
        <line x1="52" y1="45" x2="58" y2="51" />
      </g>
    </g>
    <!-- Cuerpo: no se anima, solo la tapa. -->
    <rect x="6" y="30" width="56" height="24" rx="4" fill="#8B4A1F" stroke="#4E2A10" stroke-width="2" />
    <rect x="6" y="30" width="56" height="24" rx="4" fill="none" stroke="#4E2A10" stroke-width="1" opacity=".5" />
    <line x1="20" y1="31" x2="20" y2="53" stroke="#4E2A10" stroke-width="2" opacity=".6" />
    <line x1="48" y1="31" x2="48" y2="53" stroke="#4E2A10" stroke-width="2" opacity=".6" />
    <rect x="6" y="38" width="56" height="7" fill="var(--yellow)" stroke="#4E2A10" stroke-width="1.5" />
    <rect x="29" y="36" width="10" height="11" rx="2" fill="#4E2A10" />
    <circle cx="34" cy="41" r="2" fill="var(--yellow)" />
    <!-- Tapa: gira desde su borde trasero (ver transform-origin en CSS)
         al añadirse la clase .is-opening al contenedor. -->
    <g id="boss-chest-lid">
      <path d="M4 30 C4 16, 12 6, 34 6 C56 6, 64 16, 64 30 Z" fill="#A5651F" stroke="#4E2A10" stroke-width="2" />
      <rect x="4" y="24" width="60" height="7" rx="2" fill="var(--yellow)" stroke="#4E2A10" stroke-width="1.5" />
    </g>
  </svg>
`;

function renderBoss() {
  const content = $('game-content');
  const ms = state.modeState;
  const b = ms.boss;
  content.innerHTML = `
    <div class="boss-wrap">
      <div class="boss-scene game-scene" id="boss-scene">
        <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <!-- Botón de objetos, justo a la derecha del de pantalla completa:
             abre el panel para asignar a cada combatiente el objeto que
             lleve equipado (ver openBossItemsPanel), de entre los que haya
             en el almacén (ver ms.itemsInventory, alimentado por los
             cofres — ver más abajo). -->
        <button class="boss-items-btn" id="boss-items-btn" title="Objetos" aria-label="Objetos">
          🎒<span class="boss-items-badge" id="boss-items-badge" style="display:none;"></span>
        </button>
        <!-- Overlay del cofre: solo visible mientras haya al menos uno
             pendiente de abrir (ver ms.chestsAvailable, que sube al
             derrotar al jefe de la fase 10 o de la fase final de cada
             nivel — ver bossDefeated). Cubre toda la escena y centra un
             botón grande y llamativo: mientras está visible, el combate
             está en pausa (ver ms.phase === 'chestPause') y no hay forma
             de seguir jugando sin pulsarlo y elegir un objeto (ver
             openBossItemsPanel/resolveBossChestChosen). -->
        <div class="boss-chest-overlay" id="boss-chest-overlay" style="display:none;">
          <button class="boss-chest-btn" id="boss-chest-btn" title="Abrir cofre" aria-label="Abrir cofre">
            <span class="boss-chest-sprite" id="boss-chest-sprite">${BOSS_CHEST_SPRITE_SVG}</span>
            <span class="boss-chest-badge" id="boss-chest-badge"></span>
            <span class="boss-chest-btn-label">¡Cofre conseguido!<br>Elige un objeto para continuar</span>
          </button>
        </div>
        <!-- Indicador "Nivel X · Fase Y/10", centrado en la parte superior
             de la pantalla de juego (#boss-scene) (el cartel de comandos de
             la fase 1 vive aparte, anclado a la esquina superior derecha,
             ver más abajo). Vive FUERA de #boss-map-inner para quedarse
             fijo en su sitio durante el zoom de cámara de la llegada del
             jefe de la fase final (ver bossZoomCameraTo más abajo). -->
        <div class="boss-top-banners">
          <!-- Indicador de nivel + barra de fases (ver renderBossPhaseMarksHtml/
               updateBossLevelText más abajo): el nivel se muestra como texto
               al principio, antes de la propia barra, y la barra dibuja las
               15 fases del nivel como 15 marcas individuales (más grandes en
               la 10 y, todavía más, en la 15 -final del nivel-), coloreando
               las ya superadas y resaltando en la que se está jugando ahora
               mismo. -->
          <div class="boss-level-banner" id="boss-level-text">
            <div class="boss-level-banner-main">
              <div class="boss-level-banner-top">
                <span>Nivel <b id="boss-level-num">${ms.bossLevel}</b></span>
              </div>
              <div class="boss-phase-track" id="boss-phase-track">${renderBossPhaseMarksHtml(ms.bossStage)}</div>
            </div>
          </div>
        </div>
        <!-- Cartel de comandos de la fase 1 de cada nivel: recuerda a los
             combatientes que todavía pueden cambiar de Pokémon (!pokemon
             [nombre]) y cómo repartir las mejoras de estadística (!levelup
             ataque/vida/velocidad), ya que ambas cosas siguen admitidas
             mientras dura la fase 1 (ver bossChangesAllowed en boss.js),
             incluso con el combate ya en marcha. Se muestra/oculta con
             updateBossCommandsBanner (ver ahí y selectChallenger, que la
             oculta en cuanto se elige al primer combatiente de la fase).
             Arranca oculto: se decide su visibilidad real justo después de
             montar esta plantilla, más abajo en esta misma función. Vive
             FUERA de .boss-top-banners (aunque comparte con él el mismo
             lenguaje visual), como elemento propio anclado a la esquina
             superior derecha de la escena -ver .boss-commands-banner en
             styles.css-, en vez de apilado bajo el indicador de nivel. -->
        <div class="boss-commands-banner" id="boss-commands-banner" style="display:none;">
          <span class="boss-commands-banner-item"><b>!pokemon [nombre]</b><br>cambia de Pokémon</span>
          <span class="boss-commands-banner-item"><b>!levelup ataque/vida/velocidad</b><br>mejora atributos (o !levelup info)</span>
        </div>
        <!-- Capa que escala durante el zoom de cámara de la llegada del
             jefe de la fase final (ver bossZoomCameraTo/bossResetCameraZoom):
             aloja el fondo del mapa, la zona del jefe y los sprites PMD de
             los combatientes (ver createFighterSprite, que los cuelga de
             aquí), todo lo que debe acercarse/alejarse junto y en la misma
             proporción, como si de verdad fuera la cámara la que se
             moviera (ver comentario junto a .boss-map-inner en
             styles.css). -->
        <div class="boss-map-inner" id="boss-map-inner">
          <!-- Punto donde se coloca al enemigo (por ahora, el jefe), fijo en
               BOSS_ENEMY_SPOT, con su propio sprite PMD animado
               (Walk/Attack/Hurt), igual que en el Coliseo del modo Arena. -->
          <div class="boss-enemies-zone${isFinalStage(ms) ? ' boss-enemy-large' : ''}" id="boss-enemies-zone" style="left:${BOSS_ENEMY_SPOT.x}%;top:${BOSS_ENEMY_SPOT.y}%;">
            <!-- Barra de vida y nombre del enemigo, flotando DEBAJO de su
                 sprite — mismo criterio visual que los luchadores aliados
                 en camino/luchando (ver .boss-fighter-hpwrap/
                 .boss-fighter-name), pero siempre visibles (no solo
                 mientras dura un duelo): la barra queda pegada al sprite,
                 el nombre justo debajo de ella. -->
            <div class="boss-enemy-info">
              <div class="boss-enemy-hpwrap"><div class="boss-enemy-hpfill" id="boss-hp-fill" style="width:100%"></div></div>
              <div class="boss-enemy-name" id="boss-name-text">${escapeHtml(b.name)}</div>
            </div>
            <!-- El tamaño del sprite depende de la fase: normal en las 9
                 primeras fases de cada nivel, y grande (sin la clase
                 "enemy-normal-size", ver styles.css) en la fase final (ver
                 isFinalStage) — se alterna con classList.toggle cada vez que
                 aparece un enemigo nuevo (ver spawnNewBoss). -->
            <div class="pmd-slot boss-sprite${isFinalStage(ms) ? '' : ' enemy-normal-size'}" id="boss-sprite"></div>
          </div>
          <!-- Los sprites PMD de los combatientes (uno por cada uno, creados
               más abajo) se insertan aquí dentro dinámicamente: cada uno
               espera, animado (Walk en bucle), plantado en su propio puesto
               (BOSS_PLAYER_SLOTS) desde que empieza el combate, y es ese mismo
               sprite el que recorre BOSS_WALK_PATH cuando el streamer lo elige
               (ver selectChallenger) — nunca aparece de repente ni se sustituye
               por otro elemento. -->
        </div>
        <!-- El panel inferior del duelo 1 vs 1 (nombre, vida, "VS"...) se
             ha eliminado por completo: ya no debe mostrar nada mientras
             dura el combate. Lo único que sigue indicando quién lucha
             ahora mismo es la clase "in-duel" sobre el sprite del propio
             combatiente activo (ver renderDuelPanel más abajo), que le
             muestra su barra de vida flotante encima, en el mapa. -->

        <!-- Fundido a negro de la transición al nivel siguiente (ver
             runBossLevelTransition): se queda montado, oculto (sin la
             clase "show"), durante toda la partida, y se reutiliza en cada
             subida de nivel — nunca se recrea. -->
        <div class="boss-level-fade-overlay" id="boss-level-fade-overlay"></div>
        <!-- Tabla de próximos turnos: quién va a atacar (combatiente
             activo o jefe) en los próximos BOSS_TURN_QUEUE_SIZE turnos del
             duelo en curso (ver predictBossTurnOrder/updateBossTurnQueue).
             Vive en la esquina inferior derecha de la escena, oculta por
             completo mientras no haya un duelo activo. Se recalcula desde
             cero con cada golpe (ver performDuelAttack) y con cada cambio
             de combatiente/derrota (ver renderDuelPanel, que la actualiza
             en los mismos puntos en que ya se llama). -->
        <div class="boss-turn-queue" id="boss-turn-queue" style="display:none;">
          <div class="boss-turn-queue-title">⏱️ Próximos turnos</div>
          <div class="boss-turn-queue-list" id="boss-turn-queue-list"></div>
        </div>
        <!-- Panel de cambio de Pokémon al principio de la fase 1 de cada
             nivel (ver ms.phase === 'levelSelect', showBossLevelSelectPanel/
             advanceBossLevelSelect): oculto casi toda la partida, se
             muestra justo al llegar a un nivel nuevo (ver spawnNewBoss) y
             desaparece en cuanto el streamer pulsa "Avanzar". Mientras está
             visible el combate está en pausa (ver selectChallenger/
             bossAutoTick, que comprueban ms.phase === 'fight') y los
             combatientes ya apuntados pueden cambiar de Pokémon con
             !pokemon [nombre] (ver handleBossJoin), viéndose el cambio al
             instante en su sprite ya plantado en el mapa, detrás de este
             mismo panel. Pulsar "Avanzar" YA NO cierra esa ventana de
             cambios (ver bossChangesAllowed): solo reanuda el combate; los
             cambios de Pokémon siguen admitidos hasta que el streamer
             elija a su primer combatiente (ver selectChallenger, que es
             quien de verdad los bloquea). Los objetos, a diferencia de los
             Pokémon, no dependen para nada de esta ventana: se pueden
             asignar en cualquier momento de la partida (ver
             assignBossItem/openBossItemsPanel). -->
        <div class="boss-levelselect-panel" id="boss-levelselect-panel" style="display:none;">
          <div class="boss-levelselect-box">
            <div class="boss-levelselect-title" id="boss-levelselect-title">Fase 1</div>
            <div class="boss-levelselect-text">Los combatientes ya apuntados pueden cambiar de Pokémon escribiendo <b>!pokemon [nombre]</b> en el chat. Sigue siendo posible tras pulsar "Avanzar", hasta elegir al primer combatiente. Los objetos 🎒 pueden asignarse en cualquier momento pero sólo se pueden desequipar en esta ronda.</div>
            <button class="boss-start-btn" id="boss-levelselect-advance-btn">▶ Avanzar</button>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="ranking-panel" id="boss-ranking">
          <div class="ranking-title">🏆 Top Daño</div>
        </div>
        <div class="ranking-panel">
          <div class="ranking-title">⚔️ Combatientes</div>
          <div style="font-size:12px;color:var(--muted);">${ms.order.length} apuntados, listos en el mapa</div>
        </div>
      </div>
    </div>
  `;
  ms.bossSprite = new PMDSprite($('boss-sprite'), getPokemonSprite(b.sprite), { uncapped: true });
  ms.bossSprite.setDex(b.sprite);
  applyBossSpriteAdjustment($('boss-sprite'), b.sprite);
  // El jefe está en el lado derecho del mapa, mirando hacia la izquierda
  // (hacia el combatiente): misma dirección que un campeón "right" del
  // Coliseo del modo Arena.
  ms.bossSprite.play('Walk', arenaDirectionFor('right'), true, null, BOSS_ANIM_SPEED);
  // El sprite PMD de cada combatiente apuntado se crea aquí, una sola vez,
  // ya esperando (Walk en bucle) en su propio puesto fijo del mapa: no hay
  // que apuntarse de nuevo a nada ni esperar a que aparezca de golpe cuando
  // le toque luchar (ver createFighterSprite y selectChallenger).
  ms.order.forEach((user, i) => createFighterSprite(user, i));
  // Fondo del mapa según el nivel actual (ver updateBossMapBackground):
  // hace falta fijarlo aquí también, no solo en updateBossLevelText, ya
  // que esta función (renderBoss) recrea #boss-map-inner desde cero cada
  // vez que entra en la pantalla del modo Boss, así que cualquier custom
  // property que se hubiera fijado sobre el elemento anterior se pierde
  // junto con él.
  updateBossMapBackground();
  renderBossRanking();
  renderBossPlayersZone();
  renderDuelPanel();
  updateBossCommandsBanner();

  // Tarjeta de nombre del jefe: al pasar el cursor por encima muestra su
  // ficha (Pokémon, tipos y estadísticas — ver showBossEnemyFiche), igual
  // que ocurre con la de cada combatiente aliado (ver createFighterSprite).
  // Se lee ms.boss en el momento del propio hover (no se captura aquí una
  // referencia fija) para que siga funcionando después de que spawnNewBoss
  // sustituya al jefe derrotado por otro nuevo, ya que este mismo elemento
  // de nombre se reutiliza sin recrearse en cada aparición.
  const bossNameEl = $('boss-name-text');
  if (bossNameEl) {
    bossNameEl.onmouseenter = () => showBossEnemyFiche(state.modeState && state.modeState.boss);
    bossNameEl.onmouseleave = () => hideBossFiche();
  }

  const itemsBtn = $('boss-items-btn');
  if (itemsBtn) itemsBtn.onclick = () => openBossItemsPanel();
  const chestBtn = $('boss-chest-btn');
  if (chestBtn) {
    // Antes abría el modal de golpe al pulsar; ahora se ve primero la
    // tapa abrirse y el destello (ver .boss-chest-sprite.is-opening en
    // styles.css) y solo cuando esa animación casi termina se muestran
    // las 3 opciones. Se bloquea el botón mientras tanto para que no se
    // pueda relanzar la animación a media apertura con un doble clic.
    chestBtn.onclick = () => {
      if (chestBtn.disabled) return;
      const sprite = $('boss-chest-sprite');
      chestBtn.disabled = true;
      if (sprite) sprite.classList.add('is-opening');
      setTimeout(() => {
        chestBtn.disabled = false;
        openBossChestModal();
      }, 420);
    };
  }
  const levelSelectAdvanceBtn = $('boss-levelselect-advance-btn');
  if (levelSelectAdvanceBtn) levelSelectAdvanceBtn.onclick = () => advanceBossLevelSelect();
  updateBossItemsBadge();
  updateBossChestButton();
}

// Crea el sprite PMD (Walk/Attack/Hurt) de un combatiente en su puesto fijo
// del mapa (BOSS_PLAYER_SLOTS[slotIndex]), reproduciendo su animación
// "Walk" en bucle de entrada. Se llama una sola vez por combatiente, al
// montar la escena de combate: a partir de aquí, ese mismo elemento y ese
// mismo PMDSprite son los que se mueven por el mapa (ver
// walkFighterAlong/selectChallenger) durante todo el Boss, sin destruirse
// ni recrearse nunca.
function createFighterSprite(user, slotIndex) {
  const ms = state.modeState;
  // Cuelga de #boss-map-inner (no directamente de #boss-scene): así el
  // sprite del combatiente se acerca/aleja junto con el jefe y el fondo
  // durante el zoom de cámara de la llegada de la fase final (ver
  // bossZoomCameraTo), en vez de quedarse fijo como los botones o el
  // indicador de nivel/fase.
  const scene = $('boss-map-inner');
  const p = ms.players[user];
  const spot = BOSS_PLAYER_SLOTS[slotIndex];
  if (!scene || !p || !spot) return;
  const el = document.createElement('div');
  // Empieza "pegado al suelo": mientras espera turno se ignora el atributo
  // volador/levitador de su Pokémon (ver setFighterGrounded más abajo), aunque
  // sea un Rayquaza o un Zapdos.
  el.className = 'boss-fighter-sprite pmd-slot boss-fighter-grounded';
  el.style.left = spot.x + '%';
  el.style.top = spot.y + '%';
  scene.appendChild(el);
  const sprite = new PMDSprite(el, getPokemonSprite(p.pokemon.sprite), { uncapped: true });
  sprite.setDex(p.pokemon.sprite, p.pokemon.isShiny);
  // Normalmente empieza en "Walk" (esperando turno); si por lo que sea ya
  // estuviera derrotado (0 de vida) al crearse su sprite, arranca
  // directamente "dormido" (ver playFighterRestAnim más abajo).
  sprite.play(typeof p.hp === 'number' && p.hp <= 0 ? 'Sleep' : 'Walk', PMD_DIR.down, true, null, BOSS_ANIM_SPEED);

  // Etiqueta con el nombre de usuario: hija del propio sprite (así viaja
  // con él, sin ningún seguimiento de posición aparte, ver
  // walkFighterAlong). Por defecto se ve por encima del sprite mientras
  // espera turno; en cuanto se le llama a luchar pasa a verse por debajo
  // (ver la clase "active", que ya se alterna en renderBossPlayersZone, y
  // su CSS en .boss-fighter-sprite.active .boss-fighter-name). Es esta
  // misma etiqueta, y solo ella, la que es clicable y muestra la ficha al
  // pasar el cursor (ver más abajo): el sprite PMD del Pokémon en sí nunca
  // reacciona al cursor.
  const nameEl = document.createElement('div');
  nameEl.className = 'boss-fighter-name';
  nameEl.textContent = '@' + user;
  // La propia etiqueta del nombre ES la "tarjeta" clicable del
  // combatiente (ver estilo en .boss-fighter-name en styles.css): el
  // sprite PMD en sí NO reacciona ni al clic ni al cursor (sigue con
  // pointer-events:none, ver .boss-fighter-sprite), solo esta pastilla
  // con su nombre. Un clic elige a este combatiente para el duelo 1 vs 1
  // (ver selectChallenger); pasar el cursor por encima muestra su ficha
  // (nombre, Pokémon, tipos y estadísticas — ver showBossFiche), que ya
  // comprueba por su cuenta que nadie esté combatiendo ni de camino al
  // duelo ahora mismo.
  nameEl.title = `@${user} · ${p.pokemon.name} — clic para que luche contra el jefe`;
  nameEl.onclick = () => selectChallenger(user);
  nameEl.onmouseenter = () => showBossFiche(user);
  nameEl.onmouseleave = () => hideBossFiche();
  el.appendChild(nameEl);

  // Barra de vida flotante: también hija del sprite, oculta por defecto y
  // solo visible mientras este combatiente está realmente peleando contra
  // el jefe (clase "in-duel", ver renderDuelPanel/updateDuelHP más abajo).
  const hpWrapEl = document.createElement('div');
  hpWrapEl.className = 'boss-fighter-hpwrap';
  const hpFillEl = document.createElement('div');
  hpFillEl.className = 'boss-fighter-hpfill';
  hpWrapEl.appendChild(hpFillEl);
  el.appendChild(hpWrapEl);

  ms.fighterSprites[user] = { el, sprite, slotIndex, atCombat: false, moveToken: 0, walkTimer: null, nameEl, hpFillEl };
  // Deja la barra de vida ya con el ancho/color correctos desde el primer
  // frame (no solo al cambiar más tarde su vida): imprescindible para los
  // combatientes que llegan a un nivel ya avanzado (con vida persistida
  // por debajo del máximo) o ya derrotados, ver updateWaitingFighterHP.
  updateWaitingFighterHP(user);
}

// Activa o desactiva el estado "pegado al suelo" de un combatiente: con
// `grounded` en true se ignora el atributo volador/levitador de su Pokémon
// (aunque sea de tipo Volador) y se ve apoyado en el suelo como el resto,
// tal y como debe verse mientras espera turno en su puesto; con `grounded`
// en false se aplica su vuelo real (ver .boss-fighter-sprite.pmd-flying en
// styles.css), que es como debe verse en cuanto se le elige para luchar y
// mientras dura el trayecto (ida y vuelta) y el propio duelo.
function setFighterGrounded(user, grounded) {
  const ms = state.modeState;
  const entry = ms && ms.fighterSprites[user];
  if (!entry) return;
  entry.el.classList.toggle('boss-fighter-grounded', grounded);
}

// Indica si el Pokémon de `user` está derrotado (0 de vida) ahora mismo:
// mientras lo está, no puede volver a ser elegido para luchar (ver el
// aviso en selectChallenger) y su sprite descansa reproduciendo "Sleep" en
// vez de su "Walk" habitual (ver playFighterRestAnim), hasta que revive de
// golpe al caer el jefe de la fase final del nivel (ver bossDefeated).
function isFighterFainted(user) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  return !!(p && typeof p.hp === 'number' && p.hp <= 0);
}

// Reproduce, en bucle, la animación de espera que le toca al sprite de
// `user` según si está derrotado o no ahora mismo: "Sleep" (repositorio
// PMD) mientras descansa con 0 de vida en su propio puesto fijo —que ya
// cae en la mitad izquierda del mapa, ver BOSS_PLAYER_SLOTS—, o su "Walk"
// normal en caso contrario. Se llama tanto al llegar de vuelta a su puesto
// (ver sendFighterHome) como, de golpe para todos los que despiertan a la
// vez, al derrotarse el jefe de la fase final del nivel (ver bossDefeated).
function playFighterRestAnim(user) {
  const ms = state.modeState;
  const entry = ms && ms.fighterSprites[user];
  if (!entry) return;
  entry.sprite.play(isFighterFainted(user) ? 'Sleep' : 'Walk', PMD_DIR.down, true, null, BOSS_ANIM_SPEED);
}

// Actualiza, para cada combatiente apuntado, si su sprite debe verse
// marcado como "activo" (ms.activeUser === user): controla tanto el
// resplandor amarillo del sprite como que su nombre se muestre encima o
// debajo de él (ver .boss-fighter-sprite.active en styles.css). El clic y
// el hover para elegir combatiente NO se gestionan aquí: la propia
// etiqueta del nombre de cada uno ya lleva sus manejadores fijados una
// sola vez al crearse (ver createFighterSprite), así que esta función solo
// hace ese pequeño ajuste visual cada vez que cambia quién está luchando.
function renderBossPlayersZone() {
  const ms = state.modeState;
  if (!ms) return;
  ms.order.forEach(user => {
    const fighter = ms.fighterSprites[user];
    if (fighter) fighter.el.classList.toggle('active', ms.activeUser === user);
  });
}

function renderBossRanking() {
  const el = $('boss-ranking');
  if (!el) return;
  const players = Object.entries(state.modeState.players)
    .map(([u,p]) => ({ user: u, dmg: p.dmg }))
    .sort((a,b) => b.dmg - a.dmg)
    .slice(0, 10);
  el.innerHTML = '<div class="ranking-title">🏆 Top Daño</div>';
  if (players.length === 0) {
    el.innerHTML += '<p style="font-size:12px;color:var(--muted);text-align:center;padding:10px;">Sin datos</p>';
    return;
  }
  players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'ranking-row' + (i === 0 ? ' gold' : i === 1 ? ' silver' : i === 2 ? ' bronze' : '');
    row.innerHTML = `
      <span class="ranking-pos">${i+1}</span>
      <span class="ranking-name">@${escapeHtml(p.user)}</span>
      <span class="ranking-score">${p.dmg} dmg</span>
    `;
    el.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// OBJETOS — panel de asignación (botón 🎒, junto al de pantalla completa) y
// cofres de recompensa (botón 🎁, tras derrotar al jefe de la fase 10 o de
// la fase final de cada nivel). Ver BOSS_ITEMS (js/data/bossItemsDb.js)
// para el catálogo y sus efectos, aplicados en playerEffectiveStats (los
// que son estadísticas fijas) y en performDuelAttack (el resto, efectos
// por turno).
// ---------------------------------------------------------------------

// Refresca la burbuja con el total de objetos en el almacén sin asignar
// (ver ms.itemsInventory), sobre el propio botón de objetos: oculta si no
// hay ninguno.
function updateBossItemsBadge() {
  const ms = state.modeState;
  const badge = $('boss-items-badge');
  if (!ms || !badge) return;
  const total = Object.values(ms.itemsInventory || {}).reduce((a, n) => a + n, 0);
  badge.textContent = total > 0 ? String(total) : '';
  badge.style.display = total > 0 ? 'flex' : 'none';
}

// Muestra u oculta el overlay del cofre según queden pendientes de abrir
// (ver ms.chestsAvailable): a diferencia del resto de botones de la
// escena, este vive dentro de un overlay a pantalla completa (ver
// .boss-chest-overlay en styles.css) para que sea imposible ignorarlo — el
// combate ya está en pausa (ver ms.phase === 'chestPause') mientras esté
// visible.
function updateBossChestButton() {
  const ms = state.modeState;
  const overlay = $('boss-chest-overlay');
  const badge = $('boss-chest-badge');
  if (!ms || !overlay) return;
  const n = ms.chestsAvailable || 0;
  overlay.style.display = n > 0 ? 'flex' : 'none';
  if (badge) badge.textContent = n > 1 ? String(n) : '';
  // Deja la tapa cerrada de nuevo (ver .is-opening en styles.css): tanto
  // si el overlay se acaba de ocultar como si reaparece para un cofre
  // siguiente, el sprite no debe heredar la tapa abierta del anterior.
  const sprite = $('boss-chest-sprite');
  if (sprite) sprite.classList.remove('is-opening');
}

// Asigna el objeto equipado de `user`. Si todavía no lleva ninguno, pasar
// de "sin objeto" a "con objeto" se admite en CUALQUIER momento de la
// partida, sin ninguna ventana que lo restrinja: ni siquiera depende de
// bossChangesAllowed/ms.bossChangesLocked. Si YA lleva uno puesto, en
// cambio, quitárselo (itemId falsy) o cambiárselo por otro solo se admite
// durante la fase 1 del nivel (mismo criterio y misma ventana que los
// cambios de Pokémon, ver bossChangesAllowed): fuera de esa ventana la
// asignación sigue siendo definitiva y la petición se ignora entera. Se
// llama desde el panel de objetos (elección manual del streamer).
function assignBossItem(user, itemId) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;
  const prevId = p.itemId;
  if (prevId) {
    if (!bossChangesAllowed(ms)) return;
    if (itemId === prevId) return; // sin cambios reales
    // Libera el objeto que llevaba puesto, que vuelve al almacén, antes
    // de decidir si se queda "sin objeto" o se equipa uno nuevo.
    ms.itemsInventory[prevId] = (ms.itemsInventory[prevId] || 0) + 1;
    p.itemId = null;
    if (!itemId) {
      const prevDef = bossItemById(prevId);
      addChatMessage(null, `🎒 ${p.pokemon.name} de @${user} se quita ${prevDef ? prevDef.icon + ' ' + prevDef.name : 'su objeto'}.`, 'system', { mirror: false });
      const fighter = ms.fighterSprites[user];
      if (fighter && fighter.nameEl) fighter.nameEl.textContent = '@' + user;
      updateBossItemsBadge();
      return;
    }
    // itemId trae uno nuevo: sigue abajo para equiparlo, igual que si
    // partiera de "sin objeto".
  } else if (!itemId) {
    return;
  }
  ms.itemsInventory[itemId] = Math.max(0, (ms.itemsInventory[itemId] || 0) - 1);
  p.itemId = itemId;
  const newDef = bossItemById(itemId);
  if (newDef) {
    addChatMessage(null, `🎒 ${p.pokemon.name} de @${user} equipa ${newDef.icon} ${newDef.name}.`, 'system', { mirror: false });
  }
  // Refleja el cambio de inmediato sobre su etiqueta en el mapa (si ya
  // tiene sprite creado, lo que es el caso siempre que esta función se
  // llama en pleno combate) y en la burbuja del almacén.
  const fighter = ms.fighterSprites[user];
  if (fighter && fighter.nameEl) {
    fighter.nameEl.innerHTML = (newDef ? bossItemIconHtml(newDef, 10) + ' ' : '') + '@' + escapeHtml(user);
  }
  updateBossItemsBadge();
}

// Abre (en el modal genérico, ver showModal en utils.js) el panel de
// objetos: a la izquierda un resumen del almacén (lo que hay sin asignar,
// ver ms.itemsInventory), y debajo un desplegable por cada combatiente
// apuntado para elegir el objeto que lleva puesto. El panel, y la
// asignación de un objeto sin equipar, se pueden usar SIEMPRE, en
// cualquier momento de la partida (ver assignBossItem). Lo que la regla
// de "no cambiar objetos" restringe es quitarle a un combatiente el
// objeto que YA lleva puesto o cambiárselo por otro (ver assignBossItem):
// eso solo se admite mientras dura la fase 1 del nivel (misma ventana que
// bossChangesAllowed usa para los Pokémon), momento en que el desplegable
// de un combatiente con objeto se muestra activo, con "— Ninguno —" y el
// resto de objetos disponibles. Fuera de esa ventana (fase 1 ya cerrada,
// ver ms.bossChangesLocked) el desplegable se deshabilita y solo muestra
// ese objeto, sin ofrecer forma de quitárselo o sustituirlo.
function openBossItemsPanel() {
  const ms = state.modeState;
  if (!ms) return;
  const invSummary = BOSS_ITEMS.map(it => {
    const n = ms.itemsInventory[it.id] || 0;
    if (n <= 0) return '';
    return `<span class="boss-item-chip" title="${escapeHtml(it.desc)}">${bossItemIconHtml(it, 16)} ${escapeHtml(it.name)} ×${n}</span>`;
  }).filter(Boolean).join('');
  const rows = ms.order.map(user => {
    const p = ms.players[user];
    if (!p) return '';
    const current = p.itemId;
    if (current) {
      // Objeto ya equipado. Su icono oficial no puede ir DENTRO del
      // <option> (los navegadores solo pintan el texto de un <option>,
      // nunca imágenes), así que se muestra aparte, junto al desplegable,
      // en ambos casos de abajo.
      const def = bossItemById(current);
      const label = def ? escapeHtml(def.name) : 'Objeto';
      if (bossChangesAllowed(ms)) {
        // Todavía en la fase 1 del nivel (o en el lobby): el streamer
        // puede quitarle el objeto o cambiárselo por otro (ver
        // assignBossItem), igual que puede cambiar de Pokémon en esta
        // misma ventana.
        const optionsHtml = ['<option value="">— Ninguno —</option>']
          .concat(BOSS_ITEMS.map(it => {
            const avail = ms.itemsInventory[it.id] || 0;
            const isCurrent = it.id === current;
            if (avail <= 0 && !isCurrent) return '';
            return `<option value="${it.id}" ${isCurrent ? 'selected' : ''}>${escapeHtml(it.name)}${isCurrent ? ' (puesto)' : ` (${avail} disp.)`}</option>`;
          }))
          .filter(Boolean)
          .join('');
        return `
          <div class="boss-item-row">
            <div class="boss-item-row-who">
              <b>${escapeHtml(p.pokemon.name)}</b>
              <span class="boss-item-row-user">@${escapeHtml(user)}</span>
            </div>
            <div class="boss-item-row-select-wrap">
              ${def ? `<img class="boss-item-select-icon" src="${def.iconUrl}" alt="${escapeHtml(def.name)}">` : ''}
              <select class="boss-item-select" data-user="${escapeHtml(user)}" title="Fase 1 del nivel: todavía puedes quitarle el objeto o cambiarlo por otro.">
                ${optionsHtml}
              </select>
            </div>
          </div>
        `;
      }
      // Fase 1 ya cerrada: asignación definitiva hasta la fase 1 del
      // nivel siguiente, el desplegable se muestra deshabilitado con ese
      // único objeto seleccionado.
      return `
        <div class="boss-item-row">
          <div class="boss-item-row-who">
            <b>${escapeHtml(p.pokemon.name)}</b>
            <span class="boss-item-row-user">@${escapeHtml(user)}</span>
          </div>
          <div class="boss-item-row-select-wrap">
            ${def ? `<img class="boss-item-select-icon" src="${def.iconUrl}" alt="${escapeHtml(def.name)}">` : ''}
            <select class="boss-item-select" disabled title="Ya lleva un objeto puesto: no se le puede quitar ni cambiar hasta la Fase 1 del nivel siguiente.">
              <option selected>${label} (equipado)</option>
            </select>
          </div>
        </div>
      `;
    }
    // Sin objeto todavía: desplegable normal con "Ninguno" y los objetos
    // que haya en stock, siempre disponible. El icono de al lado muestra
    // el objeto seleccionado en cada momento (ver el listener de más abajo
    // que lo actualiza en cada cambio), por la misma razón: un <option> no
    // puede llevar una imagen dentro.
    const optionsHtml = ['<option value="">— Ninguno —</option>']
      .concat(BOSS_ITEMS.map(it => {
        const avail = ms.itemsInventory[it.id] || 0;
        if (avail <= 0) return '';
        return `<option value="${it.id}">${escapeHtml(it.name)} (${avail} disp.)</option>`;
      }))
      .filter(Boolean)
      .join('');
    return `
      <div class="boss-item-row">
        <div class="boss-item-row-who">
          <b>${escapeHtml(p.pokemon.name)}</b>
          <span class="boss-item-row-user">@${escapeHtml(user)}</span>
        </div>
        <div class="boss-item-row-select-wrap">
          <img class="boss-item-select-icon" style="display:none;" alt="">
          <select class="boss-item-select" data-user="${escapeHtml(user)}">${optionsHtml}</select>
        </div>
      </div>
    `;
  }).join('');
  const body = `
    <div class="boss-items-inventory">
      ${invSummary || '<span style="color:var(--muted);font-size:12px;">Todavía no hay objetos en el almacén: se consiguen abriendo cofres al derrotar al jefe de la fase 10 y de la fase final de cada nivel.</span>'}
    </div>
    <div class="boss-items-list">
      ${rows || '<p style="color:var(--muted);font-size:12px;">No hay combatientes apuntados a los que asignar objetos.</p>'}
    </div>
  `;
  showModal('🎒 Objetos', body, [{ label: 'Cerrar', class: 'btn-secondary' }]);
  $('modal-body').querySelectorAll('.boss-item-select').forEach(sel => {
    const preview = sel.parentElement.querySelector('.boss-item-select-icon');
    const refreshPreview = () => {
      if (!preview) return;
      const def = bossItemById(sel.value);
      if (def) {
        preview.src = def.iconUrl;
        preview.alt = def.name;
        preview.style.display = '';
      } else {
        preview.style.display = 'none';
      }
    };
    refreshPreview();
    sel.onchange = () => {
      assignBossItem(sel.dataset.user, sel.value || null);
      // Se refresca el panel entero (no solo el desplegable tocado): al
      // cambiar el stock disponible, las opciones de LOS DEMÁS
      // desplegables también pueden variar (un objeto que ya no queda
      // suelto deja de ofrecerse en ellos).
      openBossItemsPanel();
    };
  });
}

// Abre el cofre ganado (ver ms.chestsAvailable, bossDefeated): ofrece 3
// objetos aleatorios distintos del catálogo (ver BOSS_ITEMS) para que el
// streamer elija uno, que se suma al almacén (ver ms.itemsInventory).
function openBossChestModal() {
  const ms = state.modeState;
  if (!ms || !(ms.chestsAvailable > 0)) return;
  const pool = BOSS_ITEMS.slice();
  const options = [];
  while (options.length < 3 && pool.length) {
    options.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  // Común a ambos caminos (elección manual del streamer o votación del
  // Modo AFK): añade el objeto elegido al almacén, descuenta el cofre y
  // reanuda el combate (ver resolveBossChestChosen). En Modo AFK, además,
  // encadena la segunda votación para decidir quién lo recibe (ver
  // maybeStartBossAfkItemRecipientVote); fuera de él, la asignación queda
  // pendiente de que el streamer la haga a mano desde el panel 🎒.
  const applyChestChoice = (itemDef) => {
    if (!itemDef) return;
    ms.itemsInventory[itemDef.id] = (ms.itemsInventory[itemDef.id] || 0) + 1;
    ms.chestsAvailable = Math.max(0, ms.chestsAvailable - 1);
    updateBossChestButton();
    updateBossItemsBadge();
    playBossChestOpen();
    if (ms.bossAfk) {
      addChatMessage(null, `🎁 ¡El chat vota y consigue ${itemDef.icon} ${itemDef.name}! Ahora se vota a quién se le entrega.`, 'correct');
    } else {
      addChatMessage(null, `🎁 ¡El streamer abre el cofre y consigue ${itemDef.icon} ${itemDef.name}! Puede asignarlo desde el panel de objetos 🎒.`, 'correct', { mirror: false });
    }
    resolveBossChestChosen();
    if (ms.bossAfk) maybeStartBossAfkItemRecipientVote(itemDef.id);
  };

  // Modo AFK: el objeto no lo elige el streamer clicando, se vota en el
  // chat con las mismas 3 opciones al azar de siempre (ver
  // queueBossAfkVote); no se abre ningún modal.
  if (ms.bossAfk) {
    const voteOptions = options.map(it => ({ label: `${it.icon} ${it.name}`, sub: it.desc, itemId: it.id }));
    queueBossAfkVote('chestItem', voteOptions, '¡cofre conseguido! Votad qué objeto sale de él.', (winner) => {
      applyChestChoice(bossItemById(winner.itemId));
    });
    return;
  }

  const body = `
    <div class="boss-chest-options">
      ${options.map(it => `
        <button class="boss-chest-option" data-item="${it.id}" title="${escapeHtml(it.desc)}">
          <div class="boss-chest-option-icon"><img src="${it.iconUrl}" alt="${escapeHtml(it.name)}" width="36" height="36"></div>
          <div class="boss-chest-option-name">${escapeHtml(it.name)}</div>
          <div class="boss-chest-option-desc">${escapeHtml(it.desc)}</div>
        </button>
      `).join('')}
    </div>
  `;
  // Sin botón para cerrar sin elegir: el combate está en pausa (ver
  // ms.phase === 'chestPause', fijado en bossDefeated) y no hay forma de
  // seguir jugando salvo eligiendo uno de los 3 objetos de abajo (ver
  // resolveBossChestChosen).
  showModal('🎁 ¡Cofre! Elige un objeto para continuar', body, []);
  const optionButtons = $('modal-body').querySelectorAll('.boss-chest-option');
  optionButtons.forEach(btn => {
    btn.onclick = () => {
      const itemDef = bossItemById(btn.dataset.item);
      if (!itemDef) return;
      // Antes se cerraba el modal al instante; ahora la tarjeta elegida
      // hace un "pop" y brilla mientras las otras dos se apagan (ver
      // .is-chosen/.is-fading en styles.css), y solo entonces se cierra,
      // para que la elección se note en vez de desaparecer sin más.
      optionButtons.forEach(o => {
        o.disabled = true;
        o.classList.add(o === btn ? 'is-chosen' : 'is-fading');
      });
      setTimeout(() => {
        $('modal').classList.remove('show');
        applyChestChoice(itemDef);
      }, 260);
    };
  });
}

// Se llama al elegir un objeto del cofre (ver openBossChestModal, único
// callback posible ahora que no existe el cierre sin elegir): reanuda el
// combate, que se había quedado en pausa (ver ms.phase === 'chestPause',
// fijado en bossDefeated) desde que se ganó el cofre. Si lo que había
// pendiente era una transición de nivel (ver ms.pendingLevelTransition,
// fijada al caer el jefe de la fase final), se dispara con su fundido a
// negro (ver runBossLevelTransition): ese camino deja ms.phase en
// 'levelSelect', no en 'fight' (ver spawnNewBoss cuando leveledUp), así que
// el bucle de turnos NO se reprograma aquí — lo hace más tarde
// advanceBossLevelSelect(), al pulsar "Avanzar". Si lo pendiente era solo
// el avance de la fase 10 (ver ms.pendingStageAdvance), en cambio, se pasa
// directamente al jefe siguiente sin fundido ni pausa adicional, así que
// hay que reprogramar el bucle de turnos aquí mismo (ver scheduleBossTick):
// se había dejado de reprogramar solo al entrar en 'chestPause' (ver el
// propio scheduleBossTick, que comprueba ms.phase !== 'fight' antes de
// cada reprogramación), y nada más en este camino vuelve a arrancarlo.
function resolveBossChestChosen() {
  const ms = state.modeState;
  if (!ms) return;
  if (ms.pendingLevelTransition) {
    ms.pendingLevelTransition = false;
    runBossLevelTransition();
    return;
  }
  if (ms.pendingStageAdvance) {
    ms.pendingStageAdvance = false;
    ms.phase = 'fight';
    spawnNewBoss();
    scheduleBossTick();
  }
}


// ---------------------------------------------------------------------
// DUELO 1 VS 1 — el streamer elige al combatiente con un clic; a partir de
// ahí el duelo avanza solo, turno a turno, igual que un combate del
// Coliseo del modo Arena (con las mismas animaciones PMD de Walk/Attack/Hurt).
// ---------------------------------------------------------------------

// Se llama al hacer clic en la etiqueta de un combatiente ya apuntado. Si
// ya había otro luchando (o caminando hacia su puesto), ese otro da media
// vuelta y camina de regreso a su propio puesto (el jefe conserva la vida
// tal cual estaba) mientras el nuevo elegido sale desde el suyo y recorre
// BOSS_WALK_PATH hasta plantarse frente al jefe; el duelo (ms.battle) no
// arranca hasta que llega — ver walkFighterAlong.
function selectChallenger(user) {
  const ms = state.modeState;
  // Bloqueado también durante ms.phase === 'levelSelect' (pantalla de
  // cambio de Pokémon al principio de la fase 1 de cada nivel, ver
  // showBossLevelSelectPanel): el combate está en pausa hasta que el
  // streamer pulse "Avanzar" (ver advanceBossLevelSelect).
  if (!ms || ms.phase !== 'fight' || !ms.players[user] || !ms.fighterSprites[user]) return;
  if (ms.activeUser === user) return; // ya está luchando o caminando hacia el puesto
  // Mientras el combatiente activo ya está luchando de verdad (ms.battle
  // creado al llegar a su puesto, ver walkFighterAlong/onArrive más abajo)
  // no se puede reemplazar por otro: hay que esperar a que caiga derrotado
  // (ver endDuel, que pone ms.battle = null y libera el hueco) o a que gane
  // el duelo. Antes de eso, mientras el elegido solo está caminando hacia
  // el puesto (ms.battle aún null), sí se permite cambiar de elegido.
  if (ms.battle) {
    addChatMessage(null, `${user}: no se puede cambiar de combatiente mientras ${ms.battle.player.pokemon.name} de @${ms.battle.player.user} sigue luchando contra ${bossDisplayName(ms)}.`, 'system', { mirror: false });
    return;
  }
  const p = ms.players[user];
  // Un combatiente que terminó su último combate con 0 de vida sigue
  // derrotado mientras espera (ver el comentario junto a ms.players[user].hp
  // más abajo): no puede volver a luchar hasta que revive de golpe al
  // derrotarse al jefe de la fase final del nivel (ver bossDefeated).
  if (typeof p.hp === 'number' && p.hp <= 0) {
    addChatMessage(null, `${user}: ${p.pokemon.name} fue derrotado y no puede volver a luchar hasta que reviva (al derrotar al jefe de la fase final del nivel).`, 'system', { mirror: false });
    return;
  }
  // Primer combatiente elegido en la fase 1 de este nivel (ver
  // bossChangesAllowed): a partir de aquí se bloquean los cambios de
  // Pokémon (!pokemon, ver handleBossJoin) y de objetos (ver
  // assignBossItem/openBossItemsPanel) hasta la fase 1 del nivel
  // siguiente, donde spawnNewBoss vuelve a poner ms.bossChangesLocked a
  // false. Se avisa tanto por chat (para los espectadores) como con un
  // toast (para que el streamer lo vea al instante, ver utils.js).
  if (ms.bossStage === 1 && !ms.bossChangesLocked) {
    ms.bossChangesLocked = true;
    updateBossCommandsBanner();
    addChatMessage(null, `🔒 El streamer elige a @${user} para luchar primero: ya no se pueden cambiar más Pokémon ni objetos hasta la Fase 1 del nivel siguiente.`, 'system', { mirror: false });
    toast('🔒 Combatiente elegido: ya no se pueden cambiar Pokémon ni objetos hasta el nivel siguiente');
  }
  // A partir de aquí deja de tener sentido consultar fichas: alguien va a
  // pasar a combatir (o ya lo estaba haciendo otro al que se releva), así
  // que la condición de showBossFiche (nadie combatiendo ni de camino) deja
  // de cumplirse de inmediato.
  hideBossFiche();
  const previousUser = ms.activeUser;
  if (previousUser) sendFighterHome(previousUser);
  ms.activeUser = user;
  ms.battle = null;
  // Se aplica de nuevo su vuelo real (si lo tiene) desde el instante mismo
  // en que se le elige, y se mantiene así durante todo el trayecto de ida,
  // el duelo y el trayecto de vuelta.
  setFighterGrounded(user, false);
  renderBossPlayersZone();
  renderDuelPanel();

  // El combatiente entra por la izquierda del mapa, mirando hacia la
  // derecha (hacia el jefe): misma dirección que un campeón "left" del
  // Coliseo del modo Arena. Recorre BOSS_WALK_PATH completo (su sprite ya
  // está en su propio puesto, así que no hace falta ningún punto de
  // partida extra: el primer tramo del camino ya lo aleja de su sitio).
  walkFighterAlong(user, BOSS_WALK_PATH, arenaDirectionFor('left'), () => {
    // El streamer pudo elegir a otro combatiente mientras este caminaba:
    // si ya no es el activo, no arrancamos su duelo.
    if (state.modeState.activeUser !== user) return;
    const fighter = state.modeState.fighterSprites[user];
    if (fighter) fighter.atCombat = true;
    // La vida máxima con la que entra a luchar refleja sus mejoras de
    // !levelup vida invertidas hasta ahora en el nivel actual (ver
    // playerEffectiveStats); ataque y velocidad se leen en caliente en cada
    // turno, así que no hace falta guardarlos aquí.
    const stats = playerEffectiveStats(state.modeState, user);
    // La vida ACTUAL con la que entra a luchar es la que le quedaba de su
    // combate anterior (o de la curación pasiva recibida mientras esperaba,
    // ver performDuelAttack): un combatiente que ya ha combatido NO empieza
    // cada duelo con la vida repuesta del todo, sino donde la dejó.
    const persistedHp = typeof p.hp === 'number' ? p.hp : stats.maxHp;
    const startHp = Math.min(stats.maxHp, persistedHp);
    state.modeState.battle = {
      player: { user, pokemon: p.pokemon, hp: startHp, maxHp: stats.maxHp },
      initiativeGauge: { player: 0, boss: 0 }, // medidor de iniciativa (0-100%) de cada bando (ver advanceBattleTurn)
      lastActor: null, // desempata si ambos medidores llegan a 100% a la vez (Velocidades iguales): el combatiente elegido golpea primero
      noDamageStreak: 0,
      struggling: false,
      // Efectos de objeto que se disparan una sola vez por duelo (ver
      // BOSS_ITEMS/performDuelAttack): Seguro Debilidad (dobla el ataque
      // tras un golpe muy o súper eficaz) y Baya Zidra (cura al bajar al
      // 50% de vida). Se reinician a false cada vez que este combatiente
      // vuelve a entrar en combate, igual que en los juegos originales.
      wpBoost: false,
      berryUsed: false,
    };
    if (previousUser) {
      addChatMessage(null, `🔁 ¡${p.pokemon.name} de @${user} entra en combate contra ${bossDisplayName(ms)}, relevando a @${previousUser}!`, 'system', { mirror: false });
    } else {
      addChatMessage(null, `⚔️ ¡${p.pokemon.name} de @${user} se enfrenta a ${bossDisplayName(ms)}!`, 'system', { mirror: false });
    }
    renderDuelPanel();
  });
}

// Anima el sprite PMD ya existente de `user` (ver createFighterSprite)
// recorriendo `points` uno a uno (cada tramo tarda BOSS_WALK_STEP_MS),
// reproduciendo "Walk" en la dirección `dir` durante todo el trayecto, y
// llama a `onArrive` al llegar al último punto. Se usa tanto para el
// camino de ida (del puesto al combate) como para el de vuelta (ver
// sendFighterHome): el propio sprite del combatiente, siempre visible, es
// el que se desplaza — nunca se crea ni se destruye nada a mitad de
// camino. Si se cancela (ver cancelFighterWalk) o se vuelve a llamar antes
// de llegar, el trayecto en curso simplemente deja de avanzar.
function walkFighterAlong(user, points, dir, onArrive) {
  const ms = state.modeState;
  const entry = ms && ms.fighterSprites[user];
  if (!ms || !entry || !points.length) { if (onArrive) onArrive(); return; }
  cancelFighterWalk(user);
  const myToken = entry.moveToken;
  entry.sprite.play('Walk', dir, true, null, BOSS_ANIM_SPEED);
  let idx = 0;
  function step() {
    const cur = state.modeState && state.modeState.fighterSprites[user];
    if (!cur || cur.moveToken !== myToken) return; // se canceló o se sustituyó por otro trayecto
    if (idx >= points.length) { if (onArrive) onArrive(); return; }
    const point = points[idx];
    cur.el.style.left = point.x + '%';
    cur.el.style.top = point.y + '%';
    idx++;
    cur.walkTimer = setTimeout(step, BOSS_WALK_STEP_MS);
  }
  step();
}

// Corta el trayecto en curso de `user` (si lo hay) sin tocar su sprite: se
// usa antes de empezar un trayecto nuevo (ida o vuelta) o al limpiar el modo.
function cancelFighterWalk(user) {
  const ms = state.modeState;
  const entry = ms && ms.fighterSprites[user];
  if (!entry) return;
  entry.moveToken++; // invalida cualquier "step" pendiente del trayecto anterior
  if (entry.walkTimer) { clearTimeout(entry.walkTimer); entry.walkTimer = null; }
}

// Hace que el sprite de `user` dé media vuelta y camine directamente de
// regreso a su propio puesto fijo (BOSS_PLAYER_SLOTS), mirando hacia la
// izquierda; al llegar retoma su "Walk" de espera de siempre. Se llama
// tanto si estaba plantado luchando como si solo iba de camino al combate.
function sendFighterHome(user) {
  const ms = state.modeState;
  const entry = ms && ms.fighterSprites[user];
  if (!entry) return;
  entry.atCombat = false;
  const home = BOSS_PLAYER_SLOTS[entry.slotIndex];
  if (!home) return;
  walkFighterAlong(user, [home], arenaDirectionFor('right'), () => {
    // Ha llegado de vuelta a su puesto original: retoma "Walk" si sigue en
    // pie, o "Sleep" si acaba de caer derrotado (ver playFighterRestAnim).
    playFighterRestAnim(user);
    // Se vuelve a ignorar su vuelo/levitación, como el resto mientras
    // esperan turno (o descansan derrotados).
    setFighterGrounded(user, true);
  });
}

function renderDuelPanel() {
  const ms = state.modeState;
  if (!ms) return;
  // La barra de vida flotante de cada combatiente (ver createFighterSprite)
  // solo debe verse encima de su sprite mientras está realmente peleando:
  // se recorren todos para que, tras cualquier cambio (elegido, relevado,
  // derrotado...), solo conserve la clase "in-duel" el combatiente que de
  // verdad tiene un duelo activo ahora mismo (como mucho uno). Ya no hay
  // ningún panel inferior que mostrar/ocultar (ver renderBoss): esto es lo
  // único que queda de esta función.
  Object.entries(ms.fighterSprites).forEach(([u, entry]) => {
    entry.el.classList.toggle('in-duel', !!(ms.battle && ms.activeUser === u));
  });
  updateBossTurnQueue();
  if (!ms.activeUser || !ms.battle) return;
  updateDuelHP();
}

// Ajusta el ancho y color de la barra de vida flotante de `user` (hija de
// su propio .boss-fighter-sprite, ver createFighterSprite) a partir de una
// vida y vida máxima ya calculadas. Verde por defecto; amarillo al 50% de
// vida o menos; rojo al 25% o menos (mismos umbrales que el resto del
// modo). Función compartida por updateDuelHP (mientras el combatiente
// pelea de verdad, con los valores del duelo en curso) y
// updateWaitingFighterHP (mientras espera turno, con su vida persistida):
// cuál de las dos barras de vida se ve en cada momento —encima o debajo
// del sprite— lo decide solo el CSS según las clases "active"/"in-duel"
// (ver .boss-fighter-hpwrap en styles.css), así que aquí no hace falta
// distinguir un caso del otro.
function setFighterHpBar(user, hp, maxHp) {
  const ms = state.modeState;
  const fighter = ms && ms.fighterSprites[user];
  if (!fighter || !fighter.hpFillEl || !maxHp) return;
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const colorClass = pct <= 25 ? ' low' : pct <= 50 ? ' mid' : '';
  fighter.hpFillEl.className = 'boss-fighter-hpfill' + colorClass;
  fighter.hpFillEl.style.width = pct + '%';
}

function updateDuelHP() {
  const ms = state.modeState;
  if (!ms || !ms.battle) return;
  const p = ms.battle.player;
  setFighterHpBar(p.user, p.hp, p.maxHp);
}

// Actualiza, en tiempo real, la barra de vida flotante de `user` mientras
// espera turno en su puesto (no está luchando de verdad contra el jefe,
// ver .boss-fighter-sprite:not(.active) .boss-fighter-hpwrap en
// styles.css), a partir de su vida persistida (ms.players[user].hp) y su
// vida máxima efectiva actual (ver playerEffectiveStats, que ya tiene en
// cuenta sus mejoras de !levelup y el objeto que lleve equipado). Se
// llama cada vez que esa vida cambia mientras el combatiente NO está en
// pleno duelo: curación pasiva de objetos entre combates, !levelup vida,
// resurrección al derrotar al jefe de la fase final, reseteo de vida al
// subir de nivel... Mientras sí está luchando, la barra ya se mantiene al
// día con updateDuelHP, así que no hace falta llamar a esta función para
// ese caso (aunque hacerlo no tendría ningún efecto visible distinto).
function updateWaitingFighterHP(user) {
  const ms = state.modeState;
  const p = ms && ms.players[user];
  if (!ms || !p) return;
  const maxHp = playerEffectiveStats(ms, user).maxHp;
  const hp = typeof p.hp === 'number' ? p.hp : maxHp;
  setFighterHpBar(user, hp, maxHp);
}

// Programa el siguiente tic del combate: el tiempo de espera hasta el
// próximo turno es siempre BOSS_TICK_INTERVAL_MS, tanto si hay un duelo
// activo como si no (esperando a que el streamer elija a alguien). La
// Velocidad de cada bando ya no acelera este reloj (ver el comentario
// junto a BOSS_TICK_INTERVAL_MS): en vez de eso decide, dentro del mismo
// reloj, quién y con qué frecuencia obtiene turnos (ver
// advanceBattleTurn, llamado desde bossAutoTick). Se llama una vez al
// empezar el combate (ver startBossFight) y se reprograma sola tras cada
// tic (ver bossAutoTick), formando un bucle que dura toda la partida.
function scheduleBossTick() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'fight') return;
  // Se guarda en "tickInterval" (aunque ahora es un setTimeout) para que el
  // cleanup genérico de modeLauncher.js (clearInterval al salir del modo)
  // lo siga cancelando sin cambios: clearInterval/clearTimeout comparten el
  // mismo espacio de identificadores, así que son intercambiables.
  ms.tickInterval = setTimeout(() => {
    bossAutoTick();
    scheduleBossTick();
  }, BOSS_TICK_INTERVAL_MS);
}

// Hace avanzar el duelo activo un turno: le toca a uno de los dos (el
// combatiente actual o el jefe), sin que el chat tenga que escribir ningún
// comando de ataque — igual que en el Coliseo del modo Arena, salvo que
// aquí quién ataca en cada turno (y con qué frecuencia) depende del
// sistema de iniciativa basado en Velocidad (ver advanceBattleTurn).
function bossAutoTick() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'fight' || !ms.battle) return;
  const side = advanceBattleTurn(ms, ms.battle);
  performDuelAttack(side);
}

// Resuelve el turno de `side` ('player' o 'boss') contra su rival: puede
// fallar por esquiva, ser un golpe crítico, o un golpe normal, y su daño
// se ve multiplicado por la tabla de tipos — mismo sistema que el Coliseo
// del modo Arena. Tras 10 turnos seguidos sin que nadie cause ni reciba
// daño, ambos pasan a Forcejeo (ignora tipo) para desatascar el duelo.
//
// Quien ataca reproduce de inmediato su animación PMD "Attack"; el impacto
// en sí (daño, textos flotantes y animación "Hurt" del rival) se retrasa
// BOSS_HIT_DELAY_MS, igual que en el Coliseo del modo Arena, para que el
// golpe se sienta sincronizado con la animación.
function performDuelAttack(side) {
  const ms = state.modeState;
  const b = ms.battle;
  const playerFighter = ms && ms.fighterSprites[b.player.user];
  if (!ms || !b || !playerFighter || !ms.bossSprite) return;
  if (allBossesDefeated(ms) || b.player.hp <= 0) return;
  // El jefe implicado en ESTE golpe: cuando ataca el combatiente, siempre
  // el primer jefe con vida (currentBossTarget — con un solo jefe, es
  // siempre el mismo de toda la vida); cuando ataca el bando enemigo, el
  // jefe al que le toca turno ahora (currentBossAttacker — con dos jefes
  // vivos a la vez, se alternan entre sí, ver bossFinalBossDb.js).
  const bossSlot = side === 'player' ? currentBossTarget(ms) : currentBossAttacker(ms);
  if (!bossSlot) return;
  const boss = bossSlot.boss;
  // El estado de iniciativa (initiativeGauge/lastActor) ya quedó
  // actualizado para el turno SIGUIENTE (lo avanzó bossAutoTick, vía
  // advanceBattleTurn, antes de llamar aquí) y,
  // si este golpe era del bando enemigo, bossTurnPointer (ver
  // currentBossAttacker de arriba) ya refleja a cuál de los jefes le
  // tocará la próxima vez: es el momento exacto en que la predicción de
  // predictBossTurnOrder queda al día, así que se actualiza la tabla de
  // próximos turnos aquí, antes de que se resuelva (con su propio retraso,
  // ver BOSS_HIT_DELAY_MS más abajo) el resto de este golpe.
  updateBossTurnQueue();

  const struggling = !!b.struggling;
  // Objeto equipado (ver BOSS_ITEMS/assignBossItem) por el combatiente que
  // protagoniza este duelo: el jefe nunca lleva objetos, así que basta con
  // mirar el suyo para saber qué efectos pasivos aplican en este turno,
  // ataque suyo o del jefe.
  const playerItem = (ms.players[b.player.user] && ms.players[b.player.user].itemId) || null;

  // Cada Pokémon tiene un único movimiento, que usa automáticamente en
  // TODOS sus turnos (su primer movimiento, moves[0]): no hay cooldown que
  // gestionar. El TIPO de ese ataque, en cambio, sí puede elegirse cuando
  // el combatiente tiene dos tipos, con !habilidad1/!habilidad2 mientras
  // espera en su puesto (ver handleBossAbility más abajo y
  // attackerPlayer.attackTypeIndex justo debajo, para el lado 'player').
  let attackerName, attackerType, defenderTypes, moveName, attackerAtk;
  let attackerSprite, attackerDir, defenderSprite, defenderDir, attackerAnchor, defenderAnchor;
  if (side === 'player') {
    attackerName = b.player.pokemon.name;
    // Tipo de ataque elegido con !habilidad1/!habilidad2 (ver
    // handleBossAbility): por defecto el primario (índice 0). Si el índice
    // guardado apunta a un tipo secundario que ya no existe (p.ej. tras
    // cambiar de Pokémon con !pokemon, aunque ahí ya se reinicia a 0), se
    // cae de vuelta al primario en lugar de fallar.
    const attackerPlayer = ms.players[b.player.user];
    const chosenIndex = attackerPlayer && attackerPlayer.attackTypeIndex === 1 && b.player.pokemon.types[1] ? 1 : 0;
    attackerType = b.player.pokemon.types[chosenIndex];
    defenderTypes = boss.types || [];
    moveName = struggling ? 'Forcejeo' : (b.player.pokemon.moves[0] || 'Ataque');
    attackerSprite = playerFighter.sprite; attackerDir = arenaDirectionFor('left');
    defenderSprite = bossSlot.sprite; defenderDir = arenaDirectionFor('right');
    attackerAnchor = playerFighter.el; defenderAnchor = $(bossSlot.zoneId);
    // Ataque efectivo del combatiente, según sus mejoras de !levelup ataque
    // invertidas hasta ahora en el nivel actual (ver playerEffectiveStats).
    attackerAtk = playerEffectiveStats(ms, b.player.user).atk;
    // Seguro Debilidad: una vez activado en este mismo duelo (ver el
    // disparador más abajo, en el golpe recibido del jefe), dobla su
    // ataque durante lo que quede de él.
    if (b.wpBoost) attackerAtk = Math.round(attackerAtk * 2);
  } else {
    // -----------------------------------------------------------------
    // MECÁNICA ESPECIAL DE ARCEUS — fase final (15) del nivel
    // ARCEUS_SPECIAL_LEVEL (20): justo antes de atacar, Arceus cambia de
    // tipo al que más eficaz resulte contra los tipos del Pokémon aliado
    // que tiene delante ahora mismo (b.player.pokemon.types), y cambia su
    // sprite/nombre/movimientos a la placa asociada a ese tipo (ver
    // arceusTypeFormsDb.js). Es un cambio instantáneo, sin la animación de
    // luz blanca de BOSS_MIDFIGHT_TRANSFORM_DB (bossMidfightTransformDb.js)
    // ni el +50% de ataque que sí ganan esas transformaciones (ver más
    // abajo, "midfightTransformAtkBonus"): boss._midfightTransformed nunca
    // se marca aquí a propósito.
    if (ms.bossLevel === ARCEUS_SPECIAL_LEVEL && ms.bossStage === BOSS_FINAL_STAGE
      && boss.name && boss.name.toLowerCase().startsWith('arceus')) {
      const bestType = bestAttackingTypeAgainst(b.player.pokemon.types);
      const arceusTemplate = bestType ? getArceusTypeFormTemplate(bestType, ARENA_POKEMON_DB) : null;
      if (arceusTemplate && arceusTemplate.id !== boss.id) {
        boss.id = arceusTemplate.id;
        boss.sprite = arceusTemplate.sprite;
        boss.name = arceusTemplate.name;
        boss.types = arceusTemplate.types;
        boss.moves = arceusTemplate.moves;
        bossSlot.sprite.setDex(arceusTemplate.sprite);
        const arceusSpriteEl = $(bossSlot.index === 0 ? 'boss-sprite' : 'boss-sprite-2');
        applyBossSpriteAdjustment(arceusSpriteEl, arceusTemplate.sprite);
        const arceusNameEl = $(bossSlot.index === 0 ? 'boss-name-text' : 'boss-name-text-2');
        if (arceusNameEl) arceusNameEl.textContent = boss.name;
        addChatMessage(null, `✨ ¡${boss.name} cambia de tipo antes de atacar!`, 'system', { mirror: false });
      }
    }

    attackerName = boss.name;
    // Tipo del ataque del jefe: aleatorio entre su tipo primario y
    // secundario en cada turno (si solo tiene un tipo, siempre es ese;
    // con la mecánica especial de Arceus de arriba, siempre tiene uno
    // solo, el que se acaba de fijar).
    const bossTypes = (boss.types || []).filter(Boolean);
    attackerType = bossTypes.length > 1
      ? bossTypes[Math.floor(Math.random() * bossTypes.length)]
      : (bossTypes[0] || null);
    defenderTypes = b.player.pokemon.types;
    const moves = boss.moves || [];
    moveName = struggling ? 'Forcejeo' : (moves[0] || 'Ataque');
    attackerSprite = bossSlot.sprite; attackerDir = arenaDirectionFor('right');
    defenderSprite = playerFighter.sprite; defenderDir = arenaDirectionFor('left');
    attackerAnchor = $(bossSlot.zoneId); defenderAnchor = playerFighter.el;
    // Ataque efectivo del jefe, según las mejoras aleatorias acumuladas por
    // el bando enemigo a lo largo de los niveles (ver bossEffectiveStats).
    // Los jefes que ya se han transformado a mitad de combate (ver
    // BOSS_MIDFIGHT_TRANSFORM_DB/boss._midfightTransformed) atacan con un
    // 50% más de ataque desde ese momento en adelante; el cambio de tipo
    // de Arceus de arriba es una mecánica distinta y NUNCA marca
    // boss._midfightTransformed, así que no se beneficia de este bonus.
    attackerAtk = bossEffectiveStats(ms).atk;
    if (boss._midfightTransformed) attackerAtk = Math.round(attackerAtk * 1.5);
  }

  // Vuelve a "Walk" en bucle tras terminar una animación puntual (Attack o
  // Hurt), salvo que el duelo ya haya terminado mientras tanto.
  const backToWalk = (spr, dir) => {
    if (!state.modeState || state.modeState.battle !== b) return;
    spr.play('Walk', dir, true, null, BOSS_ANIM_SPEED);
  };
  attackerSprite.play('Attack', attackerDir, false, () => backToWalk(attackerSprite, attackerDir), BOSS_ANIM_SPEED);

  // Probabilidad de esquiva: Lupa la reduce para el propio combatiente
  // cuando ataca (su golpe falla menos veces); Polvo Brillo la sube para él
  // cuando es el jefe quien le ataca (esquiva más veces). El jefe nunca
  // lleva objetos, así que solo hace falta mirar playerItem.
  let dodgeChance = BOSS_DODGE_CHANCE;
  if (side === 'player' && playerItem === 'lupa') dodgeChance = 0;
  if (side === 'boss' && playerItem === 'polvo_brillo') dodgeChance = 0.25;
  const dodge = Math.random() < dodgeChance;

  if (dodge) {
    b.noDamageStreak = (b.noDamageStreak || 0) + 1;
    const enteringStruggle = b.noDamageStreak >= 10 && !b.struggling;
    if (enteringStruggle) b.struggling = true;
    setTimeout(() => {
      if (!state.modeState || state.modeState.battle !== b) return; // el duelo pudo terminar mientras tanto
      playBossDodge();
      const defenderName = side === 'player' ? boss.name : `@${b.player.user}`;
      addChatMessage(null, `💨 ¡${defenderName} esquiva ${struggling ? 'el Forcejeo' : moveName} de ${attackerName}!`, 'action', { mirror: false });
      showBossFloatText(defenderAnchor, '¡Esquiva!', 'dodge-number');
      if (enteringStruggle) addChatMessage(null, '⚔️ ¡El duelo se estanca! Ambos pasan a usar Forcejeo.', 'system', { mirror: false });
    }, BOSS_HIT_DELAY_MS);
    return;
  }

  const mult = struggling ? 1 : bossTypeMultiplier(attackerType, defenderTypes);
  // Periscopio duplica la probabilidad de golpe crítico de quien lo lleva.
  const critChance = (side === 'player' && playerItem === 'periscopio') ? 0.35 : BOSS_CRIT_CHANCE;
  let dmg = Math.floor(attackerAtk * (0.85 + Math.random() * 0.3));
  dmg = Math.floor(dmg * mult);
  const crit = Math.random() < critChance;
  if (crit) dmg = Math.floor(dmg * BOSS_CRIT_MULT);
  // Cinta Xperto: un 30% más de daño cuando el golpe es súper (x2) o
  // hipereficaz (x4) de verdad, solo si lo lleva quien ataca.
  if (side === 'player' && playerItem === 'cinta_xperto' && mult >= 2) dmg = Math.floor(dmg * 1.3);
  if (mult > 0) dmg = Math.max(dmg, 1);
  else dmg = 0;

  let enteringStruggle = false;
  if (dmg > 0) {
    b.noDamageStreak = 0;
  } else {
    b.noDamageStreak = (b.noDamageStreak || 0) + 1;
    if (b.noDamageStreak >= 10 && !b.struggling) {
      b.struggling = true;
      enteringStruggle = true;
    }
  }

  const eff = struggling ? { chatMsg: '', floatText: '', floatClass: '' } : effectivenessInfo(mult);
  const moveLabel = struggling ? moveName : `${moveName} (${attackerType || '???'})`;

  setTimeout(() => {
    if (!state.modeState || state.modeState.battle !== b) return; // el duelo pudo terminar mientras tanto
    if (dmg > 0) { if (crit) playBossCrit(); else playBossHit(); }

    if (side === 'player') {
      boss.currentHp = Math.max(0, boss.currentHp - dmg);
      const player = state.modeState.players[b.player.user];
      if (player) player.dmg += dmg;
      updateBossHPBar();
      addChatMessage(null, `${attackerName} usa ${moveLabel}!${crit ? ' ¡GOLPE CRÍTICO!' : ''} -${dmg} PS${eff.chatMsg}`, crit ? 'crit' : 'action', { mirror: false });
      renderBossRanking();

      // Curación pasiva de los combatientes en espera: cada vez que el
      // aliado que combate golpea de verdad al jefe, el resto (todos menos
      // quien está luchando) recupera un porcentaje de ESE daño — un 5% de
      // base, o un 16% si ese aliado en espera lleva puesto Restos (ver
      // BOSS_ITEMS) — sin superar su propia vida máxima; los que ya están
      // derrotados (0 de vida) no reciben esta curación.
      if (dmg > 0) {
        Object.entries(state.modeState.players).forEach(([u, waiter]) => {
          if (u === b.player.user || !waiter) return;
          if (typeof waiter.hp !== 'number' || waiter.hp <= 0) return; // derrotado: no cura
          const healPct = waiter.itemId === 'restos' ? 0.16 : 0.05;
          const healAmount = Math.floor(dmg * healPct);
          if (healAmount <= 0) return;
          const waiterMaxHp = playerEffectiveStats(state.modeState, u).maxHp;
          waiter.hp = Math.min(waiterMaxHp, waiter.hp + healAmount);
          // Refleja al instante esta curación pasiva en su barra de vida
          // flotante, visible mientras espera turno (ver
          // updateWaitingFighterHP).
          updateWaitingFighterHP(u);
        });

        // Cascabel Concha: el propio combatiente recupera un 10% del daño
        // que acaba de causar, sin superar su vida máxima.
        if (playerItem === 'cascabel_concha') {
          const lifesteal = Math.floor(dmg * 0.10);
          if (lifesteal > 0) b.player.hp = Math.min(b.player.maxHp, b.player.hp + lifesteal);
        }
        // Vidasfera: además del +50% de ataque ya aplicado (ver
        // playerEffectiveStats/attackerAtk), pierde un 10% de su vida
        // MÁXIMA cada vez que ataca de verdad — puede llegar a debilitarse
        // a sí mismo por el retroceso.
        if (playerItem === 'vidasfera') {
          const recoil = Math.floor(b.player.maxHp * 0.10);
          b.player.hp = Math.max(0, b.player.hp - recoil);
        }
        const selfPlayer = state.modeState.players[b.player.user];
        if (selfPlayer) selfPlayer.hp = b.player.hp;
        updateDuelHP();
      }
    } else {
      let newHp = Math.max(0, b.player.hp - dmg);
      // Cinta Focus: si este golpe le habría debilitado del todo, un 50%
      // de probabilidad de aguantar con 1 PS en su lugar (no se activa si
      // ya estaba a 0 de vida antes de este golpe).
      if (dmg > 0 && newHp <= 0 && b.player.hp > 0 && playerItem === 'cinta_focus' && Math.random() < 0.5) {
        newHp = 1;
        addChatMessage(null, `🎀 ¡La Cinta Focus permite a ${b.player.pokemon.name} aguantar con 1 PS!`, 'correct', { mirror: false });
      }
      b.player.hp = newHp;
      // Se mantiene sincronizada la vida persistida del combatiente (ver
      // ms.players[user].hp) con la de su duelo en curso, para que, si más
      // tarde es relevado, recupere el combate justo con la vida con la que
      // terminó (ver selectChallenger).
      const fightingPlayer = state.modeState.players[b.player.user];
      if (fightingPlayer) fightingPlayer.hp = b.player.hp;
      updateDuelHP();
      addChatMessage(null, `${attackerName} usa ${moveLabel}!${crit ? ' ¡GOLPE CRÍTICO!' : ''} -${dmg} PS a @${b.player.user}${eff.chatMsg}`, crit ? 'crit' : 'action', { mirror: false });

      // Casco Dentado: devuelve un 20% del daño recibido al jefe.
      if (dmg > 0 && playerItem === 'casco_dentado') {
        const reflect = Math.max(1, Math.floor(dmg * 0.20));
        // boss aquí es bossSlot.boss: el jefe que ACABA de atacar (el que
        // le toca turno ahora, ver currentBossAttacker más arriba), así que
        // el reflejo le devuelve el golpe a él en concreto, no a "el jefe"
        // en general — correcto también con dos jefes a la vez.
        boss.currentHp = Math.max(0, boss.currentHp - reflect);
        updateBossHPBar();
        addChatMessage(null, `⛑️ ¡El Casco Dentado de ${b.player.pokemon.name} devuelve ${reflect} de daño a ${boss.name}!`, 'action', { mirror: false });
      }

      // Seguro Debilidad: si el golpe recibido era súper (x2) o
      // hipereficaz (x4), dobla su ataque durante el resto del duelo (solo
      // se activa una vez por duelo, ver b.wpBoost).
      if (dmg > 0 && mult >= 2 && playerItem === 'seguro_debilidad' && !b.wpBoost) {
        b.wpBoost = true;
        addChatMessage(null, `🛡️ ¡El Seguro Debilidad de ${b.player.pokemon.name} duplica su ataque por el resto del duelo!`, 'correct', { mirror: false });
      }

      // Baya Zidra: si tras el golpe sigue con vida y ha bajado al 50% o
      // menos, se la come (una sola vez por duelo, ver b.berryUsed) y
      // recupera un 30% de su vida máxima.
      if (b.player.hp > 0 && b.player.hp / b.player.maxHp <= 0.5 && playerItem === 'baya_zidra' && !b.berryUsed) {
        b.berryUsed = true;
        const healAmt = Math.floor(b.player.maxHp * 0.30);
        b.player.hp = Math.min(b.player.maxHp, b.player.hp + healAmt);
        if (fightingPlayer) fightingPlayer.hp = b.player.hp;
        updateDuelHP();
        addChatMessage(null, `🍒 ¡${b.player.pokemon.name} come su Baya Zidra y recupera vida!`, 'correct', { mirror: false });
      }
    }

    if (eff.floatText) {
      showBossFloatText(defenderAnchor, eff.floatText, eff.floatClass);
      setTimeout(() => showBossFloatText(defenderAnchor, (crit ? '💥 ' : '-') + dmg, crit ? 'crit-number' : ''), 450);
    } else {
      showBossFloatText(defenderAnchor, (crit ? '💥 ' : '-') + dmg, crit ? 'crit-number' : '');
    }
    if (enteringStruggle) addChatMessage(null, '⚔️ ¡El duelo se estanca! Ambos pasan a usar Forcejeo.', 'system', { mirror: false });

    const fainted = side === 'player' ? boss.currentHp <= 0 : b.player.hp <= 0;
    if (fainted) playBossFaint();

    // Transformación a mitad de combate (ver BOSS_MIDFIGHT_TRANSFORM_DB
    // más arriba): si este golpe del combatiente ha dejado a este jefe en
    // concreto (bossSlot) al ratio de vida fijado para su id, o menos, y
    // todavía no se había transformado, toca hacerlo ahora, justo al
    // terminar su animación de Hurt (ver startBossMidfightTransform más
    // abajo). boss._midfightTransformed evita que se dispare más de una
    // vez según la vida siga bajando en golpes posteriores. Con dos jefes
    // a la vez (Zacian/Zamazenta, Groudon/Kyogre) cada uno se resuelve por
    // su cuenta, porque bossSlot/boss aquí ya identifican a uno solo de
    // los dos.
    const midfightTransform = (side === 'player' && !fainted && !boss._midfightTransformed)
      ? getBossMidfightTransformTemplate(boss.id, ARENA_POKEMON_DB)
      : null;
    const shouldTransformBossMidfight = !!midfightTransform
      && (boss.currentHp / boss.maxHp) <= midfightTransform.ratio;

    // Animación PMD del rival: si el golpe hizo daño de verdad, reproduce
    // Hurt justo ahora, sincronizada con el resto de efectos del impacto.
    // Si además le hace caer derrotado, no vuelve a "Walk" al terminar: se
    // queda en el fotograma de Hurt mientras se resuelve el fin del duelo.
    if (dmg > 0) {
      if (fainted) {
        defenderSprite.play('Hurt', defenderDir, false, null, BOSS_ANIM_SPEED);
      } else if (shouldTransformBossMidfight) {
        boss._midfightTransformed = true;
        defenderSprite.play('Hurt', defenderDir, false, () => startBossMidfightTransform(bossSlot, midfightTransform.template), BOSS_ANIM_SPEED);
      } else {
        defenderSprite.play('Hurt', defenderDir, false, () => backToWalk(defenderSprite, defenderDir), BOSS_ANIM_SPEED);
      }
    }

    if (fainted) {
      // Se espera un momento a que se vea completa la animación de Hurt
      // antes de resolver el fin del duelo (mismo mecanismo que
      // ARENA_FAINT_FADE_MS en el Coliseo del modo Arena). Para el lado
      // 'player', "fainted" solo dice que ESTE jefe en concreto (bossSlot)
      // ha caído — con un solo jefe eso es siempre fin de fase, pero con
      // dos, puede quedar el otro en pie (ver resolveBossSlotFaint, que
      // decide si toca terminar la fase o seguir combatiendo contra el que
      // quede).
      setTimeout(() => {
        if (side === 'player') resolveBossSlotFaint(bossSlot);
        else endDuel();
      }, dmg > 0 ? BOSS_FAINT_FADE_MS : 0);
    } else {
      // Casos aparte, no cubiertos por "fainted" de arriba (que solo mira
      // la vida de quien ha recibido ESTE golpe en concreto): el reflejo
      // del Casco Dentado puede rematar al jefe atacante durante su propio
      // turno (side === 'boss'), y el retroceso de la Vidasfera puede
      // debilitar al propio combatiente durante su propio turno de ataque.
      if (side === 'boss' && boss.currentHp <= 0) {
        playBossFaint();
        setTimeout(() => { if (state.modeState && state.modeState.battle === b) resolveBossSlotFaint(bossSlot); }, BOSS_FAINT_FADE_MS);
      } else if (side === 'player' && b.player.hp <= 0) {
        playBossFaint();
        setTimeout(() => { if (state.modeState && state.modeState.battle === b) endDuel(); }, BOSS_FAINT_FADE_MS);
      }
    }
  }, BOSS_HIT_DELAY_MS);
}

// Transformación a mitad de combate de cualquier jefe con entrada en
// BOSS_MIDFIGHT_TRANSFORM_DB (ver shouldTransformBossMidfight en
// performDuelAttack, que ya ha marcado boss._midfightTransformed y
// reproducido su Hurt antes de llamar aquí). Pausa el combate exactamente
// igual que un cofre o la llegada de la fase final (ver ms.phase ===
// 'chestPause'/'levelSelect'): mientras ms.phase no sea 'fight',
// scheduleBossTick deja de reprogramarse solo, así que basta con
// devolverlo a 'fight' y volver a llamar a scheduleBossTick() al terminar
// para reanudar el bucle de turnos donde lo dejó.
//
// La animación son tres tramos (ver las constantes
// BOSS_MIDFIGHT_TRANSFORM_* más arriba): una luz blanca que envuelve al
// Pokémon hasta taparlo del todo, el cambio real de id/sprite/nombre/
// tipos/movimientos mientras esa luz sigue a opacidad máxima -por eso
// nunca se ve el momento exacto del cambio-, y por último la luz
// desvaneciéndose para revelar la nueva forma ya en su sitio. El ajuste
// de posición/escala del sprite (ver applyBossSpriteAdjustment) se vuelve
// a calcular para el id de DESTINO, nunca se arrastra el de la forma
// anterior: así cada forma final queda con su propio encaje, igual que si
// hubiera aparecido así desde el principio de la fase.
//
// `targetTemplate` es la ficha completa (de ARENA_POKEMON_DB) de la forma
// de destino, ya resuelta por getBossMidfightTransformTemplate en
// spawnNewBoss/performDuelAttack: aquí solo se copian sus campos sobre el
// jefe en curso, conservando su ataque/vida actual/vida máxima de este
// combate (que no cambian por transformarse).
function startBossMidfightTransform(bossSlot, targetTemplate) {
  const ms = state.modeState;
  if (!ms || !bossSlot || !bossSlot.boss || !targetTemplate) return;
  const boss = bossSlot.boss;
  const spriteElId = bossSlot.index === 0 ? 'boss-sprite' : 'boss-sprite-2';
  const nameElId = bossSlot.index === 0 ? 'boss-name-text' : 'boss-name-text-2';
  const spriteEl = $(spriteElId);
  if (!spriteEl) return; // por si se salió de la pantalla justo al terminar el Hurt

  ms.phase = 'bossMidfightTransform';
  addChatMessage(null, `✨ ¡${boss.name} no puede mantener su forma por más tiempo y se envuelve en una luz cegadora!`, 'system', { mirror: false });
  playBossTransform();

  const glow = document.createElement('div');
  glow.className = 'boss-midfight-transform-glow';
  spriteEl.appendChild(glow);
  // Fuerza el reflow para que la transición de abajo arranque de verdad
  // desde opacity:0 en vez de saltar directa al estado final por añadirse
  // la clase en el mismo tick que se crea el elemento.
  void glow.offsetWidth;
  glow.classList.add('wrap-in');

  setTimeout(() => {
    if (state.modeState !== ms) return; // se pudo salir del modo Boss mientras se envolvía en luz
    // La luz cubre el sprite del todo en este punto (opacity:1, mix-blend
    // screen sobre fondo blanco puro): es el momento seguro para cambiar
    // el id, el sprite, el nombre, los tipos y los movimientos por dentro
    // sin que llegue a verse.
    // La escala (scaleAdj) que ya tenía el jefe con su forma ANTERIOR se
    // conserva tal cual con la forma nueva -se lee antes de sobreescribir
    // boss.sprite, justo debajo-, para que la transformación no cambie de
    // tamaño en mitad de la pelea; el offsetY vertical sí se recalcula
    // para el id de destino, ya que depende de cómo esté dibujado ese
    // sprite en concreto, no de la escala que tuviera el anterior.
    const { scaleAdj: keepScaleAdj } = getBossSpriteAdjustment(boss.sprite);
    boss.id = targetTemplate.id;
    boss.sprite = targetTemplate.sprite;
    boss.name = targetTemplate.name;
    boss.types = targetTemplate.types;
    boss.moves = targetTemplate.moves;
    bossSlot.sprite.setDex(targetTemplate.sprite);
    applyBossSpriteAdjustment(spriteEl, targetTemplate.sprite, keepScaleAdj);
    bossSlot.sprite.play('Walk', arenaDirectionFor('right'), true, null, BOSS_ANIM_SPEED);
    const nameEl = $(nameElId);
    if (nameEl) nameEl.textContent = boss.name;

    setTimeout(() => {
      if (state.modeState !== ms) { glow.remove(); return; }
      glow.classList.add('fade-out');
      setTimeout(() => {
        glow.remove();
        if (state.modeState !== ms) return;
        addChatMessage(null, `✨ ¡${boss.name} ha adoptado su nueva forma!`, 'system', { mirror: false });
        ms.phase = 'fight';
        scheduleBossTick();
      }, BOSS_MIDFIGHT_TRANSFORM_REVEAL_MS);
    }, BOSS_MIDFIGHT_TRANSFORM_HOLD_MS);
  }, BOSS_MIDFIGHT_TRANSFORM_WRAP_MS);
}

// Actualiza el fondo del mapa (#boss-map-inner) a partir de ms.bossLevel,
// consultando primero BOSS_LEVEL_BACKGROUNDS (ver bossLevelBackgroundsDb.js):
// si el nivel actual tiene imagen propia (niveles 2 a 20), se sobreescribe
// la custom property --boss-map-bg-image de ese elemento con esa imagen;
// si no la tiene (nivel 1, o cualquier nivel fuera de rango), se retira
// cualquier valor inline que hubiera quedado de un nivel anterior, así que
// el elemento cae de vuelta al valor por defecto fijado en la propia hoja
// de estilos (el fondo original del nivel 1, ver .boss-map-inner en
// styles.css). El resto de sub-propiedades del fondo (repeat/size/
// position) y la capa de degradado que oscurece la zona inferior no
// cambian nunca, solo la imagen de base.
function updateBossMapBackground() {
  const ms = state.modeState;
  const mapInner = $('boss-map-inner');
  if (!ms || !mapInner) return;
  const bg = getBossLevelBackground(ms.bossLevel);
  if (bg) {
    mapInner.style.setProperty('--boss-map-bg-image', `url('${bg}')`);
  } else {
    mapInner.style.removeProperty('--boss-map-bg-image');
  }
}

// Genera el HTML de las 15 marcas de la barra de fases del nivel actual
// (una por cada fase de BOSS_STAGES_PER_LEVEL), usada tanto al montar la
// pantalla de juego (ver más arriba) como al refrescarla en cada cambio de
// fase/nivel (ver updateBossLevelText, justo debajo). Cada marca lleva:
//  - un tamaño estándar, salvo la de la fase intermedia (10, ver
//    BOSS_PHASE_FIVE_STAGE) que es más grande para destacarla como hito, y
//    la de la fase final (15, ver BOSS_FINAL_STAGE) que es más grande
//    todavía, para marcarla como el cierre del nivel.
//  - un estado visual: "done" para las fases ya superadas (anteriores a
//    currentStage), "current" para la fase que se está jugando ahora mismo,
//    y sin clase de estado (pendiente) para las que quedan por delante.
function renderBossPhaseMarksHtml(currentStage) {
  let html = '';
  for (let phase = 1; phase <= BOSS_STAGES_PER_LEVEL; phase++) {
    const classes = ['boss-phase-mark'];
    if (phase === BOSS_PHASE_FIVE_STAGE) classes.push('boss-phase-mark--milestone');
    if (phase === BOSS_FINAL_STAGE) classes.push('boss-phase-mark--final');
    if (phase < currentStage) classes.push('boss-phase-mark--done');
    else if (phase === currentStage) classes.push('boss-phase-mark--current');
    html += `<span class="${classes.join(' ')}" data-phase="${phase}"></span>`;
  }
  return html;
}

// Actualiza el indicador "Nivel X" + barra de fases que se ve centrado en
// la parte superior de la pantalla de juego, a partir de ms.bossLevel /
// ms.bossStage (ver spawnNewBoss). El nivel se muestra como texto al
// principio, antes de la barra (ver plantilla más arriba), y la barra en
// sí se redibuja entera con renderBossPhaseMarksHtml cada vez que cambia la
// fase o el nivel, ya que solo son 15 marcas y no compensa parchear cada
// una a mano. También refresca el fondo del mapa (ver
// updateBossMapBackground): ambas cosas dependen del mismo ms.bossLevel y
// cambian juntas cada vez que se sube de nivel, así que viven en la misma
// función para no desincronizarse.
function updateBossLevelText() {
  const ms = state.modeState;
  const el = $('boss-level-text');
  if (!ms || !el) return;
  const levelNum = $('boss-level-num');
  const phaseTrack = $('boss-phase-track');
  if (levelNum) levelNum.textContent = ms.bossLevel;
  if (phaseTrack) phaseTrack.innerHTML = renderBossPhaseMarksHtml(ms.bossStage);
  updateBossMapBackground();
}

// Barra de vida flotante del enemigo: mismo criterio de color que la de los
// luchadores aliados (ver updateDuelHP) — verde por defecto, amarillo al
// 50% de vida o menos, rojo al 25% o menos.
function updateBossHPBar() {
  const ms = state.modeState;
  if (!ms) return;
  // Actualiza la barra de CADA jefe presente (ms.boss siempre; ms.boss2
  // solo en la fase final de los niveles con dos jefes a la vez, ver
  // BOSS_FINAL_BOSS_NAMES): cada uno refleja su propia vida, ya esté vivo o
  // ya haya caído (0%), independientemente del otro.
  [
    { boss: ms.boss, hpFillId: 'boss-hp-fill' },
    { boss: ms.boss2, hpFillId: 'boss-hp-fill-2' },
  ].forEach(({ boss, hpFillId }) => {
    if (!boss) return;
    const pct = Math.max(0, (boss.currentHp / boss.maxHp) * 100);
    const hpFill = $(hpFillId);
    if (!hpFill) return;
    const colorClass = pct <= 25 ? ' low' : pct <= 50 ? ' mid' : '';
    hpFill.className = 'boss-enemy-hpfill' + colorClass;
    hpFill.style.width = pct + '%';
  });
}

// El combatiente actual ha caído: su duelo termina y vuelve caminando a su
// propio puesto para descansar allí, reproduciendo "Sleep" en vez de su
// "Walk" habitual (ver playFighterRestAnim, dentro de sendFighterHome), sin
// poder volver a ser elegido (ver el aviso en selectChallenger) hasta que
// reviva de golpe al caer el jefe de la fase final del nivel (ver
// bossDefeated). El jefe conserva la vida que le quede.
//
// Si con esta derrota TODOS los combatientes apuntados se quedan a la vez
// sin vida, la partida termina aquí mismo (ver allFightersDefeated /
// triggerBossGameOver), aunque el jefe siga en pie.
function endDuel() {
  const ms = state.modeState;
  if (!ms || !ms.battle) return;
  const user = ms.battle.player.user;
  addChatMessage(null, `💀 ¡${ms.battle.player.pokemon.name} de @${user} cae derrotado! El streamer puede elegir a otro combatiente para seguir el duelo.`, 'system', { mirror: false });
  ms.activeUser = null;
  ms.battle = null;
  // Al perder toda la vida se ignora de inmediato su vuelo/levitación (no
  // hace falta esperar a que termine de caminar de regreso a su puesto).
  setFighterGrounded(user, true);
  sendFighterHome(user);
  renderBossPlayersZone();
  renderDuelPanel();

  if (allFightersDefeated(ms)) triggerBossGameOver();
  else maybeStartBossAfkChallengerVote();
}

// Indica si TODOS los combatientes apuntados a este Boss están derrotados
// (0 de vida) a la vez ahora mismo (ver isFighterFainted): la condición que
// termina la partida (ver triggerBossGameOver, llamado desde endDuel justo
// después de que caiga el último en pie). Si todavía no se ha apuntado
// nadie (no debería darse en pleno combate: startBossFight exige al menos 1
// combatiente para arrancar) se considera que no, para no disparar un fin
// de partida vacío.
function allFightersDefeated(ms) {
  const users = Object.keys(ms.players);
  return users.length > 0 && users.every(u => isFighterFainted(u));
}

// Todos los combatientes apuntados se han quedado sin vida a la vez: la
// partida termina aquí (el jefe puede seguir con vida de sobra). Se congela
// el combate — ms.phase pasa a 'gameover', lo que basta para que
// scheduleBossTick/bossAutoTick dejen de actuar y el resto de acciones que
// ya comprueban ms.phase === 'fight' (!ready, !habilidad1/2, panel de
// objetos, elegir combatiente) queden bloqueadas — y se muestra la pantalla
// de fin de partida, con un botón para volver al menú (ver backToMenu en
// modeLauncher.js). El progreso ya guardado (ver saveBossProgress) no se
// toca aquí: la próxima partida retomará el punto de guardado más reciente,
// el de la fase 1 de este mismo nivel.
function triggerBossGameOver() {
  const ms = state.modeState;
  if (!ms || ms.phase === 'gameover') return;
  ms.phase = 'gameover';
  playBossGameOver();

  addChatMessage(null, `💀 ¡Todos los combatientes han caído derrotados! Fin de la partida frente a ${bossDisplayName(ms)} (Nivel ${ms.bossLevel}, Fase ${ms.bossStage}/${BOSS_STAGES_PER_LEVEL}).`, 'system');

  const ranked = Object.entries(ms.players).sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 10);
  let statsHtml = '';
  if (ranked.length) {
    statsHtml = '<div class="modal-stats-title" style="font-size:12px;color:var(--muted);margin-top:16px;margin-bottom:4px;">🏆 Top Daño a este jefe</div>'
      + '<div class="modal-stats-list">' + ranked.map(([u, p], i) => `
        <div class="modal-stats-row ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
          <span class="modal-stats-pos">${i + 1}</span>
          <span class="modal-stats-name">@${escapeHtml(u)}</span>
          <span class="modal-stats-count">${p.dmg} dmg</span>
        </div>
      `).join('') + '</div>';
  }

  showModal(
    '💀 ¡Fin de la partida!',
    `<p>Todos los combatientes han caído derrotados frente a ${escapeHtml(bossDisplayName(ms))}.</p>
     <p style="text-align:center;color:var(--muted);font-size:12px;">Nivel ${ms.bossLevel} · Fase ${ms.bossStage}/${BOSS_STAGES_PER_LEVEL}</p>
     ${statsHtml}`,
    [{ label: 'Salir al menú', onClick: backToMenu }]
  );
}

// El jefe ha caído derrotado: se reparten recompensas según el daño hecho
// a ESTE jefe, el combatiente ganador vuelve caminando a su puesto (igual
// que si hubiera sido swapeado) y, tras una breve pausa, aparece un nuevo
// jefe distinto entrando desde el borde derecho de la pantalla (ver
// spawnNewBoss): el combate contra el jefe es interminable, no termina el
// modo.
// Se llama cuando UN jefe en concreto (bossSlot) acaba de quedarse a 0 de
// vida (ver performDuelAttack, tanto en la resolución normal de un golpe
// del combatiente como en el reflejo del Casco Dentado durante el turno
// del propio jefe): con un solo jefe en la fase, esto es siempre el fin de
// la fase (ver bossDefeated). Con dos jefes a la vez (ver
// BOSS_FINAL_BOSS_NAMES/ms.boss2), si el OTRO sigue con vida, la fase no
// termina — solo se deja constancia visual de que este ha caído (atenuado,
// para distinguirlo del que sigue en pie) y el combate continúa solo
// contra el superviviente, sin más intervención: currentBossTarget/
// currentBossAttacker ya ignoran automáticamente a los jefes a 0 de vida.
function resolveBossSlotFaint(bossSlot) {
  const ms = state.modeState;
  if (!ms || !bossSlot) return;
  // _faintAnnounced evita anunciar dos veces la caída del mismo jefe si,
  // por lo que sea, se llega a llamar más de una vez (p.ej. un reflejo del
  // Casco Dentado que remata a un jefe que ya estaba a 0 por otro motivo).
  if (bossSlot.boss._faintAnnounced) {
    if (allBossesDefeated(ms)) bossDefeated();
    return;
  }
  bossSlot.boss._faintAnnounced = true;
  const zoneEl = $(bossSlot.zoneId);
  if (zoneEl) zoneEl.style.opacity = '0.35';
  if (allBossesDefeated(ms)) {
    bossDefeated();
  } else {
    addChatMessage(null, `💀 ¡${bossSlot.boss.name} cae derrotado! El combate sigue contra el jefe que queda en pie.`, 'system', { mirror: false });
  }
}

function bossDefeated() {
  const ms = state.modeState;
  if (!ms) return;
  const winnerUser = (ms.battle && ms.battle.player.user) || null;
  const defeatedBossName = bossDisplayName(ms);
  // Se comprueba ANTES de que nada más toque ms.bossStage (eso solo pasa
  // más tarde, dentro de spawnNewBoss): si el jefe recién derrotado era el
  // de la fase final del nivel (fase 15), todos los combatientes apuntados
  // recuperan toda su vida y los que estaban derrotados (0 de vida) reviven
  // de golpe.
  const wasFinalStage = isFinalStage(ms);

  // Cofre de objetos (ver BOSS_ITEMS/openBossChestModal): se gana uno cada
  // vez que cae el jefe de la fase intermedia (BOSS_PHASE_FIVE_STAGE, 10) o
  // el de la fase final (BOSS_FINAL_STAGE, 15) de un nivel. Se comprueba
  // con ms.bossStage TAL Y COMO está ahora (la fase que se acaba de
  // superar): más abajo spawnNewBoss() es quien la avanza.
  const chestEarned = ms.bossStage === BOSS_PHASE_FIVE_STAGE || wasFinalStage;
  ms.activeUser = null;
  ms.battle = null;
  if (winnerUser) {
    setFighterGrounded(winnerUser, true);
    sendFighterHome(winnerUser);
  }
  renderBossPlayersZone();
  renderDuelPanel();

  const ranked = Object.entries(ms.players).sort((a, b) => b[1].dmg - a[1].dmg);
  ranked.forEach(([u, p], i) => {
    const reward = Math.floor(p.dmg / 10) + (i === 0 ? 500 : i === 1 ? 300 : i === 2 ? 150 : 50);
    addScore(u, reward);
  });
  const winner = ranked[0];
  addChatMessage(null, `🏆 ¡${defeatedBossName} ha sido derrotado! ${winner ? `MVP: @${winner[0]} con ${winner[1].dmg} de daño. ¡Repartidas recompensas!` : '¡Victoria colectiva!'}`, 'system');

  if (chestEarned) {
    ms.chestsAvailable = (ms.chestsAvailable || 0) + 1;
    updateBossChestButton();
    // El combate queda en pausa (ver ms.phase, comprobado por
    // selectChallenger/handleBossReady/bossAutoTick) hasta que el streamer
    // elija un objeto del cofre (ver openBossChestModal/
    // resolveBossChestChosen): no hay forma de seguir jugando sin elegir
    // uno, ni cerrando el modal ni dejando pasar el tiempo.
    ms.phase = 'chestPause';
    addChatMessage(null, wasFinalStage
      ? `🎁 ¡Cofre conseguido por superar la fase final! El combate queda en pausa: el streamer debe abrir el cofre desde el botón 🎁 y elegir un objeto entre 3 al azar para que empiece el nivel siguiente.`
      : `🎁 ¡Cofre conseguido por superar la fase ${ms.bossStage}! El combate queda en pausa: el streamer debe abrir el cofre desde el botón 🎁 y elegir un objeto entre 3 al azar para continuar.`, 'system', { mirror: false });
  }

  if (wasFinalStage) {
    Object.entries(ms.players).forEach(([u, p]) => {
      p.hp = playerEffectiveStats(ms, u).maxHp;
      // Actualiza también, al instante, la barra de vida flotante de cada
      // uno mientras esperan (ver updateWaitingFighterHP): ya no solo
      // "Sleep" -> "Walk" (ver playFighterRestAnim más abajo), sino
      // también la barra vuelve a verse llena de golpe.
      updateWaitingFighterHP(u);
    });
    // Todos los que estaban descansando derrotados (reproduciendo "Sleep")
    // despiertan de golpe y retoman su "Walk" normal de espera. El
    // ganador del duelo ya está de camino a su puesto (ver sendFighterHome
    // más arriba); su propio callback de llegada recogerá esta vida ya
    // actualizada al reproducir su animación de espera (ver
    // playFighterRestAnim), así que aquí no hace falta tocarlo aparte.
    Object.keys(ms.fighterSprites).forEach(u => {
      if (u !== winnerUser) playFighterRestAnim(u);
    });
    addChatMessage(null, `✨ ¡Al caer el jefe de la fase final, todos los Pokémon recuperan toda su vida y los derrotados reviven!`, 'system', { mirror: false });
  }

  // El daño se resetea de cara al siguiente jefe: el ranking "Top Daño"
  // siempre refleja el combate contra el jefe actual, no el acumulado de
  // todos los que ya han caído.
  Object.values(ms.players).forEach(p => { p.dmg = 0; });
  renderBossRanking();

  if (wasFinalStage) {
    // El paso al nivel siguiente no usa el temporizador fijo de siempre
    // (BOSS_NEW_BOSS_DELAY_MS): espera a que el streamer ELIJA un objeto
    // del cofre recién ganado (ver resolveBossChestChosen, llamada desde
    // openBossChestModal solo al elegir uno de los 3 — ya no se puede
    // cerrar el modal sin elegir), y entonces se dispara con un fundido a
    // negro (ver runBossLevelTransition).
    ms.pendingLevelTransition = true;
  } else if (chestEarned) {
    // Fase 5: mismo bloqueo que en la fase final (ver arriba), pero sin
    // fundido a negro ni cambio de nivel — resolveBossChestChosen llama
    // directamente a spawnNewBoss() en cuanto el streamer elige objeto.
    ms.pendingStageAdvance = true;
  } else {
    setTimeout(() => {
      if (state.modeState === ms) spawnNewBoss();
    }, BOSS_NEW_BOSS_DELAY_MS);
  }
}

// Fundido a negro de la transición al nivel siguiente: se llama al superar
// la fase final (15) de un nivel, en cuanto el streamer resuelve el cofre
// que gana (ver resolveBossChestClosed). La pantalla se cubre del todo de
// negro (BOSS_LEVEL_FADE_MS) ANTES de tocar nada del combate; solo con ya
// completamente negra se llama a spawnNewBoss() (que monta detrás el jefe
// y el nivel nuevos, sin que llegue a verse el cambio) y, tras un breve
// respiro (BOSS_LEVEL_FADE_HOLD_MS), se hace el fundido inverso para
// revelarlo — mismo mecanismo que las transiciones de noche de los modos
// Pokerus/Zoroarks, aunque aquí sin ninguna secuencia de rótulos.
function runBossLevelTransition() {
  const ms = state.modeState;
  const overlay = $('boss-level-fade-overlay');
  // Por si la escena no estuviera montada (no debería darse: solo se llama
  // en pleno combate, ver bossDefeated), se pasa igualmente al nivel
  // siguiente sin fundido, para no dejar la partida bloqueada.
  if (!ms || !overlay) { spawnNewBoss(); return; }
  overlay.classList.add('show');
  setTimeout(() => {
    if (state.modeState !== ms) return; // se pudo salir del modo mientras se fundía a negro
    spawnNewBoss();
    setTimeout(() => {
      if (state.modeState !== ms) return;
      overlay.classList.remove('show');
    }, BOSS_LEVEL_FADE_HOLD_MS);
  }, BOSS_LEVEL_FADE_MS);
}


// Muestra el panel de cambio de Pokémon al principio de la fase 1 de un
// nivel (ver ms.phase === 'levelSelect', fijado justo antes desde
// spawnNewBoss): actualiza su título con el nivel/fase actuales y lo
// revela. El combate queda en pausa mientras tanto (ver selectChallenger/
// bossAutoTick, y scheduleBossTick que deja de reprogramarse solo al
// comprobar ms.phase !== 'fight') hasta que el streamer pulse "Avanzar"
// (ver advanceBossLevelSelect).
function showBossLevelSelectPanel() {
  const ms = state.modeState;
  const panel = $('boss-levelselect-panel');
  if (!ms || !panel) return;
  const titleEl = $('boss-levelselect-title');
  if (titleEl) titleEl.textContent = `🔄 Nivel ${ms.bossLevel} · Fase 1/${BOSS_STAGES_PER_LEVEL}`;
  panel.style.display = 'flex';
}

// Se llama al pulsar "Avanzar" en el panel de arriba: cierra el panel y
// reanuda el combate, retomando el bucle de turnos (ver scheduleBossTick,
// que se había dejado de reprogramar solo al entrar en esta pantalla). A
// diferencia de antes, esto YA NO bloquea los cambios de Pokémon ni de
// objetos: siguen admitidos mientras dura la fase 1 (ver
// bossChangesAllowed), incluso con el combate ya en marcha, hasta que el
// streamer elija a su primer combatiente (ver selectChallenger, que es
// quien de verdad los bloquea).
function advanceBossLevelSelect() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'levelSelect') return;
  ms.phase = 'fight';
  const panel = $('boss-levelselect-panel');
  if (panel) panel.style.display = 'none';
  addChatMessage(null, `▶️ ¡Empieza el combate! Los combatientes ya apuntados todavía pueden cambiar de Pokémon y el streamer objetos hasta que se elija con quién luchar primero.`, 'system');
  scheduleBossTick();
  maybeStartBossAfkChallengerVote();
}

// Acerca la cámara (zoom sobre #boss-map-inner, recortado por el
// overflow:hidden de #boss-scene que lo contiene) al punto (x,y) indicado,
// en el mismo sistema de % que usa el resto de coordenadas del mapa
// (BOSS_ENEMY_SPOT, BOSS_PLAYER_SLOTS...), dejando ese punto CENTRADO en
// la pantalla mientras dura el zoom. Se usa al llegar el jefe de la fase
// final a su puesto (ver spawnNewBoss). Al ser #boss-map-inner el elemento
// que escala -y no #boss-scene- el zoom deja completamente quietos a los
// elementos que viven fuera de él dentro de #boss-scene, como los botones
// de la esquina o el indicador "Nivel X · Fase Y/10" (ver el comentario
// junto a .boss-map-inner en styles.css). Mismo cálculo de transform-origin
// que zorZoomCameraTo en zoroarks.js (ver el comentario allí para el
// razonamiento de la fórmula).
// Calcula la escala de zoom que le corresponde al jefe (o a los dos, si la
// fase final trae dos a la vez) que se acaba de plantar en su puesto, a
// partir de scaleAdj (ver BOSS_SPRITE_ADJUSTMENTS/getBossSpriteAdjustment
// en bossSpriteAdjustmentsDb.js): ese valor ya describe cuánto más grande
// o pequeño queda el sprite de este jefe en concreto respecto al tamaño
// base de la fase final (2.7x, fijo en CSS, ver .boss-sprite), así que
// basta con dividir BOSS_CAMERA_ZOOM_SCALE (el zoom "de referencia" para
// un scaleAdj de 1.00) entre ese mismo scaleAdj para que el encuadre
// resultante ocupe siempre una proporción parecida de la pantalla,
// amplíe un poco más que el propio sprite y no un tamaño idéntico para
// jefes de tamaños muy distintos (p.ej. Arceus, scaleAdj 1.50, frente a
// Aegislash Espada, scaleAdj 0.56). BOSS_CAMERA_ZOOM_MIN_SCALE/MAX_SCALE
// acotan el resultado para que ningún caso extremo se quede casi sin
// zoom o se pase de largo. Con dos jefes a la vez se usa el mayor de los
// dos scaleAdj (el que da MENOS zoom): así el encuadre, ya centrado en el
// punto medio entre ambos puestos (ver la llamada en spawnNewBoss), deja
// sitio de sobra para los dos sin cortar al más grande de los dos.
function bossFinalStageZoomScale(ms, hasSecondBoss) {
  const adj1 = getBossSpriteAdjustment(ms.boss.sprite).scaleAdj;
  const adj2 = hasSecondBoss && ms.boss2 ? getBossSpriteAdjustment(ms.boss2.sprite).scaleAdj : adj1;
  const relevantAdj = Math.max(adj1, adj2) || 1;
  const scale = BOSS_CAMERA_ZOOM_SCALE / relevantAdj;
  return Math.min(BOSS_CAMERA_ZOOM_MAX_SCALE, Math.max(BOSS_CAMERA_ZOOM_MIN_SCALE, scale));
}

function bossZoomCameraTo(x, y, scale) {
  const map = $('boss-map-inner');
  if (!map) return;
  const s = scale || BOSS_CAMERA_ZOOM_SCALE;
  const originX = (50 - s * x) / (1 - s);
  const originY = (50 - s * y) / (1 - s);
  map.style.transformOrigin = `${originX}% ${originY}%`;
  // Fuerza el reflow para que el nuevo transform-origin quede aplicado
  // ANTES de cambiar la escala: si no, el navegador podría animar también
  // el origen del zoom (encuadre raro) en vez de solo el acercamiento.
  void map.offsetWidth;
  map.style.transform = `scale(${s})`;
}

// Deshace el zoom de bossZoomCameraTo y devuelve la cámara a su encuadre
// normal (misma transición definida en CSS para .boss-map-inner, pero a la
// inversa).
function bossResetCameraZoom() {
  const map = $('boss-map-inner');
  if (map) map.style.transform = '';
}

// Sustituye al jefe derrotado por otro distinto (nunca el mismo Pokémon que
// el anterior), elegido al azar de la misma Pokédex Nacional que usa el
// Coliseo del modo Arena, con su vida a tope. Entra caminando desde fuera
// de la pantalla, por el borde derecho (BOSS_ENTRY_START_X), hasta su
// puesto habitual (BOSS_ENEMY_SPOT), reproduciendo su animación PMD "Walk"
// durante el trayecto — nunca aparece de repente. Si el jefe que acaba de
// entrar es el de la fase final (15) del nivel, en cuanto termina de
// llegar a su puesto la cámara hace zoom sobre él durante
// BOSS_FINAL_STAGE_ZOOM_MS (ver bossZoomCameraTo/bossResetCameraZoom).
// Crea (si no existe ya) el segundo puesto de enemigo, con la misma
// estructura que #boss-enemies-zone (nombre, barra de vida flotante y
// sprite PMD, ver la plantilla de renderBoss), pero con ids propios
// (-2) y plantado en BOSS_ENEMY_SPOT_2. Se usa únicamente en la fase
// final de los niveles con dos jefes a la vez (ver
// BOSS_FINAL_BOSS_NAMES/spawnNewBoss); se destruye (ver
// destroyBossZone2) en cuanto se deja de necesitar, para no dejar un
// segundo jefe fantasma en las fases/niveles siguientes.
function ensureBossZone2() {
  let zone2 = $('boss-enemies-zone-2');
  if (zone2) return zone2;
  const mapInner = $('boss-map-inner');
  if (!mapInner) return null;
  zone2 = document.createElement('div');
  // "boss-enemy-large" fija desde el principio: el segundo jefe solo
  // existe en la fase final, así que siempre lleva el sprite grande (ver
  // comentario junto a ".boss-enemies-zone.boss-enemy-large" en
  // styles.css).
  zone2.className = 'boss-enemies-zone boss-enemy-large';
  zone2.id = 'boss-enemies-zone-2';
  zone2.innerHTML = `
    <div class="boss-enemy-info">
      <div class="boss-enemy-hpwrap"><div class="boss-enemy-hpfill" id="boss-hp-fill-2" style="width:100%"></div></div>
      <div class="boss-enemy-name" id="boss-name-text-2"></div>
    </div>
    <div class="pmd-slot boss-sprite" id="boss-sprite-2"></div>
  `;
  mapInner.appendChild(zone2);
  // Misma ficha al pasar el cursor que la del primer jefe (ver el
  // mouseenter añadido en renderBoss sobre #boss-name-text), leyendo
  // ms.boss2 en el momento del hover para que siga funcionando aunque
  // spawnNewBoss lo sustituya más tarde por otro jefe (esta zona, creada
  // una sola vez, se reutiliza sin recrearse mientras dure la fase final).
  const nameEl2 = $('boss-name-text-2');
  if (nameEl2) {
    nameEl2.onmouseenter = () => showBossEnemyFiche(state.modeState && state.modeState.boss2);
    nameEl2.onmouseleave = () => hideBossFiche();
  }
  return zone2;
}

// Quita del DOM el segundo puesto de enemigo (ver ensureBossZone2) y
// destruye su PMDSprite: se llama en cuanto ms.boss2 deja de existir (al
// pasar a una fase/nivel de un solo jefe), para no dejar rastro visual ni
// de estado del segundo jefe de la fase anterior.
function destroyBossZone2() {
  const ms = state.modeState;
  if (ms && ms.bossSprite2) { ms.bossSprite2.destroy(); ms.bossSprite2 = null; }
  const zone2 = $('boss-enemies-zone-2');
  if (zone2) zone2.remove();
}

function spawnNewBoss() {
  const ms = state.modeState;
  const zone = $('boss-enemies-zone');
  const spriteEl = $('boss-sprite');
  if (!ms || !zone || !spriteEl) return;
  // Por si ms.boss (o ms.boss2, ver más abajo) cayó primero en un combate
  // de dos jefes a la vez y quedó atenuado (ver resolveBossSlotFaint), se
  // restablece su opacidad normal ANTES de montar aquí al enemigo nuevo.
  zone.style.opacity = '';

  // Avanza a la siguiente fase (o, si se acaba de derrotar la fase final
  // del nivel, al siguiente nivel — y, tras el último nivel, se vuelve a
  // empezar por el nivel 1, ver comentario junto a BOSS_TOTAL_LEVELS).
  const leveledUp = isFinalStage(ms);
  // Nivel recién superado (su fase final, la 15, se acaba de derrotar):
  // se guarda ANTES de reasignar ms.bossLevel un poco más abajo, para
  // poder desbloquear con él los sprites especiales que le correspondan
  // (ver BOSS_UNLOCKABLE_SPRITES/unlockBossLevelSprites) sin importar a
  // qué nivel se salte a continuación (incluida la vuelta al 1 tras el
  // último, ver BOSS_TOTAL_LEVELS).
  const clearedLevel = ms.bossLevel;
  if (leveledUp) {
    ms.bossStage = 1;
    ms.bossLevel = ms.bossLevel >= BOSS_TOTAL_LEVELS ? 1 : ms.bossLevel + 1;
    // Nuevo nivel: se reabre la ventana de cambios de Pokémon y, para los
    // objetos ya equipados, la posibilidad de quitarlos o cambiarlos (ver
    // bossChangesAllowed) durante la fase 1 de este nivel — el streamer
    // decide entonces, desde el panel de objetos 🎒, cuáles sueltan a sus
    // combatientes (ver assignBossItem/openBossItemsPanel); ya no hay
    // ningún desequipado automático masivo aquí.
    ms.bossChangesLocked = false;
    // Se fija de inmediato el nuevo punto de guardado (ver
    // BOSS_PROGRESS_STORAGE_KEY/saveBossProgress), con ms.bossStage ya a 1
    // (recién asignado arriba): si el streamer sale del modo Boss más
    // tarde, o si más adelante todos los combatientes caen a la vez (ver
    // triggerBossGameOver), la próxima partida retomará este nivel desde su
    // fase 1 (ver loadSavedBossProgress en startBoss), con los objetos del
    // almacén tal y como estén en este momento.
    saveBossProgress(ms);
    // Nuevo nivel: se reinicia el registro de Pokémon ya vistos (ver
    // ms.bossLevelSeenIds/la exclusión más abajo), para que la regla de
    // "no repetir dentro del nivel" empiece de cero en la pool del nivel
    // que acaba de empezar.
    ms.bossLevelSeenIds = new Set();
    // Subida de nivel: el bando enemigo mejora una estadística al azar
    // (ataque, vida o velocidad), acumulándose para lo que quede de
    // partida (ver bossEffectiveStats). Mientras tanto, los aliados
    // pierden las mejoras que hubieran invertido con !levelup en el nivel
    // que acaba de terminar, para poder buildear desde cero en el nuevo
    // nivel (ver handleBossLevelUp).
    const stat = ['atk', 'hp', 'speed'][Math.floor(Math.random() * 3)];
    ms.enemyLevels[stat]++;
    // Al perder sus mejoras de !levelup del nivel que acaba de terminar, la
    // vida máxima de cada aliado vuelve a la base (BOSS_PLAYER_HP): como ya
    // se les acaba de curar del todo (o revivir) al derrotar al jefe de la
    // fase final (ver bossDefeated, justo antes de esta llamada), su vida
    // actual persistida se deja también a tope de esa nueva base, para que
    // nunca quede por encima de su (ahora menor) vida máxima.
    Object.values(ms.players).forEach(p => { p.levels = freshLevels(); p.hp = BOSS_PLAYER_HP; });
    Object.keys(ms.players).forEach(u => updateWaitingFighterHP(u));
    // Los bots no pueden escribir !levelup por chat para elegir sus
    // mejoras del nuevo nivel: se les reparten solas y al azar entre
    // ataque/vida/velocidad justo después del reseteo de arriba (ver
    // randomizeBotLevels), igual que si el streamer las hubiera repartido
    // por ellos.
    Object.values(ms.players).forEach(p => { if (p.isBot) randomizeBotLevels(ms, p); });
  } else {
    ms.bossStage++;
  }

  // El jefe que acaba de montarse arriba es el de la fase final (15) del
  // nivel: isFinalStage(ms) ya usa ms.bossStage tal y como ha quedado tras
  // el bloque de arriba (10 si es una fase normal recién avanzada; nunca
  // coincide con leveledUp, que deja ms.bossStage a 1).
  const arrivingFinalStage = isFinalStage(ms);

  // Música: ms.bossLevel y ms.bossStage ya reflejan aquí la fase/nivel a la
  // que se acaba de llegar (ver el bloque leveledUp/ms.bossStage++ de
  // arriba), así que ya se puede decidir qué pista toca sonar ahora (ver
  // updateBossMusic). Cubre los tres casos: fase normal siguiente dentro
  // del mismo nivel (no cambia nada, misma pista en bucle), llegada a la
  // fase final (15, pasa a la pista de jefe), y subida de nivel (pasa a la
  // pista del nivel nuevo — esto último ocurre en pleno fundido a negro,
  // ver runBossLevelTransition).
  updateBossMusic(ms);

  // En la fase final, se consulta primero BOSS_FINAL_BOSS_NAMES (ver
  // bossFinalBossDb.js): si el nivel tiene un jefe (o dos) fijado ahí, se
  // usa siempre ese, en vez de elegir al azar de la pool del nivel — y esa
  // fijación aplica cada vez que se llega a esa fase, no solo la primera.
  // Si el nivel no tiene entrada propia, o algún nombre no resuelve a una
  // ficha real, se cae de vuelta al sorteo de siempre entre toda la pool
  // del nivel, igual que en el resto de fases.
  const finalTemplates = arrivingFinalStage ? getBossFinalBossTemplates(ms.bossLevel, ARENA_POKEMON_DB) : null;

  // Fase intermedia (10) del nivel: igual que la fase final, se consulta
  // primero BOSS_PHASE_FIVE_BOSS_NAMES (ver bossPhaseFiveBossDb.js); si el
  // nivel tiene un jefe fijado ahí, se usa siempre ese en vez de sortear de
  // la pool del nivel. Nunca coincide con arrivingFinalStage (fases 10 y 15
  // son distintas), así que ambas comprobaciones son mutuamente excluyentes.
  const arrivingPhaseFive = !leveledUp && ms.bossStage === BOSS_PHASE_FIVE_STAGE;
  const phaseFiveTemplates = arrivingPhaseFive ? getBossPhaseFiveBossTemplates(ms.bossLevel, ARENA_POKEMON_DB) : null;

  const previousId = ms.boss.id;
  const levelPool = getBossLevelPool(ms.bossLevel, ARENA_POKEMON_DB);
  // Dentro de un mismo nivel, un Pokémon que ya ha salido como enemigo
  // (ver ms.bossLevelSeenIds, reiniciado al empezar el nivel) no puede
  // volver a salir mientras queden otros de la pool sin usar: se excluyen
  // todos los ya vistos, no solo el que se acaba de derrotar. Si la pool
  // se agota (p. ej. el Nivel 19 de los Ultraentes, con solo 11 posibles)
  // se permite repetir: se reinicia el registro de vistos y se vuelve a
  // sortear entre toda la pool del nivel, evitando aun así repetir de
  // inmediato el mismo enemigo que se acaba de derrotar.
  let pool = levelPool.filter(p => !ms.bossLevelSeenIds.has(p.id));
  if (!pool.length) {
    ms.bossLevelSeenIds = new Set();
    pool = levelPool.filter(p => p.id !== previousId);
  }
  const options = pool.length ? pool : levelPool;
  const bossStats = bossEffectiveStats(ms);
  // Fase final del nivel: la vida máxima de cada jefe se multiplica por
  // bossFinalStageHpMultiplier(ms.bossLevel) respecto a la de un Pokémon
  // normal a este mismo nivel (bossStats.maxHp, la misma base que usaría
  // cualquier otro enemigo de este nivel) — un multiplicador que crece un
  // poco en cada nivel (ver el comentario junto a esa función), no una
  // constante fija. Ataque y velocidad se dejan igual que en el resto de
  // fases: el aumento es solo de aguante, no de pegada.
  //
  // Con dos jefes a la vez (ver BOSS_DUAL_BOSS_HP_SHARE más abajo), cada
  // uno recibe solo una fracción de esa vida — no el 100% completo cada
  // uno, porque entre los dos habría que tumbar el doble de vida total sin
  // que el bando enemigo ataque más rápido para compensar (currentBossAttacker
  // los alterna, pero comparten la misma cadencia de turno que un jefe
  // único, ver sideSpeedValue). Con BOSS_DUAL_BOSS_HP_SHARE = 0.6 cada
  // jefe aguanta un 60% de la vida de un jefe único de esa fase, así que
  // entre los dos suman un 120% en vez de un 200%.
  //
  // Fase intermedia (10): mismo criterio, pero con
  // bossPhaseFiveHpMultiplier(ms.bossLevel) y solo cuando phaseFiveTemplates
  // ha resuelto a un jefe fijo de verdad (ver getBossPhaseFiveBossTemplates);
  // si el nivel no tiene entrada propia en BOSS_PHASE_FIVE_BOSS_NAMES y esta
  // fase cae al sorteo normal de la pool, el enemigo resultante NO recibe
  // este multiplicador — vida normal, igual que cualquier otra fase sin
  // jefe fijo. La fase intermedia nunca trae dos jefes a la vez, así que
  // BOSS_DUAL_BOSS_HP_SHARE no le afecta.
  const hasSecondBoss = !!(finalTemplates && finalTemplates[1]);
  const dualBossHpFactor = hasSecondBoss ? BOSS_DUAL_BOSS_HP_SHARE : 1;
  // Math.round: bossFinalStageHpMultiplier/bossPhaseFiveHpMultiplier y
  // dualBossHpFactor (0.6) son factores con decimales, así que sin redondear
  // aquí la vida máxima del jefe podría quedar con decimales (p. ej.
  // Basculegion con 143.5 de vida) en vez de un número entero.
  const bossMaxHp = Math.round(arrivingFinalStage
    ? bossStats.maxHp * bossFinalStageHpMultiplier(ms.bossLevel) * dualBossHpFactor
    : (phaseFiveTemplates ? bossStats.maxHp * bossPhaseFiveHpMultiplier(ms.bossLevel) : bossStats.maxHp));
  const buildBoss = (template) => ({ ...template, atk: bossStats.atk, currentHp: bossMaxHp, maxHp: bossMaxHp });

  const nextTemplate = finalTemplates
    ? finalTemplates[0]
    : (phaseFiveTemplates ? phaseFiveTemplates[0] : options[Math.floor(Math.random() * options.length)]);
  ms.boss = buildBoss(nextTemplate);
  // Nivel 6 / fase final: los dos jefes son Basculegion normal y
  // Basculegion Hembra (ver BOSS_FINAL_BOSS_NAMES); la ficha macho
  // (id 902) se llama solo "Basculegion" en ARENA_POKEMON_DB, igual que en
  // el resto de modos del juego, así que aquí se renombra a "Basculegion
  // Macho" solo para esta pantalla del combate doble, sin tocar la ficha
  // compartida (no se modifica ARENA_POKEMON_DB ni afecta a otros modos).
  if (arrivingFinalStage && ms.bossLevel === 6 && ms.boss.id === 902) {
    ms.boss.name = 'Basculegion Macho';
  }
  // Se marca como visto (ver ms.bossLevelSeenIds arriba) tanto si ha
  // salido por sorteo normal como si viene fijado (fase 10/15, ver
  // finalTemplates/phaseFiveTemplates): en cualquier caso ya ha aparecido
  // este nivel, así que un sorteo posterior no debe volver a repetirlo
  // mientras queden otros sin usar.
  ms.bossLevelSeenIds.add(ms.boss.id);
  // Segundo jefe simultáneo: solo cuando la fase final del nivel trae dos
  // nombres en BOSS_FINAL_BOSS_NAMES (ver getBossFinalBossTemplates). En
  // cualquier otro caso (incluida una fase final SIN entrada fija, que cae
  // al sorteo de siempre) se destruye cualquier resto del segundo jefe de
  // la fase/nivel anterior.
  if (hasSecondBoss) {
    ms.boss2 = buildBoss(finalTemplates[1]);
    ms.bossLevelSeenIds.add(ms.boss2.id);
  } else {
    ms.boss2 = null;
    destroyBossZone2();
  }
  ms.bossTurnPointer = 0;

  const nameEl = $('boss-name-text');
  if (nameEl) nameEl.textContent = ms.boss.name;
  updateBossLevelText();
  updateBossHPBar();
  updateBossCommandsBanner();
  // Tamaño del sprite del nuevo enemigo: grande solo en la fase final del
  // nivel (ver isFinalStage), normal en el resto. Igual para el segundo
  // jefe, si lo hay.
  spriteEl.classList.toggle('enemy-normal-size', !arrivingFinalStage);
  // Ver comentario junto a ".boss-enemies-zone.boss-enemy-large" en
  // styles.css: mantiene la base del sprite a la misma altura que uno
  // normal, alternando en la zona a la vez que en el propio sprite.
  zone.classList.toggle('boss-enemy-large', arrivingFinalStage);

  if (ms.bossSprite) ms.bossSprite.destroy();

  // Se coloca fuera de la pantalla, por el extremo derecho, sin animar el
  // salto (la escena recorta con overflow:hidden, así que no se ve): la
  // clase "no-anim" desactiva un instante la transición de left/top para
  // este salto inicial; se quita justo después para que sí se anime la
  // entrada de vuelta a su puesto.
  zone.classList.add('no-anim');
  zone.style.left = BOSS_ENTRY_START_X + '%';
  zone.style.top = BOSS_ENEMY_SPOT.y + '%';
  void zone.offsetWidth; // fuerza el reflow para que el salto no se anime
  zone.classList.remove('no-anim');

  ms.bossSprite = new PMDSprite(spriteEl, getPokemonSprite(ms.boss.sprite), { uncapped: true });
  ms.bossSprite.setDex(ms.boss.sprite);
  applyBossSpriteAdjustment(spriteEl, ms.boss.sprite);
  // Misma dirección que su pose de espera habitual (mirando hacia la
  // izquierda, hacia los combatientes): al entrar caminando desde la
  // derecha, avanza en esa misma dirección.
  ms.bossSprite.play('Walk', arenaDirectionFor('right'), true, null, BOSS_ANIM_SPEED);

  let zone2 = null;
  if (hasSecondBoss) {
    zone2 = ensureBossZone2();
    if (zone2) {
      zone2.style.opacity = '';
      const spriteEl2 = $('boss-sprite-2');
      const nameEl2 = $('boss-name-text-2');
      if (nameEl2) nameEl2.textContent = ms.boss2.name;
      zone2.classList.add('no-anim');
      zone2.style.left = BOSS_ENTRY_START_X + '%';
      zone2.style.top = BOSS_ENEMY_SPOT_2.y + '%';
      void zone2.offsetWidth;
      zone2.classList.remove('no-anim');
      spriteEl2.classList.toggle('enemy-normal-size', !arrivingFinalStage);
      if (ms.bossSprite2) ms.bossSprite2.destroy();
      ms.bossSprite2 = new PMDSprite(spriteEl2, getPokemonSprite(ms.boss2.sprite), { uncapped: true });
      ms.bossSprite2.setDex(ms.boss2.sprite);
      applyBossSpriteAdjustment(spriteEl2, ms.boss2.sprite);
      ms.bossSprite2.play('Walk', arenaDirectionFor('right'), true, null, BOSS_ANIM_SPEED);
    }
  }

  requestAnimationFrame(() => {
    zone.style.left = BOSS_ENEMY_SPOT.x + '%';
    if (zone2) zone2.style.left = BOSS_ENEMY_SPOT_2.x + '%';
  });

  if (arrivingFinalStage) {
    // Zoom de cámara de 3 segundos en cuanto termina de llegar a su puesto:
    // se espera al evento "transitionend" de la propia transición de
    // "left" (ver .boss-enemies-zone en styles.css) en vez de un
    // temporizador fijo, para que el zoom arranque exactamente cuando ha
    // llegado, ni antes ni después. {once:true} lo desengancha solo tras
    // dispararse una vez. Con dos jefes, el zoom se centra en el punto
    // medio entre ambos puestos, para que se vean los dos a la vez, y la
    // escala (ver bossFinalStageZoomScale) tiene en cuenta al más grande
    // de los dos para no recortarlo.
    zone.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'left') return;
      const zoomY = zone2 ? (BOSS_ENEMY_SPOT.y + BOSS_ENEMY_SPOT_2.y) / 2 : BOSS_ENEMY_SPOT.y;
      const zoomScale = bossFinalStageZoomScale(ms, !!zone2);
      // Mientras dura el zoom (BOSS_FINAL_STAGE_ZOOM_MS) el streamer no
      // puede realizar ninguna acción: se reutiliza el mismo mecanismo de
      // pausa que 'chestPause'/'levelSelect' (ver selectChallenger,
      // handleBossReady, handleBossAbility, performDuelAttack y
      // scheduleBossTick, que ya comprueban todos ms.phase !== 'fight'),
      // así que basta con sacar la fase de 'fight' durante la ventana del
      // zoom para que quede todo bloqueado sin tocar cada función una a
      // una. A diferencia de esas otras pausas, esta no muestra ningún
      // panel ni espera ninguna decisión: se resuelve sola, pasados los
      // BOSS_FINAL_STAGE_ZOOM_MS, devolviendo la fase a 'fight' y
      // reanudando el bucle de turnos (scheduleBossTick) y la votación de
      // combatiente del Modo AFK si tocaba (maybeStartBossAfkChallengerVote),
      // exactamente igual que hace advanceBossLevelSelect al reanudar tras
      // su propia pausa.
      ms.phase = 'bossZoom';
      bossZoomCameraTo(BOSS_ENEMY_SPOT.x, zoomY, zoomScale);
      setTimeout(() => {
        bossResetCameraZoom();
        if (state.modeState !== ms || ms.phase !== 'bossZoom') return;
        ms.phase = 'fight';
        scheduleBossTick();
        maybeStartBossAfkChallengerVote();
      }, BOSS_FINAL_STAGE_ZOOM_MS);
    }, { once: true });
  }

  if (leveledUp) {
    // Al principio de la fase 1 de este nivel nuevo se pausa el combate y
    // se abre la ventana para cambiar de Pokémon (ver
    // showBossLevelSelectPanel/ms.phase === 'levelSelect'): no se reanuda
    // hasta que el streamer pulse "Avanzar" (ver advanceBossLevelSelect).
    ms.phase = 'levelSelect';
    showBossLevelSelectPanel();
    addChatMessage(null, `🎉 ¡Nivel superado! Comienza el Nivel ${ms.bossLevel}, Fase 1/${BOSS_STAGES_PER_LEVEL}: ¡aparece ${bossDisplayName(ms)}! Los objetos equipados vuelven a la mochila 🎒. Los combatientes ya apuntados pueden cambiar de Pokémon con !pokemon [nombre] hasta que se elija con quién luchar primero.`, 'system', { mirror: false });
    // Sprites especiales que se desbloqueen justo al superar la fase
    // final (15) de `clearedLevel` (ver BOSS_UNLOCKABLE_SPRITES en
    // data/bossUnlockableSpritesDb.js): un único aviso por chat, aparte
    // del de "Nivel superado" de arriba, que lista todos los nombres
    // recién desbloqueados a la vez -normalmente uno o dos por nivel,
    // salvo el nivel 9, que desbloquea de golpe las 26 megaevoluciones-
    // en vez de un mensaje repetido por cada sprite.
    const newlyUnlockedSprites = unlockBossLevelSprites(clearedLevel);
    if (newlyUnlockedSprites.length === 1) {
      addChatMessage(null, `🔓 ¡${newlyUnlockedSprites[0]} ya está desbloqueado! Puedes consultar su comando exacto en Ajustes → Comandos de Pokémon.`, 'system');
    } else if (newlyUnlockedSprites.length > 1) {
      addChatMessage(null, `🔓 ¡Ya están desbloqueados: ${newlyUnlockedSprites.join(', ')}! Puedes consultar su comando exacto en Ajustes → Comandos de Pokémon.`, 'system');
    }
  } else if (arrivingFinalStage) {
    addChatMessage(null, hasSecondBoss
      ? `⚠️ ¡Fase final del Nivel ${ms.bossLevel}! Dos enemigos mucho más grandes aparecen a la vez: ${bossDisplayName(ms)}!`
      : `⚠️ ¡Fase final del Nivel ${ms.bossLevel}! Un enemigo mucho más grande aparece: ${bossDisplayName(ms)}!`, 'system', { mirror: false });
  } else {
    addChatMessage(null, `👹 ¡Un nuevo enemigo aparece: ${bossDisplayName(ms)}! (Nivel ${ms.bossLevel}, Fase ${ms.bossStage}/${BOSS_STAGES_PER_LEVEL})`, 'system', { mirror: false });
  }

  // Nuevo jefe montado y nadie luchando todavía: en la subida de nivel
  // (leveledUp) esta fase de espera no cuenta, porque ms.phase acaba de
  // pasar a 'levelSelect' arriba (la votación, si toca, se dispara más
  // tarde desde advanceBossLevelSelect al pulsar "Avanzar").
  if (!leveledUp) maybeStartBossAfkChallengerVote();
}
