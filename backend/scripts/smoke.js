// Pruebas rápidas de extremo a extremo contra la base de datos configurada en .env.
//   npm run smoke
// Crea datos con el prefijo "SMOKE". Para dejar la base limpia: npm run db:reset && npm run db:seed
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('../src/config/env');
env.validarEntorno(['databaseUrl', 'jwtSecret']);
const app = require('../src/app');
const { pool } = require('../src/config/db');

const LOG = path.join(os.tmpdir(), 'smoke.log');
const lineas = [];
let ok = 0;
let fallos = 0;
let base = '';

const escribir = (t) => { lineas.push(t); fs.writeFileSync(LOG, lineas.join('\n')); };

async function llamar(metodo, ruta, cuerpo, token) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
  return { status: res.status, data };
}

function verificar(nombre, condicion, detalle) {
  if (condicion) { ok += 1; escribir(`  OK    ${nombre}`); } else {
    fallos += 1;
    escribir(`  FALLO ${nombre}${detalle !== undefined ? ' -> ' + JSON.stringify(detalle).slice(0, 300) : ''}`);
  }
}

const stockDe = async (token, id) => (await llamar('GET', `/api/productos/${id}`, null, token)).data.stock;

async function parte1() {
  escribir('== Autenticación y permisos');
  const sinToken = await llamar('GET', '/api/productos');
  verificar('sin token -> 401', sinToken.status === 401, sinToken);
  const malo = await llamar('POST', '/api/auth/login', { username: 'admin', password: 'incorrecta' });
  verificar('contraseña incorrecta -> 401', malo.status === 401, malo);
  const a = await llamar('POST', '/api/auth/login', { username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'Admin123*' });
  verificar('login administrador', a.status === 200 && a.data.token && a.data.usuario.rol === 'administrador', a);
  const c = await llamar('POST', '/api/auth/login', { username: 'cajero', password: process.env.SEED_CAJERO_PASSWORD || 'Cajero123*' });
  verificar('login cajero', c.status === 200 && c.data.usuario.rol === 'cajero', c);
  const ta = a.data.token;
  const tc = c.data.token;
  verificar('GET /auth/me', (await llamar('GET', '/api/auth/me', null, tc)).data.usuario.username === 'cajero');
  verificar('cajero consulta productos', (await llamar('GET', '/api/productos', null, tc)).status === 200);
  verificar('cajero NO crea productos -> 403', (await llamar('POST', '/api/productos', { nombre: 'x', precio: 1 }, tc)).status === 403);
  verificar('cajero NO ve reportes -> 403', (await llamar('GET', '/api/reportes/ventas', null, tc)).status === 403);
  verificar('cajero NO ve proveedores -> 403', (await llamar('GET', '/api/proveedores', null, tc)).status === 403);

  escribir('== CRUDs (categoría, producto, cliente, proveedor, descuento)');
  const cat = await llamar('POST', '/api/categorias', { nombre: 'SMOKE Categoria', color: '#123456' }, ta);
  verificar('crear categoría', cat.status === 201, cat);
  const prod = await llamar('POST', '/api/productos', { nombre: 'SMOKE Producto', categoriaId: cat.data.id, costo: 500, precio: 1000, codigoInterno: `SMK-${Date.now()}`, stock: 10 }, ta);
  verificar('crear producto con stock 10', prod.status === 201 && prod.data.stock === 10, prod);
  const pid = prod.data.id;
  verificar('no elimina categoría con productos -> 409', (await llamar('DELETE', `/api/categorias/${cat.data.id}`, null, ta)).status === 409);
  verificar('precio negativo -> 400', (await llamar('POST', '/api/productos', { nombre: 'x', precio: -5 }, ta)).status === 400);
  const edit = await llamar('PUT', `/api/productos/${pid}`, { precio: 1200 }, tc);
  verificar('cajero edita producto en caliente', edit.status === 200 && edit.data.precio === 1200, edit);
  await llamar('PUT', `/api/productos/${pid}`, { precio: 1000 }, ta);
  const cli = await llamar('POST', '/api/clientes', { nombre: 'SMOKE Cliente', telefono: '3001234567' }, tc);
  verificar('cajero crea cliente', cli.status === 201, cli);
  const prov = await llamar('POST', '/api/proveedores', { nombre: 'SMOKE Proveedor', nit: `NIT-${Date.now()}`, telefono: '3109999999' }, ta);
  verificar('crear proveedor', prov.status === 201, prov);
  verificar('descuento 150% -> 400', (await llamar('POST', '/api/descuentos', { nombre: 'SMOKE malo', tipo: 'porcentaje', valor: 150 }, ta)).status === 400);
  const desc = await llamar('POST', '/api/descuentos', { nombre: `SMOKE 10% ${Date.now()}`, tipo: 'porcentaje', valor: 10 }, ta);
  verificar('crear descuento 10%', desc.status === 201, desc);

  return { ta, tc, pid, clienteId: cli.data.id, proveedorId: prov.data.id, descuentoId: desc.data.id, catId: cat.data.id };
}

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(new Date());

