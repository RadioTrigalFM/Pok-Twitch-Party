import { PMD_LOCAL_ANIM_DB } from './data/pmdLocalAnimDb.js';
import { PMD_SLEEP_ANIM_DB } from './data/pmdSleepAnimDb.js';
import { PMD_SHOOT_ANIM_DB } from './data/pmdShootAnimDb.js';
import { PMD_CHARGE_ANIM_DB } from './data/pmdChargeAnimDb.js';
import { PMD_SHINY_ANIM_DB } from './data/pmdShinyAnimDb.js';
import { isFlyingPokemon } from './data/pokemonFlightDb.js';

const PMD_SPRITE_BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';
// Animaciones que se sirven desde el propio proyecto en vez de pedirse a
// PMDCollab por red: para los 930 Pokémon usados en el juego (Vista Lince,
// Pokerus, Safari, Volcán, Voltorb Explosivo, Zoroarks y la Pokédex
// Nacional completa del modo Arena) cuyo sprite en PMDCollab/SpriteCollab
// ya incluye las animaciones Walk/Attack/Hurt, esos datos (tamaño de
// fotograma, duraciones) y sus hojas de sprites ("-Anim.png") están
// descargados dentro de assets/pmd/<dex>/ y catalogados en
// js/data/pmdLocalAnimDb.js (PMD_LOCAL_ANIM_DB, generado automáticamente:
// ver el comentario de cabecera de ese fichero). Un puñado de Pokémon
// (bastante menos del 6% del total, ver README_PMD_LOCAL.md) todavía no
// tienen esas tres animaciones completas en el repositorio comunitario de
// PMDCollab; para esos -y solo para esos- se sigue intentando la carga por
// red más abajo (pmdLoadAnim), con el mismo sprite estático de repuesto de
// siempre como último recurso si tampoco hay conexión.
// IMPORTANTE: los datos de tamaño/duración de cada fotograma se guardan
// como objeto JS (en vez de leerse de un AnimData.xml local con fetch())
// a propósito: si el juego se abre haciendo doble clic en index.html
// (protocolo file://, sin servidor), los navegadores bloquean fetch()
// sobre ficheros locales por seguridad -aunque sí dejan cargar con
// normalidad imágenes normales, tanto <img> como background-image-, así
// que un AnimData.xml local nunca llegaría a leerse y el juego caería
// siempre al sprite estático de repuesto. Sirviendo el fotograma como
// imagen normal y sus datos como JS ya incluido en el bundle, la
// animación funciona igual tanto si el juego se sirve por HTTP como si se
// abre directamente desde el disco.
// Además de Walk/Attack/Hurt (PMD_LOCAL_ANIM_DB), el proyecto también
// incluye localmente otras animaciones descargadas del mismo
// repositorio: "Sleep" para todos los Pokémon del modo Boss cooperativo
// (PMD_SLEEP_ANIM_DB, ver js/data/pmdSleepAnimDb.js), "Shoot" para
// Heatran (modo Volcán) y Venusaur (modo Rayo Solar) (PMD_SHOOT_ANIM_DB,
// ver js/data/pmdShootAnimDb.js) y "Charge" para Venusaur en el modo
// Rayo Solar (PMD_CHARGE_ANIM_DB, ver js/data/pmdChargeAnimDb.js). Se
// fusionan aquí en un solo objeto por dex para que la búsqueda de más
// abajo las trate igual que las tres de siempre.
const PMD_LOCAL_ANIM_DATA = {};
for (const src of [PMD_LOCAL_ANIM_DB, PMD_SLEEP_ANIM_DB, PMD_SHOOT_ANIM_DB, PMD_CHARGE_ANIM_DB]) {
  for (const dex in src) {
    PMD_LOCAL_ANIM_DATA[dex] = Object.assign(PMD_LOCAL_ANIM_DATA[dex] || {}, src[dex]);
  }
}
// Igual que PMD_LOCAL_ANIM_DATA pero para la variante shiny (0.5% de
// probabilidad al inscribirse con !pokemon, ver js/pokemonShiny.js): solo
// contiene un dex si sus CUATRO animaciones (Walk/Attack/Hurt/Sleep) shiny
// están completas (ver js/data/pmdShinyAnimDb.js). No hay carga por red de
// respaldo para shiny -a propósito, ver README_PMD_SHINY.md-, así que si un
// dex no está aquí, PMDSprite.play() simplemente ignora el flag "shiny" y
// reproduce la animación normal.
const PMD_SHINY_ANIM_DATA = PMD_SHINY_ANIM_DB;
export const PMD_DIR = { down: 0, downRight: 1, right: 2, upRight: 3, up: 4, upLeft: 5, left: 6, downLeft: 7 };
const PMD_TICK_MS = 1000 / 60; // duración de cada "tick" del AnimData.xml
const pmdAnimDataCache = {};
// Tamaño (en px) de referencia para el "contenido" real (el dibujo del
// Pokémon en sí, sin contar el margen transparente de su fotograma) sobre el
// que están calibrados a mano los factores de "transform: scale()" del CSS
// (.pmd-frame y sus variantes .pmd-mini). El AnimData.xml de PMDCollab define
// un FrameWidth/FrameHeight por animación que es solo el tamaño del "lienzo":
// varía muchísimo entre Pokémon (p.ej. Pikachu ~32x40, Palkia u Groudon
// ~80x104) y además incluye un margen distinto en cada caso, así que
// normalizar por ese tamaño nominal (como se hacía antes) dejaba a Pokémon
// como Palkia o Groudon con un dibujo diminuto -desproporcionado frente a
// otros- aunque su "hueco" ya no se recortase. Medimos en su lugar el
// recuadro real de píxeles no transparentes del primer fotograma (dirección
// "abajo") y normalizamos sobre ESE tamaño, para que el Pokémon en sí se vea
// siempre con un tamaño consistente sin importar cuánto margen tenga su hoja
// de sprites.
const PMD_REFERENCE_SIZE = 26;
const pmdContentSizeCache = {};
// Guarda, por dexId, el factor --pmd-normalize ya calculado para ese
// Pokémon (a partir de la primera animación que se reprodujo para él,
// normalmente "Walk"). Cada animación (Walk/Attack/Hurt) tiene su propia
// hoja de sprites con su propio FrameWidth/FrameHeight y, sobre todo, su
// propia pose en el fotograma "abajo" que se usa para medir el recuadro de
// contenido real: una pose de ataque con el brazo extendido, por ejemplo,
// puede tener un recuadro de contenido más grande que la pose de pie de
// "Walk" aunque el Pokémon sea el mismo, lo que antes hacía que --pmd-
// normalize saliera distinto para cada animación y el Pokémon "encogiera"
// visiblemente al atacar o al recibir daño. Reutilizando el normalize ya
// fijado por la primera animación para el resto, el Pokémon mantiene
// siempre el mismo tamaño en pantalla sea cual sea la animación que esté
// reproduciendo.
const pmdDexNormalizeCache = {};
// Misma idea que pmdDexNormalizeCache pero para sprites "uncapped" (los
// combatientes del Coliseo): se cachea aparte para que un Pokémon no
// termine compartiendo el normalize recortado que se calculó para él en la
// cola (u otro modo) con el normalize real (=1) que le corresponde como
// combatiente, ni viceversa.
const pmdDexNormalizeCacheUncapped = {};
// Guarda, por dexId + nombre de animación, el porcentaje de desplazamiento
// vertical ya calculado (--pmd-bottom-offset) para compensar el margen
// transparente que algunas hojas de sprite dejan por debajo del dibujo (ver
// bottomMargin en pmdMeasureContentSize más abajo y su uso en
// PMDSprite.play()). A DIFERENCIA de pmdDexNormalizeCache (que sí se
// reutiliza tal cual entre Walk/Attack/Hurt a propósito, para que el
// Pokémon no cambie de TAMAÑO entre animaciones), este offset se cachea
// por animación: cada animación tiene su propio lienzo (FrameWidth/
// FrameHeight) y su propio margen transparente bajo el dibujo, así que
// reutilizar el mismo porcentaje calculado para "Walk" al reproducir
// "Attack" (o "Hurt") desancla el sprite en cuanto esa animación tiene un
// lienzo de alto distinto: el mismo % de desplazamiento representa una
// cantidad de píxeles distinta sobre un lienzo más alto o más bajo, y el
// Pokémon aparece flotando (o hundido) respecto a su posición real de pie
// -notorio sobre todo en jefes del modo Boss cuya animación "Attack" tiene
// un lienzo mucho más alto que su "Walk", como Marowak Alola o Drapion-.
// Separado en capped/uncapped igual que el normalize, ya que un mismo
// Pokémon puede aparecer a la vez como combatiente del Coliseo (uncapped)
// y como caminante de la cola (capped).
const pmdDexBottomOffsetCache = {};
const pmdDexBottomOffsetCacheUncapped = {};

