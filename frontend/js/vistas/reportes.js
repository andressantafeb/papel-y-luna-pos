// Reportes (administrador): ventas, productos más vendidos, compras y faltantes frecuentes.
import { get, qs } from '../api.js';
import { $, esc, moneda, fecha, hoy, vacio } from '../util.js';

export async function montar(cont) {
  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">ANÁLISIS</span><h1>Reportes</h1></div></div>
      <div class="filtros">
        <div><label for="rp-desde">Desde</label><input class="campo" id="rp-desde" type="date" value="${hoy()}"></div>
        <div><label for="rp-hasta">Hasta</label><input class="campo" id="rp-hasta" type="date" value="${hoy()}"></div>
        <div><button type="button" class="boton primario ancho" id="rp-aplicar" style="margin:0;height:44px">Generar reportes</button></div>
      </div>
      <div id="rp-error" class="aviso-error oculto"></div>
      <div id="rp-ventas"></div><div id="rp-productos"></div><div id="rp-compras"></div><div id="rp-faltantes"></div>
    </div>`;

  const tabla = (cabeceras, filas) => `<div class="tabla-scroll"><table class="tabla"><thead><tr>${cabeceras.map((c) => `<th class="${c.der ? 'der' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`;

  function pintarVentas(r) {
    $('#rp-ventas', cont).innerHTML = `<div class="panel"><h3>Ventas (${esc(r.desde)} a ${esc(r.hasta)})</h3>
      <div class="kpis"><div class="kpi"><span>Total vendido</span><strong>${moneda(r.totalVendido)}</strong></div>
      <div class="kpi"><span>Número de ventas</span><strong>${r.numeroVentas}</strong></div>
      <div class="kpi"><span>Reembolsos (${r.reembolsos.cantidad})</span><strong>${moneda(r.reembolsos.total)}</strong></div>
      <div class="kpi"><span>Total neto</span><strong>${moneda(r.totalNeto)}</strong></div>
      <div class="kpi"><span>Abonos recibidos (${r.abonos.numeroPagos})</span><strong>${moneda(r.abonos.total)}</strong></div>
      <div class="kpi"><span>Total por cobrar (cartera)</span><strong>${moneda(r.totalPorCobrar)}</strong></div></div>
      ${r.abonos.porMetodoPago.length ? `<p class="login-ayuda">Abonos del periodo: ${r.abonos.porMetodoPago.map((m) => `${esc(m.metodoPago)} ${moneda(m.total)}`).join(' · ')}</p>` : ''}
      ${r.porMetodoPago.length ? tabla([{ t: 'Método de pago' }, { t: 'Ventas', der: true }, { t: 'Total', der: true }],
    r.porMetodoPago.map((m) => `<tr><td>${esc(m.metodoPago)}</td><td class="der">${m.ventas}</td><td class="der">${moneda(m.total)}</td></tr>`)) : vacio('No hubo ventas en este rango.')}</div>`;
  }
  function pintarProductos(r) {
    $('#rp-productos', cont).innerHTML = `<div class="panel"><h3>Productos más vendidos</h3>${r.productos.length
      ? tabla([{ t: 'Producto' }, { t: 'Unidades', der: true }, { t: 'Total vendido', der: true }],
        r.productos.map((p) => `<tr><td>${esc(p.producto)}</td><td class="der">${p.unidades}</td><td class="der">${moneda(p.totalVendido)}</td></tr>`))
      : vacio('Sin ventas en este rango.')}</div>`;
  }
  function pintarCompras(r) {
    $('#rp-compras', cont).innerHTML = `<div class="panel"><h3>Compras registradas</h3>
      <div class="kpis"><div class="kpi"><span>Total comprado</span><strong>${moneda(r.totalComprado)}</strong></div>
      <div class="kpi"><span>Número de compras</span><strong>${r.numeroCompras}</strong></div></div>
      ${r.porProveedor.length ? tabla([{ t: 'Proveedor' }, { t: 'Compras', der: true }, { t: 'Total', der: true }],
    r.porProveedor.map((p) => `<tr><td>${esc(p.proveedor)}</td><td class="der">${p.compras}</td><td class="der">${moneda(p.total)}</td></tr>`)) : vacio('No hubo compras en este rango.')}</div>`;
  }
  function pintarFaltantes(r) {
    $('#rp-faltantes', cont).innerHTML = `<div class="panel"><h3>Faltantes frecuentes</h3><p class="login-ayuda">No depende del rango de fechas.</p>${r.faltantes.length
      ? tabla([{ t: 'Producto' }, { t: 'Solicitudes', der: true }, { t: 'Unidades', der: true }, { t: 'Última' }, { t: 'Estado' }],
        r.faltantes.map((f) => `<tr><td>${esc(f.producto)}</td><td class="der">${f.solicitudes}</td><td class="der">${f.cantidadTotal}</td><td>${esc(fecha(f.ultimaSolicitud))}</td><td><span class="badge ${f.estado === 'resuelto' ? 'ok' : 'aviso'}">${esc(f.estado)}</span></td></tr>`))
      : vacio('Aún no hay faltantes registrados.')}</div>`;
  }

  async function generar() {
    const error = $('#rp-error', cont);
    error.classList.add('oculto');
    const rango = qs({ desde: $('#rp-desde', cont).value, hasta: $('#rp-hasta', cont).value });
    const boton = $('#rp-aplicar', cont);
    boton.disabled = true;
    try {
      const [v, p, c, f] = await Promise.all([get(`/reportes/ventas${rango}`), get(`/reportes/productos-mas-vendidos${rango}`), get(`/reportes/compras${rango}`), get('/reportes/faltantes')]);
      pintarVentas(v); pintarProductos(p); pintarCompras(c); pintarFaltantes(f);
    } catch (err) { error.textContent = err.message; error.classList.remove('oculto'); }
    finally { boton.disabled = false; }
  }
  $('#rp-aplicar', cont).addEventListener('click', generar);
  generar();
}
