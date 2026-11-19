import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

test('DPS lab keeps the newest simulation when an older cohort request finishes last', { timeout: 120_000 }, async () => {
  const password = 'lab-journey-password'
  const previousEnv = { password: process.env.PROTOTYPE_ACCESS_PASSWORD, secret: process.env.PROTOTYPE_SESSION_SECRET }
  process.env.PROTOTYPE_ACCESS_PASSWORD = password
  process.env.PROTOTYPE_SESSION_SECRET = 'lab-journey-session-secret'
  const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, preTransformRequests: false } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}`
    const executablePath = chromium.executablePath()
    browser = await chromium.launch(existsSync(executablePath) ? { headless: true } : { headless: true, channel: 'chrome' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const login = await page.request.post(`${base}/api/dps/auth/login`, { data: { password } })
    assert.equal(login.status(), 200)

    const held = new Map<number, () => Promise<void>>()
    await page.route('**/api/dps/cohort', async (route) => {
      const level = (route.request().postDataJSON() as { level: number }).level
      const response = await route.fetch()
      held.set(level, () => route.fulfill({ response }))
    })
    const until = async (what: string, done: () => boolean | Promise<boolean>) => {
      const deadline = Date.now() + 20_000
      while (!(await done())) {
        assert.ok(Date.now() < deadline, `timed out waiting for ${what}`)
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }
    const shownLevel = async () => {
      const note = page.locator('details', { hasText: 'Model limits' }).locator('p.note').first()
      return (await note.count()) ? (await note.textContent())?.match(/level (\d+)/)?.[1] : undefined
    }

    await page.goto(`${base}/lab`)
    await until('the level 13 cohort request', () => held.has(13))
    await page.locator('#level').selectOption('14')
    await until('the level 14 cohort request', () => held.has(14))

    await held.get(14)!()
    await until('the level 14 result', async () => (await shownLevel()) === '14')

    await page.locator('summary').filter({ hasText: 'Damage trace' }).click()
    const target = page.getByLabel('Selected target', { exact: true })
    const selected = await target.selectOption({ index: 1 })
    assert.equal(selected.length, 1)

    await held.get(13)!()
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(await shownLevel(), '14', 'An older level 13 run replaced the level 14 result')
    assert.equal(await target.inputValue(), selected[0], 'An older level 13 cohort changed the selected target')
    assert.deepEqual(pageErrors, [])
  } finally {
    await browser?.close()
    await server.close()
    for (const [key, value] of [['PROTOTYPE_ACCESS_PASSWORD', previousEnv.password], ['PROTOTYPE_SESSION_SECRET', previousEnv.secret]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
