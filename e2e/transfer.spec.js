import { test, expect } from '@playwright/test';
import { installLocalTransport } from './local-transport.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

test.beforeEach(async ({context}) => { if (process.env.BULUTSUZ_TEST_TRANSPORT === '1') await context.addInitScript(installLocalTransport); });

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#device-code')).toHaveValue(/^BT-/);
  await expect(page.locator('#qr-loading')).toBeHidden();
}
async function pair(page, context, files) {
  await ready(page);
  await page.locator('#file-input').setInputFiles(files.map((file)=>file.path || file));
  await expect(page.locator('body')).toHaveAttribute('data-mode','send');
  const code=await page.locator('#device-code').inputValue();
  const receiver=await context.newPage();
  await receiver.goto(`/?receive=${code}`);
  return receiver;
}
async function filePayload(megabytes) {
  const buffer=Buffer.alloc(megabytes*1024*1024,47);buffer.write('%PDF-1.7\n');
  const file={ name:`belge-${megabytes}.pdf`,mimeType:'application/pdf',buffer };
  if(megabytes>=50) {file.path=test.info().outputPath(file.name);await mkdir(dirname(file.path),{recursive:true});await writeFile(file.path,buffer);}
  return file;
}
for (const size of [1,10,50,110]) {
  test(`${size} MB PDF transfers and SHA-256 matches (real RTC by default)`,async ({page,context}) => {
    const file=await filePayload(size);
    const receiver=await pair(page,context,[file]);
    await expect(receiver.locator('.transfer-card[data-state="complete"]')).toHaveCount(1,{timeout:110000});
    await expect(page.locator('.transfer-card[data-state="complete"]')).toHaveCount(1);
    const downloading=receiver.waitForEvent('download');
    await receiver.locator('a.download-action').click();
    const download=await downloading;
    const bytes=await readFile(await download.path());
    expect(bytes.length).toBe(file.buffer.length);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(createHash('sha256').update(file.buffer).digest('hex'));
    await expect(page.locator('#device-code')).toHaveValue('');
    await expect(receiver.locator('#connection-dialog')).not.toBeVisible();
    await expect(receiver.locator('#receive-dialog')).not.toBeVisible();
  });
}
test('multiple files use one QR and finish the one-time session',async ({page,context}) => {
  const receiver=await pair(page,context,[await filePayload(1),{name:'not.txt',mimeType:'text/plain',buffer:Buffer.from('Merhaba Müdürüm')}]);
  await expect(receiver.locator('.transfer-card[data-state="complete"]')).toHaveCount(2);
  await expect(page.locator('#device-code')).toHaveValue('');
});
test('session cancel invalidates its code and releases the queue',async ({page}) => {
  await ready(page);await page.locator('#file-input').setInputFiles(await filePayload(1));
  await page.locator('#session-cancel').click();await expect(page.locator('#device-code')).toHaveValue('');
  await expect(page.locator('#shared-files-banner')).toBeHidden();
});
test('unclaimed sessions expire',async ({page}) => {
  await ready(page);await page.locator('#file-input').setInputFiles(await filePayload(1));
  await expect(page.locator('#status-text')).toContainText('süresi doldu',{timeout:15000});
  await expect(page.locator('#device-code')).toHaveValue('');
});
test('320px layout has no horizontal overflow and home actions work',async ({page}) => {
  await page.setViewportSize({width:320,height:650});await ready(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#send-button')).toBeVisible();await page.locator('#receive-button').click();
  await expect(page.locator('#peer-code')).toBeVisible();
});
test('Android share target service worker queues a file then opens the QR flow',async ({page}) => {
  await ready(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const redirect=await page.evaluate(async ()=> {
    const form=new FormData();form.append('files',new File(['PDF shared from Android'],'paylasilan.pdf',{type:'application/pdf'}));
    const response=await fetch('/share-target',{method:'POST',body:form});return response.url;
  });
  await page.goto(redirect);
  await expect(page.locator('body')).toHaveAttribute('data-mode','send');
  await expect(page.locator('#session-files')).toContainText('paylasilan.pdf');
});
test('250 MB is rejected on memory-only browsers without allocating file data',async ({page,context}) => {
  await ready(page);
  await page.evaluate(()=> {
    const file={name:'buyuk.zip',size:250*1024*1024,type:'application/zip',slice(){throw new Error('Must never read oversized receiver file');}};
    const input=document.getElementById('file-input');Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change'));
  });
  const code=await page.locator('#device-code').inputValue();const receiver=await context.newPage();
  await receiver.addInitScript(()=> { delete window.showSaveFilePicker; });
  await receiver.goto(`/?receive=${code}`);
  await expect(receiver.locator('#receive-dialog')).toBeVisible();
  await receiver.locator('#receive-accept').click();
  await expect(receiver.locator('.transfer-card[data-state="failed"]')).toHaveCount(1);
  await expect(page.locator('.transfer-card[data-state="failed"]')).toHaveCount(1);
});
test('broken SHA-256 is never marked successful or downloaded',async ({page,context}) => {
  await page.addInitScript(()=> {
    const send=RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send=function(data){
      // PeerJS binary payloads keep the 64-char hash in one frame; corrupt only that field.
      if(data instanceof ArrayBuffer){const bytes=new Uint8Array(data);const str=new TextDecoder('latin1').decode(bytes);const marker=str.indexOf('file-end');if(marker>=0){const match=str.match(/[a-f0-9]{64}/);if(match){bytes[str.indexOf(match[0])]=match[0][0]==='0'?49:48;}}}
      return send.call(this,data);
    };
  });
  const receiver=await pair(page,context,[await filePayload(1)]);
  await expect(receiver.locator('.transfer-card[data-state="failed"]')).toHaveCount(1);
  await expect(receiver.locator('.state')).toContainText('bütünlük doğrulaması başarısız');
  await expect(receiver.locator('a.download-action')).toHaveCount(0);
  await expect(page.locator('.transfer-card[data-state="complete"]')).toHaveCount(0);
});

test('desktop drag-and-drop keeps the same sender QR flow',async ({page}) => {
  await ready(page);
  await page.evaluate(()=> {
    const dataTransfer=new DataTransfer();dataTransfer.items.add(new File(['drop-test'],'surukle.txt',{type:'text/plain'}));
    document.getElementById('drop-zone').dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true}));
  });
  await expect(page.locator('body')).toHaveAttribute('data-mode','send');
  await expect(page.locator('#session-files')).toContainText('surukle.txt');
});

test('iPhone install tip can be dismissed and does not return',async ({page}) => {
  await page.addInitScript(()=>{Object.defineProperty(navigator,'userAgent',{value:'iPhone Safari',configurable:true});});
  await ready(page);await expect(page.locator('#ios-install-tip')).toBeVisible();
  await page.locator('#ios-install-how').click();await expect(page.locator('#ios-install-dialog')).toBeVisible();
  await page.getByRole('button',{name:'Anladım'}).click();await page.locator('#ios-install-dismiss').click();
  await page.reload();await expect(page.locator('#ios-install-tip')).toBeHidden();
});
