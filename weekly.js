const STORAGE_KEY = 'offlineClassScheduler.v1';
const API_CONFIG_KEY = 'offlineClassScheduler.apiConfig.v1';
const API_REVISION_KEY = 'offlineClassScheduler.apiRevision.v1';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_ROOM_ID = '__default_classroom__';
const DEFAULT_ROOM_NAME = 'Default Classroom';
const NO_TEACHER_LABEL = 'No Teacher (NT)';
const MANUAL_SCHEDULE_CONFLICT_OPTIONS = Object.freeze({
  ignoreStudentTransitionBuffer: true,
  ignoreTeacherDailyClassLimit: true
});
const defaultData = { settings: { dayStart: '07:30', dayEnd: '16:30', slotDuration: 50, dayStarts: { Monday: '07:50', Tuesday: '07:30', Wednesday: '07:30', Thursday: '07:30', Friday: '07:30' } }, sections: [], subjects: [], teachers: [], rooms: [], teachingLoads: [], fixedActivities: [], schedules: [], scheduleWaitlist: [], generatorRun: 0 };

let schedulerData = loadData();
let syncConfig = loadSyncConfig();
let remoteRevision = Number(localStorage.getItem(API_REVISION_KEY) || 0);
let pushTimer = null;
let editing = false;
let currentKind = null;
let currentId = null;
let currentEntity = null;
let browserMode = null;
let activeDragScheduleId = null;
let pointerDragState = null;
let swapMode = false;
let swapSelectedScheduleId = null;
let swapOptionsById = new Map();
let suppressSwapClick = false;

const els = {
  viewEyebrow: document.getElementById('viewEyebrow'), viewTitle: document.getElementById('viewTitle'), viewSubtitle: document.getElementById('viewSubtitle'), printBtn: document.getElementById('printBtn'), closeBtn: document.getElementById('closeBtn'), refreshBtn: document.getElementById('refreshBtn'), editToggle: document.getElementById('editToggle'),
  totalClasses: document.getElementById('totalClasses'), totalMinutes: document.getElementById('totalMinutes'), dailySummary: document.getElementById('dailySummary'), generatedAt: document.getElementById('generatedAt'), calendarBody: document.getElementById('calendarBody'), statusLine: document.getElementById('statusLine'), navigatorCard: document.getElementById('navigatorCard'), navigatorSelect: document.getElementById('navigatorSelect'), navigatorLabel: document.getElementById('navigatorLabel'), navigatorHint: document.getElementById('navigatorHint'), exportAllTeacherXlsxBtn: document.getElementById('exportAllTeacherXlsxBtn'), exportIcsBtn: document.getElementById('exportIcsBtn'),
  messageModal: document.getElementById('messageModal'), modalMessage: document.getElementById('modalMessage'), modalOkBtn: document.getElementById('modalOkBtn'), modalCloseBtn: document.getElementById('modalCloseBtn')
};

function injectSwapStyles() {
  if (document.getElementById('swapFeatureStyles')) return;
  const style = document.createElement('style');
  style.id = 'swapFeatureStyles';
  style.textContent = `
    body.swap-mode-active .class-block.event-block:not(.fixed-block) { cursor: pointer; outline: 2px dashed rgba(37, 99, 235, .45); outline-offset: 2px; }
    .swap-modal-panel { max-width: min(920px, calc(100vw - 32px)); }
    .swap-selected-card { background: #eef4ff; border: 1px solid #c7d8ff; border-radius: 16px; padding: 14px 16px; margin: 12px 0 16px; color: #1f2937; }
    .swap-list { display: grid; gap: 10px; max-height: min(52vh, 520px); overflow: auto; padding-right: 4px; }
    .swap-candidate { width: 100%; text-align: left; border: 1px solid #d8e1ef; border-radius: 14px; background: #fff; padding: 12px 14px; color: #1f2937; cursor: pointer; }
    .swap-candidate:hover, .swap-candidate:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); outline: none; }
    .swap-candidate strong { display: block; font-size: 14px; margin-bottom: 4px; }
    .swap-candidate span { display: block; color: #5b677a; font-size: 13px; line-height: 1.35; }
    .swap-option-kind { display: inline-block !important; width: fit-content; margin: 0 0 6px; padding: 3px 8px; border-radius: 999px; background: #e8efff; color: #1d4ed8 !important; font-size: 11px !important; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .swap-empty { padding: 18px; border: 1px dashed #cbd5e1; border-radius: 14px; color: #5b677a; background: #f8fafc; }
    .swap-mode-note { margin: 8px 0 0; color: #5b677a; font-size: 13px; }
  `;
  document.head.appendChild(style);
}

function ensureSwapUi() {
  injectSwapStyles();
  if (!document.getElementById('swapToggle')) {
    const button = document.createElement('button');
    button.id = 'swapToggle';
    button.className = 'secondary';
    button.type = 'button';
    button.textContent = 'Swap Mode: Off';
    els.editToggle?.insertAdjacentElement('afterend', button);
  }
  if (!document.getElementById('swapModal')) {
    const modal = document.createElement('div');
    modal.id = 'swapModal';
    modal.className = 'modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-backdrop" data-swap-close></div>
      <div class="modal-panel swap-modal-panel" role="document">
        <button type="button" id="swapModalCloseBtn" class="modal-close" aria-label="Close swap dialog">&times;</button>
        <div class="modal-icon">⇄</div>
        <p class="eyebrow modal-label">Swap Class</p>
        <h2 id="swapModalTitle">Compatible Swap Options</h2>
        <p id="swapModalMessage" class="modal-message">Select a compatible class or an adjacent pair of 50-minute classes from the same section.</p>
        <div id="swapSelectedCard" class="swap-selected-card"></div>
        <div id="swapCandidateList" class="swap-list"></div>
        <p class="swap-mode-note">Only conflict-free swaps are shown. Composite swaps treat two adjacent 50-minute classes and one 100-minute class as a single transaction. Manual swaps may override the PEHM/AdTech/CS transition-buffer preference and the four-classes-per-day teacher cap. Section, teacher, room, fixed-slot, official-start, lunch, one-SWP/30-minute-per-day, and school-hour protections remain enforced.</p>
        <div class="modal-actions">
          <button type="button" id="swapCancelBtn" class="secondary">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  els.swapToggle = document.getElementById('swapToggle');
  els.swapModal = document.getElementById('swapModal');
  els.swapSelectedCard = document.getElementById('swapSelectedCard');
  els.swapCandidateList = document.getElementById('swapCandidateList');
  els.swapCancelBtn = document.getElementById('swapCancelBtn');
  els.swapModalCloseBtn = document.getElementById('swapModalCloseBtn');
}

function getDefaultDayStarts(start = defaultData.settings.dayStart) {
  const starts = DAYS.reduce((map, day) => ({ ...map, [day]: start }), {});
  if (start === defaultData.settings.dayStart && defaultData.settings.dayStarts) {
    Object.assign(starts, defaultData.settings.dayStarts);
  }
  return starts;
}
function normalizeSettings(settings = {}) {
  const merged = { ...defaultData.settings, ...(settings || {}) };
  const baseStart = merged.dayStart || defaultData.settings.dayStart;
  merged.dayStarts = { ...getDefaultDayStarts(baseStart), ...(settings.dayStarts || {}) };
  DAYS.forEach(day => { if (!merged.dayStarts[day]) merged.dayStarts[day] = baseStart; });
  return merged;
}
function normalizeData(source) {
  const safe = source || {};
  return {
    settings: normalizeSettings(safe.settings),
    sections: Array.isArray(safe.sections) ? safe.sections : [],
    subjects: Array.isArray(safe.subjects) ? safe.subjects : [],
    teachers: Array.isArray(safe.teachers) ? safe.teachers.map(teacher => ({
      ...teacher,
      startTime: teacher.startTime || teacher.officialStartTime || safe.settings?.dayStart || defaultData.settings.dayStart
    })) : [],
    rooms: Array.isArray(safe.rooms) ? safe.rooms : [],
    teachingLoads: Array.isArray(safe.teachingLoads) ? safe.teachingLoads : [],
    fixedActivities: Array.isArray(safe.fixedActivities) ? safe.fixedActivities : [],
    scheduleWaitlist: Array.isArray(safe.scheduleWaitlist) ? safe.scheduleWaitlist : [],
    generatorRun: Number(safe.generatorRun || 0),
    schedules: Array.isArray(safe.schedules) ? safe.schedules.map(schedule => ({
      ...schedule,
      roomId: schedule.roomId || DEFAULT_ROOM_ID,
      roomMode: schedule.roomMode || (schedule.roomId ? 'manual' : 'default')
    })) : []
  };
}
function readWindowPayload() { const prefix = 'OFFLINE_SCHEDULER_WEEKLY::'; try { if (!window.name || !window.name.startsWith(prefix)) return null; return JSON.parse(window.name.slice(prefix.length)); } catch (error) { console.error(error); return null; } }
function loadData() {
  const payload = readWindowPayload();
  const payloadData = payload?.data ? normalizeData(payload.data) : null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedData = saved ? normalizeData(JSON.parse(saved)) : null;
    if (savedData && payloadData) return savedData.schedules.length >= payloadData.schedules.length ? savedData : payloadData;
    return savedData || payloadData || normalizeData(defaultData);
  } catch (error) { console.error(error); return payloadData || normalizeData(defaultData); }
}
function saveData(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedulerData));
  if (window.opener && !window.opener.closed) window.opener.postMessage({ type: 'scheduler-data-updated' }, '*');
  if (!options.localOnly) schedulePushToServer();
}
function loadSyncConfig() {
  try {
    const saved = localStorage.getItem(API_CONFIG_KEY);
    return saved ? { enabled: false, apiBaseUrl: 'http://localhost:3000', ...JSON.parse(saved) } : { enabled: false, apiBaseUrl: 'http://localhost:3000' };
  } catch {
    return { enabled: false, apiBaseUrl: 'http://localhost:3000' };
  }
}
function normalizeApiBaseUrl(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function getApiBaseUrl() { return normalizeApiBaseUrl(syncConfig.apiBaseUrl) || window.location.origin; }
async function apiRequest(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.message || `Server request failed (${response.status}).`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}
function schedulePushToServer() {
  if (!syncConfig.enabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushToServer({ silent: true }), 650);
}
async function pullFromServer({ silent = false } = {}) {
  if (!syncConfig.enabled) return false;
  try {
    const result = await apiRequest('/api/scheduler');
    schedulerData = normalizeData(result.data || defaultData);
    remoteRevision = Number(result.revision || 0);
    localStorage.setItem(API_REVISION_KEY, String(remoteRevision));
    saveData({ localOnly: true });
    if (!silent) showStatus(`Synced from server. Revision ${remoteRevision}.`);
    return true;
  } catch (error) {
    if (!silent) showModal(error.message || 'Could not connect to the MongoDB API server.');
    return false;
  }
}
async function pushToServer({ silent = false } = {}) {
  if (!syncConfig.enabled) return false;
  try {
    const result = await apiRequest('/api/scheduler', { method: 'PUT', body: JSON.stringify({ data: normalizeData(schedulerData), expectedRevision: remoteRevision }) });
    remoteRevision = Number(result.revision || 0);
    localStorage.setItem(API_REVISION_KEY, String(remoteRevision));
    if (!silent) showStatus(`Saved to server. Revision ${remoteRevision}.`);
    return true;
  } catch (error) {
    if (error.status === 409 && error.body?.data) {
      schedulerData = normalizeData(error.body.data);
      remoteRevision = Number(error.body.revision || remoteRevision || 0);
      localStorage.setItem(API_REVISION_KEY, String(remoteRevision));
      saveData({ localOnly: true });
      renderCalendar();
      showModal('Another user updated the schedule before your edit was saved. The latest server copy was loaded. Please apply the move again if needed.');
      return false;
    }
    if (!silent) showModal(error.message || 'Could not save to the MongoDB API server.');
    return false;
  }
}
async function pushDataToServerSnapshot(snapshotData) {
  if (!syncConfig.enabled) return { ok: true, revision: remoteRevision };
  try {
    const result = await apiRequest('/api/scheduler', {
      method: 'PUT',
      body: JSON.stringify({ data: normalizeData(snapshotData), expectedRevision: remoteRevision })
    });
    remoteRevision = Number(result.revision || 0);
    localStorage.setItem(API_REVISION_KEY, String(remoteRevision));
    return { ok: true, revision: remoteRevision };
  } catch (error) {
    if (error.status === 409 && error.body?.data) {
      return {
        ok: false,
        conflict: true,
        data: normalizeData(error.body.data),
        revision: Number(error.body.revision || remoteRevision || 0)
      };
    }
    return { ok: false, conflict: false, error };
  }
}

async function saveMoveToServerWithRetry(scheduleId, targetDay, targetStart) {
  if (!syncConfig.enabled) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await pushDataToServerSnapshot(schedulerData);
    if (result.ok) return true;
    if (!result.conflict) {
      showModal(result.error?.message || 'Could not save the move to the MongoDB API server.');
      return false;
    }

    schedulerData = result.data;
    remoteRevision = Number(result.revision || remoteRevision || 0);
    localStorage.setItem(API_REVISION_KEY, String(remoteRevision));

    const latestSchedule = schedulerData.schedules.find(item => item.id === scheduleId);
    if (!latestSchedule) {
      saveData({ localOnly: true });
      renderCalendar();
      showModal('This class was changed or deleted on the latest server copy. Refresh this weekly view and try again.');
      return false;
    }

    const candidate = { ...latestSchedule, day: targetDay, start: targetStart };
    const conflicts = getConflicts(candidate, latestSchedule.id, allScheduleItems(), MANUAL_SCHEDULE_CONFLICT_OPTIONS);
    if (conflicts.length) {
      saveData({ localOnly: true });
      renderCalendar();
      showModal(conflicts.join('\n'));
      return false;
    }

    latestSchedule.day = targetDay;
    latestSchedule.start = targetStart;
    saveData({ localOnly: true });
  }
  renderCalendar();
  showModal('The schedule changed while saving. Please apply the move again.');
  return false;
}

