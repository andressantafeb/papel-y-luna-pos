# Papel y Luna – POS (MVP 3)

Sistema de punto de venta para una papelería. Arquitectura full-stack: **frontend** (HTML/CSS/JS vanilla) + **API REST** en Node.js/Express + **PostgreSQL**.

```
proyecto-pos/
├── backend/
│   ├── db/schema.sql          # Esquema de la base de datos
│   ├── scripts/               # initDb.js, seed.js (usuarios y datos iniciales), smoke.js (pruebas rápidas)
│   └── src/
│       ├── config/            # Entorno y conexión a PostgreSQL
│       ├── routes/            # Rutas por recurso
│       ├── controllers/       # Entrada/salida HTTP y validación
│       ├── services/          # Reglas de negocio y transacciones (ventas, inventario, reembolsos, compras)
│       ├── models/            # Consultas reutilizables
│       ├── middlewares/       # Autenticación (JWT), roles y errores
│       └── utils/
└── frontend/                  # HTML/CSS/JavaScript vanilla (módulos ES, sin dependencias)
    ├── index.html, css/       # Mismo estilo del MVP 1 (estilos.css) + extensiones (extra.css)
    └── js/                    # config, api (fetch + token), util, app (sesión y menú por rol), factura
        └── vistas/            # login, venta, historial, productos, clientes, faltantes, compras, catalogos, inventario, reportes
```

## Frontend

El backend sirve la carpeta `frontend/` como sitio estático: con el servidor en marcha, abre **http://localhost:3000** e inicia sesión.

| Rol | Pantallas |
|---|---|
| Cajero | Nueva venta (cobro en Efectivo, Transferencia con billetera o banco, Tarjeta o Debe con abono inicial, guardar/retomar, edición en caliente de productos), Ventas (historial y factura), Productos (consulta), Clientes, Cuentas por cobrar (registrar abonos), Faltantes |
| Administrador | Todo lo anterior + corrección de ventas y reembolsos (desde Ventas o directo desde la confirmación del cobro), Compras, Proveedores/categorías/descuentos, Inventario (kardex y ajustes), Reportes |

- La sesión se conserva en `localStorage` (token JWT) y se restaura al recargar; si el token expira se vuelve al login.
- El menú y las pantallas dependen del rol, pero **la autorización real la hace el backend** (responde 403).
- Para desplegar el frontend por separado, escribe la URL pública del API en `frontend/js/config.js` (`URL_API_DESPLEGADO`) y ajusta `CORS_ORIGIN` en el backend.

## Credenciales de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `Admin123*` |
| Cajero | `cajero` | `Cajero123*` |

Se crean con `npm run db:seed` (pueden cambiarse con `SEED_ADMIN_PASSWORD` y `SEED_CAJERO_PASSWORD` en el `.env`).

## Instalación del backend

Requisitos: Node.js 18 o superior y una base PostgreSQL (local o en la nube, por ejemplo Neon).

```bash
cd backend
npm install
cp .env.example .env      # en Windows: copy .env.example .env  y edita los valores
npm run db:setup          # crea las tablas y carga usuarios y datos de ejemplo
npm start                 # API en http://localhost:3000
```

> En Windows PowerShell, si `npm` está bloqueado por la política de scripts, usa `npm.cmd`.

Variables del `.env` (ver `.env.example`): `DATABASE_URL`, `DB_SSL` (`true` en bases en la nube), `JWT_SECRET`, `CORS_ORIGIN`, `APP_TIMEZONE`.

| Comando | Qué hace |
|---|---|
| `npm run db:init` | Crea las tablas que falten (no borra datos) |
| `npm run db:seed` | Crea/actualiza los usuarios y carga el catálogo de ejemplo si no hay productos |
| `npm run db:reset` | **Borra todo** y recrea las tablas (luego ejecuta `db:seed`) |
| `npm run smoke` | Pruebas rápidas de extremo a extremo (crean datos con prefijo "SMOKE") |
| `npm run smoke:abonos` | Pruebas de métodos de pago, abonos, cuentas por cobrar, descuentos, faltantes y reportes (borra lo que crea) |

## API

Todas las rutas son JSON bajo `/api`. Excepto `POST /auth/login` y `GET /health`, requieren `Authorization: Bearer <token>`.
Los errores responden `{ "error": "mensaje" }` con el código HTTP correspondiente (400 validación, 401 sesión, 403 rol, 404, 409 conflicto de negocio).

