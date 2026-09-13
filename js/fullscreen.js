/* =========================================================
   ESTADO COMPARTIDO DE PANTALLA COMPLETA POR ESCENA
   -----------------------------------------------------------
   Vive en su propio módulo (en vez de dentro de eventListeners.js)
   para que utils.js pueda consultar qué escena está en pantalla
   completa ahora mismo -por ejemplo, para reubicar el modal global
   dentro de ella y que siga siendo visible- sin crear una
   dependencia circular entre eventListeners.js y utils.js.
   ========================================================= */

// Preferencia "Pantalla completa automática": si está activa, al entrar a
// cualquier modo de juego se solicita pantalla completa automáticamente
// (ver el listener de 'pk-mode-launched' en eventListeners.js). El
// streamer puede seguir saliendo de la pantalla completa en cualquier
// momento con el botón de la escena, Esc, o los controles del navegador,
// exactamente igual que si la hubiera activado a mano.
const AUTO_FULLSCREEN_STORAGE_KEY = 'pokekukoro_auto_fullscreen';
let autoFullscreenEnabled = false;

export function loadAutoFullscreenPref() {
  try {
    autoFullscreenEnabled = localStorage.getItem(AUTO_FULLSCREEN_STORAGE_KEY) === '1';
  } catch (e) {
    autoFullscreenEnabled = false;
  }
  return autoFullscreenEnabled;
}

export function isAutoFullscreenEnabled() {
  return autoFullscreenEnabled;
}

export function setAutoFullscreen(enabled) {
  autoFullscreenEnabled = !!enabled;
  try {
    localStorage.setItem(AUTO_FULLSCREEN_STORAGE_KEY, autoFullscreenEnabled ? '1' : '0');
  } catch (e) {
    // ignoramos si no se puede persistir
  }
}

// Escena que está en modo "pantalla completa simulada" (position:fixed),
// usado cuando la API nativa de Fullscreen no existe o el navegador la
// bloquea en silencio (Safari iOS, algunos navegadores embebidos como OBS
// Browser Source). null si no hay ninguna en ese modo.
let sceneFallbackEl = null;

export function getSceneFallbackElement() {
  return sceneFallbackEl;
}

export function setSceneFallbackElement(el) {
  sceneFallbackEl = el;
}

// Los modos con lobby + "Nueva Partida" (Rayo Solar, Zona Safari, Avalugg,
// Vista Lince, El Volcán, Voltorb Explosivo, Zoroarks) reconstruyen
// #game-content de golpe con innerHTML al reiniciar, lo que destruye la
// escena que estuviera en pantalla completa en ese momento SIN pasar por
// exitFallbackFullscreen(). Si esa escena estaba en el modo simulado
// (".fs-fallback"), sceneFallbackEl se queda apuntando a un nodo ya fuera
// del documento -y ahí se queda, porque nada más la limpia-. Si justo
// después la escena nueva (p.ej. el lobby recién creado) sí consigue
// pantalla completa NATIVA de verdad, currentFullscreenElement() seguiría
// devolviendo ese rastro obsoleto porque document.fullscreenElement no es
// la única condición que mira: por eso se comprueba y se descarta aquí,
// antes de devolver nada, en vez de fiarse ciegamente de la variable.
function pruneStaleFallback() {
  if (sceneFallbackEl && !sceneFallbackEl.isConnected) {
    sceneFallbackEl = null;
    document.body.classList.remove('fs-fallback-lock');
  }
}

// Devuelve el elemento .game-scene actualmente en pantalla completa (ya sea
// por la API nativa o por el modo simulado), o null si no hay ninguna.
export function currentFullscreenElement() {
  const native = document.fullscreenElement
    || document.webkitFullscreenElement
    || document.msFullscreenElement;
  if (native) return native;
  pruneStaleFallback();
  return sceneFallbackEl || null;
}

export function isFullscreenActive() {
  return !!currentFullscreenElement();
}

/* ---------- Mecánica de entrada/salida de pantalla completa ----------
   Vive aquí (y no en eventListeners.js, donde se define el botón "⛶" de
   cada escena) para que otros módulos -como rayosolar.js, al reconstruir
   su lobby tras "Nueva Partida"- puedan pedir o quitar la pantalla
   completa de una escena por su cuenta, sin depender de eventListeners.js
   (que a su vez depende de modeLauncher.js, que importa a los propios
   modos: importar eventListeners.js desde un modo crearía un ciclo).
   Mismo repertorio de API nativa + fallback ".fs-fallback" que el resto
   del archivo: ver la explicación larga en eventListeners.js. */

