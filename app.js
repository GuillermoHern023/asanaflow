/**
 * AsanaFlow — Personal Work, Deadlines & Google Calendar Hub
 * Designed to run 100% client-side on GitHub Pages with:
 *  - Asana List, Kanban Board, Calendar & Overview Views
 *  - 1-Click Google Calendar Template Links + .ics Import/Export
 *  - Full 2-Way Google Calendar REST API v3 OAuth 2.0 Sync
 *  - LocalStorage + JSON Backup + Optional GitHub Gist Cloud Sync
 */

const STORAGE_KEY = 'asanaflow_workspace_v1';

// Helper to format YYYY-MM-DD in local time
function toLocalDateString(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const DEMO_TASK_IDS = ['task_1', 'task_2', 'task_3', 'task_4', 'task_5', 'task_6'];
const DEMO_PROJECT_IDS = ['proj_personal', 'proj_work', 'proj_study', 'proj_web'];

// Clean default state (starts fresh with your own "To do list" project and no fake template tasks)
function createDefaultState() {
  return {
    projects: [
      { id: 'proj_todo', name: 'To do list', icon: '🚀', color: '#f06a6a' }
    ],
    tasks: [],
    externalEvents: [], // Imported .ics or Google Calendar API events
    settings: {
      theme: 'system', // 'system' | 'light' | 'dark'
      listGroupBy: 'section', // 'section' | 'status' | 'project'
      collapsedSections: {},
      gcalClientId: '',
      gcalCalendarId: 'primary',
      gistToken: '',
      gistId: '',
      cleanedTemplateV2: true
    }
  };
}

// Application Runtime State
let state = loadState();
let activeView = 'overview'; // 'overview' | 'list' | 'board' | 'calendar'
let selectedProjectId = state.projects.length === 1 ? state.projects[0].id : 'all';
let searchQuery = '';
let priorityFilter = 'all';
let statusFilter = 'all';
let activeDrawerTaskId = null;
let calendarCursorDate = new Date();
let googleTokenClient = null;
let googleAccessToken = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    const merged = {
      ...createDefaultState(),
      ...parsed,
      settings: {
        ...createDefaultState().settings,
        ...(parsed.settings || {})
      }
    };

    // Always strip any legacy template tasks & template projects while keeping user projects ("To do list") and user tasks
    const beforeTasksLen = (merged.tasks || []).length;
    const beforeProjsLen = (merged.projects || []).length;
    merged.tasks = (merged.tasks || []).filter((t) => !DEMO_TASK_IDS.includes(t.id));
    merged.projects = (merged.projects || []).filter((p) => !DEMO_PROJECT_IDS.includes(p.id));
    if (merged.projects.length === 0) {
      merged.projects = [{ id: 'proj_todo', name: 'To do list', icon: '🚀', color: '#f06a6a' }];
    }
    if (merged.tasks.length !== beforeTasksLen || merged.projects.length !== beforeProjsLen) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }

    return merged;
  } catch (err) {
    console.error('Failed to load state from localStorage:', err);
    return createDefaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

// ==========================================================================
// Modern Web Guidance Compliance Helpers
// ==========================================================================

/**
 * Fallback for browsers without <dialog closedby="any"> support
 */
function setupDialogLightDismissFallbacks() {
  const dialogs = document.querySelectorAll('dialog.app-dialog');
  dialogs.forEach((dialog) => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    }
  });

  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dialogId = btn.getAttribute('data-close-dialog');
      const dialog = document.getElementById(dialogId);
      if (dialog) dialog.close();
    });
  });
}

/**
 * Attach IME-safe Enter-to-submit handler on single-line or multiline inputs
 */
function attachImeSafeEnterSubmit(inputElement, formElement, isMultiline = false) {
  if (!inputElement || !formElement) return;
  inputElement.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (!isMultiline || !event.shiftKey)) {
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      formElement.requestSubmit();
    }
  });
}

// ==========================================================================
// Theme & Date Utilities
// ==========================================================================

function applyTheme() {
  const root = document.documentElement;
  const mode = state.settings.theme || 'system';
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode);
  } else {
    root.removeAttribute('data-theme');
  }
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    const labels = { system: '🌗 Auto', light: '☀️ Light', dark: '🌙 Dark' };
    btn.textContent = labels[mode] || '🌗 Theme';
  }
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const idx = order.indexOf(state.settings.theme || 'system');
  state.settings.theme = order[(idx + 1) % order.length];
  saveState();
  applyTheme();
  showToast(`Theme set to ${state.settings.theme}`);
}

function getDeadlineStatus(dueDateStr, completed) {
  if (!dueDateStr) return { code: 'none', label: 'No date', className: '' };
  const todayStr = toLocalDateString(new Date());
  if (completed) {
    return { code: 'completed', label: formatHumanDate(dueDateStr), className: '' };
  }
  if (dueDateStr < todayStr) {
    return { code: 'overdue', label: `Overdue • ${formatHumanDate(dueDateStr)}`, className: 'overdue' };
  }
  if (dueDateStr === todayStr) {
    return { code: 'today', label: 'Today', className: 'due-today' };
  }
  const tomorrowStr = addDays(new Date(), 1);
  if (dueDateStr === tomorrowStr) {
    return { code: 'tomorrow', label: 'Tomorrow', className: '' };
  }
  return { code: 'upcoming', label: formatHumanDate(dueDateStr), className: '' };
}

function formatHumanDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getProjectById(projectId) {
  return (
    state.projects.find((p) => p.id === projectId) || {
      id: 'proj_personal',
      name: 'General',
      icon: '📌',
      color: '#64748b'
    }
  );
}

function getFilteredTasks() {
  const todayStr = toLocalDateString(new Date());
  return state.tasks.filter((task) => {
    if (selectedProjectId !== 'all' && task.projectId !== selectedProjectId) {
      return false;
    }
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
      return false;
    }
    if (statusFilter === 'active' && task.completed) {
      return false;
    }
    if (statusFilter === 'completed' && !task.completed) {
      return false;
    }
    if (statusFilter === 'overdue') {
      if (task.completed || !task.dueDate || task.dueDate > todayStr) return false;
    }
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const proj = getProjectById(task.projectId);
      const inTitle = task.title.toLowerCase().includes(q);
      const inDesc = (task.description || '').toLowerCase().includes(q);
      const inTags = (task.tags || []).some((t) => t.toLowerCase().includes(q));
      const inProj = proj.name.toLowerCase().includes(q);
      if (!inTitle && !inDesc && !inTags && !inProj) return false;
    }
    return true;
  });
}

// ==========================================================================
// Google Calendar Deep-Link, .ICS Generator/Parser & Live REST API v3
// ==========================================================================

/**
 * Generates a 1-click Google Calendar Template URL for any task
 */
function buildGoogleCalendarTemplateUrl(task) {
  const title = encodeURIComponent(`[AsanaFlow] ${task.title}`);
  const proj = getProjectById(task.projectId);
  const subtaskLines =
    task.subtasks && task.subtasks.length
      ? '\n\nSubtasks:\n' + task.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`).join('\n')
      : '';
  const details = encodeURIComponent(
    `Project: ${proj.icon} ${proj.name}\nPriority: ${task.priority.toUpperCase()}\n\n${
      task.description || ''
    }${subtaskLines}`
  );

  const dateBase = task.dueDate || toLocalDateString(new Date());
  const cleanDate = dateBase.replace(/-/g, '');

  let datesParam = '';
  if (task.dueTime && task.duration !== 'allday') {
    const [hh, mm] = task.dueTime.split(':').map(Number);
    const [y, m, d] = dateBase.split('-').map(Number);
    const startObj = new Date(y, m - 1, d, hh || 9, mm || 0, 0);
    const durationMins = parseInt(task.duration || '60', 10) || 60;
    const endObj = new Date(startObj.getTime() + durationMins * 60000);

    const toGcalUtc = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    datesParam = `${toGcalUtc(startObj)}/${toGcalUtc(endObj)}`;
  } else {
    // All-day event (end date is exclusive in Google Calendar)
    const [y, m, d] = dateBase.split('-').map(Number);
    const nextDay = new Date(y, m - 1, d + 1);
    const cleanNext = toLocalDateString(nextDay).replace(/-/g, '');
    datesParam = `${cleanDate}/${cleanNext}`;
  }

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}`;
}

