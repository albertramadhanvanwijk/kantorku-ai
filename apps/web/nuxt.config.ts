import type { NuxtConfig } from 'nuxt/config';

const config: NuxtConfig = {
  compatibilityDate: '2025-01-01',

  devtools: { enabled: true },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  modules: ['@nuxt/eslint'],

  eslint: {
    config: {
      stylistic: false,
    },
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.API_URL || 'http://localhost:4000',
    },
  },

  nitro: {
    preset: 'node-server',
  },

  app: {
    head: {
      title: 'KantorKu-AI',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'KantorKu-AI — Personal AI Office for trading creators' },
      ],
    },
  },
};

export default config;
