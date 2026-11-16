// Pequeño "buzón" para pasar datos entre vistas (por ejemplo, del historial a la venta en corrección).
export const puente = { correccion: null };

// Navega a otra vista simulando el clic en el menú (así el router de app.js hace todo el trabajo).
export function irA(vista) {
  const boton = document.querySelector(`#nav [data-vista="${vista}"]`);
  if (boton) boton.click();
}
