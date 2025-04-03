// https://nuxt.com/docs/api/configuration/nuxt-config
// @ts-ignore
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  typescript: {
    strict: false,
    typeCheck: false,
    shim: false
  },
  build: {
    transpile: ['three']
  },
  nitro: {
    preset: 'vercel'
  }
})
