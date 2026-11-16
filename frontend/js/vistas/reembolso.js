// Reembolso de una venta cerrada (administrador): total o parcial, con vista previa del monto.
import { get, post } from '../api.js';
import { $, esc, moneda, abrirModal, toast, mostrarError } from '../util.js';

export async function abrirReembolso(ventaBasica, onListo) {
  let venta;
  try { venta = await get(`/ventas/${ventaBasica.id}`); } catch (err) { return mostrarError(err); }

  // Unidades que todavía se pueden reembolsar por producto (vendidas - reembolsos previos).
  const reembolsado = {};
  venta.reembolsos.forEach((r) => r.items.forEach((i) => { reembolsado[i.productoId] = (reembolsado[i.productoId] || 0) + i.cantidad; }));
  const lineas = venta.items
    .map((i) => ({ ...i, pendiente: i.cantidad - (reembolsado[i.productoId] || 0) }))
    .filter((i) => i.pendiente > 0);
  if (!lineas.length) return toast('Esta venta ya fue reembolsada por completo.', 'error');

  const modal = abrirModal(`
    <span class="eyebrow">REEMBOLSO</span><h2>Reembolsar venta #${venta.id}</h2>
    <p class="login-ayuda">Elige las unidades y si cada producto vuelve al inventario. ${venta.descuento ? 'El valor respeta el descuento de forma proporcional.' : ''}</p>
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Producto</th><th>Cant.</th><th>Vuelve al stock</th></tr></thead>
      <tbody>${lineas.map((l) => `<tr>
        <td>${esc(l.nombre)}<br><small>Reembolsables: ${l.pendiente} · ${moneda(l.precio)} c/u</small></td>
        <td><input class="campo cant-input" type="number" min="0" max="${l.pendiente}" step="1" value="0" data-id="${l.productoId}" data-max="${l.pendiente}"></td>
        <td><input type="checkbox" data-retorna="${l.productoId}" checked aria-label="Vuelve al inventario"></td></tr>`).join('')}</tbody>
    </table></div>
    ${venta.metodoPago === 'Debe' ? `<p class="login-ayuda">Venta a crédito: abonado ${moneda(venta.totalAbonado)} · saldo pendiente ${moneda(venta.saldoPendiente)}. El reembolso baja primero la deuda; si el cliente ya pagó más de lo que le correspondía, ese excedente se le devuelve.</p>` : ''}
    <div class="resumen-cobro" style="margin-top:12px"><span>Monto a reembolsar</span><strong id="rb-monto">$0</strong></div>
    <div id="rb-desglose" class="desglose-reembolso oculto"></div>
    <label for="rb-obs">Observación (opcional)</label><input id="rb-obs" type="text" maxlength="300">
    <p id="rb-error" class="aviso-error oculto" role="alert"></p>
    <div class="acciones-modal acciones-wrap">
      <button type="button" class="boton secundario" id="rb-todo">Reembolsar todo lo pendiente</button>
      <button type="button" class="boton primario" id="rb-ok" disabled>Registrar reembolso</button>
    </div>`);

  const el = modal.el;
  const error = $('#rb-error', el);
  const aviso = (t) => { error.textContent = t; error.classList.toggle('oculto', !t); };
  const retorna = (id) => $(`[data-retorna="${id}"]`, el).checked;

  // Cuánto del reembolso baja la deuda del cliente y cuánto hay que devolverle en dinero.
  function pintarDesglose(d) {
    const caja = $('#rb-desglose', el);
    if (!d) { caja.classList.add('oculto'); caja.innerHTML = ''; return; }
    caja.classList.remove('oculto');
    caja.innerHTML = `${d.esDebe ? `<p>Reduce la deuda del cliente: <strong>${moneda(d.reduceDeuda)}</strong> · saldo queda en ${moneda(d.saldoDespues)}</p>` : ''}
      <p>Devolver al cliente: <strong class="${d.devuelto > 0 ? 'devolver' : ''}">${moneda(d.devuelto)}</strong></p>`;
  }
  const seleccion = () => [...el.querySelectorAll('input[data-max]')]
    .map((i) => ({ productoId: Number(i.dataset.id), cantidad: Math.floor(Number(i.value) || 0), retornaInventario: retorna(i.dataset.id) }))
    .filter((s) => s.cantidad > 0);

  // La vista previa la calcula el backend, así el monto mostrado es exactamente el que se registra.
  let temporizador;
  async function actualizarMonto() {
    aviso('');
    const items = seleccion();
    $('#rb-ok', el).disabled = !items.length;
    if (!items.length) { $('#rb-monto', el).textContent = moneda(0); pintarDesglose(null); return; }
    try {
      // La vista previa se recalcula con cada casilla: es ligera y no debe bloquear la pantalla.
      const r = await post(`/ventas/${venta.id}/reembolsos/previsualizar`, { tipo: 'parcial', items }, { carga: false });
      $('#rb-monto', el).textContent = moneda(r.monto);
      pintarDesglose(r);
    } catch (err) { aviso(err.message); pintarDesglose(null); $('#rb-ok', el).disabled = true; }
  }
  el.addEventListener('input', (e) => {
    if (e.target.matches('input[data-max]')) {
      const max = Number(e.target.dataset.max);
      if (Number(e.target.value) > max) e.target.value = max;
      if (Number(e.target.value) < 0) e.target.value = 0;
    }
    clearTimeout(temporizador);
    temporizador = setTimeout(actualizarMonto, 300);
  });
  $('#rb-todo', el).addEventListener('click', () => {
    el.querySelectorAll('input[data-max]').forEach((i) => { i.value = i.dataset.max; });
    actualizarMonto();
  });

  $('#rb-ok', el).addEventListener('click', async (e) => {
    const items = seleccion();
    if (!items.length) return;
    e.target.disabled = true;
    try {
      const r = await post(`/ventas/${venta.id}/reembolsos`, { tipo: 'parcial', items, observacion: $('#rb-obs', el).value.trim() || undefined });
      const d = r.desglose || {};
      toast(d.devuelto > 0
        ? `Reembolso registrado: ${moneda(r.reembolso.monto)}. Devuelve ${moneda(d.devuelto)} al cliente.`
        : `Reembolso registrado: ${moneda(r.reembolso.monto)}.`);
      modal.cerrar();
      if (onListo) onListo(r.venta);
    } catch (err) { aviso(err.message); e.target.disabled = false; }
  });
}
