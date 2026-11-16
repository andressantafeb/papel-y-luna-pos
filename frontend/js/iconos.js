// Iconos del menú (SVG en línea, trazo con el color del texto). Una clave por vista de app.js.
const svg = (trazos) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${trazos}</svg>`;

export const ICONOS = {
  // Carrito: nueva venta
  venta: svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/>'),
  // Reloj con flecha: historial de ventas
  historial: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>'),
  // Caja: productos
  productos: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
  // Dos personas: clientes
  clientes: svg('<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.4-3.5 3-5.5 6.2-5.5s5.8 2 6.2 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.6c2.4.2 4 1.9 4.4 4.4"/>'),
  // Billetera: cuentas por cobrar
  cuentas: svg('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><path d="M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z"/><circle cx="16.5" cy="13.5" r="1.2"/>'),
  // Triángulo de aviso: faltantes
  faltantes: svg('<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5"/><path d="M12 17.2v.1"/>'),
  // Bolsa: compras
  compras: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  // Etiqueta: descuentos
  descuentos: svg('<path d="M3 12.5V4h8.5L21 13.5 13.5 21z"/><circle cx="7.5" cy="8.5" r="1.1"/>'),
  // Cuadrícula: proveedores y categorías
  catalogos: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>'),
  // Capas apiladas: inventario
  inventario: svg('<path d="M12 3 3 7.5l9 4.5 9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5 12 21l9-4.5"/>'),
  // Barras: reportes
  reportes: svg('<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="11" width="3" height="6.5" rx=".6"/><rect x="13" y="7" width="3" height="10.5" rx=".6"/>')
};

// Botón de hamburguesa (tres líneas).
export const ICONO_HAMBURGUESA = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" focusable="false"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>';
