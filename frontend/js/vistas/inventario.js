// Inventario (administrador): existencias, kardex por producto y ajustes manuales de stock.
import { get } from '../api.js';
import { $, esc, moneda, vacio } from '../util.js';
import { verKardex, ajustarStock } from './inventarioModales.js';

export async function montar(cont) {
  let productos = [];

  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">STOCK</span><h1>Inventario</h1></div></div>
      <div class="kpis" id="in-kpis"></div>
      <div class="filtros">
        <div style="grid-column:span 2"><label for="in-buscar">Buscar</label><input class="campo" id="in-buscar" type="search" placeholder="Nombre o código" autocomplete="off"></div>
        <div><label for="in-solo">Mostrar</label><select class="campo" id="in-solo"><option value="">Todos</option><option value="bajo">Stock bajo (5 o menos)</option><option value="agotado">Agotados</option></select></div>
      </div>
      <div class="panel tabla-scroll" id="in-tabla"></div>
    </div>`;

  function pintar() {
    const t = $('#in-buscar', cont).value.trim().toLowerCase();
    const solo = $('#in-solo', cont).value;
    const seguidos = productos.filter((p) => p.seguimientoInventario);
    $('#in-kpis', cont).innerHTML = `
      <div class="kpi"><span>Productos con seguimiento</span><strong>${seguidos.length}</strong></div>
      <div class="kpi"><span>Unidades en stock</span><strong>${seguidos.reduce((s, p) => s + p.stock, 0)}</strong></div>
      <div class="kpi"><span>Stock bajo (≤ 5)</span><strong>${seguidos.filter((p) => p.stock > 0 && p.stock <= 5).length}</strong></div>
      <div class="kpi"><span>Agotados</span><strong>${seguidos.filter((p) => p.stock === 0).length}</strong></div>
      <div class="kpi"><span>Valor a costo</span><strong>${moneda(seguidos.reduce((s, p) => s + p.stock * p.costo, 0))}</strong></div>`;
    const lista = productos.filter((p) => (!t || `${p.nombre} ${p.codigoInterno || ''}`.toLowerCase().includes(t))
      && (solo === '' || (p.seguimientoInventario && (solo === 'agotado' ? p.stock === 0 : p.stock <= 5))));
    $('#in-tabla', cont).innerHTML = lista.length ? `<table class="tabla">
      <thead><tr><th>Producto</th><th>Código</th><th class="der">Stock</th><th class="der">Costo</th><th></th></tr></thead>
      <tbody>${lista.map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.codigoInterno || '—')}</td>
        <td class="der">${p.seguimientoInventario ? `<span class="badge ${p.stock === 0 ? 'error' : p.stock <= 5 ? 'aviso' : 'ok'}">${p.stock}</span>` : 'Sin seguimiento'}</td>
        <td class="der">${moneda(p.costo)}</td>
        <td class="der"><span class="acciones" style="justify-content:flex-end"><button type="button" class="boton secundario" data-kardex="${p.id}">Movimientos</button>
        ${p.seguimientoInventario ? `<button type="button" class="boton secundario" data-ajustar="${p.id}">Ajustar</button>` : ''}</span></td></tr>`).join('')}</tbody></table>`
      : vacio('No hay productos con ese filtro.');
  }

  async function cargar() {
    try { productos = await get('/productos'); pintar(); }
    catch (err) { $('#in-tabla', cont).innerHTML = vacio('No se pudo cargar.', err.message); }
  }

  $('#in-tabla', cont).addEventListener('click', (e) => {
    const k = e.target.closest('[data-kardex]');
    const a = e.target.closest('[data-ajustar]');
    if (k) verKardex(k.dataset.kardex);
    if (a) ajustarStock(productos.find((p) => p.id === Number(a.dataset.ajustar)), cargar);
  });
  $('#in-buscar', cont).addEventListener('input', pintar);
  $('#in-solo', cont).addEventListener('change', pintar);
  cargar();
}
