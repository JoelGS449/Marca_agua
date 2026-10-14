<script setup>
import { ref } from 'vue'
import { iniciarSesion } from '../lib/auth'

const username = ref('')
const password = ref('')
const error = ref('')
const enviando = ref(false)

async function entrar() {
  error.value = ''
  enviando.value = true
  try {
    await iniciarSesion(username.value.trim(), password.value)
  } catch (e) {
    error.value = e.message
    password.value = ''
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

    <form class="field login-card" @submit.prevent="entrar">
      <h1 class="login-title">Entrar</h1>

      <label class="login-label" for="usuario">Usuario</label>
      <input
        id="usuario"
        v-model="username"
        class="login-input"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
      />

      <label class="login-label" for="contrasena">Contraseña</label>
      <input
        id="contrasena"
        v-model="password"
        class="login-input"
        type="password"
        autocomplete="current-password"
        required
      />

      <p v-if="error" class="login-error" role="alert">{{ error }}</p>

      <button class="btn btn-primary login-submit" :disabled="enviando">
        <span v-if="enviando" class="spinner" aria-hidden="true" />
        {{ enviando ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>

    <p class="login-help">¿No tienes cuenta? Pídela a quien administra Sello.</p>
  </main>
</template>
