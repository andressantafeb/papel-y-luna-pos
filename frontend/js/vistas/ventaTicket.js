import { esc, moneda } from '../util.js';

export function htmlItems(items) {
  if (!items.length) {
    return '<div class="ticket-vacio"><span>🧾</span><strong>Ticket vacío</strong><p>Toca un producto para agregarlo.</p></div>';
  }
  return items.map((i) => `
    <div class="ticket-item">
      <div class="ticket-item-top">
        <strong>${esc(i.nombre)}</strong>
        <span class="acciones">
          <button type="button" data-a="editar" data-id="${i.productoId}" aria-label="Editar producto" title="Editar producto">✎</button>
          <button type="button" data-a="quitar" data-id="${i.productoId}" aria-label="Quitar producto">×</button>
        </span>
      </div>
      <div class="ticket-item-bottom">
        <small>${moneda(i.precio)} c/u</small>
        <div class="contador">
          <button type="button" data-a="restar" data-id="${i.productoId}" aria-label="Restar una unidad">−</button>
          <input type="number" class="campo cant-input" min="1" step="1" value="${i.cantidad}" data-id="${i.productoId}" aria-label="Cantidad">
          <button type="button" data-a="sumar" data-id="${i.productoId}" aria-label="Sumar una unidad">+</button>
        </div>
        <strong>${moneda(i.precio * i.cantidad)}</strong>
      </div>
    </div>`).join('');
}

export function htmlTotales(t) {
  const detalle = t.descuento
    ? `<div class="total-linea chica"><span>Subtotal</span><span>${moneda(t.subtotal)}</span></div>
       <div class="total-linea chica"><span>Descuento (${esc(t.descuento.nombre)})</span><span>-${moneda(t.monto)}</span></div>`
    : '';
  return `${detalle}<div class="total-linea"><span>Total</span><strong>${moneda(t.total)}</strong></div>`;
}
