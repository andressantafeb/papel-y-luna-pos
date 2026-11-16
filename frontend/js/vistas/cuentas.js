// Cuentas por cobrar: clientes con saldo pendiente y registro de abonos (administrador y cajero).
import { get } from '../api.js';
import { $, esc, moneda, fecha, mostrarError, vacio } from '../util.js';
import { abrirAbono } from './abonoModal.js';

export async function montar(cont) {
  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">CARTERA</span><h1>Cuentas por cobrar</h1></div></div>
      <div id="cc-kpis"></div>
      <div id="cc-lista"></div>
    </div>`;

  async function cargar() {
    const lista = $('#cc-lista', cont);
    let datos;
    try {
      datos = await get('/cuentas-por-cobrar');
    } catch (err) { lista.innerHTML = vacio('No se pudo cargar la cartera.', err.message); return; }

    $('#cc-kpis', cont).innerHTML = `<div class="kpis">
      <div class="kpi"><span>Total por cobrar</span><strong>${moneda(datos.totalPorCobrar)}</strong></div>
      <div class="kpi"><span>Clientes con deuda</span><strong>${datos.clientes.length}</strong></div></div>`;

    lista.innerHTML = datos.clientes.length ? `<div class="panel"><div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Cliente</th><th>Teléfono</th><th class="der">Ventas</th><th>Deuda desde</th><th class="der">Saldo</th><th></th></tr></thead>
      <tbody>${datos.clientes.map((c) => `<tr>
        <td><strong>${esc(c.nombre)}</strong></td><td>${esc(c.telefono || '—')}</td>
        <td class="der">${c.ventasPendientes}</td><td>${esc(fecha(c.deudaDesde))}</td>
        <td class="der"><strong>${moneda(c.saldoPendiente)}</strong></td>
        <td class="der"><button type="button" class="boton primario chico" data-cliente="${c.clienteId}">Abonar</button></td>
      </tr>`).join('')}</tbody></table></div></div>`
      : vacio('No hay clientes con saldo pendiente.', 'Las ventas a "Debe" aparecerán aquí hasta que se paguen.');
  }

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cliente]');
    if (!b) return;
    b.disabled = true;
    try { abrirAbono(await get(`/cuentas-por-cobrar/clientes/${b.dataset.cliente}`), cargar); }
    catch (err) { mostrarError(err); } finally { b.disabled = false; }
  });

  await cargar();
}