// Escalado de sprites en pantalla completa (modo Zoroarks): no-op para
// cualquier escena que no contenga .zor-field-outer (ver el "if (!field)
// return;" de abajo), así que es seguro invocarlo desde cualquier escena.
const FS_SPRITE_SCALE_SELECTOR = '.zor-field-outer';
const ZOR_MAP_BG_NATURAL_W = 1376;
const ZOR_MAP_BG_NATURAL_H = 768;
let spriteScaleObserver = null;
let spriteScaleEl = null;
let spriteScaleBaseline = null;

function zorMapCoverScale(w, h) {
  return Math.max(w / ZOR_MAP_BG_NATURAL_W, h / ZOR_MAP_BG_NATURAL_H);
}

function startFullscreenSpriteScale(sceneEl) {
  const field = sceneEl.matches(FS_SPRITE_SCALE_SELECTOR)
    ? sceneEl
    : sceneEl.querySelector(FS_SPRITE_SCALE_SELECTOR);
  if (!field) return;
  const rect = field.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  stopFullscreenSpriteScale();
  spriteScaleEl = field;
  spriteScaleBaseline = { coverScale: zorMapCoverScale(rect.width, rect.height) };
  spriteScaleObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry || !spriteScaleBaseline) return;
    const { width, height } = entry.contentRect;
    if (!width || !height) return;
    const scale = zorMapCoverScale(width, height) / spriteScaleBaseline.coverScale;
    field.style.setProperty('--zor-sprite-scale', Math.max(1, scale).toFixed(4));
  });
  spriteScaleObserver.observe(field);
}

export function stopFullscreenSpriteScale() {
  if (spriteScaleObserver) { spriteScaleObserver.disconnect(); spriteScaleObserver = null; }
  if (spriteScaleEl) { spriteScaleEl.style.removeProperty('--zor-sprite-scale'); spriteScaleEl = null; }
  spriteScaleBaseline = null;
}

// Entra en pantalla completa "simulada" (position:fixed) sobre sceneEl: se
// usa cuando la API nativa no existe o la rechaza en silencio. No llama a
// updateSceneFullscreenBtns() directamente (eso vive en eventListeners.js,
// evitando el ciclo de imports de arriba): el evento 'scenefsfallbackchange'
// que dispara aquí ya lo tiene escuchado eventListeners.js para refrescar
// los botones y reubicar el modal.
export function enterFallbackFullscreen(sceneEl) {
  setSceneFallbackElement(sceneEl);
  sceneEl.classList.add('fs-fallback');
  document.body.classList.add('fs-fallback-lock');
  document.dispatchEvent(new CustomEvent('scenefsfallbackchange'));
}

export function exitFallbackFullscreen() {
  if (!sceneFallbackEl) return;
  sceneFallbackEl.classList.remove('fs-fallback');
  setSceneFallbackElement(null);
  document.body.classList.remove('fs-fallback-lock');
  document.dispatchEvent(new CustomEvent('scenefsfallbackchange'));
}

// Indica si hay un gesto de usuario "reciente" (transient activation)
// detrás de la llamada actual: la API nativa de pantalla completa exige
// esto para conceder la petición, así que se usa para decidir si un
// rechazo de requestFullscreen() significa "este navegador no puede dar
// pantalla completa nativa" (toca simularla) o simplemente "esta llamada
// en concreto no llevaba un clic real detrás" (ver requestSceneFullscreen
// más abajo). navigator.userActivation no existe en todos los navegadores
// (p.ej. Safari antiguo): si no está disponible, se asume que sí hay
// gesto para no cambiar el comportamiento previo en esos casos.
export function hasRecentUserGesture() {
  return !navigator.userActivation || navigator.userActivation.isActive;
}

