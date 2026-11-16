// Catálogo de descuentos (RF-112, 3.6, 3.8): el administrador lo gestiona y el cajero lo ve y lo aplica.
const { estado, escribir, llamar, verificar } = require('./smokeAbonosLib');

async function descuentos(ctx) {
  const { ta, tc, pid } = ctx;
  estado.ids.descuentos = [];
  const sufijo = Date.now();
  escribir('== Descuentos: gestión (administrador) y uso (cajero)');

  verificar('cajero consulta el catálogo', (await llamar('GET', '/api/descuentos', null, tc)).status === 200);
  verificar('cajero NO crea descuentos -> 403', (await llamar('POST', '/api/descuentos', { nombre: 'x', tipo: 'fijo', valor: 1 }, tc)).status === 403);
  verificar('sin token -> 401', (await llamar('GET', '/api/descuentos')).status === 401);

  const crear = (cuerpo) => llamar('POST', '/api/descuentos', cuerpo, ta);
  const d = await crear({ nombre: `SMOKE ABONO Desc ${sufijo}`, tipo: 'porcentaje', valor: 10 });
  verificar('admin crea descuento porcentual', d.status === 201 && d.data.tipo === 'porcentaje' && d.data.valor === 10, d);
  const id = d.data.id;
  estado.ids.descuentos.push(id);
  const f = await crear({ nombre: `SMOKE ABONO Fijo ${sufijo}`, tipo: 'fijo', valor: 5000 });
  estado.ids.descuentos.push(f.data.id);
  verificar('admin crea descuento de valor fijo', f.status === 201 && f.data.tipo === 'fijo', f);

  verificar('porcentaje mayor a 100 -> 400', (await crear({ nombre: 'SMOKE ABONO P', tipo: 'porcentaje', valor: 150 })).status === 400);
  verificar('valor 0 -> 400', (await crear({ nombre: 'SMOKE ABONO Z', tipo: 'fijo', valor: 0 })).status === 400);
  verificar('tipo inválido -> 400', (await crear({ nombre: 'SMOKE ABONO T', tipo: 'otro', valor: 5 })).status === 400);
  verificar('sin nombre -> 400', (await crear({ tipo: 'fijo', valor: 5 })).status === 400);
  verificar('nombre repetido -> 409', (await crear({ nombre: d.data.nombre, tipo: 'fijo', valor: 1 })).status === 409);

  const ed = await llamar('PUT', `/api/descuentos/${id}`, { valor: 20 }, ta);
  verificar('admin edita el valor (20%)', ed.status === 200 && ed.data.valor === 20, ed);
  verificar('cajero NO edita -> 403', (await llamar('PUT', `/api/descuentos/${id}`, { valor: 50 }, tc)).status === 403);
  const lista = await llamar('GET', '/api/descuentos', null, tc);
  verificar('el cajero ve el cambio (20%)', (lista.data.find((x) => x.id === id) || {}).valor === 20, lista.data);

  // Uso: el cajero aplica el descuento y el total respeta el valor vigente.
  const v = await llamar('POST', '/api/ventas', { items: [{ productoId: pid, cantidad: 2 }], descuentoId: id }, tc);
  estado.ids.ventas.push(v.data.id);
  verificar('cajero aplica el descuento: 2000 - 20% = 1600', v.status === 201 && v.data.total === 1600 && v.data.descuentoMonto === 400, v);
  const grande = await llamar('POST', '/api/ventas', { items: [{ productoId: pid, cantidad: 1 }], descuentoId: f.data.id }, tc);
  verificar('descuento fijo mayor al total -> 400 (sin totales negativos)', grande.status === 400, grande);
  const cierre = await llamar('POST', `/api/ventas/${v.data.id}/cerrar`, { metodoPago: 'Tarjeta' }, tc);
  verificar('la venta con descuento cierra', cierre.status === 200 && cierre.data.total === 1600, cierre);

  // Eliminar el descuento no altera la venta ya registrada.
  verificar('cajero NO elimina -> 403', (await llamar('DELETE', `/api/descuentos/${id}`, null, tc)).status === 403);
  verificar('admin elimina el descuento', (await llamar('DELETE', `/api/descuentos/${id}`, null, ta)).status === 200);
  const despues = (await llamar('GET', `/api/ventas/${v.data.id}`, null, tc)).data;
  verificar('la venta conserva el descuento y el total tras eliminarlo',
    despues.total === 1600 && despues.descuento && despues.descuento.nombre === d.data.nombre, despues.descuento);
  verificar('el cajero ya no lo ve en el catálogo', !(await llamar('GET', '/api/descuentos', null, tc)).data.some((x) => x.id === id));
  verificar('eliminar uno inexistente -> 404', (await llamar('DELETE', `/api/descuentos/${id}`, null, ta)).status === 404);
  return ctx;
}

module.exports = { descuentos };
