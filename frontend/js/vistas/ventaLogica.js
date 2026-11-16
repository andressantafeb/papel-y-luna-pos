// Estado y cálculos de la venta en curso (sin tocar el DOM). El backend vuelve a validar todo.
import { post, put } from '../api.js';
import { IVA_PORCENTAJE, redondear } from '../iva.js';

export const normalizar = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export const estadoNuevo = () => ({
  ventaId: null, items: [], clienteId: '', descuentoId: '',
  descuentoOriginal: '', snapshot: null, correccion: null
});

// Descuento vigente: el del catálogo o, en una corrección, la copia guardada si ya no existe en el catálogo.
export function descuentoActivo(est, descuentos) {
  return descuentos.find((d) => String(d.id) === String(est.descuentoId)) || (!est.descuentoId ? est.snapshot : null) || null;
}

/**
 * Totales del ticket. Los precios del catálogo son base (sin IVA):
 *  - productos: suma de precio x cantidad
 *  - monto: descuento aplicado
 *  - subtotal: productos - descuento (base gravable)
 *  - iva: subtotal x 19 %
 *  - total: subtotal + iva (lo que se cobra)
 */
export function calcularTotales(est, descuentos) {
  const productos = redondear(est.items.reduce((suma, i) => suma + i.precio * i.cantidad, 0));
  const descuento = descuentoActivo(est, descuentos);
  let monto = 0;
  let error = '';
  if (descuento) {
    monto = descuento.tipo === 'porcentaje' ? redondear((productos * descuento.valor) / 100) : redondear(descuento.valor);
    if (monto > productos) { error = `El descuento "${descuento.nombre}" supera el valor de la venta.`; monto = 0; }
  }
  const subtotal = redondear(productos - monto);
  const iva = redondear((subtotal * IVA_PORCENTAJE) / 100);
  return { productos, descuento, monto, subtotal, ivaPorcentaje: IVA_PORCENTAJE, iva, total: redondear(subtotal + iva), error };
}

/** Agrega una unidad del producto. Devuelve un mensaje de error o '' si todo salió bien. */
export function agregarProducto(est, producto) {
  const linea = est.items.find((i) => i.productoId === producto.id);
  const enTicket = linea ? linea.cantidad : 0;
  // En una corrección el stock disponible incluye lo ya vendido: valida el backend.
  if (!est.correccion && producto.seguimientoInventario && enTicket + 1 > producto.stock) {
    return producto.stock <= 0 ? `${producto.nombre} está agotado.` : `${producto.nombre}: solo hay ${producto.stock} unidad(es) disponible(s).`;
  }
  if (linea) linea.cantidad += 1;
  else est.items.push({ productoId: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 1 });
  return '';
}

/** Carga una venta del backend en el ticket (retomar una guardada o corregir una cerrada). */
export function cargarVenta(est, venta, correccion = false) {
  const descuentoId = venta.descuentoId ? String(venta.descuentoId) : '';
  Object.assign(est, estadoNuevo(), {
    ventaId: venta.id,
    items: venta.items.map(({ productoId, nombre, precio, cantidad }) => ({ productoId, nombre, precio, cantidad })),
    clienteId: venta.clienteId ? String(venta.clienteId) : '',
    descuentoId,
    descuentoOriginal: descuentoId,
    snapshot: venta.descuento && !venta.descuentoId ? venta.descuento : null,
    correccion: correccion ? venta : null
  });
}

const lineas = (est) => est.items.map(({ productoId, cantidad }) => ({ productoId, cantidad }));

/** Crea (POST) o actualiza (PUT) la venta abierta en el backend. */
export async function guardarAbierta(est) {
  const cuerpo = {
    items: lineas(est),
    clienteId: est.clienteId ? Number(est.clienteId) : null,
    descuentoId: est.descuentoId ? Number(est.descuentoId) : null
  };
  const venta = est.ventaId ? await put(`/ventas/${est.ventaId}`, cuerpo) : await post('/ventas', cuerpo);
  est.ventaId = venta.id;
  return venta;
}

/** Cuerpo de PUT /ventas/:id/correccion. El descuento solo se envía si el usuario lo cambió. */
export function cuerpoCorreccion(est, pago) {
  const cuerpo = {
    items: lineas(est), clienteId: pago.clienteId, metodoPago: pago.metodoPago, recibido: pago.recibido,
    abonoInicial: pago.abonoInicial, metodoAbono: pago.metodoAbono, billetera: pago.billetera
  };
  if (String(est.descuentoId) !== String(est.descuentoOriginal)) cuerpo.descuentoId = est.descuentoId ? Number(est.descuentoId) : null;
  return cuerpo;
}
