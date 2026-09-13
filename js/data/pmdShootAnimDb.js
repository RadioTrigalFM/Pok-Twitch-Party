/* =========================================================
   BASE DE DATOS LOCAL DE LA ANIMACIÓN "SHOOT" (Pokémon Mundo
   Misterioso), PARA LOS MODOS VOLCÁN Y RAYO SOLAR
   -----------------------------------------------------------
   Igual que PMD_LOCAL_ANIM_DB (ver ese fichero y pmdSprite.js),
   pero para la animación "Shoot" de Heatran (485, modo Volcán) y de
   Venusaur (3, modo Rayo Solar), descargada desde el AnimData.xml
   oficial de PMDCollab/SpriteCollab junto con su hoja de sprites
   ("Shoot-Anim.png"), ya incluida en el proyecto en
   assets/pmd/0485/Shoot-Anim.png y assets/pmd/0003/Shoot-Anim.png
   respectivamente.
   -----------------------------------------------------------
   Con esto el modo Volcán y el modo Rayo Solar pueden reproducir su
   animación de disparo sin depender de la red: pmdSprite.js consulta
   esta tabla (ver PMD_SHOOT_ANIM_DB) además de PMD_LOCAL_ANIM_DB, y
   solo recurre a la red si el dex no está aquí.
   -----------------------------------------------------------
   NO EDITAR A MANO: para regenerar/ampliar, hay que volver a
   descargar del repositorio PMDCollab/SpriteCollab.
   ========================================================= */
export const PMD_SHOOT_ANIM_DB = {"0485":{"Shoot":{"frameWidth":40,"frameHeight":40,"durations":[2,2,6,1,2,2,2,2,2,2,2,2],"imgUrl":"assets/pmd/0485/Shoot-Anim.png"}},"0003":{"Shoot":{"frameWidth":40,"frameHeight":40,"durations":[12,4,4,4,2,2],"imgUrl":"assets/pmd/0003/Shoot-Anim.png"}}};
