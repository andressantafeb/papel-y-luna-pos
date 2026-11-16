// Estructura HTML de la pantalla de venta (catálogo a la izquierda, ticket a la derecha).
export const PLANTILLA_VENTA = `
  <div class="venta-layout">
    <section class="catalogo-venta">
      <div class="vista-titulo">
        <div><span class="eyebrow">CAJA</span><h1 id="vt-titulo">Nueva venta</h1></div>
        <span class="acciones"><button type="button" class="boton secundario" id="vt-abiertas">Ventas guardadas</button>
        <button type="button" class="boton secundario" id="vt-faltante">+ Faltante</button></span>
      </div>
      <div id="vt-aviso-correccion" class="marca-corregida oculto"></div>
      <div class="buscador-wrap"><span aria-hidden="true">⌕</span><input id="vt-buscar" type="search" placeholder="Buscar producto o código" autocomplete="off"></div>
      <div id="vt-chips" class="chips" aria-label="Categorías"></div>
      <div id="vt-productos" class="lista-productos"></div>
    </section>
    <aside id="ticket" class="ticket">
      <div class="ticket-header"><div><span class="eyebrow">VENTA ACTUAL</span><h2 id="vt-ticket-titulo">Ticket</h2></div><button type="button" id="vt-cerrar-ticket" class="icono-boton" aria-label="Cerrar ticket">×</button></div>
      <div id="vt-items" class="lista-ticket"></div>
      <div class="ticket-footer">
        <div class="ticket-extra">
          <select id="vt-cliente" aria-label="Cliente"></select>
          <div class="form-inline">
            <div><input id="vt-cliente-nuevo" class="campo" type="text" maxlength="120" placeholder="Nombre de un cliente nuevo" aria-label="Nombre del cliente nuevo" autocomplete="off"></div>
            <button type="button" class="boton secundario" id="vt-cliente-crear">Crear</button>
          </div>
          <select id="vt-descuento" aria-label="Descuento"></select>
          <p id="vt-error" class="aviso-error oculto"></p>
        </div>
        <div id="vt-totales"></div>
        <button type="button" id="vt-cobrar" class="boton primario ancho" disabled>Cobrar venta</button>
        <button type="button" id="vt-guardar" class="boton secundario ancho">Guardar venta</button>
        <button type="button" id="vt-limpiar" class="boton texto ancho">Limpiar venta</button>
      </div>
    </aside>
    <div id="vt-backdrop" class="backdrop oculto"></div>
  </div>
  <button type="button" id="vt-abrir-ticket" class="boton-ticket-movil">Ver ticket</button>`;
