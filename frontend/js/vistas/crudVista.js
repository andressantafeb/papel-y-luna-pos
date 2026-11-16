// CRUD genérico (lista + formulario en modal + confirmación de borrado) para entidades simples.
import { get, post, put, del } from '../api.js';
import { $, esc, abrirModal, toast, mostrarError, confirmar, vacio } from '../util.js';

/**
 * Configuración:
 *  - cont, titulo, eyebrow, ruta (ej. '/clientes'), singular ('cliente')
 *  - campos: [{ id, etiqueta, requerido, tipo('text'|'number'|'select'|'color'), opciones:[{valor,texto}], min, step, defecto }]
 *  - columnas: [{ titulo, valor(fila) -> html seguro }]
 *  - alGuardar(cuerpo) opcional: transforma el cuerpo antes de enviarlo
 */
export function crearCrudVista({ cont, titulo, eyebrow, ruta, singular, campos, columnas, alGuardar, extra = '' }) {
  let filas = [];
  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(titulo)}</h1></div>
        <button type="button" class="boton primario" data-nuevo>+ Nuevo ${esc(singular)}</button></div>
      ${extra}
      <div class="panel tabla-scroll" data-tabla></div>
    </div>`;

  const pintar = () => {
    $('[data-tabla]', cont).innerHTML = filas.length ? `<table class="tabla">
      <thead><tr>${columnas.map((c) => `<th>${esc(c.titulo)}</th>`).join('')}<th class="der">Acciones</th></tr></thead>
      <tbody>${filas.map((f) => `<tr>${columnas.map((c) => `<td>${c.valor(f)}</td>`).join('')}
        <td class="der"><span class="acciones" style="justify-content:flex-end">
        <button type="button" class="boton secundario" data-editar="${f.id}">Editar</button>
        <button type="button" class="boton peligro" data-eliminar="${f.id}">Eliminar</button></span></td></tr>`).join('')}</tbody>
    </table>` : vacio(`Aún no hay ${singular}s registrados.`, `Crea el primero con “Nuevo ${singular}”.`);
  };

  async function cargar() {
    try { filas = await get(ruta); pintar(); }
    catch (err) { $('[data-tabla]', cont).innerHTML = vacio('No se pudo cargar la lista.', err.message); }
  }

  function campoHtml(c, valor) {
    const v = valor ?? c.defecto ?? '';
    if (c.tipo === 'select') {
      return `<select id="cr-${c.id}">${c.opciones.map((o) => `<option value="${esc(o.valor)}" ${String(o.valor) === String(v) ? 'selected' : ''}>${esc(o.texto)}</option>`).join('')}</select>`;
    }
    const tipo = c.tipo || 'text';
    const attrs = tipo === 'number' ? `min="${c.min ?? 0}" step="${c.step ?? 1}"` : '';
    return `<input id="cr-${c.id}" type="${tipo}" ${attrs} value="${esc(v)}" ${c.requerido ? 'required' : ''}>`;
  }

  function abrirForm(fila) {
    const modal = abrirModal(`
      <span class="eyebrow">${esc(eyebrow)}</span><h2>${fila ? 'Editar' : 'Nuevo'} ${esc(singular)}</h2>
      <ul class="errores" data-errores></ul>
      <form novalidate>${campos.map((c) => `<label for="cr-${c.id}">${esc(c.etiqueta)}${c.requerido ? ' *' : ''}</label>${campoHtml(c, fila && fila[c.id])}`).join('')}
        <div class="acciones-modal"><button type="button" class="boton secundario" data-cancelar>Cancelar</button>
        <button type="submit" class="boton primario">Guardar</button></div></form>`);
    const el = modal.el;
    $('[data-cancelar]', el).addEventListener('click', modal.cerrar);
    $('form', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const errores = [];
      let cuerpo = {};
      campos.forEach((c) => {
        const valor = $(`#cr-${c.id}`, el).value.trim();
        if (c.requerido && !valor) errores.push(`${c.etiqueta} es obligatorio.`);
        cuerpo[c.id] = c.tipo === 'number' ? (valor === '' ? '' : Number(valor)) : valor;
      });
      $('[data-errores]', el).innerHTML = errores.map((x) => `<li>${esc(x)}</li>`).join('');
      if (errores.length) return;
      if (alGuardar) cuerpo = alGuardar(cuerpo);
      const boton = $('button[type="submit"]', el);
      boton.disabled = true;
      try {
        if (fila) await put(`${ruta}/${fila.id}`, cuerpo); else await post(ruta, cuerpo);
        toast(`${fila ? 'Cambios guardados' : 'Registro creado'} correctamente.`);
        modal.cerrar();
        cargar();
      } catch (err) {
        $('[data-errores]', el).innerHTML = `<li>${esc(err.message)}</li>`;
      } finally { boton.disabled = false; }
    });
  }

  $('[data-nuevo]', cont).addEventListener('click', () => abrirForm(null));
  $('[data-tabla]', cont).addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-editar]');
    const el = e.target.closest('[data-eliminar]');
    if (ed) abrirForm(filas.find((f) => f.id === Number(ed.dataset.editar)));
    if (el) {
      const f = filas.find((x) => x.id === Number(el.dataset.eliminar));
      if (!await confirmar(`Eliminar ${singular}`, `¿Eliminar “${f.nombre}”? Esta acción no se puede deshacer.`, { textoOk: 'Eliminar', peligro: true })) return;
      try { await del(`${ruta}/${f.id}`); toast(`${singular[0].toUpperCase()}${singular.slice(1)} eliminado correctamente.`); cargar(); }
      catch (err) { mostrarError(err); }
    }
  });
  return { cargar };
}