/**
 * Build RFC 5545 .ics file content for one or more tasks
 */
function generateIcsContent(tasksList) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AsanaFlow//GitHub Pages Task Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  tasksList.forEach((task) => {
    if (!task.dueDate) return;
    const cleanDate = task.dueDate.replace(/-/g, '');
    const proj = getProjectById(task.projectId);
    const summary = escapeIcsText(`${task.completed ? '[DONE] ' : ''}${task.title} (${proj.name})`);
    const desc = escapeIcsText(task.description || `Priority: ${task.priority}`);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@asanaflow.github.io`);
    lines.push(`DTSTAMP:${nowStamp}`);

    if (task.dueTime && task.duration !== 'allday') {
      const [hh, mm] = task.dueTime.split(':').map(Number);
      const [y, m, d] = task.dueDate.split('-').map(Number);
      const startObj = new Date(y, m - 1, d, hh || 9, mm || 0, 0);
      const durationMins = parseInt(task.duration || '60', 10) || 60;
      const endObj = new Date(startObj.getTime() + durationMins * 60000);
      const toUtc = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      lines.push(`DTSTART:${toUtc(startObj)}`);
      lines.push(`DTEND:${toUtc(endObj)}`);
    } else {
      const [y, m, d] = task.dueDate.split('-').map(Number);
      const nextDayStr = toLocalDateString(new Date(y, m - 1, d + 1)).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${cleanDate}`);
      lines.push(`DTEND;VALUE=DATE:${nextDayStr}`);
    }

    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:${desc}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parse imported .ics file into external calendar events
 */
function parseIcsFileContent(icsText) {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const rawEvents = unfolded.split('BEGIN:VEVENT').slice(1);
  const parsedEvents = [];

  rawEvents.forEach((chunk, index) => {
    const body = chunk.split('END:VEVENT')[0] || '';
    const lines = body.split(/\r?\n/);
    let summary = 'Calendar Event';
    let dtStartRaw = '';
    let uid = `ics_${Date.now()}_${index}`;
    let htmlLink = '';

    lines.forEach((line) => {
      if (line.startsWith('SUMMARY')) {
        const parts = line.split(':');
        summary = parts.slice(1).join(':').replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
      } else if (line.startsWith('DTSTART')) {
        const parts = line.split(':');
        dtStartRaw = (parts[1] || '').trim();
      } else if (line.startsWith('UID:')) {
        uid = line.slice(4).trim();
      } else if (line.startsWith('URL:')) {
        htmlLink = line.slice(4).trim();
      }
    });

    if (dtStartRaw.length >= 8) {
      const y = dtStartRaw.slice(0, 4);
      const m = dtStartRaw.slice(4, 6);
      const d = dtStartRaw.slice(6, 8);
      let timeStr = '';
      if (dtStartRaw.includes('T') && dtStartRaw.length >= 13) {
        const hh = dtStartRaw.slice(9, 11);
        const mm = dtStartRaw.slice(11, 13);
        timeStr = `${hh}:${mm}`;
      }
      parsedEvents.push({
        id: uid,
        title: summary || 'Untitled Event',
        date: `${y}-${m}-${d}`,
        time: timeStr,
        source: 'ics',
        htmlLink
      });
    }
  });

  return parsedEvents;
}

// ==========================================================================
// Live Google Calendar API v3 (OAuth 2.0 via Google Identity Services)
// ==========================================================================

function updateGcalStatusUi() {
  const dot = document.getElementById('gcalStatusDot');
  const title = document.getElementById('gcalStatusText');
  const sub = document.getElementById('gcalStatusSub');
  const modalBadge = document.getElementById('modalGcalApiBadge');
  const importedCountEl = document.getElementById('importedEventsCountLabel');

  if (importedCountEl) {
    importedCountEl.textContent = String(state.externalEvents.length);
  }

  const isConnected = Boolean(googleAccessToken);
  if (dot) dot.classList.toggle('connected', isConnected);
  if (title) {
    title.textContent = isConnected ? 'Google Calendar Connected' : 'Google Calendar';
  }
  if (sub) {
    sub.textContent = isConnected
      ? `Live 2-way sync active (${state.externalEvents.length} events loaded)`
      : `1-Click & .ics ready (${state.externalEvents.length} events) • Connect API for 2-way sync`;
  }
  if (modalBadge) {
    modalBadge.textContent = isConnected ? 'Connected (Live OAuth)' : 'Not Connected';
    modalBadge.className = `badge-pill ${isConnected ? 'badge-ready' : ''}`;
  }
}

function connectGoogleCalendarOAuth() {
  const clientId = (state.settings.gcalClientId || '').trim();
  if (!clientId) {
    showToast('Please paste your Google OAuth 2.0 Client ID first.');
    const modal = document.getElementById('gcalModal');
    if (modal && !modal.open) modal.showModal();
    return;
  }

  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    showToast('Google Identity Services script is still loading. Check your internet connection.');
    return;
  }

  try {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          googleAccessToken = tokenResponse.access_token;
          updateGcalStatusUi();
          showToast('✅ Connected to Google Calendar! Fetching upcoming events...');
          await fetchGoogleCalendarEvents();
        } else {
          showToast('Google authorization did not return an access token.');
        }
      }
    });

    googleTokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (err) {
    console.error('Google OAuth Init Error:', err);
    showToast(`OAuth error: ${err.message}`);
  }
}

async function fetchGoogleCalendarEvents() {
  if (!googleAccessToken) {
    connectGoogleCalendarOAuth();
    return;
  }

  const calId = encodeURIComponent(state.settings.gcalCalendarId || 'primary');
  const timeMin = new Date(Date.now() - 14 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 86400000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}&maxResults=200`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${googleAccessToken}` }
    });
    if (!res.ok) {
      throw new Error(`Google Calendar API returned ${res.status}`);
    }
    const data = await res.json();
    const apiEvents = (data.items || [])
      .filter((item) => item.status !== 'cancelled')
      .map((item) => {
        const startRaw = (item.start && (item.start.dateTime || item.start.date)) || '';
        const datePart = startRaw.slice(0, 10);
        let timePart = '';
        if (startRaw.includes('T')) {
          const dt = new Date(startRaw);
          timePart = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        return {
          id: item.id,
          title: item.summary || '(No title)',
          date: datePart,
          time: timePart,
          source: 'gcal_api',
          htmlLink: item.htmlLink || ''
        };
      });

    // Keep any manually imported .ics events and replace previous gcal_api events
    const icsEvents = state.externalEvents.filter((e) => e.source === 'ics');
    state.externalEvents = [...icsEvents, ...apiEvents];
    saveState();
    updateGcalStatusUi();
    renderAll();
    showToast(`📅 Synced ${apiEvents.length} events from Google Calendar!`);
  } catch (err) {
    console.error('Error fetching Google Calendar events:', err);
    showToast(`Failed to fetch events: ${err.message}`);
  }
}

