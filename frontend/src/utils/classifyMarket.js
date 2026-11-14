export function classifyMarket(q){return /ceasefire/i.test(q||"")?"peace":/meeting|diplomatic/i.test(q||"")?"talks":/Iran|Khamenei|Pahlavi/i.test(q||"")?"iran":"other"}
