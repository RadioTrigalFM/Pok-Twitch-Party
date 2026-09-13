/* =========================================================
   MODO BOSS COOPERATIVO — Pools de enemigos por nivel
   ========================================================= */
// Cada nivel del modo Boss (ver BOSS_TOTAL_LEVELS en boss.js) tiene su
// propia "pool" de Pokémon: en vez de elegir el enemigo (tanto el primer
// jefe del lobby, en startBoss, como cada enemigo nuevo de fase/nivel, en
// spawnNewBoss) de toda la Pokédex Nacional del Coliseo (ARENA_POKEMON_DB),
// se elige al azar solo entre los nombres listados aquí para el nivel en
// curso — así cada nivel tiene su propia identidad de enemigos, en vez de
// poder salir cualquier Pokémon en cualquier nivel.
//
// Formato: BOSS_LEVEL_POOLS[nivel] = array de nombres (en minúsculas, tal
// cual aparecen en ARENA_POKEMON_DB, ver arenaPokemonDb.js) de los Pokémon
// que pueden aparecer como enemigo en ese nivel. La resolución de nombre a
// ficha completa (id/types/moves/sprite) se hace en tiempo de ejecución con
// getBossLevelPool(), más abajo, para no duplicar aquí esos datos.
//
// Todos los niveles del 1 al 20 tienen ya su pool propia. Si en el futuro
// se añade un nivel nuevo sin pool listada aquí, getBossLevelPool() le da
// automáticamente toda la Pokédex Nacional del Coliseo como pool, igual que
// el comportamiento anterior a esta funcionalidad, para no dejar ningún
// nivel sin enemigos.
export const BOSS_LEVEL_POOLS = {
  1: [
    'caterpie', 'rattata', 'zubat', 'ekans', 'bidoof', 'hoothoot',
    'poochyena', 'spinarak', 'geodude', 'starly', 'wurmple', 'slowpoke',
    'sunkern', 'oddish', 'growlithe',
  ],
  2: [
    'vulpix alola', 'sandshrew alola', 'meowth alola', 'geodude alola',
    'grimer alola', 'diglett alola', 'rattata alola', 'ponyta galar',
    'zigzagoon galar', 'darumaka galar', 'yamask galar', 'slowpoke galar',
    'growlithe de hisui', 'zorua de hisui', 'meowth galar',
  ],
  3: [
    'magikarp', 'goldeen', 'horsea', 'poliwag', 'psyduck', 'buizel',
    'ledyba', 'hoppip', 'whismur', 'nincada', 'taillow', 'shroomish',
    'aron', 'machop', 'budew',
  ],
  4: [
    'duskull', 'shuppet', 'gastly', 'misdreavus', 'pawniard', 'ferroseed',
    'klefki', 'roggenrola', 'timburr', 'meditite', 'koffing', 'bronzor',
    'snubbull', 'houndour', 'drilbur',
  ],
  5: [
    'flabébé', 'spritzee', 'swirlix', 'comfey', 'togetic', 'clefairy',
    'bounsweet', 'petilil', 'deerling', 'skitty', 'buneary', 'pikachu',
    'munna', 'duosion', 'woobat',
  ],
  6: [
    'finneon', 'corphish', 'feebas', 'carvanha', 'shellos', 'luvdisc',
    'drifloon', 'phantump', 'stunky', 'skorupi', 'purrloin', 'trubbish',
    'vullaby', 'yamper', 'rookidee',
  ],
  7: [
    'chatot', 'kricketune', 'jigglypuff', 'spoink', 'baltoy', 'elgyem',
    'drowzee', 'kadabra', 'smoochum', 'vigoroth', 'zangoose', 'teddiursa',
    'stantler', 'venomoth', 'yanma',
  ],
  8: [
    'roselia', 'sunflora', 'whimsicott', 'breloom', 'tropius', 'lileep',
    'combee', 'volbeat', 'illumise', 'munchlax', 'quilava', 'ponyta',
    'audino', 'marill', 'ribombee',
  ],
  9: [
    'manectric', 'sharpedo', 'malamar', 'aggron', 'banette', 'houndoom',
    'camerupt', 'sableye', 'absol', 'aerodactyl', 'glalie', 'altaria',
    'heracross', 'gyarados', 'ampharos',
  ],
  10: [
    'cursola', 'shedinja', 'dusclops', 'froslass', 'rotom', 'trevenant',
    'umbreon', 'mightyena', 'shiftry', 'cacturne', 'crawdaunt', 'pangoro',
    'mr. mime', 'girafarig', 'gothitelle',
  ],
  11: [
    'charizard', 'venusaur', 'yanmega', 'mandibuzz', 'hawlucha', 'mantine',
    'sigilyph', 'gardevoir', 'exeggutor', 'delphox', 'espeon', 'alakazam',
    'umbreon', 'scrafty', 'mismagius',
  ],
  12: [
    'kingdra', 'drampa', 'shelgon', 'zweilous', 'dragonair', 'inteleon',
    'samurott', 'vaporeon', 'cloyster', 'omastar', 'kabutops', 'crobat',
    'braviary', 'electabuzz', 'pinsir',
  ],
  13: [
    'baxcalibur', 'abomasnow', 'lapras', 'mamoswine', 'glaceon', 'weavile',
    'cryogonal', 'dracozolt', 'appletun', 'cyclizar', 'blaziken', 'sceptile',
    'blastoise', 'dhelmise', 'sneasler',
  ],
  14: [
    'salamence', 'kommo-o', 'bronzong', 'bastiodon', 'rampardos',
    'ferrothorn', 'durant', 'skarmory', 'turtonator', 'hydrapple',
    'druddigon', 'honchkrow', 'absol', 'sceptile', 'obstagoon',
  ],
  15: [
    'relicanth', 'wailord', 'greninja', 'feraligatr', 'empoleon',
    'hippowdon', 'seismitoad', 'nidoking', 'nidoqueen', 'claydol',
    'mudsdale', 'arcanine', 'darmanitan', 'incineroar', 'infernape',
  ],
  16: [
    'flygon', 'goodra', 'krookodile', 'steelix', 'swampert', 'gliscor',
    'torterra', 'haxorus', 'altaria', 'dracovish', 'rhyperior', 'aurorus',
    'probopass', 'gallade', 'starmie',
  ],
  17: [
    'gengar', 'chandelure', 'golurk', 'dusknoir', 'drifblim', 'dragapult',
    'zoroark', 'pangoro', 'toxicroak', 'dragalge', 'noivern', 'tyrantrum',
    'hypno', 'kingambit', 'hydreigon',
  ],
  18: [
    'lucario', 'florges', 'primarina', 'sylveon', 'grimmsnarl', 'tinkaton',
    'mawile', 'klinklang', 'scizor', 'corviknight', 'magnezone', 'luxray',
    'pyroar', 'lycanroc', 'stoutland',
  ],
  19: [
    'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela',
    'kartana', 'guzzlord', 'naganadel', 'stakataka', 'blacephalon',
    'poipole',
  ],
  20: [
    'slaking', 'metagross', 'volcarona', 'dragonite', 'archeops',
    'spiritomb', 'ursaluna', 'togekiss', 'milotic', 'snorlax',
    'electivire', 'magmortar', 'porygon-z', 'mamoswine', 'golisopod',
  ],
};

// Devuelve la pool de fichas completas (de ARENA_POKEMON_DB) que puede
// salir como enemigo en el nivel dado: los nombres de BOSS_LEVEL_POOLS[nivel]
// ya resueltos a su ficha completa. Si el nivel no tiene pool propia
// definida arriba, o si por lo que sea ninguno de sus nombres resuelve a
// una ficha real (p. ej. un nombre mal escrito), se devuelve toda
// arenaPokemonDb (allPokemon) como pool, para que ese nivel nunca se quede
// sin enemigos posibles.
export function getBossLevelPool(level, allPokemon) {
  const names = BOSS_LEVEL_POOLS[level];
  if (!names || !names.length) return allPokemon;
  const wanted = new Set(names.map(n => n.toLowerCase()));
  const resolved = allPokemon.filter(p => wanted.has(p.name.toLowerCase()));
  return resolved.length ? resolved : allPokemon;
}
