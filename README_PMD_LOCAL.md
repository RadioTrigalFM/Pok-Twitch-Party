## Formas alternativas añadidas manualmente (dex 9001-9019)

Además de las formas por defecto de la Pokédex Nacional, se añadieron 19
formas alternativas como entradas independientes de `ARENA_POKEMON_DB`
(y por tanto seleccionables con `!pokemon <nombre>` en Coliseo, Pokerus,
Zona Safari, Volcán, Rayo Solar y Boss cooperativo), con sus tres
animaciones locales (Walk/Attack/Hurt) más Sleep, descargadas de
PMDCollab/SpriteCollab:

| Dex local | Nombre en el juego | Pokémon / forma |
|-----------|--------------------|------------------|
| 9001 | Aegislash Espada | Aegislash, Blade Forme |
| 9002 | Wishiwashi Banco | Wishiwashi, School Form |
| 9003 | Floette Flor Eterna | Floette, Eternal Flower |
| 9004 | Meloetta Danza | Meloetta, Pirouette Forme |
| 9005 | Shaymin Cielo | Shaymin, Sky Forme |
| 9006 | Landorus Therian | Landorus, Therian Forme |
| 9007 | Hoopa Desatado | Hoopa, Unbound |
| 9008 | Lugia Oscuro | Lugia, Shadow Lugia |
| 9009 | Palkia Origen | Palkia, Origin Forme |
| 9010 | Dialga Origen | Dialga, Origin Forme |
| 9011 | Dialga Primario | Dialga, Primal (slot no canónico de SpriteCollab) |
| 9012 | Giratina Origen | Giratina, Origin Forme |
| 9013 | Zygarde Completo | Zygarde, Complete Forme |
| 9014 | Terapagos Terastal | Terapagos, Terastal Form |
| 9015 | Zamazenta Corona | Zamazenta, Crowned Shield |
| 9016 | Zacian Corona | Zacian, Crowned Sword |
| 9017 | Kyogre Primigenio | Kyogre, Primal Reversion |
| 9018 | Groudon Primigenio | Groudon, Primal Reversion |
| 9019 | Ultra Necrozma | Necrozma, Ultra Necrozma |

Los tipos se actualizaron cuando la forma cambia de tipo respecto a la
base (p.ej. Zacian Corona y Zamazenta Corona ganan tipo Acero, Groudon
Primigenio gana tipo Fuego, Ultra Necrozma pasa a Psíquico/Dragón); los
movimientos se heredan del tipo primario de cada Pokémon (que no cambia
en ninguno de estos casos), igual que el resto de la base de datos.

Dos peticiones no se pudieron cubrir con datos completos:
- **Necrozma Dusk Mane / Dawn Wings**: a día de la descarga no tienen
  ningún sprite subido en PMDCollab/SpriteCollab (a diferencia de Ultra
  Necrozma, que sí está completo), así que no se pudieron añadir.
- **Basculegion macho/hembra**: el repositorio solo tiene un único
  diseño de sprite para Basculegion (sin variante de género diferenciada
  como en los juegos principales), así que solo existe una entrada
  (la ya presente en la Pokédex Nacional, dex 902).

## Animaciones adicionales: Sleep (modo Boss) y Shoot (modo Volcán)

Además de `PMD_LOCAL_ANIM_DB` (Walk/Attack/Hurt), el proyecto incluye dos
tablas más generadas de la misma forma, descargando de PMDCollab/
SpriteCollab:

- `js/data/pmdSleepAnimDb.js` (`PMD_SLEEP_ANIM_DB`): la animación "Sleep"
  de los 966 Pokémon de `ARENA_POKEMON_DB` que la tienen disponible, para
  que el modo Boss cooperativo la muestre sin depender de la red cuando un
  combatiente está derrotado. Excepciones (sin "Sleep" en el repositorio,
  solo Idle/Rotate/Walk/etc.): Sirfetch'd (865), Stonjourner (874),
  Copperajah (879) y Dracozolt (883). Oricorio (741) y Gimmighoul (999)
  usan aquí la misma forma alternativa que ya usa `PMD_LOCAL_ANIM_DB`
  (Pom-Pom Style y Roaming Form).
- `js/data/pmdShootAnimDb.js` (`PMD_SHOOT_ANIM_DB`): la animación "Shoot"
  de Heatran (485), usada por el modo Volcán.

`pmdSprite.js` fusiona las tres tablas por dex antes de buscar una
animación local, así que cualquiera de las tres cubre el mismo hueco: si
falta ahí, se sigue intentando la carga por red y, si falla, el sprite
estático de PokeAPI.

