// IVA de las ventas. Los precios del catálogo son precios base (sin IVA).
// Debe coincidir con backend/src/utils/impuestos.js (el backend es quien guarda el total definitivo).
export const IVA_PORCENTAJE = 19;

// Mismo redondeo a 2 decimales que usa el backend, para que ambos totales coincidan al centavo.
export const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
