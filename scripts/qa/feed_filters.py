from playwright.sync_api import sync_playwright
import sys
B=sys.argv[1]
with sync_playwright() as p:
  b=p.chromium.launch()
  for lang,w in [("",390),("/he",390),("",1363)]:
    pg=b.new_page(viewport={"width":w,"height":900},has_touch=w<500,is_mobile=w<500); req=[]; errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:100]))
    pg.on("request",lambda r: req.append(r.url.split('/api/')[1]) if '/api/news' in r.url else None)
    pg.goto(B+lang+"/events",wait_until="networkidle"); pg.wait_for_timeout(800)
    root=".rw-archive-controls"
    pg.locator(root).scroll_into_view_if_needed()
    info=pg.evaluate(f"""()=>{{const r=document.querySelector('{root}');const c=[...r.querySelectorAll('button,input,select,a')].filter(e=>e.getBoundingClientRect().width>0);
      return {{n:c.length, small:c.filter(e=>{{const b=e.getBoundingClientRect();return b.height<40}}).map(e=>e.tagName+':'+(e.innerText||e.name||e.type).trim().slice(0,15)+' '+Math.round(e.getBoundingClientRect().height)),
      unlabeled:c.filter(e=>/INPUT|SELECT/.test(e.tagName)&&!(e.labels&&e.labels.length)&&!e.getAttribute('aria-label')).length,
      overflow:document.documentElement.scrollWidth>innerWidth, fontSmall:c.filter(e=>/INPUT|SELECT/.test(e.tagName)&&parseFloat(getComputedStyle(e).fontSize)<16).length}}}}""")
    print(lang or "ru",w,info)
    sorts=pg.locator(".rw-archive-sort button")
    req.clear(); sorts.nth(1).focus(); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    print("  sort via keyboard:",sorts.nth(1).get_attribute("aria-pressed"),[r[:70] for r in req][:2])
    req.clear(); s=pg.locator(".rw-archive-form input[type=search]").first; s.fill("Iran"); s.press("Enter"); pg.wait_for_timeout(1800)
    print("  search Enter:",[r[:90] for r in req][:2], "cards:",pg.locator(".news-card").count())
    reset=pg.locator(".rw-archive-form button[type=reset], .rw-archive-form button:has-text('Сброс'), .rw-archive-form button:has-text('איפוס')")
    if reset.count(): req.clear(); reset.first.click(); pg.wait_for_timeout(1500); print("  reset:",[r[:70] for r in req][:2])
    else: print("  buttons in form:",pg.evaluate("[...document.querySelectorAll('.rw-archive-form button')].map(b=>b.type+':'+b.innerText.trim())"))
    print("  errors",errs); pg.screenshot(path=f"feed{lang.replace('/','_')}{w}.png",full_page=False); pg.close()
  b.close()
