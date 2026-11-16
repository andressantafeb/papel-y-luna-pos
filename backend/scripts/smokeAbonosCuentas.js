// Parte 2: cuentas por cobrar, abonos posteriores, correcciones, reportes y reembolso.
const { escribir, llamar, verificar, hoy, crearVenta } = require('./smokeAbonosLib');

async function cuentasPorCobrar(ctx) {
  const { ta, tc, pid, cid, v1, v2 } = ctx;
  const ruta = `/api/cuentas-por-cobrar/clientes/${cid}/abonos`;
  const abonar = (cuerpo, ruta2 = ruta) => llamar('POST', ruta2, cuerpo, tc);

  escribir('== Cuentas por cobrar');
  const l1 = await llamar('GET', '/api/cuentas-por-cobrar', null, tc);
  const d1 = (l1.data.clientes || []).find((x) => x.clienteId === cid);
  verificar('cajero lista deudores; cliente debe 2500 en 2 ventas',
    l1.status === 200 && d1 && d1.saldoPendiente === 2500 && d1.ventasPendientes === 2, l1.data);
  verificar('sin token -> 401', (await llamar('GET', '/api/cuentas-por-cobrar')).status === 401);
  verificar('abono 0 -> 400', (await abonar({ monto: 0, metodoPago: 'Efectivo' })).status === 400);
  verificar('método Debe en abono -> 400', (await abonar({ monto: 100, metodoPago: 'Debe' })).status === 400);
  verificar('abono mayor al saldo -> 409', (await abonar({ monto: 2501, metodoPago: 'Efectivo' })).status === 409);
  verificar('cliente inexistente -> 404',
    (await abonar({ monto: 10, metodoPago: 'Efectivo' }, '/api/cuentas-por-cobrar/clientes/999999/abonos')).status === 404);

  const p1 = await abonar({ monto: 300, metodoPago: 'Efectivo' });
  verificar('abono 300 va a la venta más antigua; saldo 2200',
    p1.status === 201 && p1.data.saldoPendiente === 2200 && p1.data.aplicados.length === 1 && p1.data.aplicados[0].ventaId === v1, p1.data);
  const p2 = await abonar({ monto: 1300, metodoPago: 'Transferencia' });
  verificar('abono 1300 se reparte en 2 ventas (1200 + 100); saldo 900',
    p2.status === 201 && p2.data.aplicados.length === 2 && p2.data.saldoPendiente === 900, p2.data);
  const v1d = (await llamar('GET', `/api/ventas/${v1}`, null, tc)).data;
  verificar('venta 1 saldada: saldo 0, 3 abonos, 2000 abonado',
    v1d.saldoPendiente === 0 && v1d.abonos.length === 3 && v1d.totalAbonado === 2000, v1d.abonos);
  verificar('abono a venta ya saldada -> 409', (await abonar({ monto: 10, metodoPago: 'Efectivo', ventaId: v1 })).status === 409);
  verificar('abono a una venta no supera el saldo de esa venta (900)',
    (await abonar({ monto: 901, metodoPago: 'Efectivo', ventaId: v2 })).status === 409);
  const det = await llamar('GET', `/api/cuentas-por-cobrar/clientes/${cid}`, null, tc);
  verificar('detalle: saldo 900, 1 venta con saldo, 4 abonos en el historial',
    det.data.saldoPendiente === 900 && det.data.ventas.length === 1 && det.data.abonos.length === 4, det.data);

  escribir('== Corrección con abonos y reportes');
  const corregir = (id, cuerpo) => llamar('PUT', `/api/ventas/${id}/correccion`, cuerpo, ta);
  verificar('venta con abonos: cambiar el método -> 409', (await corregir(v1, { metodoPago: 'Transferencia' })).status === 409);
  verificar('venta con abonos: total menor a lo abonado -> 409',
    (await corregir(v1, { items: [{ productoId: pid, cantidad: 1 }] })).status === 409);
  const cor = await corregir(v2, { items: [{ productoId: pid, cantidad: 2 }] });
  verificar('subir el total de una venta con abonos: conserva el abono (100) y el saldo es 1900',
    cor.status === 200 && cor.data.total === 2000 && cor.data.totalAbonado === 100 && cor.data.saldoPendiente === 1900, cor);
  const rep = await llamar('GET', `/api/reportes/ventas?desde=${hoy()}&hasta=${hoy()}`, null, ta);
  verificar('reporte: abonos del periodo >= 2100 y cartera >= 1900',
    rep.status === 200 && rep.data.abonos.total >= 2100 && rep.data.totalPorCobrar >= 1900, rep.data.abonos);
  const hist = await llamar('GET', `/api/ventas?metodoPago=Debe&clienteId=${cid}`, null, tc);
  verificar('historial de ventas Debe incluye saldoPendiente', hist.data.length === 2 && hist.data.every((x) => typeof x.saldoPendiente === 'number'), hist.data);
  return ctx;
}

async function pagoFinalYReembolso(ctx) {
  const { ta, tc, pid, cid } = ctx;
  escribir('== Pago final y reembolso');
  const ruta = `/api/cuentas-por-cobrar/clientes/${cid}/abonos`;
  const fin = await llamar('POST', ruta, { monto: 1900, metodoPago: 'Efectivo' }, tc);
  verificar('pago final deja al cliente al día (saldo 0)', fin.status === 201 && fin.data.saldoPendiente === 0, fin.data);
  const l2 = await llamar('GET', '/api/cuentas-por-cobrar', null, tc);
  verificar('cliente al día sale de la lista de deudores', !l2.data.clientes.some((x) => x.clienteId === cid), l2.data);
  verificar('sin saldo -> 409 al abonar', (await llamar('POST', ruta, { monto: 10, metodoPago: 'Efectivo' }, tc)).status === 409);

  const v4 = await crearVenta(tc, pid, 2); // 2000 con abono 400
  await llamar('POST', `/api/ventas/${v4}/cerrar`, { metodoPago: 'Debe', clienteId: cid, abonoInicial: 400, metodoAbono: 'Efectivo' }, tc);
  const rf = await llamar('POST', `/api/ventas/${v4}/reembolsos`, { tipo: 'total', retornaInventario: true }, ta);
  const v4d = (await llamar('GET', `/api/ventas/${v4}`, null, tc)).data;
  verificar('reembolso total deja el saldo de la venta en 0', rf.status === 201 && v4d.saldoPendiente === 0, v4d.saldoPendiente);
}

module.exports = { cuentasPorCobrar, pagoFinalYReembolso };
