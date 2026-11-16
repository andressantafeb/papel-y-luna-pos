// Compras (administrador): registrar con varios productos, listar con filtros y ver detalle.
import { get, qs } from '../api.js';
import { $, esc, moneda, fecha, abrirModal, mostrarError, opciones, vacio } from '../util.js';
import { abrirFormCompra } from './compraForm.js';

export async function montar(cont) {
  const [proveedores, productos] = await Promise.all([get('/proveedores'), get('/productos')]);

  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">MERCANCÍA</span><h1>Compras</h1></div>
        <button type="button" class="boton primario" id="cp-nueva">+ Registrar compra</button></div>
      <div class="filtros">
        <div><label for="cp-prov">Proveedor</label><select class="campo" id="cp-prov">${opciones(proveedores, 'id', 'nombre', '', 'Todos')}</select></div>
        <div><label for="cp-desde">Desde</label><input class="campo" id="cp-desde" type="date"></div>
        <div><label for="cp-hasta">Hasta</label><input class="campo" id="cp-hasta" type="date"></div>
      </div>
      <div id="cp-lista" class="lista-historial"></div>
    </div>`;

  async function cargar() {
    const lista = $('#cp-lista', cont);
    try {
      const compras = await get(`/compras${qs({ proveedorId: $('#cp-prov', cont).value, desde: $('#cp-desde', cont).value, hasta: $('#cp-hasta', cont).value })}`);
      lista.innerHTML = compras.length ? compras.map((c) => `
        <button type="button" class="venta-historial" data-id="${c.id}">
          <span><strong>Compra #${c.id} · ${esc(c.proveedor)}</strong><small>${esc(fecha(c.fecha))} · ${esc(c.usuario)}</small></span>
          <strong>${moneda(c.total)}</strong></button>`).join('')
        : vacio('No hay compras con esos filtros.', 'Registra una compra para sumar stock.');
    } catch (err) { lista.innerHTML = vacio('No se pudo cargar.', err.message); }
  }
  cont.querySelectorAll('.filtros select, .filtros input').forEach((c) => c.addEventListener('change', cargar));

  $('#cp-lista', cont).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    try {
      const c = await get(`/compras/${b.dataset.id}`);
      abrirModal(`<span class="eyebrow">DETALLE</span><h2>Compra #${c.id}</h2>
        <p class="login-ayuda">${esc(c.proveedor)} · ${esc(fecha(c.fecha))} · registrada por ${esc(c.usuario)}</p>
        <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Producto</th><th class="der">Cant.</th><th class="der">Costo</th><th class="der">Subtotal</th></tr></thead>
        <tbody>${c.items.map((i) => `<tr><td>${esc(i.nombre)}</td><td class="der">${i.cantidad}</td><td class="der">${moneda(i.costoUnitario)}</td><td class="der">${moneda(i.subtotal)}</td></tr>`).join('')}</tbody></table></div>
        <div class="factura-total"><span>Total</span><strong>${moneda(c.total)}</strong></div>
        ${c.observacion ? `<p class="login-ayuda">${esc(c.observacion)}</p>` : ''}`);
    } catch (err) { mostrarError(err); }
  });

  $('#cp-nueva', cont).addEventListener('click', () => abrirFormCompra({
    proveedores,
    productos,
    onGuardada: async () => {
      cargar();
      // El stock y el costo cambiaron: se refresca la lista usada por el formulario.
      productos.splice(0, productos.length, ...await get('/productos'));
    }
  }));
  cargar();
}
