// Reportes (3.10) y faltantes (3.7, RF-150 a RF-155, RN-09, RN-10) con los métodos de pago nuevos.
const { estado, escribir, llamar, verificar, hoy } = require('./smokeAbonosLib');

async function reportes(ctx) {
  const { ta, tc } = ctx;
  const q = `desde=${hoy()}&hasta=${hoy()}`;
  escribir('== Reportes (3.10)');

  const rv = await llamar('GET', `/api/reportes/ventas?${q}`, null, ta);
  const metodos = (rv.data.porMetodoPago || []).map((m) => m.metodoPago);
  verificar('ventas: total, número y desglose por método',
    rv.status === 200 && rv.data.totalVendido > 0 && rv.data.numeroVentas > 0 && metodos.length >= 3, rv.data);
  verificar('desglose incluye Transferencia, Tarjeta y Debe', ['Transferencia', 'Tarjeta', 'Debe'].every((m) => metodos.includes(m)), metodos);
  verificar('el desglose solo contiene los 4 métodos válidos', metodos.every((m) => ['Efectivo', 'Transferencia', 'Tarjeta', 'Debe'].includes(m)), metodos);
  const abonosM = (rv.data.abonos.porMetodoPago || []).map((m) => m.metodoPago);
  verificar('abonos del periodo por método (incluye Transferencia)', abonosM.includes('Transferencia') && rv.data.abonos.total > 0, rv.data.abonos);
  const rp = await llamar('GET', `/api/reportes/productos-mas-vendidos?${q}&limite=5`, null, ta);
  verificar('productos más vendidos por rango', rp.status === 200 && rp.data.productos.length > 0 && rp.data.productos.length <= 5, rp.data);
  verificar('compras por rango (200)', (await llamar('GET', `/api/reportes/compras?${q}`, null, ta)).status === 200);
  verificar('faltantes frecuentes (200)', (await llamar('GET', '/api/reportes/faltantes', null, ta)).status === 200);
  verificar('rango de un solo día es válido', (await llamar('GET', `/api/reportes/ventas?desde=${hoy()}&hasta=${hoy()}`, null, ta)).status === 200);
  verificar('fecha inválida -> 400', (await llamar('GET', '/api/reportes/ventas?desde=hoy', null, ta)).status === 400);
  for (const ruta of ['ventas', 'productos-mas-vendidos', 'compras', 'faltantes']) {
    verificar(`cajero NO ve /reportes/${ruta} -> 403`, (await llamar('GET', `/api/reportes/${ruta}`, null, tc)).status === 403);
  }
  return ctx;
}

async function faltantes(ctx) {
  const { ta, tc, pid } = ctx;
  const nombre = `smokeabonofalt${Date.now()}`;
  escribir('== Faltantes (3.7)');
  const crear = (cuerpo) => llamar('POST', '/api/faltantes', cuerpo, tc);
  const a = await crear({ nombreProducto: `${nombre}s`, cantidad: 2, tipo: 'inexistente' });
  const b = await crear({ nombreProducto: nombre.toUpperCase(), cantidad: 3, tipo: 'inexistente' });
  verificar('cajero registra faltantes (RF-150)', a.status === 201 && b.status === 201, a);
  verificar('el nombre se normaliza igual (RN-10)', a.data.nombreNormalizado === b.data.nombreNormalizado, [a.data.nombreNormalizado, b.data.nombreNormalizado]);
  const ag = await crear({ productoId: pid, cantidad: 1, tipo: 'agotado' });
  verificar('agotado con producto existente (RF-151)', ag.status === 201 && ag.data.tipo === 'agotado', ag);
  verificar('agotado sin producto -> 400', (await crear({ nombreProducto: 'x', cantidad: 1, tipo: 'agotado' })).status === 400);
  verificar('cantidad 0 -> 400', (await crear({ nombreProducto: 'x', cantidad: 0, tipo: 'inexistente' })).status === 400);
  verificar('tipo inválido -> 400', (await crear({ nombreProducto: 'x', cantidad: 1, tipo: 'otro' })).status === 400);
  verificar('filtro por tipo (RF-153)', (await llamar('GET', '/api/faltantes?tipo=agotado', null, tc)).data.every((x) => x.tipo === 'agotado'));
  verificar('filtro por estado y fecha', (await llamar('GET', `/api/faltantes?estado=pendiente&desde=${hoy()}&hasta=${hoy()}`, null, tc)).status === 200);
  const rf = await llamar('GET', '/api/reportes/faltantes', null, ta);
  const fila = rf.data.faltantes.find((x) => x.nombreNormalizado === a.data.nombreNormalizado);
  verificar('reporte: 2 solicitudes, 5 unidades, última fecha y estado (RF-155)',
    fila && fila.solicitudes === 2 && fila.cantidadTotal === 5 && fila.ultimaSolicitud && fila.estado === 'pendiente', rf.data.faltantes.slice(0, 3));
  const stock = (await llamar('GET', `/api/productos/${pid}`, null, ta)).data.stock;
  verificar('los faltantes no tocan el inventario (RN-09)', Number.isInteger(stock) && stock >= 0, stock);
  const rs = await llamar('PUT', `/api/faltantes/${a.data.id}/resolver`, null, tc);
  verificar('resolver faltante (RF-154)', rs.status === 200 && rs.data.estado === 'resuelto', rs);
  verificar('resolver dos veces -> 409', (await llamar('PUT', `/api/faltantes/${a.data.id}/resolver`, null, tc)).status === 409);
  verificar('resumen para compras (200)', (await llamar('GET', '/api/faltantes/resumen', null, ta)).status === 200);
  await llamar('PUT', `/api/faltantes/${b.data.id}/resolver`, null, tc);
  await llamar('PUT', `/api/faltantes/${ag.data.id}/resolver`, null, tc);
  estado.ids.faltantes = [a.data.id, b.data.id, ag.data.id];
  return ctx;
}

module.exports = { reportes, faltantes };
