import assert from 'node:assert/strict';
import {canonicalNewsUrl,normalizedHeadline,isStrongTitle,articlePriority} from './live-editor/news-normalization.mjs';

const sameA='https://news.example.org/article/?utm_source=x&id=1';
const sameB='https://news.example.org/article?id=1&utm_source=y';
assert.equal(canonicalNewsUrl(sameA),canonicalNewsUrl(sameB),
  'BE-07: tracker position and final slash must not affect identity');
assert.equal(canonicalNewsUrl('https://news.example.org/a?id=3&foo=b&utm_campaign=z'),
  canonicalNewsUrl('https://news.example.org/a?foo=b&id=3#section'),
  'BE-07: sorted meaningful parameters and removed fragment');
assert.equal(canonicalNewsUrl('https://news.example.org/a?fbclid=abc&id=9'),
  canonicalNewsUrl('https://news.example.org/a?id=9'));
assert.notEqual(canonicalNewsUrl('https://news.example.org/a?id=1'),
  canonicalNewsUrl('https://news.example.org/a?id=2'),
  'Do not delete meaningful ID parameters');
assert.equal(canonicalNewsUrl('http://news.example.org/a'),null);

assert.equal(normalizedHeadline('Israel and Iran! '),
  normalizedHeadline('ISRAEL AND IRAN'), 'Punctuation must not create a new key');
assert.equal(normalizedHeadline('שלום!'),normalizedHeadline('שלום  '));
assert.equal(normalizedHeadline('إيران؟'),normalizedHeadline('إيران'));

assert.equal(isStrongTitle('Warsaw opens library'),false,
  'BE-06: Warsaw is not a war keyword');
assert.equal(isStrongTitle('The war continues'),true);
assert.equal(isStrongTitle('Warnings of missile attacks'),true);
assert.equal(articlePriority(4,'Warsaw opens library',false),4,
  'BE-06: irrelevant Warsaw headline stays at feed base score');
assert.equal(articlePriority(4,'War starts',false),7,
  'BE-06: actual war word receives the headline bonus');
assert.equal(articlePriority(4,'War in Israel',true),10);

console.log('QA RSS: technical URL identity, Unicode title normalization and keyword boundaries passed');
