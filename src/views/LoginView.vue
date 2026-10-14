<script setup>
import { computed, reactive, ref } from 'vue'
import { iniciarSesion, registrarse } from '../lib/auth'

const modo = ref('entrar') // 'entrar' | 'registro'
const registro = computed(() => modo.value === 'registro')

const form = reactive({ nombre: '', email: '', username: '', password: '' })
const error = ref('')
const campos = ref({})
const enviando = ref(false)

function cambiarModo() {
  modo.value = registro.value ? 'entrar' : 'registro'
  error.value = ''
  campos.value = {}
  form.password = ''
}

async function enviar() {
  error.value = ''
  campos.value = {}
  enviando.value = true
  try {
    if (registro.value) {
      await registrarse({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
      })
    } else {
      await iniciarSesion(form.username.trim(), form.password)
    }
  } catch (e) {
    error.value = e.message
    campos.value = e.campos ?? {}
    form.password = ''
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <main class="login">
    <div class="brand login-brand">
      <span class="brand-mark" aria-hidden="true"><i /></span>
      <span class="brand-name">Sello</span>
    </div>

    <form class="field login-card" novalidate @submit.prevent="enviar">
      <h1 class="login-title">{{ registro ? 'Crear cuenta' : 'Entrar' }}</h1>

      <template v-if="registro">
        <label class="login-label" for="nombre">Nombre</label>
        <input id="nombre" v-model="form.nombre" class="login-input" autocomplete="name" required />
        <p v-if="campos.nombre" class="login-field-error">{{ campos.nombre }}</p>

        <label class="login-label" for="correo">Correo</label>
        <input
          id="correo"
          v-model="form.email"
          class="login-input"
          type="email"
          autocomplete="email"
          autocapitalize="none"
          required
        />
        <p v-if="campos.email" class="login-field-error">{{ campos.email }}</p>
      </template>

      <label class="login-label" for="usuario">{{ registro ? 'Usuario' : 'Usuario o correo' }}</label>
      <input
        id="usuario"
        v-model="form.username"
        class="login-input"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
      />
      <p v-if="campos.username" class="login-field-error">{{ campos.username }}</p>

      <label class="login-label" for="contrasena">Contraseña</label>
      <input
        id="contrasena"
        v-model="form.password"
        class="login-input"
        type="password"
        :autocomplete="registro ? 'new-password' : 'current-password'"
        required
      />
      <p v-if="campos.password" class="login-field-error">{{ campos.password }}</p>
      <p v-else-if="registro" class="login-hint">Al menos 8 caracteres, que no sean solo números.</p>

      <p v-if="error && !Object.keys(campos).length" class="login-error" role="alert">{{ error }}</p>

      <button class="btn btn-primary login-submit" :disabled="enviando">
        <span v-if="enviando" class="spinner" aria-hidden="true" />
        {{ enviando ? (registro ? 'Creando cuenta…' : 'Entrando…') : registro ? 'Crear cuenta' : 'Entrar' }}
      </button>
    </form>

    <p class="login-help">
      {{ registro ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?' }}
      <button type="button" class="login-link" @click="cambiarModo">
        {{ registro ? 'Entra aquí' : 'Créala aquí' }}
      </button>
    </p>
  </main>
</template>
