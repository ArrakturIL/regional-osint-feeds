import { rwEditorialPending } from './editorialPending.js';
export function rwEvidence(s){
 const b=String(s?.basis||"").trim();
 if(s?.verified===true&&b&&!rwEditorialPending(s))return {label:"Основание: "+b,hint:"Наличие источника или документа не доказывает все содержащиеся в них утверждения."};
 if(s?.verified===true)return {label:"Основание не уточнено",hint:"Система не указывает характер подтверждения"};
 return {label:s?.verified===false?"Подтверждение не установлено":"Статус подтверждения неизвестен",hint:"В базе нет подтверждения сведений; это не означает их опровержение."};
}
