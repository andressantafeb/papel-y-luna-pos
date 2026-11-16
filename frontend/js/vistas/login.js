import { post } from '../api.js';
import { $, conCarga } from '../util.js';

export function montarLogin(contenedor, alAutenticar) {
  contenedor.innerHTML = `
    <div class="login-caja">
      <img src="img/logo.png" alt="Papel y Luna" class="login-logo">
      <span class="eyebrow" style="text-align:center">PAPEL Y LUNA</span>
      <h1 style="text-align:center">Iniciar sesión</h1>
      <p class="login-ayuda" style="text-align:center">Ingresa con tu usuario para abrir la caja.</p>
      <form id="form-login" novalidate>
        <label for="login-usuario">Usuario</label>
        <input id="login-usuario" type="text" autocomplete="username" autocapitalize="none" required>
        <label for="login-clave">Contraseña</label>
        <input id="login-clave" type="password" autocomplete="current-password" required>
        <p id="login-error" class="aviso-error oculto" role="alert"></p>
        <button type="submit" class="boton primario ancho" style="margin-top:16px">Entrar</button>
      </form>
    </div>`;

  const error = $('#login-error', contenedor);
  const usuarioInput = $('#login-usuario', contenedor);
  usuarioInput.focus();

  $('#form-login', contenedor).addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('oculto');
    const username = usuarioInput.value.trim();
    const password = $('#login-clave', contenedor).value;
    if (!username || !password) {
      error.textContent = 'Escribe tu usuario y tu contraseña.';
      error.classList.remove('oculto');
      return;
    }
    const boton = $('button[type="submit"]', contenedor);
    boton.disabled = true;
    try {
      const { token, usuario } = await post('/auth/login', { username, password });
      alAutenticar(token, usuario);
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('oculto');
    } finally {
      boton.disabled = false;
    }
  });
}
