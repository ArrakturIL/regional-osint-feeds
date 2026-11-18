from playwright.sync_api import sync_playwright
import sys
B=sys.argv[1] if len(sys.argv)>1 else "https://regional-watch.pages.dev"
J=r"""()=>{const g=document.querySelector('.rw-digest');if(!g)return 'no digest';
const items=[...g.querySelectorAll('.rw-digest-item,.rw-digest-summary,.rw-digest-meta-item')];
const cols=getComputedStyle(g.querySelector('.rw-digest-grid')||g).gridTemplateColumns;
return {state:g.innerText.slice(0,80).replace(/\n/g,' | '),cols,n:items.length,
items:items.slice(0,10).map(e=>{const r=e.getBoundingClientRect();return e.className.split(' ')[0]+' '+Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)+(e.scrollHeight>e.clientHeight+1?' CLIP':'')+(e.scrollWidth>e.clientWidth+1?' XCLIP':'')}),
radius:getComputedStyle(g.querySelector('.rw-digest-summary,.rw-digest-item')||g).borderRadius}}"""
with sync_playwright() as p:
  b=p.chromium.launch()
  for lang in ["","/he"]:
    for w in [390,719,1363]:
      pg=b.new_page(viewport={"width":w,"height":900}); pg.goto(B+(lang or "/"),wait_until="networkidle"); pg.wait_for_timeout(800)
      print(lang or "/",w,pg.evaluate(J))
      if w==1363: pg.locator(".rw-digest").screenshot(path=f"digest{lang.replace('/','_')}.png")
      pg.close()
  b.close()
