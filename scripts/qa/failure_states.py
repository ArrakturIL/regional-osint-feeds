from playwright.sync_api import sync_playwright
import sys
B=sys.argv[1] if len(sys.argv)>1 else "https://regional-watch.pages.dev"
TXT="()=>[...document.querySelectorAll('.rw-feed-state,[role=alert],.error,.rw-stale,.rw-feed-note')].map(e=>e.innerText.replace(/\\n/g,' ').slice(0,90))"
with sync_playwright() as p:
  b=p.chromium.launch()
  for lang in ["","/he"]:
    for mode,st,body in [("503",503,"err"),("429",429,"slow"),("badjson",200,"<html>oops")]:
      pg=b.new_page(viewport={"width":390,"height":900}); errs=[]
      pg.on("pageerror",lambda e: errs.append(str(e)[:100]))
      pg.route("**/api/**",lambda r: r.fulfill(status=st,body=body,headers={"content-type":"application/json" if mode=="badjson" else "text/plain"}))
      for path in ["/","/events","/data"]:
        pg.goto(B+(lang+path if path!="/" else (lang or "/")),wait_until="networkidle"); pg.wait_for_timeout(1200)
        t=pg.evaluate(TXT); btns=pg.evaluate("[...document.querySelectorAll('main button')].map(b=>b.innerText.trim()).filter(x=>/Повтор|נסה|שוב/.test(x)).length")
        print(lang or "ru",mode,path,"retry btns",btns,"| blank" if not t else "",t[:3])
      if errs: print("  pageerrors",errs)
      pg.close()
  # last-good
  pg=b.new_page(viewport={"width":1363,"height":900}); pg.clock.install()
  fail={"on":False}
  pg.route("**/api/**",lambda r: r.fulfill(status=503,body="x") if fail["on"] else r.continue_())
  pg.goto(B+"/events",wait_until="networkidle"); pg.wait_for_timeout(1500)
  n0=pg.evaluate("document.querySelectorAll('.rw-dossier,.news-card').length"); fail["on"]=True
  pg.clock.run_for(130000); pg.wait_for_timeout(1500)
  print("last-good: cards before",n0,"after",pg.evaluate("document.querySelectorAll('.rw-dossier,.news-card').length"),pg.evaluate(TXT)[:3])
  pg.screenshot(path="lastgood.png")
  b.close()
