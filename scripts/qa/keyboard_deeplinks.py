from playwright.sync_api import sync_playwright
import sys
B=sys.argv[1] if len(sys.argv)>1 else "https://regional-watch.pages.dev"
FOC=r"""()=>{const e=document.activeElement;if(!e||e===document.body)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect();
return {t:e.tagName.toLowerCase()+' '+(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,30).replace(/\n/g,' '),
ring:(s.outlineStyle!='none'&&parseFloat(s.outlineWidth)>0)?'outline '+s.outlineWidth+' '+s.outlineColor:(s.boxShadow!='none'?'shadow':'NONE'),
inView:r.top>=0&&r.bottom<=innerHeight}}"""
with sync_playwright() as p:
  b=p.chromium.launch(); pg=b.new_page(viewport={"width":1363,"height":900})
  pg.goto(B+"/",wait_until="networkidle")
  print("skip link:",pg.evaluate("!!document.querySelector('a[href^=\"#\"]')"), pg.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].slice(0,3).map(a=>a.getAttribute('href')+' '+a.innerText.trim())"))
  for i in range(14):
    pg.keyboard.press("Tab"); print(i,pg.evaluate(FOC))
  # nav by keyboard
  pg.goto(B+"/",wait_until="networkidle")
  pg.focus("nav a[href*='events']"); pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
  print("after Enter:",pg.url, pg.title(), "focus:",pg.evaluate(FOC))
  pg.go_back(); pg.wait_for_timeout(800); print("back:",pg.url,pg.title())
  pg.go_forward(); pg.wait_for_timeout(800); print("fwd:",pg.url,pg.title())
  # lang switch
  pg.click("a:has-text('עברית')"); pg.wait_for_load_state("networkidle"); print("lang->",pg.url,pg.evaluate("document.documentElement.dir"))
  pg.click("a:has-text('RU')"); pg.wait_for_load_state("networkidle"); print("lang<-",pg.url)
  # card expand by keyboard
  pg.goto(B+"/events",wait_until="networkidle")
  btn=pg.locator("button[aria-expanded]").first; btn.focus(); print("expand btn ring:",pg.evaluate(FOC))
  pg.keyboard.press("Enter"); pg.wait_for_timeout(500); print("aria-expanded:",btn.get_attribute("aria-expanded"), "controls:",btn.get_attribute("aria-controls"))
  pg.keyboard.press("Enter"); pg.wait_for_timeout(300); print("collapsed:",btn.get_attribute("aria-expanded"))
  # deep links
  for path in ["/events#changes","/data/","/he/analysts/","/nonexistent","/he/xyz","/#changes"]:
    pg2=b.new_page(viewport={"width":1363,"height":900}); r=pg2.goto(B+path,wait_until="networkidle"); pg2.wait_for_timeout(700)
    print("deep",path,r.status,pg2.url.replace(B,''),pg2.title(),"scrollY",pg2.evaluate("scrollY"),"anchor",pg2.evaluate("location.hash&&!!document.getElementById(location.hash.slice(1))"))
    pg2.close()
  b.close()
