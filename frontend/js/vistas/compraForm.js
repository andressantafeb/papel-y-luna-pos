// Formulario "Registrar compra": proveedor + varias líneas (producto, cantidad, costo unitario).
import { post } from '../api.js';
import { $, esc, moneda, abrirModal, toast, opciones } from '../util.js';

export function abrirFormCompra({ proveedores, productos, onGuardada }) {
  const lineas = []; // { productoId, nombre, cantidad, costoUnitario }
  const modal = abrirModal(`
    <span class="eyebrow">MERCANCÍA</span><h2>Registrar compra</h2>
    <ul class="errores" id="nc-errores"></ul>
    <label for="nc-prov">Proveedor *</label>
    <select id="nc-prov">${opciones(proveedores, 'id', 'nombre', '', 'Selecciona un proveedor')}</select>
    <label for="nc-prod">Agregar producto</label>
    <select id="nc-prod">${opciones(productos, 'id', (p) => `${p.nombre} (stock ${p.stock})`, '', 'Selecciona un producto')}</select>
    <div id="nc-lineas"></div>
    <div class="resumen-cobro" style="margin-top:12px"><span>Total de la compra</span><strong id="nc-total">$0</strong></div>
    <label for="nc-obs">Observación (opcional)</label><input id="nc-obs" type="text" maxlength="300">
    <div class="acciones-modal"><button type="button" class="boton secundario" id="nc-cancelar">Cancelar</button>
    <button type="button" class="boton primario" id="nc-guardar">Guardar compra</button></div>`);
  const el = modal.el;

  const pintarTotal = () => { $('#nc-total', el).textContent = moneda(lineas.reduce((s, l) => s + l.cantidad * l.costoUnitario, 0)); };
  const pintar = () => {
    $('#nc-lineas', el).innerHTML = lineas.map((l, i) => `
      <div class="linea-edit"><div><strong>${esc(l.nombre)}</strong><small>Cantidad y costo unitario</small></div>
        <span class="acciones"><input class="campo cant-input" type="number" min="1" step="1" value="${l.cantidad}" data-i="${i}" data-campo="cantidad" aria-label="Cantidad">
        <input class="campo cant-input" type="number" min="0" step="1" value="${l.costoUnitario}" data-i="${i}" data-campo="costoUnitario" aria-label="Costo unitario"></span>
        <button type="button" class="icono-boton" data-quitar="${i}" aria-label="Quitar">×</button></div>`).join('');
    pintarTotal();
  };

  $('#nc-prod', el).addEventListener('change', (e) => {
    const p = productos.find((x) => x.id === Number(e.target.value));
    e.target.value = '';
    if (!p) return;
    if (lineas.some((l) => l.productoId === p.id)) return toast('Ese producto ya está en la compra.', 'error');
    lineas.push({ productoId: p.id, nombre: p.nombre, cantidad: 1, costoUnitario: p.costo });
    pintar();
  });
  el.addEventListener('input', (e) => {
    const campo = e.target.dataset.campo;
    if (!campo) return;
    lineas[Number(e.target.dataset.i)][campo] = Number(e.target.value) || 0;
    pintarTotal();
  });
  el.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]');
    if (q) { lineas.splice(Number(q.dataset.quitar), 1); pintar(); }
  });
  $('#nc-cancelar', el).addEventListener('click', modal.cerrar);

  $('#nc-guardar', el).addEventListener('click', async (e) => {
    const errores = [];
    const proveedorId = Number($('#nc-prov', el).value);
    if (!proveedorId) errores.push('Selecciona un proveedor.');
    if (!lineas.length) errores.push('Agrega al menos un producto.');
    lineas.forEach((l) => {
      if (!(Number.isInteger(l.cantidad) && l.cantidad >= 1)) errores.push(`La cantidad de “${l.nombre}” debe ser un entero mayor a 0.`);
      if (!(l.costoUnitario >= 0)) errores.push(`El costo de “${l.nombre}” no puede ser negativo.`);
    });
    $('#nc-errores', el).innerHTML = errores.map((x) => `<li>${esc(x)}</li>`).join('');
    if (errores.length) return;
    e.target.disabled = true;
    try {
      const c = await post('/compras', {
        proveedorId,
        observacion: $('#nc-obs', el).value.trim() || undefined,
        items: lineas.map(({ productoId, cantidad, costoUnitario }) => ({ productoId, cantidad, costoUnitario }))
      });
      toast(`Compra #${c.id} registrada: ${moneda(c.total)}. El stock se actualizó${c.faltantesResueltos ? ` y ${c.faltantesResueltos} faltante(s) quedaron resueltos` : ''}.`);
      modal.cerrar();
      onGuardada();
    } catch (err) {
      $('#nc-errores', el).innerHTML = `<li>${esc(err.message)}</li>`;
      e.target.disabled = false;
    }
  });
}
