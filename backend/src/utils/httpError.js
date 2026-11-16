// Error con código HTTP para respuestas consistentes (RNF-01).
class HttpError extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

const badRequest = (mensaje, detalles) => new HttpError(400, mensaje, detalles);
const unauthorized = (mensaje = 'No autenticado.') => new HttpError(401, mensaje);
const forbidden = (mensaje = 'No tienes permiso para esta acción.') => new HttpError(403, mensaje);
const notFound = (mensaje = 'Recurso no encontrado.') => new HttpError(404, mensaje);
const conflict = (mensaje, detalles) => new HttpError(409, mensaje, detalles);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
