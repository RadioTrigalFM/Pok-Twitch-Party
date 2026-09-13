// bossLevelBackgroundsDb.js
//
// Fondo del mapa (#boss-map-inner, ver styles.css y renderBoss/
// updateBossMapBackground en boss.js) para cada nivel del modo Boss
// cooperativo. El nivel 1 NO tiene entrada aquí a propósito: mantiene el
// fondo por defecto ya fijado en CSS (--boss-map-bg-image en
// .boss-map-inner, assets/boss/boss_map_bg.jpg), así que
// getBossLevelBackground(1) devuelve null y updateBossMapBackground() deja
// la variable CSS sin tocar (o la limpia si venía de un nivel anterior),
// cayendo de vuelta a ese valor por defecto de la hoja de estilos.
//
// Los niveles 2 a 20 sí tienen entrada propia, una imagen distinta por
// nivel (assets/boss/levels/boss_map_bg_level<N>.jpg), en el mismo formato
// y proporción que el fondo por defecto del nivel 1.
//
// IMPORTANTE sobre las rutas: aunque este fichero vive en js/data/, las
// rutas de aquí abajo van con el mismo prefijo relativo ('../assets/...')
// que usa el valor por defecto en la propia hoja de estilos (ver
// --boss-map-bg-image en .boss-map-inner, css/styles.css). Esto es porque
// el navegador resuelve el url() de una custom property CSS (como
// --boss-map-bg-image, fijada aquí por JS e inyectada vía var() dentro de
// la propiedad "background") tomando como base la URL de la HOJA DE
// ESTILOS donde se usa var(), NO la del documento HTML ni la del propio
// módulo JS que puso el valor. Como css/styles.css está en css/, hay que
// subir un nivel ('../') para llegar a assets/ — poner aquí una ruta sin
// ese prefijo (p. ej. 'assets/boss/levels/...') resuelve mal a
// 'css/assets/boss/levels/...' y la imagen nunca llega a cargar (bug ya
// visto: los fondos de nivel no se mostraban).
export const BOSS_LEVEL_BACKGROUNDS = {
  2: '../assets/boss/levels/boss_map_bg_level2.jpg',
  3: '../assets/boss/levels/boss_map_bg_level3.jpg',
  4: '../assets/boss/levels/boss_map_bg_level4.jpg',
  5: '../assets/boss/levels/boss_map_bg_level6.jpg',
  6: '../assets/boss/levels/boss_map_bg_level5.jpg',
  7: '../assets/boss/levels/boss_map_bg_level7.jpg',
  8: '../assets/boss/levels/boss_map_bg_level8.jpg',
  9: '../assets/boss/levels/boss_map_bg_level9.jpg',
  10: '../assets/boss/levels/boss_map_bg_level10.jpg',
  11: '../assets/boss/levels/boss_map_bg_level11.jpg',
  12: '../assets/boss/levels/boss_map_bg_level12.jpg',
  13: '../assets/boss/levels/boss_map_bg_level13.jpg',
  14: '../assets/boss/levels/boss_map_bg_level14.jpg',
  15: '../assets/boss/levels/boss_map_bg_level15.jpg',
  16: '../assets/boss/levels/boss_map_bg_level16.jpg',
  17: '../assets/boss/levels/boss_map_bg_level17.jpg',
  18: '../assets/boss/levels/boss_map_bg_level18.jpg',
  19: '../assets/boss/levels/boss_map_bg_level19.jpg',
  20: '../assets/boss/levels/boss_map_bg_level20.jpg',
};

// Devuelve la ruta del fondo fijado para ese nivel, o null si el nivel no
// tiene entrada propia (el nivel 1, o cualquier valor fuera de rango) —
// en cuyo caso el llamador (updateBossMapBackground, en boss.js) debe
// dejar el fondo por defecto de la hoja de estilos.
export function getBossLevelBackground(level) {
  return BOSS_LEVEL_BACKGROUNDS[level] || null;
}
