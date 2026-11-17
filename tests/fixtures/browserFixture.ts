import { createServer, preview, type ViteDevServer } from 'vite'

export interface BrowserFixture {
  name: string
  configureServer(server: Pick<ViteDevServer, 'middlewares'>): void
}

export async function startBrowserFixture(fixture: BrowserFixture) {
  const host = '127.0.0.1'
  const outDir = process.env.RIFT_BROWSER_TEST_BUILD_DIR
  if (outDir) {
    return preview({
      configFile: false,
      logLevel: 'silent',
      build: { outDir },
      preview: { host, port: 0 },
      plugins: [{ name: fixture.name, configurePreviewServer: fixture.configureServer }],
    })
  }
  const server = await createServer({
    publicDir: false,
    logLevel: 'silent',
    server: { host, port: 0 },
    plugins: [fixture],
  })
  try {
    await server.listen()
    return server
  } catch (error) {
    await server.close()
    throw error
  }
}
