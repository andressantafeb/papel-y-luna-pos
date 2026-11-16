// Modal del cliente en "Cuentas por cobrar": ventas con saldo, formulario de abono e historial de pagos.
import { get, post } from '../api.js';
import { $, esc, moneda, fecha, abrirModal, toast, mostrarError } from '../util.js';
import { mostrarFactura } from '../factura.js';
import { METODOS_ABONO, etiquetaPago, campoBilletera, botonesMetodo } from '../pagos.js';

function htmlHistorial(abonos) {
  if (!abonos.length) return '<p class="login-ayuda">Aún no hay abonos registrados.</p>';
  return `<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Fecha</th><th>Venta</th><th>Método</th><th class="der">Valor</th></tr></thead>
    <tbody>${abonos.map((a) => `<tr><td>${esc(fecha(a.fecha))}${a.tipo === 'inicial' ? ' <span class="badge">inicial</span>' : ''}</td>
      <td><button type="button" class="enlace" data-factura="${a.ventaId}">#${a.ventaId}</button></td>
      <td>${esc(etiquetaPago(a.metodoPago, a.billetera))}</td><td class="der">${moneda(a.monto)}</td></tr>`).join('')}</tbody></table></div>`;
}

function htmlFormulario({ ventas, saldoPendiente }, metodo) {
  if (saldoPendiente <= 0) return '<div class="estado-vacio"><strong>Este cliente está al día.</strong><span>No tiene saldo pendiente.</span></div>';
  return `
    <label for="ab-venta">Aplicar a</label>
    <select id="ab-venta" class="campo">
      <option value="">Ventas más antiguas primero (${moneda(saldoPendiente)})</option>
      ${ventas.map((v) => `<option value="${v.ventaId}">Venta #${v.ventaId} · ${esc(fecha(v.fecha))} · saldo ${moneda(v.saldo)}</option>`).join('')}
    </select>
    <label for="ab-monto">Valor del abono</label>
    <input id="ab-monto" class="campo" type="number" min="1" step="1" inputmode="numeric" placeholder="$0">
    <label>Método de pago</label>
    <div class="metodos tres">${botonesMetodo(METODOS_ABONO, metodo, 'data-metodo')}</div>
    <div id="ab-transf" class="${metodo === 'Transferencia' ? '' : 'oculto'}">${campoBilletera('ab-billetera')}</div>
    <div class="cambio saldo"><span>Saldo después del abono</span><strong id="ab-restante">${moneda(saldoPendiente)}</strong></div>
    <label for="ab-obs">Observación <small>(opcional)</small></label>
    <input id="ab-obs" class="campo" type="text" maxlength="300">
    <p id="ab-error" class="aviso-error oculto" role="alert"></p>
    <button type="button" id="ab-registrar" class="boton primario ancho">Registrar abono</button>`;
}

/** Abre el modal con el resumen del cliente. `alCambiar` se llama tras cada abono para refrescar la lista. */
export function abrirAbono(resumen, alCambiar) {
  const { cliente } = resumen;
  let metodo = 'Efectivo';
  let datos = resumen;

  const modal = abrirModal('<div id="ab-contenido"></div>', 'cobro-caja');
  const el = modal.el;

  function pintar() {
    $('#ab-contenido', el).innerHTML = `
      <span class="eyebrow">ABONO</span><h2>${esc(cliente.nombre)}</h2>
      <div class="resumen-cobro"><span>Saldo pendiente</span><strong>${moneda(datos.saldoPendiente)}</strong></div>
      ${htmlFormulario(datos, metodo)}
      <h3 class="subtitulo-modal">Historial de abonos</h3>${htmlHistorial(datos.abonos)}`;
  }

  const aviso = (t) => { const x = $('#ab-error', el); if (x) { x.textContent = t; x.classList.toggle('oculto', !t); } };
  // El tope del abono es el saldo de la venta elegida (o el saldo total si se aplica a las más antiguas).
  const topeActual = () => {
    const id = $('#ab-venta', el)?.value;
    const v = id ? datos.ventas.find((x) => String(x.ventaId) === id) : null;
    return v ? v.saldo : datos.saldoPendiente;
  };
  const pintarRestante = () => {
    const r = $('#ab-restante', el);
    if (r) r.textContent = moneda(Math.max(0, topeActual() - (Number($('#ab-monto', el).value) || 0)));
  };

  async function registrar() {
    aviso('');
    const monto = Number($('#ab-monto', el).value);
    if (!(monto > 0)) return aviso('Escribe un valor de abono mayor a 0.');
    if (monto > topeActual()) return aviso(`El abono no puede superar el saldo pendiente (${moneda(topeActual())}).`);
    const boton = $('#ab-registrar', el);
    boton.disabled = true;
    try {
      const ventaId = $('#ab-venta', el).value;
      datos = await post(`/cuentas-por-cobrar/clientes/${cliente.id}/abonos`, {
        monto,
        metodoPago: metodo,
        ...(metodo === 'Transferencia' ? { billetera: $('#ab-billetera', el).value.trim() || undefined } : {}),
        ...(ventaId ? { ventaId: Number(ventaId) } : {}),
        observacion: $('#ab-obs', el).value.trim() || undefined
      });
      toast(datos.saldoPendiente > 0
        ? `Abono registrado. Saldo pendiente: ${moneda(datos.saldoPendiente)}.`
        : 'Abono registrado. El cliente quedó al día.');
      pintar();
      alCambiar();
    } catch (err) {
      aviso(err.message);
      boton.disabled = false;
    }
  }

  el.addEventListener('input', (e) => { if (e.target.id === 'ab-monto') pintarRestante(); });
  el.addEventListener('change', (e) => { if (e.target.id === 'ab-venta') pintarRestante(); });
  el.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-metodo]');
    if (m) {
      metodo = m.dataset.metodo;
      el.querySelectorAll('[data-metodo]').forEach((x) => x.classList.toggle('activo', x === m));
      $('#ab-transf', el)?.classList.toggle('oculto', metodo !== 'Transferencia');
      return;
    }
    const f = e.target.closest('[data-factura]');
    if (f) {
      try { mostrarFactura(await get(`/ventas/${f.dataset.factura}`)); } catch (err) { mostrarError(err); }
      return;
    }
    if (e.target.closest('#ab-registrar')) await registrar();
  });

  pintar();
}
