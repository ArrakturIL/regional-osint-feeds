export function rwEditorialPending(s){return /не обработано редакц|без редакционн(ого|ой) оформлен|редакционно не оформ/i.test(String(s?.basis||""))}
