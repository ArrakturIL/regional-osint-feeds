export function marketTitle(q){
 const s=String(q||"");
 let x=s.match(/^US x Iran Effective Ceasefire by (.+)\?$/i);if(x)return "Прекращение огня США–Иран до "+x[1];
 x=s.match(/^Next US-Iran senior diplomatic meeting by (.+)\?$/i);if(x)return "Встреча США–Иран до "+x[1];
 x=s.match(/^Will (.+) be head of state in Iran end of 2026\?$/i);if(x)return "Глава Ирана в конце 2026: "+x[1];
 return s;
}
