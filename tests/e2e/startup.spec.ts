import { test, expect } from '../../frontend/node_modules/@playwright/test/index.js'

test('the running frontend renders live backend readiness with no browser errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /a private foundation/i })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('All services ready')
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: /check again/i }).click()
  await expect(page.getByRole('status')).toHaveText('All services ready')
  expect(errors).toEqual([])
})
