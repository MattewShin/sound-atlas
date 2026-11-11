import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve,extname} from 'node:path'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'
const option=name=>process.argv[process.argv.indexOf(name)+1]
const require=createRequire(resolve(option('--playwright-module'),'package.json')),{chromium}=require('playwright')
const base='3e4e163fbc77577354dddc783d174ccb2893258a',before=path=>execFileSync('git',['show',base+':'+path],{encoding:'utf8',windowsHide:true})
const oldHtml=before('index.html'),oldCss=before('src/styles.css'),newHtml=readFileSync('index.html','utf8'),newCss=readFileSync('src/styles.css','utf8')
mkdirSync('.cache/pwa-top-shots',{recursive:true})
await build({entryPoints:['scripts/pwaTopMobileEntry.jsx'],bundle:true,platform:'browser',format:'iife',outfile:'.cache/pwa-top-app.js',define:{'import.meta.env':'{}'},logLevel:'silent'})
const assets=new Map(['/src/components/musicSocial.css','/.cache/pwa-top-app.js'].map(p=>[p,resolve('.'+p)]))
assets.set('/fonts/PretendardVariable.woff2',resolve('public/fonts/PretendardVariable.woff2'))
assets.set('/manifest.webmanifest',resolve('public/manifest.webmanifest'))
for(const name of ['icon-192.png','icon-512.png','apple-touch-icon.png'])assets.set('/icons/'+name,resolve('public/icons/'+name))
const server=createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),baseline=u.searchParams.get('variant')==='baseline',standalone=u.searchParams.get('mode')==='standalone-css',query=u.search
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end((baseline?oldHtml:newHtml).replace('</head>','<link rel="stylesheet" href="/src/styles.css'+query+'"><link rel="stylesheet" href="/src/components/musicSocial.css"></head>').replace('<script type="module" src="/src/main.jsx"></script>','<script src="/.cache/pwa-top-app.js"></script>'));return}
 if(u.pathname==='/src/styles.css'){let css=baseline?oldCss:newCss;if(standalone)css=css.replaceAll('@media (display-mode: standalone)','@media all');res.setHeader('Content-Type','text/css');res.end(css);return}
 const file=assets.get(u.pathname);if(!file){res.writeHead(404);res.end();return}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)]??'application/octet-stream');res.end(readFileSync(file))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({executablePath:option('--browser'),headless:true}),results=[],baselineMetrics=new Map(),modes=new Map(),errors=[]