async function pushTaskToGoogleCalendarApi(task) {
  if (!task.dueDate) {
    showToast('Please set a Due Date on this task before syncing to Google Calendar.');
    return false;
  }

  if (!googleAccessToken) {
    // Fallback: if API isn't connected, open the 1-click Google Calendar template URL
    window.open(buildGoogleCalendarTemplateUrl(task), '_blank', 'noopener');
    showToast('Opened task in Google Calendar tab (connect OAuth Client ID for background API sync).');
    return false;
  }

  const calId = encodeURIComponent(state.settings.gcalCalendarId || 'primary');
  const proj = getProjectById(task.projectId);
  const eventPayload = {
    summary: `[AsanaFlow] ${task.title}`,
    description: `Project: ${proj.name} | Priority: ${task.priority}\n\n${task.description || ''}`
  };

  if (task.dueTime && task.duration !== 'allday') {
    const [hh, mm] = task.dueTime.split(':').map(Number);
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const startObj = new Date(y, m - 1, d, hh || 9, mm || 0, 0);
    const durationMins = parseInt(task.duration || '60', 10) || 60;
    const endObj = new Date(startObj.getTime() + durationMins * 60000);
    eventPayload.start = { dateTime: startObj.toISOString() };
    eventPayload.end = { dateTime: endObj.toISOString() };
  } else {
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const nextDayStr = toLocalDateString(new Date(y, m - 1, d + 1));
    eventPayload.start = { date: task.dueDate };
    eventPayload.end = { date: nextDayStr };
  }

  try {
    const isUpdate = Boolean(task.gcalEventId);
    const endpoint = isUpdate
      ? `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(task.gcalEventId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`;

    const res = await fetch(endpoint, {
      method: isUpdate ? 'PUT' : 'POST',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });

    if (!res.ok) {
      throw new Error(`Calendar API returned ${res.status}`);
    }

    const created = await res.json();
    task.gcalEventId = created.id;
    saveState();
    renderAll();
    showToast(`✅ Synced "${task.title}" to Google Calendar!`);
    return true;
  } catch (err) {
    console.error('Failed to push task to Google Calendar:', err);
    showToast(`Calendar API sync error: ${err.message}`);
    return false;
  }
}

async function pushAllTasksToGoogleCalendar() {
  const tasksWithDates = state.tasks.filter((t) => t.dueDate && !t.completed);
  if (tasksWithDates.length === 0) {
    showToast('No active tasks with due dates to push.');
    return;
  }
  if (!googleAccessToken) {
    showToast('Connect your Google OAuth Client ID first, or use "Export All Tasks (.ics)".');
    const modal = document.getElementById('gcalModal');
    if (modal && !modal.open) modal.showModal();
    return;
  }
  let count = 0;
  for (const t of tasksWithDates) {
    const ok = await pushTaskToGoogleCalendarApi(t);
    if (ok) count++;
  }
  await fetchGoogleCalendarEvents();
  showToast(`🎉 Pushed ${count} task deadlines to Google Calendar!`);
}

// ==========================================================================
// Task CRUD & Recurrence Logic
// ==========================================================================

function toggleTaskCompletion(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;
  if (task.completed) {
    task.status = 'done';
    // If recurring, automatically spawn the next occurrence!
    if (task.recurrence && task.recurrence !== 'none' && task.dueDate) {
      const [y, m, d] = task.dueDate.split('-').map(Number);
      const base = new Date(y, m - 1, d);
      if (task.recurrence === 'daily') base.setDate(base.getDate() + 1);
      else if (task.recurrence === 'weekly') base.setDate(base.getDate() + 7);
      else if (task.recurrence === 'biweekly') base.setDate(base.getDate() + 14);
      else if (task.recurrence === 'monthly') base.setMonth(base.getMonth() + 1);

      const nextTask = {
        ...JSON.parse(JSON.stringify(task)),
        id: generateId('task'),
        dueDate: toLocalDateString(base),
        completed: false,
        status: 'todo',
        section: 'upcoming',
        gcalEventId: null,
        subtasks: (task.subtasks || []).map((s) => ({ ...s, done: false })),
        createdAt: Date.now()
      };
      state.tasks.unshift(nextTask);
      showToast(`🔁 Completed & scheduled next ${task.recurrence} task for ${formatHumanDate(nextTask.dueDate)}`);
    } else {
      showToast(`✅ Completed "${task.title}"`);
    }
  } else {
    if (task.status === 'done') task.status = 'todo';
  }

  saveState();
  renderAll();
  if (activeDrawerTaskId === taskId) {
    openTaskDrawer(taskId);
  }
}

