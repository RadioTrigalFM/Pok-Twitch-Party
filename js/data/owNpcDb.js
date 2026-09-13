/* =========================================================
   SPRITES OW (OVERWORLD) DE NPCs
   -----------------------------------------------------------
   Se usan como avatar de cada jugador en el modo Vista Lince, en
   Zoroarks y en el resto de modos que muestran NPCs caminando por un
   mapa. Provienen de las hojas de sprites "de persona" (no de
   Pokémon) de las decompilaciones de Pokémon Rubí/Zafiro (repo
   pokeruby) y Pokémon Rojo Fuego/Verde Hoja (repo pokefirered),
   publicadas por el proyecto pret (https://github.com/pret). Cada
   hoja tiene la pose "de pie mirando al jugador" como primer
   fotograma (16x32 px, esquina superior izquierda), que es el que
   usamos aquí.
   Las 95 hojas (60 de pokeruby + 35 de pokefirered) están descargadas
   dentro del propio proyecto, en assets/ow_npcs/<repo>/<file>.png, en
   vez de pedirse a raw.githubusercontent.com por red: así el modo
   Zoroarks (y el resto de modos que usan estos NPCs) funciona sin
   depender de una web externa ni de tener conexión a internet.
   ========================================================= */
import { OW_NPC_HEAD_TOP_RATIO } from './owNpcHeadDb.js';

const OW_LOCAL_BASE = 'assets/ow_npcs';
const OW_FRAME_W = 16;
const OW_FRAME_H = 32;

// Ficheros verificados dentro de graphics/object_events/pics/people/ de
// cada repo. Se excluyen adrede las hojas con formato irregular (anchura o
// altura de fotograma distinta a 16x32 en la esquina superior izquierda:
// ciclistas, tubos, sprites sentados, etc.) para que el recorte del primer
// fotograma sea siempre correcto.
const OW_RUBY_FILES = [
  'aqua_member_f','aqua_member_m','artist','beauty','black_belt','boy_1','boy_2','boy_3','boy_4',
  'bug_catcher','cameraman','camper','contest_judge','fat_man','fisherman','gentleman','girl_1',
  'girl_2','girl_3','hex_maniac','hiker','lass','little_girl_1',
  'magma_member_f','magma_member_m','man_1','man_2','man_3','man_4','man_5','man_6','man_7',
  'maniac','mart_employee','mauville_old_man_1','mauville_old_man_2','mom','nurse','old_man_1',
  'old_woman_1','picnicker','psychic_m','reporter_f','reporter_m','rooftop_sale_woman',
  'running_triathlete_f','running_triathlete_m','sailor','school_kid_m','scientist_1',
  'scientist_2','woman_1','woman_2','woman_3','woman_4','woman_5',
  'woman_6','woman_7','woman_8','youngster',
];
const OW_FIRERED_FILES = [
  'balding_man','beauty','black_belt','boy','bug_catcher','camper','captain','channeler','chef',
  'clerk','cooltrainer_f','cooltrainer_m','crush_girl','fat_man','fisher','gentleman','gym_guy',
  'hiker','lass','old_man_1','old_man_2','old_woman','picnicker','poke_maniac','policeman',
  'rich_boy','rocker','sailor','scientist','woman_1','woman_2','woman_3','worker_f','worker_m',
  'youngster',
];

