const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const app = express();

const origenes = env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',').map((o) => o.trim());
app.use(cors({ origin: origenes }));
app.use(express.json({ limit: '1mb' }));

// Comprobación de salud (útil para el despliegue)
// `metodosPago` permite comprobar qué versión del código tiene cargada el proceso (si no coincide, hay que reiniciarlo).
app.get('/api/health', (req, res) => res.json({ estado: 'ok', metodosPago: require('./utils/metodosPago').METODOS_PAGO }));

// Ruta pública (sin autenticación ni token): autores del proyecto.
app.get('/authors', (req, res) => res.json([
  { nombre: 'Camila Sabogal', codigo: '371448' },
  { nombre: 'Juan Ramirez', codigo: '371125' },
  { nombre: 'Andres Santafe', codigo: '352369' }
]));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/ventas', require('./routes/ventaRoutes'));
app.use('/api/inventario', require('./routes/inventarioRoutes'));
app.use('/api/productos', require('./routes/productoRoutes'));
app.use('/api/compras', require('./routes/compraRoutes'));
app.use('/api/faltantes', require('./routes/faltanteRoutes'));
app.use('/api/reportes', require('./routes/reporteRoutes'));
app.use('/api/cuentas-por-cobrar', require('./routes/cuentaRoutes'));

const catalogos = require('./routes/catalogoRoutes');
app.use('/api/categorias', catalogos.categorias);
app.use('/api/proveedores', catalogos.proveedores);
app.use('/api/clientes', catalogos.clientes);
app.use('/api/descuentos', catalogos.descuentos);

// Sirve el frontend estático (carpeta ../frontend) para poder abrir todo desde http://localhost:3000
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
if (fs.existsSync(frontendDir)) app.use(express.static(frontendDir));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
