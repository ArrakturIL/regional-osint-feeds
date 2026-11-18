import json,sys
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else "https://regional-watch.pages.dev"
ROUTES=["/","/events","/data","/analysts"]
WIDTHS=[390,719,1363]
PROBE=r"""
() => {
 const W=innerWidth, out={};
 out.sw=document.documentElement.scrollWidth;
 out.lang=document.documentElement.lang; out.dir=document.documentElement.dir;
 out.h1=[...document.querySelectorAll('h1')].map(e=>e.textContent.trim().slice(0,40));
 const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!='hidden'&&s.display!='none'};
 const desc=e=>e.tagName.toLowerCase()+(e.className&&typeof e.className=='string'?'.'+e.className.trim().split(/\s+/).slice(0,2).join('.'):'')+' "'+(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,25)+'"';
 out.overflow=[...document.querySelectorAll('body *')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();
   let p=e.parentElement;while(p){const s=getComputedStyle(p);if(/(hidden|auto|scroll|clip)/.test(s.overflowX))return false;p=p.parentElement}
   return r.right>W+1||r.left<-1}).slice(0,6).map(desc);
 const ctl=[...document.querySelectorAll('a[href],button,[role=button],input,select,summary,[tabindex]:not([tabindex="-1"])')].filter(vis);
 out.noname=ctl.filter(e=>!(e.innerText||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.getAttribute('title')&&!(e.labels&&e.labels.length)).slice(0,6).map(desc);
 out.small=W<500?ctl.filter(e=>{const r=e.getBoundingClientRect();return r.height<32||r.width<32}).slice(0,8).map(e=>desc(e)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)):[];
 out.imgNoAlt=[...document.images].filter(i=>!i.hasAttribute('alt')).length;
 out.navCurrent=[...document.querySelectorAll('nav [aria-current]')].map(e=>e.innerText.trim()+':'+e.getAttribute('aria-current'));
 out.controls=ctl.length;
 return out;
}"""
res={}
with sync_playwright() as p:
  b=p.chromium.launch()
  for lang in ["","/he"]:
    for r in ROUTES:
      for w in WIDTHS:
        path=(lang+r).rstrip('/') or '/'
        if lang and r=='/': path='/he'
        pg=b.new_page(viewport={"width":w,"height":900}); errs=[]
        pg.on("console",lambda m: errs.append(m.text[:120]) if m.type=="error" else None)
        pg.on("pageerror",lambda e: errs.append(str(e)[:120]))
        resp=pg.goto(BASE+path,wait_until="networkidle"); pg.wait_for_timeout(600)
        o=pg.evaluate(PROBE); o["status"]=resp.status; o["errors"]=errs
        key=f"{path} {w}"; res[key]=o
        flags=[k for k in("overflow","noname","small","errors") if o[k]]
        print(key, o["status"], "sw",o["sw"], o["lang"],o["dir"], "nav",o["navCurrent"], "h1",o["h1"], "| issues:",{k:o[k] for k in flags})
        pg.close()
  b.close()
json.dump(res,open("qa_layout.json","w"),ensure_ascii=False,indent=1)