# Excepciones de PMD_LOCAL_ANIM_DB

Generado junto con `js/data/pmdLocalAnimDb.js` al descargar de
PMDCollab/SpriteCollab los sprites animados (Walk/Attack/Hurt) de los
968 Pokémon usados en el juego (Vista Lince, Pokerus, Safari, Volcán,
Voltorb Explosivo, Zoroarks y la Pokédex Nacional completa del modo
Arena), incluyendo una segunda tanda posterior con la forma por
defecto de 41 Pokémon que antes faltaban en la Pokédex Nacional del
modo Arena (Nidoran♂/♀, Deoxys, Burmy/Wormadam, Giratina, Shaymin,
Basculin, Darmanitan, Tornadus/Thundurus/Landorus, Keldeo, Meloetta,
Meowstic, Aegislash, Pumpkaboo/Gourgeist, Hoopa, Oricorio, Lycanroc,
Wishiwashi, Minior, Toxtricity, Eiscue, Indeedee, Morpeko,
Zacian/Zamazenta, Urshifu, Basculegion, Enamorus, Oinkologne,
Maushold, Squawkabilly, Palafin, Tatsugiri, Dudunsparce, Gimmighoul,
Ogerpon y Terapagos); de esos 41, 3 no tenían la forma por defecto
disponible en el repositorio (ver la segunda tabla más abajo) y se
quedaron fuera de `PMD_LOCAL_ANIM_DB`.

Los siguientes 54 Pokémon (de un total de 984) no tienen,
a día de la descarga, las tres animaciones Walk/Attack/Hurt completas
en ese repositorio comunitario (algunos solo tienen Idle/Rotate u otro
subconjunto, y otros no tienen ningún sprite subido todavía), así que
no están en `PMD_LOCAL_ANIM_DB`. Para esos, `pmdSprite.js` sigue
intentando cargar la animación por red (igual que antes de esta
descarga) y, si no hay conexión o el sprite sigue sin existir, recurre
al sprite estático de PokeAPI de siempre.

| Dex | Nombre |
|-----|--------|
| 514 | Simisear |
| 516 | Simipour |
| 520 | Tranquill |
| 522 | Blitzle |
| 523 | Zebstrika |
| 538 | Throh |
| 558 | Crustle |
| 564 | Tirtouga |
| 565 | Carracosta |
| 591 | Amoonguss |
| 592 | Frillish |
| 616 | Shelmet |
| 618 | Stunfisk |
| 626 | Bouffalant |
| 668 | Pyroar |
| 683 | Aromatisse |
| 732 | Trumbeak |
| 733 | Toucannon |
| 735 | Gumshoos |
| 756 | Shiinotic |
| 765 | Oranguru |
| 837 | Rolycoly |
| 838 | Carkol |
| 839 | Coalossal |
| 847 | Barraskewda |
| 866 | Mr. Rime |
| 870 | Falinks |
| 878 | Cufant |
| 893 | Zarude |
| 896 | Glastrier |
| 929 | Dolliv |
| 942 | Maschiff |
| 943 | Mabosstiff |
| 944 | Shroodle |
| 945 | Grafaiai |
| 947 | Brambleghast |
| 949 | Toedscruel |
| 950 | Klawf |
| 954 | Rabsca |
| 956 | Espathra |
| 962 | Bombirdier |
| 973 | Flamigo |
| 986 | Brute Bonnet |
| 990 | Iron Treads |
| 993 | Iron Jugulis |
| 1001 | Wo-Chien |
| 1002 | Chien-Pao |
| 1003 | Ting-Lu |
| 1008 | Miraidon |
| 1014 | Okidogi |
| 1020 | Gouging Fire |
| 1021 | Raging Bolt |
| 1022 | Iron Boulder |
| 1023 | Iron Crown |

Para volver a intentarlo más adelante (por si el repositorio se ha
completado con nuevos sprites), basta con repetir el proceso de
descarga para estos números de Pokédex.

## Forma por defecto no disponible (segunda tanda, los 41 nuevos)

De los 41 Pokémon con forma múltiple añadidos a la Pokédex Nacional
del modo Arena, estos no tienen la forma por defecto (la que en
teoría le correspondería usar a `ARENA_POKEMON_DB`) con las tres
animaciones completas en el repositorio:

| Dex | Nombre | Forma por defecto (no disponible) |
|-----|--------|-------------------------------------|
| 741 | Oricorio | Baile Style |
| 931 | Squawkabilly | Green Plumage |
| 999 | Gimmighoul | Chest Form |

