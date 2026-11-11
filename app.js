/**
 * Asana — Personal Work, Deadlines & Google Calendar Hub
 * Exact Asana Spreadsheet List View, Kanban Board, Calendar & Overview
 */

const STORAGE_KEY = 'asanaflow_workspace_v1';
const DEMO_TASK_IDS = ['task_1', 'task_2', 'task_3', 'task_4', 'task_5', 'task_6'];
const DEMO_PROJECT_IDS = ['proj_personal', 'proj_work', 'proj_study', 'proj_web'];

const PLACEHOLDER_HINTS = [
  'e.g. Determine project goal',
  'e.g. Schedule kickoff meeting',
  'e.g. Set final deadline'
];

// SVG Icons matching the exact Asana screenshot
const SVG_ASSIGNEE_DASHED = `
  <span class="dashed-circle-icon" aria-hidden="true">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
      <circle cx="8" cy="5.5" r="2.5"/>
      <path d="M3.5 13.5c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5" stroke-linecap="round"/>
    </svg>
  </span>
`;

const SVG_CALENDAR_DASHED = `
  <span class="dashed-circle-icon" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/>
      <path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" stroke-linecap="round"/>
    </svg>
  </span>
`;

const SVG_PROJECT_LIST_ICON = `
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#1e1f21" stroke-width="2" aria-hidden="true">
    <path d="M6 4h7M6 8h7M6 12h7" stroke-linecap="round"/>
    <circle cx="3" cy="4" r="1" fill="#1e1f21"/>
    <circle cx="3" cy="8" r="1" fill="#1e1f21"/>
    <circle cx="3" cy="12" r="1" fill="#1e1f21"/>
  </svg>
`;

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

function createDefaultState() {
  return {
    projects: [
      {
        id: 'proj_todo',
        name: 'To do list',
        color: '#f06a9a',
        sections: [{ id: 'sec_default', name: '' }]
      }
    ],
    tasks: [],
    externalEvents: [],
    settings: {
      theme: 'light',
      sortBy: 'manual',
      collapsedSections: {},
      gcalClientId: '',
      gcalCalendarId: 'primary',
      gistToken: '',
      gistId: '',
      cleanedTemplateV2: true
    }
  };
}

let state = loadState();
let activeView = 'list'; // Default to Asana's signature List view!
let selectedProjectId = (state.projects[0] && state.projects[0].id) || 'proj_todo';
let searchQuery = '';
let priorityFilter = 'all';
let statusFilter = 'all';
let sortBy = state.settings.sortBy || 'manual';
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

    // Strip any legacy template tasks and template projects
    merged.tasks = (merged.tasks || []).filter((t) => !DEMO_TASK_IDS.includes(t.id));
    merged.projects = (merged.projects || []).filter((p) => !DEMO_PROJECT_IDS.includes(p.id));
    if (merged.projects.length === 0) {
      merged.projects = [
        {
          id: 'proj_todo',
          name: 'To do list',
          color: '#f06a9a',
          sections: [{ id: 'sec_default', name: '' }]
        }
      ];
    }

    // Ensure every project has a sections array
    merged.projects.forEach((p) => {
      if (!p.color) p.color = '#f06a9a';
      if (!Array.isArray(p.sections) || p.sections.length === 0) {
        p.sections = [{ id: 'sec_default', name: '' }];
      }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (err) {
    console.error('Failed to load state:', err);
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
      document.getElementById(dialogId)?.close();
    });
  });
}

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
  const mode = state.settings.theme || 'light';
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode);
  } else {
    root.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  saveState();
  applyTheme();
  showToast(`Switched to ${state.settings.theme} mode`);
}

function formatHumanDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getDeadlineStatus(dueDateStr, completed) {
  if (!dueDateStr) return { code: 'none', label: '', className: '' };
  const todayStr = toLocalDateString(new Date());
  if (completed) {
    return { code: 'completed', label: formatHumanDate(dueDateStr), className: '' };
  }
  if (dueDateStr < todayStr) {
    return { code: 'overdue', label: formatHumanDate(dueDateStr), className: 'overdue' };
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

function getProjectById(projectId) {
  return state.projects.find((p) => p.id === projectId) || state.projects[0];
}

function getFilteredTasks() {
  const todayStr = toLocalDateString(new Date());
  let list = state.tasks.filter((task) => {
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
      const inTitle = (task.title || '').toLowerCase().includes(q);
      const inDesc = (task.description || '').toLowerCase().includes(q);
      const inTags = (task.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!inTitle && !inDesc && !inTags) return false;
    }
    return true;
  });

  if (sortBy === 'dueDate') {
    list = [...list].sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
  } else if (sortBy === 'priority') {
    const order = { urgent: 0, high: 1, medium: 2, low: 3, '': 4 };
    list = [...list].sort((a, b) => (order[a.priority || ''] ?? 4) - (order[b.priority || ''] ?? 4));
  } else if (sortBy === 'title') {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    list = [...list].sort((a, b) => collator.compare(a.title || '', b.title || ''));
  }

  return list;
}

// ==========================================================================
// Google Calendar Links, .ICS & Live API v3
// ==========================================================================

function buildGoogleCalendarTemplateUrl(task) {
  const title = encodeURIComponent(task.title || 'Asana Task');
  const proj = getProjectById(task.projectId);
  const subtaskLines =
    task.subtasks && task.subtasks.length
      ? '\n\nSubtasks:\n' + task.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`).join('\n')
      : '';
  const details = encodeURIComponent(
    `Project: ${proj.name}${task.priority ? ` | Priority: ${task.priority}` : ''}\n\n${
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
    const [y, m, d] = dateBase.split('-').map(Number);
    const nextDay = new Date(y, m - 1, d + 1);
    const cleanNext = toLocalDateString(nextDay).replace(/-/g, '');
    datesParam = `${cleanDate}/${cleanNext}`;
  }

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}`;
}

function generateIcsContent(tasksList) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Asana//GitHub Pages Task Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  tasksList.forEach((task) => {
    if (!task.dueDate) return;
    const cleanDate = task.dueDate.replace(/-/g, '');
    const proj = getProjectById(task.projectId);
    const summary = escapeIcsText(`${task.completed ? '[DONE] ' : ''}${task.title} (${proj.name})`);
    const desc = escapeIcsText(task.description || '');

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
        timeStr = `${dtStartRaw.slice(9, 11)}:${dtStartRaw.slice(11, 13)}`;
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

function updateGcalStatusUi() {
  const isConnected = Boolean(googleAccessToken);
  const topbarText = document.getElementById('gcalTopbarStatusText');
  const modalBadge = document.getElementById('modalGcalApiBadge');
  const importedCountEl = document.getElementById('importedEventsCountLabel');

  if (importedCountEl) importedCountEl.textContent = String(state.externalEvents.length);
  if (topbarText) {
    topbarText.textContent = isConnected ? 'GCal Connected' : 'Sync Google Calendar';
  }
  if (modalBadge) {
    modalBadge.textContent = isConnected ? 'Connected' : 'Disconnected';
    modalBadge.className = `badge-pill ${isConnected ? 'badge-ready' : ''}`;
  }
}

function connectGoogleCalendarOAuth() {
  const clientId = (state.settings.gcalClientId || '').trim();
  if (!clientId) {
    showToast('Enter your Google OAuth Client ID to connect live API sync.');
    document.getElementById('gcalModal')?.showModal();
    return;
  }

  if (!window.google?.accounts?.oauth2) {
    showToast('Google Identity script still loading.');
    return;
  }

  googleTokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
    callback: async (tokenResponse) => {
      if (tokenResponse?.access_token) {
        googleAccessToken = tokenResponse.access_token;
        updateGcalStatusUi();
        showToast('Connected to Google Calendar!');
        await fetchGoogleCalendarEvents();
      }
    }
  });
  googleTokenClient.requestAccessToken({ prompt: 'consent' });
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
    const res = await fetch(url, { headers: { Authorization: `Bearer ${googleAccessToken}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const apiEvents = (data.items || [])
      .filter((item) => item.status !== 'cancelled')
      .map((item) => {
        const startRaw = item.start?.dateTime || item.start?.date || '';
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

    const icsEvents = state.externalEvents.filter((e) => e.source === 'ics');
    state.externalEvents = [...icsEvents, ...apiEvents];
    saveState();
    renderAll();
    showToast(`Synced ${apiEvents.length} Google Calendar events`);
  } catch (err) {
    showToast(`Calendar fetch error: ${err.message}`);
  }
}

async function pushTaskToGoogleCalendarApi(task) {
  if (!task.dueDate) {
    showToast('Set a Due date on this task first.');
    return false;
  }
  if (!googleAccessToken) {
    window.open(buildGoogleCalendarTemplateUrl(task), '_blank', 'noopener');
    return false;
  }

  const calId = encodeURIComponent(state.settings.gcalCalendarId || 'primary');
  const proj = getProjectById(task.projectId);
  const payload = {
    summary: task.title,
    description: `Project: ${proj.name}\n\n${task.description || ''}`
  };

  if (task.dueTime && task.duration !== 'allday') {
    const [hh, mm] = task.dueTime.split(':').map(Number);
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const startObj = new Date(y, m - 1, d, hh || 9, mm || 0, 0);
    const durationMins = parseInt(task.duration || '60', 10) || 60;
    const endObj = new Date(startObj.getTime() + durationMins * 60000);
    payload.start = { dateTime: startObj.toISOString() };
    payload.end = { dateTime: endObj.toISOString() };
  } else {
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const nextDayStr = toLocalDateString(new Date(y, m - 1, d + 1));
    payload.start = { date: task.dueDate };
    payload.end = { date: nextDayStr };
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
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const created = await res.json();
    task.gcalEventId = created.id;
    saveState();
    renderAll();
    showToast(`Synced "${task.title}" to Google Calendar`);
    return true;
  } catch (err) {
    showToast(`Sync failed: ${err.message}`);
    return false;
  }
}

async function pushAllTasksToGoogleCalendar() {
  const tasksWithDates = state.tasks.filter((t) => t.dueDate && !t.completed);
  if (tasksWithDates.length === 0) {
    showToast('No tasks with due dates to push.');
    return;
  }
  if (!googleAccessToken) {
    document.getElementById('gcalModal')?.showModal();
    return;
  }
  for (const t of tasksWithDates) {
    await pushTaskToGoogleCalendarApi(t);
  }
  await fetchGoogleCalendarEvents();
}

// ==========================================================================
// Task & Section CRUD
// ==========================================================================

function createNewTask(taskData = {}) {
  const projId =
    taskData.projectId ||
    (selectedProjectId !== 'all' ? selectedProjectId : state.projects[0]?.id || 'proj_todo');
  const proj = getProjectById(projId);
  const defaultSecId = (proj.sections && proj.sections[0] && proj.sections[0].id) || 'sec_default';

  const newTask = {
    id: generateId('task'),
    title: (taskData.title ?? '').trim(),
    projectId: projId,
    sectionId: taskData.sectionId || defaultSecId,
    status: taskData.status || 'todo',
    priority: taskData.priority ?? '',
    assignedToMe: Boolean(taskData.assignedToMe),
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

  state.tasks.push(newTask);
  saveState();
  return newTask;
}

function toggleTaskCompletion(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.completed = !task.completed;
  task.status = task.completed ? 'done' : 'todo';

  if (task.completed && task.recurrence && task.recurrence !== 'none' && task.dueDate) {
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    if (task.recurrence === 'daily') base.setDate(base.getDate() + 1);
    else if (task.recurrence === 'weekly') base.setDate(base.getDate() + 7);
    else if (task.recurrence === 'biweekly') base.setDate(base.getDate() + 14);
    else if (task.recurrence === 'monthly') base.setMonth(base.getMonth() + 1);

    state.tasks.push({
      ...JSON.parse(JSON.stringify(task)),
      id: generateId('task'),
      dueDate: toLocalDateString(base),
      completed: false,
      status: 'todo',
      gcalEventId: null,
      subtasks: (task.subtasks || []).map((s) => ({ ...s, done: false })),
      createdAt: Date.now()
    });
  }

  saveState();
  renderAll();
  if (activeDrawerTaskId === taskId) openTaskDrawer(taskId);
}

function deleteTask(taskId) {
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  state.tasks.splice(idx, 1);
  if (activeDrawerTaskId === taskId) closeTaskDrawer();
  saveState();
  renderAll();
}

function deleteProject(projectId) {
  if (state.projects.length <= 1) {
    showToast('Keep at least one project.');
    return;
  }
  const idx = state.projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return;
  state.projects.splice(idx, 1);
  state.tasks = state.tasks.filter((t) => t.projectId !== projectId);
  if (selectedProjectId === projectId) {
    selectedProjectId = state.projects[0].id;
  }
  saveState();
  renderAll();
}

function addSectionToCurrentProject() {
  const proj = getProjectById(selectedProjectId);
  if (!proj) return;
  proj.sections = proj.sections || [{ id: 'sec_default', name: '' }];
  const newSec = {
    id: generateId('sec'),
    name: 'Untitled section'
  };
  proj.sections.push(newSec);
  saveState();
  renderListView();
  // Focus the new section title input
  setTimeout(() => {
    const inputs = document.querySelectorAll('.section-title-input');
    const last = inputs[inputs.length - 1];
    if (last) {
      last.focus();
      last.select();
    }
  }, 20);
}

// ==========================================================================
// Rendering Engine
// ==========================================================================

function renderAll() {
  renderTopbarAndSidebar();
  renderListView();
  renderKanbanBoardView();
  renderCalendarView();
  renderOverviewView();
  updateGcalStatusUi();
}

function renderTopbarAndSidebar() {
  const proj = getProjectById(selectedProjectId);
  const titleEl = document.getElementById('currentViewTitle');
  const badgeEl = document.getElementById('currentProjectBadge');

  if (titleEl && proj) {
    titleEl.textContent = selectedProjectId === 'all' ? 'My tasks' : proj.name;
  }
  if (badgeEl && proj) {
    badgeEl.style.backgroundColor = proj.color || '#f06a9a';
  }

  // Counts
  const todayStr = toLocalDateString(new Date());
  const allActive = state.tasks.filter((t) => !t.completed && t.title.trim() !== '');
  const dueSoon = allActive.filter((t) => t.dueDate && t.dueDate <= todayStr);

  const pendingBadge = document.getElementById('badgePendingCount');
  if (pendingBadge) pendingBadge.textContent = String(allActive.length);

  const urgentBadge = document.getElementById('badgeDueSoonCount');
  if (urgentBadge) {
    urgentBadge.hidden = dueSoon.length === 0;
    urgentBadge.textContent = String(dueSoon.length);
  }

  // Sidebar Projects List
  const listEl = document.getElementById('sidebarProjectList');
  if (listEl) {
    listEl.innerHTML = '';
    state.projects.forEach((p) => {
      const row = document.createElement('div');
      row.className = `sidebar-proj-row ${selectedProjectId === p.id ? 'active' : ''}`;
      row.innerHTML = `
        <span class="sidebar-proj-icon" style="background-color: ${p.color || '#f06a9a'}">
          ${SVG_PROJECT_LIST_ICON}
        </span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</span>
        ${
          state.projects.length > 1
            ? `<button type="button" class="sidebar-proj-del" title="Delete project" aria-label="Delete project">✕</button>`
            : ''
        }
      `;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar-proj-del')) return;
        selectedProjectId = p.id;
        renderAll();
      });
      row.querySelector('.sidebar-proj-del')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteProject(p.id);
      });
      listEl.appendChild(row);
    });
  }

  // Populate project dropdowns
  ['drawerTaskProject', 'modalTaskProject'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = state.projects
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join('');
    if (selectedProjectId !== 'all') sel.value = selectedProjectId;
  });
}

