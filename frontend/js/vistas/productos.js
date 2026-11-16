// Productos: cajero consulta y edita en caliente; administrador además crea y elimina.
import { get, del } from '../api.js';
import { $, esc, moneda, toast, mostrarError, opciones, confirmar, vacio } from '../util.js';
import { abrirFormProducto } from './productoForm.js';

export async function montar(cont, usuario) {
  const esAdmin = usuario.rol === 'administrador';
  const categorias = await get('/categorias');
  let productos = [];

  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">INVENTARIO</span><h1>Productos</h1></div>
        ${esAdmin ? '<button type="button" class="boton primario" id="pr-nuevo">+ Nuevo producto</button>' : ''}</div>
      <div class="filtros">
        <div style="grid-column:span 2"><label for="pr-buscar">Buscar</label><input class="campo" id="pr-buscar" type="search" placeholder="Nombre o código" autocomplete="off"></div>
        <div><label for="pr-cat">Categoría</label><select class="campo" id="pr-cat">${opciones(categorias, 'id', 'nombre', '', 'Todas')}</select></div>
      </div>
      <div id="pr-lista" class="lista-admin-productos"></div>
    </div>`;

  const pintar = () => {
    const lista = $('#pr-lista', cont);
    lista.innerHTML = productos.length ? productos.map((p) => `
      <div class="admin-producto">
        <div><strong>${esc(p.nombre)}</strong>
          <small>${esc(p.categoria || 'Sin categoría')} · ${esc(p.codigoInterno || 'sin código')}${p.seguimientoInventario ? '' : ' · sin seguimiento'}</small></div>
        <div class="admin-producto-datos">
          <span>Precio <strong>${moneda(p.precio)}</strong></span><span>Costo <strong>${moneda(p.costo)}</strong></span>
          <span>Stock <strong>${p.seguimientoInventario ? p.stock : '—'}</strong></span></div>
        <div class="acciones">${esAdmin ? `<button type="button" class="boton secundario" data-editar="${p.id}">Editar</button>` : ''}
          ${esAdmin ? `<button type="button" class="boton peligro" data-eliminar="${p.id}">Eliminar</button>` : ''}</div>
      </div>`).join('') : vacio('No se encontraron productos.', 'Prueba otra búsqueda.');
  };

  async function cargar() {
    const q = $('#pr-buscar', cont).value.trim();
    const cat = $('#pr-cat', cont).value;
    try { productos = await get(`/productos?${new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { categoriaId: cat } : {}) })}`); pintar(); }
    catch (err) { $('#pr-lista', cont).innerHTML = vacio('No se pudo cargar.', err.message); }
  }

  let temporizador;
  $('#pr-buscar', cont).addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(cargar, 250); });
  $('#pr-cat', cont).addEventListener('change', cargar);
  if (esAdmin) $('#pr-nuevo', cont).addEventListener('click', () => abrirFormProducto({ categorias, onGuardado: cargar }));

  $('#pr-lista', cont).addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-editar]');
    const el = e.target.closest('[data-eliminar]');
    if (ed && esAdmin) abrirFormProducto({ producto: productos.find((p) => p.id === Number(ed.dataset.editar)), categorias, onGuardado: cargar });
    if (el) {
      const p = productos.find((x) => x.id === Number(el.dataset.eliminar));
      if (!await confirmar('Eliminar producto', `¿Eliminar “${p.nombre}”? Esta acción no se puede deshacer.`, { textoOk: 'Eliminar', peligro: true })) return;
      try { await del(`/productos/${p.id}`); toast('Producto eliminado correctamente.'); cargar(); } catch (err) { mostrarError(err); }
    }
  });
  cargar();
}
