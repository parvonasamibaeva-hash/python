const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');

test('passport versions are created from run or verification code, not typing debounce', () => {
  assert.match(index, /passportCheckpoint\(runTaskForPassport,'run',null,code\)/);
  assert.match(index, /passportCheckpoint\(t,'verification',result,code\)/);
  assert.doesNotMatch(index, /setTimeout\(\(\)=>passportCheckpoint\(t,'checkpoint'/);
});

test('lesson 5 active catalog no longer contains task 13', () => {
  assert.doesNotMatch(index, /title:"Задача 13\. Проект «Угадай число»"/);
  assert.match(index, /title:"Задача 14\. Играем в рулетку"/);
});
