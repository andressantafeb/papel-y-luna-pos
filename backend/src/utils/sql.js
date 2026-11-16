const env = require('../config/env');

/**
 * Agrega condiciones de rango de fechas (AAAA-MM-DD, ambos extremos inclusive)
 * interpretadas en la zona horaria del negocio. Modifica `params` y devuelve las condiciones.
 */
function condicionesRango(columna, desde, hasta, params) {
  const condiciones = [];
  if (desde) {
    params.push(desde, env.timezone);
    condiciones.push(`${columna} >= ($${params.length - 1}::date)::timestamp AT TIME ZONE $${params.length}::text`);
  }
  if (hasta) {
    params.push(hasta, env.timezone);
    condiciones.push(`${columna} < (($${params.length - 1}::date) + 1)::timestamp AT TIME ZONE $${params.length}::text`);
  }
  return condiciones;
}

// Paginación segura: limit por defecto 100, máximo 500.
function paginacion(limit, offset) {
  const l = Number.parseInt(limit, 10);
  const o = Number.parseInt(offset, 10);
  return {
    limit: Number.isInteger(l) && l > 0 ? Math.min(l, 500) : 100,
    offset: Number.isInteger(o) && o > 0 ? o : 0
  };
}

module.exports = { condicionesRango, paginacion };
