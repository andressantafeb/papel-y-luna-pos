// Factura / comprobante de una venta cerrada, con impresión (PDF) y acciones administrativas.
import { $, esc, moneda, fecha, abrirModal } from './util.js';
import { etiquetaPago } from './pagos.js';

const ESTADO_REEMBOLSO = { parcial: 'Reembolso parcial', total: 'Reembolso total' };

// Bloque de venta a crédito: abono inicial, pagos posteriores y saldo pendiente.
function htmlCredito(v) {
  const abonos = v.abonos || [];
  const posteriores = abonos.filter((a) => a.tipo === 'posterior');
  return `<div class="factura-pago factura-credito">
    <p>Abono inicial: ${moneda(v.abonoInicial)}${v.abonoInicial > 0 ? ` (${esc(etiquetaPago(v.metodoAbono, v.billetera))})` : ''}</p>
    ${posteriores.map((a) => `<p>Abono ${esc(fecha(a.fecha))}: ${moneda(a.monto)} (${esc(etiquetaPago(a.metodoPago, a.billetera))})</p>`).join('')}
    <p><strong>Total abonado: ${moneda(v.totalAbonado)}</strong></p>
    <p class="saldo-factura"><strong>Saldo pendiente: ${moneda(v.saldoPendiente)}</strong></p>
  </div>`;
}

// Desglose de totales. Ventas con IVA: Subtotal (productos - descuento), IVA (19%) y Total.
// Ventas anteriores al IVA (ivaPorcentaje 0): se conserva el formato original, su total no cambia.
function htmlTotalesFactura(v) {
  const descuento = v.descuento
    ? `<p>Productos: ${moneda(v.subtotal)}</p><p>Descuento (${esc(v.descuento.nombre)}): -${moneda(v.descuentoMonto)}</p>`
    : '';
  if (!(v.ivaPorcentaje > 0)) {
    return `${v.descuento ? `<div class="factura-pago"><p>Subtotal: ${moneda(v.subtotal)}</p><p>Descuento (${esc(v.descuento.nombre)}): -${moneda(v.descuentoMonto)}</p></div>` : ''}
      <div class="factura-total"><span>Total</span><strong>${moneda(v.total)}</strong></div>`;
  }
  const subtotal = v.subtotal - (v.descuentoMonto || 0);
  return `${descuento ? `<div class="factura-pago">${descuento}</div>` : ''}
      <div class="factura-desglose">
        <div><span>Subtotal</span><span>${moneda(subtotal)}</span></div>
        <div><span>IVA (${v.ivaPorcentaje}%)</span><span>${moneda(v.ivaMonto)}</span></div>
      </div>
      <div class="factura-total"><span>Total</span><strong>${moneda(v.total)}</strong></div>`;
}

export function htmlFactura(v) {
  const reembolsos = v.reembolsos || [];
  return `
    <div class="factura-printable">
      <div class="factura-cabecera">
        <img src="img/logo.png" alt="Papel y Luna" class="factura-logo">
        <div><h2>Papel y Luna</h2><p>Comprobante de venta</p></div>
      </div>
      ${v.corregida ? `<div class="marca-corregida"><strong>VENTA CORREGIDA</strong> por ${esc(v.corregidaPorNombre)} el ${esc(fecha(v.corregidaEn))}</div>` : ''}
      ${v.estadoReembolso !== 'ninguno' ? `<div class="marca-corregida"><strong>${esc(ESTADO_REEMBOLSO[v.estadoReembolso])}</strong></div>` : ''}
      <div class="factura-meta">
        <p><strong>Venta:</strong> #${v.id}</p>
        <p><strong>Fecha:</strong> ${esc(fecha(v.cerradaEn || v.creadaEn))}</p>
        <p><strong>Atendió:</strong> ${esc(v.usuarioNombre)}</p>
        <p><strong>Pago:</strong> ${esc(v.metodoPago === 'Debe' ? 'Debe' : (etiquetaPago(v.metodoPago, v.billetera) || 'Pendiente'))}</p>
        ${v.clienteNombre ? `<p><strong>Cliente:</strong> ${esc(v.clienteNombre)}</p>` : ''}
      </div>
      <table class="tabla-factura">
        <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody>${v.items.map((i) => `<tr><td>${esc(i.nombre)}</td><td>${i.cantidad}</td><td>${moneda(i.precio)}</td><td>${moneda(i.subtotal)}</td></tr>`).join('')}</tbody>
      </table>
      ${htmlTotalesFactura(v)}
      ${v.metodoPago === 'Efectivo' ? `<div class="factura-pago"><p>Recibido: ${moneda(v.recibido)}</p><p>Cambio: ${moneda(v.cambio)}</p></div>` : ''}
      ${v.metodoPago === 'Debe' ? htmlCredito(v) : ''}
      ${reembolsos.length ? `<div class="bloque-reembolsos"><strong>Reembolsos</strong>${reembolsos.map((r) => `
        <p>${esc(fecha(r.fecha))} · ${esc(r.usuarioNombre)} · -${moneda(r.monto)}${v.metodoPago === 'Debe' ? ` (baja la deuda ${moneda(r.reduceDeuda)}${r.devuelto > 0 ? `; se devuelve al cliente ${moneda(r.devuelto)}` : ''})` : ''}<br>
        ${r.items.map((i) => `${i.cantidad} × ${esc(i.nombre)} (${i.retornaInventario ? 'vuelve al inventario' : 'no vuelve al inventario'})`).join('; ')}</p>`).join('')}${v.totalDevuelto > 0 ? `<p><strong>Total a devolver al cliente: ${moneda(v.totalDevuelto)}</strong></p>` : ''}</div>` : ''}
      <p class="factura-gracias">Gracias por su compra.</p>
    </div>`;
}

/**
 * Muestra la factura en un modal. opciones:
 *  - esAdmin: habilita Corregir / Reembolsar (solo ventas cerradas)
 *  - onCorregir(venta), onReembolsar(venta): se llaman tras cerrar el modal
 *  - onNuevaVenta: agrega el botón "Nueva venta"
 */
export function mostrarFactura(venta, { esAdmin = false, onCorregir, onReembolsar, onNuevaVenta } = {}) {
  const puedeAdmin = esAdmin && venta.estado === 'cerrada';
  const modal = abrirModal(`
    <div id="contenido-factura">${htmlFactura(venta)}</div>
    <div class="acciones-modal acciones-wrap no-print">
      ${puedeAdmin && onCorregir ? '<button type="button" class="boton secundario" data-accion="corregir">Corregir venta</button>' : ''}
      ${puedeAdmin && onReembolsar && venta.estadoReembolso !== 'total' ? '<button type="button" class="boton secundario" data-accion="reembolsar">Reembolsar</button>' : ''}
      <button type="button" class="boton primario" data-accion="imprimir">Imprimir / generar PDF</button>
      ${onNuevaVenta ? '<button type="button" class="boton secundario" data-accion="nueva">Nueva venta</button>' : ''}
      <button type="button" class="boton texto" data-accion="volver">Volver</button>
    </div>`, 'factura-caja');
  modal.el.id = 'modal-factura';

  modal.el.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;
    if (accion === 'imprimir') {
      document.body.classList.add('imprimiendo-factura');
      window.print();
      setTimeout(() => document.body.classList.remove('imprimiendo-factura'), 250);
      return;
    }
    modal.cerrar();
    if (accion === 'corregir') onCorregir(venta);
    if (accion === 'reembolsar') onReembolsar(venta);
    if (accion === 'nueva') onNuevaVenta();
  });
  return modal;
}
