// Ventanas del módulo de inventario: kardex de un producto y ajuste manual de stock.
import { get, post } from '../api.js';
import { $, esc, fecha, abrirModal, toast, mostrarError, vacio } from '../util.js';

const TIPOS = { inicial: 'Inicial', venta: 'Venta', correccion: 'Corrección', reembolso: 'Reembolso', compra: 'Compra', ajuste: 'Ajuste' };

export async function verKardex(id) {
  try {
    const { producto, movimientos } = await get(`/inventario/productos/${id}/movimientos`);
    abrirModal(`<span class="eyebrow">KARDEX</span><h2>${esc(producto.nombre)}</h2>
      <p class="login-ayuda">Stock actual: <strong>${producto.stock}</strong></p>
      <div class="tabla-scroll">${movimientos.length ? `<table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th class="der">Cant.</th><th class="der">Stock</th><th>Usuario</th></tr></thead>
      <tbody>${movimientos.map((m) => `<tr><td>${esc(fecha(m.fecha))}</td><td>${esc(TIPOS[m.tipo] || m.tipo)}${m.nota ? `<br><small>${esc(m.nota)}</small>` : ''}</td>
      <td class="der"><strong style="color:${m.cantidad > 0 ? 'var(--verde)' : 'var(--rojo)'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</strong></td>
      <td class="der">${m.stockResultante}</td><td>${esc(m.usuario || '—')}</td></tr>`).join('')}</tbody></table>` : vacio('Sin movimientos.')}</div>`, 'factura-caja');
  } catch (err) { mostrarError(err); }
}

export function ajustarStock(producto, onListo) {
  const modal = abrirModal(`<span class="eyebrow">AJUSTE MANUAL</span><h2>${esc(producto.nombre)}</h2>
    <p class="login-ayuda">Stock actual: <strong>${producto.stock}</strong>. Usa un número negativo para restar (merma) y positivo para sumar.</p>
    <ul class="errores" id="aj-err"></ul>
    <label for="aj-cant">Cantidad del ajuste</label><input id="aj-cant" type="number" step="1" placeholder="Ej. -3 o 5">
    <label for="aj-nota">Motivo *</label><input id="aj-nota" type="text" maxlength="300" placeholder="Ej. Conteo físico, merma, daño">
    <div class="acciones-modal"><button type="button" class="boton secundario" id="aj-cancelar">Cancelar</button>
    <button type="button" class="boton primario" id="aj-ok">Aplicar ajuste</button></div>`);
  const el = modal.el;
  $('#aj-cancelar', el).addEventListener('click', modal.cerrar);
  $('#aj-ok', el).addEventListener('click', async (e) => {
    const cantidad = Math.trunc(Number($('#aj-cant', el).value));
    const nota = $('#aj-nota', el).value.trim();
    const errores = [];
    if (!cantidad) errores.push('Indica una cantidad distinta de cero.');
    if (!nota) errores.push('Escribe el motivo del ajuste.');
    $('#aj-err', el).innerHTML = errores.map((x) => `<li>${esc(x)}</li>`).join('');
    if (errores.length) return;
    e.target.disabled = true;
    try {
      await post('/inventario/ajustes', { productoId: producto.id, cantidad, nota });
      toast('Ajuste aplicado correctamente.');
      modal.cerrar();
      onListo();
    } catch (err) {
      $('#aj-err', el).innerHTML = `<li>${esc(err.message)}</li>`;
      e.target.disabled = false;
    }
  });
}
