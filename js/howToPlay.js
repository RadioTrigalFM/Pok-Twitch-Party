import { $, showScreen } from './utils.js';

/* =========================================================
   PANTALLA "CÓMO JUGAR" — accesible desde el botón "❓ Cómo Jugar"
   de cada tarjeta del menú de selección de modo.
   -----------------------------------------------------------
   Es una pantalla de solo lectura (no cambia ningún estado del
   juego): explica en detalle los comandos y la mecánica de un
   modo, con capturas de pantalla reales tomadas en Modo Demo. El
   contenido de cada modo vive en HOWTO_CONTENT y se renderiza bajo
   demanda (ver renderHowTo) la primera vez que se abre su ficha;
   una vez montado el HTML de un modo se guarda en caché
   (renderedModes) para no reconstruirlo cada vez.
   ========================================================= */

const HOWTO_CONTENT = {
  pasapalabra: {
    title: '🎯 Pasapalabra',
    images: ['pasapalabra-1.png'],
    intro: 'El Streamer compite contra todo el Chat a la vez. Se juega con el rosco de siempre, de la A a la Z: en cada letra aparece una pregunta cuya respuesta empieza (o contiene) esa letra, y gana la letra quien la acierte primero, sea el Streamer o cualquier espectador.',
    commands: [
      { cmd: '!&lt;respuesta&gt;', desc: 'La propia respuesta ES el comando, pegada al "!" (p.ej. "!carmin", "!pikachu"). No hace falta escribir nada delante.' },
    ],
    roles: [
      { icon: '🎤', name: 'Streamer', tag: 'Compite en solitario', color: 'var(--green)', desc: 'Responde desde su propio cuadro de texto en pantalla.' },
      { icon: '💬', name: 'Chat', tag: 'Compite en equipo', color: 'var(--blue)', desc: 'Cualquier espectador puede intentarlo escribiendo "!" seguido de la respuesta. Se la lleva quien acierte primero.' },
    ],
    cycle: [
      { icon: '🎯', label: 'Nueva letra', desc: 'Se revela la pregunta de la siguiente letra pendiente del rosco y arranca la cuenta atrás de 30s.' },
      { icon: '⌨️', label: 'A responder', desc: 'El Streamer escribe en su cuadro de texto mientras el chat compite en paralelo con "!respuesta".' },
      { icon: '🏅', label: 'Se resuelve la letra', desc: 'Gana quien acierte primero: un aviso en pantalla muestra el ganador y la respuesta correcta.' },
      { icon: '⏭️', label: 'Letra siguiente', desc: 'Tras un breve instante, el rosco avanza solo a la próxima letra pendiente, sin intervención de nadie.' },
    ],
    stats: [
      { icon: '⏱️', value: '30s', label: 'Tiempo por letra', desc: 'Cuenta atrás para acertar antes de que se agote y la letra quede pendiente para la siguiente vuelta.' },
      { icon: '🔤', value: '27', label: 'Letras del rosco', desc: 'De la A a la Z, cada una con su propia pregunta.' },
      { icon: '🔁', value: '×2', label: 'Vueltas máximas', desc: 'El rosco da como máximo dos vueltas completas antes de terminar la partida.' },
    ],
    toggles: [
      { icon: '🔒', label: 'Bloqueo del chat', color: 'var(--red)', desc: 'El Streamer puede bloquear temporalmente la participación del chat para responder él solo todas las letras.' },
    ],
    outcomes: [
      { icon: '🎤', label: 'Gana el Streamer', color: 'var(--green)', desc: 'Si termina con más letras acertadas que el chat.' },
      { icon: '💬', label: 'Gana el Chat', color: 'var(--blue)', desc: 'Si, entre todos sus espectadores, acierta más letras que el Streamer.' },
      { icon: '🤝', label: 'Empate', color: 'var(--yellow)', desc: 'Si ambos terminan la partida con el mismo número de letras a su favor.' },
    ],
    sections: [
      { heading: 'Segundas oportunidades', text: 'Tanto el Streamer como el chat pueden fallar y volver a intentarlo cuantas veces quieran mientras la letra siga abierta: fallar no elimina a nadie ni cierra la pregunta, solo hace perder un poco del tiempo disponible.' },
      { heading: 'Ranking en vivo', text: 'En pantalla completa se muestra un ranking lateral con los usuarios del chat que más letras llevan acertadas, actualizado al instante cada vez que alguien gana una; al terminar la partida se repite ese mismo ranking completo en la pantalla de resultados.' },
      { heading: 'Fin de la partida', text: 'Las letras que sigan sin resolverse después de la segunda vuelta se dan por perdidas y termina la partida.' },
    ],
  },

  rayosolar: {
    title: '☀️ Rayo Solar',
    images: ['rayosolar-1.png'],
    intro: 'Todo el mapa es un prado partido en dos franjas: arriba pasea un Venusaur gigante y solitario; abajo están todos los Pokémon de los jugadores. Sobrevive a sus descargas de Rayo Solar hasta ser el último en pie.',
    commands: [
      { cmd: '!pokemon [nombre]', desc: 'Apuntarse en el lobby eligiendo cualquier Pokémon de toda la Pokédex Nacional.' },
      { cmd: '!izquierda / !i', desc: 'Tu Pokémon camina sin parar hacia la izquierda hasta el borde del campo o hasta que le mandes otra orden.' },
      { cmd: '!derecha / !d', desc: 'Igual que el anterior, pero hacia la derecha.' },
      { cmd: '!stop', desc: 'Tu Pokémon se detiene donde esté.' },
    ],
    roles: [
      { icon: '🌱', name: 'Venusaur', tag: 'La amenaza, controlada por la IA', color: 'var(--green)', desc: 'Deambula solo por la franja superior, muy despacio, y de vez en cuando dispara su Rayo Solar contra todo el campo inferior.' },
      { icon: '🎮', name: 'Jugador', tag: 'El chat', color: 'var(--blue)', desc: 'Controla a su Pokémon por la franja inferior con !izquierda/!derecha/!stop, intentando no estar debajo cuando llegue el disparo.' },
    ],
    cycle: [
      { icon: '🚶', label: 'Venusaur deambula', desc: 'Camina solo, muy despacio y al azar, por la franja superior del mapa.' },
      { icon: '⏸️', label: 'Se detiene', desc: 'Cada vez que para, tiene un 30% de probabilidades de cargar su Rayo Solar en vez de seguir paseando.' },
      { icon: '☀️', label: 'Carga y dispara', desc: 'Tras una fase de carga, el rayo golpea toda la franja inferior del campo.' },
      { icon: '💥', label: 'Impacto', desc: 'Quien esté en la zona de impacto en ese instante queda eliminado al momento.' },
    ],
    stats: [
      { icon: '👥', value: '2', label: 'Jugadores mínimos', desc: 'Hacen falta al menos 2 apuntados para que el Streamer pueda empezar la partida.' },
      { icon: '🎲', value: '30%', label: 'Probabilidad de disparo', desc: 'Cada vez que Venusaur se detiene, esta es su probabilidad de cargar el Rayo Solar en lugar de seguir paseando.' },
      { icon: '⚡', value: '×1,1', label: 'Aceleración', desc: 'Cada disparo acelera un poco más el ritmo de Venusaur (paseo, carga y pausas), de forma acumulativa.' },
    ],
    sections: [
      { heading: 'El terreno', text: 'El movimiento de los jugadores es siempre horizontal y queda confinado a la franja inferior: no se puede subir a la zona donde pasea Venusaur.' },
      { heading: 'Cuando falla demasiado', text: 'Si Venusaur encadena varios disparos seguidos sin alcanzar a nadie, deja de pasear al azar: se coloca justo encima de un jugador y dispara directamente. Si la racha de fallos sigue creciendo, además se mueve mucho más rápido por el mapa hasta volver a acertar.' },
      { heading: 'Fin de la partida', text: 'Gana el último Pokémon que quede con vida. Si el Rayo Solar acaba con todos a la vez, la partida también termina sin ganador.' },
    ],
  },

  arena: {
    title: '⚔️ Arena Pokémon',
    images: ['arena-1.png'],
    intro: 'El Coliseo Pokémon: los espectadores hacen cola para retar al campeón actual en duelos automáticos 1 contra 1. Quien gana se queda de campeón esperando al siguiente retador.',
    commands: [
      { cmd: '!pokemon [nombre]', desc: 'Ponerte en la cola del coliseo con el Pokémon que elijas (hasta 16 en cola a la vez).' },
      { cmd: '!habilidad1 / !habilidad2', desc: 'Cambiar el tipo de tu ataque especial, si tu Pokémon tiene dos tipos.' },
      { cmd: '!torneo', desc: 'Apuntarte al Torneo mientras el Streamer tiene la inscripción abierta (hacen falta al menos 4 jugadores).' },
    ],
    roles: [
      { icon: '👑', name: 'Campeón', tag: 'Reina en el coliseo', color: 'var(--yellow)', desc: 'Quien ganó el combate anterior, o el primero en llegar a la cola si el coliseo está vacío. Espera ahí hasta que suba un retador.' },
      { icon: '⚔️', name: 'Retador', tag: 'El siguiente de la cola', color: 'var(--blue)', desc: 'Sube a luchar cuando el Streamer pulsa "Avanzar Cola" (o solo, en cuanto le toca, si el modo Auto está activado).' },
    ],
    cycle: [
      { icon: '🎟️', label: 'Únete a la cola', desc: 'Escribe !pokemon [nombre] para apuntarte con el Pokémon que quieras.' },
      { icon: '👑', label: 'Se corona Campeón', desc: 'El primero de la cola sube al coliseo y espera a su primer retador.' },
      { icon: '▶️', label: 'Avanza la cola', desc: 'El Streamer pulsa "Avanzar Cola" (o Auto ON) para que suba el siguiente retador.' },
      { icon: '⚔️', label: 'Combate automático', desc: 'Los dos Pokémon se atacan solos cada 1,6s, sin que el chat escriba comandos de ataque.' },
      { icon: '🏆', label: 'Nueva corona', desc: 'El ganador se queda de Campeón; el perdedor sale (o repite cola si hay Reingreso).' },
    ],
    stats: [
      { icon: '❤️', value: '120', label: 'Vida', desc: 'Igual para todos los Pokémon del coliseo.' },
      { icon: '👊', value: '×22', label: 'Ataque normal', desc: 'Daño base de un golpe normal.' },
      { icon: '💥', value: '10%', label: 'Golpe crítico', desc: 'Probabilidad de crítico en cada ataque.' },
      { icon: '💨', value: '10%', label: 'Esquiva', desc: 'Probabilidad de esquivar el ataque recibido por completo.' },
      { icon: '⏱️', value: '1,6s', label: 'Ritmo de turno', desc: 'Cada cuánto ataca en automático el Pokémon al que le toca.' },
    ],
    toggles: [
      { icon: '🤖', label: 'Auto', color: 'var(--blue)', desc: 'La cola avanza sola en cuanto el coliseo queda libre. Desactivado, el Streamer debe pulsar "Avanzar Cola" cada vez.' },
      { icon: '🔁', label: 'Reingreso', color: 'var(--green)', desc: 'Permite que quien pierda un combate pueda volver a hacer cola con !pokemon. Desactivado, queda fuera el resto de la sesión.' },
      { icon: '🏆', label: 'Torneo', color: 'var(--yellow)', desc: 'Abre una inscripción aparte (!torneo, mínimo 4 jugadores) y genera un cuadro de eliminatoria directa hasta coronar un campeón, con la cola normal en pausa mientras dura.' },
    ],
    typeChartTitle: '🎯 Efectividad de tipos',
    typeChart: [
      { icon: '💥', mult: '×2', label: 'Súper efectivo', color: 'var(--green)', desc: 'El rival es débil a ese tipo. Puede llegar a ×4 si es débil a sus dos tipos a la vez.' },
      { icon: '⚖️', mult: '×1', label: 'Neutral', color: 'var(--yellow)', desc: 'Daño normal: el tipo de ataque no tiene ventaja ni desventaja especial contra el rival.' },
      { icon: '🛡️', mult: '×0,5', label: 'Resiste', color: 'var(--blue)', desc: 'El rival resiste ese tipo. Puede bajar hasta ×0,25 si resiste con sus dos tipos a la vez.' },
      { icon: '🚫', mult: '×0', label: 'Inmune', color: 'var(--red)', desc: 'El ataque no le hace absolutamente nada al rival.' },
    ],
    highlight: {
      icon: '👊',
      heading: 'El tipo del ataque',
      color: 'var(--yellow)',
      text: 'Cada golpe usa el tipo primario del Pokémon (o el secundario con !habilidad2, si tiene dos) y su daño se multiplica según la tabla de tipos oficial, tal y como se ve arriba. El resto de estadísticas (vida, ataque, crítico, esquiva) es idéntico para toda la Pokédex: lo único que cambia entre Pokémon es ese tipo de ataque.',
    },
  },

  zoroarks: {
    title: '🦊 Zoroarks',
    images: ['zoroarks-1.png'],
    intro: 'Un pueblo de Zoroark de noche: los jugadores exploran sus caminos y, cada día, el pueblo vota a quien cree sospechoso. Sobrevive a las votaciones hasta el final.',
    commands: [
      { cmd: '!participo', desc: 'Apuntarte en el lobby con un NPC al azar.' },
      { cmd: '!bosque / !charca / !pueblo', desc: 'Enviar a tu personaje a explorar ese camino durante la noche.' },
      { cmd: '!plaza', desc: 'Quedarte en la plaza del pueblo (es lo que pasa por defecto si no escribes nada).' },
      { cmd: '!vote &lt;usuario&gt;', desc: 'Durante la fase de votación de cada día, votar a quien crees que deben expulsar (p.ej. !vote Samubf93). Puede votar cualquiera del chat, esté o no en la partida, y el voto no se puede cambiar.' },
      { cmd: '!si / !no', desc: 'Cuando el más votado del día sube al escenario, confirmar o no su expulsión.' },
    ],
    roles: [
      { icon: '🧑‍🌾', name: 'Aldeano', tag: 'La mayoría', color: 'var(--green)', desc: 'No sabe quién es Zoroark. Su única arma es fijarse en quién se comporta raro y votar en consecuencia durante el día.' },
      { icon: '🦊', name: 'Zoroark', tag: '1 o 2, en secreto', color: 'var(--red)', desc: 'Se elige 1 si hay 8 inscritos o menos, 2 a partir de 9. Nunca se distingue del resto en la interfaz y solo muere si el pueblo lo vota y confirma su expulsión.' },
    ],
    cycle: [
      { icon: '🌙', label: 'Elegir camino', desc: 'Cada jugador manda a su personaje a Bosque, Charca, Pueblo o Plaza (una vez por noche).' },
      { icon: '💀', label: 'Se cierra la noche', desc: 'Según quién durmió dónde, se calculan las muertes de esa noche (mira los riesgos por ubicación abajo).' },
      { icon: '🗳️', label: 'Votación', desc: 'A partir del día 2, todo el chat vota con !vote a quien sospeche (el primer día no hay votación).' },
      { icon: '⚖️', label: 'Confirmación', desc: 'El más votado sube al escenario y el pueblo confirma o no su expulsión con !si / !no.' },
    ],
    locations: [
      { icon: '🏘️', name: 'Pueblo', risk: 'Riesgo oculto', riskLevel: 'hidden', desc: 'Muere un aldeano al azar por cada Zoroark que haya dormido aquí esa noche.' },
      { icon: '🌊', name: 'Charca', risk: 'Riesgo oculto', riskLevel: 'hidden', desc: 'Mismo peligro que el Pueblo: depende de si hay algún Zoroark durmiendo ahí sin saberlo.' },
      { icon: '🌲', name: 'Bosque', risk: '33% fijo', riskLevel: 'fixed', desc: 'Cada aldeano que duerma aquí tiene un 33% de morir, haya o no Zoroark presente.' },
      { icon: '🏛️', name: 'Plaza', risk: '33% fijo', riskLevel: 'fixed', desc: 'Ubicación por defecto si no escribes nada. Mismo riesgo fijo del 33% que el Bosque.' },
    ],
    outcomes: [
      { icon: '🏆', label: 'Gana el pueblo', color: 'var(--green)', desc: 'En cuanto quedan eliminados todos los Zoroark, siempre por votación: nunca mueren de noche.' },
      { icon: '💀', label: 'Ganan los Zoroark', color: 'var(--red)', desc: 'Si consiguen que no quede ningún aldeano con vida.' },
    ],
  },

  safari: {
    title: '🌿 Zona Safari',
    images: ['safari-1.png'],
    intro: 'Una galería de tiro: el Streamer apunta con el ratón y dispara a los Pokémon de los jugadores mientras ellos intentan cruzar todo el terreno hasta la meta.',
    commands: [
      { cmd: '!pokemon [nombre]', desc: 'Apuntarte en el lobby con el Pokémon que quieras.' },
      { cmd: '!go', desc: 'Tu Pokémon empieza a caminar hacia la meta (empiezan todos quietos).' },
      { cmd: '!stop', desc: 'Tu Pokémon se detiene. Un Pokémon parado es intocable: solo se puede disparar a uno que esté caminando.' },
    ],
    roles: [
      { icon: '🎯', name: 'Streamer', tag: 'El cazador', color: 'var(--red)', desc: 'Apunta con el ratón y dispara con la mirilla; solo puede alcanzar a los Pokémon que estén caminando en ese momento.' },
      { icon: '🐾', name: 'Jugador', tag: 'El chat', color: 'var(--blue)', desc: 'Decide con !go/!stop cuándo arriesgarse a caminar y cuándo quedarse quieto e intocable, hasta cruzar la meta.' },
    ],
    cycle: [
      { icon: '🔍', label: 'Apuntar', desc: 'El Streamer mantiene pulsado el clic izquierdo: se abre una mirilla con zoom que sigue al cursor.' },
      { icon: '🔫', label: 'Disparar', desc: 'Al soltar el clic, dispara justo en el punto donde soltó el botón.' },
      { icon: '🐾', label: 'Caminar o esperar', desc: 'Cada jugador decide con !go/!stop si avanza (arriesgándose) o se para (a salvo, pero sin avanzar).' },
      { icon: '🏁', label: 'Cruzar la meta', desc: 'Quien atraviesa todo el terreno sin caer queda a salvo el resto de la partida.' },
    ],
    stats: [
      { icon: '🔍', value: '×2,2', label: 'Zoom de la mirilla', desc: 'Aumento que aplica la mirilla del Streamer al mantener pulsado el clic.' },
      { icon: '⏱️', value: '100s', label: 'Reloj de la partida', desc: 'Solo baja mientras el Streamer tiene los ojos cerrados; con los ojos abiertos se detiene por completo.' },
    ],
    outcomesTitle: '🏁 Cómo termina la partida',
    outcomes: [
      { icon: '💀', label: 'Elimina a todos', color: 'var(--red)', desc: 'El Streamer consigue disparar a todos los Pokémon antes de que crucen la meta.' },
      { icon: '🏁', label: 'Todos llegan a la meta', color: 'var(--green)', desc: 'Los Pokémon que sigan con vida consiguen cruzar el terreno entero.' },
      { icon: '⏰', label: 'Se agota el reloj', color: 'var(--yellow)', desc: 'El contador de 100s con los ojos cerrados llega a 0 y todos los que no hayan cruzado mueren de golpe.' },
    ],
    highlight: {
      icon: '🙈',
      heading: '"Cerrar los ojos"',
      color: 'var(--green)',
      text: 'El Streamer puede pulsar ESPACIO para "cerrar los ojos" durante unos segundos: mientras dura, no puede disparar, así que es el mejor momento para que los Pokémon caminen sin riesgo.',
    },
  },

  boss: {
    title: '👹 Boss Cooperativo',
    images: ['boss-1.png'],
    intro: 'Un jefe interminable: en cuanto cae uno, aparece otro distinto. Los espectadores se apuntan una única vez y el Streamer decide, combate tras combate, quién sube a luchar 1 contra 1 contra el jefe actual.',
    commands: [
      { cmd: '!pokemon [nombre]', desc: 'Apuntarte en el lobby (o, mientras dure la fase 1 de cada nivel, cambiar el Pokémon con el que ya estabas apuntado).' },
      { cmd: '!habilidad1 / !habilidad2', desc: 'Cambiar el tipo de tu ataque, si tu Pokémon tiene dos tipos.' },
      { cmd: '!levelup ataque / vida / velocidad', desc: 'Gastar tu mejora disponible del nivel actual en esa estadística.' },
      { cmd: '!stats', desc: 'Consultar por chat tus estadísticas de combate actuales: ataque, vida, % de velocidad extra y mejoras !levelup pendientes.' },
      { cmd: '!ready', desc: 'Gesto cosmético mientras esperas tu turno: tu Pokémon hace la animación de "estoy listo". No consume turno ni afecta al combate.' },
    ],
    roles: [
      { icon: '🎤', name: 'Streamer', tag: 'Decide quién sube a luchar', color: 'var(--red)', desc: 'Hace clic sobre un combatiente ya apuntado para que suba a pelear 1 contra 1 contra el jefe; cuando cae, elige a otro para seguir desgastándolo. También reparte los objetos de los cofres entre los combatientes.' },
      { icon: '💬', name: 'Chat', tag: 'Elige Pokémon y mejoras', color: 'var(--blue)', desc: 'Se apunta una única vez con !pokemon y decide sus propias mejoras con !levelup; el combate en sí es automático, nadie ataca por comando.' },
    ],
    cycle: [
      { icon: '⚔️', label: 'Combate automático', desc: 'El combatiente elegido y el jefe se atacan solos, igual que en el Coliseo del modo Arena: nadie ataca por comando.' },
      { icon: '💀', label: 'Cae el combatiente', desc: 'Si pierde, el Streamer elige a otro apuntado para seguir desgastando al mismo jefe.' },
      { icon: '📦', label: 'Cofre', desc: 'Al caer el enemigo de la Fase 10 o el jefe final de la Fase 15, se gana un cofre con un objeto a elegir entre 3 al azar. Una vez equipado a un combatiente, ese objeto no se puede quitar ni cambiar a mano hasta la Fase 1 del nivel siguiente.' },
      { icon: '⬆️', label: 'Siguiente nivel', desc: 'Tras el jefe de la Fase 15, la partida sube de nivel: todos vuelven a la Fase 1 con sus mejoras de !levelup reseteadas a cero.' },
    ],
    phaseTypesTitle: '🏰 Estructura de niveles y fases',
    phaseTypes: [
      { icon: '👊', label: 'Fase normal', badge: 'La mayoría de fases', color: 'var(--blue)', desc: 'Un combatiente contra un enemigo de tamaño normal, igual que un rival cualquiera del nivel.' },
      { icon: '📦', label: 'Fase 10: mini-jefe', badge: 'A mitad de nivel', color: 'var(--yellow)', desc: 'Un Pokémon fijo (no al azar) con más vida que un enemigo normal. Al derrotarlo cae un cofre con un objeto a elegir.' },
      { icon: '👹', label: 'Fase 15: jefe final', badge: 'Última fase del nivel', color: 'var(--red)', desc: 'El enemigo aparece con su sprite extra grande. Al derrotarlo se sube al nivel siguiente y cae otro cofre con objeto.' },
    ],
    stats: [
      { icon: '❤️', value: '120', label: 'Vida base', desc: 'Igual para el jefe y para cada combatiente, antes de aplicar mejoras de !levelup u objetos.' },
      { icon: '👊', value: '22', label: 'Ataque base', desc: 'Daño base de un golpe, antes de mejoras u objetos.' },
      { icon: '👥', value: '16', label: 'Jugadores máximos', desc: 'Cupo máximo de combatientes apuntados en el lobby.' },
      { icon: '🏰', value: '20', label: 'Niveles totales', desc: 'Al completar el nivel 20, la mazmorra vuelve a empezar por el nivel 1: el combate es interminable.' },
      { icon: '🚩', value: '15', label: 'Fases por nivel', desc: 'Cada nivel tiene 15 fases; la 10 trae un mini-jefe y la 15 es el jefe final.' },
    ],
    togglesTitle: '🎛️ Opciones del Streamer',
    toggles: [
      { icon: '🤖', label: 'Modo AFK', color: 'var(--blue)', desc: 'Activable desde el lobby: en vez de que el Streamer elija con el ratón, cada decisión (quién sube a luchar, qué objeto sale del cofre y a quién se le da) se somete a votación del chat con comandos !1, !2... (40 segundos por votación).' },
    ],
    outcomesTitle: '🏁 Fin de la partida',
    outcomes: [
      { icon: '☠️', label: 'Todos caen a la vez', color: 'var(--red)', desc: 'Solo termina si todos los combatientes apuntados se quedan sin vida al mismo tiempo. Mientras quede uno en pie, siempre aparecerá un jefe nuevo tras el anterior: el combate es interminable.' },
    ],
    highlight: {
      icon: '📈',
      heading: '¡Sube de nivel!',
      color: 'var(--yellow)',
      text: 'Cada combatiente dispone de tantas mejoras !levelup como su nivel actual menos 1 (en el Nivel 12, por ejemplo, hay 11 mejoras para repartir entre ataque, vida y velocidad). Ese presupuesto se resetea a cero en cuanto la partida sube de nivel, así que hay que volver a repartirlo desde cero cada vez.',
    },
  },

  pokerus: {
    title: '🧬 Pokerus',
    images: ['pokerus-1.png'],
    intro: 'Al empezar, un porcentaje de los jugadores queda infectado en secreto por el Pokerus. Cada noche hay que elegir en qué sala dormir sin saber quién está contagiado... ¡y el virus se contagia durmiendo cerca de un infectado!',
    commands: [
      { cmd: '!pokemon [nombre]', desc: 'Apuntarte en el lobby con cualquier Pokémon de la Pokédex Nacional (hasta 40 jugadores).' },
      { cmd: '!&lt;número&gt; o !puerta &lt;número&gt;', desc: 'Ir a dormir a esa sala esa noche (p.ej. !3).' },
      { cmd: '!plaza o !0', desc: 'Quedarte a dormir en la plaza, a la intemperie (más riesgo de contagio).' },
    ],
    roles: [
      { icon: '💚', name: 'Sano', tag: 'Sin síntomas', color: 'var(--green)', desc: 'No sabe quién está infectado; su única defensa es fijarse en dónde duerme cada noche.' },
      { icon: '🦠', name: 'Infectado', tag: '~20% al empezar, en secreto', color: 'var(--red)', desc: 'Contagia a quien duerma cerca desde la primera noche, aunque no se vuelve visible hasta el día 3.' },
    ],
    cycle: [
      { icon: '🚪', label: 'Elegir dónde dormir', desc: 'Cada jugador vivo escribe el número de una sala (o se queda en la plaza) para pasar la noche.' },
      { icon: '🌙', label: 'Se cierra la noche', desc: 'Se calcula, sala por sala, quién se contagia según con quién durmió cerca.' },
      { icon: '💀', label: 'Recuento de bajas', desc: 'Los infectados que llegan al día 5 mueren automáticamente esa misma noche.' },
      { icon: '☀️', label: 'Nuevo día', desc: 'Se abren las salas necesarias para los jugadores que quedan vivos y empieza la siguiente ronda.' },
    ],
    locationsTitle: '📍 Dónde dormir y su riesgo',
    locations: [
      { icon: '🏛️', name: 'Plaza', risk: '80% fijo', riskLevel: 'fixed', desc: 'Dormir a la intemperie tiene un riesgo de contagio fijo del 80%, haya o no infectados cerca.' },
      { icon: '🚪', name: 'Cualquier sala', risk: 'Riesgo oculto', riskLevel: 'hidden', desc: 'Segura si nadie infectado duerme ahí; 80% de contagio con exactamente un infectado, y 100% seguro con dos o más.' },
    ],
    stats: [
      { icon: '👥', value: '40', label: 'Jugadores máximos', desc: 'Cupo máximo del lobby de Pokerus.' },
      { icon: '🧬', value: '20%', label: 'Infección inicial', desc: 'Porcentaje de jugadores que empiezan infectados en secreto (paciente cero).' },
      { icon: '🚪', value: '10', label: 'Salas del mapa', desc: 'Siempre las mismas 10 salas fijas; solo cambia cuántas se abren según los jugadores vivos.' },
    ],
    outcomes: [
      { icon: '💚', label: 'Se erradica el virus', color: 'var(--green)', desc: 'Se gana en cuanto no queda ningún jugador infectado con vida.' },
      { icon: '☠️', label: 'Gana el virus', color: 'var(--red)', desc: 'Si el Pokerus consigue acabar con todos los jugadores, sanos e infectados por igual.' },
    ],
    virusStagesTitle: '🧬 Etapas del virus',
    virusStages: [
      { day: 'Día 0', icon: '🌙', label: 'Contagio', color: 'var(--green)', desc: 'Es la noche en la que se contagia. Sigue sin síntomas: indistinguible de un jugador sano.' },
      { day: 'Días 1-2', icon: '🫥', label: 'Incubación', color: 'var(--yellow)', desc: 'No muestra ningún síntoma y parece sano en la interfaz, pero ya contagia a quien duerma cerca.' },
      { day: 'Día 3+', icon: '🦠', label: 'Fase sintomática', color: 'var(--red)', desc: 'Se vuelve visible para todos (icono de infectado) y sigue siendo contagioso.' },
      { day: 'Día 5', icon: '💀', label: 'Muerte', color: 'var(--red-dark)', desc: 'Si nadie lo evita, muere automáticamente esa misma noche.' },
    ],
  },

  volcan: {
    title: '🌋 El Volcán',
    images: ['volcan-1.png'],
    intro: 'Dos plataformas de roca volcánica. Cada cierto tiempo, la plataforma con más Pokémon encima entra en erupción y todos los que sigan ahí mueren. Sobrevive siendo el último en pie.',
    commands: [
      { cmd: '!pokemon [nombre]', desc: 'Apuntarte en el lobby (hacen falta al menos 3 jugadores para empezar).' },
      { cmd: '!izquierda / !i', desc: 'Mandar a tu Pokémon a la plataforma izquierda.' },
      { cmd: '!derecha / !d', desc: 'Mandar a tu Pokémon a la plataforma derecha.' },
    ],
    roles: [
      { icon: '🔥', name: 'Heatran', tag: 'Anuncia la erupción', color: 'var(--red)', desc: 'Desciende desde el cielo justo antes de cada erupción y provoca la lluvia de magma sobre la plataforma elegida.' },
      { icon: '🎮', name: 'Jugador', tag: 'El chat', color: 'var(--blue)', desc: 'Cambia de plataforma con !izquierda/!derecha para escapar de la que esté más poblada antes de que llegue la erupción.' },
    ],
    cycle: [
      { icon: '⏱️', label: 'Cuenta atrás', desc: 'Un contador va bajando hasta la próxima erupción mientras los jugadores cambian de plataforma.' },
      { icon: '🔥', label: 'Heatran desciende', desc: 'Al llegar a 0, Heatran cae del cielo sobre la plataforma con más Pokémon encima en ese momento.' },
      { icon: '🌋', label: 'Lluvia de magma', desc: 'Esa plataforma arde: todo lo que siga ahí muere. La otra queda a salvo esa vez.' },
      { icon: '🔁', label: 'Heatran se retira', desc: 'Cuando termina la lluvia, Heatran vuelve a subir y arranca la cuenta atrás de la siguiente erupción.' },
    ],
    stats: [
      { icon: '👥', value: '3', label: 'Jugadores mínimos', desc: 'Hacen falta al menos 3 apuntados para poder empezar la partida.' },
      { icon: '⏱️', value: '30s', label: 'Ritmo de erupción', desc: 'Cada cuánto tiempo entra en erupción la plataforma más poblada.' },
    ],
    outcomes: [
      { icon: '🏆', label: 'Último en pie', color: 'var(--green)', desc: 'Gana quien sigue con vida cuando ya no queda nadie más.' },
      { icon: '💀', label: 'Mueren todos', color: 'var(--red)', desc: 'Si una erupción se lleva por delante a los últimos jugadores a la vez, la partida termina sin ganador.' },
    ],
    sections: [
      { heading: 'Estrategia', text: 'Como la erupción castiga siempre a la plataforma más poblada, conviene vigilar en todo momento cuál tiene menos gente y cruzar a tiempo antes de que baje el contador a 0.' },
    ],
  },

  vistalince: {
    title: '🦅 Vista Lince',
    images: ['vistalince-1.png'],
    intro: 'Un rancho donde, ronda tras ronda, cruzan Pokémon de izquierda a derecha por un recinto. Cuenta bien cuántos pasan: quien falle el número exacto (o no responda) queda eliminado.',
    commands: [
      { cmd: '!participo', desc: 'Apuntarte en el lobby (hacen falta al menos 2 jugadores).' },
      { cmd: '!&lt;número&gt; (p.ej. !7)', desc: 'Cuando empieza la cuenta atrás de 30s tras el cruce, decir cuántos Pokémon has contado.' },
    ],
    cycle: [
      { icon: '🐾', label: 'Cruce de Pokémon', desc: 'En cada ronda, los Pokémon cruzan el recinto a intervalos aleatorios, uno detrás de otro.' },
      { icon: '🕳️', label: 'Recinto vacío', desc: 'En cuanto termina de pasar el último, arranca la cuenta atrás de 30s para responder.' },
      { icon: '⌨️', label: 'A contar', desc: 'Cada jugador vivo escribe !&lt;número&gt; con la cantidad exacta que ha contado.' },
      { icon: '❌', label: 'Se resuelve', desc: 'Quien falle el número exacto (o no responda) queda eliminado; el resto sigue a la ronda siguiente.' },
    ],
    stats: [
      { icon: '⏱️', value: '30s', label: 'Tiempo para responder', desc: 'Cuenta atrás desde que el recinto queda vacío hasta que se cierran las respuestas.' },
      { icon: '👥', value: '2', label: 'Jugadores mínimos', desc: 'Hacen falta al menos 2 apuntados para que el Streamer pueda empezar la partida.' },
    ],
    togglesTitle: '🎛️ Opciones del Streamer',
    toggles: [
      { icon: '🔮', label: '"Preguntar Antes"', color: 'var(--blue)', desc: 'Opcional. Si el Streamer la activa en el lobby, justo antes de que empiecen a cruzar se muestra un aviso con la pregunta en futuro, para que sepas qué contar desde el principio.' },
      { icon: '🐌', label: '"Eliminar Más Lento"', color: 'var(--green)', desc: 'Opcional, activada por defecto. Si todos los jugadores vivos responden exactamente el mismo número (acierten o no), solo queda eliminado quien respondió el último; el resto sobrevive esa ronda igualmente.' },
    ],
    outcomesTitle: '🏁 Fin de la partida',
    outcomes: [
      { icon: '🏆', label: 'Último en pie', color: 'var(--yellow)', desc: 'La partida termina en cuanto queda un único jugador con vida.' },
    ],
  },

  extranjeria: {
    title: '🛂 Control de Extranjería',
    images: ['extranjeria-1.png'],
    intro: 'Al más puro estilo "Papers, Please": los NPCs hacen cola para pasar el control y el Streamer decide, mirando su pasaporte, si les deja pasar o no.',
    commands: [
      { cmd: '!participo', desc: 'Ponerte en la cola (se te asigna un NPC al azar). No hay límite de partida: la gente se va apuntando y procesando de forma continua.' },
      { cmd: '!info', desc: 'Mientras sigues esperando en la cola, te recuerda por chat los datos de tu propio pasaporte (nombre, edad, región, profesión y equipaje). Deja de estar disponible en cuanto te llaman al mostrador, porque ahí ya se ven en pantalla.' },
      { cmd: '!si / !no', desc: 'Mientras un NPC está siendo atendido, todo el chat vota si debe dejarle pasar o no (el Streamer no está obligado a seguir la votación).' },
    ],
    roles: [
      { icon: '🎤', name: 'Streamer', tag: 'Decide en el mostrador', color: 'var(--red)', desc: 'Pulsa "Llamar Siguiente" para hacer subir al primero de la cola, revisa su pasaporte y decide con ✔ (dejar pasar) o ✗ (denegar).' },
      { icon: '💬', name: 'Chat', tag: 'Vota antes de la decisión', color: 'var(--blue)', desc: 'Mientras un NPC está siendo atendido, todo el chat vota con !si o !no si debe dejarle pasar; el Streamer no está obligado a seguir la votación.' },
    ],
    cycle: [
      { icon: '🎟️', label: 'Únete a la cola', desc: 'Escribe !participo para que se te asigne un NPC al azar y entrar en la cola.' },
      { icon: '📣', label: 'Llamar Siguiente', desc: 'El Streamer hace subir al mostrador al primero de la cola, que deja su pasaporte.' },
      { icon: '🛂', label: 'Revisar pasaporte', desc: 'Al pulsar sobre el pasaporte se ve su nombre, edad, región de origen, profesión y equipaje; cada caso puede esconder en secreto algún dato sospechoso.' },
      { icon: '✔️', label: 'La decisión', desc: 'Con los datos ya vistos (y la votación del chat), el Streamer decide dejarle pasar o denegarle.' },
    ],
    highlight: {
      icon: '💬',
      heading: 'Mientras esperan',
      color: 'var(--blue)',
      text: 'Todo lo que el NPC "dice" en el chat aparece en un bocadillo sobre su cabeza mientras está siendo atendido.',
    },
  },

  voltorb: {
    title: '💣 Voltorb Explosivo',
    images: ['voltorb-1.png'],
    intro: 'Todos en corro, por turnos: hay que nombrar un elemento de la categoría anunciada sin repetir ninguno ya dicho, antes de que tu Voltorb se quede sin vidas... ¡y explote!',
    commands: [
      { cmd: '!participo', desc: 'Apuntarte en el lobby (hasta 24 jugadores; hacen falta al menos 2 para empezar).' },
      { cmd: '!&lt;elemento&gt; (p.ej. !perro)', desc: 'En tu turno, responder pegando la respuesta justo detrás del "!", sin ningún comando previo.' },
    ],
    cycle: [
      { icon: '🏷️', label: 'Nueva categoría', desc: 'Se anuncia una categoría para la ronda (p.ej. "Pokémon de tipo siniestro").' },
      { icon: '🔄', label: 'Turnos', desc: 'Por turnos, cada jugador vivo debe decir con !&lt;elemento&gt; algo válido de esa categoría que nadie haya dicho todavía en la ronda.' },
      { icon: '⏱️', label: 'Fallo, repetición o tiempo', desc: 'Fallar, repetir una respuesta ya dicha, o dejar pasar tu turno sin responder, te resta una vida.' },
      { icon: '💥', label: '¡Explota!', desc: 'Al llegar a 0 vidas, tu Voltorb explota y quedas eliminado de la partida.' },
    ],
    stats: [
      { icon: '❤️', value: '3', label: 'Vidas por jugador', desc: 'Se pierde una vida por cada fallo, repetición o turno agotado.' },
      { icon: '⏱️', value: '25s', label: 'Tiempo por turno', desc: 'Si se agota sin responder, pierdes una vida automáticamente.' },
      { icon: '👥', value: '24', label: 'Jugadores máximos', desc: 'Cupo máximo del lobby de Voltorb Explosivo (mínimo 2 para empezar).' },
    ],
    outcomesTitle: '🏁 Fin de la partida',
    outcomes: [
      { icon: '🏆', label: 'Último en pie', color: 'var(--yellow)', desc: 'Sobrevive el último jugador con vidas restantes.' },
    ],
  },

  avalugg: {
    title: '❄️ Glaciar de Avalugg',
    images: ['avalugg-1.png'],
    intro: 'Una cuadrícula de hielo quebradizo: solo un único camino de casillas es seguro y nadie lo conoce de antemano. Sé el primero en cruzar hasta el trofeo sin caer al hielo roto.',
    commands: [
      { cmd: '!participo', desc: 'Apuntarte en el lobby (hacen falta al menos 1 jugador para empezar).' },
      { cmd: '!&lt;letras wasd&gt; (p.ej. !aasaa)', desc: 'Moverte casilla a casilla: cada letra es un paso (w=arriba, a=izquierda, s=abajo, d=derecha), y se procesan en orden.' },
    ],
    cycle: [
      { icon: '🚪', label: 'Entrada', desc: 'Todos entran caminando desde la izquierda y se reparten en la segunda columna, la única que nunca se rompe junto con la primera.' },
      { icon: '❓', label: 'Camino oculto', desc: 'A partir de ahí, cada casilla puede ser segura o quebradiza sin que se note ninguna diferencia visual.' },
      { icon: '🚶', label: 'Muévete', desc: 'Escribe !&lt;letras wasd&gt; para dar varios pasos seguidos (w=arriba, a=izquierda, s=abajo, d=derecha), procesados en orden.' },
      { icon: '🧊', label: 'Si pisas mal', desc: 'Esa casilla se rompe para siempre (cualquiera que la pise después también cae) y reapareces en una fila aleatoria de la segunda columna; el resto de tu comando se cancela.' },
    ],
    stats: [
      { icon: '📐', value: '14×20', label: 'Tamaño del glaciar', desc: 'Filas × columnas de la cuadrícula; solo un único camino de casillas es seguro de principio a fin.' },
      { icon: '👤', value: '1', label: 'Jugadores mínimos', desc: 'Basta con un jugador apuntado para que el Streamer pueda empezar la partida.' },
    ],
    outcomesTitle: '🏁 Fin de la partida',
    outcomes: [
      { icon: '🏆', label: 'Primero en cruzar', color: 'var(--yellow)', desc: 'Gana el primer jugador que toque el trofeo, en el centro de la última columna.' },
    ],
  },
};

