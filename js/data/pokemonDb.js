/* =========================================================
   POKÉMON DATABASE
   ========================================================= */
export const POKEMON_DB = [
  { id:1, name:'Bulbasaur', types:['Planta','Veneno'], hp:45, atk:49, def:49, spd:45, moves:['Latigazo Cepa','Hoja Afilada','Placaje','Dormir'], sprite:1 },
  { id:4, name:'Charmander', types:['Fuego'], hp:39, atk:52, def:43, spd:65, moves:['Ascuas','Garra Metal','Lanzallamas','Arañazo'], sprite:4 },
  { id:7, name:'Squirtle', types:['Agua'], hp:44, atk:48, def:65, spd:43, moves:['Pistola Agua','Placaje','Burbaja','Refugio'], sprite:7 },
  { id:25, name:'Pikachu', types:['Eléctrico'], hp:35, atk:55, def:40, spd:90, moves:['Rayo','Impactrueno','Onda Trueno','Ataque Rápido'], sprite:25 },
  { id:6, name:'Charizard', types:['Fuego','Volador'], hp:78, atk:84, def:78, spd:100, moves:['Llamarada','Aire Afilado','Garra Dragón','Vuelo'], sprite:6 },
  { id:150, name:'Mewtwo', types:['Psíquico'], hp:106, atk:110, def:90, spd:130, moves:['Psíquico','Bola Sombra','Rayo Aura','Onda Mental'], sprite:150 },
  { id:94, name:'Gengar', types:['Fantasma','Veneno'], hp:60, atk:65, def:60, spd:110, moves:['Bola Sombra','Lengüetaza','Rayo Confuso','Tinieblas'], sprite:94 },
  { id:143, name:'Snorlax', types:['Normal'], hp:160, atk:110, def:65, spd:30, moves:['Hiperrayo','Descanso','Placaje','Defensa Férrea'], sprite:143 },
  { id:149, name:'Dragonite', types:['Dragón','Volador'], hp:91, atk:134, def:95, spd:80, moves:['Dragoaliento','Hiperrayo','Velocidad Extrema','Vuelo'], sprite:149 },
  { id:130, name:'Gyarados', types:['Agua','Volador'], hp:95, atk:125, def:79, spd:81, moves:['Acua Cola','Hiperrayo','Danza Dragón','Colmillo Ígneo'], sprite:130 },
  { id:3, name:'Venusaur', types:['Planta','Veneno'], hp:80, atk:82, def:83, spd:80, moves:['Rayo Solar','Bombas Giga','Terremoto','Síntesis'], sprite:3 },
  { id:9, name:'Blastoise', types:['Agua'], hp:79, atk:83, def:100, spd:78, moves:['Hidrocañón','Rayo Hielo','Terremoto','Refugio'], sprite:9 },
  { id:131, name:'Lapras', types:['Agua','Hielo'], hp:130, atk:85, def:80, spd:60, moves:['Rayo Hielo','Hidrobomba','Canto Helado','Placaje'], sprite:131 },
  { id:65, name:'Alakazam', types:['Psíquico'], hp:55, atk:50, def:45, spd:120, moves:['Psíquico','Bola Sombra','Rayo Confuso','Recuperación'], sprite:65 },
  { id:68, name:'Machamp', types:['Lucha'], hp:90, atk:130, def:80, spd:55, moves:['Golpe Cruzado','Terremoto','Roca Afilada','Puño Dinámico'], sprite:68 },
  { id:95, name:'Onix', types:['Roca','Tierra'], hp:35, atk:45, def:160, spd:70, moves:['Lanzarocas','Terremoto','Rizo Defensa','Cola Férrea'], sprite:95 },
  { id:133, name:'Eevee', types:['Normal'], hp:55, atk:55, def:50, spd:55, moves:['Placaje','Ataque Rápido','Mordisco','Última Baza'], sprite:133 },
  { id:134, name:'Vaporeon', types:['Agua'], hp:130, atk:65, def:60, spd:65, moves:['Hidrobomba','Rayo Hielo','Acua Cola','Niebla'], sprite:134 },
  { id:136, name:'Flareon', types:['Fuego'], hp:65, atk:130, def:60, spd:65, moves:['Llamarada','Lanzallamas','Mordisco','Ataque Rápido'], sprite:136 },
  { id:137, name:'Porygon', types:['Normal'], hp:65, atk:60, def:70, spd:40, moves:['Triataque','Psíquico','Rayo Hielo','Recuperación'], sprite:137 },
  { id:59, name:'Arcanine', types:['Fuego'], hp:90, atk:110, def:80, spd:95, moves:['Lanzallamas','Velocidad Extrema','Colmillo Ígneo','Ataque Rápido'], sprite:59 },
  { id:76, name:'Golem', types:['Roca','Tierra'], hp:80, atk:120, def:130, spd:45, moves:['Terremoto','Lanzarocas','Explosión','Avalancha'], sprite:76 },
  { id:38, name:'Ninetales', types:['Fuego'], hp:73, atk:76, def:75, spd:100, moves:['Lanzallamas','Bola Sombra','Rayo Confuso','Fuego Sagrado'], sprite:38 },
  { id:62, name:'Poliwrath', types:['Agua','Lucha'], hp:90, atk:95, def:95, spd:70, moves:['Hidrobomba','Golpe Cruzado','Terremoto','Sumisión'], sprite:62 },
  { id:103, name:'Exeggutor', types:['Planta','Psíquico'], hp:95, atk:95, def:85, spd:55, moves:['Rayo Solar','Psíquico','Bombas Giga','Hipnosis'], sprite:103 },
];

const TYPE_COLORS = {
  'Planta':'#78C850', 'Fuego':'#F08030', 'Agua':'#6890F0', 'Eléctrico':'#F8D030',
  'Psíquico':'#F85888', 'Hielo':'#98D8D8', 'Dragón':'#7038F8', 'Fantasma':'#705898',
  'Veneno':'#A040A0', 'Tierra':'#E0C068', 'Roca':'#B8A038', 'Lucha':'#C03028',
  'Volador':'#A890F0', 'Normal':'#A8A878', 'Bicho':'#A8B820', 'Acero':'#B8B8D0',
  'Siniestro':'#705848', 'Hada':'#EE99AC'
};

export function getPokemonSprite(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}
