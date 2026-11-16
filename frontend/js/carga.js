// Overlay global de carga: pantalla completa con fondo semitransparente, blur y spinner.
// Lo activa api.js en las peticiones que modifican datos (cobrar, abonar, guardar compras, crear clientes...).
// Mientras está visible bloquea el mouse (el overlay lo cubre todo), el teclado (el resto de la página
// queda `inert`) y la tecla Escape (que cerraría un modal a mitad de una operación).
export const MENSAJE_POR_DEFECTO = 'Procesando tu solicitud...';

// Al terminar se espera un instante antes de ocultar: si enseguida empieza otra petición
// (guardar la venta y luego cerrarla) el overlay no parpadea entre una y otra.
const RETARDO_OCULTAR_MS = 60;

let activas = 0;            // peticiones en curso que usan el overlay
let visible = false;
let overlay = null;
let temporizador = null;
let focoPrevio = null;
const bloqueados = [];      // elementos de <body> marcados como inert por el overlay

function obtenerOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'carga-global';
  overlay.className = 'carga-global oculto';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="carga-caja">
      <span class="carga-spinner" aria-hidden="true"></span>
      <p class="carga-texto"></p>
      <p class="carga-sub">Por favor, espera un momento.</p>
    </div>`;
  document.body.appendChild(overlay);

  // En fase de captura para adelantarse al cierre de modales con Escape.
  window.addEventListener('keydown', (e) => {
    if (!visible || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  return overlay;
}

function abrir(el) {
  focoPrevio = document.activeElement;
  el.classList.remove('oculto');
  Array.from(document.body.children).forEach((nodo) => {
    // El toast queda fuera para que un mensaje de error se vea sin blur ni bloqueo.
    if (nodo === el || nodo.id === 'toast' || nodo.tagName === 'SCRIPT' || nodo.inert) return;
    nodo.inert = true;
    bloqueados.push(nodo);
  });
  document.body.setAttribute('aria-busy', 'true');
  visible = true;
}

function cerrar() {
  overlay.classList.add('oculto');
  bloqueados.splice(0).forEach((nodo) => { nodo.inert = false; });
  document.body.removeAttribute('aria-busy');
  visible = false;
  // Devuelve el foco a donde estaba el usuario, salvo que ya haya otro foco (p. ej. un modal recién abierto).
  const sinFoco = !document.activeElement || document.activeElement === document.body;
  if (sinFoco && focoPrevio && focoPrevio.isConnected && !focoPrevio.disabled && typeof focoPrevio.focus === 'function') {
    focoPrevio.focus({ preventScroll: true });
  }
  focoPrevio = null;
}

/** Muestra el overlay (varias peticiones simultáneas comparten uno solo). Cada llamada exige un ocultarCarga(). */
export function mostrarCarga(mensaje = MENSAJE_POR_DEFECTO) {
  const el = obtenerOverlay();
  clearTimeout(temporizador);
  temporizador = null;
  el.querySelector('.carga-texto').textContent = mensaje;
  if (!visible) abrir(el);
  activas += 1;
}

/** Libera una petición; el overlay se oculta cuando ya no queda ninguna en curso. */
export function ocultarCarga() {
  activas = Math.max(0, activas - 1);
  if (activas > 0) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = null;
    if (activas === 0 && visible) cerrar();
  }, RETARDO_OCULTAR_MS);
}
