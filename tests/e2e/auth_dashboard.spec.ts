import { test, expect } from '../../frontend/node_modules/@playwright/test/index.js'

test('full browser journey: register organization, view dashboard, create project, and logout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  // 1. Verify landing page renders
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()

  // 2. Toggle to register form
  await page.getByRole('button', { name: /create an organization/i }).click()
  await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible()

  // 3. Fill registration form with unique email
  const uniqueId = Date.now()
  const email = `scientist_${uniqueId}@biomed.org`
  await page.fill('#reg-name', 'Dr. Marie Curie')
  await page.fill('#reg-org', 'Radium Research Lab')
  await page.fill('#auth-email', email)
  await page.fill('#auth-password', 'CurieLab2026!')

  // 4. Submit registration
  await page.click('#auth-submit-btn')

  // 5. Verify Dashboard shell loads
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#org-switcher-button')).toContainText('Radium Research Lab')
  await expect(page.locator('.user-name')).toHaveText('Dr. Marie Curie')

  // 6. Create a Project via the dashboard UI
  await page.click('#create-project-btn')
  await expect(page.locator('#modal-title')).toHaveText('Create New Project')

  await page.fill('#proj-name', 'Isotope Decay Classification')
  await page.fill('#proj-purpose', 'Predict radioactive stability from tabular isotopic properties.')
  await page.selectOption('#proj-class', 'confidential')

  await page.click('#submit-create-project')

  // 7. Verify project card is displayed
  await expect(page.getByText('Isotope Decay Classification')).toBeVisible()
  await expect(page.getByText('confidential', { exact: true })).toBeVisible()

  // 8. Sign out
  await page.click('#logout-btn')
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()

  expect(errors).toEqual([])
})
