// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    // "@prisma/nuxt"
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  runtimeConfig: {
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || ''
  },

  fonts: {
    families: [
      {
        name: 'IBM Plex Mono',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal', 'italic']
      },
      {
        name: 'IBM Plex Sans JP',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal']
      }
    ],
  },
})
