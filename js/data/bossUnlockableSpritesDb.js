/* =========================================================
   SPRITES BLOQUEADOS HASTA SUPERAR UNA FASE DEL BOSS COOPERATIVO
   -----------------------------------------------------------
   Algunas fichas de ARENA_POKEMON_DB son formas especiales que, dentro
   del modo Boss cooperativo, solo aparecen como transformación del jefe
   en la fase final (15) de un nivel concreto (ver bossMidfightTransformDb.js
   y bossFinalBossDb.js): Wishiwashi Banco, Aegislash Espada, Floette Flor
   Eterna, Basculegion Hembra, Meloetta Danza, Shaymin Cielo, las 26
   megaevoluciones (nivel 9), Hoopa Desatado, Lugia Oscuro, Palkia
   Origen, Kyurem Negro, Dialga Primario, Zacian Corona, Zamazenta
   Corona, Zygarde Completo, Giratina Origen, Groudon Primigenio, Kyogre
   Primigenio, Ultra Necrozma y las 17 placas de tipo de Arceus (nivel
   20). Esas mismas fichas no deben poder usarse
   para apuntarse con !pokemon [nombre] en NINGÚN modo (Coliseo, Boss,
   Pokerus, Rayo Solar, Zona Safari, El Volcán — los únicos que
   comparten esta Pokédex y este comando, ver bossSpriteLocks.js) hasta
   que el streamer haya superado esa fase al menos una vez con ese
   canal.

   La forma "base" de cada una (Wishiwashi normal, Aegislash forma
   Escudo, Floette normal, Basculegion normal, Meloetta normal, Shaymin
   normal, Lucario/el resto de preevoluciones sin megaevolucionar, Hoopa
   normal, Lugia normal, Palkia normal, Kyurem normal, Dialga normal,
   Zacian/Zamazenta normal, Zygarde 50%, Giratina normal, Groudon/Kyogre
   normal, Necrozma normal, Arceus normal) NO aparece en esta lista:
   esas ya están disponibles desde el principio, sin ninguna
   restricción.

   `name` debe coincidir (sin distinguir mayúsculas/minúsculas, ver
   bossSpriteLocks.js) con el campo `name` de la ficha correspondiente en
   ARENA_POKEMON_DB. `level` es el nivel del modo Boss cuya fase final
   (15) desbloquea esa ficha en cuanto se supera.

   Nivel 9 (Lucario Mega) desbloquea de golpe las 26 megaevoluciones de
   ARENA_POKEMON_DB (ids 9042-9067): son todas las que en el repositorio
   PMDCollab/SpriteCollab (assets/pmd/<id>/) tienen ya descargadas sus
   cuatro animaciones Walk/Attack/Hurt/Sleep; antes de superar esa fase
   no hay ninguna megaevolución disponible para elegir por !pokemon.

   NOTA sobre Kyurem Blanco: desde que se incorporaron sus assets
   (walk/attack/hurt/sleep, ver assets/pmd/9086 y su ficha en
   ARENA_POKEMON_DB), el nivel 13 desbloquea de golpe tanto Kyurem Negro
   como Kyurem Blanco.

   Nivel 20 (jefe Arceus normal, ver BOSS_FINAL_BOSS_NAMES) desbloquea
   de golpe las 17 placas de tipo de ARENA_POKEMON_DB (ids 9025-9041,
   una por cada tipo salvo Normal, que es la forma base de Arceus y ya
   está disponible desde el principio); las 17 tienen ya sus cuatro
   animaciones Walk/Attack/Hurt/Sleep descargadas en assets/pmd/.

   Para añadir en el futuro más formas bloqueadas por cambio de género
   (p.ej. un Hippowdon hembra) u otras variantes especiales que se vayan
   incorporando al Boss, basta con añadir aquí una entrada más con este
   mismo formato: no hace falta tocar ningún otro fichero (ni los
   handleXxxJoin de cada modo, ni la pantalla de Ajustes) para que
   empiece a bloquearse/desbloquearse igual que el resto.
   ========================================================= */
