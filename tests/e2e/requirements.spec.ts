import { test, expect } from '../../frontend/node_modules/@playwright/test/index.js'

test('business requirement journey: formulate ML problem, edit parameters, and approve formulation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  // Register a new organization & scientist user
  const uniqueId = Date.now()
  const email = `churn_lead_${uniqueId}@fintech.com`
  await page.getByRole('button', { name: /create an organization/i }).click()
  await page.fill('#reg-name', 'Sarah Chen')
  await page.fill('#reg-org', 'Fintech Analytics Group')
  await page.fill('#auth-email', email)
  await page.fill('#auth-password', 'SafePassword2026!')
  await page.click('#auth-submit-btn')

  // Verify dashboard shell loads
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 10_000 })

  // Create a Project
  await page.click('#create-project-btn')
  await page.fill('#proj-name', 'Customer Churn Prevention')
  await page.fill('#proj-purpose', 'Identify subscribers likely to cancel within 30 days.')
  await page.selectOption('#proj-class', 'internal')
  await page.click('#submit-create-project')

  // Verify project card and click "Business Requirements →"
  await expect(page.getByText('Customer Churn Prevention')).toBeVisible()
  const openReqsBtn = page.locator('button[id^="open-reqs-"]')
  await openReqsBtn.click()

  // Verify Requirements View renders
  await expect(page.getByText('Customer Churn Prevention — Business Requirements')).toBeVisible()
  await expect(page.getByText('1. Describe Business Problem')).toBeVisible()

  // Use the sample prompt chip
  await page.locator('button.chip-btn').first().click()
  await expect(page.locator('#business-problem-input')).toHaveValue(
    'Predict which customers are likely to churn within the next 30 days.'
  )

  // Click Extract ML Requirements
  await page.click('#extract-requirements-btn')

  // Wait for formulation card to appear
  await expect(page.getByText('2. Review & Refine Problem Formulation')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#target-name-field')).toHaveValue('churn')
  await expect(page.locator('#problem-type-field')).toHaveValue('binary_classification')
  await expect(page.locator('#horizon-field')).toHaveValue('30 days')

  // Review & Edit the parameters
  await page.fill('#target-name-field', 'churn_flag_30d')
  await page.fill('#review-notes-field', 'Reviewed by Sarah Chen. Primary metric set to PR-AUC due to class imbalance.')

  // Add an operational constraint
  const addConstraintInput = page.locator('.add-constraint-row input')
  await addConstraintInput.fill('Inference latency must be under 50ms per request')
  await page.click('.add-constraint-row button')
  await expect(page.getByText('Inference latency must be under 50ms per request')).toBeVisible()

  // Save changes as Draft
  await page.click('#save-draft-btn')
  await expect(page.getByText('Formulation changes saved successfully.')).toBeVisible()

  // Explicitly Approve Problem Formulation
  await page.click('#approve-formulation-btn')
  await expect(page.getByText('Problem formulation approved!')).toBeVisible()
  await expect(page.locator('.status-badge')).toContainText('APPROVED')

  // Navigate back to Projects
  await page.click('#back-to-projects-btn')
  await expect(page.getByText('Customer Churn Prevention')).toBeVisible()

  expect(errors).toEqual([])
})
