/**
 * 可复用的操作辅助和断言工具。
 */

import type { Page } from '@playwright/test'

/**
 * 点击 Radix Select trigger 并选择选项。
 */
export async function selectRadixOption(page: Page, triggerTestId: string, optionText: string) {
  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionText }).click()
}

/**
 * 在执行页面的平台卡片中选择账号或岗位。
 */
export async function selectPlatformValue(
  page: Page,
  cardTestId: string,
  fieldLabel: '执行账号' | '招聘岗位',
  optionText: string,
) {
  const platformKey = cardTestId.replace('execute-platform-card-', '')
  const triggerTestId =
    fieldLabel === '执行账号'
      ? `execute-account-select-${platformKey}`
      : `execute-job-select-${platformKey}`

  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionText }).click()
}

/**
 * 滚动到"开始绑定"按钮并点击。
 */
export async function startBind(page: Page) {
  const button = page.getByTestId('start-bind')
  await button.scrollIntoViewIfNeeded()
  await button.click()
}
