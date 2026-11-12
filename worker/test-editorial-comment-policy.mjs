import assert from 'node:assert/strict';
import {shouldSuppressComment,safePublishedComment} from './live-editor/editorial-comment-policy.mjs';
const samples=[
 [{headline:'Gaza goalkeeper killed in Israeli attack',headline_ru:'Вратарь из Газы убит в атаке'},true],
 [{headline:'Israeli strike on hospital kills patients'},true],
 [{headline:'IDF strikes Hamas terrorists from Nasser Hospital'},true],
 [{headline:'Хирург получил ранение в Газе'},true],
 [{headline:'בית חולים בעזה נפגע בתקיפה'},true],
 [{headline:'Katz: Caretaker government fully responsible for security'},false],
 [{headline:'Iran open to deal if US refrains from excessive demands'},false],
 [{headline:'EU parliament debates a new agriculture subsidy'},false]
];
for(const [row,expected] of samples){
 assert.equal(shouldSuppressComment(row),expected,'Policy topic: '+row.headline);
 assert.equal(safePublishedComment(row,'Ироничная реплика'),expected?null:'Ироничная реплика');
}
assert.equal(safePublishedComment(samples[0][0],null),null);
console.log('QA editorial policy: fatality/hospital guard and safe political comments passed');
