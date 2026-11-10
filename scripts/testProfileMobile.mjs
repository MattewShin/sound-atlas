import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
const option = name => process.argv[process.argv.indexOf(name) + 1]
const moduleRoot = process.argv.includes('--playwright-module') ? option('--playwright-module') : process.cwd()
const require = createRequire(resolve(moduleRoot, 'package.json')), {chromium} = require('playwright')
const base = process.cwd(); mkdirSync('.cache/mobile-shots',{recursive:true})
await build({entryPoints:['scripts/profileIaMobileEntry.jsx'],bundle:true,platform:'browser',format:'iife',outfile:'.cache/mobile-app.js',define:{'import.meta.env':'{}'},logLevel:'silent'})
const assets = new Map(['/src/styles.css','/src/components/musicSocial.css','/.cache/mobile-app.js'].map(path => [path,resolve(base,'.'+path)]))
assets.set('/fonts/PretendardVariable.woff2',resolve(base,'public/fonts/PretendardVariable.woff2'))
const server = createServer((req,res) => {
  const url = new URL(req.url,'http://localhost'), path = decodeURIComponent(url.pathname)
  if (path === '/') { res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/components/musicSocial.css"><div id="root"></div><script src="/.cache/mobile-app.js"></script></html>');return }
  const file = assets.get(path)
  if (!file) {res.writeHead(404);res.end();return}
  const type = {'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png'}[extname(file)] ?? 'application/octet-stream'
  res.setHeader('Content-Type',type);res.end(readFileSync(file))
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const origin = 'http://127.0.0.1:'+server.address().port
const browser = await chromium.launch({...(process.argv.includes('--browser') ? {executablePath:option('--browser')} : {}),headless:true})
const results = [], errors = [], targetChecks = [], negativeControls = []
const settle = async page => { await page.waitForTimeout(250); await page.evaluate(() => document.fonts.ready) }
async function check(page, width, state) {
  await settle(page)
  const result = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav'), box = el => {const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
    const buttons = [...nav.querySelectorAll('button')].map(b => {const r=box(b),svg=box(b.querySelector('svg'));return{label:b.getAttribute('aria-label'),title:b.title,text:b.textContent,active:b.getAttribute('aria-current'),background:getComputedStyle(b).backgroundColor,...r,svg,centered:Math.abs(r.x+r.width/2-svg.x-svg.width/2)<1&&Math.abs(r.y+r.height/2-svg.y-svg.height/2)<1}})
    const typography = [...document.querySelectorAll('h1,h2,h3,h4,p,a,button,label,small,input,textarea,select')].filter(el => el.getClientRects().length).map(el => {
      const metric=window.measureRenderedText(el)
      return {tag:el.tagName,size:metric.fontSize,family:metric.family,tracking:metric.tracking,line:metric.lineHeight,lines:el.matches('input,select,textarea,label') ? 0 : metric.lines}
    })
    return{overflow:document.documentElement.scrollWidth>innerWidth,nav:box(nav),buttons,typography}
  })
  assert.equal(result.overflow,false,width+' '+state+' horizontal overflow')
  assert.equal(result.buttons.length,5)
  for(const b of result.buttons){assert(b.width>=48&&b.height>=48);assert.equal(b.svg.width,28);assert.equal(b.svg.height,28);assert(b.centered);assert.equal(b.text,'');assert.equal(b.title,b.label)}
  assert(result.buttons.every(b => Math.abs(b.width-result.buttons[0].width)<1))
  for(const t of result.typography){assert(t.size>=12&&t.size%2===0,JSON.stringify(t));assert(t.family.includes('Pretendard'));assert(Math.abs(t.tracking/t.size+0.03)<0.002);if(t.lines>1)assert(Math.abs(parseFloat(t.line)/t.size-1.5)<0.01,JSON.stringify({width,state,...t}));if(t.lines===1)assert.equal(t.line,'normal',JSON.stringify({width,state,...t}))}
  assert(result.buttons.filter(b=>b.active==='page').length===1)
  results.push({width,state,horizontal_overflow:false,touch_areas_48:true,icons_28:true,equal_widths_and_centering:true,accessible_names_and_active_page:true,typography:'PASS',visible_text_nodes:result.typography.length,single_line_nodes:result.typography.filter(t=>t.lines===1).length,multiline_nodes:result.typography.filter(t=>t.lines>1).length})
  console.log(JSON.stringify({checked:state,width}))
}
async function target(page,width,name,selector) {
  const metric=await page.locator(selector).first().evaluate(el=>window.measureRenderedText(el))
  assert(metric.lines>0,name+' must have rendered text')
  if(metric.lines>1)assert(Math.abs(parseFloat(metric.lineHeight)/metric.fontSize-1.5)<0.01,JSON.stringify({width,name,...metric}))
  else assert.equal(metric.lineHeight,'normal',name)
  targetChecks.push({width,name,...metric})
}
try {
 for(const width of [320,375,390,520]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true})
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route => new URL(route.request().url()).origin===origin ? route.continue() : route.abort())
  await page.goto(origin+'/#music');await page.locator('.social-post').waitFor();await check(page,width,'signed-in-feed')
  await page.locator('.social-menu summary').click();await check(page,width,'post-menu');await page.locator('.social-menu summary').click()
  await page.getByRole('button',{name:'기록 작성',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.id==='my-records-title');await check(page,width,'profile-records')
  await target(page,width,'long-profile-button','.profile-section button[aria-expanded] + button')
  await target(page,width,'records-description','.all-music-records > p')
  const detected=await page.locator('.all-music-records > p').evaluate(el=>{
    const previous=el.getAttribute('style');el.style.setProperty('line-height','normal','important')
    const metric=window.measureRenderedText(el), detected=metric.lines>1&&metric.lineHeight==='normal'
    if(previous===null)el.removeAttribute('style');else el.setAttribute('style',previous)
    return detected
  });assert(detected,'independent line checker must reject a forced multiline normal value');negativeControls.push({width,forced_multiline_normal_rejected:true})
  await page.getByRole('button',{name:'다른 사용자에게 보이는 내 프로필 확인',exact:true}).click();await check(page,width,'public-profile-preview')
  await target(page,width,'public-profile-guide','.public-profile-preview p:last-child')
  await page.getByRole('button',{name:'공개 프로필 수정',exact:true}).click();await page.locator('.social-form input').first().focus();await check(page,width,'profile-editor-focus')
  await page.getByRole('button',{name:'기록 남기기',exact:true}).click();await page.locator('.music-journal-form textarea').fill('긴 합성 기록입니다. '.repeat(80)+'\n다음 줄도 입력합니다.');await page.locator('.music-journal-form textarea').focus();await check(page,width,'record-keyboard-focus')
  await page.getByRole('button',{name:'작성 취소',exact:true}).click();await settle(page);await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await settle(page)
  const deletion=await page.getByRole('button',{name:'계정과 데이터 삭제',exact:true}).boundingBox();const nav=await page.locator('.bottom-nav').boundingBox();await page.screenshot({path:'.cache/mobile-shots/bottom-'+width+'.png'});assert(deletion.y+deletion.height<=nav.y,JSON.stringify({issue:'account control hidden under navigation',deletion,nav,scroll:await page.evaluate(()=>({y:scrollY,height:innerHeight,documentHeight:document.documentElement.scrollHeight}))}))
  await page.getByRole('button',{name:'계정과 데이터 삭제',exact:true}).click();await check(page,width,'delete-confirmation');await target(page,width,'delete-confirmation','.account-delete-confirm > p');await page.locator('.account-delete-confirm').getByRole('button',{name:'취소',exact:true}).click()
  await page.locator('.bottom-nav button').first().focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'공연 찾기')
  await page.getByRole('button',{name:'음악 이야기',exact:true}).click();await page.locator('.social-post').waitFor();await page.getByRole('button',{name:'기록 작성',exact:true}).click();await page.goBack();await page.locator('.social-screen h1').waitFor();assert.equal(await page.locator('h1').textContent(),'음악 이야기')
  await page.getByRole('button',{name:'내 프로필',exact:true}).click();await settle(page);await page.screenshot({path:'.cache/mobile-shots/profile-'+width+'.png',fullPage:true})
  await page.goto(origin+'/?guest=1#music');await page.locator('.social-post').waitFor();await check(page,width,'anonymous-feed');assert.equal(await page.locator('.social-tabs,.account-panel,.social-form').count(),0)
  await page.getByRole('button',{name:'내 프로필',exact:true}).click();await check(page,width,'anonymous-profile');assert(await page.getByRole('button',{name:'Google로 계속하기',exact:true}).isEnabled())
  await page.close()
 }
 assert.deepEqual(errors,[])
 for(const name of ['long-profile-button','records-description','public-profile-guide','delete-confirmation'])assert(targetChecks.some(t=>t.name===name&&t.lines>1),'missing multiline coverage for '+name)
 const evidence={task_id:'CA-NAV-PROFILE-IA-20261110-001',result:'PASS',environment:'local Chromium / synthetic in-memory transport / network limited to local static server',line_measurement:'independent character Range rectangles; numeric rendered line count compared with computed line-height; data-text-lines is not trusted',cases:results,target_checks:targetChecks,negative_controls:negativeControls,keyboard_tab_and_records_focus:'PASS',browser_back:'PASS',navigation_overlay:'PASS',page_errors:0,real_oauth:false,real_postgrest:false,real_realtime:false,real_device_ime:false,production_requests:0}
 writeFileSync('.cache/mobile-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({result:'PASS',cases:results.length,widths:[320,375,390,520],target_checks:targetChecks,page_errors:errors.length}))
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
