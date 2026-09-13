/* =========================================================
   CLASIFICACIÓN: VUELA/LEVITA vs TOCA EL SUELO
   -----------------------------------------------------------
   Basado en el análisis de los 930 sprites PMD disponibles en
   ARENA_POKEMON_DB (PMDCollab/SpriteCollab). Un Pokémon se
   considera "volador" si tiene tipo Volador y/o la habilidad
   Levitate (u otra característica de levitación equivalente).
   El resto se considera que "toca el suelo".

   Se identifica por número de Pokédex nacional (el mismo que el
   campo "sprite"/"id" de ARENA_POKEMON_DB), no por nombre, ya
   que algunos Pokémon (p. ej. los de Paradoja) tienen nombres en
   español distintos a los usados en la base de datos del juego.

   175 vuelan/levitan · 755 tocan el suelo · 930 clasificados (174 en
   FLYING_POKEMON_IDS + Gyarados como excepción tratada aparte, ver
   más abajo).

   Nota: 54 Pokémon presentes en ARENA_POKEMON_DB no tienen sprite
   PMD analizado (aún no están en la lista de origen), por lo que
   no aparecen en FLYING_POKEMON_IDS. isFlyingPokemon() los trata
   como "toca el suelo" por defecto. Entre ellos: Simisear,
   Simipour, Tranquill, Blitzle, Zebstrika, Throh, Crustle,
   Tirtouga, Carracosta, Amoonguss, Frillish, Shelmet, Stunfisk,
   Bouffalant, Pyroar, Aromatisse, Trumbeak, Toucannon, Gumshoos,
   Shiinotic, Oranguru, Rolycoly, Carkol, Coalossal, Barraskewda,
   Mr. Rime, Falinks, Cufant, Zarude, Glastrier, Dolliv, Maschiff,
   Mabosstiff, Shroodle, Grafaiai, Brambleghast, Toedscruel,
   Klawf, Rabsca, Espathra, Bombirdier, Flamigo, Brute Bonnet,
   Iron Treads, Iron Jugulis, Wo-Chien, Chien-Pao, Ting-Lu,
   Miraidon, Okidogi, Gouging Fire, Raging Bolt, Iron Boulder,
   Iron Crown.
   ========================================================= */

export const FLYING_POKEMON_IDS = new Set([
  12, 15, 22, 41, 42, 49, 74, 81, 82, 83, 92, 93,
  109, 110, 137, 142, 144, 145, 146, 150, 151, 164, 165,
  166, 169, 187, 188, 189, 193, 198, 200, 201, 207, 226, 227,
  233, 249, 250, 251, 267, 269, 278, 279, 284, 291, 292, 329,
  330, 333, 334, 337, 338, 343, 344, 351, 353, 355, 358, 373,
  374, 375, 380, 381, 384, 385, 414, 415, 416, 425, 426, 429,
  430, 433, 436, 437, 441, 455, 458, 462, 468, 469, 472, 474,
  477, 478, 479, 480, 481, 482, 488, 490, 491, 517, 518, 527,
  528, 561, 567, 577, 578, 579, 581, 587, 599, 600, 601, 602,
  603, 604, 605, 606, 608, 609, 615, 628, 635, 637, 662, 663,
  666, 669, 670, 671, 679, 680, 686, 703, 707, 708, 714, 715,
  717, 719, 738, 742, 743, 764, 781, 785, 786, 787, 788, 789,
  790, 792, 793, 797, 798, 803, 804, 822, 823, 826, 841, 854,
  855, 873, 885, 886, 887, 890, 894, 895, 940, 941, 955, 969,
  970, 987, 994, 1004, 1012, 1013, 1025,
]);

// Excepción: Gyarados (130) es de tipo Agua/Volador, pero visualmente no
// debe tratarse como "volador" (no debe flotar sin tocar el suelo como el
// resto de esta lista) — se excluye a propósito de FLYING_POKEMON_IDS en
// vez de incluirlo con el resto.

/**
 * Devuelve true si el Pokémon con ese número de Pokédex
 * vuela o levita, según la clasificación de sprites PMD.
 * @param {number} id - número de Pokédex nacional (sprite/id)
 */
export function isFlyingPokemon(id) {
  return FLYING_POKEMON_IDS.has(Number(id));
}
