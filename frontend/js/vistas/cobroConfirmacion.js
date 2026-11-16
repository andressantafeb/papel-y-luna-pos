// Confirmación de pago exitoso (RF-26): nueva venta, mostrar factura, corregir.
import { esc, moneda, abrirModal } from '../util.js';
import { mostrarFactura } from '../factura.js';
import { etiquetaPago } from '../pagos.js';

/** Texto de la línea de resumen según el método de pago de la venta cerrada. */
function detallePago(venta) {
  if (venta.metodoPago === 'Efectivo') return ` · Cambio ${moneda(venta.cambio)}`;
  if (venta.metodoPago !== 'Debe') return '';
  const abono = venta.abonoInicial > 0
    ? ` · Abono ${moneda(venta.abonoInicial)} (${etiquetaPago(venta.metodoAbono, venta.billetera)})`
    : '';
  return `${abono} · Saldo ${moneda(venta.saldoPendiente)}`;
}

export function abrirConfirmacion(venta, { esAdmin, onNueva, onCorregir, onReembolsar }) {
  const pago = venta.metodoPago === 'Debe' ? 'Debe' : etiquetaPago(venta.metodoPago, venta.billetera);
  const modal = abrirModal(`
    <div class="confirmacion"><span class="confirmacion-icono">✓</span><h2>Venta cerrada</h2>
    <p>Venta #${venta.id} · ${moneda(venta.total)} · ${esc(pago)}${esc(detallePago(venta))}</p></div>
    <div class="acciones-modal acciones-wrap">
      <button type="button" class="boton secundario" data-a="factura">Ver factura</button>
      ${esAdmin ? '<button type="button" class="boton secundario" data-a="corregir">Corregir</button>' : ''}
      ${esAdmin && onReembolsar ? '<button type="button" class="boton secundario" data-a="reembolsar">Reembolsar</button>' : ''}
      <button type="button" class="boton primario" data-a="nueva">Nueva venta</button>
    </div>`, 'confirmacion', () => onNueva && onNueva());
  modal.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'factura') mostrarFactura(venta, { esAdmin, onCorregir, onReembolsar, onNuevaVenta: onNueva });
    if (a === 'corregir') { modal.cerrar(); onCorregir(venta); }
    // Abre el formulario de devolución directamente, sin pasar por el historial.
    if (a === 'reembolsar') { modal.cerrar(); onReembolsar(venta); }
    if (a === 'nueva') modal.cerrar();
  });
}
