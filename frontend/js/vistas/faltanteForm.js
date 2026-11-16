// Registro de un faltante (producto solicitado que no está disponible). Lo usan cajero y administrador.
import { post } from '../api.js';
import { $, esc, abrirModal, toast, opciones } from '../util.js';

/** productos: lista para elegir un producto existente (agotado). proveedores: opcional (solo administrador). */
export function abrirFormFaltante({ productos = [], proveedores = [], nombreInicial = '', productoId = '', onGuardado }) {
  const modal = abrirModal(`
    <span class="eyebrow">DEMANDA NO ATENDIDA</span><h2>Registrar faltante</h2>
    <ul class="errores" id="fl-errores"></ul>
    <form id="fl-form" novalidate>
      <label for="fl-tipo">Tipo</label>
      <select id="fl-tipo">
        <option value="inexistente" ${productoId ? '' : 'selected'}>No registrado (no existe en el inventario)</option>
        <option value="agotado" ${productoId ? 'selected' : ''}>Agotado (existe pero no hay stock)</option>
      </select>
      <div id="fl-bloque-producto">
        <label for="fl-producto">Producto del inventario</label>
        <select id="fl-producto">${opciones(productos, 'id', (p) => `${p.nombre} (stock ${p.stock})`, productoId, 'Selecciona un producto')}</select>
      </div>
      <div id="fl-bloque-nombre">
        <label for="fl-nombre">Producto solicitado</label>
        <input id="fl-nombre" type="text" value="${esc(nombreInicial)}" placeholder="Ej. Cofias">
      </div>
      <label for="fl-cantidad">Cantidad solicitada</label>
      <input id="fl-cantidad" type="number" min="1" step="1" value="1">
      ${proveedores.length ? `<label for="fl-proveedor">Proveedor (opcional)</label>
      <select id="fl-proveedor">${opciones(proveedores, 'id', 'nombre', '', 'Sin proveedor')}</select>` : ''}
      <label for="fl-obs">Observación (opcional)</label>
      <input id="fl-obs" type="text" maxlength="300">
      <div class="acciones-modal">
        <button type="button" class="boton secundario" id="fl-cancelar">Cancelar</button>
        <button type="submit" class="boton primario">Registrar</button>
      </div>
    </form>`);

  const el = modal.el;
  const sincronizar = () => {
    const agotado = $('#fl-tipo', el).value === 'agotado';
    $('#fl-bloque-producto', el).classList.toggle('oculto', !agotado);
    $('#fl-bloque-nombre', el).classList.toggle('oculto', agotado);
  };
  $('#fl-tipo', el).addEventListener('change', sincronizar);
  sincronizar();
  $('#fl-cancelar', el).addEventListener('click', modal.cerrar);

  $('#fl-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = $('#fl-tipo', el).value;
    const cuerpo = { tipo, cantidad: Number($('#fl-cantidad', el).value), observacion: $('#fl-obs', el).value.trim() || null };
    const proveedor = $('#fl-proveedor', el);
    if (proveedor && proveedor.value) cuerpo.proveedorId = Number(proveedor.value);
    const errores = [];
    if (tipo === 'agotado') {
      if (!$('#fl-producto', el).value) errores.push('Selecciona el producto agotado.');
      cuerpo.productoId = Number($('#fl-producto', el).value);
    } else {
      cuerpo.nombreProducto = $('#fl-nombre', el).value.trim();
      if (!cuerpo.nombreProducto) errores.push('Escribe el nombre del producto solicitado.');
    }
    if (!(cuerpo.cantidad >= 1)) errores.push('La cantidad debe ser al menos 1.');
    const lista = $('#fl-errores', el);
    lista.innerHTML = errores.map((x) => `<li>${esc(x)}</li>`).join('');
    if (errores.length) return;

    const boton = $('button[type="submit"]', el);
    boton.disabled = true;
    try {
      const guardado = await post('/faltantes', cuerpo);
      toast('Faltante registrado correctamente.');
      modal.cerrar();
      if (onGuardado) onGuardado(guardado);
    } catch (err) {
      lista.innerHTML = `<li>${esc(err.message)}</li>`;
    } finally {
      boton.disabled = false;
    }
  });
}
