// Cobro de una venta (RF-20 a RF-23): Efectivo, Transferencia, Tarjeta y Debe.
import { post } from '../api.js';
import { $, moneda, abrirModal, toast, opciones } from '../util.js';
import { METODOS_PAGO, METODOS_ABONO } from '../pagos.js';
import { htmlCobro } from './cobroPlantilla.js';

export { abrirConfirmacion } from './cobroConfirmacion.js';

/**
 * Modal de cobro.
 *  - Efectivo: valor recibido y cambio.
 *  - Transferencia: billetera o banco (texto opcional: Daviplata, Nu, Bancolombia...).
 *  - Tarjeta: pago exacto, sin datos extra.
 *  - Debe: cliente obligatorio y abono inicial opcional (Efectivo, Transferencia o Tarjeta) con saldo en vivo.
 * onConfirmar({ metodoPago, recibido?, clienteId, billetera?, abonoInicial?, metodoAbono? }) debe lanzar un error
 * si el backend rechaza el cierre: el modal se mantiene abierto y muestra el mensaje.
 * `previo` (al corregir una venta) precarga método, billetera y abono de la venta original.
 */
export function abrirCobro({ total, clientes, clienteId, onConfirmar, previo }) {
  const p = previo || {};
  let metodo = METODOS_PAGO.includes(p.metodoPago) ? p.metodoPago : 'Efectivo';
  let metodoAbono = METODOS_ABONO.includes(p.metodoAbono) ? p.metodoAbono : 'Efectivo';
  const modal = abrirModal(htmlCobro({ total, metodo, metodoAbono, p }), 'cobro-caja');

  const el = modal.el;
  const error = $('#cb-error', el);
  const pintarClientes = (sel) => { $('#cb-cliente', el).innerHTML = opciones(clientes, 'id', 'nombre', sel, 'Sin cliente'); };
  pintarClientes(clienteId);
  const mostrarAviso = (t) => { error.textContent = t; error.classList.toggle('oculto', !t); };

  // Abono inicial (solo con Debe): el saldo pendiente se recalcula mientras se escribe.
  const abonoActual = () => Math.max(0, Number($('#cb-abono', el).value) || 0);
  function pintarSaldo() {
    const abono = abonoActual();
    const saldo = $('#cb-saldo', el);
    saldo.textContent = moneda(Math.max(0, total - abono));
    saldo.classList.toggle('excedido', abono >= total);
  }
  const pintarAbonoTransf = () => $('#cb-abono-transf', el)
    .classList.toggle('oculto', !(metodo === 'Debe' && metodoAbono === 'Transferencia'));
  function pintarMetodo() {
    $('#cb-efectivo', el).classList.toggle('oculto', metodo !== 'Efectivo');
    $('#cb-transferencia', el).classList.toggle('oculto', metodo !== 'Transferencia');
    $('#cb-debe', el).classList.toggle('oculto', metodo !== 'Debe');
    pintarAbonoTransf();
    if (metodo === 'Debe') pintarSaldo();
  }
  pintarMetodo();

  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-abono]');
    if (a) {
      metodoAbono = a.dataset.abono;
      el.querySelectorAll('[data-abono]').forEach((x) => x.classList.toggle('activo', x === a));
      pintarAbonoTransf();
      return;
    }
    const b = e.target.closest('[data-metodo]');
    if (!b) return;
    metodo = b.dataset.metodo;
    el.querySelectorAll('[data-metodo]').forEach((x) => x.classList.toggle('activo', x === b));
    pintarMetodo();
    mostrarAviso('');
  });
  $('#cb-abono', el).addEventListener('input', pintarSaldo);
  $('#cb-recibido', el).addEventListener('input', (e) => {
    $('#cb-cambio', el).textContent = moneda(Math.max(0, Number(e.target.value || 0) - total));
  });

  $('#cb-crear', el).addEventListener('click', async () => {
    const nombre = $('#cb-nuevo', el).value.trim();
    if (!nombre) return mostrarAviso('Escribe el nombre del cliente.');
    try {
      const nuevo = await post('/clientes', { nombre });
      clientes.push(nuevo);
      pintarClientes(nuevo.id);
      $('#cb-nuevo', el).value = '';
      mostrarAviso('');
      toast('Cliente creado y seleccionado.');
    } catch (err) { mostrarAviso(err.message); }
  });

  $('#cb-confirmar', el).addEventListener('click', async () => {
    mostrarAviso('');
    const recibido = Number($('#cb-recibido', el).value);
    const cliente = $('#cb-cliente', el).value;
    const abono = metodo === 'Debe' ? abonoActual() : 0;
    if (metodo === 'Efectivo' && !(recibido >= total)) return mostrarAviso('El efectivo recibido debe ser igual o mayor al total.');
    if (metodo === 'Debe' && !cliente) return mostrarAviso('Para una venta a Debe debes seleccionar o crear un cliente.');
    if (metodo === 'Debe' && abono >= total) {
      return mostrarAviso('El abono debe ser menor al total. Si el cliente paga todo, cobra en Efectivo, Transferencia o Tarjeta.');
    }
    // Billetera o banco: solo en Transferencia (o en el abono inicial de un Debe pagado por transferencia).
    let billetera = null;
    if (metodo === 'Transferencia') billetera = $('#cb-billetera', el).value.trim();
    if (metodo === 'Debe' && abono > 0 && metodoAbono === 'Transferencia') billetera = $('#cb-billetera-abono', el).value.trim();

    const boton = $('#cb-confirmar', el);
    boton.disabled = true;
    try {
      await onConfirmar({
        metodoPago: metodo,
        recibido: metodo === 'Efectivo' ? recibido : undefined,
        clienteId: cliente ? Number(cliente) : null,
        ...(billetera !== null ? { billetera } : {}),
        ...(metodo === 'Debe' ? { abonoInicial: abono, metodoAbono: abono > 0 ? metodoAbono : undefined } : {})
      });
      modal.cerrar();
    } catch (err) {
      mostrarAviso(err.message);
      boton.disabled = false;
    }
  });
  if (metodo === 'Efectivo') $('#cb-recibido', el).focus();
}
