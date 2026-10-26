const QUIZ_SHEET_NAME = 'Лист1';
const TASKS_SHEET_NAME = 'Задачи';
const ACCOUNTS_SHEET_NAME = 'Аккаунты';
const QUIZ_HEADERS = ['Имя','Дата','Результат','Вопрос 1','Вопрос 2','Вопрос 3','Вопрос 4','Вопрос 5','Вопрос 6','Вопрос 7','Вопрос 8','Вопрос 9','Вопрос 10','ID аккаунта','ID отправки'];
const TASK_HEADERS = ['Имя','Дата','Занятие','№ задачи','Название задачи','Результат','Неудачных проверок','Сложность','Решение','ID аккаунта','ID отправки','ID попытки','Пройдено тестов','Всего тестов','Категория ошибки','Версия проверки','Время проверки'];
const ACCOUNT_HEADERS = ['ID аккаунта','Имя','Логин','Хеш кода','Активен','Создан','Группа'];
const ACCESS_SHEET_NAME = 'Доступ к занятиям';
const ACCESS_HEADERS = ['Занятие','Группа','Открыто','Обновлено','ID аккаунта'];
const REVIEW_SHEET_NAME = 'Проверка преподавателя';
const REVIEW_HEADERS = ['Дата','ID аккаунта','Имя ученика','Занятие','№ задачи','Название задачи','Вариант А','Вариант Б','Объяснение ученика','Статус проверки','Комментарий преподавателя','ID проверки','Код решения','ID попытки','Категория ошибки','Версия проверки'];
const SESSION_TTL_SECONDS = 21600; // 6 часов
const COURSE_MAX_LESSON_NUMBER = 36;
// Однократная совместимая миграция: эти уже существовавшие занятия сохраняют прежний доступ.
// Новые занятия не входят в список и по умолчанию закрыты до решения преподавателя.
const LEGACY_PUBLISHED_LESSON_IDS = [1,2,3,4,5,6,7,8];

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
  ensureLegacyLessonAccess_();
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
    ensureLegacyLessonAccess_();
    const access=readLessonAccess_();
    if(session.role==='student'){
      const account=findAccountById_(session.accountId);
      const group=account?account.group:(session.group||'individual');
      const own={};
      Object.keys(access).forEach(key=>{if(key.startsWith(group+':')||key.startsWith('student:'+session.accountId+':'))own[key]=access[key]});
      return {success:true,accessVersion:2,maxLessonNumber:COURSE_MAX_LESSON_NUMBER,group,access:own};
    }
    requireRole_(session,'teacher');
    return {success:true,accessVersion:2,maxLessonNumber:COURSE_MAX_LESSON_NUMBER,access};
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
  if (data.action === 'getManualReviews') {
    requireRole_(session, 'teacher');
    return {success:true, reviews:readManualReviews_()};
  }
  if (data.action === 'getStudentManualReviews') {
    requireRole_(session, 'student');
    const reviews=readManualReviews_().filter(r=>String(r['ID аккаунта']||'')===session.accountId);
    return {success:true, reviews:reviews.map(r=>({reviewId:r.reviewId, lesson:String(r['Занятие']||''), taskId:String(r['№ задачи']||''), title:String(r['Название задачи']||''), status:String(r['Статус проверки']||''), comment:String(r['Комментарий преподавателя']||''), date:r['Дата']||''}))};
  }
  if (data.action === 'setManualReviewStatus') {
    requireRole_(session, 'teacher');
    return setManualReviewStatus_(data, session);
  }
  if (data.action === 'savePassportBatch') {
    requireRole_(session, 'student');
    return savePassportBatch_(data, session);
  }
  if (data.action === 'getPassport') {
    return getPassport_(data, session);
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
  const lessonId=parseLessonNumber_(data.lesson),taskId=Number(data.taskId);
  if(!lessonId||!Number.isInteger(taskId)||taskId<1)throw new Error('Некорректная задача.');
  assertStudentLessonAccess_(session,lessonId);
  if(String(data.result||'Решена')!=='Решена')throw new Error('На сервер можно сохранить только подтверждённый успешный результат.');
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
    // Последовательность проверяется по серверным записям, а не по параметрам интерфейса.
    assertPreviousTaskCompleted_(session,lessonId,taskId);
    // Всегда берём ID и имя из проверенной сессии, а не из клиентского запроса.
    const row = headers.map(header => {
      const values = {
        'Имя': session.name,
        'Дата': data.date || new Date(),
        'Занятие': 'Занятие '+lessonId,
        '№ задачи': taskId,
        'Название задачи': data.taskTitle || '',
        'Результат': 'Решена',
        'Неудачных проверок': Number(data.failedAttempts || 0),
        'Сложность': data.rating || '',
        'Решение': String(data.solution || ''),
        'ID аккаунта': session.accountId,
        'ID отправки': submissionId,
        'ID попытки': String(data.attemptId || '').slice(0, 100),
        'Пройдено тестов': Math.max(0, Number(data.passedTests || 0)),
        'Всего тестов': Math.max(0, Number(data.totalTests || 0)),
        'Категория ошибки': String(data.errorCategory || '').slice(0, 100),
        'Версия проверки': String(data.checkerVersion || '').slice(0, 100),
        'Время проверки': data.checkedAt || ''
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
  const lessonId=parseLessonNumber_(data.lesson),taskId=Number(data.taskId);
  if(!lessonId||!Number.isInteger(taskId)||taskId<1)throw new Error('Некорректная задача для ручной проверки.');
  assertStudentLessonAccess_(session,lessonId);
  assertPreviousTaskCompleted_(session,lessonId,taskId);
  const taskTitle = String(data.taskTitle || '').trim().slice(0,200);
  const code = String(data.code || '').slice(0,45000);
  const attemptId=String(data.attemptId||'').slice(0,100);
  if (!taskTitle) throw new Error('Не указано название задачи.');
  if (!code.trim()) throw new Error('Нельзя отправить на ручную проверку пустой код.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(REVIEW_SHEET_NAME);
    if (!sheet) { sheet = ss.insertSheet(REVIEW_SHEET_NAME); sheet.getRange(1, 1, 1, REVIEW_HEADERS.length).setValues([REVIEW_HEADERS]); sheet.setFrozenRows(1); }
    else ensureHeaders_(sheet, REVIEW_HEADERS);
    const values=sheet.getDataRange().getValues(),headers=values[0].map(String);
    const accountCol=headers.indexOf('ID аккаунта'),attemptCol=headers.indexOf('ID попытки');
    if(attemptId&&accountCol>=0&&attemptCol>=0){
      const duplicate=values.slice(1).find(row=>String(row[accountCol]||'')===session.accountId&&String(row[attemptCol]||'')===attemptId);
      if(duplicate){const idCol=headers.indexOf('ID проверки'),statusCol=headers.indexOf('Статус проверки');return {success:true,type:'manualReview',duplicate:true,reviewId:String(duplicate[idCol]||''),status:String(duplicate[statusCol]||'Ожидает проверки')};}
    }
    const reviewId=Utilities.getUuid();
    const record={'Дата':data.date||new Date(),'ID аккаунта':session.accountId,'Имя ученика':session.name,'Занятие':'Занятие '+lessonId,'№ задачи':taskId,'Название задачи':taskTitle,'Вариант А':String(data.variantA||''),'Вариант Б':String(data.variantB||''),'Объяснение ученика':String(data.explanation||''),'Статус проверки':'Ожидает проверки','Комментарий преподавателя':'','ID проверки':reviewId,'Код решения':code,'ID попытки':attemptId,'Категория ошибки':String(data.errorCategory||'manual_review').slice(0,100),'Версия проверки':String(data.checkerVersion||'').slice(0,100)};
    sheet.appendRow(headers.map(h=>sheetText_(Object.prototype.hasOwnProperty.call(record,h)?record[h]:'')));
    SpreadsheetApp.flush();
    return {success:true,type:'manualReview',status:'Ожидает проверки',reviewId};
  } finally { lock.releaseLock(); }
}

function readManualReviews_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REVIEW_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  ensureHeaders_(sheet, REVIEW_HEADERS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '' && v != null)).map((row, index) => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i]);
    obj._row = index + 2;
    obj.reviewId=String(obj['ID проверки']||('legacy-row-'+obj._row));
    return obj;
  });
}