let variant,mode,width,screen
const settle=async page=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(180)}
const go=async(page,hash)=>{await page.evaluate(h=>{location.hash=h;scrollTo(0,0)},hash);await settle(page)}
async function check(page,name,selector){
 screen=name;await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settle(page)
 const data=await page.locator(selector).first().evaluate(header=>{
  const box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
  const style=el=>{const c=getComputedStyle(el);return{paddingTop:c.paddingTop,paddingBottom:c.paddingBottom,background:c.backgroundColor,image:c.backgroundImage,filter:c.filter,backdrop:c.backdropFilter||c.webkitBackdropFilter||'none',mask:c.maskImage||c.webkitMaskImage||'none',font:c.fontFamily,size:parseFloat(c.fontSize),tracking:parseFloat(c.letterSpacing),line:c.lineHeight}}
  const text=el=>{const c=style(el),centers=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(node.parentElement.closest('svg,[aria-hidden="true"]'))continue;let offset=0;for(const ch of node.textContent){const start=offset;offset+=ch.length;if(!ch.trim())continue;const range=document.createRange();range.setStart(node,start);range.setEnd(node,offset);for(const r of range.getClientRects()){const y=r.top+r.height/2;if(r.width&&r.height&&!centers.some(v=>Math.abs(v-y)<c.size*.4))centers.push(y)}}}return{...c,lines:centers.length,box:box(el)}}
  const heading=header.querySelector('h1'),first=header.querySelector('a,button,p')
  const chain=[];for(let el=header;el;el=el.parentElement)chain.push(style(el))
  const after=getComputedStyle(header,'::after'),nav=document.querySelector('.bottom-nav')
  return{header:box(header),style:style(header),heading:text(heading),first:first?text(first):null,chain,after:{content:after.content,width:after.width,height:after.height,border:after.border,borderRadius:after.borderRadius,filter:after.filter,backdrop:after.backdropFilter||'none',mask:after.maskImage||'none',image:after.backgroundImage},controls:[...header.querySelectorAll('a,button')].map(el=>{const r=box(el),brand=el.matches('.brand');return{...r,brand,brand_hit_44:brand?[r.y+r.height/2-21,r.y+r.height/2+21].every(y=>{const target=document.elementFromPoint(r.x+r.width/2,y);return target===el||el.contains(target)}):null}}),nav:{box:box(nav),style:style(nav),buttons:[...nav.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),text:b.textContent,box:box(b),svg:box(b.querySelector('svg'))}))},canvas:[document.documentElement,document.body,document.getElementById('root')].map(style),overflow:document.documentElement.scrollWidth>innerWidth,status:document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content,viewport:document.querySelector('meta[name="viewport"]').content}
 })
 assert(!data.overflow,`${variant} ${mode} ${width} ${name}: overflow`)
 assert(data.header.y>=0);assert(data.heading.box.y>=data.header.y);assert(data.heading.box.right<=width+.5);assert(data.heading.box.bottom<=data.header.bottom+.5)
 if(data.first){assert(data.first.box.y>=0);assert(data.first.box.bottom<=data.header.bottom+.5)}
 for(const [i,c] of data.chain.entries()){assert.equal(c.filter,'none');assert.equal(c.backdrop,'none');assert.equal(c.mask,'none');if(name==='concerts'&&i===0)assert(c.image.startsWith('linear-gradient('));else assert.equal(c.image,'none')}
 for(const key of ['filter','backdrop','mask','image'])assert.equal(data.after[key],'none')
 for(const t of [data.heading,data.first].filter(Boolean)){assert(t.font.includes('Pretendard'));assert(t.size>=12&&t.size%2===0);assert(Math.abs(t.tracking/t.size+.03)<.002);if(t.lines>1)assert(Math.abs(parseFloat(t.line)/t.size-1.5)<.01);else if(t.lines===1)assert.equal(t.line,'normal')}
 for(const c of data.controls){assert(c.width>=44,`${name}: narrow header control`);if(c.brand){if(variant==='candidate')assert(c.brand_hit_44,'brand hit test must reach 44px')}else assert(c.height>=44,`${name}: short header control`)}
 assert.equal(data.nav.buttons.length,5);for(const b of data.nav.buttons){assert(b.label);assert.equal(b.text,'');assert(b.box.width>=44&&b.box.height>=44);assert.equal(b.svg.width,28);assert.equal(b.svg.height,28)}
 const key=mode+':'+width+':'+name
 const stable={header:data.header,style:data.style,heading:data.heading,first:data.first,after:data.after,nav:data.nav,controls:data.controls.map(({brand_hit_44,...geometry})=>geometry)}
 if(variant==='baseline'){baselineMetrics.set(key,stable);return}
 assert.equal(data.status,'default');assert(data.viewport.includes('viewport-fit=cover'));for(const c of data.canvas)assert.equal(c.background,'rgb(247, 243, 235)')
 assert.deepEqual(stable,baselineMetrics.get(key),'Header spacing/decorations and bottom geometry must match baseline: '+key)
 const baseKey=width+':'+name;if(mode==='browser')modes.set(baseKey,data.header);else assert.deepEqual(data.header,modes.get(baseKey),'Standalone CSS must not add top spacing')
 const record={screen:name,width,mode,result:'PASS',header_top:data.header.y,first_element_top:data.first?.box.y??null,title_top:data.heading.box.y,header_padding_top:data.style.paddingTop,header_background:data.style.background,canvas_opaque_cream:true,header_blur_mask:false,unexpected_gradient:false,retained_header_gradient:data.style.image!=='none',header_matches_baseline:true,bottom_matches_baseline:true,extra_standalone_top_gap:false,touch_minimum_44:true,typography:'PASS'};results.push(record)
 if(['home','profile','profile/settings'].includes(name))await page.screenshot({path:'.cache/pwa-top-shots/'+name.replaceAll('/','-')+'-'+mode+'-'+width+'.png'})
}
try{
 for(mode of ['browser','standalone-css'])for(width of [320,375,390])for(variant of ['baseline','candidate']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage()
  page.on('pageerror',()=>errors.push({variant,mode,width,screen}));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort())
  await page.goto(origin+'/?variant='+variant+'&mode='+mode+'#explore');await page.locator('.top-header').waitFor();await check(page,'home','.top-header')
  await page.locator('.keyword-choice-list button').first().click();await page.locator('.recommendations-see-all').first().click();await page.locator('.recommendation-list-header').waitFor();await check(page,'recommendations','.recommendation-list-header')
  await page.getByRole('button',{name:'보관함',exact:true}).click();await check(page,'library','.library-header')
  await page.getByRole('button',{name:'공연 찾기',exact:true}).click();await check(page,'concerts','.concert-coming-header')
  await page.getByRole('button',{name:'음악 이야기',exact:true}).click();await page.locator('.social-heading').waitFor();await check(page,'music-stories','.social-heading')
  for(const route of ['profile','profile/records','profile/taste','profile/settings','profile/edit','profile/preview','profile/blocked','profile/privacy']){
   await page.goto('about:blank');await page.goto(origin+'/?variant='+variant+'&mode='+mode+'#'+route);await page.locator('.profile-dashboard-header').waitFor();await check(page,route,'.profile-dashboard-header')
  }
  await context.close()
 }
 assert.equal(errors.length,0);assert.equal(results.length,78)
 const output={task_id:'CA-PWA-TOP-SAFE-AREA-20261111-001',result:'PASS',baseline_main:base,widths:[320,375,390],candidate_cases:78,baseline_cases:baselineMetrics.size,cases:results,mode_scope:{browser:'Chromium mobile viewport; no Safari chrome',standalone_css:'Test server activates the existing standalone CSS media rule in both baseline/candidate; not an installed Android/iOS PWA'},cdp_display_mode_emulation_supported:false,safe_area_insets_on_host:'No real notch/home-indicator insets on Windows Chromium',page_errors:0,external_network_allowed:false,real_ios_pwa:false,real_safari_browser:false,real_android_installed_pwa:false,production_requests:0,original_iphone_screenshot_used:false}
 writeFileSync('.cache/pwa-top-mobile.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({result:'PASS',candidate:78,baseline:baselineMetrics.size,widths:output.widths,ios_pwa:false}))
}catch(e){console.error(JSON.stringify({result:'FAIL',variant,mode,width,screen,message:e.message}));process.exitCode=1}finally{await browser.close();await new Promise(r=>server.close(r))}
