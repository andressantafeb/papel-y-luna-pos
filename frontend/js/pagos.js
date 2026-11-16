// Métodos de pago (misma lista que el backend, src/utils/metodosPago.js) y su texto para pantalla y factura.
export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Debe'];

// Con qué se paga un abono: es dinero que entra, así que "Debe" no aplica.
export const METODOS_ABONO = ['Efectivo', 'Transferencia', 'Tarjeta'];

export const BILLETERA_MAX = 60;

/** "Transferencia · Itaú" si hay billetera; en cualquier otro caso, el nombre del método. */
export const etiquetaPago = (metodo, billetera) => (metodo === 'Transferencia' && billetera
  ? `Transferencia · ${billetera}` : (metodo || ''));

/**
 * Campo de texto opcional para la billetera o banco de una transferencia.
 * Es un input plano y libre: sin <datalist>, lista desplegable ni autocompletado del navegador.
 */
export const campoBilletera = (id, valor = '') => `
  <label for="${id}">Billetera o banco <small>(opcional)</small></label>
  <input id="${id}" type="text" maxlength="${BILLETERA_MAX}" autocomplete="off" spellcheck="false"
    placeholder="Escribe el banco o billetera (ej. Itaú, Nu, Daviplata)" value="${String(valor).replace(/"/g, '&quot;')}">`;

/** Botones de selección de método ("data-metodo" o "data-abono" según el atributo recibido). */
export const botonesMetodo = (lista, activo, atributo) => lista
  .map((m) => `<button type="button" class="metodo ${m === activo ? 'activo' : ''}" ${atributo}="${m}">${m}</button>`)
  .join('');