async function saveSwapOperationToServerWithRetry(operation) {
  if (!syncConfig.enabled) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await pushDataToServerSnapshot(schedulerData);
    if (result.ok) return true;
    if (!result.conflict) {
      showModal(result.error?.message || 'Could not save the swap to the MongoDB API server.');
      return false;
    }

    schedulerData = result.data;
    remoteRevision = Number(result.revision || remoteRevision || 0);
    localStorage.setItem(API_REVISION_KEY, String(remoteRevision));

    const state = buildSwapOperationState(operation);
    if (state.errors.length) {
      saveData({ localOnly: true });
      renderCalendar();
      showModal(`${state.errors.join('\n')}\n\nThe selected classes changed on the latest server copy. Refresh this weekly view and try again.`);
      return false;
    }

    const conflicts = getSwapOperationConflicts(operation);
    if (conflicts.length) {
      saveData({ localOnly: true });
      renderCalendar();
      showModal(conflicts.join('\n'));
      return false;
    }

    const applied = applySwapOperation(operation);
    if (!applied.ok) {
      saveData({ localOnly: true });
      renderCalendar();
      showModal(applied.errors.join('\n'));
      return false;
    }
    saveData({ localOnly: true });
  }
  renderCalendar();
  showModal('The schedule changed while saving. Please apply the swap again.');
  return false;
}
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function toMinutes(time) { const [h,m] = String(time || '00:00').split(':').map(Number); return h * 60 + m; }
function fromMinutes(total) { const h = Math.floor(total / 60) % 24; const m = total % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
function formatTime(time) { const [h,m] = String(time || '00:00').split(':').map(Number); const suffix = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${suffix}`; }
function getEndTime(start, duration) { return fromMinutes(toMinutes(start) + Number(duration || 0)); }
function timeRange(start, duration) { return `${formatTime(start)} - ${formatTime(getEndTime(start, duration))}`; }
function overlaps(aStart, aDuration, bStart, bDuration) { const aEnd = toMinutes(aStart) + Number(aDuration || 0); const bEnd = toMinutes(bStart) + Number(bDuration || 0); return toMinutes(aStart) < bEnd && toMinutes(bStart) < aEnd; }
function isDefaultRoom(roomId) { return !roomId || roomId === DEFAULT_ROOM_ID; }
function byName(list, id) { if (isDefaultRoom(id)) return DEFAULT_ROOM_NAME; const match = list.find(item => item.id === id); if (match) return match.name; const nameMatch = list.find(item => item.name === id); return nameMatch ? nameMatch.name : 'Deleted Item'; }
function isNoTeacherId(value) { return !String(value || '').trim(); }
function teacherName(teacherId) { return isNoTeacherId(teacherId) ? NO_TEACHER_LABEL : byName(schedulerData.teachers, teacherId); }
function isFixedSubjectActivity(activity) { return String(activity?.category || '').toLowerCase() === 'fixedsubject'; }
function isBatchSubjectActivity(activity) { return ['batchsubject', 'batchfixedsubject', 'batch'].includes(String(activity?.category || '').toLowerCase()); }
function normalizeBatchOffering(activity, offering = {}, index = 0) {
  const teacherId = offering.teacherId || offering.teacher || '';
  const roomMode = offering.roomMode || (isDefaultRoom(offering.roomId) ? 'default' : 'manual');
  const roomId = roomMode === 'manual' ? (offering.roomId || '') : DEFAULT_ROOM_ID;
  return {
    id: offering.id || `offering_${teacherId || index}_${index}`,
    title: String(offering.title || offering.name || activity?.title || 'Elective').trim(),
    teacherId,
    roomMode,
    roomId
  };
}
function getBatchOfferings(activity) {
  const rawOfferings = Array.isArray(activity?.offerings) ? activity.offerings : [];
  const clean = rawOfferings.map((offering, index) => normalizeBatchOffering(activity, offering, index)).filter(offering => offering.teacherId);
  if (clean.length) return clean;
  const legacyTeacherIds = Array.isArray(activity?.teacherIds) ? activity.teacherIds : [activity?.teacherId].filter(Boolean);
  return legacyTeacherIds.map((teacherId, index) => normalizeBatchOffering(activity, { teacherId, title: activity?.title || 'Elective', roomMode: 'default', roomId: DEFAULT_ROOM_ID }, index));
}
function isFixedTeachingActivity(activity) { return isFixedSubjectActivity(activity) || isBatchSubjectActivity(activity); }
function isFixedSubjectSchedule(item) { return isFixedSchedule(item) && String(item?.category || '').toLowerCase() === 'fixedsubject'; }
function isBatchSubjectSchedule(item) { return isFixedSchedule(item) && ['batchsubjectsection', 'batchsubjectteacher', 'batchsubjectoffering'].includes(String(item?.category || '').toLowerCase()); }
function isFixedTeachingSchedule(item) { return isFixedSubjectSchedule(item) || isBatchSubjectSchedule(item); }
function isNonTeachingFixedSchedule(item) { return isFixedSchedule(item) && !isFixedTeachingSchedule(item); }
function isClassLikeSchedule(item) { return !isFixedSchedule(item) || isFixedTeachingSchedule(item); }
function getClassItemsOnly(schedules = []) { return (schedules || []).filter(isClassLikeSchedule); }
function fixedDisplayTitle(item) { return item?.title || (item?.subjectId ? byName(schedulerData.subjects, item.subjectId) : 'Fixed Activity'); }
function getDayTeachingStart(day, source = schedulerData) {
  const settings = normalizeSettings(source.settings || defaultData.settings);
  return settings.dayStarts?.[day] || settings.dayStart || defaultData.settings.dayStart;
}
function getDayEnd(day, source = schedulerData) {
  return normalizeSettings(source.settings || defaultData.settings).dayEnd || defaultData.settings.dayEnd;
}
function generateSlots(day, source = schedulerData) {
  const settings = normalizeSettings(source.settings || defaultData.settings);
  const start = toMinutes(getDayTeachingStart(day, source));
  const end = toMinutes(settings.dayEnd || defaultData.settings.dayEnd);
  const step = Number(settings.slotDuration || 50);
  const slots = [];
  for (let t = start; t < end; t += step) slots.push(fromMinutes(t));
  return slots;
}
function isValidTeachingSlot(day, start, duration = 50, source = schedulerData) {
  return generateSlots(day, source).includes(start) && toMinutes(start) + Number(duration || 0) <= toMinutes(getDayEnd(day, source));
}
function getTeacherStartTime(teacherId, source = schedulerData) { const teacher = (source.teachers || []).find(item => item.id === teacherId || item.name === teacherId); return teacher?.startTime || teacher?.officialStartTime || source.settings?.dayStart || defaultData.settings.dayStart; }
function getTeacherStartConflict(schedule, source = schedulerData) { if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId) return ''; const teacher = (source.teachers || []).find(item => item.id === schedule.teacherId || item.name === schedule.teacherId); if (!teacher) return ''; const officialStart = getTeacherStartTime(schedule.teacherId, source); if (toMinutes(schedule.start) < toMinutes(officialStart)) return `${teacher.name} officially starts at ${formatTime(officialStart)}, so they cannot be assigned to ${formatTime(schedule.start)}.`; return ''; }
function isLunchSchedule(item) { const label = `${item?.title || ''} ${item?.category || ''}`.toLowerCase(); return isFixedSchedule(item) && label.includes('lunch'); }
function getLunchBlocks(source = schedulerData) { return expandFixedActivities(source).filter(isLunchSchedule); }
function getTeacherLunchWindow(source = schedulerData) { return { start: source.settings?.teacherLunchStart || '10:00', end: source.settings?.teacherLunchEnd || '13:30', duration: Number(source.settings?.teacherLunchDuration || 60) }; }
function teacherBusySlotsForDay(teacherId, day, schedules = getDisplayScheduleItems(), candidate = null, ignoreId = null, source = schedulerData) {
  const candidateId = candidate?.id || '__candidate__';
  return [...(schedules || []), candidate]
    .filter(Boolean)
    .filter(item => item.day === day && item.teacherId === teacherId)
    .filter(item => item.id !== ignoreId)
    .filter(item => item.id !== candidateId || item === candidate)
    .filter(item => isClassLikeSchedule(item))
    .map(item => ({ start: toMinutes(item.start), end: toMinutes(item.start) + Number(item.duration || 0) }))
    .filter(slot => slot.end > slot.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
function teacherHasOpenWindowOnDay(teacherId, day, startMinute, duration, schedules, candidate, ignoreId, source = schedulerData) {
  const endMinute = startMinute + Number(duration || 0);
  return !teacherBusySlotsForDay(teacherId, day, schedules, candidate, ignoreId, source)
    .some(slot => startMinute < slot.end && slot.start < endMinute);
}
function hasTeacherLunchWindowFor(teacherId, day, schedules = allScheduleItems(), candidate = null, ignoreId = null, source = schedulerData) {
  if (!teacherId || !day) return true;
  const window = getTeacherLunchWindow(source);
  const windowStart = toMinutes(window.start);
  const windowEnd = toMinutes(window.end);
  const needed = Math.max(1, Number(window.duration || 50));
  if (windowEnd <= windowStart || needed > (windowEnd - windowStart)) return true;

  const commonLunchDays = ['Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (commonLunchDays.includes(day)) {
    for (let start = windowStart; start + needed <= windowEnd; start += 5) {
      const isCommonFree = commonLunchDays.every(commonDay =>
        teacherHasOpenWindowOnDay(teacherId, commonDay, start, needed, schedules, candidate, ignoreId, source)
      );
      if (isCommonFree) return true;
    }
    return false;
  }

  for (let start = windowStart; start + needed <= windowEnd; start += 5) {
    if (teacherHasOpenWindowOnDay(teacherId, day, start, needed, schedules, candidate, ignoreId, source)) return true;
  }
  return false;
}
function hasTeacherLunchWindow(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId || !schedule.day) return true;
  return hasTeacherLunchWindowFor(schedule.teacherId, schedule.day, schedules, schedule, ignoreId, source);
}
function hasTeacherLunchWindowBeforeCandidate(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId || !schedule.day) return true;
  return hasTeacherLunchWindowFor(schedule.teacherId, schedule.day, schedules, null, ignoreId, source);
}
function getTeacherLunchConflict(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId) return '';
  const teacher = (source.teachers || []).find(item => item.id === schedule.teacherId || item.name === schedule.teacherId);
  if (!teacher) return '';
  const afterHasLunch = hasTeacherLunchWindow(schedule, schedules, ignoreId, source);
  if (afterHasLunch) return '';
  const beforeHasLunch = hasTeacherLunchWindowBeforeCandidate(schedule, schedules, ignoreId, source);
  if (!beforeHasLunch) return '';
  const window = getTeacherLunchWindow(source);
  const commonLunchDays = ['Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (commonLunchDays.includes(schedule.day)) {
    return `${teacher.name} needs the same ${window.duration}-minute lunch window from Tuesday to Friday between ${formatTime(window.start)} and ${formatTime(window.end)}. This assignment would remove every common lunch window.`;
  }
  return `${teacher.name} needs at least ${window.duration} minutes for lunch between ${formatTime(window.start)} and ${formatTime(window.end)}. This assignment would remove all available lunch windows for the day.`;
}
function getDayWindowConflict(schedule, source = schedulerData) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.day) return '';
  const teachingStart = getDayTeachingStart(schedule.day, source);
  const dayEnd = getDayEnd(schedule.day, source);
  if (toMinutes(schedule.start) < toMinutes(teachingStart)) return `${schedule.day} teaching slots start at ${formatTime(teachingStart)}. Classes cannot be assigned to ${formatTime(schedule.start)} on this day.`;
  if (toMinutes(schedule.start) + Number(schedule.duration || 0) > toMinutes(dayEnd)) return `This class goes beyond the ${schedule.day} school day end time of ${formatTime(dayEnd)}.`;
  return '';
}
function isFixedSchedule(item) { return item?.type === 'fixed' || Boolean(item?.fixedActivityId); }
function expandFixedActivities(source = schedulerData) {
  const activities = Array.isArray(source.fixedActivities) ? source.fixedActivities : [];
  return activities.flatMap(activity => {
    const sectionIds = Array.isArray(activity.sectionIds) ? activity.sectionIds : [];
    const teacherIds = Array.isArray(activity.teacherIds) ? activity.teacherIds : [activity.teacherId].filter(Boolean);
    const offerings = getBatchOfferings(activity);
    const days = Array.isArray(activity.days) && activity.days.length ? activity.days : (activity.day ? [activity.day] : []);
    const duration = Number(activity.duration || schedulerData.settings?.slotDuration || 50);
    const fixedSubject = isFixedSubjectActivity(activity);
    const batchSubject = isBatchSubjectActivity(activity);
    const subjectName = fixedSubject ? byName(schedulerData.subjects, activity.subjectId) : '';
    if (batchSubject) {
      const title = activity.title || 'Elective';
      const sectionBlocks = sectionIds.flatMap(sectionId => days.map(day => ({
        id: `fixed_${activity.id}_section_${sectionId}_${day}`,
        fixedActivityId: activity.id,
        type: 'fixed',
        protected: true,
        title,
        category: 'batchSubjectSection',
        sectionId,
        subjectId: null,
        teacherId: null,
        roomId: DEFAULT_ROOM_ID,
        roomMode: 'default',
        day,
        start: activity.start,
        duration
      })));
      const teacherBlocks = offerings.flatMap(offering => days.map(day => ({
        id: `fixed_${activity.id}_offering_${offering.id}_${day}`,
        fixedActivityId: activity.id,
        offeringId: offering.id,
        type: 'fixed',
        protected: true,
        title: offering.title || title,
        displayTitle: title,
        category: 'batchSubjectTeacher',
        sectionId: null,
        subjectId: null,
        teacherId: offering.teacherId,
        roomId: offering.roomMode === 'manual' ? offering.roomId : DEFAULT_ROOM_ID,
        roomMode: offering.roomMode || 'default',
        day,
        start: activity.start,
        duration
      })));
      return [...sectionBlocks, ...teacherBlocks];
    }
    return sectionIds.flatMap(sectionId => days.map(day => ({
      id: `fixed_${activity.id}_${sectionId}_${day}`,
      fixedActivityId: activity.id,
      type: 'fixed',
      protected: true,
      title: activity.title || subjectName || 'Fixed Activity',
      category: fixedSubject ? 'fixedSubject' : (activity.category || 'fixed'),
      sectionId,
      subjectId: fixedSubject ? activity.subjectId : null,
      teacherId: fixedSubject ? activity.teacherId : null,
      roomId: fixedSubject ? (activity.roomId || DEFAULT_ROOM_ID) : DEFAULT_ROOM_ID,
      roomMode: fixedSubject ? (activity.roomMode || (isDefaultRoom(activity.roomId) ? 'default' : 'manual')) : 'default',
      day,
      start: activity.start,
      duration
    })));
  });
}
function allScheduleItems() { return [...expandFixedActivities(schedulerData), ...schedulerData.schedules]; }
function conflictLabel(item) { return isFixedTeachingSchedule(item) ? fixedDisplayTitle(item) : isFixedSchedule(item) ? `${item.title || 'Fixed Activity'} fixed block` : byName(schedulerData.subjects, item.subjectId); }
function getParams() { const params = new URLSearchParams(window.location.search); return { kind: params.get('kind'), id: params.get('id'), browse: params.get('browse') }; }
function getViewConfig(kind = currentKind) {
  return {
    section: {
      collectionName: 'sections', scheduleField: 'sectionId', legacyField: 'section', eyebrow: 'Section Weekly Calendar', subtitle: 'Monday to Friday section schedule view. Fixed activities are protected and cannot be moved.', printLabel: 'Print Section Schedule', emptyMessage: 'No weekly schedule has been created for this section yet.', missingMessage: 'Section not found. Open this view from the main scheduler again.',
      block(item) {
        if (isFixedSchedule(item) && !isFixedTeachingSchedule(item)) return [`<strong>${escapeHtml(item.title || 'Fixed Activity')}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`].join('');
        if (isBatchSubjectSchedule(item)) return [`<strong>${escapeHtml(fixedDisplayTitle(item))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`].join('');
        const subjectTitle = isFixedSubjectSchedule(item) ? (item.title || byName(schedulerData.subjects, item.subjectId)) : byName(schedulerData.subjects, item.subjectId);
        return [`<strong>${escapeHtml(subjectTitle)}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, `<span>${escapeHtml(teacherName(item.teacherId))}${isFixedSubjectSchedule(item) ? ' · Fixed Subject' : ''}</span>`, `<span>${escapeHtml(byName(schedulerData.rooms, item.roomId))}</span>`].join('');
      }
    },
    teacher: { collectionName: 'teachers', scheduleField: 'teacherId', legacyField: 'teacher', eyebrow: 'Teacher Weekly Calendar', subtitle: 'Monday to Friday teaching load view. Use this to check teacher assignments and print individual schedules.', printLabel: 'Print Teacher Schedule', emptyMessage: 'No weekly schedule has been created for this teacher yet.', missingMessage: 'Teacher not found. Open this view from the main scheduler again.', block(item) { if (isBatchSubjectSchedule(item)) return [`<strong>${escapeHtml(fixedDisplayTitle(item))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, '<span>Batch-wide elective/research block</span>', `<span>${escapeHtml(byName(schedulerData.rooms, item.roomId))}</span>`].join(''); return [`<strong>${escapeHtml(byName(schedulerData.sections, item.sectionId))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, `<span>${escapeHtml(isFixedTeachingSchedule(item) ? fixedDisplayTitle(item) : byName(schedulerData.subjects, item.subjectId))}</span>`, `<span>${escapeHtml(byName(schedulerData.rooms, item.roomId))}</span>`].join(''); } },
    room: { collectionName: 'rooms', scheduleField: 'roomId', legacyField: 'room', eyebrow: 'Room Weekly Calendar', subtitle: 'Monday to Friday laboratory/special room usage view. Print this schedule for room posting or room monitoring.', printLabel: 'Print Room Schedule', emptyMessage: 'No weekly schedule has been created for this room yet.', missingMessage: 'Room not found. Open this view from the main scheduler again.', block(item) { if (isBatchSubjectSchedule(item)) return [`<strong>${escapeHtml(fixedDisplayTitle(item))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, '<span>Batch-wide elective/research offering</span>', `<span>${escapeHtml(teacherName(item.teacherId))}</span>`].join(''); return [`<strong>${escapeHtml(byName(schedulerData.sections, item.sectionId))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, `<span>${escapeHtml(isFixedTeachingSchedule(item) ? fixedDisplayTitle(item) : byName(schedulerData.subjects, item.subjectId))}</span>`, `<span>${escapeHtml(teacherName(item.teacherId))}</span>`].join(''); } }
  }[kind] || null;
}
function getEntity(config, id) { const collection = schedulerData[config.collectionName] || []; return collection.find(item => item.id === id) || collection.find(item => item.name === id) || null; }
function scheduleMatchesView(item) {
  const config = getViewConfig();
  if (!config || !item || !currentEntity) return false;
  if (currentKind === 'room' && (isDefaultRoom(item.roomId) || isNonTeachingFixedSchedule(item))) return false;
  if (currentKind === 'teacher' && isNonTeachingFixedSchedule(item)) return false;
  return item[config.scheduleField] === currentId || item[config.scheduleField] === currentEntity.id || item[config.scheduleField] === currentEntity.name || item[config.legacyField] === currentEntity.name || item[config.legacyField] === currentEntity.id;
}
function filteredSchedules() { return allScheduleItems().filter(scheduleMatchesView).sort((a,b) => DAYS.indexOf(a.day)-DAYS.indexOf(b.day) || toMinutes(a.start)-toMinutes(b.start) || (isFixedSchedule(a) ? -1 : 1)); }
function getSpecialOpeningSlot(day, source = schedulerData) {
  const settings = normalizeSettings(source.settings || defaultData.settings);
  const schoolStart = settings.dayStart || defaultData.settings.dayStart;
  const teachingStart = getDayTeachingStart(day, source);
  if (day === 'Monday' && toMinutes(teachingStart) > toMinutes(schoolStart)) {
    return { start: schoolStart, duration: toMinutes(teachingStart) - toMinutes(schoolStart) };
  }
  return null;
}
function mergeTimeBlocks(blocks = []) {
  const normalized = blocks
    .map(block => ({ start: toMinutes(block.start), end: toMinutes(block.end || getEndTime(block.start, block.duration)) }))
    .filter(block => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  return normalized.reduce((merged, block) => {
    const last = merged[merged.length - 1];
    if (!last || block.start > last.end) merged.push({ ...block });
    else last.end = Math.max(last.end, block.end);
    return merged;
  }, []);
}
function addStartBoundary(starts, minutes, dayEndMinutes) {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= dayEndMinutes) return;
  starts.add(fromMinutes(minutes));
}
function getFlexibleStartsForDay(day, schedules = filteredSchedules()) {
  const settings = normalizeSettings(schedulerData.settings || defaultData.settings);
  const step = Number(settings.slotDuration || 50);
  const dayEndMinutes = toMinutes(getDayEnd(day));
  const teachingStartMinutes = toMinutes(getDayTeachingStart(day));
  const starts = new Set();
  const daySchedules = schedules.filter(item => item.day === day);
  const openingSlot = getSpecialOpeningSlot(day);
  if (openingSlot) {
    const openingStart = toMinutes(openingSlot.start);
    const openingEnd = openingStart + Number(openingSlot.duration || 0);
    addStartBoundary(starts, openingStart, dayEndMinutes);
    addStartBoundary(starts, openingEnd, dayEndMinutes);
  }

  const protectedBlocks = mergeTimeBlocks(daySchedules
    .filter(isFixedSchedule)
    .map(item => ({ start: item.start, duration: item.duration })));

  let cursor = teachingStartMinutes;
  while (cursor < dayEndMinutes) {
    const activeBlock = protectedBlocks.find(block => block.start <= cursor && block.end > cursor);
    if (activeBlock) {
      addStartBoundary(starts, activeBlock.start, dayEndMinutes);
      addStartBoundary(starts, activeBlock.end, dayEndMinutes);
      cursor = activeBlock.end;
      continue;
    }

    const nominalEnd = Math.min(cursor + step, dayEndMinutes);
    const nextBlock = protectedBlocks.find(block => block.start > cursor && block.start < nominalEnd);
    addStartBoundary(starts, cursor, dayEndMinutes);
    if (nextBlock) {
      addStartBoundary(starts, nextBlock.start, dayEndMinutes);
      cursor = nextBlock.start;
    } else {
      cursor = nominalEnd;
    }
  }

  daySchedules.forEach(item => {
    const itemStart = toMinutes(item.start);
    const itemEnd = itemStart + Number(item.duration || settings.slotDuration || 50);
    addStartBoundary(starts, itemStart, dayEndMinutes);
    addStartBoundary(starts, itemEnd, dayEndMinutes);
  });

  return Array.from(starts).sort((a,b) => toMinutes(a)-toMinutes(b));
}
function getStartsForDay(day, schedules = filteredSchedules()) {
  return getFlexibleStartsForDay(day, schedules);
}
function generateStartRows() {
  const schedules = filteredSchedules();
  const mondayStarts = getStartsForDay('Monday', schedules);
  const weekdayStarts = new Set();
  DAYS.filter(day => day !== 'Monday').forEach(day => getStartsForDay(day, schedules).forEach(start => weekdayStarts.add(start)));
  return {
    monday: mondayStarts,
    weekdays: Array.from(weekdayStarts).sort((a,b) => toMinutes(a)-toMinutes(b)),
    maxRows: Math.max(mondayStarts.length, weekdayStarts.size)
  };
}
function getSlotDurationForHeader(day, start, rowStarts = []) {
  if (!start) return Number(schedulerData.settings?.slotDuration || 50);
  const current = toMinutes(start);
  const sortedStarts = Array.isArray(rowStarts)
    ? rowStarts.filter(Boolean).sort((a, b) => toMinutes(a) - toMinutes(b))
    : [];
  const nextStart = sortedStarts.find(candidate => toMinutes(candidate) > current);
  if (nextStart) return Math.max(1, toMinutes(nextStart) - current);
  const dayEnd = getDayEnd(day);
  const fallbackDuration = Number(schedulerData.settings?.slotDuration || 50);
  return Math.max(1, Math.min(fallbackDuration, toMinutes(dayEnd) - current));
}
function renderTimeHeaderCell(day, start, rowStarts = []) {
  if (!start) return '<th scope="row" class="time-cell empty-time"></th>';
  return `<th scope="row" class="time-cell">${escapeHtml(timeRange(start, getSlotDurationForHeader(day, start, rowStarts)))}</th>`;
}
function getPrimaryMatch(matches) { return matches.find(isFixedSchedule) || matches[0] || null; }
function getRowSpanForItem(item, start, rowStarts) {
  if (!item || !start || !Array.isArray(rowStarts)) return 1;
  const startIndex = rowStarts.indexOf(start);
  if (startIndex < 0) return 1;
  const itemEnd = toMinutes(item.start) + Number(item.duration || schedulerData.settings?.slotDuration || 50);
  let span = 0;
  for (let i = startIndex; i < rowStarts.length; i += 1) {
    const rowStart = rowStarts[i];
    if (!rowStart || toMinutes(rowStart) >= itemEnd) break;
    span += 1;
  }
  return Math.max(1, span);
}
function getCellRowSpan(day, start, schedules, rowStarts) {
  const matches = schedules.filter(item => item.day === day && item.start === start);
  const primary = getPrimaryMatch(matches);
  return primary ? getRowSpanForItem(primary, start, rowStarts) : 1;
}
function renderScheduleCell(config, day, start, schedules, rowStarts, spanState) {
  if (!start) return '<td class="blank-cell" aria-label="No corresponding time slot"></td>';
  if (spanState[day] > 0) {
    spanState[day] -= 1;
    return '';
  }
  const matches = schedules.filter(item => item.day === day && item.start === start);
  const validSlot = rowStarts.includes(start) || matches.length > 0;
  const rowSpan = matches.length ? getCellRowSpan(day, start, schedules, rowStarts) : 1;
  if (rowSpan > 1) spanState[day] = rowSpan - 1;
  const rowSpanAttr = rowSpan > 1 ? ` rowspan="${rowSpan}"` : '';
  const durationClass = rowSpan > 1 ? ' multi-slot-cell' : '';
  const blocks = matches.map(match => `<div class="class-block ${isFixedSchedule(match) ? 'fixed-block' : ''} ${rowSpan > 1 ? 'multi-slot-block' : ''}" draggable="${editing && !isFixedSchedule(match) ? 'true' : 'false'}" data-schedule-id="${escapeHtml(match.id)}">${config.block(match)}</div>`).join('');
  return `<td class="drop-cell${durationClass} ${matches.length ? 'has-class' : ''} ${validSlot ? '' : 'inactive-slot'}"${rowSpanAttr} data-day="${escapeHtml(day)}" data-start="${escapeHtml(start)}" data-drop-label="Drop here">${blocks}</td>`;
}
function getConflicts(newSchedule, ignoreId = null, comparisonItems = null, options = {}) {
  const conflicts = [];
  const items = Array.isArray(comparisonItems) ? comparisonItems : allScheduleItems();
  const dayWindowConflict = getDayWindowConflict(newSchedule);
  if (dayWindowConflict) conflicts.push(dayWindowConflict);
  const teacherStartConflict = getTeacherStartConflict(newSchedule);
  if (teacherStartConflict) conflicts.push(teacherStartConflict);
  const teacherLunchConflict = getTeacherLunchConflict(newSchedule, items, ignoreId);
  if (teacherLunchConflict) conflicts.push(teacherLunchConflict);
  const onceDailyShortConflict = getOnceDailyShortOrSwpConflict(newSchedule, items, ignoreId);
  if (onceDailyShortConflict) conflicts.push(onceDailyShortConflict);
  if (!options.ignoreTeacherDailyClassLimit) {
    const teacherDailyCountConflict = getTeacherDailyClassCountConflict(newSchedule, items, ignoreId);
    if (teacherDailyCountConflict) conflicts.push(teacherDailyCountConflict);
  }
  if (!options.ignoreStudentTransitionBuffer) {
    const studentTransitionBufferConflict = getStudentTransitionBufferConflict(newSchedule, items, ignoreId);
    if (studentTransitionBufferConflict) conflicts.push(studentTransitionBufferConflict);
  }
  const newIsClassLike = isClassLikeSchedule(newSchedule);
  for (const existing of items) {
    if (existing.id === ignoreId || existing.day !== newSchedule.day) continue;
    if (newSchedule.fixedActivityId && existing.fixedActivityId && newSchedule.fixedActivityId === existing.fixedActivityId) {
      if (isFixedSubjectSchedule(newSchedule) && isFixedSubjectSchedule(existing)) continue;
      if (isBatchSubjectSchedule(newSchedule) && isBatchSubjectSchedule(existing) && (newSchedule.category === 'batchSubjectSection' || existing.category === 'batchSubjectSection')) continue;
    }
    if (!overlaps(newSchedule.start, newSchedule.duration, existing.start, existing.duration)) continue;
    const existingIsClassLike = isClassLikeSchedule(existing);
    if (existing.sectionId && newSchedule.sectionId && existing.sectionId === newSchedule.sectionId) conflicts.push(`Section conflict with ${conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    if (newIsClassLike && existingIsClassLike && existing.teacherId && newSchedule.teacherId && existing.teacherId === newSchedule.teacherId) conflicts.push(`Teacher conflict with ${existing.sectionId ? byName(schedulerData.sections, existing.sectionId) : conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    if (newIsClassLike && existingIsClassLike && !isDefaultRoom(newSchedule.roomId) && !isDefaultRoom(existing.roomId) && existing.roomId === newSchedule.roomId) conflicts.push(`Room conflict with ${existing.sectionId ? byName(schedulerData.sections, existing.sectionId) : conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
  }
  return conflicts;
}


function isOnceDailyShortOrSwp(item, source = schedulerData) {
  if (!item || !item.sectionId || !item.day) return false;
  const duration = Number(item.duration || 0);
  const subjectLabel = item.subjectId ? byName(source.subjects || schedulerData.subjects, item.subjectId) : '';
  const label = `${item.title || ''} ${item.category || ''} ${subjectLabel}`.toLowerCase();
  return duration === 30 || label.includes('swp') || label.includes('student wellness');
}
function getOnceDailyShortOrSwpConflict(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!isOnceDailyShortOrSwp(schedule, source)) return '';
  const existing = (schedules || []).find(item =>
    item &&
    item.id !== ignoreId &&
    item.id !== schedule.id &&
    item.day === schedule.day &&
    item.sectionId === schedule.sectionId &&
    isOnceDailyShortOrSwp(item, source)
  );
  if (!existing) return '';
  const sectionName = byName(source.sections || schedulerData.sections, schedule.sectionId);
  return `${sectionName} can only have one SWP / 30-minute class per day. Existing: ${conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`;
}

function getMaxTeacherClassesPerDay(source = schedulerData) {
  return Math.max(1, Number(source.settings?.maxTeacherClassesPerDay || 4));
}
function getTeacherDailyClassCountConflict(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId || !schedule.day) return '';
  const teacher = (source.teachers || []).find(item => item.id === schedule.teacherId || item.name === schedule.teacherId);
  if (!teacher) return '';
  const maxDaily = getMaxTeacherClassesPerDay(source);
  const currentCount = getClassItemsOnly(schedules)
    .filter(item => item.id !== ignoreId && item.id !== schedule.id)
    .filter(item => item.day === schedule.day && item.teacherId === schedule.teacherId)
    .length;
  const projected = currentCount + 1;
  if (projected <= maxDaily) return '';
  return `${teacher.name} can only have up to ${maxDaily} class assignment${maxDaily === 1 ? '' : 's'} per day. This would make ${projected} on ${schedule.day}.`;
}
function scheduleSubjectLabel(item, source = schedulerData) {
  const subjectName = item?.subjectId ? byName(source.subjects || schedulerData.subjects, item.subjectId) : '';
  return `${subjectName || ''} ${item?.title || ''} ${item?.category || ''}`;
}
function isSwpLabel(label) {
  const normalized = String(label || '').toLowerCase();
  return normalized.includes('swp') || normalized.includes('student wellness');
}
function isSwpLoad(load, source = schedulerData) {
  const subject = (source.subjects || schedulerData.subjects || []).find(item => item.id === load?.subjectId);
  return isSwpLabel(subject?.name || load?.title || '');
}
function getStudentTransitionSubjectKind(item, source = schedulerData) {
  if (!item || !item.sectionId || isNonTeachingFixedSchedule(item) || isSwpLoad(item, source)) return '';
  const label = scheduleSubjectLabel(item, source).toLowerCase();
  if (label.includes('pehm')) return 'pehm';
  if (label.includes('adtech')) return 'adtech';
  if (label.includes('computer science') || /\bcs\b/i.test(label)) return 'cs';
  return '';
}
function isStudentTransitionSubject(item, source = schedulerData) {
  return Boolean(getStudentTransitionSubjectKind(item, source));
}
function isStudentTransitionBuffer(item, source = schedulerData) {
  if (!item || !item.sectionId) return false;
  const label = scheduleSubjectLabel(item, source).toLowerCase();
  return label.includes('lunch') || isSwpLabel(label);
}
function hasAdjacentStudentTransitionBuffer(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!schedule?.sectionId || !schedule?.day || !schedule?.start) return true;
  const start = toMinutes(schedule.start);
  const end = start + Number(schedule.duration || source.settings?.slotDuration || 50);
  return (schedules || []).some(item => {
    if (!item || item.id === ignoreId || item.id === schedule.id) return false;
    if (item.day !== schedule.day || item.sectionId !== schedule.sectionId) return false;
    if (!isStudentTransitionBuffer(item, source)) return false;
    const itemStart = toMinutes(item.start);
    const itemEnd = itemStart + Number(item.duration || source.settings?.slotDuration || 50);
    return itemEnd === start || itemStart === end;
  });
}

function getSectionBusyBlocks(sectionId, day, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!sectionId || !day) return [];
  return (schedules || [])
    .filter(item => item && item.id !== ignoreId && item.day === day && item.sectionId === sectionId)
    .map(item => {
      const start = toMinutes(item.start);
      const duration = Number(item.duration || source.settings?.slotDuration || 50);
      return { id: item.id, start, end: start + duration, item };
    })
    .filter(block => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
function isSectionWindowFree(sectionId, day, startMinute, duration, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  const endMinute = startMinute + Number(duration || 0);
  if (startMinute < toMinutes(getDayTeachingStart(day, source)) || endMinute > toMinutes(getDayEnd(day, source))) return false;
  return !getSectionBusyBlocks(sectionId, day, schedules, ignoreId, source)
    .some(block => startMinute < block.end && block.start < endMinute);
}
function hasAdjacentVacantTransitionBuffer(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!schedule?.sectionId || !schedule?.day || !schedule?.start) return true;
  const required = Number(source.settings?.studentTransitionBufferMinutes || 30);
  const start = toMinutes(schedule.start);
  const end = start + Number(schedule.duration || source.settings?.slotDuration || 50);
  return isSectionWindowFree(schedule.sectionId, schedule.day, start - required, required, schedules, ignoreId || schedule.id, source)
    || isSectionWindowFree(schedule.sectionId, schedule.day, end, required, schedules, ignoreId || schedule.id, source);
}
function isStudentTransitionEdgeSlot(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  if (!schedule?.sectionId || !schedule?.day || !schedule?.start) return false;
  const start = toMinutes(schedule.start);
  const duration = Number(schedule.duration || source.settings?.slotDuration || 50);
  const teachingStart = toMinutes(getDayTeachingStart(schedule.day, source));
  if (start === teachingStart) return true;

  const dayEnd = toMinutes(getDayEnd(schedule.day, source));
  const sectionItems = (schedules || []).filter(item => item && item.id !== ignoreId && item.sectionId === schedule.sectionId);
  const validStarts = getFlexibleStartsForDay(schedule.day, sectionItems)
    .map(toMinutes)
    .filter(slotStart => slotStart + duration <= dayEnd);
  const lastStart = validStarts.length ? Math.max(...validStarts) : NaN;
  return Number.isFinite(lastStart) && start === lastStart;
}
function hasStudentTransitionBuffer(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  const kind = getStudentTransitionSubjectKind(schedule, source);
  const hasEdgeAnchor = isStudentTransitionEdgeSlot(schedule, schedules, ignoreId, source);
  const hasNamedAnchor = hasAdjacentStudentTransitionBuffer(schedule, schedules, ignoreId, source);

  // PEHM uses explicit operational anchors only: start/end of the school day,
  // or direct adjacency to Lunch or SWP. Other transition subjects may still
  // use a protected 30-minute vacant window.
  if (kind === 'pehm') return hasEdgeAnchor || hasNamedAnchor;

  return hasEdgeAnchor
    || hasNamedAnchor
    || hasAdjacentVacantTransitionBuffer(schedule, schedules, ignoreId, source);
}
function getStudentTransitionBufferConflict(schedule, schedules = allScheduleItems(), ignoreId = null, source = schedulerData) {
  const kind = getStudentTransitionSubjectKind(schedule, source);
  if (!kind) return '';
  if (hasStudentTransitionBuffer(schedule, schedules, ignoreId, source)) return '';
  const sectionName = byName(source.sections || schedulerData.sections, schedule.sectionId);
  const subjectName = byName(source.subjects || schedulerData.subjects, schedule.subjectId);
  if (kind === 'pehm') {
    return `${sectionName} needs ${subjectName} as the first or last class of the day, or directly before/after Lunch or SWP.`;
  }
  return `${sectionName} needs ${subjectName} beside SWP/Lunch, a true 30-minute vacant transition buffer, or the first/last teaching slot of the day.`;
}

function browserKindFromMode(mode) {
  return { sections: 'section', teachers: 'teacher' }[mode] || null;
}
function getBrowserCollection() {
  const kind = browserKindFromMode(browserMode);
  const config = getViewConfig(kind);
  return config ? (schedulerData[config.collectionName] || []) : [];
}
function renderNavigator() {
  if (!els.navigatorCard || !els.navigatorSelect) return;
  if (!browserMode) {
    els.navigatorCard.classList.add('hidden');
    if (els.exportAllTeacherXlsxBtn) els.exportAllTeacherXlsxBtn.classList.add('hidden');
    return;
  }
  const kind = browserKindFromMode(browserMode);
  const config = getViewConfig(kind);
  const label = browserMode === 'sections' ? 'Choose Section' : 'Choose Teacher';
  const hint = browserMode === 'sections' ? 'Select any section to display its weekly schedule.' : 'Select any teacher to check their weekly teaching load.';
  els.navigatorLabel.textContent = label;
  els.navigatorHint.textContent = hint;
  if (els.exportAllTeacherXlsxBtn) els.exportAllTeacherXlsxBtn.classList.toggle('hidden', browserMode !== 'teachers');
  const collection = config ? [...(schedulerData[config.collectionName] || [])].sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })) : [];
  if (!collection.length) {
    els.navigatorSelect.innerHTML = '<option value="">No records available</option>';
    els.navigatorCard.classList.remove('hidden');
    return;
  }
  els.navigatorSelect.innerHTML = collection.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  if (!collection.some(item => item.id === currentId)) currentId = collection[0].id;
  if (config) currentEntity = getEntity(config, currentId);
  els.navigatorSelect.value = currentId;
  els.navigatorCard.classList.remove('hidden');
}
function selectBrowserEntity(id) {
  const kind = browserKindFromMode(browserMode);
  const config = getViewConfig(kind);
  if (!config) return;
  currentKind = kind;
  currentId = id;
  currentEntity = getEntity(config, currentId);
  const url = new URL(window.location.href);
  url.searchParams.set('browse', browserMode);
  url.searchParams.set('kind', currentKind);
  url.searchParams.set('id', currentId);
  window.history.replaceState(null, '', url.toString());
  renderCalendar();
}
function pad2(value) { return String(value).padStart(2, '0'); }
function nextWeekdayDate(dayName) {
  const dayIndex = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }[dayName];
  const date = new Date();
  date.setHours(0,0,0,0);
  let diff = (dayIndex - date.getDay() + 7) % 7;
  if (diff === 0 && date.getHours() > 0) diff = 7;
  date.setDate(date.getDate() + diff);
  return date;
}
function icsDateTime(day, time) {
  const date = nextWeekdayDate(day);
  const [h,m] = String(time || '00:00').split(':').map(Number);
  date.setHours(h || 0, m || 0, 0, 0);
  return `${date.getFullYear()}${pad2(date.getMonth()+1)}${pad2(date.getDate())}T${pad2(date.getHours())}${pad2(date.getMinutes())}00`;
}
function icsNowUtc() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth()+1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}
function icsEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function eventSummary(item) {
  if (isFixedSchedule(item) && !isFixedTeachingSchedule(item)) return item.title || 'Fixed Activity';
  if (isFixedTeachingSchedule(item)) return fixedDisplayTitle(item);
  if (currentKind === 'teacher') return `${byName(schedulerData.sections, item.sectionId)} - ${byName(schedulerData.subjects, item.subjectId)}`;
  if (currentKind === 'room') return `${byName(schedulerData.sections, item.sectionId)} - ${byName(schedulerData.subjects, item.subjectId)}`;
  return byName(schedulerData.subjects, item.subjectId);
}
function eventDescription(item) {
  if (isFixedSchedule(item)) return `${item.title || 'Fixed Activity'}\\nProtected slot`;
  return [
    `Section: ${byName(schedulerData.sections, item.sectionId)}`,
    `Subject: ${byName(schedulerData.subjects, item.subjectId)}`,
    `Teacher: ${teacherName(item.teacherId)}`,
    `Room: ${byName(schedulerData.rooms, item.roomId)}`,
    `Time: ${timeRange(item.start, item.duration)}`
  ].join('\\n');
}
function buildCurrentIcs() {
  const items = filteredSchedules();
  const dtstamp = icsNowUtc();
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Class Scheduler//Weekly Schedule//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  items.forEach(item => {
    const start = icsDateTime(item.day, item.start);
    const end = icsDateTime(item.day, getEndTime(item.start, item.duration));
    const uid = `${item.id}-${currentKind}-${currentId}@class-scheduler.local`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsEscape(uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push('RRULE:FREQ=WEEKLY;COUNT=40');
    lines.push(`SUMMARY:${icsEscape(eventSummary(item))}`);
    lines.push(`DESCRIPTION:${icsEscape(eventDescription(item))}`);
    if (isClassLikeSchedule(item) && !isDefaultRoom(item.roomId)) lines.push(`LOCATION:${icsEscape(byName(schedulerData.rooms, item.roomId))}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
function safeFileName(value) {
  return String(value || 'weekly-schedule').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'weekly-schedule';
}
function downloadTextFile(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}
function exportCurrentIcs() {
  const items = filteredSchedules();
  if (!items.length) return showModal('There is no schedule to export for this calendar.');
  const name = safeFileName(currentEntity?.name || 'weekly-schedule');
  downloadTextFile(buildCurrentIcs(), `${name}-weekly-calendar.ics`, 'text/calendar;charset=utf-8');
  showStatus('iCal file exported. Import it into Google Calendar, iOS Calendar, or macOS Calendar.');
}
function exportAllTeacherXlsxFromBrowser() {
  try {
    if (window.opener && !window.opener.closed && typeof window.opener.exportTeacherSpreadsheet === 'function') {
      window.opener.exportTeacherSpreadsheet();
      showStatus('Teacher XLSX export started from the main scheduler tab.');
      return;
    }
  } catch (error) {
    // Fall through to user-friendly message.
  }
  showModal('Teacher XLSX export is available when this browser tab is opened from the main scheduler dashboard. Keep the main scheduler tab open, then click Browse Teacher Schedules again.');
}
function renderHeader() { renderNavigator(); const config = getViewConfig(); if (!config || !currentEntity) { els.viewEyebrow.textContent = 'Weekly Calendar'; els.viewTitle.textContent = 'Schedule Not Found'; els.viewSubtitle.textContent = config?.missingMessage || 'Open this view from the main scheduler again.'; els.printBtn.textContent = 'Print Schedule'; return; } document.title = `${currentEntity.name} Weekly Schedule`; els.viewEyebrow.textContent = browserMode ? (browserMode === 'sections' ? 'Section Schedule Browser' : 'Teacher Schedule Browser') : config.eyebrow; els.viewTitle.textContent = currentEntity.name; els.viewSubtitle.textContent = browserMode ? 'Use the dropdown below to switch calendars quickly. This view remains printable and exportable.' : config.subtitle; els.printBtn.textContent = config.printLabel; }
function renderSummary() { const schedules = filteredSchedules().filter(isClassLikeSchedule); els.totalClasses.textContent = schedules.length; els.totalMinutes.textContent = schedules.reduce((sum,item) => sum + Number(item.duration || 0), 0); els.dailySummary.innerHTML = DAYS.map(day => `<span><strong>${day.slice(0,3)}</strong> ${schedules.filter(item => item.day === day).length}</span>`).join(''); els.generatedAt.textContent = new Date().toLocaleString(); }
const TIMELINE_HOUR_HEIGHT = 96;
const TIMELINE_PX_PER_MINUTE = TIMELINE_HOUR_HEIGHT / 60;

function getTimelineRange(items = filteredSchedules()) {
  const settings = normalizeSettings(schedulerData.settings || defaultData.settings);
  const baseStart = toMinutes(settings.dayStart || defaultData.settings.dayStart);
  const baseEnd = toMinutes(settings.dayEnd || defaultData.settings.dayEnd);
  const starts = [baseStart, ...DAYS.map(day => toMinutes(getDayTeachingStart(day)))];
  const ends = [baseEnd];
  items.forEach(item => {
    starts.push(toMinutes(item.start));
    ends.push(toMinutes(item.start) + Number(item.duration || settings.slotDuration || 50));
  });
  const minStart = Math.min(...starts.filter(Number.isFinite));
  const maxEnd = Math.max(...ends.filter(Number.isFinite));
  const start = Math.floor(minStart / 60) * 60;
  const end = Math.ceil(maxEnd / 60) * 60;
  return { start, end, height: Math.max(TIMELINE_HOUR_HEIGHT, (end - start) * TIMELINE_PX_PER_MINUTE) };
}
function timelineTop(start, range) { return Math.max(0, (toMinutes(start) - range.start) * TIMELINE_PX_PER_MINUTE); }
function timelineHeight(duration) { return Math.max(18, Number(duration || 0) * TIMELINE_PX_PER_MINUTE); }
function renderHourLabels(range) {
  const labels = [];
  for (let t = range.start; t < range.end; t += 60) {
    labels.push(`<div class="hour-label" style="top:${(t - range.start) * TIMELINE_PX_PER_MINUTE}px">${escapeHtml(formatTime(fromMinutes(t)))}</div>`);
  }
  return labels.join('');
}
function renderTimelineEvent(config, item, range) {
  const top = timelineTop(item.start, range);
  const height = timelineHeight(item.duration);
  const movable = editing && !isFixedSchedule(item);
  const fixedClass = isFixedSchedule(item) ? ' fixed-block' : '';
  const compactClass = Number(item.duration || 0) <= 30 ? ' compact-event' : '';
  return `<div class="class-block event-block${fixedClass}${compactClass}" style="top:${top}px;height:${height}px" draggable="false" data-schedule-id="${escapeHtml(item.id)}">${config.block(item)}</div>`;
}
function renderDayColumn(config, day, schedules, range) {
  const dayItems = schedules.filter(item => item.day === day).sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || Number(b.duration || 0) - Number(a.duration || 0));
  return `<div class="day-column" data-day="${escapeHtml(day)}" style="height:${range.height}px" aria-label="${escapeHtml(day)} schedule">${dayItems.map(item => renderTimelineEvent(config, item, range)).join('')}</div>`;
}
function renderTimeline(config, schedules) {
  const range = getTimelineRange(schedules);
  return `<div class="timeline-content" style="--timeline-height:${range.height}px;--hour-height:${TIMELINE_HOUR_HEIGHT}px"><div class="time-ruler" style="height:${range.height}px">${renderHourLabels(range)}</div>${DAYS.map(day => renderDayColumn(config, day, schedules, range)).join('')}</div>`;
}
function renderCalendar() {
  const config = getViewConfig();
  renderHeader();
  renderSummary();
  if (!config || !currentEntity) {
    els.calendarBody.innerHTML = '<div class="empty-state">Unable to load this weekly view. Please open it again from the main scheduler.</div>';
    return;
  }
  const schedules = filteredSchedules();
  if (!schedules.length) {
    els.calendarBody.innerHTML = `<div class="empty-state">${escapeHtml(config.emptyMessage)}</div>`;
    return;
  }
  els.calendarBody.innerHTML = renderTimeline(config, schedules);
}

function clearDropAvailabilityHighlights() {
  activeDragScheduleId = null;
  document.body.classList.remove('drag-preview-active');
  document.querySelectorAll('.drop-slot').forEach(slot => slot.remove());
}
function getScheduleById(scheduleId) {
  return schedulerData.schedules.find(item => item.id === scheduleId) || null;
}
function getRelevantItemsForDropSchedule(schedule) {
  if (!schedule?.sectionId) return filteredSchedules();
  return allScheduleItems().filter(item => item.sectionId === schedule.sectionId || item.id === schedule.id);
}
function getCandidateStartsForDrop(day, schedule) {
  const relevantItems = getRelevantItemsForDropSchedule(schedule);
  return getFlexibleStartsForDay(day, relevantItems)
    .filter(start => toMinutes(start) + Number(schedule.duration || 0) <= toMinutes(getDayEnd(day)))
    .filter((start, index, list) => list.indexOf(start) === index);
}
function isDropSlotAvailable(schedule, slot, comparisonItems = null) {
  if (!schedule || !slot?.dataset?.day || !slot.dataset.start) return false;
  const candidate = { ...schedule, day: slot.dataset.day, start: slot.dataset.start };
  return getConflicts(candidate, schedule.id, comparisonItems, MANUAL_SCHEDULE_CONFLICT_OPTIONS).length === 0;
}
function createDropSlot(dayColumn, day, start, schedule, range, comparisonItems = null) {
  const slot = document.createElement('div');
  slot.className = 'drop-slot';
  slot.dataset.day = day;
  slot.dataset.start = start;
  slot.style.top = `${timelineTop(start, range)}px`;
  slot.style.height = `${timelineHeight(schedule.duration)}px`;
  const isOriginal = day === schedule.day && start === schedule.start;
  if (isDropSlotAvailable(schedule, slot, comparisonItems)) {
    slot.classList.add('available-drop');
    if (isOriginal) slot.classList.add('original-drop');
    slot.dataset.dropStatus = isOriginal ? 'Current slot' : 'Available';
    slot.setAttribute('data-drop-label', isOriginal ? 'Current slot' : 'Available');
  } else {
    slot.classList.add('blocked-drop');
    slot.dataset.dropStatus = 'Unavailable';
    slot.setAttribute('data-drop-label', 'Unavailable');
  }
  dayColumn.appendChild(slot);
  return slot;
}
function markAvailableDropSlots(scheduleId) {
  clearDropAvailabilityHighlights();
  const schedule = getScheduleById(scheduleId);
  if (!schedule) return;
  activeDragScheduleId = scheduleId;
  document.body.classList.add('drag-preview-active');
  const schedules = filteredSchedules();
  const range = getTimelineRange(schedules);
  const comparisonItems = allScheduleItems();
  let availableCount = 0;
  let candidateCount = 0;
  document.querySelectorAll('.day-column[data-day]').forEach(dayColumn => {
    const day = dayColumn.dataset.day;
    getCandidateStartsForDrop(day, schedule).forEach(start => {
      candidateCount += 1;
      const slot = createDropSlot(dayColumn, day, start, schedule, range, comparisonItems);
      if (slot.classList.contains('available-drop')) availableCount += 1;
    });
  });
  showStatus(`${availableCount} available drop slot${availableCount === 1 ? '' : 's'} highlighted out of ${candidateCount} candidate slots. Unavailable slots are muted.`);
}

function setEditingMode(value) {
  cancelPointerDrag({ silent: true });
  editing = Boolean(value);
  document.body.classList.toggle('editing', editing);
  els.editToggle.textContent = editing ? 'Edit Mode: On' : 'Edit Mode: Off';
  els.editToggle.className = editing ? 'danger' : 'success';
  renderCalendar();
}
function showStatus(message) { els.statusLine.textContent = message; els.statusLine.className = 'good'; clearTimeout(showStatus.timer); showStatus.timer = setTimeout(() => { els.statusLine.innerHTML = `Generated: <span id="generatedAt">${new Date().toLocaleString()}</span>`; els.generatedAt = document.getElementById('generatedAt'); els.statusLine.className = ''; }, 4500); }
function showModal(message) { els.modalMessage.textContent = message; els.messageModal.classList.remove('hidden'); document.body.classList.add('modal-open'); setTimeout(() => els.modalOkBtn.focus(), 0); }
function closeModal() { els.messageModal.classList.add('hidden'); document.body.classList.remove('modal-open'); }
async function moveSchedule(scheduleId, targetDay, targetStart) {
  if (syncConfig.enabled) await pullFromServer({ silent: true });
  const schedule = schedulerData.schedules.find(item => item.id === scheduleId);
  if (!schedule) {
    showModal('This class was not found in the latest schedule data. Refresh this weekly view and try again.');
    renderCalendar();
    return;
  }
  const candidate = { ...schedule, day: targetDay, start: targetStart };
  const conflicts = getConflicts(candidate, schedule.id, allScheduleItems(), MANUAL_SCHEDULE_CONFLICT_OPTIONS);
  if (conflicts.length) {
    showModal(conflicts.join('\n'));
    renderCalendar();
    return;
  }
  schedule.day = targetDay;
  schedule.start = targetStart;
  saveData({ localOnly: true });
  renderCalendar();
  showStatus(`Schedule moved to ${targetDay} at ${formatTime(targetStart)}. Saving change...`);
  if (syncConfig.enabled) {
    const saved = await saveMoveToServerWithRetry(scheduleId, targetDay, targetStart);
    renderCalendar();
    if (saved) showStatus(`Schedule moved to ${targetDay} at ${formatTime(targetStart)}. Changes saved to server.`);
  } else {
    showStatus(`Schedule moved to ${targetDay} at ${formatTime(targetStart)}. Changes saved offline.`);
  }
}

function setSwapMode(value) {
  swapMode = Boolean(value);
  document.body.classList.toggle('swap-mode-active', swapMode);
  if (els.swapToggle) {
    els.swapToggle.textContent = swapMode ? 'Swap Mode: On' : 'Swap Mode: Off';
    els.swapToggle.className = swapMode ? 'danger' : 'secondary';
  }
  if (swapMode) showStatus('Swap Mode is on. Manual swaps may override transition preferences and the four-classes-per-day teacher cap.');
  else showStatus('Swap Mode is off.');
}
function closeSwapModal() {
  if (els.swapModal) els.swapModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  swapSelectedScheduleId = null;
  swapOptionsById.clear();
}
function movableScheduleItems() {
  return (schedulerData.schedules || []).filter(item => item && item.id && !isFixedSchedule(item) && isClassLikeSchedule(item));
}
function scheduleSummaryText(item) {
  const subject = isFixedTeachingSchedule(item) ? fixedDisplayTitle(item) : byName(schedulerData.subjects, item.subjectId);
  const section = byName(schedulerData.sections, item.sectionId);
  const teacher = isNoTeacherId(item.teacherId) ? '' : teacherName(item.teacherId);
  const room = byName(schedulerData.rooms, item.roomId);
  return { subject, section, teacher, room, time: `${item.day}, ${timeRange(item.start, item.duration)}` };
}
function renderSwapSummary(item, mode = 'card') {
  const summary = scheduleSummaryText(item);
  const teacherLine = summary.teacher ? `<span>Teacher: ${escapeHtml(summary.teacher)}</span>` : '';
  const roomLine = summary.room ? `<span>Room: ${escapeHtml(summary.room)}</span>` : '';
  if (mode === 'button') {
    return `<strong>${escapeHtml(summary.subject)} — ${escapeHtml(summary.section)}</strong><span>${escapeHtml(summary.time)}</span>${teacherLine}${roomLine}`;
  }
  return `<strong>${escapeHtml(summary.subject)} — ${escapeHtml(summary.section)}</strong>${teacherLine}<span>${escapeHtml(summary.time)}</span>${roomLine}`;
}
function isDuration(item, minutes) {
  return Number(item?.duration || 0) === Number(minutes);
}
function sortSchedulesByDayAndStart(items = []) {
  return [...items].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
    || toMinutes(a.start) - toMinutes(b.start)
    || String(a.id || '').localeCompare(String(b.id || '')));
}
function normalizeFiftyMinutePair(first, second) {
  if (!first || !second || first.id === second.id) return null;
  if (!isDuration(first, 50) || !isDuration(second, 50) || first.day !== second.day) return null;
  const pair = [first, second].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  if (toMinutes(pair[1].start) !== toMinutes(pair[0].start) + 50) return null;
  return pair;
}
function getAdjacentFiftyMinutePairs(sectionId) {
  const fiftyMinuteItems = sortSchedulesByDayAndStart(movableScheduleItems()
    .filter(item => item.sectionId === sectionId && isDuration(item, 50)));
  const pairs = [];
  for (let index = 0; index < fiftyMinuteItems.length; index += 1) {
    const first = fiftyMinuteItems[index];
    for (let nextIndex = index + 1; nextIndex < fiftyMinuteItems.length; nextIndex += 1) {
      const second = fiftyMinuteItems[nextIndex];
      if (second.day !== first.day) break;
      const difference = toMinutes(second.start) - toMinutes(first.start);
      if (difference > 50) break;
      if (difference === 50) pairs.push([first, second]);
    }
  }
  return pairs;
}
function createSingleSwapOperation(firstId, secondId) {
  return { type: 'single', scheduleIds: [firstId, secondId] };
}
function createCompositeSwapOperation(hundredId, fiftyIds) {
  return { type: 'composite-100-for-2x50', hundredId, fiftyIds: [...fiftyIds] };
}
function buildSwapOperationState(operation) {
  const errors = [];
  if (!operation || !operation.type) return { errors: ['Invalid swap operation.'], items: [], candidates: [] };

  if (operation.type === 'single') {
    const ids = Array.isArray(operation.scheduleIds) ? operation.scheduleIds : [];
    const first = getScheduleById(ids[0]);
    const second = getScheduleById(ids[1]);
    if (!first || !second || first.id === second.id) errors.push('One or both selected classes are no longer available.');
    if (first && second) {
      if (isFixedSchedule(first) || isFixedSchedule(second)) errors.push('Fixed/protected activities cannot be swapped.');
      if (!first.sectionId || !second.sectionId || first.sectionId !== second.sectionId) errors.push('Classes can only be swapped within the same section.');
    }
    if (errors.length) return { errors, items: [first, second].filter(Boolean), candidates: [] };
    return {
      errors: [],
      items: [first, second],
      candidates: [
        { ...first, day: second.day, start: second.start },
        { ...second, day: first.day, start: first.start }
      ]
    };
  }

  if (operation.type === 'composite-100-for-2x50') {
    const hundred = getScheduleById(operation.hundredId);
    const rawPair = Array.isArray(operation.fiftyIds) ? operation.fiftyIds.map(getScheduleById) : [];
    const pair = normalizeFiftyMinutePair(rawPair[0], rawPair[1]);
    const allItems = [hundred, ...rawPair].filter(Boolean);
    if (!hundred || rawPair.length !== 2 || rawPair.some(item => !item)) errors.push('One or more classes in this composite swap are no longer available.');
    if (new Set(allItems.map(item => item.id)).size !== 3) errors.push('A composite swap requires three different classes.');
    if (allItems.some(isFixedSchedule)) errors.push('Fixed/protected activities cannot be swapped.');
    if (hundred && !isDuration(hundred, 100)) errors.push('The long class must be exactly 100 minutes.');
    if (!pair) errors.push('The two short classes must each be 50 minutes, on the same day, and directly adjacent.');
    if (hundred && pair && (!hundred.sectionId || pair.some(item => item.sectionId !== hundred.sectionId))) errors.push('All three classes must belong to the same section.');
    if (errors.length) return { errors: Array.from(new Set(errors)), items: allItems, candidates: [] };

    const hundredDestinationDay = pair[0].day;
    const hundredDestinationStart = pair[0].start;
    const pairDestinationDay = hundred.day;
    const pairDestinationStart = hundred.start;
    return {
      errors: [],
      items: [hundred, ...pair],
      candidates: [
        { ...hundred, day: hundredDestinationDay, start: hundredDestinationStart },
        { ...pair[0], day: pairDestinationDay, start: pairDestinationStart },
        { ...pair[1], day: pairDestinationDay, start: fromMinutes(toMinutes(pairDestinationStart) + 50) }
      ]
    };
  }

  return { errors: ['Unsupported swap operation.'], items: [], candidates: [] };
}
function getSwapOperationConflicts(operation) {
  const state = buildSwapOperationState(operation);
  if (state.errors.length) return state.errors;
  const selectedIds = new Set(state.items.map(item => item.id));
  const base = allScheduleItems().filter(item => !selectedIds.has(item.id));
  const finalItems = [...base, ...state.candidates];
  const conflicts = state.candidates.flatMap(candidate => {
    const comparisonItems = finalItems.filter(item => item.id !== candidate.id);
    return getConflicts(candidate, null, comparisonItems, MANUAL_SCHEDULE_CONFLICT_OPTIONS)
      .map(conflict => `${scheduleSummaryText(candidate).subject}: ${conflict}`);
  });
  return Array.from(new Set(conflicts));
}
function getSwapConflicts(first, second) {
  if (!first || !second) return ['Invalid swap selection.'];
  return getSwapOperationConflicts(createSingleSwapOperation(first.id, second.id));
}
function applySwapOperation(operation) {
  const state = buildSwapOperationState(operation);
  if (state.errors.length) return { ok: false, errors: state.errors };
  state.candidates.forEach(candidate => {
    const schedule = getScheduleById(candidate.id);
    if (!schedule) return;
    schedule.day = candidate.day;
    schedule.start = candidate.start;
  });
  return { ok: true, errors: [] };
}
function operationSignature(operation) {
  if (operation.type === 'single') return `single:${[...(operation.scheduleIds || [])].sort().join('|')}`;
  if (operation.type === 'composite-100-for-2x50') return `composite:${operation.hundredId}:${[...(operation.fiftyIds || [])].sort().join('|')}`;
  return JSON.stringify(operation);
}
function getSwapOptions(schedule) {
  const options = [];
  const seen = new Set();
  const addOption = (operation, targetDay, targetStart) => {
    const signature = operationSignature(operation);
    if (seen.has(signature)) return;
    seen.add(signature);
    const conflicts = getSwapOperationConflicts(operation);
    if (conflicts.length) return;
    options.push({
      id: `swap-option-${options.length + 1}`,
      operation,
      targetDay,
      targetStart,
      kind: operation.type === 'single' ? 'single' : 'composite'
    });
  };

  movableScheduleItems()
    .filter(candidate => candidate.id !== schedule.id)
    .filter(candidate => candidate.sectionId && schedule.sectionId && candidate.sectionId === schedule.sectionId)
    .forEach(candidate => addOption(createSingleSwapOperation(schedule.id, candidate.id), candidate.day, candidate.start));

  const adjacentPairs = getAdjacentFiftyMinutePairs(schedule.sectionId);
  if (isDuration(schedule, 100)) {
    adjacentPairs.forEach(pair => addOption(
      createCompositeSwapOperation(schedule.id, pair.map(item => item.id)),
      pair[0].day,
      pair[0].start
    ));
  } else if (isDuration(schedule, 50)) {
    const pairsContainingSelected = adjacentPairs.filter(pair => pair.some(item => item.id === schedule.id));
    const hundredMinuteItems = movableScheduleItems()
      .filter(item => item.sectionId === schedule.sectionId && isDuration(item, 100));
    pairsContainingSelected.forEach(pair => {
      hundredMinuteItems.forEach(hundred => addOption(
        createCompositeSwapOperation(hundred.id, pair.map(item => item.id)),
        hundred.day,
        hundred.start
      ));
    });
  }

  return options.sort((a, b) => DAYS.indexOf(a.targetDay) - DAYS.indexOf(b.targetDay)
    || toMinutes(a.targetStart) - toMinutes(b.targetStart)
    || (a.kind === b.kind ? 0 : a.kind === 'composite' ? -1 : 1));
}
function renderSwapOption(option) {
  if (option.operation.type === 'single') {
    const targetId = option.operation.scheduleIds.find(id => id !== swapSelectedScheduleId) || option.operation.scheduleIds[1];
    const candidate = getScheduleById(targetId);
    if (!candidate) return '';
    return `<span class="swap-option-kind">Single-class swap</span>${renderSwapSummary(candidate, 'button')}`;
  }

  const state = buildSwapOperationState(option.operation);
  if (state.errors.length) return '';
  const hundred = getScheduleById(option.operation.hundredId);
  const pair = normalizeFiftyMinutePair(...option.operation.fiftyIds.map(getScheduleById));
  if (!hundred || !pair) return '';
  const hundredSummary = scheduleSummaryText(hundred);
  const firstSummary = scheduleSummaryText(pair[0]);
  const secondSummary = scheduleSummaryText(pair[1]);
  return [
    '<span class="swap-option-kind">Composite swap</span>',
    '<strong>100-minute class ↔ two adjacent 50-minute classes</strong>',
    `<span>100 min: ${escapeHtml(hundredSummary.subject)} — ${escapeHtml(hundredSummary.time)}</span>`,
    `<span>50 min pair: ${escapeHtml(firstSummary.subject)} + ${escapeHtml(secondSummary.subject)} — ${escapeHtml(pair[0].day)}, ${escapeHtml(timeRange(pair[0].start, 100))}</span>`
  ].join('');
}
async function openSwapModal(scheduleId) {
  if (syncConfig.enabled) await pullFromServer({ silent: true });
  const schedule = getScheduleById(scheduleId);
  if (!schedule || isFixedSchedule(schedule)) return showModal('Select a movable class block. Fixed/protected activities cannot be swapped.');
  swapSelectedScheduleId = scheduleId;
  swapOptionsById.clear();
  const options = getSwapOptions(schedule);
  options.forEach(option => swapOptionsById.set(option.id, option));
  if (els.swapModalMessage) els.swapModalMessage.textContent = 'Select a conflict-free class or composite option. A 100-minute class can exchange with two adjacent 50-minute classes, and either 50-minute class can initiate the same swap.';
  els.swapSelectedCard.innerHTML = renderSwapSummary(schedule);
  els.swapCandidateList.innerHTML = options.length
    ? options.map(option => `<button type="button" class="swap-candidate" data-swap-option-id="${escapeHtml(option.id)}">${renderSwapOption(option)}</button>`).join('')
    : '<div class="swap-empty">No conflict-free same-section swap options found. Composite swaps require one 100-minute class and two directly adjacent 50-minute classes.</div>';
  els.swapModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => els.swapCandidateList.querySelector('button')?.focus(), 0);
}
async function performSwapOption(optionId) {
  const option = swapOptionsById.get(optionId);
  if (!option) return showModal('This swap option is no longer available. Reopen the swap dialog and try again.');
  const operation = JSON.parse(JSON.stringify(option.operation));
  if (syncConfig.enabled) await pullFromServer({ silent: true });

  const state = buildSwapOperationState(operation);
  if (state.errors.length) {
    closeSwapModal();
    renderCalendar();
    return showModal(state.errors.join('\n'));
  }
  const conflicts = getSwapOperationConflicts(operation);
  if (conflicts.length) return showModal(conflicts.join('\n'));
  const applied = applySwapOperation(operation);
  if (!applied.ok) return showModal(applied.errors.join('\n'));

  const isComposite = operation.type === 'composite-100-for-2x50';
  closeSwapModal();
  saveData({ localOnly: true });
  renderCalendar();
  showStatus(isComposite ? 'Composite 100-minute ↔ 2 × 50-minute swap completed. Saving change...' : 'Classes swapped. Saving change...');
  if (syncConfig.enabled) {
    const saved = await saveSwapOperationToServerWithRetry(operation);
    renderCalendar();
    if (saved) showStatus(isComposite ? 'Composite swap saved to server.' : 'Classes swapped and saved to server.');
  } else {
    showStatus(isComposite ? 'Composite swap saved offline.' : 'Classes swapped and saved offline.');
  }
}

function removeDragGhost() {
  if (pointerDragState?.ghost) pointerDragState.ghost.remove();
  document.body.classList.remove('timeline-pointer-dragging');
}
function createDragGhost(block, event) {
  const ghost = block.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.removeAttribute('data-schedule-id');
  ghost.style.width = `${Math.max(180, block.getBoundingClientRect().width)}px`;
  document.body.appendChild(ghost);
  updateDragGhost(event);
  return ghost;
}
function updateDragGhost(event) {
  if (!pointerDragState?.ghost) return;
  pointerDragState.ghost.style.transform = `translate3d(${event.clientX + 14}px, ${event.clientY + 14}px, 0)`;
}
function activatePointerDrag(event) {
  if (!pointerDragState || pointerDragState.dragging) return;
  pointerDragState.dragging = true;
  pointerDragState.block.classList.add('dragging');
  document.body.classList.add('timeline-pointer-dragging');
  markAvailableDropSlots(pointerDragState.scheduleId);
  pointerDragState.ghost = createDragGhost(pointerDragState.block, event);
}
function cancelPointerDrag(options = {}) {
  if (!pointerDragState) {
    clearDropAvailabilityHighlights();
    return;
  }
  pointerDragState.block?.classList.remove('dragging');
  removeDragGhost();
  clearDropAvailabilityHighlights();
  pointerDragState = null;
  if (!options.silent) showStatus('Drag cancelled. No schedule was changed.');
}
function getDropSlotAtPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element ? element.closest('.drop-slot') : null;
}
function startPointerDrag(event) {
  if (!editing) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const block = event.target.closest('.class-block.event-block');
  if (!block || block.classList.contains('fixed-block')) return;
  const scheduleId = block.dataset.scheduleId;
  if (!scheduleId || !getScheduleById(scheduleId)) return;
  event.preventDefault();
  pointerDragState = {
    scheduleId,
    block,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    ghost: null
  };
  try { block.setPointerCapture?.(event.pointerId); } catch {}
}
function handlePointerMove(event) {
  if (!pointerDragState) return;
  const distance = Math.hypot(event.clientX - pointerDragState.startX, event.clientY - pointerDragState.startY);
  if (!pointerDragState.dragging && distance >= 4) activatePointerDrag(event);
  if (pointerDragState.dragging) {
    event.preventDefault();
    updateDragGhost(event);
    document.querySelectorAll('.drop-slot.drag-over').forEach(slot => slot.classList.remove('drag-over'));
    const slot = getDropSlotAtPoint(event.clientX, event.clientY);
    if (slot?.classList.contains('available-drop')) slot.classList.add('drag-over');
  }
}
function handlePointerUp(event) {
  if (!pointerDragState) return;
  const state = pointerDragState;
  if (!state.dragging) {
    pointerDragState = null;
    return;
  }
  const slot = getDropSlotAtPoint(event.clientX, event.clientY);
  const canDrop = Boolean(slot?.dataset?.day && slot?.dataset?.start && slot.classList.contains('available-drop'));
  state.block?.classList.remove('dragging');
  removeDragGhost();
  clearDropAvailabilityHighlights();
  pointerDragState = null;
  suppressSwapClick = true;
  setTimeout(() => { suppressSwapClick = false; }, 0);
  if (!canDrop) {
    showModal('This slot is unavailable for the selected class. Drop only on highlighted available slots.');
    return;
  }
  moveSchedule(state.scheduleId, slot.dataset.day, slot.dataset.start);
}

async function refreshFromStorage() {
  if (syncConfig.enabled) await pullFromServer({ silent: true });
  else schedulerData = loadData();
  const config = getViewConfig();
  if (config) currentEntity = getEntity(config, currentId);
  renderCalendar();
}
async function initializeView() {
  const params = getParams();
  const payload = readWindowPayload();
  browserMode = params.browse || payload?.browse || null;
  currentKind = params.kind || payload?.kind || browserKindFromMode(browserMode);
  currentId = params.id || payload?.id;
  if (syncConfig.enabled) await pullFromServer({ silent: true });
  if (browserMode && !currentId) {
    const collection = getBrowserCollection();
    currentId = collection[0]?.id || null;
  }
  const config = getViewConfig();
  currentEntity = config ? getEntity(config, currentId) : null;
  renderCalendar();
}

ensureSwapUi();
els.editToggle.addEventListener('click', () => setEditingMode(!editing));
if (els.swapToggle) els.swapToggle.addEventListener('click', () => setSwapMode(!swapMode));
els.calendarBody.addEventListener('click', event => {
  if (!swapMode || suppressSwapClick) return;
  const block = event.target.closest('.class-block.event-block');
  if (!block || block.classList.contains('fixed-block')) return;
  const scheduleId = block.dataset.scheduleId;
  if (!scheduleId) return;
  event.preventDefault();
  event.stopPropagation();
  openSwapModal(scheduleId);
});
if (els.swapModal) {
  els.swapModal.addEventListener('click', event => {
    if (event.target.matches('[data-swap-close]')) closeSwapModal();
    const target = event.target.closest('[data-swap-option-id]');
    if (target && swapSelectedScheduleId) performSwapOption(target.dataset.swapOptionId);
  });
}
if (els.swapCancelBtn) els.swapCancelBtn.addEventListener('click', closeSwapModal);
if (els.swapModalCloseBtn) els.swapModalCloseBtn.addEventListener('click', closeSwapModal);
els.printBtn.addEventListener('click', () => window.print());
if (els.exportIcsBtn) els.exportIcsBtn.addEventListener('click', exportCurrentIcs);
if (els.exportAllTeacherXlsxBtn) els.exportAllTeacherXlsxBtn.addEventListener('click', exportAllTeacherXlsxFromBrowser);
if (els.navigatorSelect) els.navigatorSelect.addEventListener('change', event => selectBrowserEntity(event.target.value));
els.closeBtn.addEventListener('click', () => window.close());
els.refreshBtn.addEventListener('click', refreshFromStorage);
els.calendarBody.addEventListener('pointerdown', startPointerDrag);
window.addEventListener('pointermove', handlePointerMove, { passive: false });
window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('pointercancel', () => cancelPointerDrag());

els.calendarBody.addEventListener('dragstart', event => {
  const block = event.target.closest('.class-block');
  if (!editing || !block || block.classList.contains('fixed-block')) { event.preventDefault(); return; }
  const scheduleId = block.dataset.scheduleId;
  if (!scheduleId || !getScheduleById(scheduleId)) { event.preventDefault(); return; }
  block.classList.add('dragging');
  event.dataTransfer.setData('text/plain', scheduleId);
  event.dataTransfer.effectAllowed = 'move';
  markAvailableDropSlots(scheduleId);
});
els.calendarBody.addEventListener('dragend', event => {
  const block = event.target.closest('.class-block');
  if (block) block.classList.remove('dragging');
  clearDropAvailabilityHighlights();
});
els.calendarBody.addEventListener('dragover', event => {
  const cell = event.target.closest('.drop-slot');
  if (!editing || !cell || !cell.dataset.day || !cell.dataset.start || !cell.classList.contains('available-drop')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  cell.classList.add('drag-over');
});
els.calendarBody.addEventListener('dragleave', event => {
  const cell = event.target.closest('.drop-slot');
  if (cell && !cell.contains(event.relatedTarget)) cell.classList.remove('drag-over');
});
els.calendarBody.addEventListener('drop', event => {
  const cell = event.target.closest('.drop-slot');
  if (!editing || !cell || !cell.dataset.day || !cell.dataset.start) return;
  event.preventDefault();
  const scheduleId = event.dataTransfer.getData('text/plain') || activeDragScheduleId;
  const canDrop = cell.classList.contains('available-drop');
  clearDropAvailabilityHighlights();
  if (!canDrop) {
    showModal('This slot is unavailable for the selected class. Drop only on highlighted available slots.');
    return;
  }
  if (scheduleId) moveSchedule(scheduleId, cell.dataset.day, cell.dataset.start);
});
els.modalOkBtn.addEventListener('click', closeModal); els.modalCloseBtn.addEventListener('click', closeModal); els.messageModal.addEventListener('click', event => { if (event.target.matches('[data-modal-close]')) closeModal(); }); document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal(); closeSwapModal(); } });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) refreshFromStorage(); });
initializeView();