function createNewTask(taskData) {
  const newTask = {
    id: generateId('task'),
    title: taskData.title.trim(),
    projectId: taskData.projectId || (state.projects[0] && state.projects[0].id) || 'proj_personal',
    section: taskData.section || 'upcoming',
    status: taskData.status || 'todo',
    priority: taskData.priority || 'medium',
    dueDate: taskData.dueDate || '',
    dueTime: taskData.dueTime || '',
    duration: taskData.duration || '60',
    recurrence: taskData.recurrence || 'none',
    tags: Array.isArray(taskData.tags)
      ? taskData.tags
      : String(taskData.tags || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    description: taskData.description || '',
    completed: taskData.status === 'done',
    gcalEventId: null,
    subtasks: taskData.subtasks || [],
    createdAt: Date.now()
  };

  state.tasks.unshift(newTask);
  saveState();
  renderAll();
  showToast(`Added task "${newTask.title}"`);
  return newTask;
}

function deleteTask(taskId) {
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  const removed = state.tasks.splice(idx, 1)[0];
  if (activeDrawerTaskId === taskId) {
    closeTaskDrawer();
  }
  saveState();
  renderAll();
  showToast(`🗑️ Deleted "${removed.title}"`);
}

// ==========================================================================
// Rendering Engine (Sidebar, Overview, List, Kanban Board, Calendar, Drawer)
// ==========================================================================

function deleteProject(projectId) {
  if (state.projects.length <= 1) {
    showToast('You must keep at least one project.');
    return;
  }
  const idx = state.projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return;
  const removed = state.projects.splice(idx, 1)[0];
  state.tasks = state.tasks.filter((t) => t.projectId !== projectId);
  if (selectedProjectId === projectId) {
    selectedProjectId = state.projects[0].id;
  }
  saveState();
  renderAll();
  showToast(`🗑️ Deleted project "${removed.name}" and its tasks`);
}

function renderAll() {
  renderTopbarAndSidebar();
  renderOverviewView();
  renderListView();
  renderKanbanBoardView();
  renderCalendarView();
  updateGcalStatusUi();
}

function renderTopbarAndSidebar() {
  const now = new Date();
  const dateDisplay = document.getElementById('currentDateDisplay');
  if (dateDisplay) {
    dateDisplay.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Pending & Due Soon badges (scoped to filtered project if selected)
  const todayStr = toLocalDateString(now);
  const allActiveTasks = state.tasks.filter((t) => !t.completed);
  const scopedActiveTasks =
    selectedProjectId === 'all'
      ? allActiveTasks
      : allActiveTasks.filter((t) => t.projectId === selectedProjectId);
  const dueOrOverdue = scopedActiveTasks.filter((t) => t.dueDate && t.dueDate <= todayStr);

  const badgePending = document.getElementById('badgePendingCount');
  if (badgePending) badgePending.textContent = String(scopedActiveTasks.length);

  const badgeUrgent = document.getElementById('badgeDueSoonCount');
  if (badgeUrgent) {
    badgeUrgent.hidden = dueOrOverdue.length === 0;
    badgeUrgent.textContent = String(dueOrOverdue.length);
  }

  // Active Project Filter Pill
  const filterPill = document.getElementById('activeProjectPill');
  const filterPillName = document.getElementById('activeProjectPillName');
  if (filterPill && filterPillName) {
    if (selectedProjectId === 'all') {
      filterPill.hidden = true;
    } else {
      const proj = getProjectById(selectedProjectId);
      filterPill.hidden = false;
      filterPillName.textContent = `${proj.icon} ${proj.name}`;
    }
  }

  // Sidebar Project List
  const projContainer = document.getElementById('sidebarProjectList');
  if (projContainer) {
    projContainer.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `project-nav-item ${selectedProjectId === 'all' ? 'active' : ''}`;
    allBtn.innerHTML = `
      <span class="project-color-dot" style="background-color: #94a3b8"></span>
      <span>All Projects</span>
      <span class="project-count">${allActiveTasks.length}</span>
    `;
    allBtn.addEventListener('click', () => {
      selectedProjectId = 'all';
      renderAll();
    });
    projContainer.appendChild(allBtn);

    state.projects.forEach((proj) => {
      const count = allActiveTasks.filter((t) => t.projectId === proj.id).length;
      const item = document.createElement('div');
      item.className = `project-nav-item ${selectedProjectId === proj.id ? 'active' : ''}`;
      item.innerHTML = `
        <span class="project-color-dot" style="background-color: ${proj.color}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(proj.icon)} ${escapeHtml(proj.name)}</span>
        <span class="project-count">${count}</span>
        ${
          state.projects.length > 1
            ? `<button type="button" class="proj-del-btn" title="Delete project" aria-label="Delete project ${escapeHtml(proj.name)}" style="border:none;background:transparent;color:#9ca3af;cursor:pointer;padding:0 4px;font-size:0.75rem;">✕</button>`
            : ''
        }
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.proj-del-btn')) return;
        selectedProjectId = proj.id;
        renderAll();
      });
      const delBtn = item.querySelector('.proj-del-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteProject(proj.id);
        });
      }
      projContainer.appendChild(item);
    });
  }

  // Populate Project <select> dropdowns across forms and sync with selectedProjectId
  const selectIds = ['quickTaskProject', 'drawerTaskProject', 'modalTaskProject'];
  selectIds.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prevValue = sel.value;
    sel.innerHTML = state.projects
      .map((p) => `<option value="${p.id}">${escapeHtml(p.icon)} ${escapeHtml(p.name)}</option>`)
      .join('');
    if (selectedProjectId !== 'all' && id !== 'drawerTaskProject' && state.projects.some((p) => p.id === selectedProjectId)) {
      sel.value = selectedProjectId;
    } else if (prevValue && state.projects.some((p) => p.id === prevValue)) {
      sel.value = prevValue;
    }
  });
}

function renderOverviewView() {
  const todayStr = toLocalDateString(new Date());
  const nextWeekStr = addDays(new Date(), 7);

  // Respect active project and topbar filters on Home & Overview!
  const allTasks = getFilteredTasks();
  const active = allTasks.filter((t) => !t.completed);
  const overdue = active.filter((t) => t.dueDate && t.dueDate < todayStr);
  const dueToday = active.filter((t) => t.dueDate === todayStr);
  const dueWeek = active.filter((t) => t.dueDate && t.dueDate >= todayStr && t.dueDate <= nextWeekStr);
  const completed = allTasks.filter((t) => t.completed);
  const rate = allTasks.length ? Math.round((completed.length / allTasks.length) * 100) : 0;

  setText('statOverdueCount', overdue.length);
  setText('statDueTodayCount', dueToday.length);
  setText('statWeekCount', dueWeek.length);
  setText('statCompletedCount', completed.length);
  setText('statCompletionRate', `${rate}% of ${allTasks.length} total tasks`);

  // Left Card: Urgent & Due Soon Tasks
  const urgentList = document.getElementById('overviewUrgentList');
  if (urgentList) {
    const sorted = [...active]
      .sort((a, b) => {
        const da = a.dueDate || '9999-12-31';
        const db = b.dueDate || '9999-12-31';
        if (da !== db) return da.localeCompare(db);
        const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      })
      .slice(0, 6);

    if (sorted.length === 0) {
      urgentList.innerHTML = `<p class="toolbar-hint">🎉 All caught up! Use the quick bar above to add a task.</p>`;
    } else {
      urgentList.innerHTML = '';
      sorted.forEach((task) => {
        urgentList.appendChild(createCompactTaskRow(task));
      });
    }
  }

  // Right Card: Merged Google Calendar & Deadlines Feed
  const agendaList = document.getElementById('overviewAgendaList');
  if (agendaList) {
    const combined = [
      ...active
        .filter((t) => t.dueDate)
        .map((t) => ({
          type: 'task',
          id: t.id,
          title: t.title,
          date: t.dueDate,
          time: t.dueTime || '',
          taskRef: t
        })),
      ...state.externalEvents.map((ev) => ({
        type: 'gcal',
        id: ev.id,
        title: ev.title,
        date: ev.date,
        time: ev.time || '',
        htmlLink: ev.htmlLink || ''
      }))
    ]
      .filter((item) => item.date >= addDays(new Date(), -1))
      .sort((a, b) => `${a.date}T${a.time || '23:59'}`.localeCompare(`${b.date}T${b.time || '23:59'}`))
      .slice(0, 7);

    if (combined.length === 0) {
      agendaList.innerHTML = `<p class="toolbar-hint">No upcoming deadlines or Google Calendar events yet.</p>`;
    } else {
      agendaList.innerHTML = '';
      combined.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'agenda-item';
        const isTask = item.type === 'task';
        row.innerHTML = `
          <div>
            <div style="font-weight: 600; font-size: 0.88rem;">
              ${isTask ? '📌' : '📅'} ${escapeHtml(item.title)}
            </div>
            <div style="font-size: 0.76rem; color: var(--text-secondary);">
              ${formatHumanDate(item.date)} ${item.time ? `• ${escapeHtml(item.time)}` : ''} • ${
          isTask ? 'Asana Task' : 'Google Calendar'
        }
            </div>
          </div>
          <div>
            ${
              isTask
                ? `<a href="${buildGoogleCalendarTemplateUrl(
                    item.taskRef
                  )}" target="_blank" rel="noopener" class="gcal-mini-link" title="Add to Google Calendar">+GCal</a>`
                : `<span class="badge-pill" style="background:rgba(26,115,232,0.14);color:var(--gcal-blue)">Synced</span>`
            }
          </div>
        `;
        row.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          if (isTask) openTaskDrawer(item.id);
          else if (item.htmlLink) window.open(item.htmlLink, '_blank', 'noopener');
        });
        agendaList.appendChild(row);
      });
    }
  }

  // Projects Progress Grid
  const projGrid = document.getElementById('overviewProjectsGrid');
  if (projGrid) {
    projGrid.innerHTML = '';
    state.projects.forEach((proj) => {
      const projTasks = state.tasks.filter((t) => t.projectId === proj.id);
      const doneCount = projTasks.filter((t) => t.completed).length;
      const pct = projTasks.length ? Math.round((doneCount / projTasks.length) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'project-summary-card';
      card.innerHTML = `
        <div class="project-summary-top">
          <span class="project-color-dot" style="background-color: ${proj.color}"></span>
          <span>${escapeHtml(proj.icon)} ${escapeHtml(proj.name)}</span>
        </div>
        <div class="project-summary-stats">
          <span>${doneCount} / ${projTasks.length} completed</span>
          <span>${pct}%</span>
        </div>
        <progress max="100" value="${pct}">${pct}%</progress>
      `;
      card.addEventListener('click', () => {
        selectedProjectId = proj.id;
        switchView('list');
      });
      projGrid.appendChild(card);
    });
  }
}

function createCompactTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'agenda-item';
  const deadline = getDeadlineStatus(task.dueDate, task.completed);
  const proj = getProjectById(task.projectId);

  row.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;min-width:0;">
      <button type="button" class="task-check-btn ${task.completed ? 'checked' : ''}" aria-label="Toggle task complete">✓</button>
      <div style="min-width:0;">
        <div style="font-weight:600;font-size:0.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${escapeHtml(task.title)}
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:3px;flex-wrap:wrap;">
          <span class="badge-pill badge-project">${escapeHtml(proj.icon)} ${escapeHtml(proj.name)}</span>
          <span class="badge-pill badge-priority-${task.priority}">${task.priority}</span>
          ${
            task.dueDate
              ? `<span class="badge-pill badge-due ${deadline.className}">📅 ${deadline.label}${
                  task.dueTime ? ' ' + task.dueTime : ''
                }</span>`
              : ''
          }
        </div>
      </div>
    </div>
    <a href="${buildGoogleCalendarTemplateUrl(task)}" target="_blank" rel="noopener" class="gcal-mini-link" title="Open in Google Calendar">+GCal</a>
  `;

  const checkBtn = row.querySelector('.task-check-btn');
  checkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskCompletion(task.id);
  });

  row.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    openTaskDrawer(task.id);
  });

  return row;
}

// ==========================================================================
// Asana My Tasks List View
// ==========================================================================

function renderListView() {
  const container = document.getElementById('asanaListContainer');
  if (!container) return;

  const filtered = getFilteredTasks();
  const groupBy = state.settings.listGroupBy || 'section';

  let groups = [];
  if (groupBy === 'section') {
    groups = [
      { key: 'today', title: '📌 Today', filter: (t) => !t.completed && t.section === 'today' },
      { key: 'upcoming', title: '🗓️ Upcoming', filter: (t) => !t.completed && t.section === 'upcoming' },
      { key: 'later', title: '⏳ Later', filter: (t) => !t.completed && t.section === 'later' },
      { key: 'completed', title: '✅ Completed', filter: (t) => t.completed }
    ];
  } else if (groupBy === 'status') {
    groups = [
      { key: 'todo', title: '⚪ To Do', filter: (t) => t.status === 'todo' },
      { key: 'in_progress', title: '🔵 In Progress', filter: (t) => t.status === 'in_progress' },
      { key: 'review', title: '🟣 In Review', filter: (t) => t.status === 'review' },
      { key: 'done', title: '🟢 Done', filter: (t) => t.status === 'done' }
    ];
  } else {
    groups = state.projects.map((p) => ({
      key: p.id,
      title: `${p.icon} ${p.name}`,
      filter: (t) => t.projectId === p.id
    }));
  }

  container.innerHTML = '';

  groups.forEach((group) => {
    const items = filtered.filter(group.filter);
    const isCollapsed = Boolean(state.settings.collapsedSections[group.key]);

    const sectionEl = document.createElement('div');
    sectionEl.className = 'asana-section';

    const header = document.createElement('div');
    header.className = 'asana-section-header';
    header.innerHTML = `
      <div class="asana-section-title">
        <span>${isCollapsed ? '▶' : '▼'}</span>
        <span>${escapeHtml(group.title)}</span>
        <span class="badge-pill badge-project">${items.length}</span>
      </div>
      <span class="toolbar-hint">${isCollapsed ? 'Click to expand' : 'Click to collapse'}</span>
    `;
    header.addEventListener('click', () => {
      state.settings.collapsedSections[group.key] = !isCollapsed;
      saveState();
      renderListView();
    });
    sectionEl.appendChild(header);

    if (!isCollapsed) {
      const body = document.createElement('div');
      if (items.length === 0) {
        body.innerHTML = `<div style="padding:14px 16px;font-size:0.82rem;color:var(--text-muted);">No tasks in this section.</div>`;
      } else {
        items.forEach((task) => {
          body.appendChild(createAsanaListRow(task));
        });
      }
      sectionEl.appendChild(body);
    }

    container.appendChild(sectionEl);
  });
}

function createAsanaListRow(task) {
  const row = document.createElement('div');
  row.className = `asana-task-row ${task.completed ? 'completed' : ''}`;

  const proj = getProjectById(task.projectId);
  const deadline = getDeadlineStatus(task.dueDate, task.completed);
  const subCount = (task.subtasks || []).length;
  const subDone = (task.subtasks || []).filter((s) => s.done).length;

  row.innerHTML = `
    <button type="button" class="task-check-btn ${task.completed ? 'checked' : ''}" aria-label="Mark task complete">✓</button>
    <div class="task-row-main">
      <span class="task-row-title">${escapeHtml(task.title)}</span>
      ${
        subCount > 0
          ? `<span class="badge-pill badge-tag" title="Subtasks">☑️ ${subDone}/${subCount}</span>`
          : ''
      }
      ${
        task.recurrence && task.recurrence !== 'none'
          ? `<span class="badge-pill badge-tag" title="Recurring task">🔁 ${task.recurrence}</span>`
          : ''
      }
      ${(task.tags || [])
        .map((tag) => `<span class="badge-pill badge-tag">#${escapeHtml(tag)}</span>`)
        .join('')}
    </div>
    <div class="task-row-meta">
      <span class="badge-pill badge-project">
        <span class="project-color-dot" style="background:${proj.color}"></span>
        ${escapeHtml(proj.name)}
      </span>
      <span class="badge-pill badge-priority-${task.priority}">${task.priority}</span>
      ${
        task.dueDate
          ? `<span class="badge-pill badge-due ${deadline.className}">📅 ${deadline.label}${
              task.dueTime ? ' ' + task.dueTime : ''
            }</span>`
          : `<span class="badge-pill badge-due">No deadline</span>`
      }
      <a href="${buildGoogleCalendarTemplateUrl(task)}" target="_blank" rel="noopener" class="gcal-mini-link" title="Add to Google Calendar">+GCal</a>
    </div>
  `;

  row.querySelector('.task-check-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskCompletion(task.id);
  });

  row.querySelector('.task-row-main').addEventListener('click', () => {
    openTaskDrawer(task.id);
  });

  return row;
}

// ==========================================================================
// Kanban Board View (With HTML5 Drag and Drop)
// ==========================================================================

function renderKanbanBoardView() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;

  const filtered = getFilteredTasks();
  const columns = [
    { status: 'todo', label: '⚪ To Do' },
    { status: 'in_progress', label: '🔵 In Progress' },
    { status: 'review', label: '🟣 In Review' },
    { status: 'done', label: '🟢 Done' }
  ];

  board.innerHTML = '';

  columns.forEach((col) => {
    const colTasks = filtered.filter((t) => t.status === col.status);
    const colEl = document.createElement('div');
    colEl.className = 'kanban-column';
    colEl.dataset.status = col.status;

    colEl.innerHTML = `
      <div class="kanban-col-header">
        <span>${col.label}</span>
        <span class="badge-pill badge-project">${colTasks.length}</span>
      </div>
      <div class="kanban-cards-list"></div>
      <button type="button" class="btn btn-ghost btn-xs btn-full kanban-add-btn">+ Add Card</button>
    `;

    // Drag & Drop Target Handlers
    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      colEl.classList.add('drag-over');
    });
    colEl.addEventListener('dragleave', () => {
      colEl.classList.remove('drag-over');
    });
    colEl.addEventListener('drop', (e) => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      const draggedTaskId = e.dataTransfer.getData('text/plain');
      const task = state.tasks.find((t) => t.id === draggedTaskId);
      if (task && task.status !== col.status) {
        task.status = col.status;
        task.completed = col.status === 'done';
        saveState();
        renderAll();
        showToast(`Moved "${task.title}" to ${col.label}`);
      }
    });

    const cardsList = colEl.querySelector('.kanban-cards-list');
    colTasks.forEach((task) => {
      cardsList.appendChild(createKanbanCard(task));
    });

    colEl.querySelector('.kanban-add-btn').addEventListener('click', () => {
      openCreateTaskModal({ status: col.status });
    });

    board.appendChild(colEl);
  });
}

function createKanbanCard(task) {
  const card = document.createElement('article');
  card.className = `kanban-card ${task.completed ? 'completed' : ''}`;
  card.draggable = true;

  const proj = getProjectById(task.projectId);
  const deadline = getDeadlineStatus(task.dueDate, task.completed);
  const subCount = (task.subtasks || []).length;
  const subDone = (task.subtasks || []).filter((s) => s.done).length;

  card.innerHTML = `
    <div class="kanban-card-top">
      <span class="badge-pill badge-project">
        <span class="project-color-dot" style="background:${proj.color}"></span>
        ${escapeHtml(proj.name)}
      </span>
      <span class="badge-pill badge-priority-${task.priority}">${task.priority}</span>
    </div>
    <h3 class="kanban-card-title">${escapeHtml(task.title)}</h3>
    ${
      (task.tags || []).length > 0 || subCount > 0
        ? `<div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${subCount > 0 ? `<span class="badge-pill badge-tag">☑️ ${subDone}/${subCount}</span>` : ''}
            ${(task.tags || []).map((t) => `<span class="badge-pill badge-tag">#${escapeHtml(t)}</span>`).join('')}
          </div>`
        : ''
    }
    <div class="kanban-card-footer">
      <div style="display:flex;align-items:center;gap:6px;">
        <button type="button" class="task-check-btn ${task.completed ? 'checked' : ''}" aria-label="Toggle task complete">✓</button>
        ${
          task.dueDate
            ? `<span class="badge-pill badge-due ${deadline.className}">${deadline.label}</span>`
            : `<span class="toolbar-hint">No date</span>`
        }
      </div>
      <a href="${buildGoogleCalendarTemplateUrl(task)}" target="_blank" rel="noopener" class="gcal-mini-link" title="Add to Google Calendar">+GCal</a>
    </div>
  `;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', task.id);
  });

  card.querySelector('.task-check-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskCompletion(task.id);
  });

  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    openTaskDrawer(task.id);
  });

  return card;
}

