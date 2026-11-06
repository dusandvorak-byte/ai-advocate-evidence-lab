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
  assert.equal(await page.locator('.art-story').count(),5,'Five source-specific art positions must exist');
  assert.equal(await page.locator('.art-story img').count(),0,'No missing or invented image may render');
  assert.match(await page.locator('.art-story--poster .art-pending').textContent(),/ORIGINÁL ZATÍM NENÍ DODÁN/);
  const posterRatio=await page.locator('.art-story--poster .art-placeholder').evaluate(el=>{
    const box=el.getBoundingClientRect();return box.width/box.height;
  });
  assert.ok(Math.abs(posterRatio-1086/1448)<0.03,'Poster aspect ratio must not be cropped');
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
  // CZ/EN route and theme remain stable; English data never silently become Czech.
  await page.goto(path+'#dokumenty');
  await page.locator('#language-switch').click();
  await page.waitForURL(/en\.html#dokumenty$/);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('#archive-title').textContent(),'Document archive');
  await page.goto(path.replace('/index.html','/en.html')+'#prehled');
  assert.equal(await page.locator('.art-story').count(),5);
  assert.match(await page.locator('.art-story--poster .art-pending').textContent(),/ORIGINAL FILE NOT YET PROVIDED/);
  await page.goto(path.replace('/index.html','/en.html')+'#dokumenty');
  assert.equal(await page.locator('.archive-row').count(),5);
  await page.locator('#search').fill('attachment');
  assert.equal(await page.locator('.archive-row').count(),1);
  await page.locator('#search').fill('');
  await page.locator('.archive-row a').first().click();
  await page.waitForFunction(()=>!document.querySelector('#page-detail').hidden);
  assert.match(await page.locator('#detail-title').textContent(),/Sample court order/);
  assert.match(await page.locator('#detail-meta').textContent(),/Not available/);
  await page.locator('#language-switch').click();
  await page.waitForURL(/index\.html#detail\/DEMO-001$/);
  assert.equal(await page.locator('html').getAttribute('lang'),'cs');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.match(await page.locator('#detail-title').textContent(),/Ukázkové usnesení/);
  assert.deepEqual(errors,[],'CZ/EN page errors at '+width);
  // Run accessibility checks on both themes/locales at narrow and wide widths.
  // Axe finds machine-detectable WCAG issues, not every assistive-tech issue.
  for (const locale of ['cs','en']) {
    for (const theme of ['light','dark']) {
      await page.goto(path.replace('index.html',locale==='en'?'en.html':'index.html'));
      if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('#theme-toggle').click();
      await page.addScriptTag({path:'/tmp/evidence-browser-qa/node_modules/axe-core/axe.min.js'});
      const report=await page.evaluate(async()=>window.axe.run(document,{
        runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}
      }));
      const failures=report.violations.map(x=>({id:x.id,impact:x.impact,targets:x.nodes.slice(0,3).map(n=>n.target)}));
      assert.deepEqual(failures,[], 'Axe accessibility violations '+locale+'/'+theme+'/'+width);
    }
  }

  await page.goto(path.replace('/index.html','/en.html'));
  await page.screenshot({path:'/tmp/evidence-browser-shots/home-en-dark-'+width+'.png',fullPage:true,animations:'disabled'});
  // Keyboard-only operation, visible focus and zoom/reflow regression.
  await page.goto(path);
  await page.keyboard.press('Tab');
  const focused=await page.evaluate(()=>{
    const el=document.activeElement;
    return {className:el.className,outline:getComputedStyle(el).outlineStyle};
  });
  assert.ok(String(focused.className).includes('skip'),'Skip link must be keyboard-first');
  assert.notEqual(focused.outline,'none','Keyboard focus must be visible');
  await page.locator('#theme-toggle').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light','Keyboard toggle should work');
  if(width>=1024){
    await page.setViewportSize({width:Math.floor(width/2),height:860});
    const reflowOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
    assert.equal(reflowOverflow,false,'200% viewport-equivalent reflow should not overflow at '+width);
    await page.setViewportSize({width,height:860});
  }
  console.log('BROWSER_QA_OK',width,'theme/search/filter/detail/overflow/javascript');
  await ctx.close();
 }
}finally{await browser.close();}