function setManualReviewStatus_(data, session) {
  requireRole_(session,'teacher');
  const reviewId=String(data.reviewId||'');
  let rowNumber=Number(data.row);
  if(reviewId.startsWith('legacy-row-'))rowNumber=Number(reviewId.slice('legacy-row-'.length));
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(REVIEW_SHEET_NAME);
    if (!sheet) throw new Error('Лист проверки не найден.');
    ensureHeaders_(sheet, REVIEW_HEADERS);
    const values=sheet.getDataRange().getValues(),headers=values[0].map(String);
    const idCol=headers.indexOf('ID проверки'),statusCol=headers.indexOf('Статус проверки'),commentCol=headers.indexOf('Комментарий преподавателя');
    if(idCol<0||statusCol<0||commentCol<0)throw new Error('В листе проверки отсутствуют нужные столбцы.');
    if(reviewId&&!reviewId.startsWith('legacy-row-')){
      const found=values.findIndex((row,i)=>i>0&&String(row[idCol]||'')===reviewId);
      if(found>=1)rowNumber=found+1;
    }
    if(!Number.isInteger(rowNumber)||rowNumber<2||rowNumber>sheet.getLastRow())throw new Error('Запись проверки не найдена. Обнови очередь и попробуй снова.');
    const row=sheet.getRange(rowNumber,1,1,sheet.getLastColumn()).getValues()[0];
    const previousStatus=String(row[statusCol]||'Ожидает проверки');
    const status = String(data.status || '');
    const comment=String(data.comment||'').slice(0,1000);
    if (!['Принято', 'Нужно исправить'].includes(status)) throw new Error('Неизвестный статус проверки.');
    if(status==='Нужно исправить'&&!comment.trim())throw new Error('Добавь комментарий с тем, что ученику нужно исправить.');
    if(!String(row[idCol]||''))sheet.getRange(rowNumber,idCol+1).setValue(reviewId||('legacy-row-'+rowNumber));
    sheet.getRange(rowNumber,statusCol+1).setValue(status);
    sheet.getRange(rowNumber,commentCol+1).setValue(comment);
    try {
      if(status==='Принято')recordManualReviewCompletion_(row,headers,reviewId||String(row[idCol]||('legacy-row-'+rowNumber)));
      SpreadsheetApp.flush();
    } catch(error) {
      sheet.getRange(rowNumber,statusCol+1).setValue(previousStatus==='Принято'?'Ожидает проверки':previousStatus);
      sheet.getRange(rowNumber,commentCol+1).setValue(String(row[commentCol]||''));
      SpreadsheetApp.flush();
      throw error;
    }
    return {success:true,status,reviewId:reviewId||String(row[idCol]||('legacy-row-'+rowNumber))};
  } finally { lock.releaseLock(); }
}

