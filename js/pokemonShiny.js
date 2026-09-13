import { PMD_SHINY_ANIM_DB } from './data/pmdShinyAnimDb.js';

/* =========================================================
   SORTEO SHINY (0.5%) — compartido por todos los modos que usan
   !pokemon para inscribirse (Coliseo, Boss cooperativo, Pokerus,
   Rayo Solar, Zona Safari y El Volcán).
   -----------------------------------------------------------
   Un Pokémon solo puede salir shiny si tiene las CUATRO animaciones
   (Walk, Attack, Hurt y Sleep) shiny completas en el repositorio
   comunitario PMDCollab/SpriteCollab: esa lista ya viene filtrada de
   antemano en PMD_SHINY_ANIM_DB (ver js/data/pmdShinyAnimDb.js y
   README_PMD_SHINY.md). Si al Pokémon elegido le falta cualquiera de
   las cuatro, NO tiene ninguna posibilidad de salir shiny (no se
   sustituye por otro sprite ni por su versión normal con un tinte:
   simplemente nunca se marca como shiny) — por eso primero se
   comprueba pmdHasShinySprite() y solo si es true se hace el sorteo.
   -----------------------------------------------------------
   pokemon es siempre una entrada de ARENA_POKEMON_DB, un array
   compartido por todos los jugadores a la vez: nunca se debe mutar
   ese objeto original (afectaría a cualquier otro jugador que haya
   elegido el mismo Pokémon). rollShinyPokemon() por eso SIEMPRE
   devuelve una copia nueva (con isShiny añadido), y son esas copias
   -nunca la entrada original de ARENA_POKEMON_DB- las que hay que
   guardar en el estado del jugador (cola, campeón, combatiente...).
   ========================================================= */
export const SHINY_CHANCE = 0.005; // 0.5%

// Indica si un dex (el mismo id que usa ARENA_POKEMON_DB en su campo
// "sprite") tiene las cuatro animaciones shiny completas y por tanto
// puede llegar a salir shiny.
export function pmdHasShinySprite(dexId) {
  return !!PMD_SHINY_ANIM_DB[String(dexId).padStart(4, '0')];
}

// Devuelve SIEMPRE una copia nueva de "pokemon" (nunca el original de
// ARENA_POKEMON_DB) con isShiny:true/false ya decidido. Un 0.5% de
// probabilidad, y solo si pmdHasShinySprite(pokemon.sprite) es true.
export function rollShinyPokemon(pokemon) {
  const isShiny = pmdHasShinySprite(pokemon.sprite) && Math.random() < SHINY_CHANCE;
  return { ...pokemon, isShiny };
}
