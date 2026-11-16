// Faltantes (demanda no atendida): registrar, filtrar, resolver y ver el resumen para compras.
import { get, put, qs } from '../api.js';
import { $, esc, fecha, toast, mostrarError, opciones, vacio } from '../util.js';
import { abrirFormFaltante } from './faltanteForm.js';

export async function montar(cont, usuario) {
  const esAdmin = usuario.rol === 'administrador';
  const [productos, proveedores] = await Promise.all([get('/productos'), esAdmin ? get('/proveedores') : Promise.resolve([])]);
  let pestana = 'lista';

  cont.innerHTML = `
    <div class="pagina-admin">
      <div class="vista-titulo"><div><span class="eyebrow">DEMANDA NO ATENDIDA</span><h1>Faltantes</h1></div>
        <button type="button" class="boton primario" id="fl-nuevo">+ Registrar faltante</button></div>
      <div class="pestanas">
        <button type="button" class="chip activo" data-tab="lista">Solicitudes</button>
        <button type="button" class="chip" data-tab="resumen">Resumen para compras</button>
      </div>
      <div id="fl-filtros" class="filtros">
        <div><label for="f-tipo">Tipo</label><select class="campo" id="f-tipo"><option value="">Todos</option><option value="inexistente">No registrado</option><option value="agotado">Agotado</option></select></div>
        <div><label for="f-estado">Estado</label><select class="campo" id="f-estado"><option value="">Todos</option><option value="pendiente" selected>Pendiente</option><option value="resuelto">Resuelto</option></select></div>
        ${esAdmin ? `<div><label for="f-prov">Proveedor</label><select class="campo" id="f-prov">${opciones(proveedores, 'id', 'nombre', '', 'Todos')}</select></div>` : ''}
      </div>
      <div id="fl-contenido" class="panel tabla-scroll"></div>
    </div>`;

  const cuerpo = $('#fl-contenido', cont);

  async function cargarLista() {
    try {
      const filas = await get(`/faltantes${qs({ tipo: $('#f-tipo', cont).value, estado: $('#f-estado', cont).value, proveedorId: esAdmin ? $('#f-prov', cont).value : '' })}`);
      cuerpo.innerHTML = filas.length ? `<table class="tabla"><thead><tr><th>Producto</th><th>Cant.</th><th>Tipo</th><th>Proveedor</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
        <tbody>${filas.map((f) => `<tr><td>${esc(f.producto)}${f.observacion ? `<br><small>${esc(f.observacion)}</small>` : ''}</td><td>${f.cantidad}</td>
        <td>${f.tipo === 'agotado' ? 'Agotado' : 'No registrado'}</td><td>${esc(f.proveedor || '—')}</td><td>${esc(fecha(f.fecha))}</td>
        <td><span class="badge ${f.estado === 'resuelto' ? 'ok' : 'aviso'}">${esc(f.estado)}</span></td>
        <td class="der">${f.estado === 'pendiente' ? `<button type="button" class="boton secundario" data-resolver="${f.id}">Marcar resuelto</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : vacio('No hay faltantes con esos filtros.', 'Registra los productos que los clientes piden y no tienes.');
    } catch (err) { cuerpo.innerHTML = vacio('No se pudo cargar.', err.message); }
  }

  async function cargarResumen() {
    try {
      const filas = await get('/faltantes/resumen');
      cuerpo.innerHTML = filas.length ? `<table class="tabla"><thead><tr><th>Producto</th><th>Proveedor</th><th class="der">Solicitudes</th><th class="der">Unidades</th><th>Última</th></tr></thead>
        <tbody>${filas.map((f) => `<tr><td>${esc(f.producto)}</td><td>${esc(f.proveedor || '—')}</td><td class="der">${f.solicitudes}</td>
        <td class="der">${f.cantidadTotal}</td><td>${esc(fecha(f.ultimaSolicitud))}</td></tr>`).join('')}</tbody></table>`
        : vacio('No hay faltantes pendientes.', 'Aquí verás qué conviene comprar.');
    } catch (err) { cuerpo.innerHTML = vacio('No se pudo cargar.', err.message); }
  }

  const cargar = () => (pestana === 'lista' ? cargarLista() : cargarResumen());
  cont.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]');
    const res = e.target.closest('[data-resolver]');
    if (tab) {
      pestana = tab.dataset.tab;
      cont.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('activo', b === tab));
      $('#fl-filtros', cont).classList.toggle('oculto', pestana !== 'lista');
      cargar();
    }
    if (res) {
      try { await put(`/faltantes/${res.dataset.resolver}/resolver`); toast('Faltante marcado como resuelto.'); cargar(); } catch (err) { mostrarError(err); }
    }
  });
  cont.querySelectorAll('.filtros select').forEach((s) => s.addEventListener('change', cargar));
  $('#fl-nuevo', cont).addEventListener('click', () => abrirFormFaltante({ productos, proveedores, onGuardado: cargar }));
  cargar();
}
