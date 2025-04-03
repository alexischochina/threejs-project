// https://nuxt.com/docs/api/configuration/nuxt-config
// @ts-ignore
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },
  typescript: {
    strict: false,
    typeCheck: false,
    shim: false
  },
  build: {
    transpile: ['three']
  },
  nitro: {
    preset: 'vercel',
    serveStatic: true
  },
  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      title: 'Earth 3D Visualization'
    }
  },
  experimental: {
    payloadExtraction: false
  }
})