async function parte2(ctx) {
  const { ta, tc, pid, clienteId, descuentoId } = ctx;
  escribir('== Ventas, cierre e inventario');
  const v = await llamar('POST', '/api/ventas', { items: [{ productoId: pid, cantidad: 2 }], descuentoId }, tc);
  verificar('crear venta abierta: productos 2000, descuento 200, IVA 19% = 342, total 2142',
    v.status === 201 && v.data.subtotal === 2000 && v.data.descuentoMonto === 200 && v.data.ivaPorcentaje === 19 && v.data.ivaMonto === 342 && v.data.total === 2142, v);
  const vid = v.data.id;
  ctx.vid = vid;
  verificar('venta abierta no descuenta stock', (await stockDe(ta, pid)) === 10);
  verificar('efectivo insuficiente -> 400', (await llamar('POST', `/api/ventas/${vid}/cerrar`, { metodoPago: 'Efectivo', recibido: 1000 }, tc)).status === 400);
  verificar('efectivo sin IVA (1800 < 2142) -> 400', (await llamar('POST', `/api/ventas/${vid}/cerrar`, { metodoPago: 'Efectivo', recibido: 2000 }, tc)).status === 400);
  verificar('total enviado sin IVA (1800) no coincide con el recalculado -> 409',
    (await llamar('POST', `/api/ventas/${vid}/cerrar`, { metodoPago: 'Efectivo', recibido: 3000, total: 1800 }, tc)).status === 409);
  const cierre = await llamar('POST', `/api/ventas/${vid}/cerrar`, { metodoPago: 'Efectivo', recibido: 3000, total: 2142 }, tc);
  verificar('cerrar en efectivo con total 2142 (IVA incluido): cambio 858 y total guardado',
    cierre.status === 200 && cierre.data.estado === 'cerrada' && cierre.data.cambio === 858 && cierre.data.total === 2142 && cierre.data.ivaMonto === 342, cierre);
  verificar('cierre descuenta stock (8)', (await stockDe(ta, pid)) === 8);
  verificar('no cierra dos veces -> 409', (await llamar('POST', `/api/ventas/${vid}/cerrar`, { metodoPago: 'Transferencia' }, tc)).status === 409);

  const v2 = await llamar('POST', '/api/ventas', { items: [{ productoId: pid, cantidad: 1 }] }, tc);
  verificar('Debe sin cliente -> 400', (await llamar('POST', `/api/ventas/${v2.data.id}/cerrar`, { metodoPago: 'Debe' }, tc)).status === 400);
  const debe = await llamar('POST', `/api/ventas/${v2.data.id}/cerrar`, { metodoPago: 'Debe', clienteId }, tc);
  verificar('Debe con cliente cierra', debe.status === 200 && debe.data.clienteId === clienteId, debe);
  const grande = await llamar('POST', '/api/ventas', { items: [{ productoId: pid, cantidad: 500 }] }, tc);
  const neg = await llamar('POST', `/api/ventas/${grande.data.id}/cerrar`, { metodoPago: 'Transferencia' }, tc);
  verificar('stock negativo se rechaza indicando el producto (409)', neg.status === 409 && /SMOKE Producto/.test(neg.data.error), neg);
  verificar('rechazo no altera el stock (7)', (await stockDe(ta, pid)) === 7);
  verificar('descartar venta abierta', (await llamar('DELETE', `/api/ventas/${grande.data.id}`, null, tc)).status === 200);
  const vacia = await llamar('POST', '/api/ventas', {}, tc);
  verificar('venta vacía no se cierra -> 400', (await llamar('POST', `/api/ventas/${vacia.data.id}/cerrar`, { metodoPago: 'Transferencia' }, tc)).status === 400);
  await llamar('DELETE', `/api/ventas/${vacia.data.id}`, null, tc);
  await parte3(ctx);
}

