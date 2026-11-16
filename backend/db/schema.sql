-- =====================================================================
-- Papel y Luna POS - Esquema PostgreSQL (MVP 3)
-- Idempotente: se puede ejecutar varias veces (CREATE ... IF NOT EXISTS).
-- Para reiniciar desde cero: npm run db:reset
-- =====================================================================

-- ---------- Usuarios y roles ----------
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  rol           VARCHAR(20)  NOT NULL CHECK (rol IN ('administrador', 'cajero')),
  activo        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- Entidades de negocio ----------
CREATE TABLE IF NOT EXISTS categorias (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  color  VARCHAR(20) NOT NULL DEFAULT '#6c757d',
  icono  VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id       SERIAL PRIMARY KEY,
  nombre   VARCHAR(120) NOT NULL,
  nit      VARCHAR(30)  NOT NULL UNIQUE,
  telefono VARCHAR(30)  NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id       SERIAL PRIMARY KEY,
  nombre   VARCHAR(120) NOT NULL,
  telefono VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS descuentos (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  tipo   VARCHAR(12)  NOT NULL CHECK (tipo IN ('porcentaje', 'fijo')),
  valor  NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  CONSTRAINT descuento_porcentaje_max CHECK (tipo <> 'porcentaje' OR valor <= 100)
);

-- ---------- Productos ----------
CREATE TABLE IF NOT EXISTS productos (
  id                     SERIAL PRIMARY KEY,
  nombre                 VARCHAR(150) NOT NULL,
  categoria_id           INTEGER REFERENCES categorias(id) ON DELETE RESTRICT,
  costo                  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  precio                 NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  codigo_interno         VARCHAR(50) UNIQUE,
  seguimiento_inventario BOOLEAN NOT NULL DEFAULT TRUE,
  stock                  INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relación producto-proveedor con el costo de compra de cada proveedor
CREATE TABLE IF NOT EXISTS producto_proveedor (
  producto_id  INTEGER NOT NULL REFERENCES productos(id)   ON DELETE CASCADE,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  costo        NUMERIC(12,2) NOT NULL CHECK (costo >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (producto_id, proveedor_id)
);

-- ---------- Ventas ----------
CREATE TABLE IF NOT EXISTS ventas (
  id               SERIAL PRIMARY KEY,
  estado           VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  cliente_id       INTEGER REFERENCES clientes(id) ON DELETE RESTRICT,
  metodo_pago      VARCHAR(20), -- Efectivo | Transferencia | Tarjeta | Debe (CHECK: venta_metodo_pago_valido, al final del archivo)
  recibido         NUMERIC(12,2) CHECK (recibido >= 0),
  cambio           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cambio >= 0),
  -- Descuento: referencia al catálogo + copia (snapshot) para no alterar ventas
  -- ya registradas si el descuento se edita o se elimina.
  descuento_id     INTEGER REFERENCES descuentos(id) ON DELETE SET NULL,
  descuento_nombre VARCHAR(100),
  descuento_tipo   VARCHAR(12),
  descuento_valor  NUMERIC(12,2),
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  descuento_monto  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (descuento_monto >= 0),
  total            NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrada_en       TIMESTAMPTZ,
  -- Trazabilidad de correcciones (RN-06, RNF-06)
  corregida        BOOLEAN NOT NULL DEFAULT FALSE,
  corregida_por    INTEGER REFERENCES usuarios(id),
  corregida_en     TIMESTAMPTZ,
  estado_reembolso VARCHAR(10) NOT NULL DEFAULT 'ninguno' CHECK (estado_reembolso IN ('ninguno', 'parcial', 'total')),
  CONSTRAINT venta_cerrada_con_pago CHECK (estado = 'abierta' OR metodo_pago IS NOT NULL),
  CONSTRAINT venta_debe_con_cliente CHECK (estado = 'abierta' OR metodo_pago <> 'Debe' OR cliente_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS venta_items (
  id              SERIAL PRIMARY KEY,
  venta_id        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  nombre_producto VARCHAR(150) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  UNIQUE (venta_id, producto_id)
);

-- ---------- Reembolsos ----------
CREATE TABLE IF NOT EXISTS reembolsos (
  id          SERIAL PRIMARY KEY,
  venta_id    INTEGER NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  observacion VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reembolso_items (
  id                 SERIAL PRIMARY KEY,
  reembolso_id       INTEGER NOT NULL REFERENCES reembolsos(id) ON DELETE CASCADE,
  producto_id        INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad           INTEGER NOT NULL CHECK (cantidad > 0),
  monto              NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  retorna_inventario BOOLEAN NOT NULL
);

-- ---------- Compras ----------
CREATE TABLE IF NOT EXISTS compras (
  id           SERIAL PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  total        NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  observacion  VARCHAR(300),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compra_items (
  id             SERIAL PRIMARY KEY,
  compra_id      INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id    INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad       INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
  subtotal       NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  UNIQUE (compra_id, producto_id)
);

-- ---------- Libro de movimientos de inventario (transacciones de inventario) ----------
-- cantidad: variación con signo (+ entra, - sale).
-- stock_resultante: stock del producto después del movimiento.
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id               BIGSERIAL PRIMARY KEY,
  producto_id      INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo             VARCHAR(12) NOT NULL CHECK (tipo IN ('inicial', 'venta', 'correccion', 'reembolso', 'compra', 'ajuste')),
  cantidad         INTEGER NOT NULL CHECK (cantidad <> 0),
  stock_resultante INTEGER NOT NULL CHECK (stock_resultante >= 0),
  venta_id         INTEGER REFERENCES ventas(id)     ON DELETE SET NULL,
  compra_id        INTEGER REFERENCES compras(id)    ON DELETE SET NULL,
  reembolso_id     INTEGER REFERENCES reembolsos(id) ON DELETE SET NULL,
  usuario_id       INTEGER REFERENCES usuarios(id),
  nota             VARCHAR(300),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Faltantes (demanda no atendida) ----------
CREATE TABLE IF NOT EXISTS faltantes (
  id                 SERIAL PRIMARY KEY,
  producto_id        INTEGER REFERENCES productos(id)   ON DELETE SET NULL,
  nombre_producto    VARCHAR(150) NOT NULL,
  nombre_normalizado VARCHAR(150) NOT NULL,
  cantidad           INTEGER NOT NULL CHECK (cantidad > 0),
  tipo               VARCHAR(12) NOT NULL CHECK (tipo IN ('inexistente', 'agotado')),
  proveedor_id       INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  observacion        VARCHAR(300),
  estado             VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelto')),
  usuario_id         INTEGER REFERENCES usuarios(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelto_en        TIMESTAMPTZ
);

-- ---------- Ventas a crédito ("Debe"): abono inicial y abonos posteriores ----------
-- Migración idempotente (MVP 3.1): se aplica igual en bases nuevas y en bases ya creadas
-- (npm run db:init no borra datos). Las ventas "Debe" anteriores quedan con abono inicial 0.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS abono_inicial NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS metodo_abono  VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_abono_no_negativo' AND conrelid = 'ventas'::regclass) THEN
    ALTER TABLE ventas ADD CONSTRAINT venta_abono_no_negativo CHECK (abono_inicial >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_metodo_abono_valido' AND conrelid = 'ventas'::regclass) THEN
    ALTER TABLE ventas ADD CONSTRAINT venta_metodo_abono_valido CHECK (metodo_abono IS NULL OR metodo_abono IN ('Efectivo', 'Transferencia', 'Tarjeta'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_abono_con_metodo' AND conrelid = 'ventas'::regclass) THEN
    ALTER TABLE ventas ADD CONSTRAINT venta_abono_con_metodo CHECK (abono_inicial = 0 OR metodo_abono IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_abono_solo_debe' AND conrelid = 'ventas'::regclass) THEN
    ALTER TABLE ventas ADD CONSTRAINT venta_abono_solo_debe CHECK (abono_inicial = 0 OR metodo_pago = 'Debe');
  END IF;
END $$;

-- Libro de abonos (movimiento financiero de cada pago recibido sobre una venta a Debe).
-- tipo 'inicial'   = abono entregado al cerrar la venta.
-- tipo 'posterior' = pago registrado después desde "Cuentas por cobrar".
-- Saldo pendiente de una venta = total - SUM(abonos) - SUM(reembolsos), nunca menor que 0.
CREATE TABLE IF NOT EXISTS abonos (
  id          SERIAL PRIMARY KEY,
  venta_id    INTEGER NOT NULL REFERENCES ventas(id)   ON DELETE RESTRICT,
  cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('inicial', 'posterior')),
  metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta')),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  observacion VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_abonos_venta   ON abonos (venta_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cliente ON abonos (cliente_id, created_at);
CREATE INDEX IF NOT EXISTS idx_abonos_fecha   ON abonos (created_at);


-- ---------- Índices ----------
CREATE INDEX IF NOT EXISTS idx_ventas_estado     ON ventas (estado);
CREATE INDEX IF NOT EXISTS idx_ventas_created_at ON ventas (created_at);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente    ON ventas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items (venta_id);
CREATE INDEX IF NOT EXISTS idx_reembolsos_venta  ON reembolsos (venta_id);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras (proveedor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mov_producto      ON movimientos_inventario (producto_id, created_at);
CREATE INDEX IF NOT EXISTS idx_faltantes_estado  ON faltantes (estado, nombre_normalizado);

-- ---------- Métodos de pago (MVP 3.2): Efectivo, Transferencia, Tarjeta y Debe ----------
-- Idempotente y sin pérdida de datos: cualquier método obsoleto de versiones anteriores pasa a "Transferencia" y su valor original se conserva en
-- `billetera` (billetera o banco de la transferencia; texto libre y opcional: Itaú, Daviplata, Nu, Bancolombia...).
-- En ventas, `billetera` corresponde al pago por Transferencia o, en una venta a Debe, a su abono inicial.
ALTER TABLE ventas ALTER COLUMN metodo_pago  TYPE VARCHAR(20);
ALTER TABLE ventas ALTER COLUMN metodo_abono TYPE VARCHAR(20);
ALTER TABLE abonos ALTER COLUMN metodo_pago  TYPE VARCHAR(20);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS billetera VARCHAR(60);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS billetera VARCHAR(60);

ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS venta_metodo_pago_valido;
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS venta_metodo_abono_valido;
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS venta_billetera_coherente;
ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abonos_metodo_pago_check;
ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abono_metodo_pago_valido;
ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abono_billetera_coherente;

UPDATE ventas SET billetera = COALESCE(billetera, LEFT(metodo_pago, 60)), metodo_pago = 'Transferencia'
  WHERE metodo_pago IS NOT NULL AND metodo_pago NOT IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Debe');
UPDATE ventas SET billetera = COALESCE(billetera, LEFT(metodo_abono, 60)), metodo_abono = 'Transferencia'
  WHERE metodo_abono IS NOT NULL AND metodo_abono NOT IN ('Efectivo', 'Transferencia', 'Tarjeta');
UPDATE abonos SET billetera = COALESCE(billetera, LEFT(metodo_pago, 60)), metodo_pago = 'Transferencia'
  WHERE metodo_pago NOT IN ('Efectivo', 'Transferencia', 'Tarjeta');

ALTER TABLE ventas ADD CONSTRAINT venta_metodo_pago_valido
  CHECK (metodo_pago IS NULL OR metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Debe'));
ALTER TABLE ventas ADD CONSTRAINT venta_metodo_abono_valido
  CHECK (metodo_abono IS NULL OR metodo_abono IN ('Efectivo', 'Transferencia', 'Tarjeta'));
ALTER TABLE ventas ADD CONSTRAINT venta_billetera_coherente
  CHECK (billetera IS NULL OR metodo_pago = 'Transferencia' OR metodo_abono = 'Transferencia');
ALTER TABLE abonos ADD CONSTRAINT abono_metodo_pago_valido
  CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta'));
ALTER TABLE abonos ADD CONSTRAINT abono_billetera_coherente
  CHECK (billetera IS NULL OR metodo_pago = 'Transferencia');

-- ---------- IVA (19 %) ----------
-- Los precios del catálogo son base (sin IVA). La venta guarda la tasa aplicada y el monto del IVA, calculado sobre
-- (subtotal - descuento_monto); `total` ya incluye el IVA. Idempotente y sin pérdida de datos: las ventas anteriores
-- quedan con tasa 0 (su total no cambia) y la factura las muestra con el formato anterior.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS iva_porcentaje NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (iva_porcentaje >= 0 AND iva_porcentaje <= 100);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS iva_monto      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (iva_monto >= 0);

