// @ts-ignore
export default defineNitroConfig({
  preset: 'vercel-edge',
  serveStatic: true,
  routeRules: {
    '/_nuxt/**': {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable'
      }
    },
    '/_nuxt/**.js': {
      headers: {
        'content-type': 'application/javascript; charset=utf-8'
      }
    },
    '/_nuxt/**.mjs': {
      headers: {
        'content-type': 'application/javascript; charset=utf-8'
      }
    },
    '/_nuxt/**.css': {
      headers: {
        'content-type': 'text/css; charset=utf-8'
      }
    }
  }
}); 