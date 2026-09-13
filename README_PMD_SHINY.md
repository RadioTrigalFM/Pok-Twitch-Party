# Sprites PMD shiny (0.5% al inscribirse con !pokemon)

## Qué es esto

Todos los modos de juego en los que se elige Pokémon con el comando
`!pokemon` (Coliseo, Boss cooperativo, Pokerus, Rayo Solar, Zona Safari y
El Volcán) tienen ahora un **0.5% de probabilidad** de que el Pokémon
elegido salga **shiny**: se sortea una sola vez, en el momento de
inscribirse (`rollShinyPokemon()`, ver `js/pokemonShiny.js`), y si sale
shiny se queda así para toda la partida (cola, coliseo, combate, etc. —
todo usa la misma copia con `isShiny: true`).

Cuando un Pokémon sale shiny, su sprite PMD (Walk/Attack/Hurt/Sleep) se
sustituye por su recolor shiny real -descargado igual que los sprites
normales del repositorio comunitario **PMDCollab/SpriteCollab**
(https://sprites.pmdcollab.org/)-, y además se le añade un pequeño
destello dorado en CSS (`.pmd-shiny`, ver `css/styles.css`) para que se
note a simple vista.

## Cobertura: 1030 de 1110 Pokémon del juego

Un Pokémon **solo** puede salir shiny si tiene las **cuatro** animaciones
-Walk, Attack, Hurt y Sleep- shiny completas en PMDCollab/SpriteCollab. Se
comprobó una a una (HTTP HEAD real contra el repositorio) para los 1110
Pokémon de `ARENA_POKEMON_DB` (toda la Pokédex Nacional completa que ya
usa el juego, más las 85 formas
especiales: megas, formas regionales, Origen/Primigenio/Corona, los 17
tipos de Arceus, etc.).

**1030 Pokémon SÍ pueden salir shiny.** Están recogidos en
`js/data/pmdShinyAnimDb.js` (`PMD_SHINY_ANIM_DB`), con el mismo formato
que `PMD_LOCAL_ANIM_DB` pero incluyendo también `Sleep`. Sus 4 sprites por
Pokémon están descargados en `assets/pmd_shiny/<id>/`.

**80 Pokémon NO pueden salir shiny** porque a día de hoy les falta
alguna de las cuatro animaciones shiny en el repositorio comunitario. Tal
y como se pidió: en ningún caso se sustituyen por otro sprite ni por su
forma base (p. ej. si Lucario Mega no tuviera su shiny completo, NO se
usaría el shiny de Lucario normal) — simplemente esos Pokémon nunca salen
shiny, ni siquiera con el 0.5%; para el jugador es indistinguible de
cualquier otro Pokémon (no se avisa de que "no puede ser shiny" en ningún
sitio, tal y como pasa con cualquier otro Pokémon normal que no lo sea por
simple mala suerte).

Lista completa de los 80 excluidos (nombre tal cual aparece en el
juego):

- Simisear (id interno 514)
- Simipour (id interno 516)
- Tranquill (id interno 520)
- Blitzle (id interno 522)
- Zebstrika (id interno 523)
- Throh (id interno 538)
- Crustle (id interno 558)
- Tirtouga (id interno 564)
- Carracosta (id interno 565)
- Karrablast (id interno 588)
- Amoonguss (id interno 591)
- Frillish (id interno 592)
- Jellicent (id interno 593)
- Shelmet (id interno 616)
- Stunfisk (id interno 618)
- Bouffalant (id interno 626)
- Pyroar (id interno 668)
- Aromatisse (id interno 683)
- Dedenne (id interno 702)
- Trumbeak (id interno 732)
- Toucannon (id interno 733)
- Gumshoos (id interno 735)
- Oricorio (id interno 741)
- Shiinotic (id interno 756)
- Oranguru (id interno 765)
- Greedent (id interno 820)
- Rolycoly (id interno 837)
- Carkol (id interno 838)
- Coalossal (id interno 839)
- Barraskewda (id interno 847)
- Sirfetch'd (id interno 865)
- Mr. Rime (id interno 866)
- Milcery (id interno 868)
- Falinks (id interno 870)
- Stonjourner (id interno 874)
- Cufant (id interno 878)
- Copperajah (id interno 879)
- Arctovish (id interno 883)
- Zarude (id interno 893)
- Glastrier (id interno 896)
- Oinkologne (id interno 916)
- Dolliv (id interno 929)
- Squawkabilly (id interno 931)
- Naclstack (id interno 933)
- Maschiff (id interno 942)
- Mabosstiff (id interno 943)
- Shroodle (id interno 944)
- Grafaiai (id interno 945)
- Brambleghast (id interno 947)
- Toedscool (id interno 948)
- Toedscruel (id interno 949)
- Klawf (id interno 950)
- Rabsca (id interno 954)
- Espathra (id interno 956)
- Bombirdier (id interno 962)
- Orthworm (id interno 968)
- Flamigo (id interno 973)
- Brute Bonnet (id interno 986)
- Iron Treads (id interno 990)
- Iron Jugulis (id interno 993)
- Gimmighoul (id interno 999)
- Wo-Chien (id interno 1001)
- Chien-Pao (id interno 1002)
- Ting-Lu (id interno 1003)
- Koraidon (id interno 1007)
- Miraidon (id interno 1008)
- Okidogi (id interno 1014)
- Gouging Fire (id interno 1020)
- Raging Bolt (id interno 1021)
- Iron Boulder (id interno 1022)
- Iron Crown (id interno 1023)
- Pecharunt (id interno 1025)
- Lugia Oscuro (id interno 9008)
- Dialga Primario (id interno 9011)
- Terapagos Terastal (id interno 9014)
- Mewtwo Sombra (id interno 9024)
- Tyranitar Mega (id interno 9050)
- Medicham Mega (id interno 9054)
- Darumaka Galar (id interno 9080)
- Meowth Galar (id interno 9083)

## Cómo se decide y aplica

1. `js/pokemonShiny.js` expone `pmdHasShinySprite(dexId)` (mira si el dex
   está en `PMD_SHINY_ANIM_DB`) y `rollShinyPokemon(pokemon)`, que
   **siempre devuelve una copia nueva** del Pokémon (nunca muta la entrada
   original de `ARENA_POKEMON_DB`, que está compartida entre todos los
   jugadores a la vez) con `isShiny: true/false` ya decidido.
2. Cada uno de los 6 modos llama a `rollShinyPokemon()` justo después de
   validar el nombre escrito en `!pokemon` (y antes de guardar al jugador
   en su cola/lobby), así que `isShiny` viaja ya pegado al objeto
   `pokemon` del jugador en todo el resto del código de ese modo.
3. `PMDSprite.setDex(dexId, shiny)` (en `js/pmdSprite.js`) guarda el flag
   en la instancia; `play()` se lo pasa a `pmdLoadAnim()`, que si `shiny`
   es true busca primero en `PMD_SHINY_ANIM_DB` (datos 100% locales, sin
   red) y solo si no lo encuentra sigue con la búsqueda normal (esto en la
   práctica no debería pasar nunca, porque cada modo ya comprobó
   `pmdHasShinySprite()` de forma indirecta al hacer el sorteo).
4. Las llamadas a `setDex(...)` de cada modo (`js/modes/*.js`) se
   actualizaron para pasar `pokemon.isShiny` como segundo argumento
   siempre que el sprite representa al Pokémon elegido por un jugador
   (los sprites de jefes/NPCs fijos como Heatran o Venusaur no llevan
   flag shiny, no forman parte de este sorteo).

## Regenerar / ampliar esta lista en el futuro

Si el repositorio PMDCollab/SpriteCollab añade sprites shiny nuevos, para
volver a comprobar y descargar hay que repetir el proceso: por cada
Pokémon de `ARENA_POKEMON_DB`, resolver su dex real + forma en el
repositorio (ver el mapeo de formas especiales usado durante el
desarrollo), comprobar si existen `Walk-Anim.png`, `Attack-Anim.png`,
`Hurt-Anim.png` y `Sleep-Anim.png` en
`sprite/<dex4>/<forma>/0001/` (ruta shiny; `0001` = forma base, forma
alternativa = su propio id de forma) del repositorio, descargar los que
tengan las 4 completas a `assets/pmd_shiny/<id>/`, y regenerar
`js/data/pmdShinyAnimDb.js` a partir de sus `AnimData.xml` con las mismas
claves de 4 dígitos que usa `pmdDexPath()`.