// Género de cada hoja (para poder elegir sprites de un género concreto,
// p.ej. en el modo Control de Extranjería). No es una clasificación exacta
// según el lore de cada juego, solo una etiqueta cosmética para poder
// distinguir internamente entre sprites "masculinos" y "femeninos".
const OW_RUBY_GENDER = {
  aqua_member_f: 'f', aqua_member_m: 'm', artist: 'm', beauty: 'f', black_belt: 'm',
  boy_1: 'm', boy_2: 'm', boy_3: 'm', boy_4: 'm', bug_catcher: 'm', cameraman: 'm',
  camper: 'm', contest_judge: 'm', fat_man: 'm', fisherman: 'm', gentleman: 'm',
  girl_1: 'f', girl_2: 'f', girl_3: 'f', hex_maniac: 'f', hiker: 'm', lass: 'f',
  little_girl_1: 'f', magma_member_f: 'f', magma_member_m: 'm', man_1: 'm', man_2: 'm',
  man_3: 'm', man_4: 'm', man_5: 'm', man_6: 'm', man_7: 'm', maniac: 'm',
  mart_employee: 'm', mauville_old_man_1: 'm', mauville_old_man_2: 'm', mom: 'f',
  nurse: 'f', old_man_1: 'm', old_woman_1: 'f', picnicker: 'f', psychic_m: 'm',
  reporter_f: 'f', reporter_m: 'm', rooftop_sale_woman: 'f', running_triathlete_f: 'f',
  running_triathlete_m: 'm', sailor: 'm', school_kid_m: 'm', scientist_1: 'm',
  scientist_2: 'm', woman_1: 'f', woman_2: 'f', woman_3: 'f', woman_4: 'f',
  woman_5: 'f', woman_6: 'f', woman_7: 'f', woman_8: 'f', youngster: 'm',
};
const OW_FIRERED_GENDER = {
  balding_man: 'm', beauty: 'f', black_belt: 'm', boy: 'm', bug_catcher: 'm',
  camper: 'm', captain: 'm', channeler: 'f', chef: 'm', clerk: 'm',
  cooltrainer_f: 'f', cooltrainer_m: 'm', crush_girl: 'f', fat_man: 'm', fisher: 'm',
  gentleman: 'm', gym_guy: 'm', hiker: 'm', lass: 'f', old_man_1: 'm', old_man_2: 'm',
  old_woman: 'f', picnicker: 'f', poke_maniac: 'm', policeman: 'm', rich_boy: 'm',
  rocker: 'm', sailor: 'm', scientist: 'm', woman_1: 'f', woman_2: 'f', woman_3: 'f',
  worker_f: 'f', worker_m: 'm', youngster: 'm',
};

// Grupo de edad de cada hoja ('young' | 'adult' | 'old'), para que modos
// como Control de Extranjería (ver js/modes/extranjeria.js) generen una
// edad de pasaporte coherente con el aspecto del sprite asignado (nunca un
// "old_man" de 19 años ni un "youngster" de 70). Igual que con el género,
// es solo una etiqueta cosmética basada en el propio nombre de la hoja
// (tal como la llamó el juego original), no una clasificación exacta.
// Los sprites no listados aquí caen en 'adult' por defecto (ver
// OW_NPC_DB más abajo). A propósito NO se usa un rango de edad "infantil"
// para 'young' (boy_1, little_girl_1, school_kid_m...): esos sprites
// pasan a ser simplemente el extremo más joven de la franja adulta del
// pasaporte (ver EXTR_AGE_RANGES en extranjeria.js), para no generar
// nunca una edad de menor de edad en el juego.
const OW_RUBY_AGE = {
  boy_1: 'young', boy_2: 'young', boy_3: 'young', boy_4: 'young',
  girl_1: 'young', girl_2: 'young', girl_3: 'young', little_girl_1: 'young',
  school_kid_m: 'young', youngster: 'young', bug_catcher: 'young', lass: 'young',
  mauville_old_man_1: 'old', mauville_old_man_2: 'old', old_man_1: 'old', old_woman_1: 'old',
};
const OW_FIRERED_AGE = {
  boy: 'young', bug_catcher: 'young', lass: 'young', youngster: 'young',
  rich_boy: 'young', crush_girl: 'young',
  old_man_1: 'old', old_man_2: 'old', old_woman: 'old',
};

export const OW_NPC_DB = [
  ...OW_RUBY_FILES.map(file => ({
    repo: 'pokeruby', file, gender: OW_RUBY_GENDER[file] || 'm', ageGroup: OW_RUBY_AGE[file] || 'adult',
  })),
  ...OW_FIRERED_FILES.map(file => ({
    repo: 'pokefirered', file, gender: OW_FIRERED_GENDER[file] || 'm', ageGroup: OW_FIRERED_AGE[file] || 'adult',
  })),
];

