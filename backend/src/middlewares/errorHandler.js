const { HttpError } = require('../utils/httpError');

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Traduce errores de PostgreSQL a respuestas HTTP comprensibles.
function traducirErrorPg(error) {
  switch (error.code) {
    case '23505':
      return { status: 409, mensaje: 'Ya existe un registro con ese valor único.' };
    case '23503':
      return { status: 409, mensaje: 'La operación viola una relación con otros registros (referencia inexistente o registros asociados).' };
    case '23514':
      return { status: 400, mensaje: 'Algún valor enviado no cumple las reglas de validación de la base de datos.' };
    case '23502':
      return { status: 400, mensaje: 'Falta un dato obligatorio.' };
    case '22P02':
    case '22003':
      return { status: 400, mensaje: 'Algún valor enviado tiene un formato inválido.' };
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (error instanceof HttpError) {
    const cuerpo = { error: error.message };
    if (error.detalles) cuerpo.detalles = error.detalles;
    return res.status(error.status).json(cuerpo);
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }

  const traducido = traducirErrorPg(error);
  if (traducido) {
    console.error('[DB]', error.code, error.detail || error.message);
    return res.status(traducido.status).json({ error: traducido.mensaje });
  }

  console.error('[ERROR]', error);
  return res.status(500).json({ error: 'Error interno del servidor. Intenta de nuevo.' });
}

module.exports = { notFoundHandler, errorHandler };
