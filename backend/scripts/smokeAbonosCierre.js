// Parte 1: abono inicial al cerrar una venta a Debe, y datos de la prueba.
const { estado, escribir, llamar, verificar, crearVenta } = require('./smokeAbonosLib');

async function preparar() {
  const a = await llamar('POST', '/api/auth/login', { username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'Admin123*' });
  const c = await llamar('POST', '/api/auth/login', { username: 'cajero', password: process.env.SEED_CAJERO_PASSWORD || 'Cajero123*' });
  const ctx = { ta: a.data.token, tc: c.data.token };
  const prod = await llamar('POST', '/api/productos',
    { nombre: 'SMOKE ABONO Producto', costo: 400, precio: 1000, codigoInterno: `SMKA-${Date.now()}`, stock: 20 }, ctx.ta);
  const cli = await llamar('POST', '/api/clientes', { nombre: 'SMOKE ABONO Cliente', telefono: '3000000000' }, ctx.tc);
  estado.ids.producto = prod.data.id;
  estado.ids.cliente = cli.data.id;
  return { ...ctx, pid: prod.data.id, cid: cli.data.id };
}

async function cierreConAbono(ctx) {
  const { tc, pid, cid } = ctx;
  escribir('== Abono inicial al cerrar una venta a Debe');
  const cerrar = (id, cuerpo) => llamar('POST', `/api/ventas/${id}/cerrar`, cuerpo, tc);
  const debe = (extra) => ({ metodoPago: 'Debe', clienteId: cid, ...extra });

  const v1 = await crearVenta(tc, pid, 2); // total 2380 (2000 + IVA 19% = 380)
  verificar('abono igual al total (2380, con IVA) -> 400', (await cerrar(v1, debe({ abonoInicial: 2380, metodoAbono: 'Efectivo' }))).status === 400);
  verificar('abono sin método -> 400', (await cerrar(v1, debe({ abonoInicial: 500 }))).status === 400);
  verificar('método de abono "Debe" -> 400', (await cerrar(v1, debe({ abonoInicial: 500, metodoAbono: 'Debe' }))).status === 400);
  verificar('abono negativo -> 400', (await cerrar(v1, debe({ abonoInicial: -5, metodoAbono: 'Transferencia' }))).status === 400);
  verificar('abono con pago en Efectivo -> 400',
    (await cerrar(v1, { metodoPago: 'Efectivo', recibido: 2000, abonoInicial: 500, metodoAbono: 'Transferencia' })).status === 400);

  const r1 = await cerrar(v1, debe({ abonoInicial: 500, metodoAbono: 'Transferencia' }));
  verificar('cierra con abono 500 Transferencia: saldo 1880 (2380 - 500)',
    r1.status === 200 && r1.data.abonoInicial === 500 && r1.data.metodoAbono === 'Transferencia'
    && r1.data.total === 2380 && r1.data.ivaMonto === 380 && r1.data.saldoPendiente === 1880 && r1.data.totalAbonado === 500, r1);
  verificar('abono inicial queda en el libro (tipo inicial)',
    r1.data.abonos.length === 1 && r1.data.abonos[0].tipo === 'inicial' && r1.data.abonos[0].monto === 500, r1.data.abonos);

  const v2 = await crearVenta(tc, pid, 1); // total 1190 (1000 + IVA 19% = 190)
  const r2 = await cerrar(v2, debe({ abonoInicial: 0 }));
  verificar('Debe sin abono: saldo = total (1190) y sin abonos',
    r2.status === 200 && r2.data.saldoPendiente === 1190 && r2.data.abonos.length === 0, r2);
  const v3 = await crearVenta(tc, pid, 1);
  const r3 = await cerrar(v3, { metodoPago: 'Transferencia' });
  verificar('venta Transferencia: sin saldo pendiente ni abono',
    r3.status === 200 && r3.data.saldoPendiente === 0 && r3.data.abonoInicial === 0, r3);
  return { ...ctx, v1, v2 };
}

module.exports = { preparar, cierreConAbono };