// ==========================================================================
// VIEW 1: EXACT ASANA SPREADSHEET LIST VIEW
// ==========================================================================

function renderListView() {
  const tbody = document.getElementById('asanaSpreadsheetBody');
  if (!tbody) return;

  const proj = getProjectById(selectedProjectId);
  const sections =
    selectedProjectId === 'all'
      ? [{ id: 'sec_default', name: '' }]
      : proj.sections || [{ id: 'sec_default', name: '' }];

  const filteredTasks = getFilteredTasks();
  tbody.innerHTML = '';

  sections.forEach((sec, secIndex) => {
    // Render section header if it has a name or is not the first default unnamed section
    if (sec.name || secIndex > 0) {
      const secTr = document.createElement('tr');
      secTr.className = 'asana-section-tr';
      secTr.innerHTML = `
        <td colspan="5">
          <div class="section-header-flex">
            <span>▾</span>
            <input type="text" class="section-title-input" value="${escapeHtml(sec.name || 'Untitled section')}" aria-label="Section name">
          </div>
        </td>
      `;
      const input = secTr.querySelector('.section-title-input');
      input.addEventListener('change', () => {
        sec.name = input.value.trim() || 'Untitled section';
        saveState();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          input.blur();
        }
      });
      tbody.appendChild(secTr);
    }

    const secTasks = filteredTasks.filter((t) => {
      if (selectedProjectId === 'all') return true;
      const targetSec = t.sectionId || sections[0].id;
      return targetSec === sec.id;
    });

    secTasks.forEach((task, idx) => {
      tbody.appendChild(createSpreadsheetTaskRow(task, PLACEHOLDER_HINTS[idx] || 'Write a task name'));
    });

    // If this is the first section and there are fewer than 3 tasks, render the exact 3 Asana placeholder rows!
    if (secIndex === 0 && secTasks.length < 3 && searchQuery.trim() === '' && statusFilter === 'all' && priorityFilter === 'all') {
      for (let i = secTasks.length; i < 3; i++) {
        tbody.appendChild(createPlaceholderSpreadsheetRow(PLACEHOLDER_HINTS[i], sec.id));
      }
    }
  });
}

