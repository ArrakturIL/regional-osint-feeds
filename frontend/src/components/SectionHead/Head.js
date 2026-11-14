import { h, t } from '../../app/runtime.js';
import { UiIcon } from '../UiIcon/UiIcon.js';
export function Head({title,sub,right,icon}){return h("div",{className:"section-head"},h("div",null,h("div",{className:"rw-title-with-icon"},icon?h(UiIcon,{name:icon,size:21}):null,t("h2",null,title)),sub?t("p",null,sub):null),right||null)}

