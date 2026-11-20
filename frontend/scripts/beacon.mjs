// Visitors (owner 20.11): Cloudflare Web Analytics beacon on the 8 public
// pages only (not /ops). No cookies; the token is public by design. The site
// tag (config/web-analytics.json) is read back by scripts/site_visitors.py.
export const RUM_TOKEN='dec54e935c954702b1110347f53533e0';
export function withBeacon(html,token=RUM_TOKEN){
 const tag=`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>`;
 return html.replace('</head>',tag+'</head>');
}
