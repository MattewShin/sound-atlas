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
  const controls=await page.locator('.my-profile a,.my-profile button,.profile-back').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height,label:el.getAttribute('aria-label')||el.textContent.slice(0,40)}}));for(const c of controls)assert(c.width>=44&&c.height>=44,JSON.stringify({width,state,control:c}))
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
 for(const width of [320,375,390]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true})
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
  const go=async hash=>{await page.evaluate(hash=>{location.hash=hash},hash);await settle(page)}
  const shot=async name=>page.screenshot({path:'.cache/mobile-shots/'+name+'-'+width+'.png',fullPage:name==='home'})
  await page.goto(origin+'/#music');await page.locator('.social-post').waitFor();await check(page,width,'signed-in-feed')
  await page.locator('.social-menu summary').click();await check(page,width,'post-menu')
  await page.getByRole('button',{name:'내 프로필',exact:true}).click();await page.locator('.profile-record-counts').waitFor();await check(page,width,'profile-home');await shot('home')
  assert.equal(await page.locator('.profile-recent li').count(),3);assert.equal(await page.locator('.social-form,.all-music-records,.account-panel').count(),0)
  await target(page,width,'long-profile-button','.profile-preview-link');await target(page,width,'long-handle','.profile-identity p')
  await page.getByRole('link',{name:'전체 기록 보기',exact:true}).click();await page.locator('.music-journal-entry').first().waitFor();await check(page,width,'records');await shot('records')
  assert.equal(await page.locator('.music-journal-entry').count(),10);await target(page,width,'records-description','.all-music-records > p');await target(page,width,'long-record-body','.music-journal-entry-body')
  const detected=await page.locator('.all-music-records > p').evaluate(el=>{const old=el.getAttribute('style');el.style.setProperty('line-height','normal','important');const m=window.measureRenderedText(el);const caught=m.lines>1&&m.lineHeight==='normal';if(old===null)el.removeAttribute('style');else el.setAttribute('style',old);return caught});assert(detected);negativeControls.push({width,forced_multiline_normal_rejected:true})
  await page.getByRole('button',{name:'기록 더 보기',exact:true}).click();await settle(page);assert.equal(await page.locator('.music-journal-entry').count(),11)
  await page.getByRole('button',{name:'공개 중',exact:true}).click();await check(page,width,'records-public');assert.equal(await page.locator('.music-journal-entry').count(),1)
  await page.getByRole('button',{name:'공유 내용 수정',exact:true}).click();await page.locator('.music-share-editor textarea').fill('합성 공유 초안입니다. '.repeat(30));await page.locator('.music-share-editor textarea').focus();await check(page,width,'shared-editor-focus');await page.locator('.music-share-editor').getByRole('button',{name:'취소',exact:true}).click()
  await page.getByRole('button',{name:'나만 보기',exact:true}).click();await check(page,width,'records-private');assert.equal(await page.locator('.music-journal-entry').count(),10)
  await page.getByRole('button',{name:'기록 남기기',exact:true}).click();await page.locator('.music-journal-form textarea').fill('긴 합성 기록입니다. '.repeat(80)+'\n다음 줄도 입력합니다.');await page.locator('.music-journal-form textarea').focus();await check(page,width,'record-editor-focus');await page.getByRole('button',{name:'작성 취소',exact:true}).click()
  await page.getByRole('link',{name:'내 프로필 홈',exact:false}).click();await check(page,width,'return-home');assert.equal(await page.locator('.profile-recent li').count(),3)
  await go('profile/taste');await check(page,width,'taste');await go('profile/settings');await check(page,width,'settings');await shot('settings');await target(page,width,'settings-profile-link','.profile-menu-row:nth-child(2)')
  await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await settle(page)
  const deletion=await page.getByRole('button',{name:'계정과 데이터 삭제',exact:true}).boundingBox(),nav=await page.locator('.bottom-nav').boundingBox();assert(deletion.y+deletion.height<=nav.y,'account control must clear bottom navigation')
  await page.getByRole('button',{name:'계정과 데이터 삭제',exact:true}).click();await check(page,width,'delete-confirmation');await target(page,width,'delete-confirmation','.account-delete-confirm > p');await page.locator('.account-delete-confirm').getByRole('button',{name:'취소',exact:true}).click()
  await go('profile/preview');await check(page,width,'public-profile-preview');await target(page,width,'public-profile-guide','.public-profile-preview > p:last-of-type')
  await go('profile/edit');await page.locator('.social-form input').first().focus();await check(page,width,'profile-editor-focus')
  await go('profile/blocked');await check(page,width,'blocked');await page.getByRole('button',{name:'차단 해제',exact:true}).click();await check(page,width,'blocked-empty')
  await go('profile/privacy');await check(page,width,'privacy')
  await go('profile/posts');assert.equal(await page.evaluate(()=>location.hash),'#profile/records/public');await page.goBack();await settle(page);assert.equal(await page.evaluate(()=>location.hash),'#profile/privacy');await page.goForward();await settle(page);assert.equal(await page.evaluate(()=>location.hash),'#profile/records/public');await page.reload();await page.locator('.record-filters [aria-pressed="true"]').waitFor();assert.equal(await page.locator('.record-filters [aria-pressed="true"]').textContent(),'공개 중')
  await page.goto(origin+'/?taste=1#profile');await page.locator('.profile-menu-row small').filter({hasText:'많이 보관한 작곡가'}).waitFor();await check(page,width,'taste-summary-populated');await go('profile/taste');await check(page,width,'taste-chart-populated');assert.equal(await page.locator('.preference-chart meter').count(),9)
  await page.goto(origin+'/?empty=1#profile');await page.locator('.profile-record-counts').waitFor();await check(page,width,'empty-home');assert.equal(await page.locator('.profile-recent li').count(),0)
  await page.goto(origin+'/?setup=1#profile');await page.getByRole('link',{name:'공개 프로필 만들기',exact:true}).waitFor();await check(page,width,'profile-not-created')
  await page.goto(origin+'/?guest=1#profile');await page.locator('.profile-login').waitFor();await check(page,width,'anonymous-home');assert.equal(await page.locator('.profile-menu,.profile-recent,.account-panel').count(),0)
  await go('profile/records');await check(page,width,'anonymous-records')
  await page.close()
 }
 assert.deepEqual(errors,[])
 for(const name of ['settings-profile-link','records-description','public-profile-guide','delete-confirmation','long-record-body'])assert(targetChecks.some(t=>t.name===name&&t.lines>1),'missing multiline coverage '+name)
 const evidence={task_id:'CA-PROFILE-DASHBOARD-IA-20261110-001',result:'PASS',environment:'local Chromium / synthetic in-memory transport / network restricted to whitelisted local assets',line_measurement:'independent character Range rectangles and numeric computed line-height; data-text-lines is not trusted',cases:results,target_checks:targetChecks,negative_controls:negativeControls,browser_back_forward_reload:'PASS',navigation_overlay:'PASS',page_errors:0,real_oauth:false,real_postgrest:false,real_realtime:false,real_device_ime:false,production_requests:0}
 writeFileSync('.cache/mobile-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({result:'PASS',cases:results.length,widths:[320,375,390],page_errors:errors.length}))
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