// Pide pantalla completa sobre sceneEl (API nativa, con fallback simulado
// si no existe o la rechaza), sin comprobar antes si ya había otra escena
// en pantalla completa: úsalo cuando ya sabes que quieres ENTRAR (p.ej.
// rayosolar.js restaurándola tras reconstruir su lobby). Para alternar
// según el estado actual de una escena con su propio botón "⛶", usa
// toggleSceneFullscreen.
//
// El segundo parámetro (auto) indica que esta petición NO viene de un
// clic real del streamer, sino de código que intenta restaurar la
// pantalla completa por su cuenta desde un setTimeout/setInterval. En ese caso, si
// el navegador rechaza requestFullscreen() por no llevar un gesto de
// usuario detrás -algo que Chrome/Firefox/Edge hacen siempre, aunque el
// entorno soporte perfectamente la pantalla completa nativa-, NO se
// recurre al modo simulado (.fs-fallback): forzarlo ahí dejaría la escena
// estirada a tamaño de ventana completa por encima de todo, tapando y
// bloqueando los botones "⚙️ Ajustes" y "← Menú" de la cabecera (que
// viven fuera de la escena) sin que el streamer haya pedido pantalla
// completa de verdad. Se prefiere dejar la partida en su tamaño normal y
// que sea el propio streamer quien pulse "⛶" si la quiere. Esto no afecta
// a los entornos donde la API nativa no existe en absoluto (Safari
// iOS/OBS Browser Source): ahí se sigue usando el modo simulado siempre,
// sea o no automática la llamada, porque no es un problema de falta de
// gesto sino de soporte real.
export function requestSceneFullscreen(sceneEl, { auto = false } = {}) {
  if (!sceneEl) return;
  // Descarta cualquier rastro obsoleto de una escena anterior antes de
  // pedir pantalla completa para la nueva (ver el comentario largo de
  // pruneStaleFallback más arriba): si no se hace aquí, sceneFallbackEl
  // podría quedar apuntando a un nodo ya destruido mientras esta escena
  // nueva entra en pantalla completa nativa de verdad.
  pruneStaleFallback();
  // Se mide el tamaño "normal" del mapa ANTES de pedir pantalla completa
  // (por cualquiera de las dos vías), que es el único momento en que
  // todavía no ha crecido (ver zoroarks.js/styles.css para el porqué).
  startFullscreenSpriteScale(sceneEl);
  const req = sceneEl.requestFullscreen || sceneEl.webkitRequestFullscreen || sceneEl.msRequestFullscreen;
  if (!req) { enterFallbackFullscreen(sceneEl); return; }
  // Si esta llamada es automática y ya sabemos que no hay gesto de
  // usuario reciente, ni siquiera merece la pena intentar la API nativa
  // (el navegador la va a rechazar seguro): se deja la escena en su
  // tamaño normal directamente, sin el viaje de ida y vuelta por la
  // promesa rechazada.
  if (auto && !hasRecentUserGesture()) { stopFullscreenSpriteScale(); return; }
  // requestFullscreen puede no devolver promesa (Safari con prefijo) o
  // puede rechazarla (p.ej. si el navegador la deniega por política, o
  // -en llamadas automáticas- por no llevar gesto de usuario); en ambos
  // casos de fallo se recurre al modo simulado, salvo que sea una llamada
  // automática (ver el porqué en el comentario grande de arriba).
  let result;
  try {
    result = req.call(sceneEl);
  } catch (err) {
    if (!auto) enterFallbackFullscreen(sceneEl); else stopFullscreenSpriteScale();
    return;
  }
  if (result && typeof result.catch === 'function') {
    result.catch(() => {
      if (!auto) enterFallbackFullscreen(sceneEl); else stopFullscreenSpriteScale();
    });
  }
}

// Sale de la pantalla completa actual (nativa o simulada), sea cual sea la
// escena que la tenga.
export function exitSceneFullscreen() {
  stopFullscreenSpriteScale();
  // Ver el comentario largo de pruneStaleFallback: sin esto, un rastro
  // obsoleto de sceneFallbackEl hace que esta función crea que solo hay
  // que salir del modo simulado y nunca llegue a llamar a
  // document.exitFullscreen() -dejando el navegador realmente atrapado en
  // pantalla completa nativa, con cualquier botón fuera de la escena
  // (como "Volver al menú") inaccesible aunque la interfaz ya "crea" que
  // se ha salido-.
  pruneStaleFallback();
  if (sceneFallbackEl) {
    exitFallbackFullscreen();
    return;
  }
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (exit) exit.call(document);
}

// Alterna la pantalla completa de sceneEl según haya o no una escena en
// pantalla completa ahora mismo: usado por el botón "⛶" de cada escena
// (ver eventListeners.js).
export function toggleSceneFullscreen(sceneEl) {
  if (!sceneEl) return;
  if (!currentFullscreenElement()) {
    requestSceneFullscreen(sceneEl);
  } else {
    exitSceneFullscreen();
  }
}

