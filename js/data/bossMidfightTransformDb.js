/* =========================================================
   MODO BOSS COOPERATIVO — Transformaciones a mitad de combate
   ========================================================= */
// Generalización del efecto que ya tenía Wishiwashi (fase final del nivel
// 3, ver BOSS_FINAL_BOSS_NAMES en bossFinalBossDb.js, que lo hace
// aparecer con su forma banco): algunos jefes fijos de fase final
// aparecen con su forma BASE y, al perder cierto porcentaje de su vida
// máxima, se transforman a media pelea en la forma que de verdad les
// corresponde como jefe (por ejemplo, Aegislash aparece en su forma
// Escudo y pasa a su forma Espada al quedarse a la mitad de su vida o
// menos). La animación de la transformación en sí (la luz blanca que
// envuelve al Pokémon, ver startBossMidfightTransform en boss.js) es la
// misma para todos, cambia solo el Pokémon de origen, el de destino y el
// porcentaje de vida al que ocurre.
//
// Formato: BOSS_MIDFIGHT_TRANSFORM_DB[idDeOrigen] = { toName, ratio }.
//   - idDeOrigen: el id (en ARENA_POKEMON_DB, ver arenaPokemonDb.js) con
//     el que el jefe APARECE al llegar a la fase.
//   - toName: el nombre (en minúsculas, tal cual en ARENA_POKEMON_DB) de
//     la forma a la que se transforma.
//   - ratio: fracción de su vida MÁXIMA (0-1) a la que se dispara la
//     transformación -en cuanto queda a ese % o menos, no exactamente en
//     ese %-, igual criterio que tenía WISHIWASHI_TRANSFORM_HP_RATIO.
//
// Con dos jefes a la vez en la fase final (Zacian/Zamazenta en el nivel
// 15, Groudon/Kyogre en el nivel 18), cada uno se consulta y transforma
// por su cuenta, de forma independiente del otro -ver
// shouldTransformBossMidfight en boss.js, que se llama para el bossSlot
// concreto que acaba de recibir el golpe-.
export const BOSS_MIDFIGHT_TRANSFORM_DB = {
  9002: { toName: 'wishiwashi', ratio: 0.25 }, // Wishiwashi Banco -> Wishiwashi (forma en solitario), nivel 3
  681: { toName: 'aegislash espada', ratio: 0.5 }, // Aegislash (forma escudo) -> Aegislash Espada, nivel 4
  648: { toName: 'meloetta danza', ratio: 0.5 }, // Meloetta (forma normal) -> Meloetta Danza, nivel 7
  492: { toName: 'shaymin cielo', ratio: 0.5 }, // Shaymin (forma normal) -> Shaymin Cielo, nivel 8
  448: { toName: 'lucario mega', ratio: 0.5 }, // Lucario (forma normal) -> Lucario Mega, nivel 9
  720: { toName: 'hoopa desatado', ratio: 0.5 }, // Hoopa (forma normal) -> Hoopa Desatado, nivel 10
  249: { toName: 'lugia oscuro', ratio: 0.5 }, // Lugia (forma normal) -> Lugia Oscuro, nivel 11
  484: { toName: 'palkia origen', ratio: 0.5 }, // Palkia (forma normal) -> Palkia Origen, nivel 12
  646: { toName: 'kyurem negro', ratio: 0.5 }, // Kyurem (forma normal) -> Kyurem Negro, nivel 13
  888: { toName: 'zacian corona', ratio: 0.5 }, // Zacian (forma normal) -> Zacian Corona, nivel 15
  889: { toName: 'zamazenta corona', ratio: 0.5 }, // Zamazenta (forma normal) -> Zamazenta Corona, nivel 15
  718: { toName: 'zygarde completo', ratio: 0.5 }, // Zygarde (forma 50%) -> Zygarde Completo, nivel 16
  487: { toName: 'giratina origen', ratio: 0.5 }, // Giratina (forma normal) -> Giratina Origen, nivel 17
  383: { toName: 'groudon primigenio', ratio: 0.5 }, // Groudon (forma normal) -> Groudon Primigenio, nivel 18
  382: { toName: 'kyogre primigenio', ratio: 0.5 }, // Kyogre (forma normal) -> Kyogre Primigenio, nivel 18
  800: { toName: 'ultra necrozma', ratio: 0.5 }, // Necrozma -> Ultra Necrozma, nivel 19
};

// Resuelve la entrada de BOSS_MIDFIGHT_TRANSFORM_DB para el id de origen
// dado a una ficha completa de ARENA_POKEMON_DB (allPokemon) más su
// ratio, o null si ese id no tiene transformación a mitad de combate, o
// si su toName no resuelve a una ficha real (nombre mal escrito): en
// ambos casos el jefe se queda tal cual, sin transformarse, igual que
// getBossFinalBossTemplates/getBossPhaseFiveBossTemplates cuando no
// encuentran una entrada válida.
export function getBossMidfightTransformTemplate(fromId, allPokemon) {
  const entry = BOSS_MIDFIGHT_TRANSFORM_DB[fromId];
  if (!entry) return null;
  const template = allPokemon.find(p => p.name.toLowerCase() === entry.toName.toLowerCase());
  if (!template) return null;
  return { template, ratio: entry.ratio };
}
