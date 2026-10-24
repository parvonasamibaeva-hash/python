const QUIZ_SHEET_NAME = 'Лист1';
const TASKS_SHEET_NAME = 'Задачи';
const ACCOUNTS_SHEET_NAME = 'Аккаунты';
const QUIZ_HEADERS = ['Имя','Дата','Результат','Вопрос 1','Вопрос 2','Вопрос 3','Вопрос 4','Вопрос 5','Вопрос 6','Вопрос 7','Вопрос 8','Вопрос 9','Вопрос 10','ID аккаунта','ID отправки'];
const TASK_HEADERS = ['Имя','Дата','Занятие','№ задачи','Название задачи','Результат','Неудачных проверок','Сложность','Решение','ID аккаунта','ID отправки'];
const ACCOUNT_HEADERS = ['ID аккаунта','Имя','Логин','Хеш кода','Активен','Создан','Группа'];
const ACCESS_SHEET_NAME = 'Доступ к занятиям';
const ACCESS_HEADERS = ['Занятие','Группа','Открыто','Обновлено','ID аккаунта'];
const REVIEW_SHEET_NAME = 'Проверка преподавателя';
const REVIEW_HEADERS = ['Дата','ID аккаунта','Имя ученика','Занятие','№ задачи','Название задачи','Вариант А','Вариант Б','Объяснение ученика','Статус проверки','Комментарий преподавателя'];
const SESSION_TTL_SECONDS = 21600; // 6 часов

/** Запусти вручную один раз из редактора Apps Script. Создаст лист аккаунтов и код преподавателя. */
function setupAuth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(ACCOUNTS_SHEET_NAME);
  sheet.getRange(1, 1, 1, ACCOUNT_HEADERS.length).setValues([ACCOUNT_HEADERS]);
  ensureHeaders_(ss.getSheetByName(TASKS_SHEET_NAME), TASK_HEADERS);
  ensureHeaders_(ss.getSheetByName(QUIZ_SHEET_NAME), QUIZ_HEADERS);
  let accessSheet = ss.getSheetByName(ACCESS_SHEET_NAME);
  if (!accessSheet) accessSheet = ss.insertSheet(ACCESS_SHEET_NAME);
  ensureHeaders_(accessSheet, ACCESS_HEADERS);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('HASH_PEPPER')) props.setProperty('HASH_PEPPER', Utilities.getUuid() + Utilities.getUuid());
  let teacherCode = props.getProperty('TEACHER_CODE');
  if (!teacherCode) {
    teacherCode = String(Math.floor(10000000 + Math.random() * 90000000));
    props.setProperty('TEACHER_CODE', teacherCode);
  }
  Logger.log('Начальный код преподавателя: ' + teacherCode);
  Logger.log('Сохрани код в надёжном месте. Его можно изменить из кабинета преподавателя.');
}

