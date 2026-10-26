// Запуск: node stage3_1_tests.js [путь к index.html]
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
function fnSrc(name){let from=0;for(;;){const i=html.indexOf('function '+name+'(',from);if(i<0)throw new Error('нет функции '+name);from=i+1;let d=0,k=html.indexOf('{',i),src=null;for(let p=k;p<html.length;p++){if(html[p]==='{')d++;else if(html[p]==='}'&&--d===0){src=html.slice(i,p+1);break}}try{new vm.Script(src);return src}catch(e){}}}
const block=html.slice(html.indexOf('/*T31-BEGIN*/'),html.indexOf('/*T31-END*/'));
const ctx={console,Date,Map,Set,Number,String,Object,Array,JSON,Math,
  teacherFilterStudent:{value:''},teacherFilterStatus:{value:''},teacherFilterFrom:{value:''},teacherFilterTo:{value:''},teacherDashboardLessonId:null,teacherDashboardRows:[],document:{}};
vm.createContext(ctx);
vm.runInContext(['escapeHtml','normalizeTeacherRow','applyTeacherFilters'].map(fnSrc).join('\n')+"\n"+fnSrc('teacherRowDate')+"\n"+block,ctx);
const R=(o)=>ctx.normalizeTeacherRow(Object.assign({'Имя':'Аня','Дата':'2026-10-20T10:00:00Z','Занятие':'Занятие 7','№ задачи':1,'Название задачи':'Т','Результат':'Решена','Неудачных проверок':0,'Решение':'x'},o));
let bad=0,n=0;const ok=(name,c,info)=>{n++;if(!c)bad++;console.log((c?'OK   ':'FAIL ')+name+(c?'':' | '+info))};
const L=r=>ctx.teacherLatestAttempts(r);
// 1. перемешанный порядок строк
let rows=[R({'Дата':'2026-10-22T10:00:00Z','Результат':'Решена','Неудачных проверок':2}),R({'Дата':'2026-10-20T10:00:00Z','Результат':'Не решена','Неудачных проверок':9}),R({'Дата':'2026-10-21T10:00:00Z','Результат':'Не решена'})];
let l=L(rows);ok('1. последняя попытка при перемешанном порядке',l.length===1&&l[0].result==='Решена'&&l[0].failed===2&&l[0].attempts===3,JSON.stringify(l));
l=L(rows.slice().reverse());ok('1б. то же при обратном порядке',l[0].result==='Решена',JSON.stringify(l));
// 1в. равное время — стабильно по порядку строк
l=L([R({'Результат':'A'}),R({'Результат':'B'})]);ok('1в. равное время: берётся более поздняя строка таблицы',l[0].result==='B',l[0].result);
// 2. некорректные метки
l=L([R({'Дата':'вчера','Результат':'Решена'}),R({'Дата':'2026-10-20T10:00:00Z','Результат':'Не решена'})]);ok('2. часть меток некорректна: выбрана достоверная, порядок помечен неточным',l[0].result==='Не решена'&&l[0].orderUncertain===true,JSON.stringify(l[0]));
l=L([R({'Дата':'??','Результат':'Решена'}),R({'Дата':'','Результат':'Не решена'})]);let m=ctx.teacherMetrics(l);ok('2б. все метки некорректны: «последняя» не выдумывается',l[0].orderUnknown===true&&m.unknown===1&&m.confirmed===0,JSON.stringify(m));
// 1г. время проверки важнее даты отправки (повторная отправка позже не делает старую попытку новой)
l=L([R({'Время проверки':'2026-10-20T10:00:00Z','Дата':'2026-10-25T10:00:00Z','Результат':'Старая'}),R({'Время проверки':'2026-10-22T10:00:00Z','Дата':'2026-10-21T10:00:00Z','Результат':'Новая'})]);ok('1г. приоритет «Времени проверки» над «Датой» записи',l[0].result==='Новая',JSON.stringify(l[0]));
ok('1д. «Категория ошибки» и «Время проверки» читаются из таблицы',R({'Категория ошибки':'logic','Время проверки':'2026-10-20T10:00:00Z'}).errorCategory==='logic'&&R({'Время проверки':'2026-10-20T10:00:00Z'}).checkedAt==='2026-10-20T10:00:00Z');
// 3–4. метрики
rows=[R({'№ задачи':1}),R({'№ задачи':1,'Дата':'2026-10-21T10:00:00Z'}),R({'№ задачи':1,'Дата':'2026-10-22T10:00:00Z'}),R({'№ задачи':2,'Результат':'Не решена'})];
m=ctx.teacherMetrics(L(rows));ok('4. несколько попыток не увеличивают число заданий',m.tasksWithActivity===2&&m.confirmed===1&&m.knownFailed===1,JSON.stringify(m));
ok('3. в метриках нет процента от неизвестного числа назначенных',!('percent' in m)&&!/percent/.test(JSON.stringify(m)));
ok('3б. в журнале не осталось расчёта процента от учеников×задач',!/solved\.size\/lessonTasks\.length|totalSolved\/\(students\.length\*lessonTasks\.length\)|solved\/possible/.test(html));
// 5–7. CSV
const many=[];for(let i=0;i<500;i++)many.push(R({'Имя':i%2?'Аня':'Боря','Занятие':'Занятие '+(1+i%7),'Дата':new Date(Date.UTC(2026,9,1+i%25)).toISOString(),'Результат':i%5?'Решена':'Не решена','№ задачи':i}));
ctx.teacherDashboardRows=many;ctx.teacherDashboardLessonId=3;ctx.teacherFilterStudent.value='Аня';ctx.teacherFilterStatus.value='success';ctx.teacherFilterFrom.value='2026-10-05';ctx.teacherFilterTo.value='2026-10-15';
const exp=ctx.teacherExportRows(),tab=ctx.applyTeacherFilters(many,3);
ok('5. CSV использует те же фильтры, что и таблица (ученик+занятие+статус+период)',exp.length===tab.length&&exp.length>0&&exp.every(r=>r.name==='Аня'&&r.lesson==='Занятие 3'&&r.result==='Решена'&&Date.parse(r.date)>=Date.parse('2026-10-05')&&Date.parse(r.date)<=Date.parse('2026-10-15T23:59:59')),exp.length+' vs '+tab.length);
const expected=many.filter(r=>r.name==='Аня'&&r.lesson==='Занятие 3'&&r.result==='Решена'&&Date.parse(r.date)>=Date.parse('2026-10-05')&&Date.parse(r.date)<=Date.parse('2026-10-15T23:59:59'));
ok('6. выгружены все подходящие записи из 500 (данные загружаются одним запросом, страниц нет)',exp.length===expected.length,exp.length+' vs '+expected.length);
ctx.teacherFilterStudent.value='';ctx.teacherFilterStatus.value='';ctx.teacherFilterFrom.value='';ctx.teacherFilterTo.value='';ctx.teacherDashboardLessonId=null;
ok('5б. без фильтров и без занятия выгружается всё',ctx.teacherExportRows().length===500);
const csv=ctx.teacherCsv([R({'Имя':'Иван, "Петров"','Решение':'print("привет, мир")\nx=1','Название задачи':'=1+1','Результат':'@cmd','Дата':'','Неудачных проверок':0}),R({'Решение':'\t=HYPERLINK("x")'})]);
ok('7. кириллица, запятые, кавычки, переводы строк',csv.startsWith('\uFEFF"Имя";')&&csv.includes('"Иван, ""Петров"""')&&csv.includes('"print(""привет, мир"")\nx=1"'),csv.slice(0,300));
ok('7б. защита от формул (= + - @ табуляция) и пустые значения',csv.includes('"\'=1+1"')&&csv.includes('"\'@cmd"')&&csv.includes('"\'\t=HYPERLINK(""x"")"')&&csv.includes(';"";'),csv);
// 9–11. отчёты
rows=[R({'Имя':'Аня','№ задачи':1,'Неудачных проверок':6}),R({'Имя':'Боря','№ задачи':1}),R({'Имя':'Боря','Занятие':'Занятие 6','№ задачи':3})];
let g=ctx.teacherReportHtml('group',rows,{student:'',statusText:'все',from:'',to:''});
ok('9. отчёт по группе: свой заголовок, ученики, задания, внимание, ограничения',/Отчёт по группе/.test(g)&&/Ученики<\/h2>/.test(g)&&/Задания<\/h2>/.test(g)&&/требующие внимания/.test(g)&&/Аня — Занятие 7, задача 1: неудачных проверок до принятия: 6/.test(g)&&/Ограничения данных/.test(g)&&/Занятие 6/.test(g)&&!/%/.test(g));
ctx.teacherDashboardRows=rows;let s=ctx.teacherReportHtml('student',ctx.teacherStudentRows('Боря',{from:'',to:''}),{student:'Боря',statusText:'все',from:'',to:''});
ok('10. индивидуальный отчёт содержит только выбранного ученика',/Индивидуальный отчёт: Боря/.test(s)&&!/Аня/.test(s)&&/История записей/.test(s)&&/Проверка понимания/.test(s)&&/Рекомендации преподавателю/.test(s));
ok('10б. рекомендации не делают вывода о понимании по одной записи',!/не понима/i.test(s)&&/не доказывает усвоение/.test(s));
g=ctx.teacherReportHtml('group',[],{student:'',statusText:'все',from:'',to:''});s=ctx.teacherReportHtml('student',[],{student:'Аня',statusText:'все',from:'',to:''});
ok('11. неполные данные: «нет данных», а не ошибка ученика и не пустой успех',/Нет данных по выбранным фильтрам/.test(g)&&/Нет данных по выбранному ученику/.test(s)&&!/Ошибка/.test(g+s));
ok('11б. XSS: имя ученика в отчёте экранируется',/&lt;img/.test(ctx.teacherReportHtml('group',[R({'Имя':'<img src=x onerror=1>'})],{student:'',statusText:'все',from:'',to:''}))&&!/<img src=x/.test(ctx.teacherReportHtml('group',[R({'Имя':'<img src=x onerror=1>'})],{student:'',statusText:'все',from:'',to:''})));
// 8. печать — только статическая проверка стилей
ok('8. (статически) печатный режим скрывает всё, кроме отчёта, и кнопки',/@media print\{body>\*:not\(#teacherReportView\)\{display:none!important\}/.test(html)&&/\.no-print\{display:none!important\}/.test(html));
console.log('\nПроверок: '+n+', не пройдено: '+bad);process.exit(bad?1:0);