function pmdDexPath(dexId) {
  return String(dexId).padStart(4, '0');
}

// Caché de la hoja de sprites COMPLETA (todas las direcciones/fotogramas)
// leída con canvas, para poder comprobar más tarde si un píxel concreto de
// un fotograma es transparente o no (ver PMDSprite.hitTestPoint más abajo,
// usado por Zona Safari para que la hitbox de cada Pokémon sea su dibujo
// real y no un radio fijo alrededor de su centro). Se guarda por URL de
// imagen: pmdImageDataCache guarda la promesa (para no pedir la misma
// imagen dos veces en paralelo) y pmdImageDataResolvedCache guarda el
// resultado ya listo, para poder consultarlo de forma síncrona en mitad de
// un disparo sin tener que esperar a un .then(). Si la imagen todavía no
// terminó de decodificarse (o falló, p.ej. por CORS), resolved queda sin
// esa clave y el hit-test correspondiente se resuelve como "no toca":
// mejor fallar el disparo por un instante de mala suerte que dar por
// buena una zona que no se pudo comprobar de verdad.
const pmdImageDataCache = {};
const pmdImageDataResolvedCache = {};
function pmdLoadFullImageData(imgUrl) {
  if (pmdImageDataCache[imgUrl]) return pmdImageDataCache[imgUrl];
  const promise = new Promise(resolve => {
    const img = new Image();
    if (/^https?:/i.test(imgUrl)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = { width: canvas.width, height: canvas.height, data };
        pmdImageDataResolvedCache[imgUrl] = result;
        resolve(result);
      } catch (err) {
        resolve(null); // canvas "tainted" por CORS u otro fallo: sin datos de píxel
      }
    };
    img.onerror = () => resolve(null);
    img.src = imgUrl;
  });
  pmdImageDataCache[imgUrl] = promise;
  return promise;
}