function createSpreadsheetTaskRow(task, placeholderText = 'Write a task name') {
  const tr = document.createElement('tr');
  tr.className = `asana-grid-row ${task.completed ? 'completed' : ''}`;
  tr.dataset.taskId = task.id;

  const deadline = getDeadlineStatus(task.dueDate, task.completed);
  const prioClass = task.priority ? `prio-${task.priority}` : '';

  tr.innerHTML = `
    <td>
      <div class="cell-name-inner">
        <button type="button" class="asana-row-check ${task.completed ? 'checked' : ''}" aria-label="Mark complete">✓</button>
        <input
          type="text"
          class="asana-row-input"
          value="${escapeHtml(task.title)}"
          placeholder="${escapeHtml(placeholderText)}"
          aria-label="Task name"
        >
        <button type="button" class="row-open-drawer-btn" title="Open task details &amp; subtasks">Details ›</button>
      </div>
    </td>
    <td>
      <button type="button" class="dashed-circle-btn assignee-toggle-btn" title="Click to assign/unassign to you">
        ${
          task.assignedToMe
            ? `<span class="gh-avatar gh-avatar-xs">GH</span><span style="color:var(--text-main);font-size:12.5px;">Guillermo</span>`
            : SVG_ASSIGNEE_DASHED
        }
      </button>
    </td>
    <td>
      <div class="cell-date-wrapper" title="Click to set due date">
        ${
          task.dueDate
            ? `<span class="date-text-pill ${deadline.className}">${escapeHtml(deadline.label)}${
                task.dueTime ? ' ' + escapeHtml(task.dueTime) : ''
              }</span>`
            : `<span class="dashed-circle-btn">${SVG_CALENDAR_DASHED}</span>`
        }
        <input type="date" class="cell-date-native" value="${escapeHtml(task.dueDate || '')}" aria-label="Due date">
      </div>
    </td>
    <td>
      <select class="cell-priority-select ${prioClass}" aria-label="Priority">
        <option value="" ${!task.priority ? 'selected' : ''}></option>
        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
        <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
      </select>
    </td>
    <td>
      <div class="cell-actions-inner">
        <a href="${buildGoogleCalendarTemplateUrl(task)}" target="_blank" rel="noopener" class="gcal-mini-link" title="Add to Google Calendar">+GCal</a>
        <button type="button" class="row-del-btn" title="Delete row" aria-label="Delete task">✕</button>
      </div>
    </td>
  `;

  // 1. Checkmark toggle
  tr.querySelector('.asana-row-check').addEventListener('click', () => {
    toggleTaskCompletion(task.id);
  });

  // 2. Inline Title Input (saves as you type, Enter creates a new row below!)
  const nameInput = tr.querySelector('.asana-row-input');
  nameInput.addEventListener('input', () => {
    task.title = nameInput.value;
    saveState();
    const gcalLink = tr.querySelector('.gcal-mini-link');
    if (gcalLink) gcalLink.href = buildGoogleCalendarTemplateUrl(task);
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.isComposing || e.keyCode === 229) return;
      const newTask = createNewTask({ sectionId: task.sectionId });
      renderAll();
      focusTaskRowInput(newTask.id);
    } else if (e.key === 'Backspace' && nameInput.value === '') {
      e.preventDefault();
      deleteTask(task.id);
    }
  });

  // 3. Details Drawer Button
  tr.querySelector('.row-open-drawer-btn').addEventListener('click', () => {
    openTaskDrawer(task.id);
  });

  // 4. Assignee Toggle
  tr.querySelector('.assignee-toggle-btn').addEventListener('click', () => {
    task.assignedToMe = !task.assignedToMe;
    saveState();
    renderListView();
  });

  // 5. Inline Date Picker
  const dateInput = tr.querySelector('.cell-date-native');
  dateInput.addEventListener('click', () => {
    if (typeof dateInput.showPicker === 'function') {
      try {
        dateInput.showPicker();
      } catch {}
    }
  });
  dateInput.addEventListener('change', () => {
    task.dueDate = dateInput.value;
    saveState();
    renderAll();
  });

  // 6. Priority Dropdown
  const prioSelect = tr.querySelector('.cell-priority-select');
  prioSelect.addEventListener('change', () => {
    task.priority = prioSelect.value;
    saveState();
    renderAll();
  });

  // 7. Delete Row
  tr.querySelector('.row-del-btn').addEventListener('click', () => {
    deleteTask(task.id);
  });

  return tr;
}

