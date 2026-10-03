import { test, expect } from '../../frontend/node_modules/@playwright/test/index.js'

test('automl journey: navigate to project AutoML benchmarks and view client-side execution guarantee', async ({ page }) => {
  const unique = Date.now()
  const email = `automl_lead_${unique}@example.com`
  const password = 'StrongPassword123!'

  await page.goto('/')

  // Switch to Register form
  await page.getByRole('button', { name: /create an organization/i }).click()

  // Fill in registration form
  await page.fill('#reg-name', 'ML Lead Engineer')
  await page.fill('#reg-org', `AutoML Labs ${unique}`)
  await page.fill('#auth-email', email)
  await page.fill('#auth-password', password)

  await page.click('#auth-submit-btn')

  // Verify Dashboard loaded
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.brand-text')).toHaveText('DataPilot')
  await expect(page.locator('#org-switcher-button')).toContainText(`AutoML Labs ${unique}`)

  // Create a new project
  await page.click('#create-project-btn')
  await page.fill('#proj-name', 'Churn Prediction V1')
  await page.fill('#proj-purpose', 'Customer retention and churn modeling with AutoML')
  await page.click('#submit-create-project')

  // Project should be visible
  await expect(page.getByText('Churn Prediction V1')).toBeVisible()

  // Click on the AutoML button
  const automlBtn = page.locator('button[id^="open-automl-"]').first()
  await automlBtn.click()

  // Verify AutoML Experiments view
  await expect(page.getByText('AutoML Experiments & Model Benchmarks')).toBeVisible()
  await expect(page.getByText('Client Data Plane: Zero Raw Data Leakage')).toBeVisible()
  await expect(page.getByText('Runs executed securely inside your local Client Data Plane.')).toBeVisible()

  // Navigate back to projects
  await page.getByRole('button', { name: '← Back to Projects' }).click()
  await expect(page.getByText('Manage organization ML initiatives')).toBeVisible()
})
