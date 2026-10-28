// Run with Node.js and Playwright available (no live cloud writes).
const { chromium } = require('playwright');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
(async () => {
  const props = new Map();
  let locked = false;
  const server = vm.createContext({ PropertiesService: { getScriptProperties: () => ({getProperty: k => props.get(k),setProperties: obj => Object.entries(obj).forEach(([k,v]) => props.set(k,v))}) }, LockService: {getScriptLock: () => ({waitLock: () => {assert.equal(locked,false); locked=true;}, releaseLock: () => {locked=false;}})}, ContentService: {MimeType:{TEXT:'text',JSON:'json'},createTextOutput: s => ({setMimeType: () => JSON.parse(s)})} });
  vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8'), server);
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  let fail = false, delay = 0;
  const errors = [];
  async function setupRoutes(context) {
  await context.route('https://pickup.test/**', route => route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8')}));
  await context.route('https://holidays-jp.github.io/**', route => route.fulfill({json:{}}));
  await context.route('https://script.google.com/**', async route => {
    if (delay) await new Promise(r=>setTimeout(r,delay));
    if (fail) return route.abort();
    const body = route.request().postDataJSON();
    const result = body.action === 'sync-load' ? server.handleSyncLoad(body) : server.handleSyncSave(body);
    await route.fulfill({json:result});
  });
  }
  await setupRoutes(context);
  const a = await context.newPage();
  a.on('pageerror',e=>errors.push(e.message));
  delay=300;
  await a.goto('https://pickup.test/');
  assert.equal(await a.locator('.input-panel').evaluate(e=>e.inert),true);
  await a.waitForFunction(()=>syncReady && !syncBusy);
  delay=0;
  const ym = await a.evaluate(()=>currentYm());
  await a.locator('#schoolOffDays').fill('1,2');
  assert.equal(await a.locator('#cloudSave').isEnabled(),true);
  await a.reload();
  await a.waitForFunction(()=>syncReady && !syncBusy);
  assert.equal(await a.locator('#schoolOffDays').inputValue(),'1,2');
  await a.locator('#cloudSave').click();
  await a.waitForFunction(()=>!dirty && !syncBusy);
  assert.equal(JSON.parse(props.get('SYNC_'+ym)).schoolOffDays,'1,2');
  // A second device reads the same revision, then both edit.
  const deviceB = await browser.newContext({viewport:{width:390,height:844}});
  await setupRoutes(deviceB);
  const b = await deviceB.newPage();
  await b.goto('https://pickup.test/');
  await b.waitForFunction(()=>syncReady && !syncBusy);
  await b.locator('#schoolOffDays').fill('3');
  await a.locator('#schoolOffDays').fill('4');
  await a.locator('#cloudSave').click();
  await a.waitForFunction(()=>!dirty && !syncBusy);
  await b.locator('#cloudSave').click();
  await b.waitForFunction(()=>!syncReady && !syncBusy);
  assert.equal(JSON.parse(props.get('SYNC_'+ym)).schoolOffDays,'4');
  assert.equal(await b.locator('#schoolOffDays').inputValue(),'3');
  assert.equal(await b.locator('#cloudSave').isDisabled(),true);
  await b.reload();
  await b.waitForFunction(()=>!syncBusy);
  assert.equal(await b.locator('#schoolOffDays').inputValue(),'3');
  assert.equal(await b.locator('#cloudSave').isDisabled(),true);
  b.on('dialog',d=>d.accept());
  await b.locator('#cloudLoad').click();
  await b.waitForFunction(()=>syncReady && !syncBusy);
  assert.equal(await b.locator('#schoolOffDays').inputValue(),'4');
  // Failure must not enable edits; retry restores access.
  fail=true;
  await b.reload();
  await b.waitForFunction(()=>!syncBusy);
  assert.equal(await b.locator('.input-panel').evaluate(e=>e.inert),true);
  fail=false;
  await b.locator('#cloudLoad').click();
  await b.waitForFunction(()=>syncReady && !syncBusy);
  await b.locator('#nextMonth').click();
  await b.waitForFunction(()=>syncReady && !syncBusy);
  assert.equal(await b.locator('#schoolOffDays').inputValue(),'');
  // Missing revision (old clients) cannot overwrite any data.
  assert.equal(server.handleSyncSave({ym,payload:'{}'}).ok,false);
  assert.equal(locked,false);
  await b.screenshot({path:'/tmp/pickup-sync-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: startup lock, draft recovery, save, stale-device conflict, retry, new month, legacy client rejection');
})().catch(e=>{console.error(e);process.exit(1)});
