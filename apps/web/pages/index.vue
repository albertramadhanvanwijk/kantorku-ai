<template>
  <main class="page">
    <header class="header">
      <h1>KantorKu-AI</h1>
      <p class="subtitle">Personal AI Office — Phase 0 Foundation</p>
    </header>

    <section class="card">
      <h2>API Connectivity</h2>
      <p class="muted">Frontend talks to API at <code>{{ apiBase }}</code></p>

      <div v-if="pending" class="status">Checking API…</div>
      <div v-else-if="error" class="status error">
        API unreachable: {{ errorMessage }}
      </div>
      <div v-else-if="health" class="status ok">
        API is <strong>reachable</strong> — status: {{ health.data.status }} ({{ health.data.version }})
        <span class="muted"> at {{ health.data.timestamp }}</span>
      </div>

      <button class="btn" :disabled="pending" @click="checkHealth">Retry check</button>
    </section>

    <section class="card">
      <h2>Auth Foundation</h2>
      <p class="muted">Register and login against <code>/api/auth/*</code>. Token stored in memory for this session.</p>

      <div class="auth-grid">
        <form class="form" @submit.prevent="handleRegister">
          <h3>Register</h3>
          <label>Name <input v-model="reg.name" type="text" required /></label>
          <label>Email <input v-model="reg.email" type="email" required /></label>
          <label>Password <input v-model="reg.password" type="password" required minlength="8" /></label>
          <button type="submit" class="btn" :disabled="authPending">Create account</button>
          <p v-if="authMessage" class="muted">{{ authMessage }}</p>
        </form>

        <form class="form" @submit.prevent="handleLogin">
          <h3>Login</h3>
          <label>Email <input v-model="login.email" type="email" required /></label>
          <label>Password <input v-model="login.password" type="password" required /></label>
          <button type="submit" class="btn" :disabled="authPending">Sign in</button>
          <p v-if="loginMessage" class="muted">{{ loginMessage }}</p>
        </form>
      </div>

      <div v-if="me" class="status ok">
        Signed in as <strong>{{ me.name }}</strong> ({{ me.email }})
      </div>
    </section>

    <section class="card muted">
      <h2>Phase 0 Scope</h2>
      <ul>
        <li>Monorepo, Nuxt frontend, Fastify API, Postgres, Redis</li>
        <li>Environment config, structured logging, health checks</li>
        <li>DB migrations (drizzle), auth foundation (register/login/me)</li>
        <li>Basic frontend ↔ API connectivity demo on this page</li>
      </ul>
      <p>Future phases (HQ shell, agents, workflows, content, analytics) are not included in Phase 0.</p>
    </section>
  </main>
</template>

<script setup lang="ts">
const config = useRuntimeConfig();
const apiBase = config.public.apiBase as string;

type HealthResponse = {
  success: boolean;
  data: { status: string; version: string; timestamp: string };
};

const pending = ref(false);
const health = ref<HealthResponse | null>(null);
const error = ref<unknown>(null);

const errorMessage = computed(() => {
  if (!error.value) return '';
  if (error.value instanceof Error) return error.value.message;
  return String(error.value);
});

async function checkHealth() {
  pending.value = true;
  error.value = null;
  try {
    const res = await $fetch<HealthResponse>(`${apiBase}/api/health`);
    health.value = res;
  } catch (e) {
    error.value = e;
    health.value = null;
  } finally {
    pending.value = false;
  }
}

onMounted(checkHealth);

// ---- Auth demo ----
const reg = reactive({ name: '', email: '', password: '' });
const login = reactive({ email: '', password: '' });
const authPending = ref(false);
const authMessage = ref('');
const loginMessage = ref('');
const me = ref<{ name: string; email: string } | null>(null);
const token = ref<string | null>(null);

async function handleRegister() {
  authPending.value = true;
  authMessage.value = '';
  try {
    const res: any = await $fetch(`${apiBase}/api/auth/register`, {
      method: 'POST',
      body: { name: reg.name, email: reg.email, password: reg.password },
    });
    token.value = res.data.token;
    me.value = res.data.user;
    authMessage.value = 'Account created.';
  } catch (e: any) {
    authMessage.value = e?.data?.error?.message ?? e?.message ?? 'Register failed';
  } finally {
    authPending.value = false;
  }
}

async function handleLogin() {
  authPending.value = true;
  loginMessage.value = '';
  try {
    const res: any = await $fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      body: { email: login.email, password: login.password },
    });
    token.value = res.data.token;
    me.value = res.data.user;
    loginMessage.value = 'Signed in.';
    // Verify /me
    const meRes: any = await $fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    me.value = meRes.data.user;
  } catch (e: any) {
    loginMessage.value = e?.data?.error?.message ?? e?.message ?? 'Login failed';
  } finally {
    authPending.value = false;
  }
}
</script>

<style scoped>
.page {
  max-width: 880px;
  margin: 2rem auto;
  padding: 0 1rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
.header h1 { margin: 0; font-size: 2rem; }
.subtitle { color: #666; margin: 0.25rem 0 1.5rem; }
.card {
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  background: #fff;
}
.card h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.muted { color: #666; font-size: 0.9rem; }
.status { padding: 0.75rem; border-radius: 8px; margin: 0.75rem 0; background: #f5f5f5; }
.status.ok { background: #e6f4ea; border: 1px solid #a8d5b5; }
.status.error { background: #fce8e6; border: 1px solid #f5a9a3; }
.btn {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid #ccc;
  background: #111;
  color: #fff;
  cursor: pointer;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.auth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.75rem; }
.form { border: 1px solid #eee; border-radius: 8px; padding: 1rem; }
.form h3 { margin: 0 0 0.5rem; font-size: 1rem; }
.form label { display: flex; flex-direction: column; font-size: 0.85rem; margin-bottom: 0.5rem; gap: 0.25rem; }
.form input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 6px; }
@media (max-width: 640px) { .auth-grid { grid-template-columns: 1fr; } }
code { background: #f0f0f0; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.85em; }
ul { margin: 0.5rem 0; padding-left: 1.25rem; }
</style>