Para Oricorio (741) y Gimmighoul (999) sí había otra forma suya con
las tres animaciones completas, así que `PMD_LOCAL_ANIM_DB` usa esa
en su lugar (Oricorio: Pom-Pom Style; Gimmighoul: Roaming Form) — es
decir, al elegir "Oricorio" o "Gimmighoul" en el juego se ve esa
forma animada en vez de la de la Pokédex Nacional (Baile Style /
Chest Form) o el sprite estático de repuesto.

Squawkabilly (931) sigue siendo una excepción real: ninguna de sus
formas tiene sprite subido todavía en el repositorio, así que sigue
dependiendo de la carga por red y, si falla, del sprite estático de
PokeAPI.

## Todas las formas de Arceus y todas las Megaevoluciones (dex 9025-9067)

Añadidas 43 entradas más a `ARENA_POKEMON_DB` (y por tanto seleccionables
con `!pokemon <nombre>` en Coliseo, Pokerus, Zona Safari, Volcán, Rayo
Solar y Boss cooperativo), con sus animaciones Walk/Attack/Hurt/Sleep
descargadas de PMDCollab/SpriteCollab e incluidas en el proyecto:

- **Las 17 formas alternativas de tipo de Arceus** (dex 9025-9041):
  Bicho, Siniestro, Dragón, Eléctrico, Lucha, Fuego, Volador, Fantasma,
  Planta, Tierra, Hielo, Veneno, Psíquico, Roca, Acero, Agua y Hada.
  Las cuatro tienen sprite y animación Sleep completos en el
  repositorio, así que las 17 se añadieron sin excepciones.
- **26 Megaevoluciones oficiales** (dex 9042-9067): Charizard Mega X,
  Alakazam Mega, Gengar Mega, Kangaskhan Mega, Aerodactyl Mega, Mewtwo
  Mega Y, Steelix Mega, Houndoom Mega, Tyranitar Mega, Gardevoir Mega,
  Sableye Mega, Mawile Mega, Medicham Mega, Manectric Mega, Camerupt
  Mega, Altaria Mega, Banette Mega, Absol Mega, Glalie Mega, Latias
  Mega, Latios Mega, Rayquaza Mega, Lopunny Mega, Lucario Mega, Gallade
  Mega y Diancie Mega.

De las 48 Megaevoluciones oficiales de los juegos principales, 22 no se
pudieron añadir porque a día de la descarga PMDCollab/SpriteCollab solo
tiene el retrato (icono de cara) subido para esa forma, no el sprite de
cuerpo completo animado (o le falta alguna de las cuatro animaciones
Walk/Attack/Hurt/Sleep): Venusaur Mega, Charizard Mega Y, Blastoise
Mega, Beedrill Mega, Pidgeot Mega, Slowbro Mega (falta Hurt), Pinsir
Mega, Gyarados Mega, Mewtwo Mega X, Ampharos Mega, Scizor Mega,
Heracross Mega, Sceptile Mega (faltan Attack y Hurt), Blaziken Mega,
Swampert Mega, Aggron Mega, Sharpedo Mega (falta Hurt), Salamence Mega,
Metagross Mega, Garchomp Mega, Abomasnow Mega y Audino Mega. Para
volver a intentarlo más adelante, basta con repetir el proceso de
descarga para esos números de Pokédex y forma "Mega"/"Mega_X"/"Mega_Y".

## Kyurem Negro (dex 9085)

Añadida una entrada más a `ARENA_POKEMON_DB` para la forma Black Kyurem
(dex 9085), con sus animaciones Walk/Attack/Hurt/Sleep descargadas de
PMDCollab/SpriteCollab (`sprite/0646/0001`), usada como forma a la que se
transforma el jefe Kyurem del nivel 13 del modo Boss cooperativo al
quedarse a la mitad de su vida o menos (ver `BOSS_MIDFIGHT_TRANSFORM_DB`
en `js/data/bossMidfightTransformDb.js`). Mismo tipo (Dragón/Hielo) y
movimientos que la forma base, ya que no cambia de tipo.

No se añadieron las Megaevoluciones "fan-made" que el repositorio marca
con nombres como `Mega_Z`, `Mega_Baby`, `Mega_Altcolor` o los "Mega" de
Pokémon que nunca tuvieron Megaevolución oficial en los juegos (p.ej.
Meganium, Feraligatr, Emboar, Chesnaught, Delphox, Greninja, Froslass,
Heatran, Darkrai, Golisopod, Zeraora, etc.), ya que no forman parte del
juego real.
