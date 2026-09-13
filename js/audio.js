/* =========================================================
   AUDIO
   Efectos de sonido cortos, sintetizados en el momento con la Web Audio
   API (osciladores), para no depender de ningún archivo de audio externo.
   ========================================================= */
/* =========================================================
   VOLUMEN GLOBAL (música / efectos)
   -----------------------------------------------------------
   Dos multiplicadores (0..1) que se aplican, respectivamente, a todos los
   efectos de sonido sintetizados (beep/noiseBurst) y a la música de fondo
   en bucle. Se persisten en localStorage para recordarlos entre sesiones.
   ========================================================= */
const MUSIC_VOLUME_STORAGE_KEY = 'pokekukoro_music_volume';
const SFX_VOLUME_STORAGE_KEY = 'pokekukoro_sfx_volume';
// Volumen por defecto (antes de que el usuario toque los sliders de
// Ajustes, o si localStorage no está disponible/vacío): la música arranca
// más baja que los efectos, para que no tape los pitidos y avisos propios
// del juego (cuenta atrás, aciertos/fallos...).
const DEFAULT_MUSIC_VOLUME_SCALE = 0.2;
const DEFAULT_SFX_VOLUME_SCALE = 0.7;

let musicVolumeScale = DEFAULT_MUSIC_VOLUME_SCALE;
let sfxVolumeScale = DEFAULT_SFX_VOLUME_SCALE;

function clamp01(n, fallback) {
  if (typeof n !== 'number' || Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

// Lee las preferencias de volumen guardadas (si existen) y las aplica.
// Se debe llamar una vez al arrancar la app, antes de sincronizar la UI.
export function loadVolumePrefs() {
  try {
    const m = localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
    const s = localStorage.getItem(SFX_VOLUME_STORAGE_KEY);
    musicVolumeScale = m !== null ? clamp01(parseFloat(m), DEFAULT_MUSIC_VOLUME_SCALE) : DEFAULT_MUSIC_VOLUME_SCALE;
    sfxVolumeScale = s !== null ? clamp01(parseFloat(s), DEFAULT_SFX_VOLUME_SCALE) : DEFAULT_SFX_VOLUME_SCALE;
  } catch (e) {
    // localStorage puede no estar disponible
    musicVolumeScale = DEFAULT_MUSIC_VOLUME_SCALE;
    sfxVolumeScale = DEFAULT_SFX_VOLUME_SCALE;
  }
  return { musicVolumeScale, sfxVolumeScale };
}

export function getMusicVolume() { return musicVolumeScale; }
export function getSfxVolume() { return sfxVolumeScale; }

export function setMusicVolume(v) {
  musicVolumeScale = clamp01(v, DEFAULT_MUSIC_VOLUME_SCALE);
  try { localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(musicVolumeScale)); } catch (e) { /* ignore */ }
  // Si hay música sonando ahora mismo, se ajusta al momento.
  if (currentMusicAudio) currentMusicAudio.volume = MODE_MUSIC_VOLUME * musicVolumeScale;
}

export function setSfxVolume(v) {
  sfxVolumeScale = clamp01(v, DEFAULT_SFX_VOLUME_SCALE);
  try { localStorage.setItem(SFX_VOLUME_STORAGE_KEY, String(sfxVolumeScale)); } catch (e) { /* ignore */ }
}

// Pitido corto para previsualizar el volumen de efectos al mover el slider.
export function playSfxPreview() {
  beep({ freq: 660, duration: 0.08, volume: 0.22, type: 'triangle' });
}

// Click del Streamer al elegir un modo de juego en el menú principal
// (ver .mode-card en eventListeners.js): un pequeño "tap" de dos notas
// ascendentes, discreto para no chocar con la música del menú.
export function playModeSelectClick() {
  beep({ freq: 520, duration: 0.05, volume: 0.16, type: 'triangle' });
  beep({ freq: 780, duration: 0.07, volume: 0.18, type: 'triangle', delay: 0.045 });
}

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  // Los navegadores suspenden el AudioContext hasta que hay una interacción
  // del usuario; como esta app siempre se usa tras pulsar botones (conectar,
  // lanzar un modo...), en la práctica ya hay gesto de sobra, pero por si
  // acaso se intenta reanudar cada vez que se pide sonido.
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Pitido corto y agudo tipo "beep" de cuenta atrás. `urgent` lo hace más
// agudo e insistente, pensado para el último segundo.
function beep({ freq = 880, duration = 0.12, volume = 0.18, type = 'square', delay = 0, freqEnd = null } = {}) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const vol = volume * sfxVolumeScale;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
  return osc;
}

// Reproduce una secuencia de notas encadenadas en el tiempo, útil para
// pequeños "jingles" (acordes ascendentes/descendentes de pocas notas).
function playSequence(notes) {
  let t = 0;
  notes.forEach(n => {
    beep({ ...n, delay: (n.delay ?? 0) + t });
    t += n.gap ?? 0;
  });
}

// Buffer de ruido blanco reutilizable (se genera una sola vez) para
// construir sonidos de impacto/explosión sin depender de ficheros externos.
let noiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate * 1; // 1s de ruido, se recorta con la duración deseada
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

// Ráfaga de ruido filtrado (paso bajo), para golpes secos, "whoosh" y la
// parte "sucia" de una explosión.
function noiseBurst({ duration = 0.3, volume = 0.3, filterFreq = 800, filterType = 'lowpass', delay = 0 } = {}) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const vol = volume * sfxVolumeScale;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, t0);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

