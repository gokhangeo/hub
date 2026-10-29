import { test, expect } from '@playwright/test';
import { installLocalTransport } from './local-transport.js';
test.beforeEach(async ({context}) => { if (process.env.BULUTSUZ_TEST_TRANSPORT === '1') await context.addInitScript(installLocalTransport); });
const file={ name:'not.txt', mimeType:'text/plain', buffer:Buffer.from('merhaba dünya') };
async function startSend(page){
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#device-code')).toHaveValue(/^\d{3} \d{3}$/);
  await expect(page.locator('#qr-loading')).toBeHidden();
}
test('6 haneli kodla alma: yazınca bağlanır, gönderen bir kez kabul eder', async ({page,context}) => {
  await startSend(page);
  const code=await page.locator('#device-code').inputValue();
  const receiver=await context.newPage();
  await receiver.goto('/');
  await receiver.locator('#receive-button').click();
  await receiver.locator('#peer-code').pressSequentially(code.replace(' ',''));
  await expect(page.locator('#connection-dialog')).toBeVisible();
  await page.locator('#connection-accept').click();
  await expect(receiver.locator('.transfer-card[data-state="complete"]')).toBeVisible({timeout:20000});
});
test('QR bağlantısıyla alma onaysız başlar', async ({page,context}) => {
  await startSend(page);
  const link=new URL(await page.locator('#qr-canvas').getAttribute('data-link'));
  expect(link.searchParams.get('k')).toMatch(/^[A-Z2-9]{16}$/);
  const receiver=await context.newPage();
  await receiver.goto(link.pathname+link.search);
  await expect(receiver.locator('.transfer-card[data-state="complete"]')).toBeVisible({timeout:20000});
  await expect(page.locator('#connection-dialog')).toBeHidden();
});