function recordManualReviewCompletion_(reviewRow, reviewHeaders, reviewId) {
  const get=(name)=>reviewRow[reviewHeaders.indexOf(name)];
  const accountId=String(get('ID аккаунта')||''),name=String(get('Имя ученика')||''),lesson=String(get('Занятие')||''),taskId=Number(get('№ задачи'));
  const lessonId=parseLessonNumber_(lesson);
  if(!accountId||!lessonId||!Number.isInteger(taskId)||taskId<1)throw new Error('В записи ручной проверки отсутствуют данные ученика или задачи.');
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName(TASKS_SHEET_NAME);
  if(!sheet)throw new Error('Лист «Задачи» не найден.');
  ensureHeaders_(sheet,TASK_HEADERS);
  const values=sheet.getDataRange().getValues(),headers=values[0].map(String),idCol=headers.indexOf('ID отправки'),accountCol=headers.indexOf('ID аккаунта');
  const submissionId=('manual-review:'+reviewId).slice(0,100);
  if(values.slice(1).some(row=>String(row[idCol]||'')===submissionId&&String(row[accountCol]||'')===accountId))return;
  const record={'Имя':name,'Дата':new Date(),'Занятие':'Занятие '+lessonId,'№ задачи':taskId,'Название задачи':String(get('Название задачи')||''),'Результат':'Решена','Неудачных проверок':0,'Сложность':'','Решение':String(get('Код решения')||get('Объяснение ученика')||''),'ID аккаунта':accountId,'ID отправки':submissionId,'ID попытки':String(get('ID попытки')||''),'Пройдено тестов':0,'Всего тестов':0,'Категория ошибки':'manual_review_accepted','Версия проверки':'manual-review-v1','Время проверки':new Date()};
  sheet.appendRow(headers.map(h=>sheetText_(Object.prototype.hasOwnProperty.call(record,h)?record[h]:'')));
  SpreadsheetApp.flush();
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
  const lesson=String(data.lesson||''),lessonId=parseLessonNumber_(lesson),taskId=Number(data.taskId),code=String(data.code||'');
  if(!lessonId||!Number.isInteger(taskId)||taskId<1)throw new Error('Некорректная задача.');
  assertStudentLessonAccess_(session,lessonId);
  assertPreviousTaskCompleted_(session,lessonId,taskId);
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
function parseLessonNumber_(value) {
  const match=String(value||'').trim().match(/^Занятие\s+(\d+)$/);
  if(!match)return null;
  const id=Number(match[1]);
  return Number.isInteger(id)&&id>=1&&id<=COURSE_MAX_LESSON_NUMBER?id:null;
}

function ensureLegacyLessonAccess_() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('LEGACY_LESSON_ACCESS_MIGRATED_V1')==='true')return;
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=ss.getSheetByName(ACCESS_SHEET_NAME);
  if(!sheet)sheet=ss.insertSheet(ACCESS_SHEET_NAME);
  ensureHeaders_(sheet,ACCESS_HEADERS);
  let values=sheet.getDataRange().getValues(),headers=values[0].map(String);
  const li=headers.indexOf('Занятие'),gi=headers.indexOf('Группа'),ai=headers.indexOf('ID аккаунта'),oi=headers.indexOf('Открыто'),ui=headers.indexOf('Обновлено');
  ['individual','thursday'].forEach(group=>LEGACY_PUBLISHED_LESSON_IDS.forEach(lessonId=>{
    values=sheet.getDataRange().getValues();
    const index=values.findIndex((row,i)=>i>0&&Number(row[li])===lessonId&&!String(row[ai]||'').trim()&&String(row[gi]||'')===group);
    if(index<1){const record={'Занятие':lessonId,'Группа':group,'Открыто':true,'Обновлено':new Date(),'ID аккаунта':''};sheet.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:''));}
    else if(values[index][oi]===''||values[index][oi]==null){sheet.getRange(index+1,oi+1).setValue(true);sheet.getRange(index+1,ui+1).setValue(new Date());}
  }));
  SpreadsheetApp.flush();
  props.setProperty('LEGACY_LESSON_ACCESS_MIGRATED_V1','true');
}

