"""Language leaks: Cyrillic on HE pages, Hebrew on RU pages (incl. expanded dossiers/cards).

Usage: python3 scripts/qa/lang_leak.py [BASE]   (default https://regional-watch.pages.dev)
Prints per page: leak count and up to 15 samples with their CSS context. Proper names in
Latin are fine; any Cyrillic on /he/* or Hebrew on RU pages is a finding unless it is a
quoted original explicitly labelled as such (display policy B4).
"""
import sys
from playwright.sync_api import sync_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "https://regional-watch.pages.dev"
PROBE = r"""(re) => {
  const rx = new RegExp(re), out = [];
  const w = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode, t = n.textContent.trim();
    if (!t || !rx.test(t)) continue;
    const el = n.parentElement, r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const ctx = [];
    for (let p = el; p && ctx.length < 3; p = p.parentElement) if (typeof p.className === 'string' && p.className) ctx.push(p.className.split(' ')[0]);
    out.push(ctx.join('<') + ' :: ' + t.slice(0, 90));
  }
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for path, rx in [(x, "[\\u0400-\\u04FF]") for x in ["/he", "/he/events", "/he/data", "/he/analysts"]] + [
        (x, "[\\u0590-\\u05FF]") for x in ["/", "/events", "/data", "/analysts"]
    ]:
        pg = b.new_page(viewport={"width": 1363, "height": 900})
        pg.goto(B + path, wait_until="networkidle")
        pg.wait_for_timeout(800)
        for btn in pg.locator("main button[aria-expanded='false']").all()[:60]:
            try:
                btn.click(timeout=1500)
            except Exception:
                pass
        pg.wait_for_timeout(800)
        leaks = pg.evaluate(PROBE, rx)
        print(path, "leaks:", len(leaks))
        for s in leaks[:15]:
            print("   ", s)
        pg.close()
    b.close()
