const env = require('./config/env');
env.validarEntorno(['databaseUrl', 'jwtSecret']);

const app = require('./app');
const { pool } = require('./config/db');

const servidor = app.listen(env.port, () => {
  console.log(`API Papel y Luna escuchando en http://localhost:${env.port}`);
});

// Cierre ordenado (Render, Railway, Ctrl+C)
function apagar() {
  servidor.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