// gender: 'f' | 'm' | undefined (undefined = cualquiera, como antes)
export function getRandomOwNpc(gender) {
  const pool = gender ? OW_NPC_DB.filter(n => n.gender === gender) : OW_NPC_DB;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function owNpcSpriteSheetUrl(npc) {
  return `${OW_LOCAL_BASE}/${npc.repo}/${npc.file}.png`;
}

/* =========================================================
   FOTOGRAMAS PRE-PROCESADOS (sin canvas en tiempo de juego)
   -----------------------------------------------------------
   Antes, cada fotograma (y el recorte de la cabeza) se generaba en el
   momento pintando la hoja en un <canvas> y leyendo sus píxeles con
   getImageData()/toDataURL() para quitar el color de fondo sólido de la
   hoja GBA. Eso funciona bien serviendo el juego por HTTP(S), pero si el
   juego se abre haciendo doble clic en index.html (protocolo file://),
   Chrome no considera "mismo origen" a dos recursos file:// aunque estén
   en la misma carpeta, así que ese canvas queda "contaminado" y
   getImageData()/toDataURL() lanzan SecurityError; el código lo capturaba
   en silencio y el sprite del NPC se quedaba sin imagen (sin ningún error
   visible en el chat ni en consola aparte del propio "canvas tainted").
   Los Pokémon (PMD) no sufrían esto porque se pintan con
   background-image/CSS, sin leer píxeles de canvas.
   Para evitarlo del todo, estos fotogramas (ya recortados a 16x32 y con
   el fondo hecho transparente, más los reflejados para "derecha") están
   pre-generados en disco -ver tools/gen_ow_npc_frames.py- dentro de
   assets/ow_npcs/frames/<repo>/<file>/f<idx>[_mirror].png, así que en
   tiempo de juego basta con apuntar un <img> a ese fichero (una carga de
   imagen normal, que sí funciona sin problemas bajo file://): no hace
   falta tocar canvas para nada.
   Índices de fotograma dentro de la hoja original (formato estándar de
   "object event pics" de pokeruby/pokefirered):
     0: de pie mirando abajo    3: paso 1 abajo   4: paso 2 abajo
     1: de pie mirando arriba   5: paso 1 arriba  6: paso 2 arriba
     2: de pie mirando izq.     7: paso 1 izq.    8: paso 2 izq.
   La dirección "derecha" reutiliza los fotogramas de "izquierda" ya
   reflejados horizontalmente (sufijo "_mirror"), igual que hacía antes el
   propio juego original con ctx.scale(-1, 1).
   ========================================================= */
const OW_FRAMES_BASE = 'assets/ow_npcs/frames';
const OW_DIR_FRAMES = {
  down: { idle: 0, walk: [3, 4] },
  up: { idle: 1, walk: [5, 6] },
  left: { idle: 2, walk: [7, 8] },
  right: { idle: 2, walk: [7, 8], mirror: true },
};

function owNpcFramePath(npc, frameIdx, mirror) {
  return `${OW_FRAMES_BASE}/${npc.repo}/${npc.file}/f${frameIdx}${mirror ? '_mirror' : ''}.png`;
}

// Compatibilidad: devuelve (como antes, en forma de Promise) la url del
// primer fotograma (16x32, "de pie mirando abajo") ya recortado y con el
// fondo transparente. Se usa como avatar en cola, pasaporte, Vista Lince...
export function owNpcFrameDataUrl(npc) {
  return Promise.resolve(owNpcFramePath(npc, 0, false));
}

// Devuelve, como proporción (0-1) de la altura del fotograma, dónde empieza
// verticalmente el contenido real (no transparente) del sprite: es decir,
// dónde está la cabeza. Se usa para anclar UI (como el bocadillo de diálogo
// del modo Control de Extranjería) justo encima de la cabeza real en vez de
// encima del recuadro completo del fotograma (que trae margen de sobra).
// El ratio está precalculado (ver OW_NPC_HEAD_TOP_RATIO) por el mismo
// motivo que el resto de este fichero: no depender de canvas.getImageData()
// en tiempo de juego.
export function owNpcHeadTopRatio(npc) {
  const ratio = OW_NPC_HEAD_TOP_RATIO[`${npc.repo}/${npc.file}`];
  return Promise.resolve(typeof ratio === 'number' ? ratio : 0);
}

// Aplica el sprite OW (ya procesado) a un elemento <img>, en cuanto esté listo.
export function applyOwNpcSprite(imgEl, npc) {
  owNpcFrameDataUrl(npc).then(dataUrl => {
    if (dataUrl && imgEl && imgEl.isConnected) imgEl.src = dataUrl;
  });
}

// Devuelve la url de un fotograma concreto de animación de un NPC:
// dir: 'down' | 'up' | 'left' | 'right'
// phase: 'idle' | 'step1' | 'step2'
export function owNpcAnimFrameDataUrl(npc, dir, phase) {
  const dirInfo = OW_DIR_FRAMES[dir] || OW_DIR_FRAMES.down;
  let frameIdx = dirInfo.idle;
  if (phase === 'step1') frameIdx = dirInfo.walk[0];
  else if (phase === 'step2') frameIdx = dirInfo.walk[1];
  return Promise.resolve(owNpcFramePath(npc, frameIdx, !!dirInfo.mirror));
}
