import { reactive } from 'vue'

/*
 * Sesión contra el backend Django (backend/). Se usan JWT en el header Authorization:
 * el access dura poco y el refresh renueva la sesión sin pedir la contraseña otra vez.
 */

// En desarrollo apunta al mismo host que sirve Vite, para que funcione también desde el teléfono.
const API = (import.meta.env.VITE_API_URL ?? `http://${location.hostname}:8000`).replace(/\/$/, '')
const KEY = 'sello.tokens'

export const sesion = reactive({ usuario: null, lista: false })

const leerTokens = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

const guardarTokens = (tokens) => {
  try {
    if (tokens) localStorage.setItem(KEY, JSON.stringify(tokens))
    else localStorage.removeItem(KEY)
  } catch {
    // Sin almacenamiento (modo privado): la sesión dura lo que dure la pestaña.
  }
}

let tokens = leerTokens()

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { res, data: await res.json().catch(() => ({})) }
}

async function renovar() {
  if (!tokens.refresh) return false
  const { res, data } = await post('/api/auth/refresh/', { refresh: tokens.refresh })
  if (!res.ok) return false
  tokens = { ...tokens, access: data.access }
  guardarTokens(tokens)
  return true
}

/** fetch autenticado; si el access expiró lo renueva una vez y reintenta. */
export async function api(path, opts = {}) {
  const pedir = () =>
    fetch(`${API}${path}`, {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${tokens.access}` },
    })
  let res = await pedir()
  if (res.status === 401 && (await renovar())) res = await pedir()
  if (res.status === 401) cerrarSesion()
  return res
}

export async function iniciarSesion(username, password) {
  let res, data
  try {
    ;({ res, data } = await post('/api/auth/login/', { username, password }))
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }
  if (res.status === 429) throw new Error('Demasiados intentos. Espera un minuto.')
  if (!res.ok) throw new Error('Usuario o contraseña incorrectos.')
  tokens = { access: data.access, refresh: data.refresh }
  guardarTokens(tokens)
  sesion.usuario = data.usuario
}

export function cerrarSesion() {
  tokens = {}
  guardarTokens(null)
  sesion.usuario = null
}

/** Recupera la sesión guardada al abrir la página. */
export async function restaurarSesion() {
  try {
    if (tokens.access) {
      const res = await api('/api/auth/yo/')
      if (res.ok) sesion.usuario = await res.json()
    }
  } catch {
    // Servidor caído: se muestra el login y el error aparecerá al intentar entrar.
  } finally {
    sesion.lista = true
  }
}