// Aviso de "queda poco tiempo": un pitido de cuenta atrás que se usa una vez
// por segundo mientras quedan pocos segundos de ronda. `secondsLeft` ajusta
// el tono (más agudo y con doble pitido cuanto más cerca de 0) para que la
// tensión suba a medida que se acaba el tiempo.
export function playCountdownBeep(secondsLeft) {
  if (secondsLeft <= 1) {
    // Último segundo: doble pitido, más agudo y urgente.
    beep({ freq: 1046, duration: 0.11, volume: 0.22 });
    setTimeout(() => beep({ freq: 1318, duration: 0.14, volume: 0.24 }), 130);
  } else {
    // Resto de la cuenta atrás (5..2): un único pitido de aviso.
    beep({ freq: 784, duration: 0.1, volume: 0.16 });
  }
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE VOLTORB EXPLOSIVO
   ========================================================= */

// Un viewer se apunta al lobby: "pop" corto y agudo.
export function playVeJoin() {
  beep({ freq: 660, duration: 0.07, volume: 0.14, type: 'triangle' });
  beep({ freq: 990, duration: 0.06, volume: 0.12, type: 'triangle', delay: 0.05 });
}

// Empieza la partida: pequeña fanfarria ascendente de 3 notas.
export function playVeMatchStart() {
  playSequence([
    { freq: 523, duration: 0.12, volume: 0.18, type: 'square', gap: 0.1 },
    { freq: 659, duration: 0.12, volume: 0.18, type: 'square', gap: 0.1 },
    { freq: 784, duration: 0.22, volume: 0.2, type: 'square' },
  ]);
}

// Aparece el cartel de una nueva categoría: campanilla de dos notas.
export function playVeCategory() {
  playSequence([
    { freq: 880, duration: 0.14, volume: 0.16, type: 'sine', gap: 0.09 },
    { freq: 1174, duration: 0.22, volume: 0.16, type: 'sine' },
  ]);
}

// Le toca el turno a alguien (el Voltorb se mueve hasta esa persona):
// un "tic" suave y breve, discreto para no cansar al sonar cada turno.
export function playVeTurn() {
  beep({ freq: 520, duration: 0.05, volume: 0.08, type: 'triangle' });
}

// Respuesta correcta: arpegio ascendente alegre.
export function playVeCorrect() {
  playSequence([
    { freq: 587, duration: 0.09, volume: 0.17, type: 'square', gap: 0.07 },
    { freq: 740, duration: 0.09, volume: 0.17, type: 'square', gap: 0.07 },
    { freq: 988, duration: 0.16, volume: 0.19, type: 'square' },
  ]);
}

// Respuesta incorrecta: zumbido descendente corto tipo "error".
export function playVeWrong() {
  beep({ freq: 300, duration: 0.16, volume: 0.16, type: 'sawtooth', freqEnd: 150 });
}

// Se agota el tiempo del turno: doble aviso de alarma, distinto del fallo
// normal para que se note que fue por tiempo y no por respuesta errónea.
export function playVeTimeout() {
  beep({ freq: 440, duration: 0.1, volume: 0.16, type: 'square' });
  beep({ freq: 349, duration: 0.16, volume: 0.16, type: 'square', delay: 0.13 });
}

// El Voltorb de alguien se hincha antes de explotar: sirena ascendente que
// dura aproximadamente lo mismo que la animación de hinchado (VE_GROW_MS).
export function playVeGrow(durationMs = 1500) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const dur = durationMs / 1000;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, t0);
  osc.frequency.exponentialRampToValueAtTime(520, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.14, t0 + dur * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.22, t0 + dur);
  // Un ligero tremolo (LFO sobre el volumen) para que suene a "pulso" de
  // tensión creciente en vez de un tono liso.
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.setValueAtTime(4, t0);
  lfo.frequency.linearRampToValueAtTime(11, t0 + dur);
  lfoGain.gain.setValueAtTime(0.06, t0);
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

// ¡Explosión! Combina un golpe grave (sub-bass) con una ráfaga de ruido
// filtrado, para dar sensación de estallido sin usar ficheros de audio.
export function playVeExplosion() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(30, t0 + 0.45);
    gain.gain.setValueAtTime(0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.55);
  }
  noiseBurst({ duration: 0.45, volume: 0.28, filterFreq: 1800, filterType: 'lowpass' });
  noiseBurst({ duration: 0.12, volume: 0.18, filterFreq: 3200, filterType: 'highpass', delay: 0.01 });
}

// Se completa una categoría entre todos: jingle de éxito de 4 notas.
export function playVeRoundComplete() {
  playSequence([
    { freq: 659, duration: 0.1, volume: 0.16, type: 'triangle', gap: 0.08 },
    { freq: 784, duration: 0.1, volume: 0.16, type: 'triangle', gap: 0.08 },
    { freq: 988, duration: 0.1, volume: 0.16, type: 'triangle', gap: 0.08 },
    { freq: 1318, duration: 0.24, volume: 0.19, type: 'triangle' },
  ]);
}

// Fin de la partida con ganador: fanfarria final, más larga y vistosa.
export function playVeVictory() {
  playSequence([
    { freq: 523, duration: 0.13, volume: 0.19, type: 'square', gap: 0.11 },
    { freq: 659, duration: 0.13, volume: 0.19, type: 'square', gap: 0.11 },
    { freq: 784, duration: 0.13, volume: 0.19, type: 'square', gap: 0.11 },
    { freq: 1047, duration: 0.32, volume: 0.22, type: 'square' },
  ]);
}

