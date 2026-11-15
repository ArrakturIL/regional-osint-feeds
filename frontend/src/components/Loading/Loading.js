import { h } from '../../app/runtime.js';
export function Loading({label}){return h("div",{className:"loading skeleton"},label||"Загружаем данные из D1…")}
