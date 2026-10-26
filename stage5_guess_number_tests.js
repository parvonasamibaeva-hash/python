// Запуск: node stage5_guess_number_tests.js
// Регрессионные проверки обновлённого занятия 8.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const codeGs = fs.readFileSync('Code.gs', 'utf8');

function lesson8Catalog() {
  const start = html.indexOf('const lesson8Tasks=') + 'const lesson8Tasks='.length;
  const end = html.indexOf('\n];', start) + 2;
  return JSON.parse(html.slice(start, end));
}
function fnSrc(source, name) {
  const i = source.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('нет функции ' + name);
  const open = source.indexOf('{', i); let depth = 0, quote = '', escaped = false;
  for (let p = open; p < source.length; p += 1) {
    const c = source[p];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    if (c === '}' && --depth === 0) return source.slice(i, p + 1);
  }
  throw new Error('не закрыта функция ' + name);
}
let count = 0;
function test(name, fn) { count += 1; fn(); console.log('OK   ' + name); }
const catalog = lesson8Catalog();
test('занятие 8 содержит ровно девять задач из документа', () => {
  assert.deepStrictEqual(catalog.map(t => t.id), [1,2,3,4,5,6,7,8,9]);
  assert.deepStrictEqual(catalog.map(t => t.title), [
    'Задача 1. Сумма чисел', 'Задача 2. Пока делимся', 'Задача 3. Количество членов',
    'Задача 4. Сколько ждать?', 'Задача 5. Наибольший общий делитель',
    'Задача 6. Ведьмаку заплатите чеканной монетой', 'Задача 7. Простые множители',
    'Задача 8. Найди периметр многоугольника', 'Задача 9. Подбрасываем монетку'
  ]);
});
test('задачи 1–8 имеют открытые тесты и учебные материалы', () => {
  catalog.slice(0, 8).forEach(task => {
    assert.ok(task.problem && task.examples && task.starter && task.hint && task.theory, task.title);
    assert.ok(Array.isArray(task.tests) && task.tests.length >= 3, task.title);
  });
});
test('задача 9 отправляется на ручную проверку случайного алгоритма', () => {
  assert.strictEqual(catalog[8].checker, 'coin_flip');
  assert.deepStrictEqual(catalog[8].tests, []);
  assert.match(html, /async function checkCoinFlip/);
  assert.match(html, /coin_flip:checkCoinFlip/);
});
test('сервер открывает первый шаг сразу и проверяет последовательный маршрут 8-1…8-9', () => {
  const rows = [];
  const ctx = { readTaskObjects_: () => rows };
  vm.createContext(ctx);
  vm.runInContext(fnSrc(codeGs, 'taskPrerequisiteGroups_') + '\n' + fnSrc(codeGs, 'assertPreviousTaskCompleted_'), ctx);
  assert.doesNotThrow(() => ctx.assertPreviousTaskCompleted_({accountId:'a'}, 8, 1));
  assert.throws(() => ctx.assertPreviousTaskCompleted_({accountId:'a'}, 8, 2), /предыдущую задачу/);
  rows.push({'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':1,'Результат':'Решена'});
  assert.doesNotThrow(() => ctx.assertPreviousTaskCompleted_({accountId:'a'}, 8, 2));
  rows.push({'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':8,'Результат':'Решена'});
  assert.doesNotThrow(() => ctx.assertPreviousTaskCompleted_({accountId:'a'}, 8, 9));
});
test('старые записи 5-13 остаются в серверном исходнике для совместимости', () => {
  assert.match(codeGs, /5-13/);
});
console.log('\nПроверок: ' + count + ', не пройдено: 0');