/**
 * Renders one of the 3 ghost/placeholder rows shown in the screenshot ("e.g. Determine project goal")
 * As soon as the user types or sets a date/priority on it, it promotes into a real saved task!
 */
function createPlaceholderSpreadsheetRow(placeholderText, sectionId) {
  const tr = document.createElement('tr');
  tr.className = 'asana-grid-row placeholder-row';

  tr.innerHTML = `
    <td>
      <div class="cell-name-inner">
        <span class="asana-row-check" aria-hidden="true"></span>
        <input
          type="text"
          class="asana-row-input"
          placeholder="${escapeHtml(placeholderText)}"
          aria-label="${escapeHtml(placeholderText)}"
        >
      </div>
    </td>
    <td>
      <button type="button" class="dashed-circle-btn" title="Assign to me">
        ${SVG_ASSIGNEE_DASHED}
      </button>
    </td>
    <td>
      <div class="cell-date-wrapper" title="Set due date">
        <span class="dashed-circle-btn">${SVG_CALENDAR_DASHED}</span>
        <input type="date" class="cell-date-native" aria-label="Due date">
      </div>
    </td>
    <td>
      <select class="cell-priority-select" aria-label="Priority">
        <option value="" selected></option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
    </td>
    <td></td>
  `;

  const input = tr.querySelector('.asana-row-input');
  input.addEventListener('input', () => {
    if (!input.value) return;
    const val = input.value;
    const newTask = createNewTask({ title: val, sectionId });
    renderAll();
    focusTaskRowInput(newTask.id, val.length);
  });

  tr.querySelector('.dashed-circle-btn').addEventListener('click', () => {
    const newTask = createNewTask({ title: '', assignedToMe: true, sectionId });
    renderAll();
    focusTaskRowInput(newTask.id);
  });

  const dateInput = tr.querySelector('.cell-date-native');
  dateInput.addEventListener('click', () => {
    if (typeof dateInput.showPicker === 'function') {
      try {
        dateInput.showPicker();
      } catch {}
    }
  });
  dateInput.addEventListener('change', () => {
    if (!dateInput.value) return;
    const newTask = createNewTask({ title: '', dueDate: dateInput.value, sectionId });
    renderAll();
    focusTaskRowInput(newTask.id);
  });

  const prioSelect = tr.querySelector('.cell-priority-select');
  prioSelect.addEventListener('change', () => {
    if (!prioSelect.value) return;
    const newTask = createNewTask({ title: '', priority: prioSelect.value, sectionId });
    renderAll();
    focusTaskRowInput(newTask.id);
  });

  return tr;
}

function focusTaskRowInput(taskId, cursorPos = null) {
  setTimeout(() => {
    const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
    const input = row?.querySelector('.asana-row-input');
    if (input) {
      input.focus();
      const pos = cursorPos !== null ? cursorPos : input.value.length;
      input.setSelectionRange(pos, pos);
    }
  }, 10);
}

// ==========================================================================
// VIEW 2: KANBAN BOARD VIEW
// ==========================================================================

