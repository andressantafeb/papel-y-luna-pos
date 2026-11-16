// Métodos de pago (Efectivo, Transferencia, Tarjeta, Debe) y billetera o banco de las transferencias.
// Crea solo datos con prefijo "SMOKE ABONO" y los elimina al terminar.
const { estado, escribir, llamar, verificar, crearVenta } = require('./smokeAbonosLib');

async function metodosDePago(ctx) {
  const { ta, tc, pid, cid } = ctx;
  escribir('== Métodos de pago');
  const cerrar = (id, cuerpo) => llamar('POST', `/api/ventas/${id}/cerrar`, cuerpo, tc);
  const nueva = () => crearVenta(tc, pid, 1); // total 1000

  const vTransf = await nueva();
  verificar('método obsoleto o desconocido -> 400', (await cerrar(vTransf, { metodoPago: 'Cheque' })).status === 400);
  verificar('método desconocido -> 400', (await cerrar(vTransf, { metodoPago: 'Cripto' })).status === 400);

  const t1 = await cerrar(vTransf, { metodoPago: 'Transferencia', billetera: '  Daviplata ' });
  verificar('Transferencia con billetera: se guarda sin espacios', t1.status === 200 && t1.data.metodoPago === 'Transferencia' && t1.data.billetera === 'Daviplata', t1);
  verificar('Transferencia: sin recibido ni cambio', t1.data.recibido === null && t1.data.cambio === 0 && t1.data.saldoPendiente === 0, t1.data);

  const v2 = await nueva();
  const t2 = await cerrar(v2, { metodoPago: 'Transferencia' });
  verificar('Transferencia sin billetera (opcional) -> billetera null', t2.status === 200 && t2.data.billetera === null, t2);

  const v3 = await nueva();
  const t3 = await cerrar(v3, { metodoPago: 'Transferencia', billetera: '   ' });
  verificar('billetera en blanco se guarda como null', t3.status === 200 && t3.data.billetera === null, t3.data);

  const v4 = await nueva();
  verificar('billetera de más de 60 caracteres -> 400', (await cerrar(v4, { metodoPago: 'Transferencia', billetera: 'x'.repeat(61) })).status === 400);
  verificar('billetera que no es texto -> 400', (await cerrar(v4, { metodoPago: 'Transferencia', billetera: 123 })).status === 400);
  const tj = await cerrar(v4, { metodoPago: 'Tarjeta', billetera: 'Nu' });
  verificar('Tarjeta cierra; ignora la billetera', tj.status === 200 && tj.data.metodoPago === 'Tarjeta' && tj.data.billetera === null && tj.data.saldoPendiente === 0, tj);

  const v5 = await nueva();
  const ef = await cerrar(v5, { metodoPago: 'Efectivo', recibido: 2000, billetera: 'Nu' });
  verificar('Efectivo: cambio 1000 y sin billetera', ef.status === 200 && ef.data.cambio === 1000 && ef.data.billetera === null, ef);

  // Corrección (administrador): la billetera se conserva, se reemplaza o se limpia según el método final.
  const corregir = (cuerpo) => llamar('PUT', `/api/ventas/${vTransf}/correccion`, cuerpo, ta);
  const mismo = { items: [{ productoId: pid, cantidad: 1 }] };
  const c1 = await corregir(mismo);
  verificar('corrección sin cambiar el método conserva la billetera', c1.status === 200 && c1.data.metodoPago === 'Transferencia' && c1.data.billetera === 'Daviplata' && c1.data.corregida, c1);
  const c2 = await corregir({ ...mismo, metodoPago: 'Transferencia', billetera: 'Nu' });
  verificar('corrección puede cambiar la billetera (Nu)', c2.status === 200 && c2.data.billetera === 'Nu', c2);
  const c3 = await corregir({ ...mismo, metodoPago: 'Tarjeta' });
  verificar('corregir a Tarjeta limpia la billetera', c3.status === 200 && c3.data.metodoPago === 'Tarjeta' && c3.data.billetera === null, c3);
  verificar('corregir a Efectivo sin recibido -> 400', (await corregir({ ...mismo, metodoPago: 'Efectivo' })).status === 400);
  verificar('corregir a Debe sin cliente -> 400', (await corregir({ ...mismo, metodoPago: 'Debe' })).status === 400);
  const hist = await llamar('GET', '/api/ventas?metodoPago=Transferencia', null, tc);
  verificar('historial filtra por Transferencia', hist.status === 200 && hist.data.every((x) => x.metodoPago === 'Transferencia'), hist.data.length);
  verificar('historial rechaza un filtro de método inválido -> 400', (await llamar('GET', '/api/ventas?metodoPago=Cheque', null, tc)).status === 400);

  return { ...ctx, ventasPago: [vTransf, v2, v3, v4, v5], cid, ta };
}

async function debeConTransferencia(ctx) {
  const { tc, pid, cid } = ctx;
  escribir('== Debe con abono por Transferencia o Tarjeta');
  const cerrar = (id, cuerpo) => llamar('POST', `/api/ventas/${id}/cerrar`, cuerpo, tc);
  const v = await crearVenta(tc, pid, 3); // total 3000
  const r = await cerrar(v, { metodoPago: 'Debe', clienteId: cid, abonoInicial: 1000, metodoAbono: 'Transferencia', billetera: 'Nu' });
  verificar('Debe + abono por Transferencia (Nu): saldo 2000', r.status === 200 && r.data.metodoAbono === 'Transferencia' && r.data.billetera === 'Nu' && r.data.saldoPendiente === 2000, r);
  verificar('el abono inicial guarda la billetera', r.data.abonos.length === 1 && r.data.abonos[0].metodoPago === 'Transferencia' && r.data.abonos[0].billetera === 'Nu', r.data.abonos);

  const ruta = `/api/cuentas-por-cobrar/clientes/${cid}/abonos`;
  const a1 = await llamar('POST', ruta, { monto: 500, metodoPago: 'Transferencia', billetera: 'Bancolombia' }, tc);
  verificar('abono posterior por Transferencia con banco', a1.status === 201 && a1.data.abonos.some((x) => x.billetera === 'Bancolombia'), a1.data);
  const a2 = await llamar('POST', ruta, { monto: 200, metodoPago: 'Tarjeta', billetera: 'Nu' }, tc);
  verificar('abono posterior por Tarjeta (sin billetera)', a2.status === 201 && a2.data.abonos.filter((x) => x.metodoPago === 'Tarjeta').every((x) => x.billetera === null), a2.data);
  verificar('abono con método Debe -> 400', (await llamar('POST', ruta, { monto: 10, metodoPago: 'Debe' }, tc)).status === 400);
  verificar('abono con método inválido -> 400', (await llamar('POST', ruta, { monto: 10, metodoPago: 'Cheque' }, tc)).status === 400);

  const v2 = await crearVenta(tc, pid, 2);
  verificar('abono inicial por "Debe" -> 400', (await cerrar(v2, { metodoPago: 'Debe', clienteId: cid, abonoInicial: 500, metodoAbono: 'Debe' })).status === 400);
  const r2 = await cerrar(v2, { metodoPago: 'Debe', clienteId: cid, abonoInicial: 500, metodoAbono: 'Tarjeta', billetera: 'Nu' });
  verificar('Debe + abono por Tarjeta: sin billetera', r2.status === 200 && r2.data.metodoAbono === 'Tarjeta' && r2.data.billetera === null, r2);
  return { ...ctx, ventaDebe: v2 };
}

module.exports = { metodosDePago, debeConTransferencia };