async function parte3(ctx) {
  const { ta, tc, pid, clienteId, descuentoId, vid } = ctx;
  escribir('== Corrección de ventas cerradas');
  verificar('cajero NO corrige -> 403', (await llamar('PUT', `/api/ventas/${vid}/correccion`, { items: [{ productoId: pid, cantidad: 3 }] }, tc)).status === 403);
  const cor = await llamar('PUT', `/api/ventas/${vid}/correccion`, { items: [{ productoId: pid, cantidad: 3 }], metodoPago: 'Transferencia' }, ta);
  verificar('corrección: 3 uds, total 3213 (2700 + IVA 513), marcada como corregida',
    cor.status === 200 && cor.data.total === 3213 && cor.data.ivaMonto === 513 && cor.data.corregida && cor.data.corregidaPorNombre === 'Administrador', cor);
  verificar('corrección ajusta stock por diferencia (6)', (await stockDe(ta, pid)) === 6);
  verificar('corrección que deja stock negativo -> 409', (await llamar('PUT', `/api/ventas/${vid}/correccion`, { items: [{ productoId: pid, cantidad: 100 }] }, ta)).status === 409);
  verificar('stock intacto tras rechazo (6)', (await stockDe(ta, pid)) === 6);

  escribir('== Reembolsos');
  const parcial = { tipo: 'parcial', items: [{ productoId: pid, cantidad: 1, retornaInventario: true }] };
  verificar('cajero NO reembolsa -> 403', (await llamar('POST', `/api/ventas/${vid}/reembolsos`, parcial, tc)).status === 403);
  const prev = await llamar('POST', `/api/ventas/${vid}/reembolsos/previsualizar`, parcial, ta);
  verificar('vista previa respeta el descuento y el IVA (1071)', prev.status === 200 && prev.data.monto === 1071, prev);
  const r1 = await llamar('POST', `/api/ventas/${vid}/reembolsos`, parcial, ta);
  verificar('reembolso parcial: 1071, venta "parcial"', r1.status === 201 && r1.data.reembolso.monto === 1071 && r1.data.venta.estadoReembolso === 'parcial', r1);
  verificar('reembolso con retorno suma stock (7)', (await stockDe(ta, pid)) === 7);
  verificar('más de lo vendido -> 409', (await llamar('POST', `/api/ventas/${vid}/reembolsos`, { tipo: 'parcial', items: [{ productoId: pid, cantidad: 5, retornaInventario: true }] }, ta)).status === 409);
  const r2 = await llamar('POST', `/api/ventas/${vid}/reembolsos`, { tipo: 'total', retornaInventario: false }, ta);
  verificar('reembolso total del resto: 2142, venta "total"', r2.status === 201 && r2.data.reembolso.monto === 2142 && r2.data.venta.estadoReembolso === 'total', r2);
  verificar('sin retorno no cambia stock (7)', (await stockDe(ta, pid)) === 7);
  verificar('no corrige venta con reembolsos -> 409', (await llamar('PUT', `/api/ventas/${vid}/correccion`, { clienteId }, ta)).status === 409);

  escribir('== Descuento eliminado, historial, kardex');
  await llamar('DELETE', `/api/descuentos/${descuentoId}`, null, ta);
  const f = await llamar('GET', `/api/ventas/${vid}`, null, tc);
  verificar('eliminar descuento no altera ventas', f.data.descuento && f.data.total === 3213 && f.data.reembolsos.length === 2, f.data);
  const hist = await llamar('GET', `/api/ventas?estado=cerrada&metodoPago=Transferencia&desde=${hoy()}&hasta=${hoy()}`, null, tc);
  verificar('historial filtrado por fecha, estado y pago', hist.status === 200 && hist.data.some((x) => x.id === vid), hist.data.length);
  const tipos = (await llamar('GET', `/api/inventario/productos/${pid}/movimientos`, null, tc)).data.movimientos.map((m) => m.tipo);
  verificar('kardex con inicial, venta, correccion y reembolso', ['inicial', 'venta', 'correccion', 'reembolso'].every((t) => tipos.includes(t)), tipos);
  verificar('no elimina cliente con ventas -> 409', (await llamar('DELETE', `/api/clientes/${clienteId}`, null, ta)).status === 409);
  verificar('no elimina producto con ventas -> 409', (await llamar('DELETE', `/api/productos/${pid}`, null, ta)).status === 409);
  await parte4(ctx);
}