// Carga la imagen de una animación y mide el recuadro de píxeles no
// transparentes de su primer fotograma, para saber el tamaño real del
// dibujo del Pokémon dentro de su fotograma. Se cachea por URL de imagen +
// dirección (ver "direction" más abajo). Si la imagen no carga o no se
// puede leer (p.ej. por CORS), se resuelve con null y quien la use recurre
// al tamaño nominal del fotograma.
//
// "direction" (0-7, ver PMD_DIR) selecciona la FILA de la hoja de sprites a
// medir: cada dirección es un dibujo distinto, y en Pokémon cuya pose de
// perfil (izquierda/derecha, las que usan Arena y Boss cooperativo) tiene
// un margen inferior transparente muy distinto al de su pose de frente
// (abajo, dirección 0 -antes la única que se medía-), medir siempre la
// fila 0 desancla el sprite en las poses de perfil: se calcula una
// corrección pensada para la pose de frente y se aplica a una pose con
// "pies" a otra altura del lienzo, y el Pokémon queda flotando (o hundido)
// respecto al suelo en Arena/Boss. Comprobado con Tinkaton: en su hoja de
// "Attack" el margen inferior de la fila "abajo" no coincide con el de las
// filas "izquierda"/"derecha" que Arena y Boss realmente usan. Por eso
// PMDSprite.play() pide la medida de la dirección que de verdad va a
// mostrar en pantalla, en vez de asumir siempre "abajo".
function pmdMeasureContentSize(imgUrl, frameWidth, frameHeight, direction = 0) {
  const cacheKey = imgUrl + '::dir' + direction;
  if (pmdContentSizeCache[cacheKey]) return pmdContentSizeCache[cacheKey];
  const promise = new Promise(resolve => {
    const img = new Image();
    // El atributo crossOrigin solo hace falta (y solo se admite de forma
    // fiable) para imágenes remotas por http(s); en imágenes locales del
    // propio proyecto -incluido abriendo el juego directamente desde el
    // disco, protocolo file://- ponerlo puede hacer que la carga falle en
    // algunos navegadores, así que se omite para cualquier URL que no
    // empiece por "http".
    if (/^https?:/i.test(imgUrl)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        const ctx = canvas.getContext('2d');
        // Primer fotograma (columna 0) de la fila correspondiente a
        // "direction" (cada fila del sprite sheet es una dirección, ver
        // PMD_DIR).
        const sy = direction * frameHeight;
        ctx.drawImage(img, 0, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        const { data } = ctx.getImageData(0, 0, frameWidth, frameHeight);
        let minX = frameWidth, minY = frameHeight, maxX = -1, maxY = -1;
        for (let y = 0; y < frameHeight; y++) {
          for (let x = 0; x < frameWidth; x++) {
            const alpha = data[(y * frameWidth + x) * 4 + 3];
            if (alpha > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < minX || maxY < minY) { resolve(null); return; }
        // bottomMargin: filas transparentes entre el borde inferior del
        // dibujo real (maxY) y el borde inferior del lienzo completo
        // (frameHeight). En la mayoría de hojas de sprite de PMDCollab es
        // pequeño (el Pokémon está casi pegado al fondo del lienzo), pero
        // en algunas -normalmente por animaciones con mucho recorrido
        // vertical, como el baile de Toxtricity, o poses de ataque como
        // las de Tinkaton- el lienzo es mucho más alto que el propio
        // dibujo. Se usa para corregir el anclaje del sprite (ver
        // --pmd-bottom-offset en PMDSprite.play()).
        resolve({ width: maxX - minX + 1, height: maxY - minY + 1, bottomMargin: frameHeight - 1 - maxY });
      } catch (err) {
        resolve(null); // canvas "tainted" por CORS u otro fallo: sin medida real
      }
    };
    img.onerror = () => resolve(null);
    img.src = imgUrl;
  });
  pmdContentSizeCache[cacheKey] = promise;
  return promise;
}

// Carga y cachea los datos (tamaño de frame, duraciones, imagen) de una animación
// concreta (Walk / Attack / Hurt) para un Pokémon, leyendo el AnimData.xml del
// repositorio de sprites de Pokémon Mundo Misterioso.
async function pmdLoadAnim(dexId, animName, shiny = false) {
  const dex = pmdDexPath(dexId);
  const cacheKey = dex + '::' + animName + (shiny ? '::shiny' : '');
  if (pmdAnimDataCache[cacheKey]) return pmdAnimDataCache[cacheKey];

  // Variante shiny: solo datos locales (nunca red), y solo si este dex
  // tiene las cuatro animaciones shiny completas (ver PMD_SHINY_ANIM_DATA
  // más arriba). Si no está aquí, seguimos con la búsqueda normal de más
  // abajo como si "shiny" no se hubiera pedido: nunca se sustituye por
  // otro sprite ni se deja a medias, ver js/pokemonShiny.js.
  const shinyAnim = shiny && PMD_SHINY_ANIM_DATA[dex] && PMD_SHINY_ANIM_DATA[dex][animName];
  if (shinyAnim) {
    const promise = (async () => ({
      frameWidth: shinyAnim.frameWidth,
      frameHeight: shinyAnim.frameHeight,
      durations: shinyAnim.durations,
      imgUrl: shinyAnim.imgUrl,
      contentSize: pmdMeasureContentSize(shinyAnim.imgUrl, shinyAnim.frameWidth, shinyAnim.frameHeight, 0),
      contentSizeForDirection: direction => pmdMeasureContentSize(shinyAnim.imgUrl, shinyAnim.frameWidth, shinyAnim.frameHeight, direction),
    }))();
    pmdAnimDataCache[cacheKey] = promise;
    return promise;
  }

  // Si esta animación de este dex está en PMD_LOCAL_ANIM_DATA, se sirve con
  // esos datos embebidos y su imagen local, sin pasar por fetch() (ver el
  // porqué en el comentario de PMD_LOCAL_ANIM_DATA más arriba).
  const localAnim = PMD_LOCAL_ANIM_DATA[dex] && PMD_LOCAL_ANIM_DATA[dex][animName];
  if (localAnim) {
    const promise = (async () => ({
      frameWidth: localAnim.frameWidth,
      frameHeight: localAnim.frameHeight,
      durations: localAnim.durations,
      imgUrl: localAnim.imgUrl,
      contentSize: pmdMeasureContentSize(localAnim.imgUrl, localAnim.frameWidth, localAnim.frameHeight, 0),
      contentSizeForDirection: direction => pmdMeasureContentSize(localAnim.imgUrl, localAnim.frameWidth, localAnim.frameHeight, direction),
    }))();
    pmdAnimDataCache[cacheKey] = promise;
    return promise;
  }

  const bases = [`${PMD_SPRITE_BASE}/${dex}`, `${PMD_SPRITE_BASE}/${dex}/0000`];
  const promise = (async () => {
    let lastErr = null;
    for (const base of bases) {
      try {
        const xmlRes = await fetch(`${base}/AnimData.xml`);
        if (!xmlRes.ok) throw new Error('AnimData.xml no encontrado en ' + base);
        const xmlText = await xmlRes.text();
        const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (xmlDoc.querySelector('parsererror')) throw new Error('XML inválido en ' + base);
        const animNodes = Array.from(xmlDoc.getElementsByTagName('Anim'));
        const getTag = (node, tag) => node.getElementsByTagName(tag)[0]?.textContent;
        let node = animNodes.find(a => getTag(a, 'Name') === animName);
        if (!node) throw new Error(`Animación ${animName} no encontrada para ${dex}`);
        let sourceName = animName;
        const copyOf = getTag(node, 'CopyOf');
        if (copyOf) {
          sourceName = copyOf;
          node = animNodes.find(a => getTag(a, 'Name') === copyOf) || node;
        }
        const frameWidth = parseInt(getTag(node, 'FrameWidth') || '32', 10);
        const frameHeight = parseInt(getTag(node, 'FrameHeight') || '32', 10);
        const durations = Array.from(node.getElementsByTagName('Duration')).map(d => parseInt(d.textContent, 10) || 4);
        const imgUrl = `${base}/${sourceName}-Anim.png`;
        // No bloqueamos la animación a que termine de medirse el contenido:
        // se guarda como promesa aparte y play() la consulta cuando esté lista.
        const contentSize = pmdMeasureContentSize(imgUrl, frameWidth, frameHeight, 0);
        return {
          frameWidth, frameHeight,
          durations: durations.length ? durations : [8],
          imgUrl,
          contentSize,
          contentSizeForDirection: direction => pmdMeasureContentSize(imgUrl, frameWidth, frameHeight, direction),
        };
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('No se pudo cargar la animación PMD de ' + dex);
  })();
  pmdAnimDataCache[cacheKey] = promise;
  return promise;
}

// Precarga las 3 animaciones que usa el modo Arena para un Pokémon
export function pmdPreload(dexId) {
  ['Walk', 'Attack', 'Hurt'].forEach(a => pmdLoadAnim(dexId, a).catch(() => {}));
}

// Controlador de un sprite animado PMD dentro de un contenedor del DOM.
// Reproduce Walk (en bucle), Attack y Hurt (una vez) según se le pida,
// y recurre al sprite estático de PokeAPI si el sprite PMD no carga.
export class PMDSprite {
  // options.uncapped: si es true, este sprite ignora el techo de
  // PMD_REFERENCE_SIZE y se muestra siempre a su tamaño real (sin
  // --pmd-normalize reducido), aunque su dibujo mida más de 26px. Se usa
  // para los combatientes del Coliseo (modo Arena): Pokémon grandes como
  // Rayquaza o Zapdos deben verse a tamaño real ahí. La cola del Coliseo y
  // el resto de modos NO pasan esta opción y siguen recortándose al techo
  // habitual, así que un mismo Pokémon puede tener normalize=1 (real) como
  // combatiente y normalize<1 (recortado) como caminante de la cola sin
  // pisarse: ver pmdDexNormalizeCache vs pmdDexNormalizeCacheUncapped más
  // abajo, cacheados por separado precisamente por esto.
  constructor(container, fallbackSpriteUrl, options = {}) {
    this.container = container;
    this.uncapped = !!options.uncapped;
    // Si el contenedor se reutiliza (ej. tras la derrota de un retador),
    // se limpia el desvanecimiento del combate anterior antes de reaparecer.
    this.container.classList.remove('pmd-fainting');
    this.container.innerHTML = `<img class="pmd-fallback-img" src="${fallbackSpriteUrl}" alt="">`;
    this.fallbackImg = this.container.querySelector('.pmd-fallback-img');
    this.frameEl = null;
    this.token = 0;
    this.dexId = null;
    this.shiny = false;
    this._timer = null;
    // Datos del fotograma que se está mostrando AHORA MISMO (se actualizan
    // en cada paso de step(), más abajo), usados solo por hitTestPoint()
    // para saber a qué píxel exacto de la hoja de sprites corresponde un
    // punto de la pantalla.
    this._currentImgUrl = null;
    this._currentFrameWidth = 0;
    this._currentFrameHeight = 0;
    this._currentIdx = 0;
    this._currentDirection = 0;
  }
  // Marca el contenedor como "volador" (tipo Volador y/o Levitate, ver
  // pokemonFlightDb.js) o "terrestre" según el dex. El CSS del Coliseo en
  // pantalla completa usa esta clase para acercar los Pokémon terrestres a
  // su sombra de contacto sin tocar a los voladores (ver .fighter::after y
  // .coliseum-scene:fullscreen .pmd-frame en styles.css).
  // shiny: true si este Pokémon salió shiny (0.5%, ver js/pokemonShiny.js).
  // Se guarda en la instancia para que play() la use en cada animación sin
  // que cada modo tenga que volver a pasarla en cada llamada.
  setDex(dexId, shiny = false) {
    this.dexId = dexId;
    this.shiny = !!shiny;
    this.container.classList.toggle('pmd-flying', isFlyingPokemon(dexId));
    this.container.classList.toggle('pmd-shiny', this.shiny);
  }
  // speed > 1 alarga la duración de cada frame (animación más lenta y
  // pausada); se usa para que los Pokémon de la cola caminen despacio.
  play(animName, direction, loop, onEnd, speed = 1) {
    const myToken = ++this.token;
    if (this._timer) clearTimeout(this._timer);
    pmdLoadAnim(this.dexId, animName, this.shiny).then(async anim => {
      if (myToken !== this.token) return;
      if (!this.frameEl) {
        this.frameEl = document.createElement('div');
        this.frameEl.className = 'pmd-frame';
        this.container.appendChild(this.frameEl);
      }
      if (this.fallbackImg) this.fallbackImg.style.display = 'none';
      this.frameEl.classList.toggle('pmd-hurt', animName === 'Hurt');
      const { frameWidth, frameHeight, durations, imgUrl } = anim;
      this.frameEl.style.width = frameWidth + 'px';
      this.frameEl.style.height = frameHeight + 'px';
      this.frameEl.style.backgroundImage = `url('${imgUrl}')`;
      this.frameEl.style.backgroundPositionY = `-${direction * frameHeight}px`;
      this._currentImgUrl = imgUrl;
      this._currentFrameWidth = frameWidth;
      this._currentFrameHeight = frameHeight;
      this._currentDirection = direction;
      // Se pide ya (sin esperar) la lectura por canvas de la hoja de
      // sprites completa, para que hitTestPoint() la tenga lista lo antes
      // posible en vez de descubrir a mitad de un disparo que aún no
      // había terminado de decodificarse.
      pmdLoadFullImageData(imgUrl);
      // Normaliza la escala a partir del tamaño real del dibujo (medido con
      // canvas), no del lienzo del fotograma, para que Pokémon con mucho
      // margen en su hoja de sprites (Palkia, Groudon...) o con fotogramas
      // grandes (Milotic, Gyarados...) se vean con un tamaño consistente en
      // vez de diminutos o cortados. Si no se pudo medir (CORS, fallo de
      // carga...), recurrimos al tamaño nominal del fotograma como antes.
      // Si ya se fijó un --pmd-normalize para este Pokémon (con otra
      // animación, normalmente "Walk"), se reutiliza tal cual en vez de
      // recalcularlo con el recuadro de contenido de ESTA animación: así
      // Walk/Attack/Hurt se ven siempre al mismo tamaño para un mismo
      // Pokémon (ver comentario de pmdDexNormalizeCache más arriba).
      // Los sprites "uncapped" (combatientes del Coliseo) no aplican el
      // techo de PMD_REFERENCE_SIZE: se muestran siempre a tamaño real
      // (normalize=1), sea cual sea el tamaño de su dibujo. Usan su propia
      // caché para no interferir con el normalize recortado que sí siguen
      // usando la cola y el resto de modos.
      const normalizeCache = this.uncapped ? pmdDexNormalizeCacheUncapped : pmdDexNormalizeCache;
      const bottomOffsetCache = this.uncapped ? pmdDexBottomOffsetCacheUncapped : pmdDexBottomOffsetCache;
      // bottomOffsetKey incluye el nombre de la animación Y la dirección a
      // propósito (a diferencia de la clave de normalizeCache, que es solo
      // el dexId): cada animación tiene su propio lienzo, así que el % de
      // anclaje vertical de "Walk" no sirve para "Attack"/"Hurt" (ver
      // comentario de pmdDexBottomOffsetCache más arriba); y dentro de una
      // misma animación, la pose de frente (dirección "abajo") puede tener
      // un margen inferior transparente muy distinto al de la pose de
      // perfil (izquierda/derecha, la que usan los combatientes de Arena y
      // el jefe de Boss cooperativo) -comprobado con Tinkaton-, así que no
      // se puede reutilizar el % calculado para una dirección en otra.
      const bottomOffsetKey = this.dexId != null ? this.dexId + '::' + animName + '::' + direction : null;
      let normalize = this.dexId != null ? normalizeCache[this.dexId] : undefined;
      let bottomOffsetPct = bottomOffsetKey != null ? bottomOffsetCache[bottomOffsetKey] : undefined;
      if (normalize == null || bottomOffsetPct == null) {
        // El tamaño (normalize) se mide siempre sobre la pose de frente
        // (dirección "abajo"), que es representativa del tamaño general del
        // Pokémon y así Walk/Attack/Hurt no cambian de tamaño entre sí. El
        // margen inferior (bottomOffsetPct), en cambio, se mide sobre la
        // dirección que de verdad se va a mostrar en pantalla (ver más
        // abajo): sin esto, Pokémon con un lienzo mucho más alto que su
        // dibujo en esa pose (p.ej. Toxtricity, por su animación de baile,
        // o Tinkaton en su pose de perfil) aparecen "flotando" muy por
        // encima de su sombra de contacto, ya que .pmd-frame ancla el
        // BORDE del lienzo completo (transform-origin: bottom center), no
        // los pies dibujados.
        const content = await anim.contentSize;
        if (myToken !== this.token) return;
        if (normalize == null) {
          if (this.uncapped) {
            normalize = 1;
          } else {
            const contentMaxDim = content ? Math.max(content.width, content.height) : Math.max(frameWidth, frameHeight);
            normalize = contentMaxDim > PMD_REFERENCE_SIZE ? PMD_REFERENCE_SIZE / contentMaxDim : 1;
          }
          if (this.dexId != null) normalizeCache[this.dexId] = normalize;
        }
        if (bottomOffsetPct == null) {
          // direction 0 ("abajo") ya tiene su medida en "content"; para
          // cualquier otra dirección (las que usan Arena y Boss, ver
          // arenaDirectionFor()) se mide aparte esa misma fila del sprite
          // sheet, en vez de reutilizar la de "abajo" como se hacía antes.
          const dirContent = direction === 0
            ? content
            : (anim.contentSizeForDirection ? await anim.contentSizeForDirection(direction) : content);
          if (myToken !== this.token) return;
          // Los Pokémon voladores o con Levitate (isFlyingPokemon, la misma
          // función que marca la clase "pmd-flying") NO se corrigen: su
          // margen inferior suele ser a propósito -el hueco de "flotación"
          // que PMDCollab dibuja para que se vean separados del suelo-, no
          // canvas desperdiciado. Corregirlo también en su caso los
          // "aterrizaría" a la fuerza, deshaciendo ese efecto de vuelo.
          // Comprobado con Zapdos: margen inferior ~48% del lienzo, mayor
          // incluso que el de Toxtricity, pero ahí sí es intencional.
          const isFlying = this.dexId != null && isFlyingPokemon(this.dexId);
          bottomOffsetPct = (!isFlying && dirContent && dirContent.bottomMargin > 0 && frameHeight > 0)
            ? (dirContent.bottomMargin / frameHeight) * 100
            : 0;
          if (bottomOffsetKey != null) bottomOffsetCache[bottomOffsetKey] = bottomOffsetPct;
        }
      }
      this.frameEl.style.setProperty('--pmd-normalize', normalize);
      this.frameEl.style.setProperty('--pmd-bottom-offset', bottomOffsetPct + '%');
      let idx = 0;
      const step = () => {
        if (myToken !== this.token) return;
        this._currentIdx = idx;
        this.frameEl.style.backgroundPositionX = `-${idx * frameWidth}px`;
        const durMs = Math.max(durations[idx] * PMD_TICK_MS * speed, 16);
        this._timer = setTimeout(() => {
          idx++;
          if (idx >= durations.length) {
            if (loop) { idx = 0; }
            else { if (onEnd) onEnd(); return; }
          }
          step();
        }, durMs);
      };
      step();
    }).catch(() => {
      // Sin conexión al repositorio PMD o animación no disponible: usamos el sprite estático
      if (this.fallbackImg) this.fallbackImg.style.display = '';
      if (!loop && onEnd) setTimeout(onEnd, 400);
    });
  }
  destroy() {
    this.token++;
    if (this._timer) clearTimeout(this._timer);
  }
  // Comprueba si un punto de la PANTALLA (coordenadas de cliente, tal cual
  // llegan en e.clientX/e.clientY) cae sobre un píxel NO transparente del
  // dibujo que se está mostrando ahora mismo -el fotograma PMD en curso, o
  // el sprite estático de repuesto si el PMD no llegó a cargar-, en vez de
  // sobre el hueco transparente que rodea a ese dibujo dentro de su
  // recuadro. Se apoya en getBoundingClientRect() del elemento visible, que
  // ya devuelve su recuadro real en pantalla con cualquier transform CSS
  // aplicado (incluido el zoom de la mirilla de Zona Safari), así que no
  // hace falta deshacer a mano ningún escalado.
  hitTestPoint(clientX, clientY) {
    if (this.frameEl && this.frameEl.style.display !== 'none' && this._currentImgUrl) {
      return this._hitTestImage(
        this.frameEl, clientX, clientY,
        this._currentImgUrl, this._currentFrameWidth, this._currentFrameHeight,
        this._currentIdx, this._currentDirection
      );
    }
    if (this.fallbackImg && this.fallbackImg.style.display !== 'none') {
      const w = this.fallbackImg.naturalWidth, h = this.fallbackImg.naturalHeight;
      if (!w || !h) return false;
      // El sprite de repuesto es una imagen suelta (no una hoja con
      // fotogramas/direcciones): se trata como una hoja de un único
      // fotograma, así se reutiliza la misma comprobación de más abajo.
      return this._hitTestImage(this.fallbackImg, clientX, clientY, this.fallbackImg.src, w, h, 0, 0);
    }
    return false;
  }
  _hitTestImage(el, clientX, clientY, imgUrl, frameWidth, frameHeight, idx, direction) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return false;
    pmdLoadFullImageData(imgUrl); // por si aún no se había pedido, para la próxima vez
    const sheet = pmdImageDataResolvedCache[imgUrl];
    // Antes, si el canvas todavía no había podido leer los píxeles de la
    // hoja de sprites (lectura asíncrona: hace falta que la imagen cargue Y
    // que el canvas la decodifique), se daba SIEMPRE por fallado el disparo,
    // por muy dentro del recuadro real del Pokémon que cayera el clic. En la
    // práctica (sobre todo dentro de un navegador embebido como el Source de
    // OBS) esa lectura puede tardar, fallar puntualmente o no completarse
    // nunca, dejando la hitbox inservible para siempre en esos casos aunque
    // el recuadro (rect, ya comprobado arriba) sí acertara. Mientras no haya
    // datos de píxel, se usa como respaldo el propio recuadro real en
    // pantalla -ya comprobado más arriba- en vez de fallar a ciegas.
    if (!sheet) return true;
    const relX = Math.min(0.999999, Math.max(0, (clientX - rect.left) / rect.width));
    const relY = Math.min(0.999999, Math.max(0, (clientY - rect.top) / rect.height));
    const sheetX = Math.floor(idx * frameWidth + relX * frameWidth);
    const sheetY = Math.floor(direction * frameHeight + relY * frameHeight);
    if (sheetX < 0 || sheetY < 0 || sheetX >= sheet.width || sheetY >= sheet.height) return false;
    const alpha = sheet.data[(sheetY * sheet.width + sheetX) * 4 + 3];
    return alpha > 10;
  }
  // Comprueba si una franja vertical de la PANTALLA (definida por sus
  // bordes izquierdo/derecho en coordenadas de cliente, iguales a las de
  // getBoundingClientRect()) toca algún píxel NO transparente del dibujo
  // que se está mostrando ahora mismo, sin importar la altura de esa
  // franja. Se usa para el rayo de Venusaur en Rayo Solar, que cae en
  // vertical por toda la pantalla: lo que importa es si su columna de
  // píxeles se cruza con la silueta real del Pokémon, no con un ancho fijo
  // alrededor de su centro (igual que hitTestPoint, pero contra una franja
  // en vez de un único punto).
  hitTestVerticalStrip(screenLeft, screenRight) {
    if (this.frameEl && this.frameEl.style.display !== 'none' && this._currentImgUrl) {
      return this._hitTestStripImage(
        this.frameEl, screenLeft, screenRight,
        this._currentImgUrl, this._currentFrameWidth, this._currentFrameHeight,
        this._currentIdx, this._currentDirection
      );
    }
    if (this.fallbackImg && this.fallbackImg.style.display !== 'none') {
      const w = this.fallbackImg.naturalWidth, h = this.fallbackImg.naturalHeight;
      if (!w || !h) return false;
      return this._hitTestStripImage(this.fallbackImg, screenLeft, screenRight, this.fallbackImg.src, w, h, 0, 0);
    }
    return false;
  }
  _hitTestStripImage(el, screenLeft, screenRight, imgUrl, frameWidth, frameHeight, idx, direction) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const left = Math.max(rect.left, screenLeft);
    const right = Math.min(rect.right, screenRight);
    if (left >= right) return false; // los recuadros ni se solapan: no hace falta mirar píxeles
    pmdLoadFullImageData(imgUrl);
    const sheet = pmdImageDataResolvedCache[imgUrl];
    // Mismo respaldo que en _hitTestImage: si el canvas todavía no ha podido
    // leer los píxeles de la hoja de sprites (o nunca llega a poder, p.ej. en
    // el navegador embebido de OBS), no se falla el rayo a ciegas cuando su
    // franja SÍ se solapa con el recuadro real del jugador (ya comprobado
    // arriba con "left >= right"): se da por alcanzado igualmente.
    if (!sheet) return true;
    const relLeft = Math.min(0.999999, Math.max(0, (left - rect.left) / rect.width));
    const relRight = Math.min(1, Math.max(0.000001, (right - rect.left) / rect.width));
    const sheetXStart = Math.max(idx * frameWidth, Math.floor(idx * frameWidth + relLeft * frameWidth));
    const sheetXEnd = Math.min(idx * frameWidth + frameWidth - 1, Math.ceil(idx * frameWidth + relRight * frameWidth));
    const rowStart = direction * frameHeight;
    const rowEnd = rowStart + frameHeight - 1;
    for (let y = rowStart; y <= rowEnd; y++) {
      if (y < 0 || y >= sheet.height) continue;
      for (let x = sheetXStart; x <= sheetXEnd; x++) {
        if (x < 0 || x >= sheet.width) continue;
        if (sheet.data[(y * sheet.width + x) * 4 + 3] > 10) return true;
      }
    }
    return false;
  }
  // Congela la animación YA, en el fotograma exacto en el que se encuentre
  // en ese instante, sin reiniciarla ni reproducir nada más. A diferencia
  // de play(..., loop=false, ...) -que sí reproduce el ciclo completo una
  // vez antes de quedarse quieto-, pause() no toca el fotograma actual: se
  // usa cuando hace falta detener el sprite al momento (p.ej. al recibir
  // !stop en Zona Safari), sin el retraso de terminar el ciclo de andar.
  pause() {
    this.token++;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }
}

export function arenaDirectionFor(side) {
  return side === 'left' ? PMD_DIR.right : PMD_DIR.left;
}

// Indica si un dex de la Pokédex Nacional tiene, dentro del propio proyecto
// (PMD_LOCAL_ANIM_DB, ver js/data/pmdLocalAnimDb.js), al menos una
// animación PMD descargada. Los modos que dejan elegir Pokémon por nombre
// (Arena, Volcán, Zona Safari, Pokerus) lo usan para rechazar de entrada a
// los pocos Pokémon (ver README_PMD_LOCAL.md) cuyo sprite en PMDCollab/
// SpriteCollab todavía no está completo, en vez de dejarlos elegirse y
// que se vean a medias (o recurriendo a la red) durante la partida.
export function pmdHasLocalSprite(dexId) {
  return !!PMD_LOCAL_ANIM_DATA[pmdDexPath(dexId)];
}