function renderKanbanBoardView() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;

  const filtered = getFilteredTasks().filter((t) => t.title.trim() !== '');
  const columns = [
    { status: 'todo', label: 'To do' },
    { status: 'in_progress', label: 'Doing' },
    { status: 'review', label: 'Review' },
    { status: 'done', label: 'Done' }
  ];

  board.innerHTML = '';

  columns.forEach((col) => {
    const colTasks = filtered.filter((t) => t.status === col.status);
    const colEl = document.createElement('div');
    colEl.className = 'kanban-column';
    colEl.innerHTML = `
      <div class="kanban-col-header">
        <span>${col.label}</span>
        <span style="color:var(--text-muted)">${colTasks.length}</span>
      </div>
      <div class="kanban-cards-list"></div>
      <button type="button" class="asana-add-section-btn" style="width:100%;justify-content:center;">+ Add task</button>
    `;

    colEl.addEventListener('dragover', (e) => e.preventDefault());
    colEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('text/plain');
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = col.status;
        task.completed = col.status === 'done';
        saveState();
        renderAll();
      }
    });

    const listEl = colEl.querySelector('.kanban-cards-list');
    colTasks.forEach((task) => {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.draggable = true;
      const deadline = getDeadlineStatus(task.dueDate, task.completed);
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <button type="button" class="asana-row-check ${task.completed ? 'checked' : ''}">✓</button>
          <p class="kanban-card-title">${escapeHtml(task.title)}</p>
        </div>
        <div class="kanban-card-footer">
          <span>${task.dueDate ? escapeHtml(deadline.label) : ''}</span>
          <a href="${buildGoogleCalendarTemplateUrl(task)}" target="_blank" rel="noopener" class="gcal-mini-link">+GCal</a>
        </div>
      `;
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', task.id));
      card.querySelector('.asana-row-check').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaskCompletion(task.id);
      });
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        openTaskDrawer(task.id);
      });
      listEl.appendChild(card);
    });

    colEl.querySelector('.asana-add-section-btn').addEventListener('click', () => {
      openCreateTaskModal({ status: col.status });
    });

    board.appendChild(colEl);
  });
}

// ==========================================================================
// VIEW 3: CALENDAR VIEW
// ==========================================================================

function renderCalendarView() {
  const grid = document.getElementById('calendarGrid');
  const heading = document.getElementById('calendarHeading');
  if (!grid || !heading) return;

  const year = calendarCursorDate.getFullYear();
  const month = calendarCursorDate.getMonth();
  heading.textContent = calendarCursorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const todayStr = toLocalDateString(new Date());
  const filtered = getFilteredTasks().filter((t) => t.title.trim() !== '');

  grid.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const dateStr = toLocalDateString(cellDate);
    const isOther = cellDate.getMonth() !== month;
    const isToday = dateStr === todayStr;

    const cell = document.createElement('div');
    cell.className = `cal-day-cell ${isOther ? 'other-month' : ''} ${isToday ? 'is-today' : ''}`;
    cell.innerHTML = `<div class="cal-day-num">${cellDate.getDate()}</div>`;

    filtered
      .filter((t) => t.dueDate === dateStr)
      .forEach((task) => {
        const chip = document.createElement('div');
        chip.className = 'cal-event-chip';
        chip.textContent = `${task.dueTime ? task.dueTime + ' ' : ''}${task.title}`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          openTaskDrawer(task.id);
        });
        cell.appendChild(chip);
      });

    state.externalEvents
      .filter((ev) => ev.date === dateStr)
      .forEach((ev) => {
        const chip = document.createElement('div');
        chip.className = 'cal-event-chip';
        chip.style.borderLeftColor = '#16a34a';
        chip.textContent = `📅 ${ev.time ? ev.time + ' ' : ''}${ev.title}`;
        cell.appendChild(chip);
      });

    cell.addEventListener('click', () => openCreateTaskModal({ dueDate: dateStr }));
    grid.appendChild(cell);
  }
}

// ==========================================================================
// VIEW 4: OVERVIEW VIEW
// ==========================================================================

function renderOverviewView() {
  const todayStr = toLocalDateString(new Date());
  const nextWeekStr = addDays(new Date(), 7);
  const allTasks = getFilteredTasks().filter((t) => t.title.trim() !== '');
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
  setText('statCompletionRate', `${rate}% completed`);

  const urgentEl = document.getElementById('overviewUrgentList');
  if (urgentEl) {
    urgentEl.innerHTML = '';
    if (active.length === 0) {
      urgentEl.innerHTML = `<div style="color:var(--text-muted)">No active tasks yet.</div>`;
    } else {
      active.slice(0, 6).forEach((t) => {
        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.innerHTML = `
          <span>${escapeHtml(t.title)}</span>
          <a href="${buildGoogleCalendarTemplateUrl(t)}" target="_blank" rel="noopener" class="gcal-mini-link">+GCal</a>
        `;
        item.addEventListener('click', (e) => {
          if (!e.target.closest('a')) openTaskDrawer(t.id);
        });
        urgentEl.appendChild(item);
      });
    }
  }

  const agendaEl = document.getElementById('overviewAgendaList');
  if (agendaEl) {
    agendaEl.innerHTML = '';
    const merged = [
      ...active.filter((t) => t.dueDate).map((t) => ({ title: t.title, date: t.dueDate, isTask: true, id: t.id })),
      ...state.externalEvents.map((e) => ({ title: e.title, date: e.date, isTask: false }))
    ].slice(0, 6);

    if (merged.length === 0) {
      agendaEl.innerHTML = `<div style="color:var(--text-muted)">No scheduled deadlines or Google Calendar events.</div>`;
    } else {
      merged.forEach((m) => {
        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.innerHTML = `<span>${m.isTask ? '📌' : '📅'} ${escapeHtml(m.title)}</span><span style="color:var(--text-muted)">${formatHumanDate(m.date)}</span>`;
        agendaEl.appendChild(item);
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

  const proj = getProjectById(task.projectId);
  const secSelect = document.getElementById('drawerTaskSection');
  if (secSelect && proj) {
    secSelect.innerHTML = (proj.sections || [{ id: 'sec_default', name: 'General' }])
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name || 'General')}</option>`)
      .join('');
    secSelect.value = task.sectionId || (proj.sections[0] && proj.sections[0].id) || 'sec_default';
  }

  document.getElementById('drawerTaskId').value = task.id;
  document.getElementById('drawerTaskTitle').value = task.title;
  document.getElementById('drawerTaskProject').value = task.projectId;
  document.getElementById('drawerTaskStatus').value = task.status || 'todo';
  document.getElementById('drawerTaskPriority').value = task.priority || '';
  document.getElementById('drawerTaskDueDate').value = task.dueDate || '';
  document.getElementById('drawerTaskDueTime').value = task.dueTime || '';
  document.getElementById('drawerTaskDuration').value = task.duration || '60';
  document.getElementById('drawerTaskRecurrence').value = task.recurrence || 'none';
  document.getElementById('drawerTaskTags').value = (task.tags || []).join(', ');
  document.getElementById('drawerTaskDescription').value = task.description || '';

  const check = document.getElementById('drawerTaskCompleted');
  const label = document.getElementById('drawerCompleteLabelText');
  if (check && label) {
    check.checked = Boolean(task.completed);
    label.textContent = task.completed ? '✓ Completed' : '✓ Mark complete';
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
    li.className = 'subtask-item';
    li.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;">
        <input type="checkbox" ${sub.done ? 'checked' : ''}>
        <span style="${sub.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${escapeHtml(sub.title)}</span>
      </label>
      <button type="button" class="row-del-btn" aria-label="Remove subtask">✕</button>
    `;
    li.querySelector('input').addEventListener('change', () => {
      sub.done = !sub.done;
      saveState();
      renderDrawerSubtasks(task);
    });
    li.querySelector('button').addEventListener('click', () => {
      task.subtasks = task.subtasks.filter((s) => s.id !== sub.id);
      saveState();
      renderDrawerSubtasks(task);
    });
    listEl.appendChild(li);
  });
}

// ==========================================================================
// GitHub Gist Cloud Sync
// ==========================================================================

async function pushToGitHubGist() {
  const token = (state.settings.gistToken || '').trim();
  if (!token) {
    showToast('Enter a GitHub Token (gist scope).');
    return;
  }
  const payload = {
    description: 'Asana Workspace Sync',
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.settings.gistId = data.id;
    const idInput = document.getElementById('gistIdInput');
    if (idInput) idInput.value = data.id;
    saveState();
    showToast('Synced to GitHub Gist!');
  } catch (err) {
    showToast(`Gist error: ${err.message}`);
  }
}

async function pullFromGitHubGist() {
  const token = (state.settings.gistToken || '').trim();
  const gistId = (state.settings.gistId || '').trim();
  if (!gistId) {
    showToast('Enter your Gist ID.');
    return;
  }
  try {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const content = data.files?.['asanaflow_workspace.json']?.content;
    if (!content) throw new Error('No workspace file in Gist');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.projects)) state.projects = parsed.projects;
    if (Array.isArray(parsed.tasks)) state.tasks = parsed.tasks;
    if (Array.isArray(parsed.externalEvents)) state.externalEvents = parsed.externalEvents;
    saveState();
    renderAll();
    showToast('Pulled latest tasks from Gist!');
  } catch (err) {
    showToast(`Pull error: ${err.message}`);
  }
}

// ==========================================================================
// View Switching & Event Wiring
// ==========================================================================

function switchView(viewName) {
  activeView = viewName;
  ['overview', 'list', 'board', 'calendar'].forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      el.hidden = v !== viewName;
      el.classList.toggle('active', v === viewName);
    }
  });

  document.querySelectorAll('.project-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  renderAll();
}

function openCreateTaskModal(defaults = {}) {
  const modal = document.getElementById('taskModal');
  if (!modal) return;
  document.getElementById('modalTaskTitleInput').value = defaults.title || '';
  document.getElementById('modalTaskPriority').value = defaults.priority || '';
  document.getElementById('modalTaskDueDate').value = defaults.dueDate || '';
  document.getElementById('modalTaskDueTime').value = defaults.dueTime || '';
  document.getElementById('modalTaskDesc').value = '';
  modal.showModal();
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3200);
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

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setupDialogLightDismissFallbacks();

  // Toggle sidebar
  document.getElementById('toggleSidebarBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('collapsed');
  });

  // Topbar "+ Create" button
  document.getElementById('globalCreateBtn')?.addEventListener('click', () => openCreateTaskModal());

  // Sub-tabs (Overview | List | Board | Calendar)
  document.querySelectorAll('.project-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // Left sidebar nav items
  document.getElementById('sideNavHome')?.addEventListener('click', () => switchView('overview'));
  document.getElementById('sideNavInbox')?.addEventListener('click', () => switchView('calendar'));
  document.getElementById('sideNavMyTasks')?.addEventListener('click', () => {
    selectedProjectId = 'all';
    switchView('list');
  });
  document.getElementById('sideNavProjects')?.addEventListener('click', () => switchView('board'));
  document.getElementById('sideNavPortfolios')?.addEventListener('click', () => switchView('overview'));

  // Slim rail buttons
  document.getElementById('railWorkBtn')?.addEventListener('click', () => switchView('list'));
  document.getElementById('railCalendarBtn')?.addEventListener('click', () => switchView('calendar'));
  document.getElementById('railGcalBtn')?.addEventListener('click', () => {
    document.getElementById('gcalModal')?.showModal();
  });
  document.getElementById('railBackupBtn')?.addEventListener('click', () => {
    document.getElementById('syncBackupModal')?.showModal();
  });
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

  // "+ Add task" button in sub-toolbar -> immediately adds a row to the table & focuses it!
  document.getElementById('inlineAddTaskBtn')?.addEventListener('click', () => {
    switchView('list');
    const newTask = createNewTask({ title: '' });
    renderAll();
    focusTaskRowInput(newTask.id);
  });

  // "+ Add section" buttons
  document.getElementById('inlineAddSectionTopBtn')?.addEventListener('click', addSectionToCurrentProject);
  document.getElementById('bottomAddSectionBtn')?.addEventListener('click', addSectionToCurrentProject);

  // Rename project by clicking title or chevron
  const promptRenameProject = () => {
    if (selectedProjectId === 'all') return;
    const proj = getProjectById(selectedProjectId);
    if (!proj) return;
    const nextName = prompt('Rename project:', proj.name);
    if (nextName && nextName.trim()) {
      proj.name = nextName.trim();
      saveState();
      renderAll();
    }
  };
  document.getElementById('currentViewTitle')?.addEventListener('click', promptRenameProject);
  document.getElementById('renameProjectBtn')?.addEventListener('click', promptRenameProject);

  // Search (Ctrl+K or /)
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

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
  });

  // Filter & Sort selects
  document.getElementById('statusFilterSelect')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    renderAll();
  });
  document.getElementById('priorityFilterSelect')?.addEventListener('change', (e) => {
    priorityFilter = e.target.value;
    renderAll();
  });
  document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    sortBy = e.target.value;
    state.settings.sortBy = sortBy;
    saveState();
    renderAll();
  });

  // Create Task Modal
  const modalTaskForm = document.getElementById('modalTaskForm');
  attachImeSafeEnterSubmit(document.getElementById('modalTaskTitleInput'), modalTaskForm, false);
  modalTaskForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTask = createNewTask({
      title: document.getElementById('modalTaskTitleInput').value,
      projectId: document.getElementById('modalTaskProject').value,
      priority: document.getElementById('modalTaskPriority').value,
      dueDate: document.getElementById('modalTaskDueDate').value,
      dueTime: document.getElementById('modalTaskDueTime').value,
      description: document.getElementById('modalTaskDesc').value
    });
    document.getElementById('taskModal')?.close();
    renderAll();
    if (document.getElementById('modalTaskAutoGcal')?.checked && newTask.dueDate) {
      await pushTaskToGoogleCalendarApi(newTask);
    }
  });

  // New Project Modal
  const openProjModal = () => document.getElementById('projectModal')?.showModal();
  document.getElementById('openNewProjectModalBtn')?.addEventListener('click', openProjModal);
  document.getElementById('tabAddProjectBtn')?.addEventListener('click', openProjModal);

  const projForm = document.getElementById('projectModalForm');
  attachImeSafeEnterSubmit(document.getElementById('newProjectName'), projForm, false);
  projForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('newProjectName').value.trim();
    if (!name) return;
    const color = document.getElementById('newProjectColor').value || '#f06a9a';
    const newProj = {
      id: generateId('proj'),
      name,
      color,
      sections: [{ id: 'sec_default', name: '' }]
    };
    state.projects.push(newProj);
    selectedProjectId = newProj.id;
    saveState();
    document.getElementById('newProjectName').value = '';
    document.getElementById('projectModal')?.close();
    renderAll();
  });

  // Drawer form & subtasks
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
    task.title = document.getElementById('drawerTaskTitle').value.trim();
    task.projectId = document.getElementById('drawerTaskProject').value;
    task.sectionId = document.getElementById('drawerTaskSection').value;
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
    showToast('Saved task');
  });

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
    if (task && task.dueDate) {
      downloadFile(`${task.title || 'task'}.ics`, generateIcsContent([task]), 'text/calendar');
    } else {
      showToast('Set a Due date first to export .ics');
    }
  });
  document.getElementById('drawerDeleteTaskBtn')?.addEventListener('click', () => {
    if (activeDrawerTaskId) deleteTask(activeDrawerTaskId);
  });

  // Calendar controls
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

  // Google Calendar Modal & .ics
  const openGcal = () => document.getElementById('gcalModal')?.showModal();
  document.getElementById('openGcalModalBtn')?.addEventListener('click', openGcal);
  document.getElementById('topbarSyncGcalBtn')?.addEventListener('click', openGcal);
  document.getElementById('toolbarOptionsGcalBtn')?.addEventListener('click', openGcal);

  const exportAllIcs = () => {
    const withDates = state.tasks.filter((t) => t.dueDate && t.title.trim() !== '');
    if (withDates.length === 0) {
      showToast('Add a due date to at least one task to export .ics');
      return;
    }
    downloadFile('asana_deadlines.ics', generateIcsContent(withDates), 'text/calendar');
  };
  document.getElementById('exportAllIcsBtn')?.addEventListener('click', exportAllIcs);
  document.getElementById('modalExportIcsBtn')?.addEventListener('click', exportAllIcs);

  document.getElementById('icsFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseIcsFileContent(String(reader.result || ''));
      state.externalEvents = [...state.externalEvents, ...parsed];
      saveState();
      renderAll();
      showToast(`Imported ${parsed.length} calendar events`);
    };
    reader.readAsText(file);
  });

  document.getElementById('clearImportedEventsBtn')?.addEventListener('click', () => {
    state.externalEvents = [];
    saveState();
    renderAll();
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
  });

  // Backup & Gist Modal
  document.getElementById('openSyncBackupModalBtn')?.addEventListener('click', () => {
    document.getElementById('syncBackupModal')?.showModal();
  });
  document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
    downloadFile('asana_backup.json', JSON.stringify(state, null, 2), 'application/json');
  });
  document.getElementById('importJsonInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (Array.isArray(parsed.projects)) {
          state = { ...createDefaultState(), ...parsed };
          saveState();
          renderAll();
          showToast('Restored backup');
        }
      } catch (err) {
        showToast('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('clearAllTasksBtn')?.addEventListener('click', () => {
    state.tasks = [];
    state.externalEvents = [];
    saveState();
    renderAll();
    showToast('Cleared all tasks');
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

  renderAll();
});
