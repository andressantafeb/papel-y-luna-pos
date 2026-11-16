// Utilidades de interfaz compartidas por todas las vistas.
const ZONA = 'America/Bogota';
const MAPA_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escapa texto antes de insertarlo en innerHTML (evita XSS con nombres de productos, clientes, etc.).
export const esc = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => MAPA_HTML[c]);
export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const moneda = (valor) => formatoMoneda.format(Number(valor) || 0);
export const fecha = (valor) => (valor
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: ZONA }).format(new Date(valor))
  : '');
// Fecha de hoy AAAA-MM-DD en la zona horaria del negocio (para filtros por rango).
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

export function toast(mensaje, tipo = 'ok') {
  const el = $('#toast');
  el.textContent = mensaje;
  el.className = `toast ${tipo}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('oculto'), tipo === 'error' ? 4500 : 2600);
}

export const mostrarError = (error) => toast(error && error.message ? error.message : 'Ocurrió un error.', 'error');

/** Abre un modal con el estilo del MVP 1. Devuelve { el, cerrar }. */
export function abrirModal(html, clase = 'formulario-caja', alCerrar) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="modal-caja ${clase}"><button type="button" class="modal-cerrar" aria-label="Cerrar">×</button>${html}</div>`;
  document.body.appendChild(el);

  let abierto = true;
  const alTeclear = (e) => { if (e.key === 'Escape') cerrar(); };
  function cerrar() {
    if (!abierto) return;
    abierto = false;
    el.remove();
    document.removeEventListener('keydown', alTeclear);
    if (alCerrar) alCerrar();
  }
  document.addEventListener('keydown', alTeclear);
  $('.modal-cerrar', el).addEventListener('click', cerrar);
  el.addEventListener('mousedown', (e) => { if (e.target === el) cerrar(); });
  return { el, cerrar };
}

/** Confirmación de acciones críticas. Resuelve true si el usuario confirma. */
export function confirmar(titulo, texto, { textoOk = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolver) => {
    let decidido = false;
    const decidir = (valor) => { if (!decidido) { decidido = true; resolver(valor); } };
    const modal = abrirModal(
      `<span class="eyebrow">CONFIRMACIÓN</span><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
       <div class="acciones-modal"><button type="button" class="boton secundario" data-no>Cancelar</button>
       <button type="button" class="boton ${peligro ? 'peligro' : 'primario'}" data-si>${esc(textoOk)}</button></div>`,
      '', () => decidir(false)
    );
    $('[data-no]', modal.el).addEventListener('click', modal.cerrar);
    $('[data-si]', modal.el).addEventListener('click', () => { decidir(true); modal.cerrar(); });
  });
}

/** Ejecuta una acción async deshabilitando el botón; los errores se muestran en un aviso. */
export async function conCarga(boton, accion) {
  if (boton) boton.disabled = true;
  try {
    return await accion();
  } catch (error) {
    mostrarError(error);
    return undefined;
  } finally {
    if (boton) boton.disabled = false;
  }
}

export const opciones = (lista, valor, texto, seleccionado, vacio) => (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '')
  + lista.map((x) => `<option value="${esc(x[valor])}" ${String(x[valor]) === String(seleccionado ?? '') ? 'selected' : ''}>${esc(typeof texto === 'function' ? texto(x) : x[texto])}</option>`).join('');

export const vacio = (titulo, detalle = '') => `<div class="estado-vacio"><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></div>`;
