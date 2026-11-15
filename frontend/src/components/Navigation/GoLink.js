import { h } from '../../app/runtime.js';
export function GoLink({to,go,children,className}){return h("a",{href:to,className,onClick:e=>{if(e.button||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;e.preventDefault();go(to)}},children)}