| Recurso | Endpoints | Rol |
|---|---|---|
| Sesión | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | todos |
| Ventas | `GET/POST /ventas`, `GET/PUT/DELETE /ventas/:id`, `POST /ventas/:id/cerrar` | admin y cajero |
| Corrección | `PUT /ventas/:id/correccion` | admin |
| Reembolsos | `POST /ventas/:id/reembolsos`, `POST /ventas/:id/reembolsos/previsualizar`, `GET /ventas/:id/reembolsos` | admin |
| Productos | `GET /productos`, `GET /productos/:id`, `PUT /productos/:id` (edición en caliente) | admin y cajero |
| | `POST /productos`, `DELETE /productos/:id` | admin |
| Categorías, descuentos | lectura | admin y cajero |
| | crear, editar, eliminar | admin |
| Proveedores, compras | todo | admin |
| Clientes | CRUD completo | admin y cajero |
| Faltantes | `GET/POST /faltantes`, `PUT /faltantes/:id/resolver`, `GET /faltantes/resumen` | admin y cajero |
| Inventario | `GET /inventario/movimientos`, `GET /inventario/productos/:id/movimientos` | admin y cajero |
| | `POST /inventario/ajustes` | admin |
| Reportes | `GET /reportes/ventas`, `/productos-mas-vendidos`, `/compras`, `/faltantes` (`?desde=&hasta=` AAAA-MM-DD) | admin |
| Cuentas por cobrar | `GET /cuentas-por-cobrar` (clientes con saldo y total de cartera) | admin y cajero |
| | `GET /cuentas-por-cobrar/clientes/:id` (ventas con saldo + historial de abonos) | admin y cajero |
| | `POST /cuentas-por-cobrar/clientes/:id/abonos` `{ monto, metodoPago: Efectivo\|Transferencia\|Tarjeta, billetera?, ventaId?, observacion? }` | admin y cajero |

**Métodos de pago:** `Efectivo`, `Transferencia`, `Tarjeta` y `Debe`. `POST /ventas/:id/cerrar` y `PUT /ventas/:id/correccion` reciben:

- `billetera` (texto opcional, máx. 60): billetera o banco de una `Transferencia` (Itaú, Daviplata, Nu, Bancolombia...). Se ignora con otros métodos.
- `abonoInicial` y `metodoAbono` (`Efectivo`, `Transferencia` o `Tarjeta`) cuando el pago es `Debe`. Si el abono es por `Transferencia`, `billetera` guarda su banco o billetera.

## Decisiones de diseño

- **Consistencia del inventario:** toda operación que toca ventas e inventario corre en una transacción PostgreSQL. Si algún producto quedaría con stock negativo se rechaza indicando cuál y no se guarda nada. Cada cambio de stock queda en `movimientos_inventario` (kardex).
- **Correcciones:** la venta conserva su id y queda marcada con quién y cuándo la corrigió; el stock se ajusta por la diferencia entre lo original y lo corregido.
- **Reembolsos:** respetan el descuento de forma proporcional; cada producto indica si vuelve al inventario. No se puede corregir una venta que ya tiene reembolsos.
- **Descuentos:** la venta guarda una copia del descuento, así que editar o eliminar el descuento no altera ventas registradas.
- **IVA (19 %):** los precios del catálogo son base (sin IVA). El IVA se calcula sobre `subtotal - descuento` y se suma al total: `total = base + IVA`. La tasa vive en `backend/src/utils/impuestos.js` (y su copia visual en `frontend/js/iva.js`; deben coincidir). El ticket muestra **Subtotal**, **IVA (19%)** y **Total a pagar**, y el comprobante/PDF muestra el mismo desglose.
  - La venta guarda `subtotal` (suma de productos), `descuento_monto`, `iva_porcentaje`, `iva_monto` y `total` (con IVA). Todo el sistema (cambio en efectivo, abono inicial, saldo de Debe, reembolsos, reportes) usa ese `total`; los reembolsos devuelven el IVA de forma proporcional.
  - `POST /ventas/:id/cerrar` acepta `total` (opcional, con IVA): si no coincide con el total que recalcula el servidor responde 409 y no cobra.
  - **Migración:** `npm run db:init` agrega `iva_porcentaje` e `iva_monto` sin borrar datos. Las ventas anteriores quedan con IVA 0 (su total no cambia) y su comprobante conserva el formato anterior.
