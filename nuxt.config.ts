// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', // "@prisma/nuxt",
    '@nuxt/ui', '@vite-pwa/nuxt'],

  plugins: ['~/plugins/wakeLock.client.ts'],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    storage: {
      temp: {
        driver: 'fs',
        base: 'data/temp'
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  fonts: {
    families: [
      {
        name: 'IBM Plex Sans JP',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal']
      }
    ]
  },

  pwa: {
    registerType: 'autoUpdate',
    includeManifestIcons: false,
    manifest: false,
    workbox: {
      navigateFallback: null
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  }
});