// Fin de la partida sin supervivientes: tono neutro/apagado.
export function playVeDraw() {
  beep({ freq: 392, duration: 0.22, volume: 0.14, type: 'triangle' });
  beep({ freq: 330, duration: 0.3, volume: 0.14, type: 'triangle', delay: 0.2 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE POKERUS
   ========================================================= */

// Se cierra el lobby y empieza la partida: fanfarria "médica" de alarma
// sanitaria, con timbre square, pensada como aviso de que el brote acaba
// de empezar.
export function playPokerusMatchStart() {
  playSequence([
    { freq: 392, duration: 0.13, volume: 0.18, type: 'square', gap: 0.1 },
    { freq: 494, duration: 0.13, volume: 0.18, type: 'square', gap: 0.1 },
    { freq: 587, duration: 0.24, volume: 0.2, type: 'square' },
  ]);
}

// Empieza el fundido a negro de "cae la noche": tono grave y descendente,
// tenue y siniestro, para acompañar la tensión del momento sin resultar
// alarmante todavía (la resolución de contagios/muertes llega después,
// ya con la pantalla en negro).
export function playPokerusNightFall() {
  beep({ freq: 330, duration: 0.5, volume: 0.13, type: 'sine', freqEnd: 140 });
}

// Se muestra el nuevo "Día N" tras la resolución nocturna: campanilla de
// dos notas ascendentes, como un pequeño amanecer sonoro tras la tensión
// de la noche.
export function playPokerusDayStart() {
  beep({ freq: 587, duration: 0.11, volume: 0.15, type: 'sine' });
  beep({ freq: 880, duration: 0.18, volume: 0.17, type: 'sine', delay: 0.09 });
}

// El brote se erradica y quedan supervivientes sanos: fanfarria de
// victoria "médica", ascendente y limpia (square, como una campana de
// alarma que por fin se apaga con buenas noticias).
export function playPokerusVictory() {
  playSequence([
    { freq: 523, duration: 0.11, volume: 0.18, type: 'square', gap: 0.08 },
    { freq: 659, duration: 0.11, volume: 0.18, type: 'square', gap: 0.08 },
    { freq: 784, duration: 0.11, volume: 0.19, type: 'square', gap: 0.08 },
    { freq: 1047, duration: 0.3, volume: 0.22, type: 'square' },
  ]);
}

// El virus acaba con todos los jugadores: acorde grave y descendente,
// siniestro y apagado, sin resolución alguna (derrota total del brote).
export function playPokerusDefeat() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(196, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.9);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.15);
  }
  beep({ freq: 130, duration: 0.7, volume: 0.16, type: 'triangle', freqEnd: 60, delay: 0.15 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE GLACIAR DE AVALUGG
   ========================================================= */

// Alguien llega al trofeo y gana la partida: fanfarria de victoria con un
// timbre cristalino/helado (triangle + un brillo agudo final tipo
// "carámbano"), a tono con el ambiente de hielo del modo.
export function playAvaluggVictory() {
  playSequence([
    { freq: 587, duration: 0.12, volume: 0.18, type: 'triangle', gap: 0.09 },
    { freq: 784, duration: 0.12, volume: 0.18, type: 'triangle', gap: 0.09 },
    { freq: 988, duration: 0.12, volume: 0.19, type: 'triangle', gap: 0.09 },
    { freq: 1568, duration: 0.35, volume: 0.22, type: 'triangle' },
  ]);
  // Brillo agudo superpuesto sobre la última nota, para dar sensación de
  // "destello helado" al llegar al trofeo.
  beep({ freq: 2093, duration: 0.3, volume: 0.12, type: 'sine', delay: 0.27 });
}

// Se cierra el lobby y todos entran caminando al glaciar: un crujido breve
// de nieve/hielo seguido de una pequeña fanfarria "triangle", con el mismo
// timbre helado que playAvaluggVictory pero más corta y sin el brillo
// final (ese se reserva para la victoria).
export function playAvaluggMatchStart() {
  noiseBurst({ duration: 0.16, volume: 0.14, filterFreq: 2000, filterType: 'lowpass' });
  playSequence([
    { freq: 494, duration: 0.12, volume: 0.16, type: 'triangle', gap: 0.09 },
    { freq: 659, duration: 0.12, volume: 0.17, type: 'triangle', gap: 0.09 },
    { freq: 880, duration: 0.22, volume: 0.19, type: 'triangle' },
  ]);
}

// Un jugador pisa hielo quebradizo y cae al agua helada: crack seco y
// agudo del hielo rompiéndose, un breve tono descendente que acompaña la
// caída, y un splash grave y más largo al tocar el agua. Es el único
// "fallo" posible del modo, así que se cuida que sea distintivo y no se
// confunda con la victoria.
export function playAvaluggFall() {
  noiseBurst({ duration: 0.06, volume: 0.22, filterFreq: 3200, filterType: 'highpass' });
  beep({ freq: 500, duration: 0.14, volume: 0.14, type: 'sine', freqEnd: 180, delay: 0.03 });
  noiseBurst({ duration: 0.18, volume: 0.16, filterFreq: 900, filterType: 'lowpass', delay: 0.09 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE ZONA SAFARI
   ========================================================= */

// El streamer suelta el gatillo (acierte o falle): "pum" seco y corto,
// combinando un golpe grave breve con una ráfaga de ruido filtrado, para
// simular un disparo sin depender de ningún archivo de audio.
export function playSafariShot() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.09);
    gain.gain.setValueAtTime(0.26, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.12);
  }
  noiseBurst({ duration: 0.09, volume: 0.24, filterFreq: 2500, filterType: 'highpass' });
}

// Un Pokémon toca la línea de meta y ya ha ganado: jingle de campanilla
// ascendente corto, alegre pero breve para no tapar el resto de la acción
// (puede sonar varias veces seguidas si llegan varios Pokémon).
export function playSafariGoal() {
  playSequence([
    { freq: 784, duration: 0.1, volume: 0.18, type: 'triangle', gap: 0.07 },
    { freq: 988, duration: 0.1, volume: 0.18, type: 'triangle', gap: 0.07 },
    { freq: 1318, duration: 0.2, volume: 0.2, type: 'triangle' },
  ]);
}

// Se cierra el lobby y empieza la partida: pequeña fanfarria ascendente,
// con un timbre "triangle" natural/vegetal a tono con el ambiente del
// modo.
export function playSafariMatchStart() {
  playSequence([
    { freq: 494, duration: 0.12, volume: 0.18, type: 'triangle', gap: 0.1 },
    { freq: 587, duration: 0.12, volume: 0.18, type: 'triangle', gap: 0.1 },
    { freq: 740, duration: 0.22, volume: 0.2, type: 'triangle' },
  ]);
}

// El cazador cierra los ojos: sonido suave y descendente, casi un
// "arrullo", que marca el inicio del tramo en el que los Pokémon pueden
// moverse con tranquilidad.
export function playSafariEyesClose() {
  beep({ freq: 440, duration: 0.35, volume: 0.12, type: 'sine', freqEnd: 220 });
}

// Ya se puede abrir los ojos (fin del temporizador a ciegas): aviso corto
// de dos notas ascendentes, para que el streamer note el cambio de fase
// sin tener que estar pendiente de la pantalla.
export function playSafariEyesReady() {
  beep({ freq: 660, duration: 0.09, volume: 0.16, type: 'sine' });
  beep({ freq: 880, duration: 0.12, volume: 0.17, type: 'sine', delay: 0.1 });
}

// El disparo SÍ alcanza a un Pokémon (a diferencia de un fallo): golpe
// seco superpuesto al propio sonido del disparo (playSafariShot), para
// que un acierto se distinga de un fallo a oído sin depender del chat.
export function playSafariHit() {
  beep({ freq: 200, duration: 0.16, volume: 0.2, type: 'sawtooth', freqEnd: 70 });
}

// Se acaba el tiempo de la partida: aviso de alarma antes de que caigan
// de golpe los Pokémon que no llegaron a la meta.
export function playSafariTimeUp() {
  beep({ freq: 440, duration: 0.1, volume: 0.16, type: 'square' });
  beep({ freq: 349, duration: 0.16, volume: 0.16, type: 'square', delay: 0.13 });
}

// Al menos un Pokémon sobrevive y llega a la meta: fanfarria de victoria.
export function playSafariVictory() {
  playSequence([
    { freq: 523, duration: 0.13, volume: 0.19, type: 'triangle', gap: 0.11 },
    { freq: 659, duration: 0.13, volume: 0.19, type: 'triangle', gap: 0.11 },
    { freq: 784, duration: 0.13, volume: 0.19, type: 'triangle', gap: 0.11 },
    { freq: 1047, duration: 0.32, volume: 0.22, type: 'triangle' },
  ]);
}

// Nadie sobrevive a la cacería (Zona Safari despejada): tono apagado y
// sin resolución.
export function playSafariWipeout() {
  beep({ freq: 392, duration: 0.22, volume: 0.14, type: 'triangle' });
  beep({ freq: 330, duration: 0.3, volume: 0.14, type: 'triangle', delay: 0.2 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE ZOROARKS
   -----------------------------------------------------------
   Todos con un timbre más grave, rústico y "de aldea de noche" que los
   de Voltorb Explosivo (más triangle/sawtooth que square, barridos de
   frecuencia largos), a tono con el ambiente de pueblo y misterio del
   modo, reservados para los hitos más importantes de la partida
   (inscripción, inicio, y el desenlace de cada jugador que sube al
   escenario): un "rugido" sintetizado para la revelación del lobo.
   ========================================================= */

// Un viewer se apunta a la partida en el lobby (!participo): "pop" corto
// de dos notas, con un timbre más grave y de madera que el de Voltorb
// Explosivo.
export function playZorJoin() {
  beep({ freq: 493, duration: 0.07, volume: 0.14, type: 'triangle' });
  beep({ freq: 740, duration: 0.07, volume: 0.12, type: 'triangle', delay: 0.05 });
}

// Empieza la partida: un golpe grave y sordo (como una puerta de madera
// cerrándose) seguido de un breve acorde ascendente, como llamada a
// reunirse en la plaza.
export function playZorMatchStart() {
  noiseBurst({ duration: 0.3, volume: 0.14, filterFreq: 450, filterType: 'lowpass' });
  playSequence([
    { freq: 220, duration: 0.18, volume: 0.16, type: 'triangle', gap: 0.14, delay: 0.12 },
    { freq: 294, duration: 0.18, volume: 0.16, type: 'triangle', gap: 0.14 },
    { freq: 370, duration: 0.28, volume: 0.18, type: 'triangle' },
  ]);
}

// El jugador del escenario se salva (gana el "!no", o hay empate): acorde
// mayor, cálido, de alivio.
export function playZorSaved() {
  playSequence([
    { freq: 523, duration: 0.12, volume: 0.16, type: 'sine', gap: 0.09 },
    { freq: 659, duration: 0.12, volume: 0.16, type: 'sine', gap: 0.09 },
    { freq: 784, duration: 0.24, volume: 0.18, type: 'sine' },
  ]);
}

// El jugador del escenario queda eliminado y resulta ser un aldeano
// normal (no un lobo): golpe seco y grave, sin la fanfarria de la
// revelación del lobo.
export function playZorEliminated() {
  beep({ freq: 200, duration: 0.22, volume: 0.16, type: 'sawtooth', freqEnd: 60 });
  noiseBurst({ duration: 0.15, volume: 0.1, filterFreq: 600, filterType: 'lowpass', delay: 0.02 });
}

// ¡Era un lobo! Se revela el Zoroark (ver zorRevealWolfAndDie): impacto
// de ruido filtrado más un "rugido" grave sintetizado (barrido descendente
// ancho, con un segundo armónico más agudo encima), coincidiendo con el
// zoom de cámara sobre su posición.
export function playZorWolfReveal() {
  noiseBurst({ duration: 0.25, volume: 0.22, filterFreq: 2200, filterType: 'lowpass' });
  beep({ freq: 90, duration: 0.9, volume: 0.22, type: 'sawtooth', freqEnd: 45, delay: 0.05 });
  beep({ freq: 180, duration: 0.5, volume: 0.14, type: 'square', freqEnd: 90, delay: 0.1 });
}

// Empieza el fundido a negro de la noche (ver zorShowNightTransition):
// tono grave y descendente, tenue y de madera (más "rústico" que el de
// Pokerus, a tono con el ambiente de aldea de noche del modo).
export function playZorNightFall() {
  beep({ freq: 293, duration: 0.5, volume: 0.13, type: 'triangle', freqEnd: 130 });
}

// Se revela el número de aldeanos muertos esta noche (solo si ha habido
// alguno; si la noche pasa en calma no se llama a esta función): golpe
// seco y grave, sin resolución, como una campanada de duelo.
export function playZorNightDeaths() {
  beep({ freq: 165, duration: 0.35, volume: 0.18, type: 'sawtooth', freqEnd: 80 });
  noiseBurst({ duration: 0.2, volume: 0.12, filterFreq: 700, filterType: 'lowpass', delay: 0.02 });
}

// Todos los lobos han caído: gana el pueblo. Fanfarria de victoria.
export function playZorVillageWins() {
  playSequence([
    { freq: 523, duration: 0.13, volume: 0.19, type: 'sine', gap: 0.11 },
    { freq: 659, duration: 0.13, volume: 0.19, type: 'sine', gap: 0.11 },
    { freq: 784, duration: 0.13, volume: 0.19, type: 'sine', gap: 0.11 },
    { freq: 1047, duration: 0.32, volume: 0.22, type: 'sine' },
  ]);
}

// Todos los aldeanos han muerto: el pueblo es arrasado y ganan los lobos.
// Acorde grave y descendente, siniestro y sin resolución, distinto de la
// fanfarria de victoria del pueblo.
export function playZorWolvesWin() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(174, t0);
    osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.9);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.15);
  }
  beep({ freq: 90, duration: 0.9, volume: 0.2, type: 'sawtooth', freqEnd: 40, delay: 0.15 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE PASAPALABRA
   -----------------------------------------------------------
   No se incluye ningún beep de cuenta atrás (el modo ya usa su propia
   barra de tiempo visual); estos efectos cubren el resto de hitos de la
   partida: acierto/fallo de cada letra, cambio de letra en el rosco,
   rosco completado y desenlace final (Streamer/Chat/empate).
   ========================================================= */

// Se pasa a la siguiente letra del rosco (por acierto, fallo o tiempo
// agotado): "tic" suave y breve, igual de discreto que playVeTurn para no
// cansar al sonar en cada letra.
export function playPpNewLetter() {
  beep({ freq: 520, duration: 0.05, volume: 0.08, type: 'triangle' });
}

// El Streamer acierta una letra: arpegio ascendente con timbre "square",
// para diferenciarlo del acierto del chat.
export function playPpCorrectStreamer() {
  playSequence([
    { freq: 587, duration: 0.09, volume: 0.17, type: 'square', gap: 0.07 },
    { freq: 740, duration: 0.09, volume: 0.17, type: 'square', gap: 0.07 },
    { freq: 988, duration: 0.16, volume: 0.19, type: 'square' },
  ]);
}

// El chat acierta una letra: mismo arpegio ascendente pero con timbre
// "triangle", más suave, para distinguirlo a oído del acierto del
// Streamer.
export function playPpCorrectChat() {
  playSequence([
    { freq: 587, duration: 0.09, volume: 0.17, type: 'triangle', gap: 0.07 },
    { freq: 740, duration: 0.09, volume: 0.17, type: 'triangle', gap: 0.07 },
    { freq: 988, duration: 0.16, volume: 0.19, type: 'triangle' },
  ]);
}

// Alguien del chat falla una respuesta: zumbido descendente corto tipo
// "error" (igual que playVeWrong).
export function playPpWrong() {
  beep({ freq: 300, duration: 0.16, volume: 0.16, type: 'sawtooth', freqEnd: 150 });
}

// Se agota el tiempo de la letra sin que nadie acierte: doble aviso de
// alarma, distinto del fallo normal para que se note que fue por tiempo.
export function playPpTimeout() {
  beep({ freq: 440, duration: 0.1, volume: 0.16, type: 'square' });
  beep({ freq: 349, duration: 0.16, volume: 0.16, type: 'square', delay: 0.13 });
}

// Se completan las 27 letras del rosco (fin de partida por rosco
// agotado, justo antes del resultado final): jingle de éxito de 4 notas.
export function playPpRoscoComplete() {
  playSequence([
    { freq: 659, duration: 0.1, volume: 0.16, type: 'triangle', gap: 0.08 },
    { freq: 784, duration: 0.1, volume: 0.16, type: 'triangle', gap: 0.08 },
    { freq: 988, duration: 0.1, volume: 0.16, type: 'triangle', gap: 0.08 },
    { freq: 1318, duration: 0.24, volume: 0.19, type: 'triangle' },
  ]);
}

// Fin de la partida con ganador (Streamer o Chat): fanfarria final.
export function playPpVictory() {
  playSequence([
    { freq: 523, duration: 0.13, volume: 0.19, type: 'square', gap: 0.11 },
    { freq: 659, duration: 0.13, volume: 0.19, type: 'square', gap: 0.11 },
    { freq: 784, duration: 0.13, volume: 0.19, type: 'square', gap: 0.11 },
    { freq: 1047, duration: 0.32, volume: 0.22, type: 'square' },
  ]);
}

// Fin de la partida en empate: tono neutro/apagado.
export function playPpDraw() {
  beep({ freq: 392, duration: 0.22, volume: 0.14, type: 'triangle' });
  beep({ freq: 330, duration: 0.3, volume: 0.14, type: 'triangle', delay: 0.2 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE RAYO SOLAR
   -----------------------------------------------------------
   `playRayoSolarBeam` (el disparo en sí) está definido más abajo, junto
   al resto de efectos en archivo .mp3 reales, ya que es una pista de
   audio y no un sonido sintetizado como los de aquí.
   ========================================================= */

// Un viewer se apunta al lobby (!participo): pop propio de dos notas, con
// un timbre "sine" más suave y luminoso (a tono con el ambiente
// vegetal/solar del modo) que el pop de Voltorb Explosivo, que este modo
// reutilizaba hasta ahora.
export function playRsJoin() {
  beep({ freq: 587, duration: 0.07, volume: 0.14, type: 'sine' });
  beep({ freq: 880, duration: 0.08, volume: 0.13, type: 'sine', delay: 0.05 });
}

// Se cierra el lobby y empieza la partida: pequeña fanfarria ascendente
// de 3 notas, con un timbre "sine" cálido/solar.
export function playRsMatchStart() {
  playSequence([
    { freq: 494, duration: 0.12, volume: 0.18, type: 'sine', gap: 0.1 },
    { freq: 622, duration: 0.12, volume: 0.18, type: 'sine', gap: 0.1 },
    { freq: 784, duration: 0.22, volume: 0.2, type: 'sine' },
  ]);
}

// El Rayo Solar alcanza a un jugador: golpe doloroso corto (impacto grave
// + ráfaga de ruido filtrado), para reforzar la animación "Hurt" en el
// instante del impacto.
export function playRsHit() {
  beep({ freq: 260, duration: 0.18, volume: 0.22, type: 'sawtooth', freqEnd: 90 });
  noiseBurst({ duration: 0.14, volume: 0.18, filterFreq: 1400, filterType: 'lowpass', delay: 0.01 });
}

// Queda un único superviviente: fanfarria de victoria.
export function playRsVictory() {
  playSequence([
    { freq: 523, duration: 0.13, volume: 0.19, type: 'sine', gap: 0.11 },
    { freq: 659, duration: 0.13, volume: 0.19, type: 'sine', gap: 0.11 },
    { freq: 784, duration: 0.13, volume: 0.19, type: 'sine', gap: 0.11 },
    { freq: 1047, duration: 0.32, volume: 0.22, type: 'sine' },
  ]);
}

// Nadie sobrevive al Rayo Solar: acorde grave y descendente, apagado y
// sin resolución, igual de siniestro que playPokerusDefeat pero con
// timbre propio.
export function playRsWipeout() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.9);
    gain.gain.setValueAtTime(0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.15);
  }
  beep({ freq: 120, duration: 0.7, volume: 0.15, type: 'triangle', freqEnd: 55, delay: 0.15 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE ARENA POKÉMON
   -----------------------------------------------------------
   Golpe/crítico/esquiva (mismo diseño de sonido que sus equivalentes de
   Boss Cooperativo, ver playBossHit/playBossCrit/playBossDodge más abajo:
   es el mismo tipo de combate 1vs1 por turnos) más los hitos de más peso
   del modo (desmayo, victoria de combate, victoria de combate de torneo,
   cambio de ronda y campeón final).
   ========================================================= */

// Golpe normal que sí hace daño: impacto corto y seco, ruido en paso bajo
// + un chasquido grave. Es el sonido que más se repite de todo el modo,
// así que se mantiene deliberadamente discreto para no cansar en combates
// largos.
export function playArenaHit() {
  noiseBurst({ duration: 0.08, volume: 0.18, filterFreq: 1400, filterType: 'lowpass' });
  beep({ freq: 220, duration: 0.09, volume: 0.14, type: 'square', freqEnd: 120 });
}

// Golpe crítico: variante más contundente del golpe normal (ruido más
// largo y con más volumen, un golpe grave adicional en sawtooth y un
// chasquido agudo superpuesto), para que se note a oído sin mirar el
// "¡GOLPE CRÍTICO!" del registro de combate.
export function playArenaCrit() {
  noiseBurst({ duration: 0.12, volume: 0.26, filterFreq: 2000, filterType: 'lowpass' });
  beep({ freq: 160, duration: 0.16, volume: 0.2, type: 'sawtooth', freqEnd: 70 });
  beep({ freq: 1200, duration: 0.08, volume: 0.12, type: 'square', delay: 0.02 });
}

// Esquiva: el golpe falla del todo. Un "whoosh" corto (ruido en paso
// alto, sin componente grave), bien distinto de un golpe para que se
// reconozca al instante que no ha habido daño.
export function playArenaDodge() {
  noiseBurst({ duration: 0.1, volume: 0.14, filterFreq: 3000, filterType: 'highpass' });
}

// Un Pokémon se desmaya tras el golpe que decide un combate (justo antes
// de resolver victoria/torneo): golpe grave y sordo, sin ruido de
// impacto añadido (el del propio golpe ya sonó antes), como cierre seco
// del combate.
export function playArenaFaint() {
  beep({ freq: 220, duration: 0.24, volume: 0.18, type: 'sawtooth', freqEnd: 70 });
}

// Se gana un combate 1vs1 normal del Coliseo (nuevo campeón): fanfarria
// corta y contundente, con timbre "square" como el resto de victorias de
// combate del juego.
export function playArenaBattleWin() {
  playSequence([
    { freq: 587, duration: 0.1, volume: 0.18, type: 'square', gap: 0.08 },
    { freq: 740, duration: 0.1, volume: 0.18, type: 'square', gap: 0.08 },
    { freq: 988, duration: 0.22, volume: 0.21, type: 'square' },
  ]);
}

// Se gana un combate de Torneo (avanza de ronda): variante de la
// fanfarria anterior con timbre "triangle", para que se distinga a oído
// de una victoria normal del Coliseo.
export function playArenaTournamentMatchWin() {
  playSequence([
    { freq: 587, duration: 0.1, volume: 0.18, type: 'triangle', gap: 0.08 },
    { freq: 740, duration: 0.1, volume: 0.18, type: 'triangle', gap: 0.08 },
    { freq: 988, duration: 0.22, volume: 0.21, type: 'triangle' },
  ]);
}

// Empieza una nueva ronda del Torneo (Cuartos, Semifinal, Final...):
// campanilla de aviso de dos notas, como una llamada de atención antes
// del anuncio en pantalla.
export function playArenaRoundStart() {
  playSequence([
    { freq: 880, duration: 0.13, volume: 0.17, type: 'sine', gap: 0.09 },
    { freq: 1174, duration: 0.22, volume: 0.18, type: 'sine' },
  ]);
}

// Se corona el Campeón del Torneo: la fanfarria más larga y vistosa del
// modo, a la altura del confeti y la pantalla final.
export function playArenaTournamentChampion() {
  playSequence([
    { freq: 523, duration: 0.14, volume: 0.2, type: 'square', gap: 0.11 },
    { freq: 659, duration: 0.14, volume: 0.2, type: 'square', gap: 0.11 },
    { freq: 784, duration: 0.14, volume: 0.2, type: 'square', gap: 0.11 },
    { freq: 988, duration: 0.14, volume: 0.21, type: 'square', gap: 0.11 },
    { freq: 1319, duration: 0.4, volume: 0.24, type: 'square' },
  ]);
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE EL VOLCÁN
   -----------------------------------------------------------
   `playVolcanEruption` y `playVolcanFiveSecWarning` están definidos más
   abajo, junto al resto de efectos ya existentes de este modo (el primero
   es una pista .mp3 real, ver la sección de archivo). Aquí solo los
   nuevos: inicio de partida, aterrizaje de Heatran, victoria y derrota
   total.
   ========================================================= */

// Se cierra el lobby y empieza la partida: fanfarria ascendente con un
// timbre grave/rocoso ("sawtooth" en vez de square/triangle), a tono con
// el ambiente de lava y roca del modo.
export function playVolcanMatchStart() {
  playSequence([
    { freq: 220, duration: 0.14, volume: 0.18, type: 'sawtooth', gap: 0.11 },
    { freq: 294, duration: 0.14, volume: 0.18, type: 'sawtooth', gap: 0.11 },
    { freq: 370, duration: 0.26, volume: 0.2, type: 'sawtooth' },
  ]);
}

// Heatran aterriza tras su caída, justo antes de empezar a disparar:
// golpe/temblor grave y corto (impacto de sub-bass + ruido filtrado),
// para reforzar la sensación de peso e impacto de su llegada.
export function playVolcanHeatranLand() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(35, t0 + 0.35);
    gain.gain.setValueAtTime(0.26, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.45);
  }
  noiseBurst({ duration: 0.22, volume: 0.16, filterFreq: 900, filterType: 'lowpass' });
}

// Queda un único superviviente: fanfarria de victoria.
export function playVolcanVictory() {
  playSequence([
    { freq: 523, duration: 0.13, volume: 0.19, type: 'sawtooth', gap: 0.11 },
    { freq: 659, duration: 0.13, volume: 0.19, type: 'sawtooth', gap: 0.11 },
    { freq: 784, duration: 0.13, volume: 0.19, type: 'sawtooth', gap: 0.11 },
    { freq: 1047, duration: 0.32, volume: 0.22, type: 'sawtooth' },
  ]);
}

// El Volcán se traga a todos los Pokémon: acorde grave y descendente,
// siniestro y apagado, sin resolución alguna.
export function playVolcanWipeout() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(196, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.9);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.15);
  }
  beep({ freq: 130, duration: 0.7, volume: 0.16, type: 'triangle', freqEnd: 60, delay: 0.15 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE VISTA LINCE
   -----------------------------------------------------------
   playVeJoin (lobby) y playCountdownBeep (cuenta atrás genérica) ya se
   reutilizan tal cual en este modo; aquí solo van los momentos propios de
   su estructura de ronda (cartel de "RONDA N", inicio del cruce, cartel de
   respuesta y desenlace final).
   ========================================================= */

// Se muestra el cartel animado de "RONDA N": campanilla breve de dos notas
// ascendentes, como aviso de "atentos, empieza algo nuevo".
export function playVLinceRoundStart() {
  beep({ freq: 880, duration: 0.11, volume: 0.16, type: 'sine' });
  beep({ freq: 1318, duration: 0.18, volume: 0.18, type: 'sine', delay: 0.1 });
}

// Empiezan a cruzar los Pokémon por el recinto: un "chss" corto y seco
// (ruido filtrado en paso alto, sin componente grave) que marca el
// instante exacto en el que hay que empezar a contar.
export function playVLinceCrossingStart() {
  noiseBurst({ duration: 0.14, volume: 0.16, filterFreq: 3500, filterType: 'highpass' });
}

// Se muestra el cartel con la respuesta correcta, todavía sin saber quién
// ha acertado: pequeño "redoble" de tensión (una ráfaga de golpes de ruido
// que se intensifican, tipo caja) rematado por un golpe grave que se corta
// en seco sin resolverse, para no adelantar si el desenlace es bueno o
// malo.
export function playVLinceReveal() {
  const hits = 6;
  for (let i = 0; i < hits; i++) {
    noiseBurst({ duration: 0.05, volume: 0.1 + i * 0.015, filterFreq: 2200, filterType: 'bandpass', delay: i * 0.07 });
  }
  beep({ freq: 220, duration: 0.35, volume: 0.14, type: 'sawtooth', freqEnd: 180, delay: hits * 0.07 });
}

// Fin de la partida con superviviente: fanfarria de victoria con timbre
// "triangle", a tono con la vista aguda/naturaleza del modo.
export function playVLinceVictory() {
  playSequence([
    { freq: 587, duration: 0.12, volume: 0.18, type: 'triangle', gap: 0.09 },
    { freq: 740, duration: 0.12, volume: 0.18, type: 'triangle', gap: 0.09 },
    { freq: 988, duration: 0.12, volume: 0.19, type: 'triangle', gap: 0.09 },
    { freq: 1319, duration: 0.32, volume: 0.22, type: 'triangle' },
  ]);
}

// Fin de la partida sin supervivientes: tono neutro/apagado, sin
// resolución.
export function playVLinceDraw() {
  beep({ freq: 392, duration: 0.22, volume: 0.14, type: 'triangle' });
  beep({ freq: 330, duration: 0.3, volume: 0.14, type: 'triangle', delay: 0.2 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE CONTROL DE EXTRANJERÍA
   -----------------------------------------------------------
   playVeJoin (al apuntarse a la cola con !participo) ya se reutiliza tal
   cual en este modo; aquí van los momentos propios del mostrador: la
   llegada del NPC, la caída del pasaporte y, sobre todo, el sello final de
   admitido/rechazado (el instante más "Papers, Please" del modo).
   ========================================================= */

// El NPC llamado llega al mostrador (extrRenderBooth, al arrancar la
// animación de entrada): un pequeño timbre de ventanilla, discreto, para
// marcar que ya hay alguien siendo atendido sin distraer del pasaporte.
export function playExtrArrive() {
  beep({ freq: 988, duration: 0.14, volume: 0.13, type: 'sine' });
  beep({ freq: 1318, duration: 0.1, volume: 0.09, type: 'sine', delay: 0.08 });
}

// El pasaporte cae sobre la mesa: golpe seco y breve de papel/objeto,
// más suave y agudo que el sello final para que no se confunda con él.
export function playExtrPassportDrop() {
  noiseBurst({ duration: 0.07, volume: 0.14, filterFreq: 1200, filterType: 'bandpass' });
  beep({ freq: 180, duration: 0.08, volume: 0.1, type: 'triangle', freqEnd: 90 });
}

// Sello de "admitido": golpe limpio y seco (ruido en paso bajo + un
// chasquido agudo encima), con un timbre más brillante que el de rechazo.
export function playExtrStampAllow() {
  noiseBurst({ duration: 0.08, volume: 0.22, filterFreq: 700, filterType: 'lowpass' });
  beep({ freq: 660, duration: 0.09, volume: 0.14, type: 'square', delay: 0.02 });
}

// Sello de "rechazado": mismo golpe de base pero más grave y sucio
// (sawtooth descendente), para que se note a oído la diferencia con el
// sello de admitido sin necesidad de mirar la pantalla.
export function playExtrStampDeny() {
  noiseBurst({ duration: 0.1, volume: 0.26, filterFreq: 500, filterType: 'lowpass' });
  beep({ freq: 160, duration: 0.14, volume: 0.16, type: 'sawtooth', freqEnd: 90, delay: 0.02 });
}

/* =========================================================
   EFECTOS ESPECÍFICOS DE BOSS COOPERATIVO
   -----------------------------------------------------------
   playVeJoin (al apuntarse en el lobby) y playModeMusic (música por
   nivel/fase) ya se reutilizan tal cual en este modo; aquí van los
   momentos propios del combate por turnos contra el jefe.
   ========================================================= */

// Golpe normal que sí hace daño (combatiente o jefe, cualquiera de los dos
// lados): impacto corto y seco, ruido en paso bajo + un chasquido grave.
// Es el sonido que más se repite de todo el modo, así que se mantiene
// deliberadamente discreto para no cansar en combates largos.
export function playBossHit() {
  noiseBurst({ duration: 0.08, volume: 0.18, filterFreq: 1400, filterType: 'lowpass' });
  beep({ freq: 220, duration: 0.09, volume: 0.14, type: 'square', freqEnd: 120 });
}

// Golpe crítico: variante más contundente del golpe normal (ruido más
// largo y con más volumen, un golpe grave adicional en sawtooth y un
// chasquido agudo superpuesto), para que se note a oído sin mirar el
// "¡GOLPE CRÍTICO!" del chat.
export function playBossCrit() {
  noiseBurst({ duration: 0.12, volume: 0.26, filterFreq: 2000, filterType: 'lowpass' });
  beep({ freq: 160, duration: 0.16, volume: 0.2, type: 'sawtooth', freqEnd: 70 });
  beep({ freq: 1200, duration: 0.08, volume: 0.12, type: 'square', delay: 0.02 });
}

// Esquiva: el golpe falla del todo. Un "whoosh" corto (ruido en paso alto,
// sin componente grave), bien distinto de un golpe para que se reconozca
// al instante que no ha habido daño.
export function playBossDodge() {
  noiseBurst({ duration: 0.1, volume: 0.14, filterFreq: 3000, filterType: 'highpass' });
}

// Un combatiente o el jefe (con el que se esté combatiendo en ese momento)
// se queda sin vida: tono grave descendente y sucio, distinto del golpe
// normal/crítico para marcar que esto es un debilitamiento, no solo daño.
export function playBossFaint() {
  beep({ freq: 300, duration: 0.28, volume: 0.16, type: 'sawtooth', freqEnd: 90 });
}

// Se elige un objeto del cofre (tanto si lo clica el streamer como si lo
// vota el chat en Modo AFK): campanilla ascendente de tres notas, con un
// timbre "mágico" (sine) que la distingue de las fanfarrias más "de
// combate" (square/triangle) del resto de sonidos del modo.
export function playBossChestOpen() {
  playSequence([
    { freq: 660, duration: 0.1, volume: 0.16, type: 'sine', gap: 0.07 },
    { freq: 880, duration: 0.1, volume: 0.17, type: 'sine', gap: 0.07 },
    { freq: 1174, duration: 0.2, volume: 0.2, type: 'sine' },
  ]);
}

// El jefe se envuelve en luz blanca y cambia de forma a mitad de combate:
// un swell ascendente (sine, de grave a agudo) que dura aproximadamente lo
// mismo que la propia animación de envolverse en luz, rematado por un
// destello agudo en el momento en que se revela la nueva forma.
export function playBossTransform() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const dur = 1.05;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(1200, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + dur * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  beep({ freq: 1760, duration: 0.3, volume: 0.14, type: 'sine', delay: 1.0 });
}

// Todos los combatientes apuntados caen derrotados a la vez: fin de
// partida sin resolución, acorde grave y sucio que se apaga del todo, sin
// ninguna nota final que suene a victoria.
export function playBossGameOver() {
  const ctx = getAudioCtx();
  if (ctx) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, t0);
    osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.9);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.15);
  }
  beep({ freq: 116, duration: 0.7, volume: 0.16, type: 'triangle', freqEnd: 55, delay: 0.15 });
}

/* =========================================================
   EFECTOS DE SONIDO EN ARCHIVO (.mp3)
   -----------------------------------------------------------
   A diferencia de los beeps/ruidos sintetizados de arriba, estos dos
   efectos son pistas .mp3 reales (assets/sfx/) para momentos puntuales muy
   concretos: la erupción del volcán (modo Volcán) y el disparo de Rayo
   Solar de Venusaur (modo Rayo Solar). No están en bucle: cada vez que se
   piden se lanza una instancia nueva de Audio (permite que se solapen si,
   por ejemplo, una erupción empieza mientras la anterior instancia aún se
   está desvaneciendo) y se ajustan al volumen de efectos (sfxVolumeScale).
   ========================================================= */
const SFX_FILE_VOLUME = 0.6;

function playSfxFile(src) {
  const audio = new Audio(src);
  audio.volume = SFX_FILE_VOLUME * sfxVolumeScale;
  // Igual que con la música: si el navegador bloquea la reproducción por
  // falta de gesto del usuario, se ignora en vez de romper el flujo.
  audio.play().catch(() => {});
  return audio;
}

// Suena cuando una plataforma entra en erupción en el modo Volcán (justo
// cuando empieza a caer la lluvia de magma de verdad).
export function playVolcanEruption() {
  return playSfxFile('assets/sfx/eruption.mp3');
}

// Aviso de "quedan 5s para la erupción" en el modo Volcán: doble pitido
// grave y urgente (más rústico/de alarma que el playCountdownBeep genérico
// de arriba), pensado para sonar una única vez por ronda.
export function playVolcanFiveSecWarning() {
  beep({ freq: 220, duration: 0.14, volume: 0.24, type: 'square' });
  beep({ freq: 220, duration: 0.14, volume: 0.24, type: 'square', delay: 0.18 });
}

// Suena cuando Venusaur dispara su Rayo Solar en el modo Rayo Solar (justo
// cuando aparece el rayo visual, al terminar la carga).
export function playRayoSolarBeam() {
  return playSfxFile('assets/sfx/solar-beam.mp3');
}

/* =========================================================
   MÚSICA DE FONDO POR MODO
   -----------------------------------------------------------
   A diferencia de los efectos de arriba (sintetizados), la música de
   fondo son pistas .mp3 reales (assets/music/), una por modo, que se
   reproducen en bucle mientras dura la partida. Solo puede sonar una
   pista de música de fondo a la vez: al pedir una nueva se detiene y
   se libera la anterior.
   ========================================================= */
const MODE_MUSIC_SRC = {
  'zoroarks': 'assets/music/zoroarks.mp3',
  'zona-safari': 'assets/music/zona-safari.mp3',
  'volcan': 'assets/music/volcan.mp3',
  'vista-lince': 'assets/music/vista-lince.mp3',
  'extranjeria': 'assets/music/extranjeria.mp3',
  'voltorb-explosivo': 'assets/music/voltorb-explosivo.mp3',
  'glaciar': 'assets/music/glaciar.mp3',
  'pokerus1': 'assets/music/pokerus1.mp3',
  'pokerus2': 'assets/music/pokerus2.mp3',
  'arena': 'assets/music/arena.mp3',
  'rayosolar': 'assets/music/rayo-solar.mp3',
  'pasapalabra': 'assets/music/pasapalabra.mp3',
};
// Pistas del menú principal (pantalla de selección de modo, ver
// MODE_TITLES/showScreen('menu-screen') en modeLauncher.js/
// eventListeners.js): no están asociadas a ningún modo de juego, se ponen en
// marcha a mano desde esos puntos en vez de por MODE_MUSIC_KEY. En vez de una
// única pista en bucle, hay varias y se van encadenando en orden aleatorio
// (ver playMenuMusic más abajo): al terminar una empieza otra elegida al
// azar entre las demás, sin repetir la que acaba de sonar.
const MENU_MUSIC_TRACKS = [
  'assets/music/menu-principal.mp3',
  'assets/music/menu-principal2.mp3',
  'assets/music/menu-principal3.mp3',
  'assets/music/menu-principal4.mp3',
];
// Modo Boss Cooperativo: dos pistas por nivel (BOSS_MUSIC_TOTAL_LEVELS,
// igual que BOSS_TOTAL_LEVELS en modes/boss.js) — una que suena en bucle
// durante las primeras 14 fases ('boss-nivel-N') y otra para la fase final
// (15), el jefe grande del nivel ('boss-boss-nivel-N'). Se generan aquí
// como claves sueltas, en vez de listarlas a mano una a una, para que
// coincidan siempre con los ficheros de assets/music/boss/ (ver
// bossMusicKeyForStage en modes/boss.js, que es quien realmente decide cuál
// de las dos toca en cada momento según el nivel/fase en curso).
const BOSS_MUSIC_TOTAL_LEVELS = 20;
for (let i = 1; i <= BOSS_MUSIC_TOTAL_LEVELS; i++) {
  MODE_MUSIC_SRC[`boss-nivel-${i}`] = `assets/music/boss/nivel-${i}.mp3`;
  MODE_MUSIC_SRC[`boss-boss-nivel-${i}`] = `assets/music/boss/boss-nivel-${i}.mp3`;
}
const MODE_MUSIC_VOLUME = 0.35;
// Duración (ms) del fundido de la música de fondo: se usa tanto para el
// fundido de SALIDA de la pista que deja de sonar (al parar la música o al
// cambiar a otra distinta) como para el fundido de ENTRADA de la que la
// sustituye, de forma que ambas se crucen suavemente en vez de dejar un
// hueco de silencio ni cortarse en seco.
const MUSIC_FADE_MS = 900;

let currentMusicAudio = null;
let currentMusicKey = null;

// Elige al azar una pista de MENU_MUSIC_TRACKS, evitando repetir
// `excludeSrc` (la que acaba de sonar) siempre que haya alguna otra
// disponible.
function pickRandomMenuTrack(excludeSrc) {
  const options = MENU_MUSIC_TRACKS.filter((src) => src !== excludeSrc);
  const pool = options.length ? options : MENU_MUSIC_TRACKS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Crea y reproduce (sin bucle) la pista de menú `src`, y cuando termina
// encadena automáticamente otra pista aleatoria distinta (ver
// pickRandomMenuTrack), siempre que la música de menú siga siendo la que
// está sonando (si mientras tanto se ha cambiado de modo o se ha parado la
// música, currentMusicAudio ya no será este `audio` y no se encadena nada).
function createMenuTrackAudio(src, volume) {
  const audio = new Audio(src);
  audio.loop = false;
  audio.volume = volume;
  audio.addEventListener('ended', () => {
    if (currentMusicAudio !== audio) return;
    const nextVolume = MODE_MUSIC_VOLUME * musicVolumeScale;
    const nextAudio = createMenuTrackAudio(pickRandomMenuTrack(src), nextVolume);
    nextAudio.play().catch(() => {});
    currentMusicAudio = nextAudio;
    currentMusicKey = 'menu';
  });
  return audio;
}

// Va bajando el volumen de `audio` (partiendo de su volumen actual) hasta 0
// a lo largo de `durationMs`, y al terminar la pausa y libera su `src`. Se
// guarda el propio intervalo colgado del elemento (audio._fadeInterval)
// para poder cancelarlo si ese mismo elemento recibe otra orden de fundido
// mientras el anterior seguía a medias (no debería darse en la práctica,
// ya que cada Audio se descarta en cuanto empieza su fundido de salida,
// pero es una salvaguarda barata).
function fadeOutAndStop(audio, durationMs) {
  if (!audio) return;
  if (audio._fadeInterval) clearInterval(audio._fadeInterval);
  const steps = 18;
  const stepMs = durationMs / steps;
  const startVolume = audio.volume;
  let i = 0;
  audio._fadeInterval = setInterval(() => {
    i++;
    audio.volume = Math.max(0, startVolume * (1 - i / steps));
    if (i >= steps) {
      clearInterval(audio._fadeInterval);
      try { audio.pause(); } catch (e) { /* noop */ }
      audio.src = '';
    }
  }, stepMs);
}

// Sube el volumen de `audio` (arrancando desde 0) hasta `targetVolume` a lo
// largo de `durationMs`. Igual que fadeOutAndStop, usa su propio intervalo
// colgado del elemento para no interferir con el de otra pista.
function fadeInTo(audio, targetVolume, durationMs) {
  if (!audio) return;
  if (audio._fadeInterval) clearInterval(audio._fadeInterval);
  const steps = 18;
  const stepMs = durationMs / steps;
  let i = 0;
  audio.volume = 0;
  audio._fadeInterval = setInterval(() => {
    i++;
    audio.volume = Math.min(targetVolume, targetVolume * (i / steps));
    if (i >= steps) {
      clearInterval(audio._fadeInterval);
      audio.volume = targetVolume;
    }
  }, stepMs);
}

// Empieza a reproducir en bucle la pista de música asociada a `key` (ver
// MODE_MUSIC_SRC). Si esa misma pista ya está sonando no hace nada (evita
// reiniciarla sin motivo, p.ej. al pulsar "Nueva Partida" dentro del mismo
// modo, o al avanzar de una fase normal a la siguiente dentro del mismo
// nivel del modo Boss, donde ambas fases comparten pista). Si `key` no
// tiene pista asociada, no reproduce nada. Si ya había otra pista sonando,
// esta se va con un fundido de salida (fadeOutAndStop) mientras la nueva
// entra con un fundido de entrada (fadeInTo), cruzándose entre sí en vez de
// cortarse en seco.
export function playModeMusic(key) {
  const isMenu = key === 'menu';
  const src = isMenu ? pickRandomMenuTrack(null) : MODE_MUSIC_SRC[key];
  if (!src) return;
  if (currentMusicKey === key && currentMusicAudio) return;
  const previousAudio = currentMusicAudio;
  const targetVolume = MODE_MUSIC_VOLUME * musicVolumeScale;
  const audio = isMenu ? createMenuTrackAudio(src, 0) : new Audio(src);
  if (!isMenu) {
    audio.loop = true;
    audio.volume = 0;
  }
  // El autoplay de audio puede requerir un gesto previo del usuario; como
  // esto siempre se dispara tras pulsar un botón (elegir modo, empezar
  // partida...) ya hay gesto de sobra, pero por si el navegador lo bloquea
  // igualmente, se ignora el error en vez de romper el flujo del juego.
  audio.play().catch(() => {});
  fadeInTo(audio, targetVolume, MUSIC_FADE_MS);
  currentMusicAudio = audio;
  currentMusicKey = key;
  if (previousAudio) fadeOutAndStop(previousAudio, MUSIC_FADE_MS);
}

// Detiene la música de fondo actual (si había alguna sonando) con un
// fundido de salida, en vez de cortarla en seco.
export function stopModeMusic() {
  if (currentMusicAudio) fadeOutAndStop(currentMusicAudio, MUSIC_FADE_MS);
  currentMusicAudio = null;
  currentMusicKey = null;
}
