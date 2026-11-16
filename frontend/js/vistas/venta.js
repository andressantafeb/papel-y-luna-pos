// Pantalla "Nueva venta": catálogo + ticket. Cubre venta abierta (guardar/retomar), cobro,
// edición en caliente de un producto y corrección de ventas cerradas (administrador).
import { get, post, put } from '../api.js';
import { $, esc, moneda, toast, mostrarError, opciones, confirmar, vacio } from '../util.js';
import { puente } from '../puente.js';
import { mostrarFactura } from '../factura.js';
import { abrirCobro, abrirConfirmacion } from './cobro.js';
import { abrirReembolso } from './reembolso.js';
import { abrirAbiertas } from './abiertas.js';
import { abrirFormProducto } from './productoForm.js';
import { abrirFormFaltante } from './faltanteForm.js';
import { htmlItems, htmlTotales } from './ventaTicket.js';
import { PLANTILLA_VENTA } from './ventaPlantilla.js';
import {
  normalizar, estadoNuevo, calcularTotales, agregarProducto, cargarVenta,
  guardarAbierta, cuerpoCorreccion
} from './ventaLogica.js';

export async function montar(cont, usuario) {
  const esAdmin = usuario.rol === 'administrador';
  const [productos, categorias, clientes, descuentos] = await Promise.all([
    get('/productos'), get('/categorias'), get('/clientes'), get('/descuentos')
  ]);
  const est = estadoNuevo();
  let categoriaSel = '';
  let busqueda = '';

  // Si el historial pidió corregir una venta cerrada, se carga aquí.
  if (puente.correccion) { cargarVenta(est, puente.correccion, true); puente.correccion = null; }

  cont.innerHTML = PLANTILLA_VENTA;
  const ticketEl = $('#ticket', cont);
  const abrirTicketMovil = (abrir) => { ticketEl.classList.toggle('abierto', abrir); $('#vt-backdrop', cont).classList.toggle('oculto', !abrir); };

  /* ---------- Catálogo ---------- */
  function pintarCatalogo() {
    $('#vt-chips', cont).innerHTML = [{ id: '', nombre: 'Todas' }, ...categorias].map((c) =>
      `<button type="button" class="chip ${String(c.id) === String(categoriaSel) ? 'activo' : ''}" data-cat="${c.id}">${esc(c.nombre)}</button>`).join('');
    const t = normalizar(busqueda);
    const lista = productos.filter((p) =>
      (!categoriaSel || String(p.categoriaId) === String(categoriaSel))
      && (!t || normalizar(`${p.nombre} ${p.categoria} ${p.codigoInterno}`).includes(t)));
    $('#vt-productos', cont).innerHTML = lista.map((p) => {
      const agotado = !est.correccion && p.seguimientoInventario && p.stock <= 0;
      return `<button type="button" class="producto-fila ${agotado ? 'agotado' : ''}" data-id="${p.id}">
        <span class="producto-info"><strong>${esc(p.nombre)}</strong>
        <small>${esc(p.categoria || 'Sin categoría')} · ${esc(p.codigoInterno || '')}${p.seguimientoInventario ? ` · stock ${p.stock}` : ''}${agotado ? ' · AGOTADO' : ''}</small></span>
        <span class="producto-precio">${moneda(p.precio)}</span></button>`;
    }).join('') || vacio('No se encontraron productos.', 'Prueba otra búsqueda o categoría.');
  }

  /* ---------- Ticket ---------- */
  function pintarTicket() {
    $('#vt-items', cont).innerHTML = htmlItems(est.items);
    const t = calcularTotales(est, descuentos);
    $('#vt-totales', cont).innerHTML = htmlTotales(t);
    const error = $('#vt-error', cont);
    error.textContent = t.error;
    error.classList.toggle('oculto', !t.error);
    $('#vt-cobrar', cont).disabled = !est.items.length || Boolean(t.error);
    $('#vt-cobrar', cont).textContent = est.correccion ? 'Guardar corrección' : 'Cobrar venta';
    $('#vt-guardar', cont).classList.toggle('oculto', Boolean(est.correccion));
    $('#vt-limpiar', cont).textContent = est.correccion ? 'Cancelar corrección' : 'Limpiar venta';
    $('#vt-abrir-ticket', cont).textContent = `Ver ticket (${est.items.reduce((s, i) => s + i.cantidad, 0)})`;
    $('#vt-titulo', cont).textContent = est.correccion ? `Corrigiendo venta #${est.ventaId}` : 'Nueva venta';
    $('#vt-ticket-titulo', cont).textContent = est.ventaId ? `Venta #${est.ventaId}` : 'Ticket';
    const aviso = $('#vt-aviso-correccion', cont);
    aviso.classList.toggle('oculto', !est.correccion);
    aviso.innerHTML = est.correccion ? '<strong>Modo corrección.</strong> Los cambios se aplican al guardar. El stock se ajusta por la diferencia.' : '';
    $('#vt-cliente', cont).innerHTML = opciones(clientes, 'id', 'nombre', est.clienteId, 'Sin cliente');
    const textoVacio = est.snapshot && !est.descuentoId ? `${est.snapshot.nombre} (aplicado)` : 'Sin descuento';
    $('#vt-descuento', cont).innerHTML = opciones(descuentos, 'id', (d) => `${d.nombre} (${d.tipo === 'porcentaje' ? `${d.valor}%` : moneda(d.valor)})`, est.descuentoId, textoVacio);
  }
  const repintar = () => { pintarCatalogo(); pintarTicket(); };
  function reiniciar() { Object.assign(est, estadoNuevo()); repintar(); }

  /* ---------- Eventos del catálogo y del ticket ---------- */
  const buscarProducto = (id) => productos.find((p) => p.id === Number(id));
  $('#vt-buscar', cont).addEventListener('input', (e) => { busqueda = e.target.value; pintarCatalogo(); });
  $('#vt-chips', cont).addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) { categoriaSel = b.dataset.cat; pintarCatalogo(); }
  });
  $('#vt-productos', cont).addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const error = agregarProducto(est, buscarProducto(b.dataset.id));
    if (error) toast(error, 'error'); else pintarTicket();
  });

  $('#vt-items', cont).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const id = Number(b.dataset.id);
    const linea = est.items.find((i) => i.productoId === id);
    if (b.dataset.a === 'editar') return editarProducto(id);
    if (b.dataset.a === 'quitar') est.items = est.items.filter((i) => i.productoId !== id);
    if (b.dataset.a === 'sumar') { const m = agregarProducto(est, buscarProducto(id)); if (m) toast(m, 'error'); }
    if (b.dataset.a === 'restar' && linea) {
      linea.cantidad -= 1;
      if (linea.cantidad < 1) est.items = est.items.filter((i) => i.productoId !== id);
    }
    return pintarTicket();
  });
  $('#vt-items', cont).addEventListener('change', (e) => {
    if (!e.target.matches('.cant-input')) return;
    const id = Number(e.target.dataset.id);
    const linea = est.items.find((i) => i.productoId === id);
    const p = buscarProducto(id);
    let n = Math.floor(Number(e.target.value));
    if (!(n >= 1)) n = 1;
    if (!est.correccion && p.seguimientoInventario && n > p.stock) { toast(`${p.nombre}: solo hay ${p.stock} unidad(es) disponible(s).`, 'error'); n = p.stock; }
    linea.cantidad = n;
    pintarTicket();
  });
  $('#vt-cliente', cont).addEventListener('change', (e) => { est.clienteId = e.target.value; });

  // Crear un cliente sin salir de la venta (igual que en el modal de cobro): queda seleccionado.
  async function crearCliente() {
    const campo = $('#vt-cliente-nuevo', cont);
    const boton = $('#vt-cliente-crear', cont);
    const nombre = campo.value.trim();
    if (!nombre) { toast('Escribe el nombre del cliente.', 'error'); campo.focus(); return; }
    boton.disabled = true;
    try {
      const nuevo = await post('/clientes', { nombre });
      clientes.push(nuevo); // la misma lista la usa el modal de cobro
      est.clienteId = String(nuevo.id);
      campo.value = '';
      pintarTicket();
      toast('Cliente creado y seleccionado.');
    } catch (err) { mostrarError(err); } finally { boton.disabled = false; }
  }
  $('#vt-cliente-crear', cont).addEventListener('click', crearCliente);
  $('#vt-cliente-nuevo', cont).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); crearCliente(); }
  });
  $('#vt-descuento', cont).addEventListener('change', (e) => {
    est.descuentoId = e.target.value;
    if (e.target.value) est.snapshot = null;
    pintarTicket();
  });
  $('#vt-abrir-ticket', cont).addEventListener('click', () => abrirTicketMovil(true));
  $('#vt-backdrop', cont).addEventListener('click', () => abrirTicketMovil(false));
  $('#vt-cerrar-ticket', cont).addEventListener('click', () => abrirTicketMovil(false));

  /* ---------- Edición en caliente (RF-86, RF-87) ---------- */
  function editarProducto(id) {
    abrirFormProducto({
      producto: buscarProducto(id),
      categorias,
      onGuardado: (guardado) => {
        productos[productos.findIndex((p) => p.id === guardado.id)] = guardado;
        // El ticket refleja de inmediato el nuevo precio y nombre.
        est.items.forEach((l) => { if (l.productoId === guardado.id) { l.precio = guardado.precio; l.nombre = guardado.nombre; } });
        repintar();
      }
    });
  }
  $('#vt-faltante', cont).addEventListener('click', () => abrirFormFaltante({ productos, nombreInicial: busqueda }));
  /* ---------- Acciones de la venta ---------- */
  $('#vt-guardar', cont).addEventListener('click', async (e) => {
    if (!est.items.length) return toast('Agrega al menos un producto para guardar la venta.', 'error');
    e.target.disabled = true;
    try {
      const v = await guardarAbierta(est);
      toast(`Venta #${v.id} guardada. Puedes retomarla desde "Ventas guardadas".`);
      reiniciar();
    } catch (err) { mostrarError(err); } finally { e.target.disabled = false; }
  });

  $('#vt-limpiar', cont).addEventListener('click', async () => {
    if (!est.items.length && !est.ventaId) return;
    if (est.correccion) {
      if (await confirmar('Cancelar corrección', 'Se conservará la venta original sin cambios. ¿Continuar?', { textoOk: 'Cancelar corrección' })) reiniciar();
      return;
    }
    if (!await confirmar('Limpiar venta', '¿Quitar todos los productos de la venta actual?', { textoOk: 'Limpiar', peligro: true })) return;
    est.items = [];
    est.descuentoId = '';
    est.snapshot = null;
    pintarTicket();
  });

  $('#vt-abiertas', cont).addEventListener('click', () => abrirAbiertas({
    onRetomar: (venta) => { cargarVenta(est, venta, false); repintar(); toast(`Venta #${venta.id} retomada.`); }
  }));

  const refrescarProductos = () => get('/productos')
    .then((lista) => { productos.splice(0, productos.length, ...lista); pintarCatalogo(); })
    .catch(() => {});

  // Reembolso directo desde la confirmación o la factura: abre el formulario de devolución en esta misma
  // pantalla (sin ir al historial). Al terminar muestra la factura actualizada y refresca el stock.
  const reembolsar = (v) => abrirReembolso(v, (actualizada) => {
    refrescarProductos();
    mostrarFactura(actualizada, { esAdmin, onCorregir: accionesPostVenta.onCorregir, onReembolsar: reembolsar, onNuevaVenta: reiniciar });
  });

  const accionesPostVenta = {
    esAdmin,
    onNueva: reiniciar,
    onCorregir: (v) => { cargarVenta(est, v, true); repintar(); },
    onReembolsar: reembolsar
  };

  $('#vt-cobrar', cont).addEventListener('click', () => {
    const t = calcularTotales(est, descuentos);
    abrirCobro({
      total: t.total,
      clientes,
      clienteId: est.clienteId,
      // Al corregir una venta se precargan su método de pago, billetera y abono inicial.
      previo: est.correccion || null,
      onConfirmar: async (pago) => {
        if (est.correccion) {
          const venta = await put(`/ventas/${est.ventaId}/correccion`, cuerpoCorreccion(est, pago));
          toast('Corrección guardada correctamente.');
          reiniciar();
          refrescarProductos();
          mostrarFactura(venta, { esAdmin, onNuevaVenta: reiniciar });
          return;
        }
        est.clienteId = pago.clienteId || '';
        await guardarAbierta(est);
        let venta;
        try {
          venta = await post(`/ventas/${est.ventaId}/cerrar`, pago);
        } catch (err) {
          if (err.status === 409) refrescarProductos(); // stock insuficiente u otro conflicto: muestra el stock real
          throw err;
        }
        reiniciar();
        refrescarProductos(); // el stock cambió
        abrirConfirmacion(venta, accionesPostVenta);
      }
    });
  });

  repintar();
  if (est.correccion) toast(`Corrigiendo la venta #${est.ventaId}.`);
}