- **Faltantes:** el nombre se normaliza (minúsculas, sin tildes, plural simple) para consolidar “Cofias” y “cofía”.
- **Integridad:** no se eliminan categorías, proveedores, clientes ni productos con registros asociados.
- **Ventas a crédito (Debe):**
  - Al cerrar se puede registrar un abono inicial (Efectivo, Transferencia o Tarjeta) que debe ser menor al total. Si el cliente paga todo, la venta se cobra en Efectivo, Transferencia o Tarjeta.
  - Cada pago queda como una fila de la tabla `abonos` (tipo `inicial` o `posterior`, método, monto, usuario y fecha). Es el libro de movimientos financieros de la cartera.
  - El saldo no se guarda: se calcula como `total - abonos - reembolsos` (mínimo 0), así no se desincroniza.
  - Un abono posterior sin `ventaId` se aplica a las ventas con saldo del cliente, de la más antigua a la más reciente. Con `ventaId` se aplica solo a esa venta. Nunca puede superar el saldo.
  - Los pagos del mismo cliente se serializan con bloqueos de fila para que dos cobros simultáneos no sobrepasen la deuda.
  - Una venta con abonos no puede cambiar de método de pago ni de cliente, ni bajar su total por debajo de lo abonado.
  - El reporte de ventas incluye los abonos recibidos en el periodo (por fecha del pago) y la cartera total por cobrar.
- **Migración:** `npm run db:init` agrega las columnas `abono_inicial`, `metodo_abono` y `billetera` y la tabla `abonos` sin borrar datos. Las ventas a Debe anteriores quedan con abono inicial 0 y su saldo completo pendiente.
- **Reembolso en ventas a Debe con abonos:** el saldo es `total - abonado - reembolsado` (mínimo 0). El reembolso baja primero la deuda; si el cliente ya había pagado más de lo que le correspondía, el excedente es dinero **a devolver al cliente**. Ej.: total 100, abonado 60 (saldo 40), reembolso de 50 → baja la deuda 40 y se devuelven 10. `POST /ventas/:id/reembolsos/previsualizar` y `POST /ventas/:id/reembolsos` devuelven `reduceDeuda`, `devuelto`, `saldoAntes` y `saldoDespues`; el detalle de la venta incluye `reduceDeuda`/`devuelto` por reembolso y `totalDevuelto`. No requiere columnas nuevas (se calcula con abonos y reembolsos existentes). La app **informa** cuánto devolver pero no registra el egreso de caja.
- **Identidad visual:** paleta oscura (verde bosque `#14231c`), acento esmeralda (`#1f8f63`) y detalles dorados (`#e2a919`, la luna del logo). Las variables están al inicio de `frontend/css/extra.css`.
- **Menú móvil:** bajo 760 px aparece la hamburguesa y el menú se abre como panel lateral con un icono por módulo (`frontend/js/iconos.js`). Se cierra con la X, el fondo, Escape o al elegir un módulo.
- **Validación estricta de métodos:** el servidor solo acepta `Efectivo`, `Transferencia`, `Tarjeta` y `Debe` (abonos: sin `Debe`). La lista vive en `backend/src/utils/metodosPago.js` y se aplica en el controlador, en `resolverPago`, en `abonoService` y con restricciones `CHECK` en la base. Cualquier otro valor responde 400.
- **Reiniciar el backend tras cambiar código:** `npm start` no recarga solo (para eso existe `npm run dev`). Si el cobro responde `El campo "metodoPago" debe ser uno de: ...` con una lista distinta de Efectivo, Transferencia, Tarjeta y Debe, hay un proceso viejo en el puerto 3000: ciérralo y vuelve a iniciar. `GET /api/health` devuelve `metodosPago`, que muestra la lista que tiene cargada el servidor en ejecución.
- **Compras y faltantes:** al registrar una compra se suma el stock y se resuelven los faltantes pendientes de los productos comprados: los ligados a un producto (agotados) y los descritos en texto (inexistentes) cuyo nombre normalizado coincide con el del producto. La respuesta de `POST /compras` incluye `faltantesResueltos`.
- **Edición de productos por rol:** crear, editar y eliminar desde el módulo Productos es solo del administrador (la pantalla oculta "Editar" al cajero). El cajero edita un producto únicamente desde el ticket de venta (edición en caliente); por eso `PUT /productos/:id` sigue permitido para ambos roles en la API.
- **Billetera o banco:** es un input de texto plano y libre (máx. 60 caracteres), sin lista desplegable, sugerencias ni autocompletado.
- **Impresión (Ctrl + P):** `extra.css` define la impresión normal: oculta menú, barra superior, botones y filtros y muestra el contenido de la vista. Con una factura abierta se imprime solo la factura.
- **Métodos de pago:** la migración de `schema.sql` convierte cualquier método obsoleto de versiones anteriores a `Transferencia` y conserva su valor original como billetera. La billetera o banco es texto libre y opcional (no una lista cerrada), porque el cajero puede encontrar cualquier entidad.
