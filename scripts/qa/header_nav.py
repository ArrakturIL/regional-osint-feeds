from playwright.sync_api import sync_playwright
import sys
B=sys.argv[1]
with sync_playwright() as p:
  b=p.chromium.launch()
  for lang,w in [("",1363),("/he",390)]:
    pg=b.new_page(viewport={"width":w,"height":900}); api=[]; errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:100]))
    pg.goto(B+(lang or "/"),wait_until="networkidle"); pg.evaluate("window.__alive=1")
    pg.on("request",lambda r: api.append(r.url.split('/api/')[1][:30]) if '/api/' in r.url else None)
    for sec in ["events","data","analysts"]:
      pg.click(f"nav#rw-site-links a[href$='/{sec}']"); pg.wait_for_timeout(900)
      print(lang or "ru",w,sec,pg.url.replace(B,''),pg.evaluate("[window.__alive, document.querySelector('nav [aria-current]')?.getAttribute('href'), document.activeElement.id, document.title.slice(0,25)]"))
    pg.go_back(); pg.wait_for_timeout(700); print(" back:",pg.url.replace(B,''),pg.evaluate("[window.__alive, document.querySelector('nav [aria-current]')?.getAttribute('href')]"))
    print(" api during nav:",api,"errors",errs); pg.close()
  b.close()
