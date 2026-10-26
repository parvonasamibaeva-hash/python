const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');

test('passport versions are created from run or verification code, not typing debounce', () => {
  assert.match(index, /passportCheckpoint\(runTaskForPassport,'run',null,code\)/);
  assert.match(index, /passportCheckpoint\(t,'verification',result,code\)/);
  assert.doesNotMatch(index, /setTimeout\(\(\)=>passportCheckpoint\(t,'checkpoint'/);
});

test('historical lesson 5 task 13 stays in the catalog but is hidden from students', () => {
  assert.match(index, /title:"Задача 13\. Проект «Угадай число»"[\s\S]*?hiddenFromStudent:true/);
  assert.match(index, /arr\.filter\(t=>taskIsAvailable\(t\)/);
  assert.match(index, /visibleTasks\.filter\(t=>!t\.hiddenFromStudent\)/);
  assert.match(index, /find\(item=>!\(authSession&&authSession\.role==='student'&&item\.hiddenFromStudent===true\)\)/);
});