export const BOSS_UNLOCKABLE_SPRITES = [
  { name: 'Wishiwashi Banco', level: 3 },
  { name: 'Aegislash Espada', level: 4 },
  { name: 'Floette Flor Eterna', level: 5 },
  { name: 'Basculegion Hembra', level: 6 },
  { name: 'Meloetta Danza', level: 7 },
  { name: 'Shaymin Cielo', level: 8 },

  // Nivel 9 — todas las megaevoluciones (Fase 15, jefe Lucario Mega)
  { name: 'Charizard Mega X', level: 9 },
  { name: 'Alakazam Mega', level: 9 },
  { name: 'Gengar Mega', level: 9 },
  { name: 'Kangaskhan Mega', level: 9 },
  { name: 'Aerodactyl Mega', level: 9 },
  { name: 'Mewtwo Mega Y', level: 9 },
  { name: 'Steelix Mega', level: 9 },
  { name: 'Houndoom Mega', level: 9 },
  { name: 'Tyranitar Mega', level: 9 },
  { name: 'Gardevoir Mega', level: 9 },
  { name: 'Sableye Mega', level: 9 },
  { name: 'Mawile Mega', level: 9 },
  { name: 'Medicham Mega', level: 9 },
  { name: 'Manectric Mega', level: 9 },
  { name: 'Camerupt Mega', level: 9 },
  { name: 'Altaria Mega', level: 9 },
  { name: 'Banette Mega', level: 9 },
  { name: 'Absol Mega', level: 9 },
  { name: 'Glalie Mega', level: 9 },
  { name: 'Latias Mega', level: 9 },
  { name: 'Latios Mega', level: 9 },
  { name: 'Rayquaza Mega', level: 9 },
  { name: 'Lopunny Mega', level: 9 },
  { name: 'Lucario Mega', level: 9 },
  { name: 'Gallade Mega', level: 9 },
  { name: 'Diancie Mega', level: 9 },

  { name: 'Hoopa Desatado', level: 10 },
  { name: 'Lugia Oscuro', level: 11 },
  { name: 'Palkia Origen', level: 12 },
  { name: 'Kyurem Negro', level: 13 },
  { name: 'Kyurem Blanco', level: 13 },
  { name: 'Dialga Primario', level: 14 },
  { name: 'Zacian Corona', level: 15 },
  { name: 'Zamazenta Corona', level: 15 },
  { name: 'Zygarde Completo', level: 16 },
  { name: 'Giratina Origen', level: 17 },
  { name: 'Groudon Primigenio', level: 18 },
  { name: 'Kyogre Primigenio', level: 18 },
  { name: 'Ultra Necrozma', level: 19 },

  // Nivel 20 — las 17 placas de tipo de Arceus (Fase 15, jefe Arceus normal)
  { name: 'Arceus Bicho', level: 20 },
  { name: 'Arceus Siniestro', level: 20 },
  { name: 'Arceus Dragón', level: 20 },
  { name: 'Arceus Eléctrico', level: 20 },
  { name: 'Arceus Lucha', level: 20 },
  { name: 'Arceus Fuego', level: 20 },
  { name: 'Arceus Volador', level: 20 },
  { name: 'Arceus Fantasma', level: 20 },
  { name: 'Arceus Planta', level: 20 },
  { name: 'Arceus Tierra', level: 20 },
  { name: 'Arceus Hielo', level: 20 },
  { name: 'Arceus Veneno', level: 20 },
  { name: 'Arceus Psíquico', level: 20 },
  { name: 'Arceus Roca', level: 20 },
  { name: 'Arceus Acero', level: 20 },
  { name: 'Arceus Agua', level: 20 },
  { name: 'Arceus Hada', level: 20 },
];
