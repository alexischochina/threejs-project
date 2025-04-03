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
    preset: 'vercel-edge',
    serveStatic: true
  },
  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      title: 'Earth 3D Visualization',
      meta: [
        { name: 'format-detection', content: 'telephone=no' }
      ]
    },
    // @ts-ignore
    cdnURL: process.env.NUXT_PUBLIC_CDN_URL || ''
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          format: 'es'
        }
      }
    }
  },
  experimental: {
    payloadExtraction: false,
    inlineSSRStyles: false,
    renderJsonPayloads: true
  }
})