// ==========================================================================
// Calendar & Deadlines View
// ==========================================================================

function renderCalendarView() {
  const grid = document.getElementById('calendarGrid');
  const heading = document.getElementById('calendarHeading');
  const sideAgenda = document.getElementById('calendarSideAgendaList');
  if (!grid || !heading) return;

  const year = calendarCursorDate.getFullYear();
  const month = calendarCursorDate.getMonth();

  heading.textContent = calendarCursorDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

  const firstDayOfMonth = new Date(year, month, 1);
  // Monday-based week (0 = Mon, 6 = Sun)
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const gridStartDate = new Date(year, month, 1 - startOffset);

  const todayStr = toLocalDateString(new Date());
  const filteredTasks = getFilteredTasks();

  grid.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStartDate);
    cellDate.setDate(gridStartDate.getDate() + i);
    const dateStr = toLocalDateString(cellDate);
    const isOtherMonth = cellDate.getMonth() !== month;
    const isToday = dateStr === todayStr;

    const cell = document.createElement('div');
    cell.className = `cal-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'is-today' : ''}`;
    cell.innerHTML = `<div class="cal-day-num">${cellDate.getDate()}</div>`;

    const dayTasks = filteredTasks.filter((t) => t.dueDate === dateStr);
    const dayGcal = state.externalEvents.filter((ev) => ev.date === dateStr);

    dayTasks.forEach((task) => {
      const chip = document.createElement('div');
      chip.className = `cal-event-chip chip-task ${task.completed ? 'completed' : ''}`;
      chip.textContent = `${task.dueTime ? task.dueTime + ' ' : ''}${task.title}`;
      chip.title = `Asana Task: ${task.title}`;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskDrawer(task.id);
      });
      cell.appendChild(chip);
    });

    dayGcal.forEach((ev) => {
      const chip = document.createElement('div');
      chip.className = 'cal-event-chip chip-gcal';
      chip.textContent = `📅 ${ev.time ? ev.time + ' ' : ''}${ev.title}`;
      chip.title = `Google Calendar: ${ev.title}`;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ev.htmlLink) {
          window.open(ev.htmlLink, '_blank', 'noopener');
        } else {
          showToast(`📅 Google Calendar Event: ${ev.title} (${ev.date})`);
        }
      });
      cell.appendChild(chip);
    });

    // Clicking empty space on a day cell opens Create Task modal for that date
    cell.addEventListener('click', () => {
      openCreateTaskModal({ dueDate: dateStr });
    });

    grid.appendChild(cell);
  }

  // Chronological Deadlines Sidebar
  if (sideAgenda) {
    const upcomingTasks = filteredTasks
      .filter((t) => t.dueDate && !t.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    sideAgenda.innerHTML = '';
    if (upcomingTasks.length === 0) {
      sideAgenda.innerHTML = `<p class="toolbar-hint">No active deadlines scheduled.</p>`;
    } else {
      upcomingTasks.forEach((task) => {
        sideAgenda.appendChild(createCompactTaskRow(task));
      });
    }
  }
}

