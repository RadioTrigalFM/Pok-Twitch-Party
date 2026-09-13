/* =========================================================
   MODO BOSS COOPERATIVO — Jefe fijo de la fase intermedia (10) de cada nivel
   ========================================================= */
// Igual que BOSS_FINAL_BOSS_NAMES (ver bossFinalBossDb.js) pero para la
// fase 10 de cada nivel (mitad de camino hacia la fase final, ver
// BOSS_PHASE_FIVE_STAGE en boss.js): en vez de salir al azar de la pool
// del nivel, spawnNewBoss() consulta primero esta tabla y, si el nivel
// tiene entrada aquí, usa siempre ese mismo Pokémon como jefe de esa
// fase — el mismo cada vez que se llegue a ella, en vez de variar entre
// partidas. A diferencia de la fase final, aquí no hay niveles con doble
// jefe: cada entrada trae un único nombre.
//
// Formato: BOSS_PHASE_FIVE_BOSS_NAMES[nivel] = array de 1 nombre (en
// minúsculas, tal cual aparece en ARENA_POKEMON_DB, ver arenaPokemonDb.js).
//
export const BOSS_PHASE_FIVE_BOSS_NAMES = {
  1: ['talonflame'],
  2: ['exeggutor alola'],
  3: ['ludicolo'],
  4: ['staraptor'],
  5: ['leafeon'],
  6: ['raichu'],
  7: ['genesect'],
  8: ['mew'],
  9: ['sableye mega'],
  10: ['volcanion'],
  11: ['entei'],
  12: ['regigigas'],
  13: ['victini'],
  14: ['celebi'],
  15: ['urshifu'],
  16: ['diancie'],
  17: ['darkrai'],
  18: ['jirachi'],
  19: ['deoxys'],
  20: ['silvally'],
};

// Resuelve BOSS_PHASE_FIVE_BOSS_NAMES[nivel] a una ficha completa de
// ARENA_POKEMON_DB (allPokemon), por nombre en minúsculas — mismo criterio
// de resolución que getBossFinalBossTemplates() en bossFinalBossDb.js.
// Devuelve null si el nivel no tiene entrada propia, o si su nombre no
// resuelve a una ficha real (nombre mal escrito, o Pokémon aún sin dar de
// alta como el caso de Mega Ampharos): en ambos casos spawnNewBoss() cae
// de vuelta a elegir al azar de la pool del nivel, como en el resto de
// fases.
export function getBossPhaseFiveBossTemplates(level, allPokemon) {
  const names = BOSS_PHASE_FIVE_BOSS_NAMES[level];
  if (!names || !names.length) return null;
  const byName = new Map(allPokemon.map(p => [p.name.toLowerCase(), p]));
  const resolved = names.map(n => byName.get(n.toLowerCase())).filter(Boolean);
  return resolved.length === names.length ? resolved : null;
}
