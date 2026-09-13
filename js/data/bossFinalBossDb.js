/* =========================================================
   MODO BOSS COOPERATIVO — Jefe fijo de la fase final (15) de cada nivel
   ========================================================= */
// A diferencia de BOSS_LEVEL_POOLS (bossLevelPoolsDb.js), que solo
// acota de qué Pokémon puede tirar el sorteo en las fases 1-14 de un
// nivel, esta tabla FIJA el Pokémon exacto que aparece en la fase final
// (15, ver BOSS_FINAL_STAGE en boss.js) de cada nivel: en vez de salir al
// azar de la pool del nivel, spawnNewBoss() consulta primero esta tabla y,
// si el nivel tiene entrada aquí, usa siempre ese mismo Pokémon como jefe
// de fase final — el mismo cada vez que se llegue a esa fase, en vez de
// variar entre partidas.
//
// Formato: BOSS_FINAL_BOSS_NAMES[nivel] = array de 1 o 2 nombres (en
// minúsculas, tal cual aparecen en ARENA_POKEMON_DB, ver
// arenaPokemonDb.js). Los niveles con DOS nombres (6, 15 y 18 en la
// configuración actual) enfrentan a los combatientes con DOS jefes a la
// vez en esa fase final — ver ms.bosses en boss.js, que sustituye al
// antiguo ms.boss único cuando el nivel lo requiere: ambos jefes están
// vivos y atacan por turnos alternos, y hay que derrotarlos a los dos para
// superar la fase.
//
// Varios de estos jefes aparecen aquí en su forma BASE, no en la forma
// final que de hecho usan como jefe: se transforman solos a mitad de
// combate (al perder la mitad de su vida) a la forma que de verdad les
// corresponde como jefe — ver BOSS_MIDFIGHT_TRANSFORM_DB en
// bossMidfightTransformDb.js, que es quien fija a qué forma final llega
// cada uno y a qué porcentaje de vida ocurre el cambio (igual que ya hacía
// Wishiwashi antes de esta tabla). Afecta a los niveles 4 (Aegislash), 7
// (Meloetta), 8 (Shaymin), 9 (Lucario), 10 (Hoopa), 11 (Lugia), 12
// (Palkia), 13 (Kyurem), 15 (Zacian y Zamazenta, cada uno por su cuenta),
// 16 (Zygarde), 17 (Giratina), 18 (Groudon y Kyogre, cada uno por su
// cuenta) y 19 (Necrozma). El resto de niveles siguen apareciendo directos
// con su forma final de siempre, sin ningún cambio a mitad de combate.
export const BOSS_FINAL_BOSS_NAMES = {
  1: ['drapion'],
  2: ['marowak alola'],
  3: ['wishiwashi banco'],
  4: ['aegislash'],
  5: ['floette flor eterna'],
  6: ['basculegion', 'basculegion hembra'],
  7: ['meloetta'],
  8: ['shaymin'],
  9: ['lucario'],
  10: ['hoopa'],
  11: ['lugia'],
  12: ['palkia'],
  13: ['kyurem'],
  14: ['dialga primario'],
  15: ['zacian', 'zamazenta'],
  16: ['zygarde'],
  17: ['giratina'],
  18: ['groudon', 'kyogre'],
  19: ['necrozma'],
  20: ['arceus'],
};

// Resuelve BOSS_FINAL_BOSS_NAMES[nivel] a fichas completas de
// ARENA_POKEMON_DB (allPokemon), por nombre en minúsculas — mismo criterio
// de resolución que getBossLevelPool() en bossLevelPoolsDb.js. Devuelve
// null (nunca un array vacío o a medias) si el nivel no tiene entrada
// propia, o si alguno de sus nombres no resuelve a una ficha real (nombre
// mal escrito): en ambos casos spawnNewBoss() cae de vuelta a elegir al
// azar de la pool del nivel, como antes de esta funcionalidad, para que la
// fase final nunca se quede sin jefe por un dato mal cargado.
export function getBossFinalBossTemplates(level, allPokemon) {
  const names = BOSS_FINAL_BOSS_NAMES[level];
  if (!names || !names.length) return null;
  const byName = new Map(allPokemon.map(p => [p.name.toLowerCase(), p]));
  const resolved = names.map(n => byName.get(n.toLowerCase())).filter(Boolean);
  return resolved.length === names.length ? resolved : null;
}
