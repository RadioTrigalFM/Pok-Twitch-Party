import { state } from './state.js';
import { BOSS_UNLOCKABLE_SPRITES } from './data/bossUnlockableSpritesDb.js';

/* =========================================================
   DESBLOQUEO DE SPRITES ESPECIALES DEL BOSS COOPERATIVO
   -----------------------------------------------------------
   Ver el comentario largo de bossUnlockableSpritesDb.js: unas pocas
   fichas de ARENA_POKEMON_DB (Wishiwashi Banco, Aegislash Espada,
   Floette Flor Eterna, Basculegion Hembra, Meloetta Danza, Shaymin
   Cielo) empiezan bloqueadas para !pokemon [nombre] en todos los modos
   que comparten ese comando, y se desbloquean para siempre en cuanto el
   streamer supera, en el modo Boss cooperativo, la fase final (15) del
   nivel que les corresponde (ver unlockBossLevelSprites, llamada desde
   spawnNewBoss en modes/boss.js).

   El desbloqueo se persiste en localStorage por separado del progreso
   de partida normal del Boss (ver BOSS_PROGRESS_STORAGE_KEY en
   modes/boss.js): ese progreso da vueltas (nivel 20 vuelve al nivel 1,
   ver BOSS_TOTAL_LEVELS) y puede reiniciarse, pero un sprite ya
   desbloqueado no debe volver a bloquearse nunca por eso.
   ========================================================= */

const BOSS_SPRITE_UNLOCKS_STORAGE_KEY = 'pokekukoro_boss_sprite_unlocks';

// Índice por nombre normalizado (minúsculas, mismo criterio que ya usa
// cada handleXxxJoin al comparar contra ARENA_POKEMON_DB) -> entrada de
// BOSS_UNLOCKABLE_SPRITES, para comprobar en O(1) si un nombre concreto
// pertenece a este sistema de bloqueo.
const LOCKED_BY_NAME = new Map(BOSS_UNLOCKABLE_SPRITES.map(e => [e.name.toLowerCase(), e]));

// Se llama una sola vez al arrancar (ver eventListeners.js, junto al
// resto de loadXxxPref), igual que loadSubsModePref en subsMode.js: si no
// hay nada guardado, o lo guardado es inválido o está corrupto, se
// empieza sin ningún sprite especial desbloqueado.
export function loadBossSpriteUnlocksPref() {
  try {
    const raw = localStorage.getItem(BOSS_SPRITE_UNLOCKS_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.unlockedBossSprites = new Set(parsed.filter(n => typeof n === 'string'));
      return;
    }
  } catch (e) {
    // localStorage puede no estar disponible (p.ej. en algunos navegadores
    // embebidos), o el JSON guardado puede venir corrupto: en ambos casos
    // se empieza sin nada desbloqueado.
  }
  state.unlockedBossSprites = new Set();
}

function saveBossSpriteUnlocks() {
  try {
    localStorage.setItem(BOSS_SPRITE_UNLOCKS_STORAGE_KEY, JSON.stringify([...state.unlockedBossSprites]));
  } catch (e) {
    // sin persistencia si localStorage no está disponible
  }
}

// Devuelve la entrada de BOSS_UNLOCKABLE_SPRITES para `name` (el nombre
// tal cual aparece en ARENA_POKEMON_DB, sin distinguir mayúsculas de
// minúsculas), o null si ese nombre no pertenece a ningún sprite
// bloqueable por este sistema (el resto de la Pokédex Nacional).
export function getBossSpriteLockEntry(name) {
  return LOCKED_BY_NAME.get(String(name).toLowerCase()) || null;
}

// Devuelve el mensaje de chat a mostrar si `name` todavía está
// bloqueado, o null si puede usarse sin más para apuntarse con
// !pokemon. Pensado para que cada handleXxxJoin (arena.js, boss.js,
// pokerus.js, rayosolar.js, safari.js, volcan.js) llame a esto justo
// después de resolver `pokemon` desde ARENA_POKEMON_DB, y corte ahí si
// no devuelve null — mismo patrón que ya usan con "no es un Pokémon
// válido" o con pmdHasLocalSprite.
export function bossSpriteLockBlockMessage(name, user) {
  const entry = getBossSpriteLockEntry(name);
  if (!entry) return null;
  if (state.unlockedBossSprites.has(entry.name.toLowerCase())) return null;
  return `🔒 @${user}: ${entry.name} todavía no está disponible para apuntarse. Se desbloquea al superar la Fase 15 del Nivel ${entry.level} en el modo Boss cooperativo.`;
}

// Se llama desde spawnNewBoss (modes/boss.js) justo al superar la fase
// final (15) de `level`: desbloquea para siempre todas las entradas de
// BOSS_UNLOCKABLE_SPRITES fijadas a ese nivel que todavía no lo
// estuvieran (normalmente una sola, salvo que en el futuro se añada más
// de una al mismo nivel) y devuelve esa lista recién desbloqueada -con
// su nombre tal cual aparece en ARENA_POKEMON_DB- para que boss.js pueda
// avisar por el chat. Devuelve un array vacío si ese nivel no
// desbloquea nada, o si ya estaba desbloqueado de una partida anterior.
export function unlockBossLevelSprites(level) {
  const newlyUnlocked = [];
  BOSS_UNLOCKABLE_SPRITES.forEach(entry => {
    if (entry.level !== level) return;
    const key = entry.name.toLowerCase();
    if (state.unlockedBossSprites.has(key)) return;
    state.unlockedBossSprites.add(key);
    newlyUnlocked.push(entry.name);
  });
  if (newlyUnlocked.length) saveBossSpriteUnlocks();
  return newlyUnlocked;
}
