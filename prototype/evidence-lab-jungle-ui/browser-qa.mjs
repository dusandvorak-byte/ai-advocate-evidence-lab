// Headless Chromium acceptance; synthetic demo-only UI, no network or PDF.
// Playwright is installed in a throwaway CI path, never in the published site.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import('/tmp/evidence-browser-qa/node_modules/playwright/index.mjs');
const path=pathToFileURL(resolve('prototype/evidence-lab-jungle-ui/index.html')).href;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [375,768,1024,1440]){
  const ctx=await browser.newContext({viewport:{width,height:860},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(path);
  await page.locator('#hero-title').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.locator('#page-prehled').isVisible(),true);
  await mkdir('/tmp/evidence-browser-shots',{recursive:true});
  await page.screenshot({path:'/tmp/evidence-browser-shots/home-light-'+width+'.png',fullPage:true,animations:'disabled'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth+1);
  assert.equal(overflow,false,'horizontal overflow at '+width);
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'true');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.goto(path+'#dokumenty');
  assert.equal(await page.locator('#page-dokumenty').isVisible(),true);
  assert.equal(await page.locator('.archive-row').count(),5);
  await page.locator('#search').fill('příloha');
  assert.equal(await page.locator('.archive-row').count(),1);
  await page.locator('#search').press('Enter');
  assert.equal(await page.locator('.archive-row').count(),1,'Enter reloads archive at '+width);
  await page.locator('#filters button[type=reset]').click();
  await page.locator('#status').selectOption('review');
  assert.equal(await page.locator('.archive-row').count(),2);
  await page.locator('#status').selectOption('all');
  await page.locator('.archive-row a').first().click();
  await page.waitForFunction(()=>!document.querySelector('#page-detail').hidden); // hashchange is asynchronous
  assert.equal(await page.locator('#page-detail').isVisible(),true);
  assert.match(await page.locator('#detail-title').textContent(),/Ukázkové usnesení/);
  assert.match(await page.locator('#detail-meta').textContent(),/Není k dispozici/);
  await page.goto(path+'#detail/%ZZ');
  assert.equal(await page.locator('#page-prehled').isVisible(),true);
  assert.deepEqual(errors,[],'JS errors at '+width);
  await page.goto(path);
  await page.screenshot({path:'/tmp/evidence-browser-shots/home-dark-'+width+'.png',fullPage:true,animations:'disabled'});
  await page.goto(path+'#dokumenty');
  await page.screenshot({path:'/tmp/evidence-browser-shots/archive-dark-'+width+'.png',fullPage:true,animations:'disabled'});
  console.log('BROWSER_QA_OK',width,'theme/search/filter/detail/overflow/javascript');
  await ctx.close();
 }
}finally{await browser.close();}