function assertStudentLessonAccess_(session,lessonId) {
  if(!session||session.role!=='student')throw new Error('Недостаточно прав для доступа к занятию.');
  if(!Number.isInteger(lessonId)||lessonId<1||lessonId>COURSE_MAX_LESSON_NUMBER)throw new Error('Некорректный номер занятия.');
  ensureLegacyLessonAccess_();
  const account=findAccountById_(session.accountId),group=account?account.group:(session.group||'individual');
  const access=readLessonAccess_(),personal='student:'+session.accountId+':'+lessonId,common=group+':'+lessonId;
  const open=Object.prototype.hasOwnProperty.call(access,personal)?access[personal]:Object.prototype.hasOwnProperty.call(access,common)?access[common]:false;
  if(!open)throw new Error('Преподаватель пока не открыл это занятие.');
}

// Последовательный маршрут занятия 8.
// Исторические записи задачи 5-13 сохраняются в таблице, но не подменяют новые задачи занятия 8.
function taskPrerequisiteGroups_(lessonId,taskId) {
  const lesson=Number(lessonId),task=Number(taskId);
  // Занятие 8 теперь состоит из девяти последовательных задач из утверждённого документа.
  // Первая задача доступна сразу, каждая следующая — после предыдущей.
  if(lesson===8&&task>=1&&task<=9)return task===1?[[]]:[[{lessonId:8,taskId:task-1}]];
  if(task<=1)return [[]];
  return [[{lessonId:lesson,taskId:task-1}]];
}
function assertPreviousTaskCompleted_(session,lessonId,taskId) {
  const groups=taskPrerequisiteGroups_(lessonId,taskId);
  if(!groups.length)return;
  const accountId=String(session.accountId||'');
  const rows=readTaskObjects_().filter(row=>String(row['ID аккаунта']||'')===accountId&&String(row['Результат']||'').trim().toLowerCase()==='решена');
  const completed=new Set(rows.map(row=>String(row['Занятие']||'')+'::'+Number(row['№ задачи'])));
  const allowed=groups.some(group=>group.every(required=>completed.has('Занятие '+required.lessonId+'::'+required.taskId)));
  if(!allowed){
    throw new Error('Сначала выполни предыдущую задачу и дождись подтверждения сохранения результата.');
  }
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
  ensureLegacyLessonAccess_();
  const lessonId=Number(data.lessonId),studentId=String(data.studentId||'');
  if(!Number.isInteger(lessonId)||lessonId<1||lessonId>COURSE_MAX_LESSON_NUMBER)throw new Error('Некорректный номер занятия.');
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

// ===== История решений («Паспорт решения») =====
const PASSPORT_SHEET_NAME = 'История решений';
const PASSPORT_HEADERS = ['ID события','ID аккаунта','Имя','Занятие','№ задачи','Тип события','Время события','Принято сервером','Код','ID попытки','Причина','Результат проверки'];
const PASSPORT_BATCH_MAX = 25;
const PASSPORT_CODE_MAX = 45000;
function passportText_(value) { const s = String(value == null ? '' : value); return /^[=+\-@]/.test(s) ? "'" + s : s; }

// Ученик отправляет пакет событий. ID аккаунта и имя берутся из сессии, а не из запроса.
// Повторная отправка того же события безопасна: оно подтверждается, но не дублируется.
function savePassportBatch_(data, session) {
  const events = Array.isArray(data.events) ? data.events : null;
  if (!events) throw new Error('Не переданы события.');
  if (events.length > PASSPORT_BATCH_MAX) throw new Error('Слишком много событий в одном пакете.');
  const accepted = [], rejected = [], rows = [], now = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(PASSPORT_SHEET_NAME) || ss.insertSheet(PASSPORT_SHEET_NAME);
    ensureHeaders_(sheet, PASSPORT_HEADERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String), idCol = headers.indexOf('ID события'), accCol = headers.indexOf('ID аккаунта');
    const known = new Set();
    values.slice(1).forEach(r => { if (String(r[accCol]) === session.accountId) known.add(String(r[idCol])); });
    events.forEach(e => {
      const id = String(e && e.id || '');
      if (!/^[A-Za-z0-9_.:\-]{4,100}$/.test(id)) { rejected.push({id, reason:'bad_id'}); return; }
      if (known.has(id)) { accepted.push(id); return; }
      const m = /^(\d{1,2})-(\d{1,3})$/.exec(String(e.taskId || '')), type = String(e.type || ''), code = String(e.code || ''), time = new Date(e.time);
      if (!m || !/^[A-Za-z0-9_\-]{1,40}$/.test(type) || code.length > PASSPORT_CODE_MAX || !Number.isFinite(time.getTime())) { rejected.push({id, reason:'invalid'}); return; }
      const eventLessonId=Number(m[1]),eventTaskId=Number(m[2]);
      try { if(eventLessonId>COURSE_MAX_LESSON_NUMBER)throw new Error('invalid_lesson'); assertStudentLessonAccess_(session,eventLessonId); assertPreviousTaskCompleted_(session,eventLessonId,eventTaskId); }
      catch (_) { rejected.push({id, reason:'lesson_or_task_locked'}); return; }
      known.add(id); accepted.push(id);
      const rec = {'ID события':id, 'ID аккаунта':session.accountId, 'Имя':session.name, 'Занятие':'Занятие ' + Number(m[1]), '№ задачи':Number(m[2]), 'Тип события':type, 'Время события':time, 'Принято сервером':now,
        'Код':passportText_(code), 'ID попытки':passportText_(String(e.attemptId || '').slice(0, 100)), 'Причина':passportText_(String(e.reason || '').slice(0, 200)), 'Результат проверки':passportText_(String(e.verification || '').slice(0, 2000))};
      rows.push(headers.map(h => Object.prototype.hasOwnProperty.call(rec, h) ? rec[h] : ''));
    });
    if (rows.length) { sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows); SpreadsheetApp.flush(); }
  } finally { lock.releaseLock(); }
  return {success:true, accepted, rejected};
}