// ==========================================================================
// Slide-Over Task Detail Drawer
// ==========================================================================

function openTaskDrawer(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  activeDrawerTaskId = taskId;
  const drawer = document.getElementById('taskDrawer');
  if (!drawer) return;

  drawer.hidden = false;
  document.getElementById('drawerTaskId').value = task.id;
  document.getElementById('drawerTaskTitle').value = task.title;
  document.getElementById('drawerTaskProject').value = task.projectId;
  document.getElementById('drawerTaskSection').value = task.section || 'upcoming';
  document.getElementById('drawerTaskStatus').value = task.status || 'todo';
  document.getElementById('drawerTaskPriority').value = task.priority || 'medium';
  document.getElementById('drawerTaskDueDate').value = task.dueDate || '';
  document.getElementById('drawerTaskDueTime').value = task.dueTime || '';
  document.getElementById('drawerTaskDuration').value = task.duration || '60';
  document.getElementById('drawerTaskRecurrence').value = task.recurrence || 'none';
  document.getElementById('drawerTaskTags').value = (task.tags || []).join(', ');
  document.getElementById('drawerTaskDescription').value = task.description || '';

  const completedCheck = document.getElementById('drawerTaskCompleted');
  const completedLabel = document.getElementById('drawerCompleteLabelText');
  if (completedCheck && completedLabel) {
    completedCheck.checked = Boolean(task.completed);
    completedLabel.textContent = task.completed ? '✅ Completed' : 'Mark Complete';
  }

  const syncPill = document.getElementById('drawerGcalSyncPill');
  if (syncPill) {
    syncPill.textContent = task.gcalEventId
      ? '✅ Linked to Google Calendar API event'
      : 'Use +GCal Link or API Sync to add to calendar';
  }

  renderDrawerSubtasks(task);
}

function closeTaskDrawer() {
  activeDrawerTaskId = null;
  const drawer = document.getElementById('taskDrawer');
  if (drawer) drawer.hidden = true;
}

