from playwright.sync_api import sync_playwright
import sys,statistics
B=sys.argv[1]; runs=int(sys.argv[2]) if len(sys.argv)>2 else 3
INIT="""window.__lcp=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>__lcp.push([Math.round(e.startTime),e.element?e.element.tagName+'.'+(e.element.className||'').toString().split(' ')[0]:'?',e.size]))).observe({type:'largest-contentful-paint',buffered:true});"""
with sync_playwright() as p:
  b=p.chromium.launch()
  for path in ["/","/he","/events"]:
    res=[]
    for i in range(runs):
      ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); pg=ctx.new_page()
      cdp=ctx.new_cdp_session(pg); cdp.send("Network.enable"); cdp.send("Network.emulateNetworkConditions",{"offline":False,"latency":150,"downloadThroughput":1.6e6/8,"uploadThroughput":750e3/8}); cdp.send("Emulation.setCPUThrottlingRate",{"rate":4})
      pg.add_init_script(INIT); reqs=[]
      pg.on("requestfinished",lambda r: reqs.append(r))
      pg.goto(B+path,wait_until="load"); pg.wait_for_timeout(5000)
      lcp=pg.evaluate("__lcp"); fcp=pg.evaluate("Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0)")
      fonts=[r.url.split('/')[-1][:22] for r in reqs if '/fonts/' in r.url]
      kb=round(sum((r.sizes()['responseBodySize'] or 0) for r in reqs)/1024)
      res.append((lcp[-1][0] if lcp else 0, fcp)); 
      if i==0: print(path,"LCP el:",lcp[-1][1:] if lcp else None,"reqs",len(reqs),"api",sum('/api/' in r.url for r in reqs),"KB",kb,"fonts",fonts)
      ctx.close()
    print(path,"LCP ms",[r[0] for r in res],"median",statistics.median(r[0] for r in res),"FCP",[r[1] for r in res])
  b.close()
