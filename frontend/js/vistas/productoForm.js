// Formulario de producto (crear / editar). Se reutiliza en la edición "en caliente" desde la venta.
import { post, put } from '../api.js';
import { $, esc, abrirModal, toast, opciones } from '../util.js';

export function abrirFormProducto({ producto = null, categorias = [], onGuardado }) {
  const editar = Boolean(producto);
  const p = producto || {};
  const modal = abrirModal(`
    <span class="eyebrow">INVENTARIO</span>
    <h2>${editar ? 'Editar producto' : 'Nuevo producto'}</h2>
    <ul class="errores" id="pf-errores"></ul>
    <form id="pf-form" novalidate>
      <label for="pf-nombre">Nombre *</label>
      <input id="pf-nombre" type="text" value="${esc(p.nombre)}" required>
      <label for="pf-categoria">Categoría</label>
      <select id="pf-categoria">${opciones(categorias, 'id', 'nombre', p.categoriaId, 'Sin categoría')}</select>
      <div class="form-grid">
        <div><label for="pf-precio">Precio *</label><input id="pf-precio" type="number" min="0" step="1" value="${esc(p.precio ?? '')}" required></div>
        <div><label for="pf-costo">Costo *</label><input id="pf-costo" type="number" min="0" step="1" value="${esc(p.costo ?? 0)}" required></div>
      </div>
      <label for="pf-codigo">Código interno</label>
      <input id="pf-codigo" type="text" value="${esc(p.codigoInterno)}">
      <label class="check-row"><input id="pf-seguimiento" type="checkbox" ${p.seguimientoInventario === false ? '' : 'checked'}><span>Seguimiento de inventario</span></label>
      <label for="pf-stock">${editar ? 'Stock actual (se modifica con compras o ajustes)' : 'Stock inicial'}</label>
      <input id="pf-stock" type="number" min="0" step="1" value="${esc(p.stock ?? 0)}" ${editar ? 'disabled' : ''}>
      <div class="acciones-modal">
        <button type="button" class="boton secundario" id="pf-cancelar">Cancelar</button>
        <button type="submit" class="boton primario">Guardar producto</button>
      </div>
    </form>`);

  const el = modal.el;
  const stock = $('#pf-stock', el);
  const seguimiento = $('#pf-seguimiento', el);
  const sincronizar = () => { if (!editar) stock.disabled = !seguimiento.checked; };
  seguimiento.addEventListener('change', sincronizar);
  sincronizar();
  $('#pf-cancelar', el).addEventListener('click', modal.cerrar);

  $('#pf-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const errores = [];
    const nombre = $('#pf-nombre', el).value.trim();
    const precio = $('#pf-precio', el).value;
    const costo = $('#pf-costo', el).value;
    if (!nombre) errores.push('El nombre es obligatorio.');
    if (precio === '' || Number(precio) < 0) errores.push('El precio debe ser un número no negativo.');
    if (costo === '' || Number(costo) < 0) errores.push('El costo debe ser un número no negativo.');
    if (!editar && seguimiento.checked && (stock.value === '' || Number(stock.value) < 0)) errores.push('El stock debe ser un número no negativo.');
    const lista = $('#pf-errores', el);
    lista.innerHTML = errores.map((x) => `<li>${esc(x)}</li>`).join('');
    if (errores.length) return;

    const cuerpo = {
      nombre,
      categoriaId: $('#pf-categoria', el).value || null,
      precio: Number(precio),
      costo: Number(costo),
      codigoInterno: $('#pf-codigo', el).value.trim() || null,
      seguimientoInventario: seguimiento.checked
    };
    if (!editar) cuerpo.stock = seguimiento.checked ? Number(stock.value || 0) : 0;

    const boton = $('button[type="submit"]', el);
    boton.disabled = true;
    try {
      const guardado = editar ? await put(`/productos/${p.id}`, cuerpo) : await post('/productos', cuerpo);
      toast(editar ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.');
      modal.cerrar();
      if (onGuardado) onGuardado(guardado);
    } catch (error) {
      lista.innerHTML = `<li>${esc(error.message)}</li>`;
    } finally {
      boton.disabled = false;
    }
  });
}