async function parte4(ctx) {
  const { ta, tc, pid, proveedorId } = ctx;
  escribir('== Compras');
  const compra = { proveedorId, items: [{ productoId: pid, cantidad: 5, costoUnitario: 600 }] };
  verificar('cajero NO registra compras -> 403', (await llamar('POST', '/api/compras', compra, tc)).status === 403);
  const cp = await llamar('POST', '/api/compras', compra, ta);
  verificar('registrar compra: total 3000', cp.status === 201 && cp.data.total === 3000 && cp.data.items.length === 1, cp);
  verificar('compra suma stock (12)', (await stockDe(ta, pid)) === 12);
  const pr = await llamar('GET', `/api/productos/${pid}`, null, ta);
  verificar('compra actualiza costo y proveedor del producto', pr.data.costo === 600 && pr.data.proveedores.length === 1, pr.data);
  const lista = await llamar('GET', `/api/compras?proveedorId=${proveedorId}`, null, ta);
  verificar('listar y detallar compras', lista.data.length === 1 && (await llamar('GET', `/api/compras/${cp.data.id}`, null, ta)).status === 200);
  verificar('no elimina proveedor con compras -> 409', (await llamar('DELETE', `/api/proveedores/${proveedorId}`, null, ta)).status === 409);
  await parte5(ctx);
}

async function parte5(ctx) {
  const { ta, tc, pid, proveedorId } = ctx;
  escribir('== Faltantes');
  const f1 = await llamar('POST', '/api/faltantes', { nombreProducto: 'Cofias', cantidad: 2, tipo: 'inexistente' }, tc);
  await llamar('POST', '/api/faltantes', { nombreProducto: 'cofía', cantidad: 3, tipo: 'inexistente', proveedorId }, tc);
  verificar('faltante registra nombre normalizado', f1.status === 201 && f1.data.nombreNormalizado === 'cofia', f1);
  const ag = await llamar('POST', '/api/faltantes', { productoId: pid, cantidad: 1, tipo: 'agotado' }, tc);
  verificar('faltante agotado de producto existente', ag.status === 201 && ag.data.producto === 'SMOKE Producto', ag);
  verificar('agotado sin producto -> 400', (await llamar('POST', '/api/faltantes', { nombreProducto: 'x', tipo: 'agotado' }, tc)).status === 400);
  verificar('stock no cambia por faltantes (12)', (await stockDe(ta, pid)) === 12);
  verificar('filtrar por tipo', (await llamar('GET', '/api/faltantes?tipo=inexistente', null, tc)).data.length >= 2);
  const rf = await llamar('GET', '/api/reportes/faltantes', null, ta);
  const cofia = rf.data.faltantes.find((x) => x.nombreNormalizado === 'cofia');
  verificar('"Cofias" y "cofía" se consolidan (2 solicitudes, 5 uds)', cofia && cofia.solicitudes === 2 && cofia.cantidadTotal === 5, rf.data);
  verificar('resolver faltante', (await llamar('PUT', `/api/faltantes/${f1.data.id}/resolver`, null, tc)).data.estado === 'resuelto');

  escribir('== Reportes');
  const q = `desde=${hoy()}&hasta=${hoy()}`;
  const rv = await llamar('GET', `/api/reportes/ventas?${q}`, null, ta);
  verificar('reporte de ventas con desglose por método', rv.status === 200 && rv.data.numeroVentas >= 2 && rv.data.porMetodoPago.length >= 2 && rv.data.reembolsos.total >= 2700, rv.data);
  const rp = await llamar('GET', `/api/reportes/productos-mas-vendidos?${q}`, null, ta);
  verificar('productos más vendidos', rp.status === 200 && rp.data.productos.some((x) => x.productoId === pid), rp.data);
  const rc = await llamar('GET', `/api/reportes/compras?${q}`, null, ta);
  verificar('reporte de compras por proveedor', rc.status === 200 && rc.data.numeroCompras >= 1 && rc.data.totalComprado >= 3000, rc.data);
  verificar('rango invertido -> 400', (await llamar('GET', '/api/reportes/ventas?desde=2026-12-31&hasta=2026-01-01', null, ta)).status === 400);
}

(async () => {
  const servidor = app.listen(0);
  base = `http://localhost:${servidor.address().port}`;
  try {
    const ctx = await parte1();
    await parte2(ctx);
  } catch (error) {
    fallos += 1;
    escribir(`  EXCEPCIÓN ${error.stack}`);
  } finally {
    escribir(`\nRESULTADO: ${ok} correctas, ${fallos} fallidas`);
    servidor.close();
    await pool.end();
    process.exit(fallos ? 1 : 0);
  }
})();
