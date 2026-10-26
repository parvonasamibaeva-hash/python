const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(process.argv[2] || 'checker.js', 'utf8');
const ctx = {console, Date, Set, Map, Number, String, Object, Array, JSON, Math};
vm.createContext(ctx);
vm.runInContext(source, ctx);
const checker = ctx.PythonTaskChecker;
(async () => {
  const tests = [];
  tests.push(['all tests pass', async () => {
    const r = await checker.run({task:{tests:[{input:[],expected:'2'},{input:['3'],expected:'6'}]},code:'print(2)',runTest:async (_code,input)=>({ok:true,output:input.length?'6':'2'})});
    assert.strictEqual(r.type,'success');assert.strictEqual(r.passedTests,2);assert.strictEqual(r.totalTests,2);
  }]);
  tests.push(['wrong output reports category and counts', async () => {
    const r = await checker.run({task:{tests:[{input:[],expected:'expected'}]},code:'print("actual")',runTest:async()=>({ok:true,output:'actual'})});
    assert.strictEqual(r.type,'wrong_answer');assert.strictEqual(r.category,'wrong_output');assert.strictEqual(r.passedTests,0);assert.strictEqual(r.totalTests,1);
  }]);
  tests.push(['runtime errors keep a specific category', async () => {
    const r = await checker.run({task:{tests:[{input:[],expected:'1'}]},code:'x + 1',runTest:async()=>({ok:false,error:'TypeError: unsupported operand type(s)'})});
    assert.strictEqual(r.type,'execution_error');assert.strictEqual(r.category,'type_error');
  }]);
  tests.push(['unsupported checker asks for manual review, not false success', async () => {
    const r = await checker.run({task:{checker:'not-installed'},code:'print(1)',runTest:async()=>({ok:true,output:'1'})});
    assert.strictEqual(r.type,'manual_review');assert.strictEqual(r.category,'unsupported_checker');
  }]);
  tests.push(['empty code is not marked solved', async () => {
    const r = await checker.run({task:{tests:[{input:[],expected:'1'}]},code:'   ',runTest:async()=>({ok:true,output:'1'})});
    assert.strictEqual(r.type,'invalid');assert.strictEqual(r.category,'empty_code');
  }]);
  let failed=0;
  for (const [name,fn] of tests) {
    try { await fn(); console.log('OK   '+name); }
    catch (e) { failed++; console.log('FAIL '+name+' | '+(e&&e.message||e)); }
  }
  console.log(`\nПроверок: ${tests.length}, не пройдено: ${failed}`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
