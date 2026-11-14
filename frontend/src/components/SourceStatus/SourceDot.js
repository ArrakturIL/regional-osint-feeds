import { h } from '../../app/runtime.js';
export function SourceDot({state}){return h("span",{className:"rw-dot"+(state==="error"?" bad":state==="partial"||state==="empty"||state==="unknown"?" partial":"")})}