function renderDrawerSubtasks(task) {
  const listEl = document.getElementById('drawerSubtaskList');
  const progText = document.getElementById('drawerSubtaskProgress');
  const progBar = document.getElementById('drawerSubtaskProgressBar');
  if (!listEl) return;

  const subs = task.subtasks || [];
  const doneCount = subs.filter((s) => s.done).length;
  const pct = subs.length ? Math.round((doneCount / subs.length) * 100) : 0;

  if (progText) progText.textContent = `${doneCount}/${subs.length}`;
  if (progBar) progBar.value = pct;

  listEl.innerHTML = '';
  subs.forEach((sub) => {
    const li = document.createElement('li');
    li.className = `subtask-item ${sub.done ? 'done' : ''}`;
    li.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;">
        <input type="checkbox" ${sub.done ? 'checked' : ''}>
        <span>${escapeHtml(sub.title)}</span>
      </label>
      <button type="button" class="icon-btn-sm" title="Remove subtask" aria-label="Remove subtask">✕</button>
    `;
    li.querySelector('input').addEventListener('change', () => {
      sub.done = !sub.done;
      saveState();
      renderDrawerSubtasks(task);
      renderAll();
    });
    li.querySelector('button').addEventListener('click', () => {
      task.subtasks = task.subtasks.filter((s) => s.id !== sub.id);
      saveState();
      renderDrawerSubtasks(task);
      renderAll();
    });
    listEl.appendChild(li);
  });
}

// ==========================================================================
// GitHub Gist Cloud Sync (Optional Cross-Device Sync for GitHub Pages)
// ==========================================================================

async function pushToGitHubGist() {
  const token = (state.settings.gistToken || '').trim();
  if (!token) {
    showToast('Please enter a GitHub Personal Access Token (with gist scope).');
    return;
  }

  const payload = {
    description: 'AsanaFlow Workspace Cloud Sync Backup',
    public: false,
    files: {
      'asanaflow_workspace.json': {
        content: JSON.stringify(
          {
            projects: state.projects,
            tasks: state.tasks,
            externalEvents: state.externalEvents,
            updatedAt: new Date().toISOString()
          },
          null,
          2
        )
      }
    }
  };

  try {
    const gistId = (state.settings.gistId || '').trim();
    const url = gistId ? `https://api.github.com/gists/${gistId}` : 'https://api.github.com/gists';
    const res = await fetch(url, {
      method: gistId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const data = await res.json();
    state.settings.gistId = data.id;
    const gistIdInput = document.getElementById('gistIdInput');
    if (gistIdInput) gistIdInput.value = data.id;
    saveState();
    showToast(`☁️ Synced workspace to GitHub Gist (${data.id.slice(0, 8)}...)!`);
  } catch (err) {
    console.error('Gist push error:', err);
    showToast(`Gist sync failed: ${err.message}`);
  }
}

async function pullFromGitHubGist() {
  const token = (state.settings.gistToken || '').trim();
  const gistId = (state.settings.gistId || '').trim();
  if (!gistId) {
    showToast('Please enter your Gist ID to pull from.');
    return;
  }

  try {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const data = await res.json();
    const fileObj = data.files && data.files['asanaflow_workspace.json'];
    if (!fileObj || !fileObj.content) throw new Error('asanaflow_workspace.json not found in Gist');

    const parsed = JSON.parse(fileObj.content);
    if (Array.isArray(parsed.projects)) state.projects = parsed.projects;
    if (Array.isArray(parsed.tasks)) state.tasks = parsed.tasks;
    if (Array.isArray(parsed.externalEvents)) state.externalEvents = parsed.externalEvents;
    saveState();
    renderAll();
    showToast('✅ Pulled latest tasks & projects from GitHub Gist!');
  } catch (err) {
    console.error('Gist pull error:', err);
    showToast(`Gist pull failed: ${err.message}`);
  }
}

// ==========================================================================
// Navigation, Modals & Event Listeners
// ==========================================================================

function switchView(viewName) {
  activeView = viewName;
  const views = ['overview', 'list', 'board', 'calendar'];
  const titles = {
    overview: 'Home & Overview',
    list: 'My Tasks (List)',
    board: 'Kanban Board',
    calendar: 'Calendar & Deadlines'
  };

  views.forEach((v) => {
    const sec = document.getElementById(`view-${v}`);
    if (sec) {
      sec.hidden = v !== viewName;
      sec.classList.toggle('active', v === viewName);
    }
  });

  document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  setText('currentViewTitle', titles[viewName] || 'Workspace');
  document.getElementById('sidebar')?.classList.remove('open');
  renderAll();
}

function openCreateTaskModal(defaults = {}) {
  const modal = document.getElementById('taskModal');
  if (!modal) return;
  document.getElementById('modalTaskTitleInput').value = defaults.title || '';
  document.getElementById('modalTaskSection').value = defaults.section || 'upcoming';
  document.getElementById('modalTaskStatus').value = defaults.status || 'todo';
  document.getElementById('modalTaskPriority').value = defaults.priority || 'medium';
  document.getElementById('modalTaskDueDate').value = defaults.dueDate || toLocalDateString(new Date());
  document.getElementById('modalTaskDueTime').value = defaults.dueTime || '';
  document.getElementById('modalTaskRecurrence').value = 'none';
  document.getElementById('modalTaskTags').value = '';
  document.getElementById('modalTaskDesc').value = '';
  modal.showModal();
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3600);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================================================
// Initialize App & Wire Up All Event Listeners
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setupDialogLightDismissFallbacks();

  // Set default quick-add date to today
  const quickDue = document.getElementById('quickTaskDue');
  if (quickDue) quickDue.value = toLocalDateString(new Date());

  // Populate saved Google Calendar & Gist settings
  const gcalClientInput = document.getElementById('gcalClientIdInput');
  const gcalCalIdInput = document.getElementById('gcalCalendarIdInput');
  if (gcalClientInput) gcalClientInput.value = state.settings.gcalClientId || '';
  if (gcalCalIdInput) gcalCalIdInput.value = state.settings.gcalCalendarId || 'primary';

  const gistTokenInput = document.getElementById('gistTokenInput');
  const gistIdInput = document.getElementById('gistIdInput');
  if (gistTokenInput) gistTokenInput.value = state.settings.gistToken || '';
  if (gistIdInput) gistIdInput.value = state.settings.gistId || '';

  // Sidebar view navigation
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('[data-goto-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-goto-view')));
  });

  // Mobile sidebar toggles
  document.getElementById('openSidebarBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
  });
  document.getElementById('closeSidebarBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
  });

  // Theme toggle
  document.getElementById('themeToggleBtn')?.addEventListener('click', cycleTheme);

  // Clear project filter pill
  document.getElementById('clearProjectFilterBtn')?.addEventListener('click', () => {
    selectedProjectId = 'all';
    renderAll();
  });

  // Search & Filters
  const searchInput = document.getElementById('globalSearchInput');
  const searchForm = document.getElementById('searchForm');
  attachImeSafeEnterSubmit(searchInput, searchForm, false);
  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderAll();
  });
  searchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    renderAll();
  });

  // Keyboard shortcut '/' to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      searchInput?.focus();
    }
  });

  document.getElementById('priorityFilterSelect')?.addEventListener('change', (e) => {
    priorityFilter = e.target.value;
    renderAll();
  });
  document.getElementById('statusFilterSelect')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    renderAll();
  });

  // Quick Add Task Bar (IME-safe Enter submit)
  const quickForm = document.getElementById('quickAddTaskForm');
  const quickTitleInput = document.getElementById('quickTaskTitle');
  attachImeSafeEnterSubmit(quickTitleInput, quickForm, false);
  quickForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = quickTitleInput.value.trim();
    if (!title) return;
    createNewTask({
      title,
      projectId: document.getElementById('quickTaskProject').value,
      section: document.getElementById('quickTaskSection').value,
      dueDate: document.getElementById('quickTaskDue').value,
      dueTime: document.getElementById('quickTaskTime').value,
      priority: document.getElementById('quickTaskPriority').value
    });
    quickTitleInput.value = '';
    document.getElementById('quickTaskTime').value = '';
  });

  // Create Task Modal triggers
  document.getElementById('sidebarCreateTaskBtn')?.addEventListener('click', () => openCreateTaskModal());
  document.getElementById('topbarNewTaskBtn')?.addEventListener('click', () => openCreateTaskModal());

  const modalTaskForm = document.getElementById('modalTaskForm');
  attachImeSafeEnterSubmit(document.getElementById('modalTaskTitleInput'), modalTaskForm, false);
  modalTaskForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTask = createNewTask({
      title: document.getElementById('modalTaskTitleInput').value,
      projectId: document.getElementById('modalTaskProject').value,
      section: document.getElementById('modalTaskSection').value,
      status: document.getElementById('modalTaskStatus').value,
      priority: document.getElementById('modalTaskPriority').value,
      dueDate: document.getElementById('modalTaskDueDate').value,
      dueTime: document.getElementById('modalTaskDueTime').value,
      recurrence: document.getElementById('modalTaskRecurrence').value,
      tags: document.getElementById('modalTaskTags').value,
      description: document.getElementById('modalTaskDesc').value
    });
    document.getElementById('taskModal')?.close();
    if (document.getElementById('modalTaskAutoGcal')?.checked && newTask.dueDate) {
      await pushTaskToGoogleCalendarApi(newTask);
    }
  });

  // List View Group-By Segmented Control & Expand/Collapse
  document.querySelectorAll('[data-groupby]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.listGroupBy = btn.getAttribute('data-groupby');
      document.querySelectorAll('[data-groupby]').forEach((b) => b.classList.toggle('active', b === btn));
      saveState();
      renderListView();
    });
  });

  document.getElementById('expandAllSectionsBtn')?.addEventListener('click', () => {
    state.settings.collapsedSections = {};
    saveState();
    renderListView();
  });

  document.getElementById('collapseAllSectionsBtn')?.addEventListener('click', () => {
    ['today', 'upcoming', 'later', 'completed', 'todo', 'in_progress', 'review', 'done'].forEach((k) => {
      state.settings.collapsedSections[k] = true;
    });
    state.projects.forEach((p) => {
      state.settings.collapsedSections[p.id] = true;
    });
    saveState();
    renderListView();
  });

  // Calendar Month Navigation
  document.getElementById('calPrevMonthBtn')?.addEventListener('click', () => {
    calendarCursorDate.setMonth(calendarCursorDate.getMonth() - 1);
    renderCalendarView();
  });
  document.getElementById('calNextMonthBtn')?.addEventListener('click', () => {
    calendarCursorDate.setMonth(calendarCursorDate.getMonth() + 1);
    renderCalendarView();
  });
  document.getElementById('calTodayBtn')?.addEventListener('click', () => {
    calendarCursorDate = new Date();
    renderCalendarView();
  });
  document.getElementById('calImportIcsBtn')?.addEventListener('click', () => {
    document.getElementById('gcalModal')?.showModal();
  });
  document.getElementById('calPushAllToGcalBtn')?.addEventListener('click', pushAllTasksToGoogleCalendar);

  // Task Detail Drawer Form & Actions
  document.getElementById('closeDrawerBtn')?.addEventListener('click', closeTaskDrawer);

  document.getElementById('drawerTaskCompleted')?.addEventListener('change', () => {
    if (activeDrawerTaskId) toggleTaskCompletion(activeDrawerTaskId);
  });

  const drawerForm = document.getElementById('drawerTaskForm');
  attachImeSafeEnterSubmit(document.getElementById('drawerTaskTitle'), drawerForm, false);
  drawerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const task = state.tasks.find((t) => t.id === activeDrawerTaskId);
    if (!task) return;
    task.title = document.getElementById('drawerTaskTitle').value.trim() || task.title;
    task.projectId = document.getElementById('drawerTaskProject').value;
    task.section = document.getElementById('drawerTaskSection').value;
    task.status = document.getElementById('drawerTaskStatus').value;
    task.completed = task.status === 'done';
    task.priority = document.getElementById('drawerTaskPriority').value;
    task.dueDate = document.getElementById('drawerTaskDueDate').value;
    task.dueTime = document.getElementById('drawerTaskDueTime').value;
    task.duration = document.getElementById('drawerTaskDuration').value;
    task.recurrence = document.getElementById('drawerTaskRecurrence').value;
    task.tags = document
      .getElementById('drawerTaskTags')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    task.description = document.getElementById('drawerTaskDescription').value;

    saveState();
    renderAll();
    openTaskDrawer(task.id);
    showToast('Saved task changes');
  });

  // Subtask form inside drawer (IME-safe Enter submit)
  const addSubtaskForm = document.getElementById('addSubtaskForm');
  const newSubtaskInput = document.getElementById('newSubtaskInput');
  attachImeSafeEnterSubmit(newSubtaskInput, addSubtaskForm, false);
  addSubtaskForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const task = state.tasks.find((t) => t.id === activeDrawerTaskId);
    const title = newSubtaskInput.value.trim();
    if (!task || !title) return;
    task.subtasks = task.subtasks || [];
    task.subtasks.push({ id: generateId('sub'), title, done: false });
    newSubtaskInput.value = '';
    saveState();
    renderDrawerSubtasks(task);
    renderAll();
  });

  document.getElementById('drawerAddToGcalLinkBtn')?.addEventListener('click', () => {
    const task = state.tasks.find((t) => t.id === activeDrawerTaskId);
    if (task) window.open(buildGoogleCalendarTemplateUrl(task), '_blank', 'noopener');
  });

  document.getElementById('drawerPushGcalApiBtn')?.addEventListener('click', async () => {
    const task = state.tasks.find((t) => t.id === activeDrawerTaskId);
    if (task) await pushTaskToGoogleCalendarApi(task);
  });

  document.getElementById('drawerDownloadIcsBtn')?.addEventListener('click', () => {
    const task = state.tasks.find((t) => t.id === activeDrawerTaskId);
    if (!task) return;
    if (!task.dueDate) {
      showToast('Set a Due Date first to export an .ics calendar event.');
      return;
    }
    const content = generateIcsContent([task]);
    downloadFile(`${task.title.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}.ics`, content, 'text/calendar');
  });

  document.getElementById('drawerDeleteTaskBtn')?.addEventListener('click', () => {
    if (activeDrawerTaskId) deleteTask(activeDrawerTaskId);
  });

  // New Project Modal
  const openProjModal = () => document.getElementById('projectModal')?.showModal();
  document.getElementById('openNewProjectModalBtn')?.addEventListener('click', openProjModal);
  document.getElementById('overviewNewProjectBtn')?.addEventListener('click', openProjModal);

  const projForm = document.getElementById('projectModalForm');
  attachImeSafeEnterSubmit(document.getElementById('newProjectName'), projForm, false);
  projForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('newProjectName').value.trim();
    if (!name) return;
    const icon = document.getElementById('newProjectIcon').value.trim() || '📁';
    const color = document.getElementById('newProjectColor').value || '#f06a6a';
    const newProj = { id: generateId('proj'), name, icon, color };
    state.projects.push(newProj);
    selectedProjectId = newProj.id;
    saveState();
    document.getElementById('newProjectName').value = '';
    document.getElementById('projectModal')?.close();
    renderAll();
    showToast(`Created and switched to project "${icon} ${name}"`);
  });

  // Google Calendar Modal & .ICS Import/Export
  const openGcalModal = () => document.getElementById('gcalModal')?.showModal();
  document.getElementById('openGcalModalBtn')?.addEventListener('click', openGcalModal);
  document.getElementById('topbarSyncGcalBtn')?.addEventListener('click', openGcalModal);
  document.getElementById('overviewConnectGcalBtn')?.addEventListener('click', openGcalModal);

  const exportAllIcs = () => {
    const withDates = state.tasks.filter((t) => t.dueDate);
    if (withDates.length === 0) {
      showToast('Add a due date to at least one task to export an .ics file.');
      return;
    }
    const content = generateIcsContent(withDates);
    downloadFile('asanaflow_deadlines.ics', content, 'text/calendar');
    showToast(`⬇️ Exported ${withDates.length} tasks to asanaflow_deadlines.ics`);
  };
  document.getElementById('exportAllIcsBtn')?.addEventListener('click', exportAllIcs);
  document.getElementById('modalExportIcsBtn')?.addEventListener('click', exportAllIcs);

  document.getElementById('icsFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseIcsFileContent(String(reader.result || ''));
      state.externalEvents = [...state.externalEvents, ...parsed];
      saveState();
      renderAll();
      showToast(`📥 Imported ${parsed.length} events from ${file.name}!`);
    };
    reader.readAsText(file);
  });

  document.getElementById('clearImportedEventsBtn')?.addEventListener('click', () => {
    state.externalEvents = [];
    saveState();
    renderAll();
    showToast('Cleared imported calendar events.');
  });

  document.getElementById('gcalConfigForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.settings.gcalClientId = document.getElementById('gcalClientIdInput').value.trim();
    state.settings.gcalCalendarId = document.getElementById('gcalCalendarIdInput').value.trim() || 'primary';
    saveState();
    connectGoogleCalendarOAuth();
  });

  document.getElementById('fetchGcalEventsBtn')?.addEventListener('click', fetchGoogleCalendarEvents);
  document.getElementById('pushAllTasksToGcalBtn')?.addEventListener('click', pushAllTasksToGoogleCalendar);
  document.getElementById('disconnectGoogleApiBtn')?.addEventListener('click', () => {
    googleAccessToken = null;
    updateGcalStatusUi();
    showToast('Disconnected Google Calendar session.');
  });

  // Backup, JSON Export/Import & GitHub Gist Modal
  document.getElementById('openSyncBackupModalBtn')?.addEventListener('click', () => {
    document.getElementById('syncBackupModal')?.showModal();
  });

  document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
    downloadFile('asanaflow_backup.json', JSON.stringify(state, null, 2), 'application/json');
    showToast('⬇️ Downloaded asanaflow_backup.json');
  });

  document.getElementById('importJsonInput')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (Array.isArray(parsed.tasks) && Array.isArray(parsed.projects)) {
          state = { ...createDefaultState(), ...parsed };
          saveState();
          renderAll();
          showToast('✅ Restored workspace from backup JSON!');
        } else {
          showToast('Invalid backup JSON file format.');
        }
      } catch (err) {
        showToast(`Failed to parse JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('resetDemoDataBtn')?.addEventListener('click', () => {
    state = createDefaultState();
    saveState();
    renderAll();
    showToast('🔄 Reset workspace with sample tasks.');
  });

  document.getElementById('clearAllTasksBtn')?.addEventListener('click', () => {
    state.tasks = [];
    state.externalEvents = [];
    saveState();
    renderAll();
    showToast('🗑️ Cleared all tasks and events.');
  });

  document.getElementById('gistSyncForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.settings.gistToken = document.getElementById('gistTokenInput').value.trim();
    state.settings.gistId = document.getElementById('gistIdInput').value.trim();
    saveState();
    await pushToGitHubGist();
  });

  document.getElementById('gistPullBtn')?.addEventListener('click', async () => {
    state.settings.gistToken = document.getElementById('gistTokenInput').value.trim();
    state.settings.gistId = document.getElementById('gistIdInput').value.trim();
    saveState();
    await pullFromGitHubGist();
  });

  // Initial Render
  renderAll();
});