// Учитель получает историю выбранного ученика. Ученик получает только свою: переданный studentId игнорируется.
function getPassport_(data, session) {
  if(!session||!['teacher','student'].includes(session.role))throw new Error('Недостаточно прав для просмотра истории решений.');
  const studentId = session.role === 'teacher' ? String(data.studentId || '') : String(session.accountId || '');
  if (!studentId) throw new Error('Не указан ученик.');
  const limit = Math.min(500, Math.max(1, Math.floor(Number(data.limit)) || 200));
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PASSPORT_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return {success:true, events:[]};
  const values = sheet.getDataRange().getValues(), h = values[0].map(String), get = (r, n) => r[h.indexOf(n)];
  const iso = v => v instanceof Date ? v.toISOString() : String(v || '');
  const events = values.slice(1)
    .filter(r => String(get(r, 'ID аккаунта')) === studentId && (!data.lesson || String(get(r, 'Занятие')) === String(data.lesson)) && (!data.taskId || String(get(r, '№ задачи')) === String(data.taskId)))
    .map(r => ({id:String(get(r, 'ID события')), lesson:String(get(r, 'Занятие')), taskId:String(get(r, '№ задачи')), type:String(get(r, 'Тип события')), time:iso(get(r, 'Время события')), received:iso(get(r, 'Принято сервером')), code:String(get(r, 'Код') || ''), attemptId:String(get(r, 'ID попытки') || ''), reason:String(get(r, 'Причина') || ''), verification:String(get(r, 'Результат проверки') || '')}));
  events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return {success:true, events:events.slice(-limit)};
}