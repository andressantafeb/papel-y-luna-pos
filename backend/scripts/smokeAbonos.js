// Pruebas de métodos de pago (Efectivo, Transferencia, Tarjeta, Debe), ventas a Debe con abonos,
// cuentas por cobrar, descuentos, faltantes y reportes.
//   npm run smoke:abonos
// Crea solo datos con prefijo "SMOKE ABONO" y los elimina al terminar (no toca el resto de la base).
const env = require('../src/config/env');
env.validarEntorno(['databaseUrl', 'jwtSecret']);
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { estado, escribir, limpiar } = require('./smokeAbonosLib');
const { preparar, cierreConAbono } = require('./smokeAbonosCierre');
const { cuentasPorCobrar, pagoFinalYReembolso } = require('./smokeAbonosCuentas');
const { metodosDePago, debeConTransferencia } = require('./smokePagos');
const { descuentos } = require('./smokeDescuentos');
const { reportes, faltantes } = require('./smokeReportes');

(async () => {
  const servidor = app.listen(0);
  estado.base = `http://localhost:${servidor.address().port}`;
  try {
    const ctx = await preparar();
    // Orden: las pruebas de cartera exigen saldos exactos, así que "Debe con transferencia" va después.
    const base = await cierreConAbono(ctx);
    await pagoFinalYReembolso(await cuentasPorCobrar(base));
    await debeConTransferencia(await metodosDePago(base));
    await descuentos(base);
    await faltantes(base);
    await reportes(base);
  } catch (error) {
    estado.fallos += 1;
    escribir(`  EXCEPCIÓN ${error.stack}`);
  } finally {
    try { await limpiar(); } catch (error) { estado.fallos += 1; escribir(`  LIMPIEZA INCOMPLETA: ${error.message}`); }
    escribir(`\nRESULTADO: ${estado.ok} correctas, ${estado.fallos} fallidas`);
    servidor.close();
    await pool.end();
    process.exit(estado.fallos ? 1 : 0);
  }
})();
