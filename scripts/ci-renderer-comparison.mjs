import {chromium} from '@playwright/test'
const backend=process.env.BACKEND
const browser=await chromium.launch({channel:'chromium',headless:backend!=='mesa',args:['--enable-gpu',...(backend==='mesa'?['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']:backend==='warp'?['--use-angle=warp','--ignore-gpu-blocklist']:[])]})
const info=await(await browser.newBrowserCDPSession()).send('SystemInfo.getInfo')
console.log('GPU',JSON.stringify(info.gpu.devices),info.gpu.auxAttributes.glRenderer)
try {
 for(const [width,height,mobile,dpr] of [[1280,720,false,1],[844,390,true,3]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:dpr})
  await page.goto('http://127.0.0.1:4173/?theme=jade&quality=low')
  const start=page.locator('.start-button')
  await start.waitFor({timeout:60000})
  await start.evaluate(el=>el.addEventListener('click',()=>{
   const original=Math.random;let n=1987
   Math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32)
   setTimeout(()=>{Math.random=original},0)
   const now=performance.now(),m=window.marks=[]
   let prev=''
   new MutationObserver(()=>{
    const hud=document.querySelector('.game-table-hud'),state=hud?.dataset.openingStage+' '+hud?.dataset.dealSerial+' '+!!document.querySelector('.table-loading')
    if(state!==prev){m.push([state,Math.round(performance.now()-now)]);prev=state}
   }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-deal-serial','data-opening-stage']})
  },{capture:true,once:true}))
  const t=Date.now()
  await start.click().catch(e=>console.log(String(e)))
  try {await page.waitForFunction(()=>document.querySelectorAll('.hand-rack.playable .mahjong-tile').length===14,null,{timeout:110000})}catch(e){console.log(String(e))}
  console.log('TABLE',width,height,dpr,Date.now()-t,JSON.stringify(await page.evaluate(()=>window.marks)))
  await page.close()
 }
} finally {await browser.close()}
