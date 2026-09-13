/* =========================================================
   MODO BOSS COOPERATIVO — Placas de tipo de Arceus (jefe fijo de la
   fase final del nivel 20, ver BOSS_FINAL_BOSS_NAMES en bossFinalBossDb.js)
   ========================================================= */
// Mecánica especial exclusiva de ese combate (ver arceusPickBestType y el
// bloque que la usa en performDuelAttack, en boss.js): justo antes de
// atacar, Arceus cambia de tipo (y de sprite, a la placa asociada) al tipo
// más eficaz posible contra los tipos del Pokémon aliado que tiene delante
// en ese momento. Es un cambio de tipo puro -no una transformación de las
// de BOSS_MIDFIGHT_TRANSFORM_DB (bossMidfightTransformDb.js)-: no usa su
// animación de luz blanca y no le da a Arceus el +50% de ataque que sí
// reciben esas transformaciones (ver boss._midfightTransformed en
// performDuelAttack).
//
// Formato: ARCEUS_TYPE_FORM_NAMES[tipo] = nombre (en minúsculas, tal cual
// en ARENA_POKEMON_DB, ver arenaPokemonDb.js) de la placa de ese tipo.
// Cubre los 18 tipos: los 17 con placa propia más 'Normal', que es la
// propia forma base de Arceus (sin placa).
export const ARCEUS_TYPE_FORM_NAMES = {
  'Normal': 'arceus',
  'Bicho': 'arceus bicho',
  'Siniestro': 'arceus siniestro',
  'Dragón': 'arceus dragón',
  'Eléctrico': 'arceus eléctrico',
  'Lucha': 'arceus lucha',
  'Fuego': 'arceus fuego',
  'Volador': 'arceus volador',
  'Fantasma': 'arceus fantasma',
  'Planta': 'arceus planta',
  'Tierra': 'arceus tierra',
  'Hielo': 'arceus hielo',
  'Veneno': 'arceus veneno',
  'Psíquico': 'arceus psíquico',
  'Roca': 'arceus roca',
  'Acero': 'arceus acero',
  'Agua': 'arceus agua',
  'Hada': 'arceus hada',
};

// Resuelve ARCEUS_TYPE_FORM_NAMES[tipo] a su ficha completa de
// ARENA_POKEMON_DB (allPokemon), por nombre en minúsculas — mismo criterio
// de resolución que getBossFinalBossTemplates/getBossMidfightTransformTemplate.
// Devuelve null si el tipo no tiene placa asociada o si su nombre no
// resuelve a una ficha real: en ese caso Arceus se queda con el tipo/forma
// que ya tenía, sin cambiar, igual que hacen las otras tablas de este modo
// cuando no encuentran una entrada válida.
export function getArceusTypeFormTemplate(type, allPokemon) {
  const name = ARCEUS_TYPE_FORM_NAMES[type];
  if (!name) return null;
  const template = allPokemon.find(p => p.name.toLowerCase() === name.toLowerCase());
  return template || null;
}