let renderedModes = new Set();

function renderHowTo(mode) {
  const data = HOWTO_CONTENT[mode];
  const content = $('howto-content');
  if (!data || !content) return;
  const titleEl = $('howto-title');
  if (titleEl) titleEl.textContent = data.title;

  const imagesHtml = (data.images || [])
    .map(src => `<img class="howto-shot" src="assets/howto/${src}" alt="Captura de pantalla de ${data.title}" loading="lazy">`)
    .join('');

  const rolesHtml = (data.roles || [])
    .map(r => `
      <div class="howto-role-card" style="--role-color:${r.color}">
        <div class="howto-role-icon">${r.icon}</div>
        <div class="howto-role-name">${r.name}</div>
        ${r.tag ? `<div class="howto-role-tag">${r.tag}</div>` : ''}
        <div class="howto-role-desc">${r.desc}</div>
      </div>
    `).join('');

  const cycleHtml = (data.cycle || [])
    .map((c, i) => `
      <div class="howto-cycle-step">
        <div class="howto-cycle-num">${i + 1}</div>
        <div class="howto-cycle-icon">${c.icon}</div>
        <div class="howto-cycle-label">${c.label}</div>
        <div class="howto-cycle-desc">${c.desc}</div>
      </div>
      ${i < data.cycle.length - 1 ? '<div class="howto-cycle-arrow">→</div>' : ''}
    `).join('');

  const locationsHtml = (data.locations || [])
    .map(l => `
      <div class="howto-location-card risk-${l.riskLevel}">
        <div class="howto-location-icon">${l.icon}</div>
        <div class="howto-location-name">${l.name}</div>
        <div class="howto-location-risk">${l.risk}</div>
        <div class="howto-location-desc">${l.desc}</div>
      </div>
    `).join('');

  const outcomesHtml = (data.outcomes || [])
    .map(o => `
      <div class="howto-outcome-card" style="--outcome-color:${o.color}">
        <div class="howto-outcome-icon">${o.icon}</div>
        <div class="howto-outcome-body">
          <div class="howto-outcome-label">${o.label}</div>
          <div class="howto-outcome-desc">${o.desc}</div>
        </div>
      </div>
    `).join('');

  const statsHtml = (data.stats || [])
    .map(s => `
      <div class="howto-stat-card">
        <div class="howto-stat-icon">${s.icon}</div>
        <div class="howto-stat-value">${s.value}</div>
        <div class="howto-stat-label">${s.label}</div>
        ${s.desc ? `<div class="howto-stat-desc">${s.desc}</div>` : ''}
      </div>
    `).join('');

  const togglesHtml = (data.toggles || [])
    .map(t => `
      <div class="howto-outcome-card" style="--outcome-color:${t.color}">
        <div class="howto-outcome-icon">${t.icon}</div>
        <div class="howto-outcome-body">
          <div class="howto-outcome-label">${t.label}</div>
          <div class="howto-outcome-desc">${t.desc}</div>
        </div>
      </div>
    `).join('');

  const typeChartHtml = (data.typeChart || [])
    .map(t => `
      <div class="howto-typefx-card" style="--typefx-color:${t.color}">
        <div class="howto-typefx-icon">${t.icon}</div>
        <div class="howto-typefx-mult">${t.mult}</div>
        <div class="howto-typefx-label">${t.label}</div>
        <div class="howto-typefx-desc">${t.desc}</div>
      </div>
    `).join('');

  // Estructura de niveles/fases (p.ej. modo Boss): cada tipo de fase es su
  // propia tarjeta con una insignia de color, en vez de mezclarlo todo en
  // un párrafo. Reutiliza el mismo lenguaje visual que las tarjetas de
  // efectividad de tipos (borde superior de color a modo de "categoría").
  const phaseTypesHtml = (data.phaseTypes || [])
    .map(p => `
      <div class="howto-phase-card" style="--phase-color:${p.color}">
        <div class="howto-phase-icon">${p.icon}</div>
        <div class="howto-phase-badge">${p.badge}</div>
        <div class="howto-phase-label">${p.label}</div>
        <div class="howto-phase-desc">${p.desc}</div>
      </div>
    `).join('');

  const commandsHtml = (data.commands || [])
    .map(c => `
      <div class="howto-cmd-card">
        <div class="howto-cmd-chip"><span class="howto-cmd-icon">⌨️</span><code>${c.cmd}</code></div>
        <p class="howto-cmd-desc">${c.desc}</p>
      </div>
    `).join('');

  const sectionsHtml = (data.sections || [])
    .map(s => `
      <div class="howto-section">
        <h4>${s.heading}</h4>
        <p>${s.text}</p>
      </div>
    `).join('');

  // Tarjeta "destacada": una única aclaración final, pero con más peso visual
  // que un .howto-section normal (icono grande, acento de color y fondo en
  // degradado) para que se lea como el cierre importante de la ficha, no
  // como un párrafo más. La usan p.ej. Zona Safari y Arena Pokémon.
  const highlightHtml = data.highlight ? `
    <div class="howto-highlight" style="--highlight-color:${data.highlight.color || 'var(--yellow)'}">
      <div class="howto-highlight-icon">${data.highlight.icon}</div>
      <div class="howto-highlight-body">
        <h4 class="howto-highlight-heading">${data.highlight.heading}</h4>
        <p class="howto-highlight-text">${data.highlight.text}</p>
      </div>
    </div>
  ` : '';

  // Línea de tiempo del Pokerus: en vez de un párrafo describiendo los días
  // 0 / 1-2 / 3+ / 5 uno detrás de otro, cada etapa es su propia tarjeta con
  // el día, un icono y un color que se va poniendo más "peligroso" (verde →
  // amarillo → rojo → rojo oscuro) a medida que avanza la infección.
  const virusStagesHtml = (data.virusStages || [])
    .map((v, i) => `
      <div class="howto-virus-stage" style="--virus-color:${v.color}">
        <div class="howto-virus-day">${v.day}</div>
        <div class="howto-virus-icon">${v.icon}</div>
        <div class="howto-virus-label">${v.label}</div>
        <div class="howto-virus-desc">${v.desc}</div>
      </div>
      ${i < data.virusStages.length - 1 ? '<div class="howto-virus-arrow">→</div>' : ''}
    `).join('');

  content.innerHTML = `
    <p class="howto-intro">${data.intro}</p>
    ${rolesHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.rolesTitle || '👥 Roles'}</h3>
        <div class="howto-roles">${rolesHtml}</div>
      </div>
    ` : ''}
    ${cycleHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.cycleTitle || '🌗 Ciclo del juego'}</h3>
        <div class="howto-cycle">${cycleHtml}</div>
      </div>
    ` : ''}
    ${phaseTypesHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.phaseTypesTitle || '🏰 Estructura de niveles'}</h3>
        <div class="howto-phase-grid">${phaseTypesHtml}</div>
      </div>
    ` : ''}
    ${locationsHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.locationsTitle || '📍 Ubicaciones y riesgo nocturno'}</h3>
        <div class="howto-locations">${locationsHtml}</div>
      </div>
    ` : ''}
    ${outcomesHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.outcomesTitle || '🏁 Cómo se gana'}</h3>
        <div class="howto-outcomes">${outcomesHtml}</div>
      </div>
    ` : ''}
    ${statsHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.statsTitle || '📊 Estadísticas de combate'}</h3>
        <div class="howto-stats">${statsHtml}</div>
      </div>
    ` : ''}
    ${typeChartHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.typeChartTitle || '🎯 Efectividad de tipos'}</h3>
        <div class="howto-typefx">${typeChartHtml}</div>
      </div>
    ` : ''}
    ${togglesHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.togglesTitle || '🎛️ Opciones del Streamer'}</h3>
        <div class="howto-outcomes">${togglesHtml}</div>
      </div>
    ` : ''}
    ${virusStagesHtml ? `
      <div class="howto-block">
        <h3 class="howto-subtitle">${data.virusStagesTitle || '🧬 Etapas del virus'}</h3>
        <div class="howto-virus-timeline">${virusStagesHtml}</div>
      </div>
    ` : ''}
    ${imagesHtml ? `<div class="howto-gallery">${imagesHtml}</div>` : ''}
    <div class="howto-block">
      <h3 class="howto-subtitle">⌨️ Comandos</h3>
      <div class="howto-cmd-grid">${commandsHtml}</div>
    </div>
    ${sectionsHtml ? `<div class="howto-sections">${sectionsHtml}</div>` : ''}
    ${highlightHtml}
  `;
}

// Cablea los botones "❓ Cómo Jugar" de cada tarjeta del menú y el botón de
// volver de la propia pantalla. Se llama una sola vez, al cargar el módulo
// (ver el import en eventListeners.js), igual que el resto de listeners de
// navegación entre pantallas.
export function initHowToPlayScreen() {
  document.querySelectorAll('.howto-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const mode = btn.dataset.mode;
      renderHowTo(mode);
      showScreen('howto-screen');
    };
  });
  const backBtn = $('howto-back-btn');
  if (backBtn) backBtn.onclick = () => showScreen('menu-screen');
}
