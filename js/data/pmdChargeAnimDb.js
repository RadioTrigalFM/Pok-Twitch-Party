/* =========================================================
   BASE DE DATOS LOCAL DE LA ANIMACIÓN "CHARGE" (Pokémon Mundo
   Misterioso), PARA EL MODO RAYO SOLAR
   -----------------------------------------------------------
   Igual que PMD_SHOOT_ANIM_DB (ver ese fichero y pmdSprite.js),
   pero para la animación "Charge" de Venusaur (3, modo Rayo Solar),
   descargada desde el AnimData.xml oficial de
   PMDCollab/SpriteCollab junto con su hoja de sprites
   ("Charge-Anim.png"), ya incluida en el proyecto en
   assets/pmd/0003/Charge-Anim.png.
   -----------------------------------------------------------
   Con esto el modo Rayo Solar puede reproducir la animación de
   "cargar" el Rayo Solar (previa al disparo) sin depender de la
   red: pmdSprite.js consulta esta tabla (ver PMD_CHARGE_ANIM_DB)
   además de PMD_LOCAL_ANIM_DB/PMD_SHOOT_ANIM_DB, y solo recurre a
   la red si el dex no está aquí.
   -----------------------------------------------------------
   NO EDITAR A MANO: para regenerar/ampliar, hay que volver a
   descargar del repositorio PMDCollab/SpriteCollab.
   ========================================================= */
export const PMD_CHARGE_ANIM_DB = {"0003":{"Charge":{"frameWidth":32,"frameHeight":40,"durations":[2,2,2,2,2,2,2,2,2,2],"imgUrl":"assets/pmd/0003/Charge-Anim.png"}}};
