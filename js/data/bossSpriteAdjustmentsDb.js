/* =========================================================
   MODO BOSS COOPERATIVO — Ajustes finos de altura/escala por sprite
   ========================================================= */
// Los sprites PMD de PMDCollab no están todos calibrados igual entre sí:
// algunos Pokémon (sobre todo formas alternativas/mega con hojas de
// sprites poco habituales, como Wishiwashi Banco o Arceus) quedan flotando
// muy por encima del suelo, o se ven demasiado grandes/pequeños respecto
// al resto, cuando se usan como jefe del modo Boss cooperativo (ver
// boss.js, spawnNewBoss/renderBoss). Esta tabla corrige esos casos
// concretos a mano, por dex/sprite (el mismo id que ARENA_POKEMON_DB usa
// como "sprite", ver arenaPokemonDb.js): no afecta a ningún otro modo
// (Coliseo, cola, Zona Safari...), solo a cómo se planta el sprite del
// jefe en el mapa del modo Boss.
//
// Formato: BOSS_SPRITE_ADJUSTMENTS[dex] = { offsetY, scaleAdj }
//   - offsetY: desplazamiento vertical en px (positivo = hacia abajo,
//     negativo = hacia arriba), aplicado como margin-top sobre el
//     fotograma PMD (ver .boss-sprite.pmd-slot .pmd-frame en styles.css):
//     no depende de la escala del sprite, así que el valor es el mismo
//     desplazamiento visual en cualquier fase (normal o fase final).
//   - scaleAdj: multiplicador adicional sobre la escala base del jefe
//     (2.7x en fase final, 1.5x en el resto, ver .boss-sprite/
//     .boss-sprite.enemy-normal-size en styles.css): 1.00 = sin cambios,
//     >1 agranda, <1 reduce.
//
// Un dex sin entrada aquí no recibe ningún ajuste (offsetY: 0, scaleAdj: 1,
// ver applyBossSpriteAdjustment en boss.js).
export const BOSS_SPRITE_ADJUSTMENTS = {
  452: { offsetY: 19, scaleAdj: 1.16 }, // Nivel 1 · Fase 15 · Drapion
  9084: { offsetY: 76, scaleAdj: 1.21 }, // Nivel 2 · Fase 10 · Exeggutor Alola
  9068: { offsetY: 23, scaleAdj: 1.06 }, // Nivel 2 · Fase 15 · Marowak Alola
  272: { offsetY: 29, scaleAdj: 1.25 }, // Nivel 3 · Fase 10 · Ludicolo
  9002: { offsetY: 140, scaleAdj: 1.00 }, // Nivel 3 · Fase 15 · Wishiwashi Banco
  398: { offsetY: 28, scaleAdj: 1.15 }, // Nivel 4 · Fase 10 · Staraptor
  681: { offsetY: 43, scaleAdj: 1.00 }, // Nivel 4 · Fase 15 · Aegislash
  9001: { offsetY: 43, scaleAdj: 1.00 }, // Nivel 4 · Fase 15 (forma tras transformarse) · Aegislash Espada
  470: { offsetY: 23, scaleAdj: 1.15 }, // Nivel 5 · Fase 10 · Leafeon
  9003: { offsetY: 71, scaleAdj: 1.04 }, // Nivel 5 · Fase 15 · Floette Flor Eterna
  26: { offsetY: 25, scaleAdj: 1.12 }, // Nivel 6 · Fase 10 · Raichu
  902: { offsetY: 70, scaleAdj: 1.00 }, // Nivel 6 · Fase 15 · Basculegion
  9020: { offsetY: 70, scaleAdj: 1.00 }, // Nivel 6 · Fase 15 · Basculegion Hembra
  649: { offsetY: 38, scaleAdj: 1.30 }, // Nivel 7 · Fase 10 · Genesect
  648: { offsetY: 30, scaleAdj: 1.00 }, // Nivel 7 · Fase 15 · Meloetta
  9004: { offsetY: 68, scaleAdj: 1.00 }, // Nivel 7 · Fase 15 (forma tras transformarse) · Meloetta Danza
  151: { offsetY: 36, scaleAdj: 1.10 }, // Nivel 8 · Fase 10 · Mew
  492: { offsetY: 6, scaleAdj: 1.00 }, // Nivel 8 · Fase 15 · Shaymin
  9005: { offsetY: 67, scaleAdj: 1.00 }, // Nivel 8 · Fase 15 (forma tras transformarse) · Shaymin Cielo
  9052: { offsetY: 33, scaleAdj: 1.35 }, // Nivel 9 · Fase 10 · Sableye Mega
  448: { offsetY: 33, scaleAdj: 1.00 }, // Nivel 9 · Fase 15 · Lucario
  9065: { offsetY: 33, scaleAdj: 1.00 }, // Nivel 9 · Fase 15 (forma tras transformarse) · Lucario Mega
  721: { offsetY: 33, scaleAdj: 1.38 }, // Nivel 10 · Fase 10 · Volcanion
  720: { offsetY: 35, scaleAdj: 1.00 }, // Nivel 10 · Fase 15 · Hoopa
  9007: { offsetY: 135, scaleAdj: 1.00 }, // Nivel 10 · Fase 15 (forma tras transformarse) · Hoopa Desatado
  244: { offsetY: 37, scaleAdj: 1.26 }, // Nivel 11 · Fase 10 · Entei
  249: { offsetY: 70, scaleAdj: 1.00 }, // Nivel 11 · Fase 15 · Lugia
  9008: { offsetY: 104, scaleAdj: 1.23 }, // Nivel 11 · Fase 15 (forma tras transformarse) · Lugia Oscuro
  486: { offsetY: 58, scaleAdj: 1.50 }, // Nivel 12 · Fase 10 · Regigigas
  484: { offsetY: 100, scaleAdj: 1.03 }, // Nivel 12 · Fase 15 · Palkia
  9009: { offsetY: 150, scaleAdj: 1.03 }, // Nivel 12 · Fase 15 (forma tras transformarse) · Palkia Origen
  494: { offsetY: 17, scaleAdj: 1.03 }, // Nivel 13 · Fase 10 · Victini
  646: { offsetY: 100, scaleAdj: 1.30 }, // Nivel 13 · Fase 15 · Kyurem
  9085: { offsetY: 150, scaleAdj: 1.30 }, // Nivel 13 · Fase 15 (forma tras transformarse) · Kyurem Negro
  251: { offsetY: 9, scaleAdj: 1.20 }, // Nivel 14 · Fase 10 · Celebi
  9011: { offsetY: 133, scaleAdj: 1.19 }, // Nivel 14 · Fase 15 · Dialga Primario
  892: { offsetY: 35, scaleAdj: 1.22 }, // Nivel 15 · Fase 10 · Urshifu
  888: { offsetY: 75, scaleAdj: 1.00 }, // Nivel 15 · Fase 15 · Zacian
  889: { offsetY: 75, scaleAdj: 1.00 }, // Nivel 15 · Fase 15 · Zamazenta
  9015: { offsetY: 75, scaleAdj: 1.00 }, // Nivel 15 · Fase 15 (forma tras transformarse) · Zamazenta Corona
  9016: { offsetY: 75, scaleAdj: 1.00 }, // Nivel 15 · Fase 15 (forma tras transformarse) · Zacian Corona
  719: { offsetY: 29, scaleAdj: 1.40 }, // Nivel 16 · Fase 10 · Diancie
  718: { offsetY: 80, scaleAdj: 1.00 }, // Nivel 16 · Fase 15 · Zygarde
  9013: { offsetY: 133, scaleAdj: 1.20 }, // Nivel 16 · Fase 15 (forma tras transformarse) · Zygarde Completo
  491: { offsetY: 54, scaleAdj: 1.24 }, // Nivel 17 · Fase 10 · Darkrai
  487: { offsetY: 78, scaleAdj: 1.00 }, // Nivel 17 · Fase 15 · Giratina
  9012: { offsetY: 150, scaleAdj: 1.40 }, // Nivel 17 · Fase 15 (forma tras transformarse) · Giratina Origen
  385: { offsetY: 22, scaleAdj: 1.20 }, // Nivel 18 · Fase 10 · Jirachi
  382: { offsetY: 93, scaleAdj: 1.00 }, // Nivel 18 · Fase 15 · Kyogre
  383: { offsetY: 93, scaleAdj: 1.00 }, // Nivel 18 · Fase 15 · Groudon
  9017: { offsetY: 100, scaleAdj: 1.20 }, // Nivel 18 · Fase 15 (forma tras transformarse) · Kyogre Primigenio
  9018: { offsetY: 100, scaleAdj: 1.20 }, // Nivel 18 · Fase 15 (forma tras transformarse) · Groudon Primigenio
  386: { offsetY: 37, scaleAdj: 1.20 }, // Nivel 19 · Fase 10 · Deoxys
  800: { offsetY: 110, scaleAdj: 1.00 }, // Nivel 19 · Fase 15 · Necrozma
  9019: { offsetY: 150, scaleAdj: 1.32 }, // Nivel 19 · Fase 15 (forma tras transformarse) · Ultra Necrozma
  773: { offsetY: 48, scaleAdj: 1.27 }, // Nivel 20 · Fase 10 · Silvally
  493: { offsetY: 120, scaleAdj: 1.50 }, // Nivel 20 · Fase 15 · Arceus
};

// Devuelve el ajuste { offsetY, scaleAdj } para un dex dado, o los valores
// neutros (0 / 1) si no tiene entrada propia en la tabla de arriba.
export function getBossSpriteAdjustment(dexId) {
  return BOSS_SPRITE_ADJUSTMENTS[dexId] || { offsetY: 0, scaleAdj: 1 };
}