/* ---------------------------------------------------------
   TAMAÑO FIJO EN PANTALLA COMPLETA (ignora el zoom del navegador)
   -----------------------------------------------------------
   Por defecto, ".game-scene:fullscreen"/".fs-fallback" (ver styles.css)
   ocupan "100vw/100vh": ese tamaño está expresado en píxeles CSS, que NO
   son un tamaño físico fijo -son relativos al zoom del navegador-, así
   que la mayoría de elementos del juego (sprites, HUD, texto...), al
   estar dimensionados en px/rem dentro de esa caja, se ven más grandes o
   más pequeños según el streamer tenga más o menos zoom aplicado.

   Para evitarlo, justo al ENTRAR en pantalla completa (real o simulada)
   se toma una "foto" de referencia: el tamaño del viewport en ese
   instante (window.innerWidth/innerHeight) y el devicePixelRatio de ese
   momento (window.devicePixelRatio, que SÍ sube o baja de forma fiable
   con el zoom del navegador -a diferencia de window.screen.width/height,
   cuyo comportamiento con el zoom no es consistente entre navegadores/
   sistemas operativos, así que no sirve como referencia-). Esa referencia
   se fija como tamaño "nativo" de la escena (width/height en px) durante
   TODA esa sesión de pantalla completa.

   En cada recálculo posterior (incluido el primero) se compara el
   devicePixelRatio ACTUAL con el de referencia: si el streamer ha hecho
   zoom desde que entró en pantalla completa, devicePixelRatio habrá
   cambiado en la misma proporción, así que basta aplicar un "transform:
   scale()" = (dpr de referencia / dpr actual) sobre la caja de tamaño
   fijo para que su tamaño FÍSICO en pantalla se mantenga exactamente
   igual al que tenía al entrar, por mucho que el streamer seguga
   haciendo zoom después. Como el resto de elementos de la escena están
   dimensionados en relación a esa caja -que ya no depende del zoom
   actual-, mantienen siempre el mismo tamaño físico en pantalla.

   Al SALIR de pantalla completa (o al entrar una escena distinta) se
   descarta esa referencia: la próxima vez que se entre en pantalla
   completa, el zoom que tenga el streamer EN ESE MOMENTO vuelve a ser el
   que se toma como "tamaño fijo", tal y como se pidió (el ajuste solo
   aplica dentro de pantalla completa, nunca fuera).

   Origen "top left" a propósito (en vez de centrar con top/left): algunas
   escenas (el modo ".fs-fallback") fijan "inset: 0" con "!important" (ver
   styles.css), que ganaría a cualquier "top"/"left" puestos aquí por JS;
   anclando en la esquina superior izquierda se evita ese conflicto por
   completo y, al capturarse la referencia justo al entrar (cuando la caja
   ya ocupa exactamente el viewport, sin zoom acumulado todavía), no queda
   ningún hueco apreciable en los otros bordes. */
let fullscreenSizeLockEl = null;
let fullscreenSizeLockBaseline = null; // { w, h, dpr } capturado al entrar

function clearFullscreenSizeLock() {
  if (!fullscreenSizeLockEl) return;
  fullscreenSizeLockEl.style.width = '';
  fullscreenSizeLockEl.style.height = '';
  fullscreenSizeLockEl.style.transform = '';
  fullscreenSizeLockEl.style.transformOrigin = '';
  fullscreenSizeLockEl = null;
  fullscreenSizeLockBaseline = null;
}

function applyFullscreenSizeLock() {
  const sceneEl = currentFullscreenElement();
  if (!sceneEl) { clearFullscreenSizeLock(); return; }
  if (fullscreenSizeLockEl !== sceneEl) {
    // Escena nueva (o primera vez que se detecta ésta): el zoom actual, en
    // este preciso instante, pasa a ser la referencia fija para el resto
    // de esta sesión de pantalla completa.
    clearFullscreenSizeLock();
    fullscreenSizeLockEl = sceneEl;
    fullscreenSizeLockBaseline = {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };
  }
  const base = fullscreenSizeLockBaseline;
  const currentDpr = window.devicePixelRatio || 1;
  const scale = (base.dpr / currentDpr) || 1;
  sceneEl.style.width = base.w + 'px';
  sceneEl.style.height = base.h + 'px';
  sceneEl.style.transform = `scale(${scale})`;
  sceneEl.style.transformOrigin = 'top left';
}

['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange', 'scenefsfallbackchange'].forEach(evt => {
  document.addEventListener(evt, applyFullscreenSizeLock);
});
// El zoom del navegador (Ctrl +/-) dispara 'resize' en window (cambia
// window.innerWidth/innerHeight y devicePixelRatio), así que basta con
// escuchar aquí para recalcular el "transform: scale()" en tiempo real
// mientras el streamer esté en pantalla completa; fuera de pantalla
// completa la función no hace nada (currentFullscreenElement() devuelve
// null).
window.addEventListener('resize', applyFullscreenSizeLock);
