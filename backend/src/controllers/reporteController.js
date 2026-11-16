const { query } = require('../config/db');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest } = require('../utils/httpError');
const { fecha, entero } = require('../utils/validators');
const { condicionesRango } = require('../utils/sql');

// Hoy (AAAA-MM-DD) en la zona horaria del negocio.
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(new Date());

// Rango de fechas inclusivo; sin parámetros usa el día de hoy (rango mínimo de 1 día).
function leerRango(req) {
  const desde = fecha(req.query.desde, 'desde') || hoy();
  const hasta = fecha(req.query.hasta, 'hasta') || desde;
  if (hasta < desde) throw badRequest('La fecha "hasta" no puede ser anterior a "desde".');
  return { desde, hasta };
}

// GET /api/reportes/ventas?desde=&hasta=
// Ventas cerradas por fecha de cierre: total vendido, cantidad, desglose por método de pago y reembolsos del periodo.
const ventas = asyncHandler(async (req, res) => {
  const { desde, hasta } = leerRango(req);
  const params = [];
  const rango = condicionesRango('v.cerrada_en', desde, hasta, params).join(' AND ');
  const { rows: porMetodo } = await query(
    `SELECT v.metodo_pago AS "metodoPago", COUNT(*)::int AS ventas, COALESCE(SUM(v.total), 0) AS total
       FROM ventas v WHERE v.estado = 'cerrada' AND ${rango}
      GROUP BY v.metodo_pago ORDER BY v.metodo_pago`,
    params
  );
  const paramsReem = [];
  const rangoReem = condicionesRango('r.created_at', desde, hasta, paramsReem).join(' AND ');
  const { rows: reem } = await query(
    `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(r.monto), 0) AS total FROM reembolsos r WHERE ${rangoReem}`,
    paramsReem
  );

  // Abonos recibidos en el periodo (por fecha del pago): inicial al cerrar + posteriores.
  const paramsAb = [];
  const rangoAb = condicionesRango('a.created_at', desde, hasta, paramsAb).join(' AND ');
  const { rows: abonosMetodo } = await query(
    `SELECT a.metodo_pago AS "metodoPago", COUNT(*)::int AS pagos, SUM(a.monto) AS total
       FROM abonos a WHERE ${rangoAb} GROUP BY a.metodo_pago ORDER BY a.metodo_pago`,
    paramsAb
  );
  const { rows: cartera } = await query(
    `SELECT COALESCE(SUM(GREATEST(0, v.total - COALESCE(a.abonado, 0) - COALESCE(r.reembolsado, 0))), 0) AS total
       FROM ventas v
       LEFT JOIN (SELECT venta_id, SUM(monto) AS abonado FROM abonos GROUP BY venta_id) a ON a.venta_id = v.id
       LEFT JOIN (SELECT venta_id, SUM(monto) AS reembolsado FROM reembolsos GROUP BY venta_id) r ON r.venta_id = v.id
      WHERE v.estado = 'cerrada' AND v.metodo_pago = 'Debe'`
  );

  const totalVendido = porMetodo.reduce((s, m) => s + m.total, 0);
  res.json({
    abonos: {
      total: Math.round(abonosMetodo.reduce((s, m) => s + m.total, 0) * 100) / 100,
      numeroPagos: abonosMetodo.reduce((s, m) => s + m.pagos, 0),
      porMetodoPago: abonosMetodo
    },
    totalPorCobrar: cartera[0].total,
    desde,
    hasta,
    totalVendido,
    numeroVentas: porMetodo.reduce((s, m) => s + m.ventas, 0),
    porMetodoPago: porMetodo,
    reembolsos: reem[0],
    totalNeto: Math.round((totalVendido - reem[0].total) * 100) / 100
  });
});

// GET /api/reportes/productos-mas-vendidos?desde=&hasta=&limite=10
const productosMasVendidos = asyncHandler(async (req, res) => {
  const { desde, hasta } = leerRango(req);
  const limite = req.query.limite ? entero(req.query.limite, 'limite', { min: 1 }) : 10;
  const params = [];
  const rango = condicionesRango('v.cerrada_en', desde, hasta, params).join(' AND ');
  params.push(Math.min(limite, 100));
  const { rows } = await query(
    `SELECT vi.producto_id AS "productoId", vi.nombre_producto AS producto,
            SUM(vi.cantidad)::int AS unidades, SUM(vi.subtotal) AS "totalVendido"
       FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
      WHERE v.estado = 'cerrada' AND ${rango}
      GROUP BY vi.producto_id, vi.nombre_producto
      ORDER BY unidades DESC, "totalVendido" DESC
      LIMIT $${params.length}`,
    params
  );
  res.json({ desde, hasta, productos: rows });
});

// GET /api/reportes/compras?desde=&hasta=  (total, cantidad y desglose por proveedor)
const compras = asyncHandler(async (req, res) => {
  const { desde, hasta } = leerRango(req);
  const params = [];
  const rango = condicionesRango('c.created_at', desde, hasta, params).join(' AND ');
  const { rows: porProveedor } = await query(
    `SELECT c.proveedor_id AS "proveedorId", pr.nombre AS proveedor, COUNT(*)::int AS compras, SUM(c.total) AS total
       FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id
      WHERE ${rango} GROUP BY c.proveedor_id, pr.nombre ORDER BY total DESC`,
    params
  );
  res.json({
    desde,
    hasta,
    totalComprado: Math.round(porProveedor.reduce((s, p) => s + p.total, 0) * 100) / 100,
    numeroCompras: porProveedor.reduce((s, p) => s + p.compras, 0),
    porProveedor
  });
});

// GET /api/reportes/faltantes?limite=20 -> productos con más solicitudes (agrupados por nombre normalizado)
const faltantes = asyncHandler(async (req, res) => {
  const limite = req.query.limite ? entero(req.query.limite, 'limite', { min: 1 }) : 20;
  const { rows } = await query(
    `SELECT f.nombre_normalizado AS "nombreNormalizado",
            (ARRAY_AGG(f.nombre_producto ORDER BY f.created_at DESC))[1] AS producto,
            COUNT(*)::int AS solicitudes, SUM(f.cantidad)::int AS "cantidadTotal",
            MAX(f.created_at) AS "ultimaSolicitud",
            CASE WHEN BOOL_OR(f.estado = 'pendiente') THEN 'pendiente' ELSE 'resuelto' END AS estado
       FROM faltantes f GROUP BY f.nombre_normalizado
      ORDER BY solicitudes DESC, "ultimaSolicitud" DESC LIMIT $1`,
    [Math.min(limite, 100)]
  );
  res.json({ faltantes: rows });
});

module.exports = { ventas, productosMasVendidos, compras, faltantes };
