import { owNpcAnimFrameDataUrl } from './data/owNpcDb.js';

/* =========================================================
   OwWalker
   -----------------------------------------------------------
   Pequeña clase reutilizable que anima un <img> con el sprite OW
   de un NPC (ver js/data/owNpcDb.js), alternando entre la pose
   "de pie" y los dos fotogramas de "paso" de una dirección
   (arriba/abajo/izquierda/derecha) — el mismo ciclo de 3
   fotogramas que usan los personajes al moverse por el mapa en
   los juegos originales.

   Uso típico:
     const walker = new OwWalker(imgEl, npc, 'down');
     walker.setDirection('right');
     walker.startWalking();   // empieza a alternar los fotogramas de paso
     walker.stopWalking();    // vuelve a la pose "de pie"
     walker.destroy();        // detiene cualquier temporizador activo
   ========================================================= */
const OW_STEP_MS_DEFAULT = 160; // duración de cada fotograma de la animación de piernas

export class OwWalker {
  constructor(imgEl, npc, dir = 'down') {
    this.imgEl = imgEl;
    this.npc = npc;
    this.dir = dir;
    this._walking = false;
    this._phase = 0; // 0 = de pie, 1/2 = fotogramas de paso (alternando)
    this._timer = null;
    this._applyFrame();
  }

  // Cambia la dirección hacia la que mira/anda (no reinicia la animación).
  setDirection(dir) {
    if (!dir || dir === this.dir) return;
    this.dir = dir;
    this._applyFrame();
  }

  // Empieza (o reinicia) el ciclo de piernas de "andar".
  startWalking(stepMs = OW_STEP_MS_DEFAULT) {
    this._walking = true;
    if (this._timer) clearInterval(this._timer);
    this._phase = 1;
    this._applyFrame();
    this._timer = setInterval(() => {
      this._phase = this._phase === 1 ? 2 : 1;
      this._applyFrame();
    }, stepMs);
  }

  // Para el ciclo de piernas y vuelve a la pose "de pie".
  stopWalking() {
    this._walking = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._phase = 0;
    this._applyFrame();
  }

  get isWalking() {
    return this._walking;
  }

  // Libera el temporizador (llamar al descartar el walker para evitar
  // que siga corriendo un setInterval sobre un <img> ya desconectado).
  destroy() {
    this.stopWalking();
    this.imgEl = null;
  }

  _applyFrame() {
    const phase = this._phase === 0 ? 'idle' : (this._phase === 1 ? 'step1' : 'step2');
    const img = this.imgEl;
    owNpcAnimFrameDataUrl(this.npc, this.dir, phase).then(url => {
      if (url && img && img.isConnected) img.src = url;
    });
  }
}
