const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const env = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: process.env.DB_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  timezone: process.env.APP_TIMEZONE || 'America/Bogota'
};

const NOMBRES_VARIABLES = {
  databaseUrl: 'DATABASE_URL',
  jwtSecret: 'JWT_SECRET'
};

// Termina el proceso si falta alguna variable obligatoria.
function validarEntorno(claves) {
  const faltantes = claves.filter((clave) => !env[clave]).map((clave) => NOMBRES_VARIABLES[clave] || clave);
  if (faltantes.length) {
    console.error(`Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. Revisa tu archivo .env (ver .env.example).`);
    process.exit(1);
  }
}

module.exports = { ...env, validarEntorno };