/** Меню в таблице позволяет менять код преподавателя после входа. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Python — аккаунты')
    .addItem('Изменить код преподавателя', 'promptChangeTeacherCode_')
    .addToUi();
}
function promptChangeTeacherCode_() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt('Новый код преподавателя', 'Введи новый код длиной не менее 8 символов.', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const code = result.getResponseText().trim();
  if (code.length < 8) { ui.alert('Код должен содержать не менее 8 символов.'); return; }
  PropertiesService.getScriptProperties().setProperty('TEACHER_CODE', code);
  ui.alert('Код преподавателя изменён. Используй его при следующем входе.');
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.action) return json_(handleAction_(data));
    if (data.type === 'task') return json_(saveTask_(data));
    if (data.type === 'manualReview') return json_(saveManualReview_(data));
    if (data.type === 'quiz') return json_(saveQuiz_(data));
    throw new Error('Неизвестная операция.');
  } catch (err) {
    return json_({success:false, error:String(err.message || err)});
  }
}

// Не отдаём все записи через публичный GET: личные результаты выдаются только после проверки сессии.
function doGet() {
  return json_({success:true, service:'Python accounts API', message:'Для работы войди в аккаунт.'});
}

function handleAction_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (data.action === 'loginTeacher') {
    enforceRateLimit_('teacher-login', 10, 900);
    const expected = PropertiesService.getScriptProperties().getProperty('TEACHER_CODE');
    if (!expected) throw new Error('Сначала выполни setupAuth() в Apps Script.');
    if (String(data.code || '') !== expected) { recordFailedAttempt_('teacher-login', 900); throw new Error('Неверный код преподавателя.'); }
    clearFailedAttempts_('teacher-login');
    return {success:true, session:createSession_({role:'teacher', name:'Самибаева Парвона Мансуровна', login:'Преподаватель'})};
  }
  if (data.action === 'loginStudent') {
    const login = String(data.login || '').trim().toLowerCase();
    const rateKey = 'student-login-' + hash_(login).slice(0,24);
    enforceRateLimit_(rateKey, 10, 900);
    const account = findAccountByLogin_(login);
    if (!account || !account.active || account.codeHash !== hash_(String(data.code || ''))) { recordFailedAttempt_(rateKey, 900); throw new Error('Неверный логин или код доступа.'); }
    clearFailedAttempts_(rateKey);
    return {success:true, session:createSession_({role:'student', accountId:account.id, name:account.name, login:account.login, group:account.group || 'individual'})};
  }
  const session = requireSession_(data.token);
  if (data.action === 'whoami') return {success:true, session:Object.assign({token:data.token, expiresIn:SESSION_TTL_SECONDS}, session)};
  if (data.action === 'createStudent') {
    requireRole_(session, 'teacher');
    const name = String(data.name || '').trim().slice(0,60);
    if (!name) throw new Error('Укажи имя ученика.');
    const accountId = Utilities.getUuid();
    const login = uniqueLogin_(name);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
    if (!sheet) throw new Error('Лист «Аккаунты» не найден. Выполни setupAuth().');
    sheet.appendRow([accountId, name, login, hash_(code), true, new Date(), 'individual']);
    migrateLegacyRows_(name, accountId);
    return {success:true, id:accountId, name, login, code};
  }
  if (data.action === 'listStudents') {
    requireRole_(session, 'teacher');
    const sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(String);
    const groupCol = headers.indexOf('Группа');
    const students = rows.slice(1).filter(r => r[0]).map(r => ({id:String(r[0]), name:String(r[1]), login:String(r[2]), active:r[4] === true || String(r[4]).toLowerCase() === 'true', created:r[5] ? String(r[5]) : '', group:groupCol >= 0 ? String(r[groupCol] || 'individual') : 'individual'}));
    return {success:true, students};
  }
  if (data.action === 'setStudentGroup') {
    requireRole_(session, 'teacher');
    const group = String(data.group || 'individual');
    if (!['individual', 'thursday'].includes(group)) throw new Error('Неизвестная группа.');
    const sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
    if (!sheet) throw new Error('Лист «Аккаунты» не найден.');
    ensureHeaders_(sheet, ACCOUNT_HEADERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const groupCol = headers.indexOf('Группа') + 1;
    const rowIndex = values.findIndex((r, i) => i > 0 && String(r[0]) === String(data.studentId));
    if (rowIndex < 1) throw new Error('Ученик не найден.');
    sheet.getRange(rowIndex + 1, groupCol).setValue(group);
    return {success:true, group};
  }
  if (data.action === 'getLessonAccess') {
    const access=readLessonAccess_();
    if(session.role==='student'){
      const account=findAccountById_(session.accountId);
      const group=account?account.group:(session.group||'individual');
      const own={};
      Object.keys(access).forEach(key=>{if(key.startsWith(group+':')||key.startsWith('student:'+session.accountId+':'))own[key]=access[key]});
      return {success:true,accessVersion:2,group,access:own};
    }
    requireRole_(session,'teacher');
    return {success:true,accessVersion:2,access};
  }
  if (data.action === 'setLessonAccess') {
    requireRole_(session,'teacher');
    return setLessonAccess_(data);
  }
  if (data.action === 'resetStudentCode') {
    requireRole_(session, 'teacher');
    const sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const index = rows.findIndex((r,i) => i > 0 && String(r[0]) === String(data.studentId));
    if (index < 1) throw new Error('Ученик не найден.');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    sheet.getRange(index + 1, 4).setValue(hash_(code));
    return {success:true, code};
  }
  if (data.action === 'changeTeacherCode') {
    requireRole_(session, 'teacher');
    const code = String(data.newCode || '').trim();
    if (code.length < 8) throw new Error('Код преподавателя должен содержать не менее 8 символов.');
    PropertiesService.getScriptProperties().setProperty('TEACHER_CODE', code);
    return {success:true};
  }
  if (data.action === 'saveDraft') {
    requireRole_(session, 'student');
    return saveDraft_(data, session);
  }
  if (data.action === 'getDrafts') {
    requireRole_(session, 'student');
    return {success:true, drafts:readDrafts_().filter(r=>r.accountId===session.accountId)};
  }
  if (data.action === 'getStuckStudents') {
    requireRole_(session, 'teacher');
    return {success:true, stuck:getStuckStudents_(data)};
  }
  if (data.action === 'getStudentTasks') {
    requireRole_(session, 'student');
    return {success:true, tasks:readTaskObjects_().filter(r => String(r['ID аккаунта'] || '') === session.accountId)};
  }
  if (data.action === 'getStudentTasksForTeacher') {
    requireRole_(session, 'teacher');
    return {success:true, tasks:readTaskObjects_().filter(r => String(r['ID аккаунта'] || '') === String(data.studentId || ''))};
  }
  if (data.action === 'getTeacherTasks') {
    requireRole_(session, 'teacher');
    return {success:true, tasks:readTaskObjects_()};
  }
  throw new Error('Неизвестная операция аккаунта.');
}

function saveTask_(data) {
  const session = requireSession_(data.token);
  requireRole_(session, 'student');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TASKS_SHEET_NAME);
  if (!sheet) throw new Error('Лист «Задачи» не найден.');
  ensureHeaders_(sheet, TASK_HEADERS);
  const submissionId = String(data.submissionId || '').trim().slice(0, 100);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const headers = sheet.getDataRange().getValues()[0].map(String);
    const idCol = headers.indexOf('ID отправки');
    const accountCol = headers.indexOf('ID аккаунта');
    if (submissionId && idCol >= 0 && accountCol >= 0) {
      const duplicate = sheet.getDataRange().getValues().slice(1).some(row =>
        String(row[idCol] || '') === submissionId && String(row[accountCol] || '') === session.accountId
      );
      if (duplicate) return {success:true, type:'task', duplicate:true};
    }
    // Всегда берём ID и имя из проверенной сессии, а не из клиентского запроса.
    const row = headers.map(header => {
      const values = {
        'Имя': session.name,
        'Дата': data.date || new Date(),
        'Занятие': data.lesson || '',
        '№ задачи': data.taskId || '',
        'Название задачи': data.taskTitle || '',
        'Результат': data.result || 'Решена',
        'Неудачных проверок': Number(data.failedAttempts || 0),
        'Сложность': data.rating || '',
        'Решение': String(data.solution || ''),
        'ID аккаунта': session.accountId,
        'ID отправки': submissionId
      };
      return sheetText_(values[header] === undefined ? '' : values[header]);
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return {success:true, type:'task'};
  } finally {
    lock.releaseLock();
  }
}


function saveManualReview_(data) {
  const session = requireSession_(data.token);
  requireRole_(session, 'student');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REVIEW_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REVIEW_SHEET_NAME);
    sheet.getRange(1, 1, 1, REVIEW_HEADERS.length).setValues([REVIEW_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    ensureHeaders_(sheet, REVIEW_HEADERS);
  }
  const taskTitle = String(data.taskTitle || '').trim();
  if (!taskTitle) throw new Error('Не указано название задачи.');
  const row = [
    data.date || new Date(),
    session.accountId,
    session.name,
    String(data.lesson || ''),
    String(data.taskId || ''),
    taskTitle,
    String(data.variantA || ''),
    String(data.variantB || ''),
    String(data.explanation || ''),
    'Ожидает проверки',
    ''
  ];
  sheet.appendRow(row);
  return {success:true, type:'manualReview', status:'Ожидает проверки'};
}

function readManualReviews_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REVIEW_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '' && v != null)).map((row, index) => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i]);
    obj._row = index + 2;
    return obj;
  });
}

function setManualReviewStatus_(data) {
  const rowNumber = Number(data.row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('Некорректный номер записи.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REVIEW_SHEET_NAME);
  if (!sheet || rowNumber > sheet.getLastRow()) throw new Error('Запись проверки не найдена.');
  const status = String(data.status || '');
  if (!['Принято', 'Нужно исправить'].includes(status)) throw new Error('Неизвестный статус проверки.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const statusCol = headers.indexOf('Статус проверки') + 1;
  const commentCol = headers.indexOf('Комментарий преподавателя') + 1;
  if (!statusCol || !commentCol) throw new Error('В листе проверки отсутствуют нужные столбцы.');
  sheet.getRange(rowNumber, statusCol).setValue(status);
  sheet.getRange(rowNumber, commentCol).setValue(String(data.comment || '').slice(0, 1000));
  return {success:true, status};
}

function saveQuiz_(data) {
  const session = requireSession_(data.token);
  requireRole_(session, 'student');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QUIZ_SHEET_NAME);
    if(!sheet)throw new Error('Лист «Лист1» не найден.');
    const answers=Array.isArray(data.answers)?data.answers:[];
    if(answers.length>100)throw new Error('Слишком много ответов.');
    ensureHeaders_(sheet,QUIZ_HEADERS.concat(Array.from({length:Math.max(0,answers.length-10)},(_,i)=>'Вопрос '+(i+11))));
    const values=sheet.getDataRange().getValues(),headers=values[0].map(String);
    const id=String(data.submissionId||'').slice(0,100);
    const idCol=headers.indexOf('ID отправки'),accountCol=headers.indexOf('ID аккаунта');
    if(id&&values.slice(1).some(r=>String(r[idCol])===id&&String(r[accountCol])===session.accountId))return {success:true,type:'quiz',duplicate:true};
    const record={'Имя':session.name,'Дата':data.date||new Date(),'Результат':data.result||'','ID аккаунта':session.accountId,'ID отправки':id};
    for(let i=0;i<Math.max(10,answers.length);i++)record['Вопрос '+(i+1)]=answers[i]==null?'—':String(answers[i]);
    sheet.appendRow(headers.map(h=>sheetText_(record[h]===undefined?'':record[h])));
    SpreadsheetApp.flush();
    return {success:true,type:'quiz'};
  }finally{lock.releaseLock();}
}

const DRAFT_SHEET_NAME='Черновики';
const DRAFT_HEADERS=['ID аккаунта','Имя','Занятие','№ задачи','Код','Неудачных проверок','Обновлено'];
function sheetText_(value){return typeof value==='string'&&value.startsWith('=')?"'"+value:value;}
function readDrafts_(){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DRAFT_SHEET_NAME);
  if(!sheet||sheet.getLastRow()<2)return [];
  const values=sheet.getDataRange().getValues(),headers=values[0].map(String);
  return values.slice(1).filter(r=>r[headers.indexOf('ID аккаунта')]).map(r=>{
    const get=h=>r[headers.indexOf(h)];
    const time=new Date(get('Обновлено'));
    return {accountId:String(get('ID аккаунта')),name:String(get('Имя')),lesson:String(get('Занятие')),taskId:String(get('№ задачи')),code:String(get('Код')||''),failed:Number(get('Неудачных проверок'))||0,updated:Number.isFinite(time.getTime())?time.toISOString():null};
  });
}
function saveDraft_(data,session){
  const lesson=String(data.lesson||''),taskId=Number(data.taskId),code=String(data.code||'');
  if(!/^Занятие [1-7]$/.test(lesson)||!Number.isInteger(taskId)||taskId<1)throw new Error('Некорректная задача.');
  if(code.length>45000)throw new Error('Черновик слишком большой.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const sheet=ss.getSheetByName(DRAFT_SHEET_NAME)||ss.insertSheet(DRAFT_SHEET_NAME);
    ensureHeaders_(sheet,DRAFT_HEADERS);
    const values=sheet.getDataRange().getValues(),headers=values[0].map(String);
    const idx=values.findIndex((r,i)=>i>0&&String(r[headers.indexOf('ID аккаунта')])===session.accountId&&String(r[headers.indexOf('Занятие')])===lesson&&String(r[headers.indexOf('№ задачи')])===String(taskId));
    const old=idx>0?values[idx]:[];
    const failed=Math.max(0,Number(old[headers.indexOf('Неудачных проверок')])||0,Math.floor(Number(data.failed)||0));
    const record={'ID аккаунта':session.accountId,'Имя':session.name,'Занятие':lesson,'№ задачи':String(taskId),'Код':code,'Неудачных проверок':failed,'Обновлено':new Date()};
    const row=headers.map((h,i)=>sheetText_(Object.prototype.hasOwnProperty.call(record,h)?record[h]:(old[i]||'')));
    if(idx>0)sheet.getRange(idx+1,1,1,row.length).setValues([row]);else sheet.appendRow(row);
    SpreadsheetApp.flush();
    return {success:true};
  }finally{lock.releaseLock();}
}
function getStuckStudents_(data){
  const minFailed=Math.max(1,Number(data.minFailed)||5),minDays=Math.max(1,Number(data.idleDays)||3);
  const taskKey=(account,lesson,id)=>JSON.stringify([String(account),String(lesson),String(id)]);
  const solved=new Set(readTaskObjects_().filter(r=>String(r['Результат']).toLowerCase()==='решена').map(r=>taskKey(r['ID аккаунта'],r['Занятие'],r['№ задачи'])));
  return readDrafts_().filter(r=>r.code.trim()&&!solved.has(taskKey(r.accountId,r.lesson,r.taskId))).map(r=>({...r,idleDays:r.updated?Math.max(0,Math.floor((Date.now()-new Date(r.updated).getTime())/86400000)):0})).filter(r=>r.failed>=minFailed||r.idleDays>=minDays).map(({code,...r})=>r);
}

function createSession_(identity) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(identity), SESSION_TTL_SECONDS);
  return Object.assign({token, expiresIn:SESSION_TTL_SECONDS}, identity);
}
function requireSession_(token) {
  if (!token) throw new Error('Сеанс не найден. Выйди и войди снова.');
  const raw = CacheService.getScriptCache().get('session:' + token);
  if (!raw) throw new Error('Сеанс истёк. Войди снова.');
  return JSON.parse(raw);
}
function requireRole_(session, role) { if (session.role !== role) throw new Error('Недостаточно прав для этой операции.'); }
function findAccountById_(accountId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNTS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(String); const groupCol = headers.indexOf('Группа');
  for (let i=1;i<rows.length;i++) if (String(rows[i][0]) === String(accountId)) return {id:String(rows[i][0]),name:String(rows[i][1]),login:String(rows[i][2]),group:groupCol >= 0 ? String(rows[i][groupCol] || 'individual') : 'individual'};
  return null;
}
function readLessonAccess_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sheet=ss.getSheetByName(ACCESS_SHEET_NAME);
  if(!sheet||sheet.getLastRow()<2)return {};
  const values=sheet.getDataRange().getValues(),headers=values[0].map(String);
  const access={};
  values.slice(1).forEach(row=>{
    const id=Number(row[headers.indexOf('Занятие')]),group=String(row[headers.indexOf('Группа')]||'');
    const account=String(row[headers.indexOf('ID аккаунта')]||'');
    const open=row[headers.indexOf('Открыто')];
    if(!id||open===''||open==null)return;
    access[account?'student:'+account+':'+id:group+':'+id]=open===true||String(open).toLowerCase()==='true';
  });
  return access;
}
function setLessonAccess_(data){
  const lessonId=Number(data.lessonId),studentId=String(data.studentId||'');
  if(!Number.isInteger(lessonId)||lessonId<1||lessonId>7)throw new Error('Некорректный номер занятия.');
  if(data.open!==true&&data.open!==false&&data.open!==null)throw new Error('Некорректное состояние доступа.');
  const account=studentId?findAccountById_(studentId):null;
  if(studentId&&!account)throw new Error('Ученик не найден.');
  const group=account?account.group:String(data.group||'thursday');
  if(!['individual','thursday'].includes(group))throw new Error('Неизвестная группа.');
  if(!studentId&&data.open===null)throw new Error('Укажи, открыть или закрыть занятие.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName(ACCESS_SHEET_NAME)||ss.insertSheet(ACCESS_SHEET_NAME);
    ensureHeaders_(sheet,ACCESS_HEADERS);
    const values=sheet.getDataRange().getValues(),headers=values[0].map(String);
    const li=headers.indexOf('Занятие'),gi=headers.indexOf('Группа'),ai=headers.indexOf('ID аккаунта'),oi=headers.indexOf('Открыто'),ui=headers.indexOf('Обновлено');
    // Bulk assignment resets personal exceptions only for this lesson and current group members.
    if(!studentId&&data.applyToAll===true){
      const accounts=ss.getSheetByName(ACCOUNTS_SHEET_NAME).getDataRange().getValues();
      const ag=accounts[0].map(String).indexOf('Группа');
      const members=new Set(accounts.slice(1).filter(r=>String(r[ag]||'individual')===group).map(r=>String(r[0])));
      values.forEach((r,i)=>{if(i>0&&Number(r[li])===lessonId&&members.has(String(r[ai]))){sheet.getRange(i+1,oi+1).setValue('');sheet.getRange(i+1,ui+1).setValue(new Date());}});
    }
    let idx=values.findIndex((r,i)=>i>0&&Number(r[li])===lessonId&&(studentId?String(r[ai]||'')===studentId:!r[ai]&&String(r[gi])===group));
    const row=idx>0?values[idx].slice():Array(headers.length).fill('');
    row[li]=lessonId;row[gi]=group;row[ai]=studentId;row[oi]=data.open===null?'':data.open;row[ui]=new Date();
    if(idx>0)sheet.getRange(idx+1,1,1,headers.length).setValues([row]);else sheet.appendRow(row);
    SpreadsheetApp.flush();
    return {success:true,accessVersion:2,access:readLessonAccess_()};
  }finally{lock.releaseLock();}
}
function findAccountByLogin_(login) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNTS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) if (String(rows[i][2]).toLowerCase() === login.toLowerCase()) { const headers = rows[0].map(String); const groupCol = headers.indexOf('Группа'); return {id:String(rows[i][0]),name:String(rows[i][1]),login:String(rows[i][2]),codeHash:String(rows[i][3]),active:rows[i][4] === true || String(rows[i][4]).toLowerCase() === 'true',group:groupCol >= 0 ? String(rows[i][groupCol] || 'individual') : 'individual'}; }
  return null;
}
function uniqueLogin_(name) {
  const base = transliterate_(name).toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,16) || 'student';
  let login;
  do { login = base + String(Math.floor(1000 + Math.random() * 9000)); } while (findAccountByLogin_(login));
  return login;
}
function transliterate_(text) {
  const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
  return String(text).toLowerCase().split('').map(c=>map[c] === undefined ? c : map[c]).join('');
}
function hash_(value) {
  const pepper = PropertiesService.getScriptProperties().getProperty('HASH_PEPPER') || 'missing-pepper';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pepper + '|' + String(value), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function ensureHeaders_(sheet, headers) {
  if (!sheet) throw new Error('Не найден лист для сохранения данных.');
  const width = Math.max(sheet.getLastColumn(), headers.length);
  const current = sheet.getRange(1,1,1,width).getValues()[0];
  const merged = current.slice();
  headers.forEach(h => { if (!merged.includes(h)) { const empty = merged.findIndex(v => !v); if (empty >= 0) merged[empty] = h; else merged.push(h); } });
  sheet.getRange(1,1,1,merged.length).setValues([merged]);
}
function migrateLegacyRows_(name, accountId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TASKS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  ensureHeaders_(sheet, TASK_HEADERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; const nameCol = headers.indexOf('Имя'); const accountCol = headers.indexOf('ID аккаунта');
  if (nameCol < 0 || accountCol < 0) return;
  for (let i=1;i<data.length;i++) if (String(data[i][nameCol]).trim().toLowerCase() === name.toLowerCase() && !String(data[i][accountCol] || '').trim()) sheet.getRange(i+1,accountCol+1).setValue(accountId);
}
function readTaskObjects_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TASKS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 1) return [];
  ensureHeaders_(sheet, TASK_HEADERS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '' && v != null)).map(row => {
    const obj = {}; headers.forEach((h,i) => obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i]); return obj;
  });
}
function enforceRateLimit_(key, limit, ttl) {
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get('attempts:' + key) || 0);
  if (attempts >= limit) throw new Error('Слишком много попыток входа. Подожди 15 минут и попробуй снова.');
}
function recordFailedAttempt_(key, ttl) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'attempts:' + key;
  cache.put(cacheKey, String(Number(cache.get(cacheKey) || 0) + 1), ttl);
}
function clearFailedAttempts_(key) { CacheService.getScriptCache().remove('attempts:' + key); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }