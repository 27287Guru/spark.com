(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE = {tasks:'spark_tasks_v1', days:'spark_days_v1', profile:'spark_profile_v1', mood:'spark_mood_v1'};
  const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast('Your browser could not save this change.'); } };
  const isoToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
  const dateFromISO = value => { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d,12); };
  const formatDate = value => { if (!value) return 'No due date'; const date = dateFromISO(value); const today = isoToday(); const tomorrow = new Date(dateFromISO(today)); tomorrow.setDate(tomorrow.getDate()+1); const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`; if (value === today) return 'Today'; if (value === tomorrowISO) return 'Tomorrow'; return date.toLocaleDateString(undefined,{month:'short',day:'numeric'}); };
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  let tasks = read(STORE.tasks, []), completedDays = read(STORE.days, []), profile = read(STORE.profile, {name:'', intention:'Make a little progress.'}), mood = read(STORE.mood, false);
  let currentView = 'today', currentFilter = 'all', editingId = null, sortMode = 0, toastTimer = null, reminderTimer = null;
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(completedDays)) completedDays = [];
  if (!profile || typeof profile !== 'object') profile = {name:'', intention:'Make a little progress.'};
  if (mood) document.body.classList.add('alt-mood');

  function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
  function openModal(id) { const el = $(id); el.classList.add('open'); el.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; const first = el.querySelector('input,textarea,select'); if (first) setTimeout(() => first.focus(),60); }
  function closeModal(id) { const el = $(id); el.classList.remove('open'); el.setAttribute('aria-hidden','true'); if (!$('taskModal').classList.contains('open') && !$('profileModal').classList.contains('open')) document.body.style.overflow=''; }
  function persistTasks() { save(STORE.tasks,tasks); }
  function persistDays() { save(STORE.days,completedDays); }
  function markTodayIfEarned() {
    const today = isoToday();
    const dueToday = tasks.filter(t => t.due === today);
    if (dueToday.length && dueToday.every(t => t.done) && !completedDays.includes(today)) { completedDays.push(today); persistDays(); }
  }
  function calculateStreak() {
    const wins = new Set(completedDays);
    let cursor = dateFromISO(isoToday()), streak = 0;
    if (!wins.has(isoToday())) cursor.setDate(cursor.getDate()-1);
    for (let i=0;i<370;i++) { const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`; if (!wins.has(key)) break; streak++; cursor.setDate(cursor.getDate()-1); }
    return streak;
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function getViewTasks() {
    const today = isoToday(); let list = [...tasks];
    if (currentView === 'today') list = list.filter(t => t.due === today);
    else if (currentView === 'upcoming') list = list.filter(t => t.due > today && !t.done);
    else if (currentView === 'done') list = list.filter(t => t.done);
    if (currentFilter === 'open') list = list.filter(t => !t.done);
    if (currentFilter === 'done') list = list.filter(t => t.done);
    list.sort((a,b) => {
      if (sortMode === 1) return ({high:0,normal:1,low:2}[a.priority] - {high:0,normal:1,low:2}[b.priority]) || a.due.localeCompare(b.due);
      if (sortMode === 2) return b.createdAt - a.createdAt;
      return Number(a.done)-Number(b.done) || a.due.localeCompare(b.due) || ({high:0,normal:1,low:2}[a.priority]-{high:0,normal:1,low:2}[b.priority]);
    });
    return list;
  }
  function taskCard(task) {
    const overdue = !task.done && task.due < isoToday();
    const priority = task.priority === 'high' ? '<span class="priority-tag">IMPORTANT</span>' : task.priority === 'low' ? '<span class="priority-tag low">LOW PRESSURE</span>' : '';
    const reminder = task.time ? `<span class="reminder-tag">◷ ${escapeHTML(task.time)}</span>` : '';
    const due = `<span class="due-tag ${overdue?'overdue':''}">${overdue?'Overdue · ':''}${escapeHTML(formatDate(task.due))}</span>`;
    return `<article class="task-card ${task.done?'is-done':''}" data-id="${escapeHTML(task.id)}"><button class="task-check" data-action="toggle" aria-label="${task.done?'Mark incomplete':'Mark complete'}">✓</button><div class="task-main"><div class="task-title">${escapeHTML(task.title)}</div><div class="task-meta"><span class="subject-tag">${escapeHTML(task.subject)}</span>${due}${priority}${reminder}</div>${task.notes?`<p class="task-notes">${escapeHTML(task.notes)}</p>`:''}</div><div class="task-actions"><button class="task-action" data-action="edit" title="Edit task" aria-label="Edit task">✎</button><button class="task-action delete" data-action="delete" title="Delete task" aria-label="Delete task">×</button></div></article>`;
  }
  function renderTasks() {
    const list = getViewTasks(); $('taskList').innerHTML = list.map(taskCard).join('');
    $('emptyState').classList.toggle('visible', list.length === 0); $('taskList').style.display = list.length ? 'grid' : 'none';
    const title = {today:"Today's little list",all:'Everything in one place',upcoming:'A little further ahead',done:'Look what you did'}[currentView];
    $('taskSectionTitle').innerHTML = `${title}<span class="title-period">.</span>`;
    $('taskFooterText').textContent = list.length ? `${list.length} ${list.length===1?'thing':'things'} on this page. Take them one at a time.` : 'A list is just a starting point.';
    $('clearDoneBtn').style.visibility = tasks.some(t=>t.done) ? 'visible' : 'hidden';
    document.querySelectorAll('[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === currentView));
    document.querySelectorAll('[data-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === currentFilter));
    $('viewCrumb').textContent = ({today:'TODAY',all:'ALL WORK',upcoming:'COMING UP',done:'FINISHED'})[currentView];
  }
  function renderWeek() {
    const wins = new Set(completedDays), today = dateFromISO(isoToday()); let html = '', count = 0;
    const day = today.getDay(), mondayOffset = (day + 6) % 7; const monday = new Date(today); monday.setDate(today.getDate()-mondayOffset);
    for (let i=0;i<7;i++) { const d = new Date(monday); d.setDate(monday.getDate()+i); const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; const win = wins.has(key); if (win) count++; html += `<div class="week-day ${win?'has-win':''} ${key===isoToday()?'today':''}"><span>${d.toLocaleDateString(undefined,{weekday:'narrow'})}</span><span class="day-dot">${win?'✓':d.getDate()}</span></div>`; }
    $('weekDays').innerHTML = html; $('weekProgress').textContent = `${count} / 7`; const percent = Math.round(count/7*100); $('weekPercent').textContent = `${percent}%`; $('weekRing').style.setProperty('--progress',`${percent}%`);
  }
  function renderStats() {
    markTodayIfEarned(); const open = tasks.filter(t=>!t.done).length, done = tasks.filter(t=>t.done).length, streak = calculateStreak();
    $('openCount').textContent = open; $('completedCount').textContent = done; $('streakCount').textContent = streak; $('todayNavCount').textContent = tasks.filter(t=>t.due===isoToday()&&!t.done).length;
    $('streakHint').textContent = streak ? 'Look at you, showing up.' : 'Every day is a new chance';
    $('headline').innerHTML = profile.name ? `You've got this,<br><span>${escapeHTML(profile.name)}.</span>` : 'Make room<br>for <span>what matters.</span>';
    $('welcomeSub').textContent = open ? `One step at a time. ${open} ${open===1?'task is':'tasks are'} still on your plate.` : 'You don’t have to do it all. Just begin with one thing.';
    $('profileNameLabel').textContent = profile.name || 'Your little corner'; $('avatarInitials').textContent = profile.name ? profile.name.trim().slice(0,1).toUpperCase() : 'S';
    $('intentionDisplay').textContent = profile.intention || 'Make a little progress.';
    $('focusQuote').textContent = ['You can do hard things in small pieces.','Progress counts, even when it is quiet.','Start where you are. Use what you have.','Done is a kindness you can give future-you.'][new Date().getDate()%4];
    const next = tasks.filter(t=>!t.done).sort((a,b)=>a.due.localeCompare(b.due))[0]; $('focusTaskText').textContent = next ? `Try: ${next.title}` : 'Pick one task to begin.';
    renderWeek();
  }
  function render() { renderStats(); renderTasks(); }
  function resetTaskForm() { $('taskForm').reset(); $('taskDue').value = isoToday(); $('taskPriority').value = 'normal'; }
  function showTaskModal(task=null) {
    editingId = task ? task.id : null; resetTaskForm();
    $('modalTitle').innerHTML = task ? 'Edit this task<span class="title-period">.</span>' : 'Add a task<span class="title-period">.</span>';
    $('saveTaskBtn').innerHTML = task ? 'Save changes <span>↗</span>' : 'Save task <span>↗</span>';
    if (task) { $('taskTitle').value=task.title; $('taskSubject').value=task.subject; $('taskPriority').value=task.priority; $('taskDue').value=task.due; $('taskTime').value=task.time||''; $('taskNotes').value=task.notes||''; }
    openModal('taskModal');
  }
  function showProfileModal() { $('userName').value=profile.name||''; $('userIntention').value=profile.intention||''; openModal('profileModal'); }
  function addOrEditTask(event) {
    event.preventDefault(); const title = $('taskTitle').value.trim(); if (!title) { $('taskTitle').focus(); return; }
    const data = {title,subject:$('taskSubject').value,priority:$('taskPriority').value,due:$('taskDue').value||isoToday(),time:$('taskTime').value,notes:$('taskNotes').value.trim()};
    if (editingId) { const old = tasks.find(t=>t.id===editingId); if (old) Object.assign(old,data); showToast('Task updated. Nice and easy.'); }
    else { tasks.push({...data,id:uid(),done:false,createdAt:Date.now()}); showToast('Task added. One step closer.'); }
    persistTasks(); closeModal('taskModal'); currentView='all'===currentView && false ? 'all' : currentView; render();
  }
  function handleTaskAction(event) {
    const button = event.target.closest('[data-action]'); if (!button) return; const card = button.closest('.task-card'); if (!card) return; const task = tasks.find(t=>t.id===card.dataset.id); if (!task) return;
    if (button.dataset.action==='toggle') { task.done=!task.done; if (task.done) { const today=isoToday(); if (!completedDays.includes(today)) completedDays.push(today); persistDays(); showToast('A little win. Give yourself credit.'); } else showToast('Moved back to your list.'); persistTasks(); render(); }
    if (button.dataset.action==='edit') showTaskModal(task);
    if (button.dataset.action==='delete') { if (confirm(`Delete “${task.title}”?`)) { tasks=tasks.filter(t=>t.id!==task.id); persistTasks(); render(); showToast('Task removed.'); } }
  }
  function setView(view) { currentView=view; currentFilter='all'; renderTasks(); document.querySelector('.tasks-panel').scrollIntoView({behavior:'smooth',block:'start'}); }
  function checkReminders() {
    if (!('Notification' in window) || Notification.permission!=='granted') return;
    const now = new Date(), today=isoToday(), time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    tasks.forEach(task => { const key=`${task.id}:${today}:${task.time}`; if (!task.done && task.due===today && task.time===time && !read('spark_reminded_v1',{})[key]) { try { new Notification('A little Spark reminder',{body:task.title,tag:key}); } catch {} const sent=read('spark_reminded_v1',{}); sent[key]=true; save('spark_reminded_v1',sent); } });
  }
  async function enableReminders() { if (!('Notification' in window)) { showToast('This browser does not support notifications.'); return; } try { const permission=await Notification.requestPermission(); if (permission==='granted') { showToast('Reminders enabled while Spark is open.'); checkReminders(); } else showToast('Notifications are still off in your browser settings.'); } catch { showToast('Could not enable notifications in this browser.'); } }

  $('datePill').textContent = new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}).toUpperCase();
  $('addTaskBtn').addEventListener('click',()=>showTaskModal()); $('quickAddBtn').addEventListener('click',()=>showTaskModal()); $('emptyAddBtn').addEventListener('click',()=>showTaskModal());
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{currentFilter=btn.dataset.filter;renderTasks();}));
  $('sortBtn').addEventListener('click',()=>{sortMode=(sortMode+1)%3; $('sortBtn').innerHTML=['Sort: Due date <span>⌄</span>','Sort: Importance <span>⌄</span>','Sort: Recently added <span>⌄</span>'][sortMode]; renderTasks();});
  $('taskList').addEventListener('click',handleTaskAction); $('taskForm').addEventListener('submit',addOrEditTask);
  $('profileBtn').addEventListener('click',showProfileModal); $('intentionBtn').addEventListener('click',showProfileModal); $('editIntentionBtn').addEventListener('click',showProfileModal);
  $('profileForm').addEventListener('submit',event=>{event.preventDefault();profile={name:$('userName').value.trim(),intention:$('userIntention').value.trim()||'Make a little progress.'};save(STORE.profile,profile);closeModal('profileModal');render();showToast('Your space, your way.');});
  document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeModal(backdrop.id);}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeModal('taskModal');closeModal('profileModal');} if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();showTaskModal();}});
  $('themeBtn').addEventListener('click',()=>{mood=!mood;document.body.classList.toggle('alt-mood',mood);save(STORE.mood,mood);showToast(mood?'Periwinkle mood, on.':'Back to lavender.');});
  $('focusBtn').addEventListener('click',()=>{const next=tasks.filter(t=>!t.done).sort((a,b)=>a.due.localeCompare(b.due))[0];if(!next){showToast('Nothing waiting right now. Enjoy the breathing room.');return;}currentView='all';currentFilter='open';renderTasks();const card=document.querySelector(`.task-card[data-id="${CSS.escape(next.id)}"]`);if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.borderColor='#a391d0';setTimeout(()=>card.style.borderColor='',1600);}showToast(`Your next little step: ${next.title}`);});
  $('clearDoneBtn').addEventListener('click',()=>{const count=tasks.filter(t=>t.done).length;if(!count)return;if(confirm(`Remove ${count} finished ${count===1?'task':'tasks'} from your list?`)){tasks=tasks.filter(t=>!t.done);persistTasks();render();showToast('Finished tasks cleared. Your wins stay counted.');}});
  // Enable reminders through the reminder time field: the browser asks permission when a time is entered.
  $('taskTime').addEventListener('change',()=>{if($('taskTime').value) enableReminders();});
  render();
  reminderTimer=setInterval(checkReminders,15000); checkReminders();
})();
