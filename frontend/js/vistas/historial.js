// Historial de ventas: filtros, detalle/factura y, para el administrador, corrección y reembolsos.
import { get, qs } from '../api.js';
import { $, esc, moneda, fecha, toast, mostrarError, opciones, vacio } from '../util.js';
import { mostrarFactura } from '../factura.js';
import { puente, irA } from '../puente.js';
import { abrirReembolso } from './reembolso.js';
import { METODOS_PAGO, etiquetaPago } from '../pagos.js';

export async function montar(cont, usuario) {
  const esAdmin = usuario.rol === 'administrador';
  const clientes = await get('/clientes');

  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">REGISTRO</span><h1>Historial de ventas</h1></div></div>
      <div class="filtros">
        <div><label for="h-desde">Desde</label><input class="campo" id="h-desde" type="date"></div>
        <div><label for="h-hasta">Hasta</label><input class="campo" id="h-hasta" type="date"></div>
        <div><label for="h-pago">Tipo de pago</label><select class="campo" id="h-pago">
          <option value="">Todos</option>${METODOS_PAGO.map((m) => `<option>${m}</option>`).join('')}</select></div>
        <div><label for="h-cliente">Cliente</label><select class="campo" id="h-cliente">${opciones(clientes, 'id', 'nombre', '', 'Todos')}</select></div>
        <div><label for="h-estado">Estado</label><select class="campo" id="h-estado">
          <option value="cerrada">Cerradas</option><option value="abierta">Guardadas</option><option value="">Todas</option></select></div>
      </div>
      <div id="h-lista" class="lista-historial"></div>
    </div>`;

  let ventas = [];
  async function cargar() {
    const lista = $('#h-lista', cont);
    lista.innerHTML = '<div class="cargando">Cargando…</div>';
    try {
      ventas = await get(`/ventas${qs({
        desde: $('#h-desde', cont).value, hasta: $('#h-hasta', cont).value, metodoPago: $('#h-pago', cont).value,
        clienteId: $('#h-cliente', cont).value, estado: $('#h-estado', cont).value
      })}`);
    } catch (err) { lista.innerHTML = vacio('No se pudo cargar el historial.', err.message); return; }
    lista.innerHTML = ventas.length ? ventas.map((v) => `
      <button type="button" class="venta-historial" data-id="${v.id}">
        <span><strong>#${v.id} · ${esc(fecha(v.cerradaEn || v.creadaEn))}</strong>
          <small>${esc(v.clienteNombre || 'Sin cliente')} · ${esc(etiquetaPago(v.metodoPago, v.billetera) || 'Sin cobrar')} · ${esc(v.usuarioNombre)}</small>
          <span>${v.estado === 'abierta' ? '<span class="badge aviso">Guardada</span>' : ''}
          ${v.corregida ? '<span class="badge aviso">Corregida</span>' : ''}
          ${v.metodoPago === 'Debe' ? (v.saldoPendiente > 0 ? `<span class="badge aviso">Saldo ${moneda(v.saldoPendiente)}</span>` : '<span class="badge ok">Pagada</span>') : ''}
          ${v.estadoReembolso !== 'ninguno' ? `<span class="badge error">Reembolso ${esc(v.estadoReembolso)}</span>` : ''}</span></span>
        <strong>${moneda(v.total)}</strong>
      </button>`).join('') : vacio('No hay ventas con esos filtros.', 'Cambia los filtros para ver más resultados.');
  }
  cont.querySelectorAll('.filtros input, .filtros select').forEach((c) => c.addEventListener('change', cargar));

  const corregir = (v) => { puente.correccion = v; irA('venta'); };

  // Tras reembolsar se refresca la lista y se muestra la factura actualizada (con su desglose).
  const reembolsar = (v) => abrirReembolso(v, (actualizada) => {
    cargar();
    mostrarFactura(actualizada, { esAdmin, onCorregir: corregir, onReembolsar: reembolsar });
  });

  function abrirDetalle(venta) {
    if (venta.estado === 'abierta') return toast('Esta venta está guardada. Retómala desde Nueva venta > Ventas guardadas.');
    mostrarFactura(venta, { esAdmin, onCorregir: corregir, onReembolsar: reembolsar });
  }

  $('#h-lista', cont).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    try { abrirDetalle(await get(`/ventas/${b.dataset.id}`)); } catch (err) { mostrarError(err); }
  });
  cargar();
}
