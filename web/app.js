(() => {
  'use strict';

  const STORAGE_KEY = 'system_tracker_v2';
  const ICONS = ['check','book','code','dumbbell','droplet','moon','pill','heart','leaf','timer','star','walk','food','laptop'];
  const COLORS = {green:'#63b59b',blue:'#79aeda',teal:'#54b8b3',amber:'#d3a65f',gray:'#879591'};
  const MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const VIEWS = {
    overview:['Сегодня','Обзор'], habits:['Система','Привычки'], day:['Планер','План дня'],
    calendar:['Планер','Месяц / год'], goals:['Направление','Цели'], analytics:['Мой ритм','Аналитика'], history:['Архив','История'], settings:['Приложение','Настройки']
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
  const pad = n => String(n).padStart(2,'0');
  const todayKey = () => dateKey(new Date());
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseDate = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); };
  const addDays = (key,n) => { const d=parseDate(key); d.setDate(d.getDate()+n); return dateKey(d); };
  const compareDate = (a,b) => a.localeCompare(b);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function defaultState(){
    const today=todayKey();
    const h1=uid(),h2=uid(),h3=uid();
    return {
      version:3,
      settings:{appName:'Система',theme:'neon',background:'noise',customBackground:''},
      habits:[
        {id:h1,name:'SQL',metric:'duration',target:50,unit:'мин',assignMode:'manual',schedule:'daily',weekdays:[],color:'green',icon:'code',customIcon:'',note:'',active:true,createdAt:Date.now()},
        {id:h2,name:'Выйти из дома',metric:'check',target:1,unit:'раз',assignMode:'manual',schedule:'daily',weekdays:[],color:'blue',icon:'walk',customIcon:'',note:'',active:true,createdAt:Date.now()+1},
        {id:h3,name:'Источник жиров в еде',metric:'check',target:1,unit:'раз',assignMode:'manual',schedule:'daily',weekdays:[],color:'teal',icon:'food',customIcon:'',note:'',active:true,createdAt:Date.now()+2}
      ],
      habitSelections:{[today]:{[h1]:true,[h2]:true,[h3]:true}},
      habitLogs:{},
      goals:[],
      tasks:[],
      taskCompletions:{},
      createdAt:Date.now()
    };
  }

  function normalize(raw){
    const base=defaultState();
    if(!raw || typeof raw!=='object') return base;
    return {
      version:3,
      settings:{...base.settings,...(raw.settings||raw.profile||{})},
      habits:Array.isArray(raw.habits)?raw.habits.map(h=>({
        ...h,id:h.id||uid(),name:h.name||h.title||'Привычка',metric:h.metric||'check',target:Number(h.target??1),unit:h.unit||'раз',
        assignMode:h.assignMode||'auto',schedule:h.schedule?.type||h.schedule||'daily',weekdays:h.schedule?.days||h.weekdays||[],
        color:['green','blue','teal','amber','gray'].includes(h.color)?h.color:'green',icon:ICONS.includes(h.icon)?h.icon:'check',customIcon:h.customIcon||'',note:h.note||h.description||'',active:h.active!==false,createdAt:h.createdAt||Date.now()
      })):base.habits,
      habitSelections:raw.habitSelections&&typeof raw.habitSelections==='object'?raw.habitSelections:{},
      habitLogs:normalizeHabitLogs(raw.habitLogs||{}),
      goals:normalizeGoals(raw.goals),
      tasks:Array.isArray(raw.tasks)?raw.tasks.map(t=>({
        ...t,id:t.id||uid(),title:t.title||t.name||'Дело',date:t.date||todayKey(),timeMode:t.timeMode||(t.time?'exact':'none'),time:t.time||'',duration:Number(t.duration??t.estimate??30),color:['green','blue','teal','amber','gray'].includes(t.color)?t.color:'blue',repeat:t.repeat||t.recurrence||'none',note:t.note||t.notes||'',createdAt:t.createdAt||Date.now()
      })):[],
      taskCompletions:raw.taskCompletions&&typeof raw.taskCompletions==='object'?raw.taskCompletions:{},
      createdAt:raw.createdAt||Date.now()
    };
  }

  function normalizeHabitLogs(logs){
    const out={};
    Object.entries(logs||{}).forEach(([date,items])=>{
      out[date]={};
      Object.entries(items||{}).forEach(([id,val])=>{
        out[date][id]=typeof val==='object'&&val!==null?{...val,value:Number(val.value||0),updatedAt:val.updatedAt||Date.now()}:{value:Number(val||0),updatedAt:Date.now()};
      });
    });
    return out;
  }

  let loadError=false;
  function loadState(){
    try{const saved=localStorage.getItem(STORAGE_KEY);return normalize(saved?JSON.parse(saved):null);}
    catch{loadError=true;return defaultState();}
  }
  let state=loadState();
  let currentView='overview';
  let habitPeriod='today';
  let selectedHabitDate=todayKey();
  let selectedDay=todayKey();
  let selectedHistoryDate=todayKey();
  let habitMonthCursor=parseDate(todayKey());
  let habitYearCursor=parseDate(todayKey()).getFullYear();
  let calendarMode='month';
  let calendarCursor=parseDate(todayKey());
  let calendarYear=parseDate(todayKey()).getFullYear();
  let calendarTaskFilter='all';
  let selectedIcon='check';
  let customHabitIcon='';
  let toastTimer;

  function save(){
    const indicator=$('.save-indicator');
    try{
      if(loadError)throw new Error('unreadable data');
      const old=localStorage.getItem(STORAGE_KEY);
      if(old&&JSON.parse(old).version!==3&&!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,old);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      indicator.classList.remove('error');indicator.innerHTML='<i></i> данные сохранены';
    }catch(error){
      indicator.classList.add('error');indicator.innerHTML='<i></i> не удалось сохранить';
      toast('Не удалось сохранить данные. Скачай JSON-копию из настроек.');
      throw error;
    }
  }
  function ensureDate(date){ if(!state.habitSelections[date])state.habitSelections[date]={}; if(!state.habitLogs[date])state.habitLogs[date]={}; if(!state.taskCompletions[date])state.taskCompletions[date]={}; }
  function iconSrc(h){return h.customIcon||`assets/icons/${h.icon||'check'}.svg`;}
  function prettyDate(key){const d=parseDate(key);return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;}
  function shortDate(key){const d=parseDate(key);return `${pad(d.getDate())}.${pad(d.getMonth()+1)}`;}
  function monthLabel(d){return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;}
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1900);}

  function scheduleMatches(h,date){
    const d=parseDate(date);
    if((h.schedule||'daily')==='daily') return true;
    return (h.weekdays||[]).map(Number).includes(d.getDay());
  }
  function hasHabitLog(date,id){return Object.prototype.hasOwnProperty.call(state.habitLogs[date]||{},id);}
  function habitValue(date,id){return Number(state.habitLogs[date]?.[id]?.value||0);}
  function isHabitSelected(h,date){return h.active!==false&&habitWasPlanned(h,date);}
  function selectedHabits(date,includeArchived=false){return state.habits.filter(h=>(includeArchived||h.active!==false)&&habitWasPlanned(h,date));}
  function habitProgress(h,date){
    h=loggedHabit(h,date);const exists=hasHabitLog(date,h.id), value=habitValue(date,h.id), target=Math.max(0,Number(h.target??1));
    if(!exists) return 0;
    if(h.metric==='check') return value>=1?1:0;
    if(h.metric==='limit') return value<=target?1:clamp(target/value,0,1);
    return target>0?clamp(value/target,0,1):(value>0?1:0);
  }
  function habitDone(h,date){return habitProgress(h,date)>=.999;}
  function metricLabel(h){
    if(h.metric==='check')return 'сделано / нет';
    if(h.metric==='duration')return `${h.target} ${h.unit||'мин'}`;
    if(h.metric==='limit')return `не больше ${h.target} ${h.unit||''}`.trim();
    return `${h.target} ${h.unit||''}`.trim();
  }
  function formatHabitValue(h,date){h=loggedHabit(h,date);const v=habitValue(date,h.id);if(h.metric==='check')return v>=1?'сделано':'не отмечено';return `${formatNum(v)} / ${formatNum(h.target)} ${h.unit||''}`.trim();}
  function formatNum(v){return Number.isInteger(Number(v))?String(Number(v)):Number(v).toFixed(1).replace('.',',');}
  function habitStep(h){if(h.metric==='duration')return 10;if(h.metric==='value')return Number(h.target)>=10?1:.5;return 1;}
  function habitRate(date){const hs=selectedHabits(date);if(!hs.length)return 0;return hs.reduce((s,h)=>s+habitProgress(h,date),0)/hs.length;}

  function taskOccurs(t,date){
    if(compareDate(date,t.date)<0)return false;
    const td=parseDate(t.date),d=parseDate(date);
    if(t.repeat==='daily')return true;
    if(t.repeat==='weekly')return td.getDay()===d.getDay();
    if(t.repeat==='monthly')return td.getDate()===d.getDate();
    return t.date===date;
  }
  function tasksOnDate(date){return state.tasks.filter(t=>taskOccurs(t,date)).sort((a,b)=>taskSort(a,b));}
  function taskSort(a,b){const rank={exact:0,flexible:1,none:2};return rank[a.timeMode]-rank[b.timeMode]||(a.time||'99:99').localeCompare(b.time||'99:99')||a.createdAt-b.createdAt;}
  function taskDone(date,id){return !!state.taskCompletions[date]?.[id];}
  function dayHasActivity(date){return selectedHabits(date).length>0||Object.keys(state.habitLogs[date]||{}).length>0||tasksOnDate(date).length>0||Object.values(state.taskCompletions[date]||{}).some(Boolean);}
  function dayCompletion(date){
    const habits=selectedHabits(date),tasks=tasksOnDate(date);
    const values=[...habits.map(h=>habitProgress(h,date)),...tasks.map(t=>taskDone(date,t.id)?1:0)];
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  }
  function activeDayCountInMonth(d){const y=d.getFullYear(),m=d.getMonth();let n=0;for(let day=1;day<=new Date(y,m+1,0).getDate();day++){if(dayHasActivity(dateKey(new Date(y,m,day,12))))n++;}return n;}

  function applySettings(){
    const name=state.settings.appName||'Система';document.title=name;$('#brandName').textContent=name;$('#appNameInput').value=name;
    const theme=state.settings.theme||'neon';document.documentElement.dataset.theme=theme;
    if(state.settings.customBackground){document.documentElement.style.setProperty('--custom-bg',`url("${state.settings.customBackground}")`)}else{document.documentElement.style.setProperty('--custom-bg',`url('assets/backgrounds/${state.settings.background||'noise'}.svg')`)}
    $$('[data-bg]').forEach(b=>b.classList.toggle('active',!state.settings.customBackground&&b.dataset.bg===state.settings.background));
    $$('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));
  }

  function switchView(view){
    currentView=view;
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`${view}View`));
    $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const [eyebrow,title]=VIEWS[view];$('#pageEyebrow').textContent=eyebrow;$('#pageTitle').textContent=title;
    $('#drawer').classList.remove('open');
    renderView(view);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function renderView(view){if(view==='overview')renderOverview();if(view==='habits')renderHabits();if(view==='day')renderDay();if(view==='calendar')renderCalendar();if(view==='goals')renderGoals();if(view==='analytics')renderAnalytics();if(view==='history')renderHistory();if(view==='settings'){applySettings();updateBackupStatus();}}
  function renderAll(){renderOverview();renderHabits();renderDay();renderCalendar();renderAnalytics();renderGoals();renderHistory();applySettings();updateBackupStatus();}

  function renderOverview(){
    renderOverviewGoals();const today=todayKey(),d=parseDate(today);$('#overviewDate').textContent=`${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    const habits=selectedHabits(today);renderHabitCards($('#overviewHabits'),habits,today,true);$('#overviewHabitsEmpty').classList.toggle('hidden',habits.length>0);
    const tasks=tasksOnDate(today);$('#overviewTasks').innerHTML=tasks.slice(0,7).map(t=>taskRowHtml(t,today,true)).join('');$('#overviewTasksEmpty').classList.toggle('hidden',tasks.length>0);
  }

  function renderHabitCards(root,habits,date,compact=false){
    root.innerHTML='';habits.sort((a,b)=>a.createdAt-b.createdAt).forEach(h=>root.appendChild(createHabitCard(h,date,compact)));
  }
  function createHabitCard(h,date,compact){
    const card=document.createElement('article'),p=Math.round(habitProgress(h,date)*100),done=habitDone(h,date),step=habitStep(h);
    card.className=`habit-card ${done?'done':''}`;card.dataset.color=h.color||'green';
    const controls=h.metric==='check'
      ? `<div class="habit-controls single"><button class="main" data-habit-action="toggle" data-habit-id="${h.id}" data-date="${date}">${done?'Снять отметку':'Отметить'}</button></div>`
      : `<div class="habit-controls"><button data-habit-action="minus" data-step="${step}" data-habit-id="${h.id}" data-date="${date}">−</button><button class="main" data-habit-action="custom" data-habit-id="${h.id}" data-date="${date}">${escapeHtml(formatHabitValue(h,date))}</button><button data-habit-action="plus" data-step="${step}" data-habit-id="${h.id}" data-date="${date}">+</button></div>`;
    card.innerHTML=`<div class="habit-card-head"><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><button class="card-menu" data-edit-habit="${h.id}" aria-label="Редактировать">•••</button></div><h3>${escapeHtml(h.name)}</h3><p class="habit-rule">${escapeHtml(metricLabel(h))}</p><div class="habit-progress"><i style="width:${p}%"></i></div><div class="habit-value-row"><span>${escapeHtml(formatHabitValue(h,date))}</span><strong>${p}%</strong></div>${controls}`;
    return card;
  }
  function handleHabitAction(btn){
    const h=state.habits.find(x=>x.id===btn.dataset.habitId);if(!h)return;const date=btn.dataset.date||selectedHabitDate;ensureDate(date);let v=habitValue(date,h.id);
    const action=btn.dataset.habitAction;
    if(action==='toggle')v=v>=1?0:1;
    if(action==='plus')v+=Number(btn.dataset.step||1);
    if(action==='minus')v=Math.max(0,v-Number(btn.dataset.step||1));
    if(action==='custom'){
      const raw=prompt(`Значение «${h.name}» (${h.unit||'значение'}):`,String(v));if(raw===null)return;const n=Number(raw.replace(',','.'));if(!Number.isFinite(n)||n<0){toast('Введите неотрицательное число');return;}v=n;
    }
    writeHabitLog(h,date,Math.round(v*100)/100);save();refreshAfterData();
  }

  function renderHabits(){
    $('#habitsTodayPanel').classList.toggle('hidden',habitPeriod!=='today');$('#habitsMonthPanel').classList.toggle('hidden',habitPeriod!=='month');$('#habitsYearPanel').classList.toggle('hidden',habitPeriod!=='year');
    $('#selectHabitsButton').classList.toggle('hidden',habitPeriod!=='today');
    if(habitPeriod==='today')renderHabitsToday();if(habitPeriod==='month')renderHabitMonth();if(habitPeriod==='year')renderHabitYear();
  }
  function renderHabitsToday(){
    const d=parseDate(selectedHabitDate);$('#habitDateWeekday').textContent=WEEKDAYS[d.getDay()];$('#habitDateLabel').textContent=prettyDate(selectedHabitDate);$('#habitDateInput').value=selectedHabitDate;
    const hs=selectedHabits(selectedHabitDate);renderHabitCards($('#todayHabitGrid'),hs,selectedHabitDate);$('#todayHabitEmpty').classList.toggle('hidden',hs.length>0);
    const q=$('#habitSearch').value.trim().toLowerCase();const all=state.habits.filter(h=>h.active!==false&&(!q||`${h.name} ${h.note}`.toLowerCase().includes(q)));
    $('#habitLibraryCount').textContent=`(${all.length})`;$('#habitLibrary').innerHTML=all.map(h=>`<article class="library-item"><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><div><h3>${escapeHtml(h.name)}</h3><p>${escapeHtml(metricLabel(h))} · ${h.assignMode==='manual'?'вручную':'автоматически'}</p></div><div class="library-item-actions"><button data-select-single-habit="${h.id}" title="Добавить на день">＋</button><button data-edit-habit="${h.id}" title="Редактировать">•••</button></div></article>`).join('');
    fillHabitSelectors();
  }
  function renderHabitMonth(){
    fillHabitSelectors();const select=$('#habitMonthSelect'),h=state.habits.find(x=>x.id===select.value)||state.habits.find(x=>x.active!==false);if(!h){$('#habitMonthCalendar').innerHTML='<div class="empty-inline">Сначала создай привычку.</div>';return;}select.value=h.id;
    const y=habitMonthCursor.getFullYear(),m=habitMonthCursor.getMonth();$('#habitMonthLabel').textContent=monthLabel(habitMonthCursor);$('#habitMonthTitle').textContent=h.name;
    const first=new Date(y,m,1,12),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),cells=[];let selected=0,completed=0;
    for(let i=0;i<42;i++){
      const day=i-start+1,d=new Date(y,m,day,12),key=dateKey(d),outside=d.getMonth()!==m,isSel=isHabitSelected(h,key),p=habitProgress(h,key);if(!outside&&isSel&&key<=todayKey()){selected++;if(p>=.999)completed++;}
      cells.push(`<button class="month-day ${outside?'outside':''} ${key===todayKey()?'today':''}" data-history-date="${key}"><span class="day-number">${d.getDate()}</span>${isSel?`<span class="day-value">${hasHabitLog(key,h.id)?escapeHtml(formatHabitValue(h,key)):'—'}</span><i class="day-fill" style="width:${Math.round(p*100)}%;background:${COLORS[h.color]||COLORS.green}"></i>`:''}</button>`);
    }
    $('#habitMonthCalendar').innerHTML=cells.join('');$('#habitMonthSummary').textContent=selected?`${completed} из ${selected} дней`:'нет выбранных дней';
  }
  function renderHabitYear(){
    fillHabitSelectors();const select=$('#habitYearSelect'),h=state.habits.find(x=>x.id===select.value)||state.habits.find(x=>x.active!==false);if(!h){$('#habitYearGrid').innerHTML='<div class="empty-inline">Сначала создай привычку.</div>';return;}select.value=h.id;
    $('#habitYearLabel').textContent=habitYearCursor;$('#habitYearTitle').textContent=h.name;let total=0,done=0,html='';
    for(let m=0;m<12;m++){
      const first=new Date(habitYearCursor,m,1,12),start=(first.getDay()+6)%7,days=new Date(habitYearCursor,m+1,0).getDate();let cells='';for(let i=0;i<start;i++)cells+='<i></i>';
      for(let day=1;day<=days;day++){const key=dateKey(new Date(habitYearCursor,m,day,12)),sel=isHabitSelected(h,key),p=habitProgress(h,key);if(sel&&key<=todayKey()){total++;if(p>=.999)done++;}const level=!sel?'':p>=1?'level4':p>=.66?'level3':p>=.33?'level2':hasHabitLog(key,h.id)?'level1':'';cells+=`<i class="mini-day ${level}" title="${prettyDate(key)}: ${sel?formatHabitValue(h,key):'не выбрано'}"></i>`;}
      html+=`<section class="year-month"><h3>${MONTHS[m]}</h3><div class="mini-days">${cells}</div></section>`;
    }
    $('#habitYearGrid').innerHTML=html;$('#habitYearSummary').textContent=total?`${Math.round(done/total*100)}% выполнения`:'нет данных';
  }
  function fillHabitSelectors(){
    ['habitMonthSelect','habitYearSelect'].forEach(id=>{const s=$(`#${id}`),old=s.value;s.innerHTML=state.habits.filter(h=>h.active!==false).map(h=>`<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');if(state.habits.some(h=>h.id===old))s.value=old;});
  }

  function renderDay(){
    const d=parseDate(selectedDay);$('#dayWeekday').textContent=WEEKDAYS[d.getDay()];$('#dayDateLabel').textContent=prettyDate(selectedDay);$('#dayDateInput').value=selectedDay;
    const tasks=tasksOnDate(selectedDay),untimed=tasks.filter(t=>t.timeMode==='none'),timed=tasks.filter(t=>t.timeMode!=='none');
    $('#untimedTasks').innerHTML=untimed.map(t=>taskRowHtml(t,selectedDay,false)).join('');$('#untimedEmpty').classList.toggle('hidden',untimed.length>0);
    const hours=[...Array.from({length:12},(_,i)=>i+6),...Array.from({length:6},(_,i)=>i+18),...Array.from({length:6},(_,i)=>i)];
    const columns=[hours.slice(0,12),hours.slice(12)];
    $('#dayTimeline').innerHTML=columns.map((column,index)=>`<div class="schedule-column" data-part="${index}">${column.map(hour=>renderHourSlot(hour,timed)).join('')}</div>`).join('');
  }
  function renderHourSlot(hour,timed){
    const inHour=timed.filter(t=>Number((t.time||'00:00').split(':')[0])===hour);
    const groups=new Map();inHour.forEach(t=>{const key=t.time||`${pad(hour)}:00`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)});
    const content=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([time,items])=>`<div class="time-group"><span class="minute-label">${time}</span><div class="task-stack">${items.map(t=>scheduleTaskHtml(t)).join('')}</div></div>`).join('');
    return `<section class="schedule-hour" data-hour="${hour}"><div class="schedule-hour-label">${pad(hour)}:00</div><div class="schedule-hour-content">${content||'<span class="hour-empty">—</span>'}</div></section>`;
  }
  function scheduleTaskHtml(t){
    const done=taskDone(selectedDay,t.id),shift=t.timeMode==='flexible'?`<div class="flex-shift"><button data-shift-task="${t.id}" data-shift="-30">−30</button><button data-shift-task="${t.id}" data-shift="30">+30</button></div>`:'';
    return `<article class="schedule-task ${t.timeMode} ${done?'done':''}"><button class="task-check" data-toggle-task="${t.id}" data-date="${selectedDay}" aria-label="Готово">${done?'✓':''}</button><div class="schedule-task-copy"><strong>${escapeHtml(t.title)}</strong>${goalTaskLabel(t)}<small>${t.duration?`${t.duration} мин · `:''}${t.timeMode==='exact'?'точное время':'можно перенести'}</small>${t.note?`<p>${escapeHtml(t.note)}</p>`:''}</div>${shift}<button class="card-menu" data-edit-task="${t.id}" title="Изменить">•••</button></article>`;
  }
  function taskRowHtml(t,date,compact){const done=taskDone(date,t.id),time=t.timeMode==='none'?'без времени':`${t.time}${t.timeMode==='flexible'?' примерно':''}`;return `<article class="task-row ${t.timeMode} ${done?'done':''}"><button class="task-check" data-toggle-task="${t.id}" data-date="${date}" aria-label="Готово">${done?'✓':''}</button><div class="task-copy"><span class="task-title">${escapeHtml(t.title)}</span>${goalTaskLabel(t)}<span class="task-meta">${escapeHtml(time)}${t.duration?` · ${t.duration} мин`:''}</span></div><div class="task-actions"><button data-edit-task="${t.id}" title="Изменить">•••</button></div></article>`;}
  function toggleTask(id,date){ensureDate(date);state.taskCompletions[date][id]=!taskDone(date,id);
    const t=state.tasks.find(t=>t.id===id),g=state.goals.find(g=>g.id===t?.goalId),s=g?.steps.find(s=>s.id===t?.goalStepId);
    if(s){s.done=taskDone(date,id);if(!s.done&&g.status==='completed'){g.status='active';g.completedAt=null;}}
    save();refreshAfterData();}
  function shiftTask(id,minutes){const t=state.tasks.find(x=>x.id===id);if(!t||!t.time)return;const [h,m]=t.time.split(':').map(Number),total=(h*60+m+Number(minutes)+1440)%1440;t.time=`${pad(Math.floor(total/60))}:${pad(total%60)}`;save();renderDay();renderOverview();renderCalendar();}

  function renderCalendar(){
    $('#calendarMonthPanel').classList.toggle('hidden',calendarMode!=='month');$('#calendarYearPanel').classList.toggle('hidden',calendarMode!=='year');
    if(calendarMode==='month')renderMonthCalendar();else renderYearCalendar();
  }
  function renderMonthCalendar(){
    const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(),first=new Date(y,m,1,12),start=(first.getDay()+6)%7;$('#calendarMonthLabel').textContent=monthLabel(calendarCursor);let html='';
    for(let i=0;i<42;i++){
      const day=i-start+1,d=new Date(y,m,day,12),key=dateKey(d),outside=d.getMonth()!==m;
      let tasks=tasksOnDate(key);if(calendarTaskFilter==='timed')tasks=tasks.filter(t=>t.timeMode!=='none');
      const score=key<=todayKey()?dayCompletion(key):null;
      html+=`<button class="calendar-cell ${outside?'outside':''} ${key===todayKey()?'today':''}" data-open-day="${key}"><span class="num">${d.getDate()}</span><div class="cell-items">${tasks.slice(0,4).map(t=>`<span class="cell-item ${t.timeMode}">${escapeHtml(t.timeMode==='none'?'':t.time+' ')}${escapeHtml(t.title)}</span>`).join('')}${tasks.length>4?`<span class="cell-more">ещё ${tasks.length-4}</span>`:''}${selectedHabits(key).length?`<span class="habit-day-score">привычки ${Math.round(habitRate(key)*100)}%</span>`:''}</div>${score!==null?`<i class="calendar-score ${score>=.999?'complete':score>0?'partial':'missed'}"></i>`:''}</button>`;
    }
    $('#monthCalendar').innerHTML=html;
  }
  function renderYearCalendar(){
    $('#calendarYearLabel').textContent=calendarYear;let html='';for(let m=0;m<12;m++){const first=new Date(calendarYear,m,1,12),start=(first.getDay()+6)%7,days=new Date(calendarYear,m+1,0).getDate();let cells='';for(let i=0;i<start;i++)cells+='<i></i>';for(let day=1;day<=days;day++){const key=dateKey(new Date(calendarYear,m,day,12)),score=key<=todayKey()?dayCompletion(key):null,level=score===null?'':score>=.999?'level4':score>=.5?'level3':score>0?'level2':'missed';cells+=`<i class="mini-day ${level}" title="${prettyDate(key)}${score===null?'':`: ${Math.round(score*100)}%`}"></i>`;}html+=`<section class="year-month" data-open-month="${m}"><h3>${MONTHS[m]}</h3><div class="mini-days">${cells}</div></section>`;}$('#yearCalendar').innerHTML=html;
  }

  function activityDates(){
    const set=new Set([todayKey(),...Object.keys(state.habitSelections),...Object.keys(state.habitLogs),...Object.keys(state.taskCompletions)]);
    state.tasks.filter(t=>t.repeat==='none').forEach(t=>set.add(t.date));
    for(let i=0;i<365;i++){const d=addDays(todayKey(),-i);if(dayHasActivity(d))set.add(d)}
    return [...set].sort().reverse();
  }
  function renderHistory(){
    const q=$('#historySearch').value.trim().toLowerCase(),dates=activityDates().filter(d=>{if(!q)return true;return selectedHabits(d,true).some(h=>h.name.toLowerCase().includes(q))||tasksOnDate(d).some(t=>t.title.toLowerCase().includes(q));});
    if(!dates.includes(selectedHistoryDate))selectedHistoryDate=dates[0]||todayKey();$('#historyDateInput').value=selectedHistoryDate;
    $('#historyDates').innerHTML=dates.map(d=>`<button class="history-date ${d===selectedHistoryDate?'active':''}" data-history-date="${d}"><strong>${prettyDate(d)}</strong><span>${selectedHabits(d,true).length} привычек · ${tasksOnDate(d).length} дел</span></button>`).join('');renderHistoryDetail();
  }
  function renderHistoryDetail(){
    const date=selectedHistoryDate,habits=selectedHabits(date,true),tasks=tasksOnDate(date);$('#historyDetail').innerHTML=`<div class="history-detail-head"><div><span class="section-kicker">${WEEKDAYS[parseDate(date).getDay()].toUpperCase()}</span><h2>${prettyDate(date)}</h2></div><button class="secondary-button" data-open-day="${date}">Открыть день</button></div><section class="history-block"><h3>Привычки</h3>${habits.length?habits.map(h=>`<div class="history-entry"><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><div><strong>${escapeHtml(h.name)}</strong><p>${escapeHtml(formatHabitValue(h,date))} · ${Math.round(habitProgress(h,date)*100)}%</p></div><button class="text-button" data-edit-history-habit="${h.id}">Изменить</button></div>`).join(''):'<div class="empty-inline">Не было выбрано.</div>'}</section><section class="history-block"><h3>Дела</h3>${tasks.length?tasks.map(t=>`<div class="history-entry"><div class="task-check">${taskDone(date,t.id)?'✓':''}</div><div><strong>${escapeHtml(t.title)}</strong><p>${t.timeMode==='none'?'без времени':escapeHtml(t.time)} · ${taskDone(date,t.id)?'выполнено':'не выполнено'}</p></div><button class="text-button" data-toggle-task="${t.id}" data-date="${date}">${taskDone(date,t.id)?'Вернуть':'Готово'}</button></div>`).join(''):'<div class="empty-inline">Дел не было.</div>'}</section>`;
  }

  function openHabitDialog(id=null){
    const h=id?state.habits.find(x=>x.id===id):null;$('#habitDialogTitle').textContent=h?'Изменить привычку':'Новая привычка';$('#habitId').value=h?.id||'';$('#habitName').value=h?.name||'';$('#habitMetric').value=h?.metric||'check';$('#habitTarget').value=h?.target??1;$('#habitUnit').value=h?.unit||'раз';$('#habitAssignMode').value=h?.assignMode||'manual';$('#habitSchedule').value=h?.schedule||'daily';$('#habitColor').value=h?.color||'green';$('#habitNote').value=h?.note||'';$('#habitSelectToday').checked=!h;selectedIcon=h?.icon||'check';customHabitIcon=h?.customIcon||'';$$('#habitWeekdays input').forEach(cb=>cb.checked=(h?.weekdays||[]).map(Number).includes(Number(cb.value)));$('#deleteHabit').classList.toggle('hidden',!h);updateHabitForm();renderIconPicker();$('#habitDialog').showModal();
  }
  function updateHabitForm(){
    const metric=$('#habitMetric').value,assign=$('#habitAssignMode').value,schedule=$('#habitSchedule').value;$('#habitTargetWrap').classList.toggle('hidden',metric==='check');$('#habitUnitWrap').classList.toggle('hidden',metric==='check');$('#habitScheduleWrap').classList.toggle('hidden',assign!=='auto');$('#habitWeekdaysWrap').classList.toggle('hidden',assign!=='auto'||schedule!=='weekdays');
    if(metric==='duration'&&($('#habitUnit').value==='раз'||!$('#habitUnit').value)){$('#habitUnit').value='мин';$('#habitTarget').value=50}
    if(metric==='count'&&$('#habitUnit').value==='мин')$('#habitUnit').value='раз';
    if(metric==='limit'&&Number($('#habitTarget').value)===1)$('#habitTarget').value=30;
  }
  function renderIconPicker(){$('#habitIconPicker').innerHTML=ICONS.map(i=>`<button type="button" class="icon-option ${selectedIcon===i&&!customHabitIcon?'active':''}" data-icon="${i}"><img src="assets/icons/${i}.svg" alt=""/></button>`).join('');}
  function saveHabit(e){
    e.preventDefault();const id=$('#habitId').value||uid(),existing=state.habits.find(h=>h.id===id),metric=$('#habitMetric').value;const habit={id,name:$('#habitName').value.trim(),metric,target:metric==='check'?1:Math.max(0,Number($('#habitTarget').value||0)),unit:metric==='check'?'раз':$('#habitUnit').value.trim(),assignMode:$('#habitAssignMode').value,schedule:$('#habitSchedule').value,weekdays:$$('#habitWeekdays input:checked').map(x=>Number(x.value)),color:$('#habitColor').value,icon:selectedIcon,customIcon:customHabitIcon,note:$('#habitNote').value.trim(),active:true,createdAt:existing?.createdAt||Date.now()};
    if(!habit.name){toast('Введите название');return;}if(existing){
      const previous=ruleSnapshot(existing),next=ruleSnapshot(habit);
      if(JSON.stringify(previous)!==JSON.stringify(next)){
        existing.ruleHistory=existing.ruleHistory||[{from:dateKey(new Date(existing.createdAt)),...previous}];
        Object.entries(state.habitLogs).forEach(([date,logs])=>{if(logs[id]&&!logs[id].rule)logs[id].rule=ruleSnapshot(habitRuleAt(existing,date));});
        existing.ruleHistory=existing.ruleHistory.filter(r=>r.from!==todayKey());existing.ruleHistory.push({from:todayKey(),...next});
      }
      Object.assign(existing,habit);
    }else state.habits.push(habit);if($('#habitSelectToday').checked){ensureDate(selectedHabitDate);state.habitSelections[selectedHabitDate][id]=true;}save();$('#habitDialog').close();refreshAfterData();toast(existing?'Привычка изменена':'Привычка добавлена');
  }
  function deleteHabit(){const id=$('#habitId').value,h=state.habits.find(h=>h.id===id);if(!h||!confirm('Убрать привычку в архив? Все отметки сохранятся в аналитике.'))return;h.active=false;h.archivedAt=Date.now();save();$('#habitDialog').close();refreshAfterData();toast('Привычка в архиве');}

  function openHabitSelectDialog(){
    const date=currentView==='habits'?selectedHabitDate:todayKey();$('#habitSelectDialog').dataset.date=date;$('#habitSelectTitle').textContent=`Привычки на ${prettyDate(date)}`;$('#habitSelectList').innerHTML=state.habits.filter(h=>h.active!==false).map(h=>`<label class="select-habit-item"><input type="checkbox" value="${h.id}" ${isHabitSelected(h,date)?'checked':''}/><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><span><h3>${escapeHtml(h.name)}</h3><p>${escapeHtml(metricLabel(h))}${h.assignMode==='auto'?' · по расписанию':''}</p></span></label>`).join('')||'<div class="empty-inline">Сначала создай привычку.</div>';$('#habitSelectDialog').showModal();
  }
  function saveHabitSelection(e){e.preventDefault();const date=$('#habitSelectDialog').dataset.date;ensureDate(date);const checked=new Set($$('#habitSelectList input:checked').map(x=>x.value));state.habits.filter(h=>h.active!==false).forEach(h=>{state.habitSelections[date][h.id]=checked.has(h.id)});save();$('#habitSelectDialog').close();refreshAfterData();}

  function openTaskDialog(id=null,date=null){
    const t=id?state.tasks.find(x=>x.id===id):null;$('#taskDialogTitle').textContent=t?'Изменить дело':'Новое дело';$('#taskId').value=t?.id||'';$('#taskTitle').value=t?.title||'';$('#taskDate').value=t?.date||date||selectedDay||todayKey();$('#taskTimeMode').value=t?.timeMode||'none';$('#taskTime').value=t?.time||'12:00';$('#taskDuration').value=t?.duration??30;$('#taskRepeat').value=t?.repeat||'none';$('#taskRepeat').disabled=!!t?.goalId;$('#taskNote').value=t?.note||'';$('#deleteTask').classList.toggle('hidden',!t);updateTaskForm();$('#taskDialog').showModal();
  }
  function updateTaskForm(){const show=$('#taskTimeMode').value!=='none';$('#taskTimeWrap').classList.toggle('hidden',!show);$('#taskDurationWrap').classList.toggle('hidden',!show);}
  function saveTask(e){
    e.preventDefault();const id=$('#taskId').value||uid(),existing=state.tasks.find(t=>t.id===id),t={...(existing||{}),id,title:$('#taskTitle').value.trim(),date:$('#taskDate').value,timeMode:$('#taskTimeMode').value,time:$('#taskTimeMode').value==='none'?'':$('#taskTime').value,duration:$('#taskTimeMode').value==='none'?0:Number($('#taskDuration').value||0),color:existing?.color||'blue',repeat:$('#taskRepeat').value,note:$('#taskNote').value.trim(),createdAt:existing?.createdAt||Date.now()};if(!t.title||!t.date){toast('Заполни название и дату');return;}if(existing){
      if(t.goalId){const g=state.goals.find(g=>g.id===t.goalId),s=g?.steps.find(s=>s.id===t.goalStepId);if(s)s.title=t.title;
        if(existing.date!==t.date){const done=taskDone(existing.date,id);delete state.taskCompletions[existing.date]?.[id];ensureDate(t.date);state.taskCompletions[t.date][id]=done;}}
      Object.assign(existing,t);
    }else state.tasks.push(t);save();$('#taskDialog').close();selectedDay=t.date;refreshAfterData();toast(existing?'Дело изменено':'Дело добавлено');
  }
  function deleteTask(){const id=$('#taskId').value;if(!id||!confirm('Удалить дело и его повторения?'))return;const old=state.tasks.find(t=>t.id===id),g=state.goals.find(g=>g.id===old?.goalId),s=g?.steps.find(s=>s.id===old?.goalStepId);if(s)s.done=taskDone(old.date,id);state.tasks=state.tasks.filter(t=>t.id!==id);Object.values(state.taskCompletions).forEach(x=>delete x[id]);save();$('#taskDialog').close();refreshAfterData();}

  function refreshAfterData(){renderOverview();renderHabits();renderDay();renderCalendar();renderAnalytics();renderGoals();if(currentView==='history')renderHistory();}
  function closeDialog(id){document.getElementById(id)?.close();}

  function exportJson(){download(JSON.stringify(state,null,2),`system-backup-${todayKey()}.json`,'application/json');toast('Резервная копия скачана');}
  function exportCsv(){
    const rows=[['type','date','name','value','target','unit','status','time_type','time','note']];
    Object.entries(state.habitLogs).sort().forEach(([date,items])=>Object.entries(items).forEach(([id,log])=>{const h=state.habits.find(x=>x.id===id);rows.push(['habit',date,h?.name||id,log.value,h?.target||'',h?.unit||'',h&&habitDone(h,date)?'done':'partial','','',h?.note||'']);}));
    const dates=new Set([...Object.keys(state.taskCompletions),...state.tasks.filter(t=>t.repeat==='none').map(t=>t.date)]);for(let i=0;i<365;i++)dates.add(addDays(todayKey(),-i));
    [...dates].sort().forEach(date=>tasksOnDate(date).forEach(t=>rows.push(['task',date,t.title,taskDone(date,t.id)?1:0,'','',taskDone(date,t.id)?'done':'todo',t.timeMode,t.time,t.note])));
    const csv='\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\n');download(csv,`system-data-${todayKey()}.csv`,'text/csv;charset=utf-8');toast('CSV скачан');
  }
  function csvCell(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function download(content,name,type){
    if(window.AndroidBridge && typeof window.AndroidBridge.saveText==='function'){
      window.AndroidBridge.saveText(name,String(content??''),type||'text/plain');
      return;
    }
    const a=document.createElement('a');
    const url=URL.createObjectURL(new Blob([content],{type}));
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function importJson(e){const file=e.target.files?.[0];if(!file)return;try{const raw=JSON.parse(await file.text());if(!raw||!Array.isArray(raw.habits)||!Array.isArray(raw.tasks))throw new Error();if(!confirm('Импорт заменит текущие данные. Продолжить?'))return;localStorage.setItem(BEFORE_IMPORT_KEY,localStorage.getItem(STORAGE_KEY)||JSON.stringify(state));const oldError=loadError;loadError=false;state=normalize(raw);try{save();}catch(error){loadError=oldError;throw error;}applySettings();renderAll();toast('Данные импортированы');}catch{toast('Файл не похож на резервную копию');}e.target.value='';}
  function resetData(){if(!confirm('Удалить привычки, дела и всю историю?'))return;if(!confirm('Это действие нельзя отменить без резервной копии. Удалить?'))return;state=defaultState();save();selectedHabitDate=selectedDay=selectedHistoryDate=todayKey();calendarCursor=parseDate(todayKey());habitMonthCursor=parseDate(todayKey());habitYearCursor=calendarYear=parseDate(todayKey()).getFullYear();applySettings();renderAll();toast('Данные очищены');}
  async function imageToDataUrl(file,max=1200){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.82));};img.src=reader.result;};reader.readAsDataURL(file);});}

  // Calendar analytics uses one cell per local calendar day, one board per habit.
  let analyticsPeriod='year', analyticsCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1,12);
  let goalFilter='all', goalDraftSteps=[];
  const BACKUP_KEY=STORAGE_KEY+'_before_goals_v3';
  const BEFORE_IMPORT_KEY=STORAGE_KEY+'_before_import';
  const RULE_KEYS=['metric','target','unit','assignMode','schedule','weekdays'];

  function habitRuleAt(h,date){
    const rule=(h.ruleHistory||[]).filter(r=>r.from<=date).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);
    return rule?{...h,...rule}:h;
  }
  function loggedHabit(h,date){return {...habitRuleAt(h,date),...(state.habitLogs[date]?.[h.id]?.rule||{})};}
  function ruleSnapshot(h){return Object.fromEntries(RULE_KEYS.map(k=>[k,h[k]]));}
  function writeHabitLog(h,date,value){
    ensureDate(date);const rule=state.habitLogs[date]?.[h.id]?.rule||ruleSnapshot(habitRuleAt(h,date));
    state.habitSelections[date][h.id]=true;state.habitLogs[date][h.id]={value,updatedAt:Date.now(),rule};
  }
  function habitWasPlanned(h,date){
    if(hasHabitLog(date,h.id))return true;
    const override=state.habitSelections[date]?.[h.id];if(typeof override==='boolean')return override;
    if(date<dateKey(new Date(h.createdAt)))return false;
    if(h.archivedAt&&date>=dateKey(new Date(h.archivedAt)))return false;
    if(h.active===false&&!h.archivedAt)return false;
    const rule=habitRuleAt(h,date);return rule.assignMode==='auto'&&scheduleMatches(rule,date);
  }
  function calendarRange(){
    const y=analyticsCursor.getFullYear(),m=analyticsCursor.getMonth();
    return {start:dateKey(new Date(y,analyticsPeriod==='year'?0:m,1,12)),end:dateKey(new Date(y,analyticsPeriod==='year'?12:m+1,0,12))};
  }
  function dateSpan(start,end){const out=[];for(let d=start;d<=end;d=addDays(d,1))out.push(d);return out;}
  function habitStreak(h,from=todayKey()){
    let streak=0,seen=0;
    for(let d=from;seen<220;d=addDays(d,-1),seen++){
      if(dateKey(new Date(h.createdAt))>d)break;
      if(!habitWasPlanned(h,d))continue;
      if(!habitDone(h,d))break;
      streak++;
    }
    return streak;
  }
  function analyticsRatio(habits,dates){
    const planned=dates.flatMap(d=>habits.filter(h=>d<=todayKey()&&habitWasPlanned(h,d)).map(h=>[h,d]));
    const done=planned.filter(([h,d])=>habitDone(h,d)).length;
    return {done,total:planned.length,percent:planned.length?Math.round(done/planned.length*100):0};
  }
  function renderAnalyticsInsights(habits,dates){
    const today=todayKey(),weekStart=addDays(today,-((parseDate(today).getDay()+6)%7)),week=analyticsRatio(habits,dateSpan(weekStart,today));
    const month=analyticsRatio(habits,dateSpan(dateKey(new Date(parseDate(today).getFullYear(),parseDate(today).getMonth(),1,12)),today));
    const best=habits.map(h=>({h,streak:habitStreak(h,today)})).sort((a,b)=>b.streak-a.streak)[0];
    const period=analyticsRatio(habits,dates.filter(d=>d<=today));
    $('#analyticsInsights').innerHTML=[
      ['Ритм периода',period.total?`${period.percent}%`:'—',period.total?`${period.done} из ${period.total} отметок`:'Появится после первых отметок'],
      ['Эта неделя',week.total?`${week.percent}%`:'—',week.total?`${week.done} из ${week.total} запланировано`:'Нет запланированных привычек'],
      ['Этот месяц',month.total?`${month.percent}%`:'—',month.total?`${month.done} из ${month.total} запланировано`:'Пока нет данных'],
      ['Лучший стрик',best&&best.streak?`${best.streak} дн.`:'—',best&&best.streak?best.h.name:'Серия начнётся с первой привычки']
    ].map(([label,value,note])=>`<article class="insight-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(note)}</p></article>`).join('');
  }
  function renderAnalytics(){
    const {start,end}=calendarRange(),today=todayKey(),dates=dateSpan(start,end);
    $('#analyticsPeriodLabel').textContent=analyticsPeriod==='year'?String(analyticsCursor.getFullYear()):monthLabel(analyticsCursor);
    const query=$('#analyticsSearch').value.trim().toLowerCase(),archived=$('#analyticsArchived').checked;
    const habits=state.habits.filter(h=>(h.active!==false||archived)&&(!query||h.name.toLowerCase().includes(query)));
    renderAnalyticsInsights(habits,dates);
    const root=$('#habitCalendars');
    root.innerHTML=habits.length?habits.map(h=>{
      const elapsed=dates.filter(d=>d<=today&&habitWasPlanned(h,d)),done=elapsed.filter(d=>habitDone(h,d)).length;
      const logged=dates.filter(d=>d<=today&&hasHabitLog(d,h.id));
      const color=COLORS[h.color]||COLORS.green;
      const monday=addDays(start,-((parseDate(start).getDay()+6)%7)),last=addDays(end,6-((parseDate(end).getDay()+6)%7)),boardDates=dateSpan(monday,last);
      const cells=boardDates.map(d=>{
        if(d<start||d>end)return '<span class="habit-pixel outside"></span>';
        const hasLog=hasHabitLog(d,h.id),planned=habitWasPlanned(h,d),p=habitProgress(h,d),future=d>today;
        const before=d<dateKey(new Date(h.createdAt))&&!hasLog&&!planned;
        const status=future?'будущий день':before?'до начала привычки':hasLog?formatHabitValue(h,d):planned?'не отмечено':'не запланировано';
        const cls=[hasLog&&p>0?'has-value':'',p>=.999&&hasLog?'complete':'',!planned?'unscheduled':'',future?'future':'',before?'before-start':'',d===today?'today':''].join(' ');
        return `<button class="habit-pixel ${cls}" style="--fill:${hasLog?Math.max(.18,p):0}" data-habit-cell="${escapeHtml(h.id)}" data-cell-date="${d}" aria-label="${escapeHtml(h.name+' · '+prettyDate(d)+' · '+status)}" title="${escapeHtml(prettyDate(d)+' · '+status)}" ${future||before?'disabled':''}>${analyticsPeriod==='month'?parseDate(d).getDate():''}</button>`;
      }).join('');
      const total=logged.reduce((s,d)=>s+habitValue(d,h.id),0),units=new Set(logged.map(d=>loggedHabit(h,d).unit));
      const volume=h.metric!=='check'&&h.metric!=='limit'&&logged.length&&units.size===1?`<span class="volume-label">${formatNum(total)} ${escapeHtml([...units][0])} за период</span>`:'';
      return `<article class="habit-calendar" style="--habit-color:${color}"><div class="habit-calendar-head"><div class="habit-calendar-title"><img src="${escapeHtml(iconSrc(h))}" alt=""/><div><h2>${escapeHtml(h.name)}</h2><p>${escapeHtml(metricLabel(h))}${h.active===false?' · в архиве':''}</p></div></div><div class="habit-calendar-summary"><strong>${done} из ${elapsed.length}</strong><span>запланированных дней выполнено</span></div></div><div class="habit-grid-scroll"><div class="${analyticsPeriod==='year'?'habit-year-board':'habit-month-board'}">${analyticsPeriod==='year'?`<div class="habit-month-labels">${MONTHS.map(m=>`<span>${m.slice(0,3)}</span>`).join('')}</div>`:''}<div class="habit-board-body"><div class="habit-week-labels"><span>Пн</span><span></span><span>Ср</span><span></span><span>Пт</span><span></span><span>Вс</span></div><div class="habit-pixels" style="--weeks:${boardDates.length/7}">${cells}</div></div></div></div><p class="habit-calendar-footer"><span>${logged.length?'Нажми на день, чтобы посмотреть или изменить отметку.':'Пока нет отметок за этот период.'}</span>${volume}</p></article>`;
    }).join(''):`<div class="empty-goals"><h2>${query?'Ничего не найдено':'Здесь появится твой ритм'}</h2><p>${query?'Попробуй другое название.':'Создай привычку и отмечай её выполнение. Каждый день займёт одну клеточку.'}</p>${query?'':'<button class="primary-button" data-open="habit">Создать привычку</button>'}</div>`;
  }
  function openHabitCell(id,date){
    const h=state.habits.find(x=>x.id===id);if(!h||date>todayKey())return;
    const rule=loggedHabit(h,date),dlg=$('#habitCellDialog');dlg.dataset.habitId=id;dlg.dataset.date=date;
    $('#cellHabitName').textContent=h.name;$('#cellDate').textContent=prettyDate(date);
    $('#cellRule').textContent=metricLabel(rule);$('#cellCheckWrap').classList.toggle('hidden',rule.metric!=='check');$('#cellValueWrap').classList.toggle('hidden',rule.metric==='check');
    $('#cellChecked').checked=habitDone(h,date);$('#cellValue').value=habitValue(date,id);$('#cellUnit').textContent=rule.unit||'Значение';$('#clearCell').disabled=!hasHabitLog(date,id);dlg.showModal();
  }
  function saveHabitCell(e){
    e.preventDefault();const dlg=$('#habitCellDialog'),h=state.habits.find(x=>x.id===dlg.dataset.habitId),date=dlg.dataset.date;if(!h)return;
    const rule=loggedHabit(h,date),value=rule.metric==='check'?Number($('#cellChecked').checked):Number($('#cellValue').value);
    if(!Number.isFinite(value)||value<0){toast('Введите неотрицательное число');return;}
    writeHabitLog(h,date,value);save();dlg.close();refreshAfterData();toast('Отметка сохранена');
  }
  function endOfPeriod(period){
    const d=parseDate(todayKey());
    if(period==='week')d.setDate(d.getDate()+6-(d.getDay()+6)%7);
    if(period==='month')d.setMonth(d.getMonth()+1,0);
    if(period==='year')d.setMonth(11,31);
    return dateKey(d);
  }
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&dateKey(parseDate(value))===value;}
  function normalizeGoals(goals){
    return Array.isArray(goals)?goals.filter(g=>g&&typeof g==='object').map(g=>({
      id:String(g.id||uid()),title:String(g.title||'Цель'),note:String(g.note||''),due:validDate(g.due)?g.due:'',
      status:['active','paused','completed','archived'].includes(g.status)?g.status:'active',createdAt:g.createdAt||Date.now(),completedAt:g.completedAt||null,
      habitIds:Array.isArray(g.habitIds)?g.habitIds.map(String):[],
      steps:Array.isArray(g.steps)?g.steps.filter(s=>s&&typeof s==='object').map(s=>({id:String(s.id||uid()),title:String(s.title||''),done:!!s.done})):[]
    })):[];
  }
  function goalDueLabel(g){return g.due?`До ${prettyDate(g.due)}`:'Без срока';}
  function goalTask(stepId,goalId){return state.tasks.find(t=>t.goalId===goalId&&t.goalStepId===stepId);}
  function goalStepDone(g,step){const task=goalTask(step.id,g.id);return task?taskDone(task.date,task.id):step.done;}
  function goalMatches(g){
    const q=$('#goalSearch').value.trim().toLowerCase();if(q&&!`${g.title} ${g.note} ${g.steps.map(s=>s.title).join(' ')}`.toLowerCase().includes(q))return false;
    if(goalFilter==='completed'||goalFilter==='archived')return g.status===goalFilter;
    if(g.status==='completed'||g.status==='archived')return false;
    if(goalFilter==='none')return !g.due;
    if(['week','month','year'].includes(goalFilter))return !!g.due&&g.due<=endOfPeriod(goalFilter);
    return true;
  }
  function renderGoals(){
    const goals=state.goals.filter(goalMatches).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||b.createdAt-a.createdAt);
    $('#goalCount').textContent=`${state.goals.filter(g=>g.status==='active').length} в работе`;
    $('#goalsFilterNote').textContent=['week','month','year'].includes(goalFilter)?'Цели со сроком до конца выбранного периода, включая те, срок которых уже прошёл.':'';
    $('#goalList').innerHTML=goals.length?goals.map(g=>{
      const completed=g.status==='completed',archived=g.status==='archived',done=g.steps.filter(s=>goalStepDone(g,s)).length;
      return `<article class="goal-card ${completed?'completed':''}"><div class="goal-card-top"><div><h2>${escapeHtml(g.title)}</h2><span class="goal-deadline ${!completed&&g.due&&g.due<todayKey()?'overdue':''}">${escapeHtml(goalDueLabel(g))}${g.status==='paused'?' · на паузе':completed?' · завершена':archived?' · в архиве':''}</span></div><button class="card-menu" data-edit-goal="${escapeHtml(g.id)}" aria-label="Изменить цель ${escapeHtml(g.title)}">•••</button></div>${g.note?`<p class="goal-note">${escapeHtml(g.note)}</p>`:''}${g.steps.length?`<div><div class="goal-progress-copy"><span>Шаги</span><span>${done} из ${g.steps.length}</span></div><div class="goal-progress-track"><i style="width:${done/g.steps.length*100}%"></i></div></div><div class="goal-steps">${g.steps.map(s=>{const isDone=goalStepDone(g,s),task=goalTask(s.id,g.id);return `<div class="goal-step ${isDone?'done':''}"><button class="task-check" data-goal-step="${escapeHtml(s.id)}" data-goal-id="${escapeHtml(g.id)}" aria-label="${isDone?'Вернуть':'Выполнить'} шаг ${escapeHtml(s.title)}" aria-pressed="${isDone}" ${archived?'disabled':''}>${isDone?'✓':''}</button><span>${escapeHtml(s.title)}</span>${!isDone&&!completed&&!archived?`<button class="goal-plan-button" data-plan-step="${escapeHtml(s.id)}" data-goal-id="${escapeHtml(g.id)}">${task?shortDate(task.date)+' · открыть':'В план дня'}</button>`:''}</div>`;}).join('')}</div>`:'<p class="goal-form-note">Можно добавить шаги или просто отметить цель завершённой.</p>'}${g.habitIds.length?`<div class="goal-habits">${g.habitIds.map(id=>{const h=state.habits.find(x=>x.id===id);return h?`<span class="goal-habit-chip">${escapeHtml(h.name)}</span>`:'';}).join('')}</div>`:''}<div class="goal-card-actions">${archived?`<button class="text-button" data-goal-status="active" data-goal-id="${escapeHtml(g.id)}">Вернуть из архива</button>`:`<button class="text-button" data-goal-status="${completed?'active':'completed'}" data-goal-id="${escapeHtml(g.id)}">${completed?'Вернуть в работу':'Завершить цель'}</button>${!completed?`<button class="text-button" data-goal-status="${g.status==='paused'?'active':'paused'}" data-goal-id="${escapeHtml(g.id)}">${g.status==='paused'?'Продолжить':'Пауза'}</button>`:''}`}</div></article>`;
    }).join(''):`<div class="empty-goals"><h2>${state.goals.length?'Здесь пока нет целей':'Чего тебе хочется?'}</h2><p>${state.goals.length?'Попробуй другой период или добавь новую цель.':'Закончить курс к октябрю, научиться новому за год или сохранить внезапную идею. Начни с одной строки.'}</p><button class="primary-button" data-new-goal>Добавить цель</button></div>`;
  }
  function renderOverviewGoals(){
    const goals=state.goals.filter(g=>g.status==='active').sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,3);
    $('#overviewGoalItems').innerHTML=goals.length?goals.map(g=>{const step=g.steps.find(s=>!goalStepDone(g,s));return `<button class="overview-goal-link" data-edit-goal="${escapeHtml(g.id)}"><strong>${escapeHtml(g.title)}</strong><span>${step?'Следующий шаг: '+escapeHtml(step.title):escapeHtml(goalDueLabel(g))}</span></button>`;}).join(''):'<p class="backup-status">Добавь то, к чему хочешь прийти, — и выбери первый небольшой шаг.</p>';
  }
  function openGoalDialog(id){
    const g=state.goals.find(x=>x.id===id);$('#goalId').value=g?.id||'';$('#goalDialogTitle').textContent=g?'Изменить цель':'Новая цель';$('#goalTitle').value=g?.title||'';$('#goalNote').value=g?.note||'';$('#goalDue').value=g?.due||'';$('#goalHorizon').value=g?.due?'date':'none';$('#goalDueWrap').classList.toggle('hidden',!g?.due);$('#archiveGoal').classList.toggle('hidden',!g||g.status==='archived');
    goalDraftSteps=(g?.steps||[]).map(s=>({...s}));renderGoalEditorSteps();
    $('#goalHabitOptions').innerHTML=state.habits.filter(h=>h.active!==false||(g?.habitIds||[]).includes(h.id)).map(h=>`<label><input type="checkbox" value="${escapeHtml(h.id)}" ${(g?.habitIds||[]).includes(h.id)?'checked':''}/>${escapeHtml(h.name)}</label>`).join('')||'<span class="goal-form-note">Сначала добавь привычку в разделе «Привычки».</span>';
    $('#goalDialog').showModal();
  }
  function renderGoalEditorSteps(){
    $('#goalEditorSteps').innerHTML=goalDraftSteps.map((s,i)=>`<div class="goal-editor-row"><input value="${escapeHtml(s.title)}" maxlength="160" aria-label="Шаг ${i+1}" data-draft-step="${escapeHtml(s.id)}" placeholder="Небольшой конкретный шаг"/><button type="button" data-remove-draft="${escapeHtml(s.id)}" aria-label="Убрать шаг ${i+1}">×</button></div>`).join('');
  }
  function saveGoal(e){
    e.preventDefault();const id=$('#goalId').value||uid(),existing=state.goals.find(g=>g.id===id),title=$('#goalTitle').value.trim(),due=$('#goalHorizon').value==='none'?'':$('#goalDue').value;
    if(!title){toast('Напиши название цели');return;}if($('#goalHorizon').value!=='none'&&!validDate(due)){toast('Выбери дату');return;}
    const steps=goalDraftSteps.filter(s=>s.title.trim()).map(s=>({...s,title:s.title.trim()}));
    const g={...(existing||{id,status:'active',createdAt:Date.now(),completedAt:null}),title,due,note:$('#goalNote').value.trim(),steps,habitIds:$$('#goalHabitOptions input:checked').map(el=>el.value)};
    // Removing a step detaches its task instead of silently deleting the day's plan.
    state.tasks.filter(t=>t.goalId===id).forEach(t=>{const step=steps.find(s=>s.id===t.goalStepId);if(step)t.title=step.title;else{delete t.goalId;delete t.goalStepId;}});
    if(existing)Object.assign(existing,g);else state.goals.push(g);save();$('#goalDialog').close();refreshAfterData();toast(existing?'Цель сохранена':'Цель добавлена');
  }
  function toggleGoalStep(goalId,stepId){
    const g=state.goals.find(x=>x.id===goalId),s=g?.steps.find(x=>x.id===stepId);if(!s)return;
    s.done=!goalStepDone(g,s);const task=goalTask(stepId,goalId);if(task){ensureDate(task.date);state.taskCompletions[task.date][task.id]=s.done;}
    if(!s.done&&g.status==='completed'){g.status='active';g.completedAt=null;}
    save();refreshAfterData();
  }
  function openPlanStep(goalId,stepId){
    const g=state.goals.find(x=>x.id===goalId),step=g?.steps.find(x=>x.id===stepId);if(!step)return;
    const existing=goalTask(stepId,goalId);if(existing){selectedDay=existing.date;switchView('day');return;}
    const dlg=$('#planStepDialog');dlg.dataset.goalId=goalId;dlg.dataset.stepId=stepId;$('#planStepTitle').textContent=step.title;$('#planStepDate').value=todayKey();dlg.showModal();
  }
  function savePlanStep(e){
    e.preventDefault();const dlg=$('#planStepDialog'),g=state.goals.find(x=>x.id===dlg.dataset.goalId),step=g?.steps.find(x=>x.id===dlg.dataset.stepId),date=$('#planStepDate').value;
    if(!step||!validDate(date))return;if(goalTask(step.id,g.id)){dlg.close();return;}
    state.tasks.push({id:uid(),title:step.title,date,timeMode:'none',time:'',duration:0,color:'green',repeat:'none',note:g.note,createdAt:Date.now(),goalId:g.id,goalStepId:step.id});save();dlg.close();refreshAfterData();toast('Шаг добавлен в план дня');
  }
  function goalTaskLabel(t){const g=state.goals.find(x=>x.id===t.goalId);return g?`<span class="task-goal-label">Цель: ${escapeHtml(g.title)}</span>`:'';}
  function updateBackupStatus(){
    const backup=localStorage.getItem(BACKUP_KEY);$('#downloadLegacyBackup').disabled=!backup;
    $('#backupStatus').textContent=backup?'Копия данных до обновления сохранена на этом устройстве. Скачай её для хранения вне браузера.':'Данные хранятся в этом браузере. Скачай JSON-копию, чтобы сохранить их вне устройства.';
    $('#downloadImportBackup').classList.toggle('hidden',!localStorage.getItem(BEFORE_IMPORT_KEY));
  }
  function bindProgressEvents(){
    $('#analyticsPeriod').onclick=e=>{const b=e.target.closest('[data-calendar-period]');if(!b)return;analyticsPeriod=b.dataset.calendarPeriod;$$('[data-calendar-period]').forEach(x=>x.classList.toggle('active',x===b));renderAnalytics();};
    $('#analyticsPrev').onclick=()=>{analyticsPeriod==='year'?analyticsCursor.setFullYear(analyticsCursor.getFullYear()-1):analyticsCursor.setMonth(analyticsCursor.getMonth()-1);renderAnalytics();};
    $('#analyticsNext').onclick=()=>{analyticsPeriod==='year'?analyticsCursor.setFullYear(analyticsCursor.getFullYear()+1):analyticsCursor.setMonth(analyticsCursor.getMonth()+1);renderAnalytics();};
    $('#analyticsToday').onclick=()=>{analyticsCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1,12);renderAnalytics();};
    $('#analyticsSearch').oninput=renderAnalytics;$('#analyticsArchived').onchange=renderAnalytics;$('#habitCellForm').onsubmit=saveHabitCell;
    $('#clearCell').onclick=()=>{const d=$('#habitCellDialog'),id=d.dataset.habitId,date=d.dataset.date;delete state.habitLogs[date]?.[id];save();d.close();refreshAfterData();toast('Отметка очищена');};
    $('#goalFilters').onclick=e=>{const b=e.target.closest('[data-goal-filter]');if(!b)return;goalFilter=b.dataset.goalFilter;$$('[data-goal-filter]').forEach(x=>x.classList.toggle('active',x===b));renderGoals();};
    $('#goalSearch').oninput=renderGoals;$('#goalForm').onsubmit=saveGoal;$('#planStepForm').onsubmit=savePlanStep;
    $('#goalHorizon').onchange=()=>{const p=$('#goalHorizon').value;$('#goalDueWrap').classList.toggle('hidden',p==='none');if(p!=='none'&&p!=='date')$('#goalDue').value=endOfPeriod(p);};
    $('#addGoalStep').onclick=()=>{goalDraftSteps.push({id:uid(),title:'',done:false});renderGoalEditorSteps();$('#goalEditorSteps input:last-of-type')?.focus();};
    $('#goalEditorSteps').oninput=e=>{const s=goalDraftSteps.find(s=>s.id===e.target.dataset.draftStep);if(s)s.title=e.target.value;};
    $('#archiveGoal').onclick=()=>{const g=state.goals.find(g=>g.id===$('#goalId').value);if(!g)return;g.status='archived';save();$('#goalDialog').close();refreshAfterData();toast('Цель перемещена в архив');};
    $('#downloadLegacyBackup').onclick=()=>{const data=localStorage.getItem(BACKUP_KEY);if(data)download(data,'system-before-goals.json','application/json');};
    $('#downloadImportBackup').onclick=()=>{const data=localStorage.getItem(BEFORE_IMPORT_KEY);if(data)download(data,'system-before-import.json','application/json');};
    document.addEventListener('click',e=>{
      const cell=e.target.closest('[data-habit-cell]');if(cell){openHabitCell(cell.dataset.habitCell,cell.dataset.cellDate);return;}
      const fresh=e.target.closest('[data-new-goal]');if(fresh){openGoalDialog();return;}
      const edit=e.target.closest('[data-edit-goal]');if(edit){openGoalDialog(edit.dataset.editGoal);return;}
      const step=e.target.closest('[data-goal-step]');if(step){toggleGoalStep(step.dataset.goalId,step.dataset.goalStep);return;}
      const plan=e.target.closest('[data-plan-step]');if(plan){openPlanStep(plan.dataset.goalId,plan.dataset.planStep);return;}
      const remove=e.target.closest('[data-remove-draft]');if(remove){goalDraftSteps=goalDraftSteps.filter(s=>s.id!==remove.dataset.removeDraft);renderGoalEditorSteps();return;}
      const status=e.target.closest('[data-goal-status]');if(status){const g=state.goals.find(g=>g.id===status.dataset.goalId);if(g){g.status=status.dataset.goalStatus;g.completedAt=g.status==='completed'?Date.now():null;save();refreshAfterData();}}
    });
  }


  function bindEvents(){
    document.addEventListener('click',e=>{
      const view=e.target.closest('[data-view]');if(view){switchView(view.dataset.view);return;}
      const target=e.target.closest('[data-view-target]');if(target){switchView(target.dataset.viewTarget);return;}
      const open=e.target.closest('[data-open]');if(open){if(open.dataset.open==='habit')openHabitDialog();if(open.dataset.open==='task')openTaskDialog(null,currentView==='day'?selectedDay:currentView==='calendar'?dateKey(calendarCursor):todayKey());if(open.dataset.open==='habitSelect')openHabitSelectDialog();return;}
      const close=e.target.closest('[data-close]');if(close){closeDialog(close.dataset.close);return;}
      const action=e.target.closest('[data-habit-action]');if(action){handleHabitAction(action);return;}
      const editHabit=e.target.closest('[data-edit-habit]');if(editHabit){openHabitDialog(editHabit.dataset.editHabit);return;}
      const selectOne=e.target.closest('[data-select-single-habit]');if(selectOne){ensureDate(selectedHabitDate);state.habitSelections[selectedHabitDate][selectOne.dataset.selectSingleHabit]=true;save();renderHabitsToday();renderOverview();return;}
      const toggle=e.target.closest('[data-toggle-task]');if(toggle){toggleTask(toggle.dataset.toggleTask,toggle.dataset.date||selectedDay);return;}
      const editTask=e.target.closest('[data-edit-task]');if(editTask){openTaskDialog(editTask.dataset.editTask);return;}
      const shift=e.target.closest('[data-shift-task]');if(shift){shiftTask(shift.dataset.shiftTask,shift.dataset.shift);return;}
      const day=e.target.closest('[data-open-day]');if(day){selectedDay=day.dataset.openDay;switchView('day');return;}
      const hdate=e.target.closest('[data-history-date]');if(hdate){selectedHistoryDate=hdate.dataset.historyDate;switchView('history');return;}
      const month=e.target.closest('[data-open-month]');if(month){calendarCursor=new Date(calendarYear,Number(month.dataset.openMonth),1,12);calendarMode='month';$$('#calendarTabs button').forEach(b=>b.classList.toggle('active',b.dataset.calendarMode==='month'));renderCalendar();return;}
      const editHistory=e.target.closest('[data-edit-history-habit]');if(editHistory){const h=state.habits.find(x=>x.id===editHistory.dataset.editHistoryHabit);if(!h)return;const raw=prompt(`Значение «${h.name}» за ${prettyDate(selectedHistoryDate)}:`,String(habitValue(selectedHistoryDate,h.id)));if(raw===null)return;const val=Number(raw.replace(',','.'));if(!Number.isFinite(val)||val<0){toast('Некорректное значение');return;}ensureDate(selectedHistoryDate);writeHabitLog(h,selectedHistoryDate,val);save();renderHistory();renderAnalytics();renderHabits();return;}
      const icon=e.target.closest('[data-icon]');if(icon){selectedIcon=icon.dataset.icon;customHabitIcon='';renderIconPicker();return;}
    });
    $('#quickAdd').addEventListener('click',()=>currentView==='goals'?openGoalDialog():currentView==='habits'?openHabitDialog():openTaskDialog(null,currentView==='day'?selectedDay:todayKey()));
    $('#exportQuick').addEventListener('click',exportJson);
    $('#mobileMenu').addEventListener('click',()=>$('#drawer').classList.add('open'));$('#drawerBackdrop').addEventListener('click',()=>$('#drawer').classList.remove('open'));
    $('#habitPeriodTabs').addEventListener('click',e=>{const b=e.target.closest('[data-period]');if(!b)return;habitPeriod=b.dataset.period;$$('#habitPeriodTabs button').forEach(x=>x.classList.toggle('active',x===b));renderHabits();});
    $('#habitDayPrev').onclick=()=>{selectedHabitDate=addDays(selectedHabitDate,-1);renderHabitsToday();};$('#habitDayNext').onclick=()=>{selectedHabitDate=addDays(selectedHabitDate,1);renderHabitsToday();};$('#habitTodayButton').onclick=()=>{selectedHabitDate=todayKey();renderHabitsToday();};$('#habitDateButton').onclick=()=>$('#habitDateInput').showPicker?.();$('#habitDateInput').onchange=e=>{selectedHabitDate=e.target.value;renderHabitsToday();};
    $('#habitMonthPrev').onclick=()=>{habitMonthCursor.setDate(1);habitMonthCursor.setMonth(habitMonthCursor.getMonth()-1);renderHabitMonth();};$('#habitMonthNext').onclick=()=>{habitMonthCursor.setDate(1);habitMonthCursor.setMonth(habitMonthCursor.getMonth()+1);renderHabitMonth();};$('#habitYearPrev').onclick=()=>{habitYearCursor--;renderHabitYear();};$('#habitYearNext').onclick=()=>{habitYearCursor++;renderHabitYear();};$('#habitMonthSelect').onchange=renderHabitMonth;$('#habitYearSelect').onchange=renderHabitYear;$('#habitSearch').oninput=renderHabitsToday;
    $('#dayPrev').onclick=()=>{selectedDay=addDays(selectedDay,-1);renderDay();};$('#dayNext').onclick=()=>{selectedDay=addDays(selectedDay,1);renderDay();};$('#dayToday').onclick=()=>{selectedDay=todayKey();renderDay();};$('#dayDateButton').onclick=()=>$('#dayDateInput').showPicker?.();$('#dayDateInput').onchange=e=>{selectedDay=e.target.value;renderDay();};
    $('#calendarTabs').addEventListener('click',e=>{const b=e.target.closest('[data-calendar-mode]');if(!b)return;calendarMode=b.dataset.calendarMode;$$('#calendarTabs button').forEach(x=>x.classList.toggle('active',x===b));renderCalendar();});
    $('#calendarTaskFilter').addEventListener('click',e=>{const b=e.target.closest('[data-task-filter]');if(!b)return;calendarTaskFilter=b.dataset.taskFilter;$$('#calendarTaskFilter button').forEach(x=>x.classList.toggle('active',x===b));renderCalendar();});
    $('#calendarMonthPrev').onclick=()=>{calendarCursor.setDate(1);calendarCursor.setMonth(calendarCursor.getMonth()-1);renderMonthCalendar();};$('#calendarMonthNext').onclick=()=>{calendarCursor.setDate(1);calendarCursor.setMonth(calendarCursor.getMonth()+1);renderMonthCalendar();};$('#calendarYearPrev').onclick=()=>{calendarYear--;renderYearCalendar();};$('#calendarYearNext').onclick=()=>{calendarYear++;renderYearCalendar();};
    $('#historyDateInput').onchange=e=>{selectedHistoryDate=e.target.value;renderHistory();};$('#historySearch').oninput=renderHistory;
    $('#habitMetric').onchange=updateHabitForm;$('#habitAssignMode').onchange=updateHabitForm;$('#habitSchedule').onchange=updateHabitForm;$('#habitForm').onsubmit=saveHabit;$('#deleteHabit').onclick=deleteHabit;$('#habitSelectForm').onsubmit=saveHabitSelection;
    $('#habitCustomIcon').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{customHabitIcon=await imageToDataUrl(f,300);renderIconPicker();toast('Картинка добавлена');}catch{toast('Не удалось прочитать картинку')}};
    $('#taskTimeMode').onchange=updateTaskForm;$('#taskForm').onsubmit=saveTask;$('#deleteTask').onclick=deleteTask;
    $('#saveName').onclick=()=>{state.settings.appName=$('#appNameInput').value.trim()||'Система';save();applySettings();toast('Название сохранено');};
    $('#themeOptions').addEventListener('click',e=>{const b=e.target.closest('[data-theme]');if(!b)return;state.settings.theme=b.dataset.theme;save();applySettings();});
    $('#backgroundOptions').addEventListener('click',e=>{const b=e.target.closest('[data-bg]');if(!b)return;state.settings.background=b.dataset.bg;state.settings.customBackground='';save();applySettings();});
    $('#customBackground').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state.settings.customBackground=await imageToDataUrl(f,1600);save();applySettings();toast('Фон сохранён');}catch{toast('Не удалось прочитать картинку')}};
    $('#removeBackground').onclick=()=>{state.settings.customBackground='';save();applySettings();};$('#exportJson').onclick=exportJson;$('#exportCsv').onclick=exportCsv;$('#importJson').onchange=importJson;$('#resetData').onclick=resetData;
  }

  function registerServiceWorker(){if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});}
  bindEvents();bindProgressEvents();applySettings();renderAll();registerServiceWorker();
  if(loadError){$('.save-indicator').classList.add('error');$('.save-indicator').textContent='Ошибка чтения данных';toast('Не удалось прочитать сохранение. Исходные данные не изменены.');}
  else if(localStorage.getItem(STORAGE_KEY)){try{save();updateBackupStatus();}catch{}}

})();
