const STORAGE_KEY = 'offlineClassScheduler.v1';
const API_CONFIG_KEY = 'offlineClassScheduler.apiConfig.v1';
const API_REVISION_KEY = 'offlineClassScheduler.apiRevision.v1';
const SYNC_POLL_MS = 10000;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_ROOM_ID = '__default_classroom__';
const DEFAULT_ROOM_NAME = 'Default Classroom';
const NO_TEACHER_SELECT_VALUE = '__no_teacher__';
const NO_TEACHER_LABEL = 'No Teacher (NT)';

const defaultData = {
  settings: { dayStart: '07:30', dayEnd: '16:30', slotDuration: 50, dayStarts: { Monday: '07:50', Tuesday: '07:30', Wednesday: '07:30', Thursday: '07:30', Friday: '07:30' } },
  sections: [],
  subjects: [],
  teachers: [],
  rooms: [],
  teachingLoads: [],
  fixedActivities: [],
  schedules: [],
  scheduleWaitlist: [],
  generatorRun: 0
};

const $ = id => document.getElementById(id);
let data = loadData();
let syncConfig = loadSyncConfig();
let remoteRevision = Number(localStorage.getItem(API_REVISION_KEY) || 0);
let pushTimer = null;
let pollTimer = null;
let pendingConfirmAction = null;
const editState = { sections: null, subjects: null, teachers: null, rooms: null, teachingLoads: null, fixedActivities: null, schedules: null };
let pendingWaitlistId = null;
let pendingDeferredServerPull = false;
let pendingDeferredExternalRefresh = false;

const els = {
  alert: $('alert'),
  messageModal: $('messageModal'), modalTitle: $('modalTitle'), modalMessage: $('modalMessage'), modalIcon: $('modalIcon'), modalTypeLabel: $('modalTypeLabel'), modalCloseBtn: $('modalCloseBtn'), modalOkBtn: $('modalOkBtn'),
  confirmModal: $('confirmModal'), confirmTitle: $('confirmTitle'), confirmMessage: $('confirmMessage'), confirmCloseBtn: $('confirmCloseBtn'), confirmCancelBtn: $('confirmCancelBtn'), confirmActionBtn: $('confirmActionBtn'),
  sectionForm: $('sectionForm'), subjectForm: $('subjectForm'), teacherForm: $('teacherForm'), teacherStartTime: $('teacherStartTime'), roomForm: $('roomForm'), settingsForm: $('settingsForm'), scheduleForm: $('scheduleForm'), teachingLoadForm: $('teachingLoadForm'), syncForm: $('syncForm'),
  scheduleSection: $('scheduleSection'), scheduleSubject: $('scheduleSubject'), scheduleTeacher: $('scheduleTeacher'), scheduleDay: $('scheduleDay'), scheduleStart: $('scheduleStart'), scheduleDuration: $('scheduleDuration'), roomMode: $('roomMode'), manualRoomWrap: $('manualRoomWrap'), manualRoom: $('manualRoom'),
  loadSubject: $('loadSubject'), loadTeacher: $('loadTeacher'), loadMeetings: $('loadMeetings'), loadDuration: $('loadDuration'), loadRoomMode: $('loadRoomMode'), loadManualRoomWrap: $('loadManualRoomWrap'), loadManualRoom: $('loadManualRoom'), teachingLoadList: $('teachingLoadList'), replaceExistingSchedule: $('replaceExistingSchedule'), loadSectionChoices: $('loadSectionChoices'), loadSectionFilter: $('loadSectionFilter'), loadSelectAllSections: $('loadSelectAllSections'), loadClearSections: $('loadClearSections'), loadSelectMatchingSections: $('loadSelectMatchingSections'), loadCsvFile: $('loadCsvFile'), loadCsvImportBtn: $('loadCsvImportBtn'), loadCsvTemplateBtn: $('loadCsvTemplateBtn'), loadCsvCreateMissing: $('loadCsvCreateMissing'), resetTeachingLoadsBtn: $('resetTeachingLoadsBtn'),
  fixedActivityForm: $('fixedActivityForm'), fixedType: $('fixedType'), fixedTitle: $('fixedTitle'), fixedSubjectFields: $('fixedSubjectFields'), fixedBatchFields: $('fixedBatchFields'), fixedSubject: $('fixedSubject'), fixedTeacher: $('fixedTeacher'), fixedTeacherFilter: $('fixedTeacherFilter'), fixedTeacherChoices: $('fixedTeacherChoices'), fixedTeacherSelectMatching: $('fixedTeacherSelectMatching'), fixedTeacherSelectAll: $('fixedTeacherSelectAll'), fixedTeacherClear: $('fixedTeacherClear'), fixedOfferingList: $('fixedOfferingList'), fixedAddOffering: $('fixedAddOffering'), fixedRoomMode: $('fixedRoomMode'), fixedManualRoomWrap: $('fixedManualRoomWrap'), fixedManualRoom: $('fixedManualRoom'), fixedStart: $('fixedStart'), fixedDuration: $('fixedDuration'), fixedSectionFilter: $('fixedSectionFilter'), fixedSectionChoices: $('fixedSectionChoices'), fixedActivityList: $('fixedActivityList'), fixedLunchPreset: $('fixedLunchPreset'), fixedSwpPreset: $('fixedSwpPreset'), fixedFlagCeremonyPreset: $('fixedFlagCeremonyPreset'), fixedFlagRetreatPreset: $('fixedFlagRetreatPreset'), fixedSelectAllSections: $('fixedSelectAllSections'), fixedClearSections: $('fixedClearSections'), fixedSelectMatchingSections: $('fixedSelectMatchingSections'),
  sectionList: $('sectionList'), subjectList: $('subjectList'), teacherList: $('teacherList'), roomList: $('roomList'), scheduleTable: $('scheduleTable'), filterSection: $('filterSection'), filterDay: $('filterDay'), showFixedSchedules: $('showFixedSchedules'),
  dayStart: $('dayStart'), dayEnd: $('dayEnd'), slotDuration: $('slotDuration'), dayStartMonday: $('dayStartMonday'), dayStartTuesday: $('dayStartTuesday'), dayStartWednesday: $('dayStartWednesday'), dayStartThursday: $('dayStartThursday'), dayStartFriday: $('dayStartFriday'), mondayFlagPatternBtn: $('mondayFlagPatternBtn'), importFile: $('importFile'), exportBtn: $('exportBtn'), printBtn: $('printBtn'), exportSpreadsheetBtn: $('exportSpreadsheetBtn'), exportSpreadsheetSideBtn: $('exportSpreadsheetSideBtn'), exportTeacherSpreadsheetSideBtn: $('exportTeacherSpreadsheetSideBtn'), browseSectionsBtn: $('browseSectionsBtn'), browseTeachersBtn: $('browseTeachersBtn'), clearScheduleForm: $('clearScheduleForm'), autoGenerateBtn: $('autoGenerateBtn'), reshuffleScheduleBtn: $('reshuffleScheduleBtn'), perfectScheduleBtn: $('perfectScheduleBtn'), masterResetScheduleBtn: $('masterResetScheduleBtn'), generationProgress: $('generationProgress'), generationProgressTitle: $('generationProgressTitle'), generationProgressCount: $('generationProgressCount'), generationProgressBar: $('generationProgressBar'), generationProgressDetail: $('generationProgressDetail'),
  syncEnabled: $('syncEnabled'), apiBaseUrl: $('apiBaseUrl'), syncStatus: $('syncStatus'), syncPullBtn: $('syncPullBtn'), syncPushBtn: $('syncPushBtn'), serverRevision: $('serverRevision'),
  statScheduledClasses: $('statScheduledClasses'), statTeachers: $('statTeachers'), statStudents: $('statStudents'), statSubjects: $('statSubjects'), statRooms: $('statRooms'),
  sectionCount: $('sectionCount'), subjectCount: $('subjectCount'), teacherCount: $('teacherCount'), roomCount: $('roomCount'), fixedCount: $('fixedCount'), loadCount: $('loadCount'),
  sectionButtonCount: $('sectionButtonCount'), subjectButtonCount: $('subjectButtonCount'), teacherButtonCount: $('teacherButtonCount'), roomButtonCount: $('roomButtonCount'), fixedButtonCount: $('fixedButtonCount'), loadButtonCount: $('loadButtonCount'), waitlistButtonCount: $('waitlistButtonCount'), syncButtonStatus: $('syncButtonStatus'), waitlistCount: $('waitlistCount'), waitlistList: $('waitlistList'), tryPlaceWaitlistBtn: $('tryPlaceWaitlistBtn'), clearWaitlistBtn: $('clearWaitlistBtn')
};

function cloneDefaultData() { return JSON.parse(JSON.stringify(defaultData)); }
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
  DAYS.forEach(day => {
    if (!merged.dayStarts[day]) merged.dayStarts[day] = baseStart;
  });
  return merged;
}
function normalizeData(source) {
  const safe = source || {};
  return {
    ...cloneDefaultData(),
    ...safe,
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
    schedules: Array.isArray(safe.schedules) ? safe.schedules.map(schedule => ({
      ...schedule,
      roomId: schedule.roomId || DEFAULT_ROOM_ID,
      roomMode: schedule.roomMode || (schedule.roomId ? 'manual' : 'default')
    })) : [],
    scheduleWaitlist: Array.isArray(safe.scheduleWaitlist) ? safe.scheduleWaitlist : [],
    generatorRun: Number(safe.generatorRun || 0)
  };
}
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeData(JSON.parse(saved)) : cloneDefaultData();
  } catch {
    return cloneDefaultData();
  }
}
function saveData(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
function saveSyncConfig() { localStorage.setItem(API_CONFIG_KEY, JSON.stringify(syncConfig)); }
function normalizeApiBaseUrl(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function getApiBaseUrl() { return normalizeApiBaseUrl(syncConfig.apiBaseUrl) || window.location.origin; }
function setSyncStatus(message, type = 'muted') {
  if (els.syncStatus) { els.syncStatus.textContent = message; els.syncStatus.className = `sync-status ${type}`; }
  if (els.serverRevision) els.serverRevision.textContent = syncConfig.enabled ? `Rev ${remoteRevision || 0}` : 'Local';
}

function getOpenControlModal() {
  return document.querySelector('.control-modal:not(.hidden)');
}
function isUserEditingSchedulerInput() {
  const active = document.activeElement;
  const activeForm = active?.closest?.('form');
  return Boolean(getOpenControlModal() || (activeForm && activeForm !== els.syncForm));
}
function deferAutoRefreshWhileEditing(reason = 'editing') {
  if (!isUserEditingSchedulerInput()) return false;
  pendingDeferredServerPull = true;
  setSyncStatus(`Auto-sync paused while ${reason}. Save or close the modal to avoid losing unsaved input.`, 'warn');
  return true;
}
function noteExternalRefreshDeferred() {
  pendingDeferredExternalRefresh = true;
  setSyncStatus('A schedule update is waiting. Close the current modal or save your input first, then pull latest if needed.', 'warn');
}
function renderSyncSettings() {
  if (!els.syncEnabled || !els.apiBaseUrl) return;
  els.syncEnabled.checked = Boolean(syncConfig.enabled);
  els.apiBaseUrl.value = syncConfig.apiBaseUrl || '';
  setSyncStatus(syncConfig.enabled ? `Server sync is on. API: ${getApiBaseUrl()}` : 'Server sync is off. Data is saved locally in this browser.', syncConfig.enabled ? 'good' : 'muted');
  if (els.syncButtonStatus) els.syncButtonStatus.textContent = syncConfig.enabled ? `Server sync · Rev ${remoteRevision || 0}` : 'Local mode';
}
async function apiRequest(path, options = {}) {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}${path}`, {
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
  if (silent && deferAutoRefreshWhileEditing('you are entering data')) return false;
  try {
    setSyncStatus('Pulling latest schedule from server...', 'warn');
    const result = await apiRequest('/api/scheduler');
    data = normalizeData(result.data || cloneDefaultData());
    remoteRevision = Number(result.revision || 0);
    localStorage.setItem(API_REVISION_KEY, String(remoteRevision));
    saveData({ localOnly: true });
    renderAll();
    renderSyncSettings();
    setSyncStatus(`Synced from server. Revision ${remoteRevision}.`, 'good');
    if (!silent) showAlert('Latest server schedule loaded.');
    return true;
  } catch (error) {
    setSyncStatus(error.message || 'Could not connect to server.', 'bad');
    if (!silent) showAlert(error.message || 'Could not connect to the MongoDB API server.', 'error');
    return false;
  }
}
async function pushToServer({ force = false, silent = false } = {}) {
  if (!syncConfig.enabled) return false;
  try {
    setSyncStatus('Saving schedule to server...', 'warn');
    const payload = { data: normalizeData(data), expectedRevision: force ? null : remoteRevision };
    const result = await apiRequest('/api/scheduler', { method: 'PUT', body: JSON.stringify(payload) });
    remoteRevision = Number(result.revision || 0);
    localStorage.setItem(API_REVISION_KEY, String(remoteRevision));
    setSyncStatus(`Saved to server. Revision ${remoteRevision}.`, 'good');
    if (!silent) showAlert('Schedule pushed to server.');
    return true;
  } catch (error) {
    if (error.status === 409 && error.body?.data) {
      remoteRevision = Number(error.body.revision || remoteRevision || 0);
      localStorage.setItem(API_REVISION_KEY, String(remoteRevision));
      data = normalizeData(error.body.data);
      saveData({ localOnly: true });
      renderAll();
      renderSyncSettings();
      const message = 'Another user updated the schedule before your save. The latest server copy was loaded. Please re-apply your change if needed.';
      setSyncStatus(message, 'warn');
      if (!silent) showAlert(message, 'warning');
      return false;
    }
    setSyncStatus(error.message || 'Could not save to server.', 'bad');
    if (!silent) showAlert(error.message || 'Could not save to the MongoDB API server.', 'error');
    return false;
  }
}
function startSyncPolling() {
  clearInterval(pollTimer);
  if (!syncConfig.enabled) return;
  pollTimer = setInterval(() => pullFromServer({ silent: true }), SYNC_POLL_MS);
}
async function applySyncSettings() {
  syncConfig = { enabled: Boolean(els.syncEnabled?.checked), apiBaseUrl: normalizeApiBaseUrl(els.apiBaseUrl?.value || '') };
  saveSyncConfig();
  renderSyncSettings();
  startSyncPolling();
  if (syncConfig.enabled) await pullFromServer({ silent: false });
}
function createId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function sortByName(list) { return [...(list || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })); }
function pluralize(count, singular, plural = `${singular}s`) { return `${count} ${count === 1 ? singular : plural}`; }
function toMinutes(time) { const [h,m] = String(time || '00:00').split(':').map(Number); return h * 60 + m; }
function fromMinutes(total) { const h = Math.floor(total / 60) % 24; const m = total % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
function formatTime(time) { const [h,m] = String(time || '00:00').split(':').map(Number); const suffix = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${suffix}`; }
function getEndTime(start, duration) { return fromMinutes(toMinutes(start) + Number(duration || 0)); }
function timeRange(start, duration) { return `${formatTime(start)} - ${formatTime(getEndTime(start, duration))}`; }
function overlaps(aStart, aDuration, bStart, bDuration) { const aEnd = toMinutes(aStart) + Number(aDuration || 0); const bEnd = toMinutes(bStart) + Number(bDuration || 0); return toMinutes(aStart) < bEnd && toMinutes(bStart) < aEnd; }
function isDefaultRoom(roomId) { return !roomId || roomId === DEFAULT_ROOM_ID; }
function byName(list, id) {
  if (isDefaultRoom(id)) return DEFAULT_ROOM_NAME;
  const match = list.find(item => item.id === id);
  if (match) return match.name;
  const nameMatch = list.find(item => item.name === id);
  return nameMatch ? nameMatch.name : 'Deleted Item';
}
function isNoTeacherId(value) { return !String(value || '').trim() || value === NO_TEACHER_SELECT_VALUE; }
function teacherName(teacherId) { return isNoTeacherId(teacherId) ? NO_TEACHER_LABEL : byName(data.teachers, teacherId); }
function teacherSelectValueToId(value) { return value === NO_TEACHER_SELECT_VALUE ? '' : String(value || ''); }
function teacherIdToSelectValue(value) { return isNoTeacherId(value) ? NO_TEACHER_SELECT_VALUE : value; }
function normalizeNoTeacherKey(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function isNoTeacherCsvValue(value) { return ['nt', 'noteacher', 'none', 'n/a', 'na', 'noassignedteacher', 'independent'].includes(normalizeNoTeacherKey(value)); }
function roomName(roomId) { return isDefaultRoom(roomId) ? DEFAULT_ROOM_NAME : byName(data.rooms, roomId); }
function loadRoomLabel(load) {
  if (!load || load.roomMode === 'default' || isDefaultRoom(load.roomId)) return DEFAULT_ROOM_NAME;
  if (load.roomMode === 'auto') return 'Auto Lab/Room';
  return byName(data.rooms, load.roomId);
}
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
function classLikeUniqueKey(item) { return isFixedTeachingSchedule(item) ? `fixedTeaching:${item.fixedActivityId}:${item.day}:${item.start}:${item.sectionId || ''}:${item.teacherId || ''}` : item.id; }
function getFixedDisplayTitle(item) { return item?.title || (item?.subjectId ? byName(data.subjects, item.subjectId) : 'Fixed Activity'); }
function getUniqueClassItems(schedules = []) {
  const seen = new Set();
  return schedules.filter(isClassLikeSchedule).filter(item => {
    const key = classLikeUniqueKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getTeacherStartTime(teacherId, source = data) {
  const teacher = (source.teachers || []).find(item => item.id === teacherId || item.name === teacherId);
  return teacher?.startTime || teacher?.officialStartTime || source.settings?.dayStart || defaultData.settings.dayStart;
}
function teacherStartLabel(teacher, source = data) {
  return `Starts ${formatTime(teacher?.startTime || teacher?.officialStartTime || source.settings?.dayStart || defaultData.settings.dayStart)}`;
}
function getTeacherStartConflict(schedule, source = data) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId) return '';
  const teacher = (source.teachers || []).find(item => item.id === schedule.teacherId || item.name === schedule.teacherId);
  if (!teacher) return '';
  const officialStart = getTeacherStartTime(schedule.teacherId, source);
  if (toMinutes(schedule.start) < toMinutes(officialStart)) {
    return `${teacher.name} officially starts at ${formatTime(officialStart)}, so they cannot be assigned to ${formatTime(schedule.start)}.`;
  }
  return '';
}
function isLunchSchedule(item) {
  const label = `${item?.title || ''} ${item?.category || ''}`.toLowerCase();
  return isFixedSchedule(item) && label.includes('lunch');
}
function getLunchBlocks(source = data) {
  return expandFixedActivities(source).filter(isLunchSchedule);
}
function getTeacherLunchWindow(source = data) {
  return {
    start: source.settings?.teacherLunchStart || '10:30',
    end: source.settings?.teacherLunchEnd || '13:00',
    duration: Number(source.settings?.teacherLunchDuration || source.settings?.slotDuration || 50)
  };
}
function teacherBusySlotsForDay(teacherId, day, schedules = getDisplayScheduleItems(), candidate = null, ignoreId = null, source = data) {
  const candidateId = candidate?.id || '__candidate__';
  return [...(schedules || []), candidate]
    .filter(Boolean)
    .filter(item => item.day === day && item.teacherId === teacherId)
    .filter(item => item.id !== ignoreId)
    .filter(item => item.id !== candidateId || item === candidate)
    .filter(item => isClassLikeSchedule(item))
    .map(item => ({
      start: toMinutes(item.start),
      end: toMinutes(item.start) + Number(item.duration || 0)
    }))
    .filter(slot => slot.end > slot.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
function teacherHasOpenWindowOnDay(teacherId, day, startMinute, duration, schedules, candidate, ignoreId, source = data) {
  const endMinute = startMinute + Number(duration || 0);
  return !teacherBusySlotsForDay(teacherId, day, schedules, candidate, ignoreId, source)
    .some(slot => startMinute < slot.end && slot.start < endMinute);
}
function hasTeacherLunchWindow(schedule, schedules = getDisplayScheduleItems(), ignoreId = null, source = data) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId || !schedule.day) return true;
  const window = getTeacherLunchWindow(source);
  const windowStart = toMinutes(window.start);
  const windowEnd = toMinutes(window.end);
  const needed = Math.max(1, Number(window.duration || 50));
  if (windowEnd <= windowStart || needed > (windowEnd - windowStart)) return true;

  const commonLunchDays = ['Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (commonLunchDays.includes(schedule.day)) {
    for (let start = windowStart; start + needed <= windowEnd; start += 5) {
      const isCommonFree = commonLunchDays.every(day =>
        teacherHasOpenWindowOnDay(schedule.teacherId, day, start, needed, schedules, schedule, ignoreId, source)
      );
      if (isCommonFree) return true;
    }
    return false;
  }

  for (let start = windowStart; start + needed <= windowEnd; start += 5) {
    if (teacherHasOpenWindowOnDay(schedule.teacherId, schedule.day, start, needed, schedules, schedule, ignoreId, source)) return true;
  }
  return false;
}
function getTeacherLunchConflict(schedule, schedules = getDisplayScheduleItems(), ignoreId = null, source = data) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId) return '';
  const teacher = (source.teachers || []).find(item => item.id === schedule.teacherId || item.name === schedule.teacherId);
  if (!teacher) return '';
  if (hasTeacherLunchWindow(schedule, schedules, ignoreId, source)) return '';
  const window = getTeacherLunchWindow(source);
  const commonLunchDays = ['Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (commonLunchDays.includes(schedule.day)) {
    return `${teacher.name} needs the same ${window.duration}-minute lunch window from Tuesday to Friday between ${formatTime(window.start)} and ${formatTime(window.end)}. This assignment would remove every common lunch window.`;
  }
  return `${teacher.name} needs at least ${window.duration} minutes for lunch between ${formatTime(window.start)} and ${formatTime(window.end)}. This assignment would remove all available lunch windows for the day.`;
}
function getClassItemsOnly(schedules = []) { return getUniqueClassItems(schedules); }
function getTeacherTotalLoadMinutes(teacherId, source = data) {
  const regular = (source.teachingLoads || [])
    .filter(load => load.teacherId === teacherId)
    .reduce((sum, load) => sum + Number(load.meetings || 1) * Number(load.duration || source.settings?.slotDuration || 50), 0);
  const fixedSubjects = (source.fixedActivities || [])
    .filter(activity => isFixedTeachingActivity(activity) && (activity.teacherId === teacherId || (activity.teacherIds || []).includes(teacherId)))
    .reduce((sum, activity) => sum + Math.max(1, (activity.days || [activity.day]).filter(Boolean).length) * Number(activity.duration || source.settings?.slotDuration || 50), 0);
  return regular + fixedSubjects;
}
function getTeacherTotalLoadMeetings(teacherId, source = data) {
  const regular = (source.teachingLoads || [])
    .filter(load => load.teacherId === teacherId)
    .reduce((sum, load) => sum + Number(load.meetings || 1), 0);
  const fixedSubjects = (source.fixedActivities || [])
    .filter(activity => isFixedTeachingActivity(activity) && (activity.teacherId === teacherId || (activity.teacherIds || []).includes(teacherId)))
    .reduce((sum, activity) => sum + Math.max(1, (activity.days || [activity.day]).filter(Boolean).length), 0);
  return regular + fixedSubjects;
}
function getTeacherDayMinutes(schedules, teacherId, day) {
  return getClassItemsOnly(schedules)
    .filter(item => item.teacherId === teacherId && item.day === day)
    .reduce((sum, item) => sum + Number(item.duration || data.settings.slotDuration || 50), 0);
}
function getTeacherDayCount(schedules, teacherId, day) {
  return getClassItemsOnly(schedules).filter(item => item.teacherId === teacherId && item.day === day).length;
}
function getTeacherActiveDayCount(schedules, teacherId) {
  return DAYS.filter(day => getTeacherDayCount(schedules, teacherId, day) > 0).length;
}

function getDayWindowConflict(schedule, source = data) {
  if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.day) return '';
  const teachingStart = getDayTeachingStart(schedule.day, source);
  const dayEnd = getDayEnd(schedule.day, source);
  if (toMinutes(schedule.start) < toMinutes(teachingStart)) {
    return `${schedule.day} teaching slots start at ${formatTime(teachingStart)}. Classes cannot be assigned to ${formatTime(schedule.start)} on this day.`;
  }
  if (toMinutes(schedule.start) + Number(schedule.duration || 0) > toMinutes(dayEnd)) {
    return `This class goes beyond the ${schedule.day} school day end time of ${formatTime(dayEnd)}.`;
  }
  return '';
}

function openMessageModal(message, type = 'error') {
  const warning = type === 'warning';
  els.modalTitle.textContent = warning ? 'Action Needed' : 'Schedule Conflict';
  els.modalTypeLabel.textContent = warning ? 'Please Review' : 'Unable to Continue';
  els.modalMessage.textContent = message;
  els.modalIcon.textContent = warning ? '!' : '×';
  els.messageModal.className = `modal ${warning ? 'warning' : 'error'}`;
  document.body.classList.add('modal-open');
  setTimeout(() => els.modalOkBtn.focus(), 0);
}
function closeMessageModal() { els.messageModal.className = 'modal hidden'; document.body.classList.remove('modal-open'); }
function openConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm }) {
  pendingConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;
  els.confirmTitle.textContent = title || 'Confirm Action';
  els.confirmMessage.textContent = message || 'Please confirm this action.';
  els.confirmActionBtn.textContent = confirmLabel;
  els.confirmModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => els.confirmCancelBtn.focus(), 0);
}
function closeConfirmModal() {
  els.confirmModal.classList.add('hidden');
  pendingConfirmAction = null;
  document.body.classList.remove('modal-open');
}
function runConfirmAction() {
  const action = pendingConfirmAction;
  closeConfirmModal();
  if (action) action();
}
function showAlert(message, type = 'success') {
  if (type === 'error' || type === 'warning') return openMessageModal(message, type);
  els.alert.textContent = message; els.alert.className = 'alert';
  clearTimeout(showAlert.timer); showAlert.timer = setTimeout(() => els.alert.className = 'alert hidden', 3500);
}



function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function setGenerationProgress({ attempt = 0, max = 50, currentFailures = null, bestFailures = null, bestPlaced = 0, status = 'running', seed = null } = {}) {
  if (!els.generationProgress) return;
  const percentage = max ? Math.min(100, Math.round((attempt / max) * 100)) : 0;
  els.generationProgress.classList.remove('hidden', 'done', 'warning');
  if (status === 'done') els.generationProgress.classList.add('done');
  if (status === 'warning') els.generationProgress.classList.add('warning');
  if (els.generationProgressTitle) {
    els.generationProgressTitle.textContent = status === 'done'
      ? 'Perfect schedule found'
      : status === 'warning'
        ? 'Best attempt saved'
        : 'Trying schedule combinations';
  }
  if (els.generationProgressCount) els.generationProgressCount.textContent = `${attempt} / ${max} attempts`;
  if (els.generationProgressBar) els.generationProgressBar.style.width = `${percentage}%`;
  if (els.generationProgressDetail) {
    const parts = [];
    if (currentFailures !== null) parts.push(`Current attempt: ${currentFailures} unplaced`);
    if (bestFailures !== null) parts.push(`Best so far: ${bestFailures} unplaced, ${bestPlaced} placed`);
    if (seed !== null && status === 'running') parts.push(`Seed: ${seed}`);
    els.generationProgressDetail.textContent = parts.length ? parts.join(' · ') : 'Preparing randomized attempts...';
  }
}
function resetGenerationProgress() {
  if (!els.generationProgress) return;
  els.generationProgress.classList.add('hidden');
  els.generationProgress.classList.remove('done', 'warning');
  if (els.generationProgressBar) els.generationProgressBar.style.width = '0%';
}
function setGenerationButtonsDisabled(disabled) {
  [els.autoGenerateBtn, els.reshuffleScheduleBtn, els.perfectScheduleBtn].forEach(button => {
    if (button) button.disabled = Boolean(disabled);
  });
}

function setButtonText(id, text) {
  const button = $(id);
  if (button) button.textContent = text;
}
function setHidden(id, hidden) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', Boolean(hidden));
}
function enterEditMode(collectionName, id) {
  editState[collectionName] = id;
}
function clearEditMode(collectionName) {
  editState[collectionName] = null;
}
function resetSimpleFormMode(collectionName, options = {}) {
  clearEditMode(collectionName);
  const formMap = {
    sections: { form: els.sectionForm, submit: 'sectionSubmitBtn', cancel: 'sectionCancelEdit', addLabel: 'Add Section' },
    subjects: { form: els.subjectForm, submit: 'subjectSubmitBtn', cancel: 'subjectCancelEdit', addLabel: 'Add Subject' },
    teachers: { form: els.teacherForm, submit: 'teacherSubmitBtn', cancel: 'teacherCancelEdit', addLabel: 'Add Teacher' },
    rooms: { form: els.roomForm, submit: 'roomSubmitBtn', cancel: 'roomCancelEdit', addLabel: 'Add Room' }
  };
  const config = formMap[collectionName];
  if (!config) return;
  if (options.reset !== false) config.form?.reset();
  if (collectionName === 'subjects' && $('subjectDuration')) $('subjectDuration').value = 50;
  if (collectionName === 'teachers' && els.teacherStartTime) els.teacherStartTime.value = data.settings.dayStart || defaultData.settings.dayStart;
  setButtonText(config.submit, config.addLabel);
  setHidden(config.cancel, true);
}
function setSimpleFormEditMode(collectionName, id) {
  const item = data[collectionName]?.find(entry => entry.id === id);
  if (!item) return showAlert('This item could not be found.', 'error');
  enterEditMode(collectionName, id);
  if (collectionName === 'sections') {
    $('sectionName').value = item.name || '';
    $('sectionSize').value = item.size || '';
    setButtonText('sectionSubmitBtn', 'Save Section');
    setHidden('sectionCancelEdit', false);
    openControlModal('sections');
  }
  if (collectionName === 'subjects') {
    $('subjectName').value = item.name || '';
    $('subjectDuration').value = item.duration || 50;
    setButtonText('subjectSubmitBtn', 'Save Subject');
    setHidden('subjectCancelEdit', false);
    openControlModal('subjects');
  }
  if (collectionName === 'teachers') {
    $('teacherName').value = item.name || '';
    if (els.teacherStartTime) els.teacherStartTime.value = item.startTime || item.officialStartTime || data.settings.dayStart || defaultData.settings.dayStart;
    setButtonText('teacherSubmitBtn', 'Save Teacher');
    setHidden('teacherCancelEdit', false);
    openControlModal('teachers');
  }
  if (collectionName === 'rooms') {
    $('roomName').value = item.name || '';
    $('roomCapacity').value = item.capacity || '';
    setButtonText('roomSubmitBtn', 'Save Room');
    setHidden('roomCancelEdit', false);
    openControlModal('rooms');
  }
}
function saveSimpleItem(collectionName, patch) {
  const editingId = editState[collectionName];
  const name = String(patch.name || '').trim();
  if (!name) return showAlert('Name is required.', 'warning');
  const duplicate = data[collectionName].some(existing => existing.id !== editingId && String(existing.name || '').toLowerCase() === name.toLowerCase());
  if (duplicate) return showAlert(`${name} already exists.`, 'warning');
  if (!editingId) {
    const prefixMap = { sections: 'sec', subjects: 'sub', teachers: 'tea', rooms: 'room' };
    data[collectionName].push({ id: createId(prefixMap[collectionName] || 'item'), ...patch, name });
    saveData(); renderAll(); resetSimpleFormMode(collectionName); showAlert(`${name} added.`);
    return;
  }
  const index = data[collectionName].findIndex(item => item.id === editingId);
  if (index < 0) return showAlert('The item you are editing could not be found.', 'error');
  const previous = { ...data[collectionName][index] };
  data[collectionName][index] = { ...data[collectionName][index], ...patch, name };
  if (collectionName === 'teachers') {
    const invalid = data.schedules.find(schedule => schedule.teacherId === editingId && getTeacherStartConflict(schedule));
    if (invalid) {
      data[collectionName][index] = previous;
      return showAlert(`${previous.name} still has a class at ${timeRange(invalid.start, invalid.duration)} on ${invalid.day}. Move that class first before changing the teacher official start time.`, 'error');
    }
  }
  saveData(); renderAll(); resetSimpleFormMode(collectionName); showAlert(`${name} updated.`);
}
function resetTeachingLoadFormMode(options = {}) {
  clearEditMode('teachingLoads');
  if (options.reset !== false) els.teachingLoadForm?.reset();
  if (els.loadMeetings) els.loadMeetings.value = 1;
  if (els.loadDuration) els.loadDuration.value = 50;
  if (els.loadRoomMode) els.loadRoomMode.value = 'default';
  if (els.loadManualRoomWrap) els.loadManualRoomWrap.classList.add('hidden');
  if (els.loadSectionFilter) els.loadSectionFilter.value = '';
  setAllLoadSections(false);
  setButtonText('loadSubmitBtn', 'Add Load(s)');
  setHidden('loadCancelEdit', true);
}
function setTeachingLoadEditMode(id) {
  const load = data.teachingLoads.find(item => item.id === id);
  if (!load) return showAlert('Teaching load not found.', 'error');
  enterEditMode('teachingLoads', id);
  if (els.loadSectionFilter) els.loadSectionFilter.value = '';
  renderLoadSectionChoices();
  setLoadSections([load.sectionId].filter(Boolean));
  els.loadSubject.value = load.subjectId || '';
  els.loadTeacher.value = teacherIdToSelectValue(load.teacherId);
  els.loadMeetings.value = load.meetings || 1;
  els.loadDuration.value = load.duration || 50;
  els.loadRoomMode.value = load.roomMode || 'default';
  els.loadManualRoomWrap.classList.toggle('hidden', els.loadRoomMode.value !== 'manual');
  if (els.loadRoomMode.value === 'manual') els.loadManualRoom.value = load.roomId || '';
  setButtonText('loadSubmitBtn', 'Save Load');
  setHidden('loadCancelEdit', false);
  openControlModal('loads');
}
function resetFixedActivityFormMode(options = {}) {
  clearEditMode('fixedActivities');
  if (options.reset !== false) els.fixedActivityForm?.reset();
  if (els.fixedStart) els.fixedStart.value = data.settings.dayStart || '07:30';
  if (els.fixedDuration) els.fixedDuration.value = data.settings.slotDuration || 50;
  if (els.fixedType) els.fixedType.value = 'activity';
  if (els.fixedSubjectFields) els.fixedSubjectFields.classList.add('hidden');
  if (els.fixedBatchFields) els.fixedBatchFields.classList.add('hidden');
  setAllFixedTeachers(false);
  setFixedOfferings([]);
  if (els.fixedRoomMode) els.fixedRoomMode.value = 'default';
  if (els.fixedManualRoomWrap) els.fixedManualRoomWrap.classList.add('hidden');
  setFixedDays([]);
  setAllFixedSections(false);
  setButtonText('fixedSubmitBtn', 'Add Fixed Activity');
  setHidden('fixedCancelEdit', true);
}
function setFixedActivityEditMode(id) {
  const activity = data.fixedActivities.find(item => item.id === id);
  if (!activity) return showAlert('Fixed activity not found.', 'error');
  enterEditMode('fixedActivities', id);
  els.fixedTitle.value = activity.title || '';
  if (els.fixedType) els.fixedType.value = isBatchSubjectActivity(activity) ? 'batch' : (isFixedSubjectActivity(activity) ? 'subject' : 'activity');
  toggleFixedSubjectFields();
  if (isFixedSubjectActivity(activity)) {
    if (els.fixedSubject) els.fixedSubject.value = activity.subjectId || '';
    if (els.fixedTeacher) els.fixedTeacher.value = activity.teacherId || '';
    if (els.fixedRoomMode) els.fixedRoomMode.value = activity.roomMode || (isDefaultRoom(activity.roomId) ? 'default' : 'manual');
    if (els.fixedManualRoomWrap) els.fixedManualRoomWrap.classList.toggle('hidden', els.fixedRoomMode.value !== 'manual');
    if (els.fixedManualRoom && els.fixedRoomMode?.value === 'manual') els.fixedManualRoom.value = activity.roomId || '';
  }
  renderTimeOptions();
  if (els.fixedStart) els.fixedStart.value = activity.start || data.settings.dayStart || '07:30';
  els.fixedDuration.value = activity.duration || data.settings.slotDuration || 50;
  setFixedDays((activity.days || [activity.day]).filter(Boolean));
  setAllFixedSections(false);
  document.querySelectorAll('.fixed-section-checkbox').forEach(input => { input.checked = (activity.sectionIds || []).includes(input.value); });
  setAllFixedTeachers(false);
  setFixedOfferings(isBatchSubjectActivity(activity) ? getBatchOfferings(activity) : []);
  setFixedTeachers(activity.teacherIds || [activity.teacherId].filter(Boolean));
  setButtonText('fixedSubmitBtn', 'Save Fixed Activity');
  setHidden('fixedCancelEdit', false);
  openControlModal('fixed');
}
function resetScheduleFormMode(options = {}) {
  clearEditMode('schedules');
  const shouldResetFields = options.reset !== false;
  if (shouldResetFields) {
    els.scheduleForm?.reset();
    if (els.roomMode) els.roomMode.value = 'default';
    if (els.manualRoomWrap) els.manualRoomWrap.classList.add('hidden');
    if (els.scheduleDuration) els.scheduleDuration.value = 50;
    renderTimeOptions();
  }
  setButtonText('scheduleSubmitBtn', 'Add');
  setHidden('scheduleCancelEdit', true);
}
function setScheduleEditMode(id) {
  const item = data.schedules.find(schedule => schedule.id === id);
  if (!item) return showAlert('Schedule entry not found.', 'error');
  enterEditMode('schedules', id);
  els.scheduleSection.value = item.sectionId || '';
  els.scheduleSubject.value = item.subjectId || '';
  els.scheduleTeacher.value = teacherIdToSelectValue(item.teacherId);
  els.scheduleDay.value = item.day || 'Monday';
  renderTimeOptions();
  if ([...els.scheduleStart.options].some(opt => opt.value === item.start)) els.scheduleStart.value = item.start;
  els.scheduleDuration.value = item.duration || 50;
  els.roomMode.value = item.roomMode || (isDefaultRoom(item.roomId) ? 'default' : 'manual');
  els.manualRoomWrap.classList.toggle('hidden', els.roomMode.value !== 'manual');
  if (els.roomMode.value === 'manual') els.manualRoom.value = item.roomId || '';
  setButtonText('scheduleSubmitBtn', 'Save Changes');
  setHidden('scheduleCancelEdit', false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showAlert('Schedule entry loaded for editing. Review the fields, then click Save Changes.', 'warning');
}
function buildScheduleFromForm(existingId = null) {
  const duration = Number(els.scheduleDuration.value || 50);
  const mode = els.roomMode.value || 'default';
  const item = {
    id: existingId || createId('sched'),
    sectionId: els.scheduleSection.value,
    subjectId: els.scheduleSubject.value,
    teacherId: teacherSelectValueToId(els.scheduleTeacher.value),
    day: els.scheduleDay.value,
    start: els.scheduleStart.value,
    duration,
    roomId: DEFAULT_ROOM_ID,
    roomMode: mode
  };
  if (mode === 'manual') item.roomId = els.manualRoom.value || null;
  if (mode === 'auto') item.roomId = getRoomIdForMode(mode, null, item.sectionId, item.day, item.start, duration, data.schedules.filter(schedule => schedule.id !== existingId));
  return item;
}
function getDayTeachingStart(day, source = data) {
  const settings = normalizeSettings(source.settings || defaultData.settings);
  return settings.dayStarts?.[day] || settings.dayStart || defaultData.settings.dayStart;
}
function getDayEnd(day, source = data) {
  return normalizeSettings(source.settings || defaultData.settings).dayEnd || defaultData.settings.dayEnd;
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
function getSectionProtectedBlocks(day, sectionId, source = data) {
  if (!day || !sectionId) return [];
  return mergeTimeBlocks(expandFixedActivities(source)
    .filter(item => item.day === day && item.sectionId === sectionId)
    .map(item => ({ start: item.start, duration: item.duration })));
}
function generateBaseSlots(day = null, source = data) {
  const settings = normalizeSettings(source.settings || defaultData.settings);
  const slots = [];
  const start = toMinutes(day ? getDayTeachingStart(day, source) : settings.dayStart);
  const end = toMinutes(settings.dayEnd || defaultData.settings.dayEnd);
  const step = Number(settings.slotDuration || 50);
  for (let t = start; t < end; t += step) slots.push(fromMinutes(t));
  return slots;
}
function generateSlots(day = null, options = {}) {
  const source = options?.source || data;
  const settings = normalizeSettings(source.settings || defaultData.settings);
  const sectionId = options?.sectionId || options?.section || '';
  if (!day || !sectionId) return generateBaseSlots(day, source);

  const slots = [];
  const step = Number(settings.slotDuration || 50);
  const dayEndMinutes = toMinutes(getDayEnd(day, source));
  const protectedBlocks = getSectionProtectedBlocks(day, sectionId, source);
  let cursor = toMinutes(getDayTeachingStart(day, source));

  while (cursor < dayEndMinutes) {
    const activeBlock = protectedBlocks.find(block => block.start <= cursor && block.end > cursor);
    if (activeBlock) {
      cursor = activeBlock.end;
      continue;
    }
    const nominalEnd = Math.min(cursor + step, dayEndMinutes);
    const nextBlock = protectedBlocks.find(block => block.start > cursor && block.start < nominalEnd);
    if (!nextBlock) slots.push(fromMinutes(cursor));
    cursor = nextBlock ? nextBlock.start : nominalEnd;
  }
  return slots;
}
function generateAllSlotStarts() {
  const starts = new Set(['07:30', '07:50', '15:00']);
  generateSlots().forEach(slot => starts.add(slot));
  DAYS.forEach(day => {
    generateSlots(day).forEach(slot => starts.add(slot));
    (data.sections || []).forEach(section => generateSlots(day, { sectionId: section.id }).forEach(slot => starts.add(slot)));
  });
  (data.fixedActivities || []).forEach(activity => {
    if (activity.start) starts.add(activity.start);
    if (activity.start && activity.duration) starts.add(getEndTime(activity.start, activity.duration));
  });
  return Array.from(starts).sort((a,b) => toMinutes(a) - toMinutes(b));
}
function setMondayFlagPattern() {
  const start = data.settings.dayStart || '07:30';
  data.settings.dayStarts = { ...getDefaultDayStarts(data.settings.dayStart), ...(data.settings.dayStarts || {}), Monday: fromMinutes(toMinutes(start) + 20) };
  if (els.dayStartMonday) els.dayStartMonday.value = data.settings.dayStarts.Monday;
  if (els.fixedTitle && els.fixedStart && els.fixedDuration) {
    els.fixedTitle.value = 'Flag Ceremony';
    els.fixedStart.value = start;
    els.fixedDuration.value = 20;
    setFixedDays(['Monday']);
  }
  saveData();
  renderAll();
  showAlert('Monday teaching start set to 7:50 AM. Add the Flag Ceremony fixed activity to protect the 7:30–7:50 slot for selected sections.');
}
function renderOptions(select, list, placeholder, labelFn = item => item.name) {
  if (!select) return;
  select.innerHTML = `<option value="" disabled selected>${escapeHtml(placeholder)}</option>`;
  sortByName(list).forEach(item => select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(item.id)}">${escapeHtml(labelFn(item))}</option>`));
}
function renderTeacherSelect(select, placeholder, includeNoTeacher = false) {
  renderOptions(select, data.teachers, placeholder, item => `${item.name} · ${teacherStartLabel(item)}`);
  if (select && includeNoTeacher) {
    select.insertAdjacentHTML('beforeend', `<option value="${NO_TEACHER_SELECT_VALUE}">${NO_TEACHER_LABEL} · independent/student activity</option>`);
  }
}
function renderTimeOptions() {
  const selectedDay = els.scheduleDay?.value || DAYS[0];
  const previousScheduleStart = els.scheduleStart?.value;
  const scheduleSectionId = els.scheduleSection?.value || '';
  const scheduleOptions = generateSlots(selectedDay, { sectionId: scheduleSectionId }).map(slot => `<option value="${slot}">${formatTime(slot)}</option>`).join('');
  if (els.scheduleStart) {
    els.scheduleStart.innerHTML = scheduleOptions;
    if ([...els.scheduleStart.options].some(opt => opt.value === previousScheduleStart)) els.scheduleStart.value = previousScheduleStart;
  }
  // Fixed activities use a manual <input type="time"> so lunch, SWP, flag ceremony,
  // and custom protected blocks can be inserted at any exact start time.
  if (els.fixedStart && !els.fixedStart.value) els.fixedStart.value = data.settings.dayStart || '07:30';
}
function weeklyKindForCollection(collectionName) { return { sections: 'section', teachers: 'teacher', rooms: 'room' }[collectionName] || null; }
function renderItemList(container, items, collectionName, metaFn) {
  container.innerHTML = '';
  if (!items.length) { container.innerHTML = '<li><span><strong>No data yet</strong><br><small>Add one above.</small></span></li>'; return; }
  const kind = weeklyKindForCollection(collectionName);
  sortByName(items).forEach(item => {
    const viewLabel = kind === 'room' ? 'View Room' : 'View Weekly';
    const metaSuffix = kind ? (kind === 'room' ? ' · Click to view room schedule' : ' · Click to view weekly schedule') : '';
    container.insertAdjacentHTML('beforeend', `
      <li>
        <span class="item-main ${kind ? 'clickable-name' : ''}" ${kind ? `data-open-weekly-kind="${kind}" data-open-weekly-id="${escapeHtml(item.id)}" title="Open weekly schedule"` : ''}>
          <strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(metaFn(item) + metaSuffix)}</small>
        </span>
        <span class="item-actions">
          ${kind ? `<button type="button" class="secondary compact-btn" data-open-weekly-kind="${kind}" data-open-weekly-id="${escapeHtml(item.id)}">${viewLabel}</button>` : ''}
          <button type="button" class="secondary compact-btn" data-edit="${escapeHtml(item.id)}" data-collection="${collectionName}">Edit</button>
          <button type="button" class="icon-btn compact-btn" data-delete="${escapeHtml(item.id)}" data-collection="${collectionName}">Delete</button>
        </span>
      </li>`);
  });
}
function renderTeachingLoadList() {
  const list = els.teachingLoadList;
  list.innerHTML = '';
  if (!data.teachingLoads.length) {
    list.innerHTML = '<li><span><strong>No teaching loads yet</strong><br><small>Add loads before using Auto Generate.</small></span></li>';
    return;
  }
  [...data.teachingLoads].sort((a,b) => byName(data.sections, a.sectionId).localeCompare(byName(data.sections, b.sectionId), undefined, { sensitivity: 'base' }) || byName(data.subjects, a.subjectId).localeCompare(byName(data.subjects, b.subjectId), undefined, { sensitivity: 'base' }) || teacherName(a.teacherId).localeCompare(teacherName(b.teacherId), undefined, { sensitivity: 'base' })).forEach(load => {
    const section = byName(data.sections, load.sectionId);
    const subject = byName(data.subjects, load.subjectId);
    const teacher = teacherName(load.teacherId);
    const room = loadRoomLabel(load);
    list.insertAdjacentHTML('beforeend', `
      <li>
        <span>
          <strong>${escapeHtml(section)} · ${escapeHtml(subject)}</strong><br>
          <small>${escapeHtml(teacher)} · ${Number(load.meetings || 1)}x/week · ${Number(load.duration || 50)} mins · ${escapeHtml(room)}</small>
        </span>
        <span class="item-actions">
          <button type="button" class="secondary compact-btn" data-edit-load="${escapeHtml(load.id)}">Edit</button>
          <button type="button" class="icon-btn compact-btn" data-delete-load="${escapeHtml(load.id)}">Delete</button>
        </span>
      </li>`);
  });
  data.fixedActivities.filter(isFixedTeachingActivity).forEach(activity => {
    const days = (activity.days || [activity.day]).filter(Boolean).join(', ');
    const sections = (activity.sectionIds || []).map(id => byName(data.sections, id));
    const preview = sections.slice(0, 2).join(', ') + (sections.length > 2 ? ` +${sections.length - 2} more` : '');
    list.insertAdjacentHTML('beforeend', `
      <li>
        <span>
          <strong>${escapeHtml(isBatchSubjectActivity(activity) ? `${(activity.teacherIds || []).map(id => byName(data.teachers, id)).join(', ') || 'No teachers'} · ${activity.title || 'Batch Subject'}` : `${byName(data.teachers, activity.teacherId)} · ${activity.title || byName(data.subjects, activity.subjectId)}`)}</strong><br>
          <small>${escapeHtml(isBatchSubjectActivity(activity) ? 'Batch-wide fixed load' : 'Fixed subject load')} · ${escapeHtml(days)} · ${escapeHtml(timeRange(activity.start, activity.duration))} · ${escapeHtml(preview || 'No sections')}</small>
        </span>
        <span class="item-actions">
          <button type="button" class="secondary compact-btn" data-edit-fixed-activity="${escapeHtml(activity.id)}">Edit</button>
        </span>
      </li>`);
  });
}


function renderLoadSectionChoices() {
  if (!els.loadSectionChoices) return;
  const selected = new Set([...els.loadSectionChoices.querySelectorAll('input:checked')].map(input => input.value));
  if (!data.sections.length) {
    els.loadSectionChoices.innerHTML = '<p class="muted-note">Add sections first, then select sections here.</p>';
    return;
  }
  els.loadSectionChoices.innerHTML = sortByName(data.sections).map(section => `
    <label class="checkbox-row mini-check">
      <input type="checkbox" class="load-section-checkbox" value="${escapeHtml(section.id)}" ${selected.has(section.id) ? 'checked' : ''} />
      <span>${escapeHtml(section.name)}${section.size ? ` · ${Number(section.size)} students` : ''}</span>
    </label>`).join('');
}
function getSelectedLoadSections() { return [...document.querySelectorAll('.load-section-checkbox:checked')].map(input => input.value); }
function setLoadSections(sectionIds) {
  const selected = new Set(sectionIds || []);
  document.querySelectorAll('.load-section-checkbox').forEach(input => { input.checked = selected.has(input.value); });
}
function setAllLoadSections(checked) { document.querySelectorAll('.load-section-checkbox').forEach(input => { input.checked = checked; }); }
function selectMatchingLoadSections() {
  const query = String(els.loadSectionFilter?.value || '').trim().toLowerCase();
  if (!query) return showAlert('Type a grade level or keyword first, for example Grade 7.', 'warning');
  let count = 0;
  document.querySelectorAll('.load-section-checkbox').forEach(input => {
    const section = data.sections.find(item => item.id === input.value);
    const match = section?.name?.toLowerCase().includes(query);
    input.checked = Boolean(match);
    if (match) count++;
  });
  showAlert(`${count} section(s) selected for this teaching load.`);
}

function scheduledClassCount() { return getDisplayScheduleItems().filter(item => isClassLikeSchedule(item) && item.sectionId).length; }
function totalStudentCount() { return data.sections.reduce((sum, section) => sum + Number(section.size || 0), 0); }
function setText(el, text) { if (el) el.textContent = text; }
function renderDashboardStats() {
  setText(els.statScheduledClasses, scheduledClassCount());
  setText(els.statTeachers, data.teachers.length);
  setText(els.statStudents, totalStudentCount());
  setText(els.statSubjects, data.subjects.length);
  setText(els.statRooms, data.rooms.length);
}
function renderControlCounts() {
  setText(els.sectionCount, `${pluralize(data.sections.length, 'section')} · ${totalStudentCount()} students`);
  setText(els.subjectCount, pluralize(data.subjects.length, 'subject'));
  setText(els.teacherCount, pluralize(data.teachers.length, 'teacher'));
  setText(els.roomCount, pluralize(data.rooms.length, 'room'));
  setText(els.fixedCount, pluralize(data.fixedActivities.length, 'fixed activity', 'fixed activities'));
  setText(els.loadCount, pluralize(data.teachingLoads.length + data.fixedActivities.filter(isFixedTeachingActivity).length, 'teacher load')); 
  setText(els.sectionButtonCount, `${pluralize(data.sections.length, 'section')} · ${totalStudentCount()} students`);
  setText(els.subjectButtonCount, pluralize(data.subjects.length, 'subject'));
  setText(els.teacherButtonCount, pluralize(data.teachers.length, 'teacher'));
  setText(els.roomButtonCount, pluralize(data.rooms.length, 'room'));
  setText(els.fixedButtonCount, pluralize(data.fixedActivities.length, 'fixed activity', 'fixed activities'));
  setText(els.loadButtonCount, pluralize(data.teachingLoads.length + data.fixedActivities.filter(isFixedTeachingActivity).length, 'teacher load')); 
  setText(els.waitlistCount, pluralize((data.scheduleWaitlist || []).length, 'unplaced class', 'unplaced classes'));
  setText(els.waitlistButtonCount, pluralize((data.scheduleWaitlist || []).length, 'unplaced class', 'unplaced classes'));
  if (els.syncButtonStatus) els.syncButtonStatus.textContent = syncConfig.enabled ? `Server sync · Rev ${remoteRevision || 0}` : 'Local mode';
}

function renderLists() {
  renderItemList(els.sectionList, data.sections, 'sections', item => item.size ? `${item.size} students` : 'No size set');
  renderItemList(els.subjectList, data.subjects, 'subjects', item => `${item.duration || 50} mins`);
  renderItemList(els.teacherList, data.teachers, 'teachers', item => teacherStartLabel(item));
  renderItemList(els.roomList, data.rooms, 'rooms', item => item.capacity ? `Capacity ${item.capacity}` : 'Laboratory / special room');
  renderTeachingLoadList();
  renderLoadSectionChoices();
  renderFixedSectionChoices();
  renderFixedTeacherChoices();
  renderFixedActivityList();
  renderWaitlistList();
}
function renderSelects() {
  renderOptions(els.scheduleSection, data.sections, 'Choose section', item => item.size ? `${item.name} (${item.size})` : item.name);
  renderOptions(els.scheduleSubject, data.subjects, 'Choose subject', item => `${item.name} - ${item.duration || 50} mins`);
  renderTeacherSelect(els.scheduleTeacher, 'Choose teacher', true);
  renderOptions(els.manualRoom, data.rooms, 'Choose lab/room', item => item.capacity ? `${item.name} (${item.capacity})` : item.name);
  renderTeacherSelect(els.loadTeacher, 'Choose teacher', true);
  renderOptions(els.loadSubject, data.subjects, 'Choose subject', item => `${item.name} - ${item.duration || 50} mins`);
  renderOptions(els.loadManualRoom, data.rooms, 'Choose lab/room', item => item.capacity ? `${item.name} (${item.capacity})` : item.name);
  renderOptions(els.fixedSubject, data.subjects, 'Choose fixed subject', item => `${item.name} - ${item.duration || 50} mins`);
  renderOptions(els.fixedTeacher, data.teachers, 'Choose teacher', item => `${item.name} · ${teacherStartLabel(item)}`);
  renderOptions(els.fixedManualRoom, data.rooms, 'Choose assigned room/lab', item => item.capacity ? `${item.name} (${item.capacity})` : item.name);
  renderFixedTeacherChoices();
  refreshFixedOfferingRows();
}
function renderSettings() {
  data.settings = normalizeSettings(data.settings);
  els.dayStart.value = data.settings.dayStart;
  els.dayEnd.value = data.settings.dayEnd;
  els.slotDuration.value = data.settings.slotDuration;
  if (els.dayStartMonday) els.dayStartMonday.value = getDayTeachingStart('Monday');
  if (els.dayStartTuesday) els.dayStartTuesday.value = getDayTeachingStart('Tuesday');
  if (els.dayStartWednesday) els.dayStartWednesday.value = getDayTeachingStart('Wednesday');
  if (els.dayStartThursday) els.dayStartThursday.value = getDayTeachingStart('Thursday');
  if (els.dayStartFriday) els.dayStartFriday.value = getDayTeachingStart('Friday');
  if (els.teacherStartTime && !els.teacherStartTime.value) els.teacherStartTime.value = data.settings.dayStart || defaultData.settings.dayStart;
}
function renderScheduleFilters() {
  const previous = els.filterSection.value || 'all';
  els.filterSection.innerHTML = '<option value="all">All Sections</option>' + sortByName(data.sections).map(section => `<option value="${escapeHtml(section.id)}">${escapeHtml(section.name)}</option>`).join('');
  els.filterSection.value = [...els.filterSection.options].some(opt => opt.value === previous) ? previous : 'all';
}
function roomUpdateOptions(selectedRoomId) {
  const defaultOption = `<option value="${DEFAULT_ROOM_ID}" ${isDefaultRoom(selectedRoomId) ? 'selected' : ''}>${DEFAULT_ROOM_NAME}</option>`;
  return defaultOption + data.rooms.map(room => `<option value="${escapeHtml(room.id)}" ${room.id === selectedRoomId ? 'selected' : ''}>${escapeHtml(room.name)}</option>`).join('');
}

function isFixedSchedule(item) { return item?.type === 'fixed' || Boolean(item?.fixedActivityId); }
function expandFixedActivities(source = data) {
  const activities = Array.isArray(source.fixedActivities) ? source.fixedActivities : [];
  return activities.flatMap(activity => {
    const sectionIds = Array.isArray(activity.sectionIds) ? activity.sectionIds : [];
    const teacherIds = Array.isArray(activity.teacherIds) ? activity.teacherIds : [activity.teacherId].filter(Boolean);
    const offerings = getBatchOfferings(activity);
    const days = Array.isArray(activity.days) && activity.days.length ? activity.days : (activity.day ? [activity.day] : []);
    const duration = Number(activity.duration || data.settings.slotDuration || 50);
    const fixedSubject = isFixedSubjectActivity(activity);
    const batchSubject = isBatchSubjectActivity(activity);
    const subjectName = fixedSubject ? byName(data.subjects, activity.subjectId) : '';
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
function getDisplayScheduleItems() { return [...expandFixedActivities(data), ...data.schedules]; }
function scheduleLabel(item) { return isFixedSchedule(item) ? item.title || 'Fixed Activity' : byName(data.subjects, item.subjectId); }
function conflictLabel(item) { return isFixedTeachingSchedule(item) ? getFixedDisplayTitle(item) : isFixedSchedule(item) ? `${item.title || 'Fixed Activity'} fixed block` : byName(data.subjects, item.subjectId); }
function renderFixedSectionChoices() {
  if (!els.fixedSectionChoices) return;
  const selected = new Set([...els.fixedSectionChoices.querySelectorAll('input:checked')].map(input => input.value));
  if (!data.sections.length) {
    els.fixedSectionChoices.innerHTML = '<p class="muted-note">Add sections first, then select sections here.</p>';
    return;
  }
  els.fixedSectionChoices.innerHTML = sortByName(data.sections).map(section => `
    <label class="checkbox-row mini-check">
      <input type="checkbox" class="fixed-section-checkbox" value="${escapeHtml(section.id)}" ${selected.has(section.id) ? 'checked' : ''} />
      <span>${escapeHtml(section.name)}</span>
    </label>`).join('');
}
function teacherOptionsHtml(selectedId = '') {
  return '<option value="">Choose teacher</option>' + sortByName(data.teachers).map(teacher => `<option value="${escapeHtml(teacher.id)}" ${teacher.id === selectedId ? 'selected' : ''}>${escapeHtml(teacher.name)} · ${escapeHtml(teacherStartLabel(teacher))}</option>`).join('');
}
function roomOptionsHtml(selectedId = '') {
  return '<option value="">Choose room/lab</option>' + sortByName(data.rooms).map(room => `<option value="${escapeHtml(room.id)}" ${room.id === selectedId ? 'selected' : ''}>${escapeHtml(room.capacity ? `${room.name} (${room.capacity})` : room.name)}</option>`).join('');
}
function offeringRoomModeOptions(selected = 'default') {
  return `<option value="default" ${selected === 'default' ? 'selected' : ''}>Default / no room</option><option value="manual" ${selected === 'manual' ? 'selected' : ''}>Manual room/lab</option>`;
}
function addFixedOfferingRow(offering = {}) {
  if (!els.fixedOfferingList) return;
  if (els.fixedOfferingList.querySelector('.batch-offering-empty')) els.fixedOfferingList.innerHTML = '';
  const normalized = normalizeBatchOffering({ title: els.fixedTitle?.value || 'Elective' }, offering, document.querySelectorAll('.batch-offering-row').length);
  const rowId = normalized.id || createId('offering');
  const manual = normalized.roomMode === 'manual';
  els.fixedOfferingList.insertAdjacentHTML('beforeend', `
    <div class="batch-offering-row" data-offering-id="${escapeHtml(rowId)}">
      <label>Teacher
        <select class="fixed-offering-teacher" required>${teacherOptionsHtml(normalized.teacherId)}</select>
      </label>
      <label>Specific Title for Teacher/Room View
        <input type="text" class="fixed-offering-title" value="${escapeHtml(normalized.title)}" placeholder="e.g., Drone Technology Elective" required />
      </label>
      <label>Room Assignment
        <select class="fixed-offering-room-mode">${offeringRoomModeOptions(normalized.roomMode || 'default')}</select>
      </label>
      <label class="fixed-offering-room-wrap ${manual ? '' : 'hidden'}">Room/Lab
        <select class="fixed-offering-room">${roomOptionsHtml(normalized.roomId)}</select>
      </label>
      <button type="button" class="icon-btn compact-btn remove-offering-btn" aria-label="Remove offering">Delete</button>
    </div>`);
}
function getFixedOfferingsFromForm() {
  return [...document.querySelectorAll('.batch-offering-row')].map((row, index) => {
    const roomMode = row.querySelector('.fixed-offering-room-mode')?.value || 'default';
    return normalizeBatchOffering({ title: els.fixedTitle?.value || 'Elective' }, {
      id: row.dataset.offeringId || `offering_form_${index}`,
      teacherId: row.querySelector('.fixed-offering-teacher')?.value || '',
      title: row.querySelector('.fixed-offering-title')?.value || '',
      roomMode,
      roomId: roomMode === 'manual' ? row.querySelector('.fixed-offering-room')?.value || '' : DEFAULT_ROOM_ID
    }, index);
  }).filter(offering => offering.teacherId || offering.title || !isDefaultRoom(offering.roomId));
}
function setFixedOfferings(offerings = []) {
  if (!els.fixedOfferingList) return;
  els.fixedOfferingList.innerHTML = '';
  const list = (offerings || []).length ? offerings : [];
  if (!list.length) {
    els.fixedOfferingList.innerHTML = '<div class="batch-offering-empty">No specific offerings yet. Click Add Offering to assign each elective/research teacher, title, and room.</div>';
    return;
  }
  list.forEach(offering => addFixedOfferingRow(offering));
}
function refreshFixedOfferingRows() {
  if (!els.fixedOfferingList || els.fixedType?.value !== 'batch') return;
  const current = getFixedOfferingsFromForm();
  if (current.length) setFixedOfferings(current);
}
function toggleOfferingRoom(row) {
  const mode = row.querySelector('.fixed-offering-room-mode')?.value || 'default';
  row.querySelector('.fixed-offering-room-wrap')?.classList.toggle('hidden', mode !== 'manual');
}
function renderFixedTeacherChoices() {
  if (!els.fixedTeacherChoices) return;
  const selected = new Set([...els.fixedTeacherChoices.querySelectorAll('input:checked')].map(input => input.value));
  if (!data.teachers.length) {
    els.fixedTeacherChoices.innerHTML = '<p class="muted-note">Add teachers first, then select assigned teachers here.</p>';
    return;
  }
  els.fixedTeacherChoices.innerHTML = sortByName(data.teachers).map(teacher => `
    <label class="checkbox-row mini-check">
      <input type="checkbox" class="fixed-teacher-checkbox" value="${escapeHtml(teacher.id)}" ${selected.has(teacher.id) ? 'checked' : ''} />
      <span>${escapeHtml(teacher.name)} · ${escapeHtml(teacherStartLabel(teacher))}</span>
    </label>`).join('');
}
function getSelectedFixedTeachers() { const offeringTeachers = getFixedOfferingsFromForm().map(offering => offering.teacherId).filter(Boolean); if (offeringTeachers.length) return offeringTeachers; return [...document.querySelectorAll('.fixed-teacher-checkbox:checked')].map(input => input.value); }
function setFixedTeachers(teacherIds) {
  const selected = new Set(teacherIds || []);
  document.querySelectorAll('.fixed-teacher-checkbox').forEach(input => { input.checked = selected.has(input.value); });
}
function setAllFixedTeachers(checked) { document.querySelectorAll('.fixed-teacher-checkbox').forEach(input => { input.checked = checked; }); }
function selectMatchingFixedTeachers() {
  const query = String(els.fixedTeacherFilter?.value || '').trim().toLowerCase();
  if (!query) return showAlert('Type a teacher keyword first.', 'warning');
  let count = 0;
  document.querySelectorAll('.fixed-teacher-checkbox').forEach(input => {
    const teacher = data.teachers.find(item => item.id === input.value);
    const match = teacher?.name?.toLowerCase().includes(query);
    input.checked = Boolean(match);
    if (match) count++;
  });
  showAlert(`${count} teacher(s) selected for this batch-wide block.`);
}
function renderFixedActivityList() {
  if (!els.fixedActivityList) return;
  els.fixedActivityList.innerHTML = '';
  if (!data.fixedActivities.length) {
    els.fixedActivityList.innerHTML = '<li><span><strong>No fixed activities yet</strong><br><small>Add lunch, flag ceremony, flag retreat, or other protected slots.</small></span></li>';
    return;
  }
  [...data.fixedActivities].sort((a,b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }) || String(a.start || '').localeCompare(String(b.start || ''))).forEach(activity => {
    const days = (activity.days || [activity.day]).filter(Boolean);
    const sectionNames = (activity.sectionIds || []).map(id => byName(data.sections, id));
    const sectionPreview = sectionNames.slice(0, 2).join(', ') + (sectionNames.length > 2 ? ` +${sectionNames.length - 2} more` : '');
    const fixedSubject = isFixedSubjectActivity(activity);
    const batchSubject = isBatchSubjectActivity(activity);
    const title = fixedSubject ? (activity.title || byName(data.subjects, activity.subjectId)) : (activity.title || 'Fixed Activity');
    const offerings = batchSubject ? getBatchOfferings(activity) : [];
    const teacherPreview = offerings.length ? offerings.map(offering => `${offering.title} — ${byName(data.teachers, offering.teacherId)}${isDefaultRoom(offering.roomId) ? '' : ` @ ${roomName(offering.roomId)}`}`).slice(0, 3).join('; ') : (activity.teacherIds || [activity.teacherId].filter(Boolean)).map(id => byName(data.teachers, id)).slice(0, 3).join(', ');
    const meta = batchSubject
      ? `${days.join(', ')} · ${timeRange(activity.start, activity.duration)} · ${offerings.length || (activity.teacherIds || []).length} offering(s) · ${sectionPreview || 'No sections'}${teacherPreview ? ` · ${teacherPreview}${offerings.length > 3 ? ` +${offerings.length - 3} more` : ''}` : ''}`
      : fixedSubject
        ? `${days.join(', ')} · ${timeRange(activity.start, activity.duration)} · ${byName(data.teachers, activity.teacherId)} · ${roomName(activity.roomId)} · ${sectionPreview || 'No sections'}`
        : `${days.join(', ')} · ${timeRange(activity.start, activity.duration)} · ${sectionPreview || 'No sections'}`;
    els.fixedActivityList.insertAdjacentHTML('beforeend', `
      <li>
        <span>
          <strong>${escapeHtml(title)}${batchSubject ? ' <span class="fixed-badge">Batch Block</span>' : fixedSubject ? ' <span class="fixed-badge">Fixed Subject</span>' : ''}</strong><br>
          <small>${escapeHtml(meta)}</small>
        </span>
        <span class="item-actions">
          <button type="button" class="secondary compact-btn" data-edit-fixed-activity="${escapeHtml(activity.id)}">Edit</button>
          <button type="button" class="icon-btn compact-btn" data-delete-fixed-activity="${escapeHtml(activity.id)}">Delete</button>
        </span>
      </li>`);
  });
}
function getSelectedFixedDays() { return [...document.querySelectorAll('.fixed-day-checkbox:checked')].map(input => input.value); }
function getSelectedFixedSections() { return [...document.querySelectorAll('.fixed-section-checkbox:checked')].map(input => input.value); }
function setFixedDays(days) { document.querySelectorAll('.fixed-day-checkbox').forEach(input => { input.checked = days.includes(input.value); }); }
function setAllFixedSections(checked) { document.querySelectorAll('.fixed-section-checkbox').forEach(input => { input.checked = checked; }); }
function setFixedPreset(kind) {
  if (!els.fixedTitle || !els.fixedStart || !els.fixedDuration) return;
  if (els.fixedType) els.fixedType.value = 'activity';
  toggleFixedSubjectFields();
  setAllFixedTeachers(false);
  const slot = Number(data.settings.slotDuration || 50);
  if (kind === 'lunch') {
    els.fixedTitle.value = 'Lunch Break';
    els.fixedDuration.value = slot;
    setFixedDays([...DAYS]);
  }
  if (kind === 'swp') {
    els.fixedTitle.value = 'SWP';
    els.fixedDuration.value = 30;
    setFixedDays([...DAYS]);
  }
  if (kind === 'flagCeremony') {
    els.fixedTitle.value = 'Flag Ceremony';
    els.fixedDuration.value = 20;
    els.fixedStart.value = data.settings.dayStart || '07:30';
    setFixedDays(['Monday']);
  }
  if (kind === 'flagRetreat') {
    els.fixedTitle.value = 'Flag Retreat';
    els.fixedDuration.value = 50;
    els.fixedStart.value = '15:00';
    setFixedDays(['Friday']);
  }
}
function toggleFixedSubjectFields() {
  const mode = els.fixedType?.value || 'activity';
  const isSubject = mode === 'subject';
  const isBatch = mode === 'batch';
  if (els.fixedSubjectFields) els.fixedSubjectFields.classList.toggle('hidden', !isSubject);
  if (els.fixedBatchFields) els.fixedBatchFields.classList.toggle('hidden', !isBatch);
  if (els.fixedManualRoomWrap) els.fixedManualRoomWrap.classList.toggle('hidden', !isSubject || els.fixedRoomMode?.value !== 'manual');
  if (isBatch && els.fixedTitle && !els.fixedTitle.value.trim()) els.fixedTitle.value = 'Elective';
  if (isBatch && els.fixedOfferingList && !els.fixedOfferingList.querySelector('.batch-offering-row')) setFixedOfferings([]);
}
function syncFixedSubjectDefaults() {
  if (els.fixedType?.value !== 'subject') return;
  const subject = data.subjects.find(item => item.id === els.fixedSubject?.value);
  if (subject) {
    if (els.fixedTitle && !els.fixedTitle.value.trim()) els.fixedTitle.value = subject.name;
    if (els.fixedDuration) els.fixedDuration.value = subject.duration || data.settings.slotDuration || 50;
  }
}

function selectMatchingFixedSections() {
  const query = String(els.fixedSectionFilter?.value || '').trim().toLowerCase();
  if (!query) return showAlert('Type a grade level or keyword first, for example Grade 7.', 'warning');
  let count = 0;
  document.querySelectorAll('.fixed-section-checkbox').forEach(input => {
    const section = data.sections.find(item => item.id === input.value);
    const match = section?.name?.toLowerCase().includes(query);
    input.checked = Boolean(match);
    if (match) count++;
  });
  showAlert(`${count} section(s) selected for the fixed activity.`);
}
function addFixedActivity() {
  if (!data.sections.length) return showAlert('Add sections before creating lunch breaks, fixed activities, or fixed subjects.', 'warning');
  const editingId = editState.fixedActivities;
  const mode = els.fixedType?.value || 'activity';
  const fixedSubject = mode === 'subject';
  const batchSubject = mode === 'batch';
  const subjectId = fixedSubject ? els.fixedSubject?.value : null;
  const teacherId = fixedSubject ? els.fixedTeacher?.value : null;
  const offerings = batchSubject ? getFixedOfferingsFromForm().filter(offering => offering.teacherId || offering.title || !isDefaultRoom(offering.roomId)) : [];
  const teacherIds = batchSubject ? offerings.map(offering => offering.teacherId).filter(Boolean) : [];
  const roomMode = fixedSubject ? (els.fixedRoomMode?.value || 'default') : 'default';
  const roomId = fixedSubject && roomMode === 'manual' ? els.fixedManualRoom?.value : DEFAULT_ROOM_ID;
  const subjectTitle = fixedSubject ? byName(data.subjects, subjectId) : '';
  const title = String(els.fixedTitle?.value || subjectTitle || (batchSubject ? 'Elective' : '')).trim();
  const start = els.fixedStart?.value;
  const duration = Number(els.fixedDuration?.value || data.settings.slotDuration || 50);
  const days = getSelectedFixedDays();
  const sectionIds = getSelectedFixedSections();
  if (!title) return showAlert('Enter a display name, such as Lunch Break, Elective, Research, or Drone Technology.', 'warning');
  if (fixedSubject && !subjectId) return showAlert('Choose the fixed subject.', 'warning');
  if (fixedSubject && !teacherId) return showAlert('Choose the teacher for this fixed subject.', 'warning');
  if (fixedSubject && roomMode === 'manual' && !roomId) return showAlert('Choose the assigned room/lab for this fixed subject.', 'warning');
  if (batchSubject && !offerings.length) return showAlert('Add at least one specific offering for this batch-wide block.', 'warning');
  if (batchSubject && offerings.some(offering => !offering.teacherId)) return showAlert('Choose a teacher for every elective/research offering.', 'warning');
  if (batchSubject && offerings.some(offering => !offering.title.trim())) return showAlert('Enter a specific title for every elective/research offering.', 'warning');
  if (batchSubject && offerings.some(offering => offering.roomMode === 'manual' && !offering.roomId)) return showAlert('Choose the assigned room/lab for every offering set to Manual room/lab.', 'warning');
  if (batchSubject && new Set(teacherIds).size !== teacherIds.length) return showAlert('Each elective/research offering must have a different teacher. Duplicate teacher assignments in the same fixed block are not allowed.', 'warning');
  if (!days.length) return showAlert('Choose at least one day for the fixed slot.', 'warning');
  if (!sectionIds.length) return showAlert('Choose at least one section for the fixed slot.', 'warning');
  if (!start) return showAlert('Enter the exact start time for the fixed slot.', 'warning');
  if (toMinutes(start) + duration > toMinutes(data.settings.dayEnd)) return showAlert('This fixed slot goes beyond the school day end time.', 'error');
  const activity = {
    id: editingId || createId('fixed'),
    title,
    start,
    duration,
    days,
    sectionIds,
    protected: true,
    category: batchSubject ? 'batchSubject' : (fixedSubject ? 'fixedSubject' : 'fixed'),
    subjectId,
    teacherId,
    teacherIds,
    offerings: batchSubject ? offerings.map((offering, index) => ({ ...offering, id: offering.id || createId('offering') || `offering_${index}` })) : [],
    roomMode,
    roomId
  };
  const candidates = expandFixedActivities({ fixedActivities: [activity] });
  const existing = [
    ...expandFixedActivities({ fixedActivities: data.fixedActivities.filter(item => item.id !== editingId) }),
    ...data.schedules
  ];
  const checkedCandidates = [];
  for (const candidate of candidates) {
    const conflicts = getConflictsInList(candidate, [...existing, ...checkedCandidates]);
    if (conflicts.length) return showAlert(`Cannot ${editingId ? 'update' : 'add'} ${title}. ${conflicts[0]}`, 'error');
    checkedCandidates.push(candidate);
  }
  if (editingId) {
    const index = data.fixedActivities.findIndex(item => item.id === editingId);
    if (index < 0) return showAlert('The fixed activity you are editing could not be found.', 'error');
    data.fixedActivities[index] = activity;
  } else {
    data.fixedActivities.push(activity);
  }
  if (title.toLowerCase().includes('flag ceremony') && days.includes('Monday')) {
    data.settings = normalizeSettings(data.settings);
    data.settings.dayStarts.Monday = getEndTime(start, duration);
  }
  saveData();
  renderAll();
  resetFixedActivityFormMode();
  showAlert(`${title} ${editingId ? 'updated' : 'added as a protected fixed block'}.`);
}
function deleteFixedActivity(id) {
  data.fixedActivities = data.fixedActivities.filter(activity => activity.id !== id);
  saveData(); renderAll(); showAlert('Fixed activity deleted.');
}
function renderScheduleTable() {
  const sectionFilter = els.filterSection.value || 'all';
  const dayFilter = els.filterDay.value || 'all';
  const includeFixed = Boolean(els.showFixedSchedules?.checked);
  const schedules = [...getDisplayScheduleItems()]
    .filter(item => includeFixed || isClassLikeSchedule(item))
    .filter(item => !isBatchSubjectSchedule(item) || item.sectionId)
    .filter(item => sectionFilter === 'all' || item.sectionId === sectionFilter)
    .filter(item => dayFilter === 'all' || item.day === dayFilter)
    .sort((a,b) => byName(data.sections,a.sectionId).localeCompare(byName(data.sections,b.sectionId)) || DAYS.indexOf(a.day)-DAYS.indexOf(b.day) || toMinutes(a.start)-toMinutes(b.start) || (isFixedSchedule(a) ? -1 : 1));
  els.scheduleTable.innerHTML = '';
  if (!schedules.length) { els.scheduleTable.appendChild($('emptyRowTemplate').content.cloneNode(true)); return; }
  schedules.forEach(item => {
    const fixed = isFixedSchedule(item);
    const fixedSubject = isFixedTeachingSchedule(item);
    const sectionName = byName(data.sections, item.sectionId);
    const subjectName = fixedSubject ? getFixedDisplayTitle(item) : fixed ? item.title || 'Fixed Activity' : byName(data.subjects, item.subjectId);
    const displayTeacherName = fixedSubject && item.teacherId ? teacherName(item.teacherId) : fixedSubject ? 'Batch Block' : fixed ? 'Fixed Activity' : teacherName(item.teacherId);
    const displayRoom = roomName(item.roomId);
    const roomView = fixed && !fixedSubject
      ? '<small class="muted-note">Protected slot</small>'
      : isDefaultRoom(item.roomId) ? '<small class="muted-note">No special room assigned</small>' : `<button type="button" class="text-link small-link" data-open-weekly-kind="room" data-open-weekly-id="${escapeHtml(item.roomId)}">View ${escapeHtml(displayRoom)} schedule</button>`;
    const roomCell = fixed
      ? `<span class="fixed-badge">${fixedSubject ? 'Assigned' : 'Protected'}</span><span class="print-only">${escapeHtml(displayRoom)}</span><span class="no-print">${roomView}</span>`
      : `<div class="stacked-cell no-print"><select class="room-update" data-room-update="${escapeHtml(item.id)}">${roomUpdateOptions(item.roomId)}</select>${roomView}</div><span class="print-only">${escapeHtml(displayRoom)}</span>`;
    const actions = fixed
      ? `<span class="fixed-badge">${isBatchSubjectSchedule(item) ? 'Batch Block' : fixedSubject ? 'Fixed Subject' : 'Fixed'}</span>`
      : `<div class="row-actions"><button type="button" class="secondary" data-edit-schedule="${escapeHtml(item.id)}">Edit</button><button type="button" class="secondary" data-duplicate="${escapeHtml(item.id)}">Duplicate</button><button type="button" class="icon-btn" data-delete-schedule="${escapeHtml(item.id)}">Delete</button></div>`;
    const teacherCell = fixedSubject && item.teacherId
      ? `<button type="button" class="text-link no-print" data-open-weekly-kind="teacher" data-open-weekly-id="${escapeHtml(item.teacherId)}">${escapeHtml(displayTeacherName)}</button><span class="print-only">${escapeHtml(displayTeacherName)}</span>`
      : fixedSubject
        ? `<span class="muted-note">${escapeHtml(displayTeacherName)}</span>`
        : fixed
          ? '<span class="muted-note">Fixed Activity</span>'
          : item.teacherId
            ? `<button type="button" class="text-link no-print" data-open-weekly-kind="teacher" data-open-weekly-id="${escapeHtml(item.teacherId)}">${escapeHtml(displayTeacherName)}</button><span class="print-only">${escapeHtml(displayTeacherName)}</span>`
            : `<span class="muted-note">${escapeHtml(displayTeacherName)}</span>`;
    els.scheduleTable.insertAdjacentHTML('beforeend', `
      <tr class="${fixed ? 'fixed-row' : ''}">
        <td>${item.sectionId ? `<button type="button" class="text-link no-print" data-open-weekly-kind="section" data-open-weekly-id="${escapeHtml(item.sectionId)}">${escapeHtml(sectionName)}</button><strong class="print-only">${escapeHtml(sectionName)}</strong>` : '<span class="muted-note">Batch-wide</span>'}</td>
        <td>${escapeHtml(item.day)}</td>
        <td>${escapeHtml(timeRange(item.start, item.duration))}</td>
        <td>${fixed ? `<span class="fixed-badge">${isBatchSubjectSchedule(item) ? 'Batch Block' : fixedSubject ? 'Fixed Subject' : 'Fixed'}</span> ` : ''}${escapeHtml(subjectName)}</td>
        <td>${teacherCell}</td>
        <td>${roomCell}</td>
        <td class="no-print">${actions}</td>
      </tr>`);
  });
}
function renderAll() { renderSettings(); renderSelects(); renderTimeOptions(); renderLists(); renderScheduleFilters(); renderScheduleTable(); renderDashboardStats(); renderControlCounts(); }

function getConflictsInList(newSchedule, schedules, ignoreId = null) {
  const conflicts = [];
  const dayWindowConflict = getDayWindowConflict(newSchedule);
  if (dayWindowConflict) conflicts.push(dayWindowConflict);
  const teacherStartConflict = getTeacherStartConflict(newSchedule);
  if (teacherStartConflict) conflicts.push(teacherStartConflict);
  const teacherLunchConflict = getTeacherLunchConflict(newSchedule, schedules, ignoreId);
  if (teacherLunchConflict) conflicts.push(teacherLunchConflict);
  const newIsClassLike = isClassLikeSchedule(newSchedule);
  schedules.forEach(existing => {
    if (existing.id === ignoreId || existing.day !== newSchedule.day) return;
    if (newSchedule.fixedActivityId && existing.fixedActivityId && newSchedule.fixedActivityId === existing.fixedActivityId) {
      if (isFixedSubjectSchedule(newSchedule) && isFixedSubjectSchedule(existing)) return;
      if (isBatchSubjectSchedule(newSchedule) && isBatchSubjectSchedule(existing) && (newSchedule.category === 'batchSubjectSection' || existing.category === 'batchSubjectSection')) return;
    }
    if (!overlaps(newSchedule.start, newSchedule.duration, existing.start, existing.duration)) return;
    const existingIsClassLike = isClassLikeSchedule(existing);
    if (existing.sectionId && newSchedule.sectionId && existing.sectionId === newSchedule.sectionId) {
      conflicts.push(`Section conflict with ${conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    }
    if (newIsClassLike && existingIsClassLike && existing.teacherId && existing.teacherId === newSchedule.teacherId) {
      conflicts.push(`Teacher conflict with ${existing.sectionId ? byName(data.sections, existing.sectionId) : conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    }
    if (newIsClassLike && existingIsClassLike && !isDefaultRoom(newSchedule.roomId) && !isDefaultRoom(existing.roomId) && existing.roomId === newSchedule.roomId) {
      conflicts.push(`Room conflict with ${existing.sectionId ? byName(data.sections, existing.sectionId) : conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    }
  });
  return conflicts;
}
function getConflicts(newSchedule, ignoreId = null) { return getConflictsInList(newSchedule, getDisplayScheduleItems(), ignoreId); }
function roomHasConflictInList(roomId, day, start, duration, schedules, ignoreId = null) {
  if (isDefaultRoom(roomId)) return false;
  return schedules.some(existing => existing.id !== ignoreId && isClassLikeSchedule(existing) && !isDefaultRoom(existing.roomId) && existing.roomId === roomId && existing.day === day && overlaps(start, duration, existing.start, existing.duration));
}
function roomHasConflict(roomId, day, start, duration, ignoreId = null) { return roomHasConflictInList(roomId, day, start, duration, data.schedules, ignoreId); }
function findAutoRoomInList(sectionId, day, start, duration, schedules) {
  const section = data.sections.find(item => item.id === sectionId);
  const sectionSize = Number(section?.size || 0);
  const sorted = [...data.rooms].sort((a,b) => Number(a.capacity || 9999) - Number(b.capacity || 9999));
  const capacityMatched = sorted.filter(room => !sectionSize || !room.capacity || Number(room.capacity) >= sectionSize);
  return (capacityMatched.length ? capacityMatched : sorted).find(room => !roomHasConflictInList(room.id, day, start, duration, schedules));
}
function findAutoRoom(sectionId, day, start, duration) { return findAutoRoomInList(sectionId, day, start, duration, data.schedules); }
function getRoomIdForMode(mode, manualRoomId, sectionId, day, start, duration, schedules = data.schedules) {
  if (mode === 'default') return DEFAULT_ROOM_ID;
  if (mode === 'manual') return manualRoomId || null;
  const room = findAutoRoomInList(sectionId, day, start, duration, schedules);
  return room ? room.id : null;
}

function addSimpleItem(collectionName, item) {
  if (data[collectionName].some(existing => existing.name.toLowerCase() === item.name.toLowerCase())) return showAlert(`${item.name} already exists.`, 'warning');
  data[collectionName].push(item); saveData(); renderAll(); showAlert(`${item.name} added.`);
}
function deleteItem(collectionName, id) {
  const usedInSchedules = data.schedules.some(schedule => [schedule.sectionId, schedule.subjectId, schedule.teacherId].includes(id) || (!isDefaultRoom(schedule.roomId) && schedule.roomId === id));
  const usedInLoads = data.teachingLoads.some(load => [load.sectionId, load.subjectId, load.teacherId].includes(id) || (!isDefaultRoom(load.roomId) && load.roomId === id));
  const usedInFixed = data.fixedActivities.some(activity => (Array.isArray(activity.sectionIds) && activity.sectionIds.includes(id)) || [activity.subjectId, activity.teacherId, activity.roomId].includes(id) || (activity.teacherIds || []).includes(id) || (activity.offerings || []).some(offering => [offering.teacherId, offering.roomId].includes(id)));
  if (usedInSchedules || usedInLoads || usedInFixed) return showAlert('Cannot delete this item because it is used in a schedule, teaching load, or fixed activity. Delete those entries first.', 'error');
  data[collectionName] = data[collectionName].filter(item => item.id !== id); saveData(); renderAll(); showAlert('Item deleted.');
}
function getWeeklyEntity(kind, id) {
  const configs = { section: { collection: data.sections, missingMessage: 'Section not found.' }, teacher: { collection: data.teachers, missingMessage: 'Teacher not found.' }, room: { collection: data.rooms, missingMessage: 'Room not found.' } };
  const config = configs[kind]; if (!config || isDefaultRoom(id)) return null;
  return { config, entity: config.collection.find(item => item.id === id || item.name === id) };
}
function openWeeklyView(kind, id) {
  data = loadData(); const lookup = getWeeklyEntity(kind, id);
  if (!lookup || !lookup.entity) return showAlert(lookup?.config?.missingMessage || 'Record not found. It may have been deleted.', 'error');
  saveData(); const weeklyUrl = new URL('weekly.html', window.location.href); weeklyUrl.searchParams.set('kind', kind); weeklyUrl.searchParams.set('id', id);
  const win = window.open('', '_blank');
  if (!win) return showAlert('The weekly schedule tab was blocked by the browser. Please allow pop-ups for this file, then click the name again.', 'warning');
  win.name = `OFFLINE_SCHEDULER_WEEKLY::${JSON.stringify({ kind, id, data })}`; win.location.href = weeklyUrl.href;
}

function openWeeklyBrowser(collectionName) {
  data = loadData();
  const browserConfig = {
    sections: { collection: data.sections, kind: 'section', empty: 'Add at least one section first.' },
    teachers: { collection: data.teachers, kind: 'teacher', empty: 'Add at least one teacher first.' }
  }[collectionName];
  if (!browserConfig || !browserConfig.collection.length) return showAlert(browserConfig?.empty || 'No records available for this browser.', 'warning');
  const first = sortByName(browserConfig.collection)[0];
  saveData();
  const weeklyUrl = new URL('weekly.html', window.location.href);
  weeklyUrl.searchParams.set('browse', collectionName);
  weeklyUrl.searchParams.set('kind', browserConfig.kind);
  weeklyUrl.searchParams.set('id', first.id);
  const win = window.open('', '_blank');
  if (!win) return showAlert('The schedule browser tab was blocked by the browser. Please allow pop-ups for this file, then try again.', 'warning');
  win.name = `OFFLINE_SCHEDULER_WEEKLY::${JSON.stringify({ browse: collectionName, kind: browserConfig.kind, id: first.id, data })}`;
  win.location.href = weeklyUrl.href;
}

function spreadsheetXmlEscape(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
function getSpecialOpeningSlotForExport(day, source = data) {
  const settings = normalizeSettings(source.settings || defaultData.settings);
  const schoolStart = settings.dayStart || defaultData.settings.dayStart;
  const teachingStart = getDayTeachingStart(day, source);
  if (day === 'Monday' && toMinutes(teachingStart) > toMinutes(schoolStart)) {
    return { start: schoolStart, duration: toMinutes(teachingStart) - toMinutes(schoolStart) };
  }
  return null;
}
function getSectionSchedulesForExport(sectionId) {
  return getDisplayScheduleItems()
    .filter(item => item.sectionId === sectionId)
    .sort((a,b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || toMinutes(a.start) - toMinutes(b.start) || (isFixedSchedule(a) ? -1 : 1));
}
function getStartsForExportDay(day, schedules) {
  const sectionId = schedules.find(item => item.sectionId)?.sectionId || '';
  const starts = new Set(generateSlots(day, { sectionId }));
  const opening = getSpecialOpeningSlotForExport(day);
  if (opening) {
    starts.add(opening.start);
    starts.add(getEndTime(opening.start, opening.duration));
  }
  schedules.filter(item => item.day === day).forEach(item => {
    starts.add(item.start);
    if (item.duration) starts.add(getEndTime(item.start, item.duration));
  });
  return Array.from(starts).filter(start => toMinutes(start) < toMinutes(getDayEnd(day))).sort((a,b) => toMinutes(a)-toMinutes(b));
}
function getExportStartRows(schedules) {
  const monday = getStartsForExportDay('Monday', schedules);
  const weekdays = new Set();
  DAYS.filter(day => day !== 'Monday').forEach(day => getStartsForExportDay(day, schedules).forEach(start => weekdays.add(start)));
  const weekdayRows = Array.from(weekdays).sort((a,b) => toMinutes(a)-toMinutes(b));
  return { monday, weekdays: weekdayRows, maxRows: Math.max(monday.length, weekdayRows.length) };
}
function getBestExportDuration(day, start, schedules) {
  const matches = schedules.filter(item => item.day === day && item.start === start);
  const fixed = matches.find(isFixedSchedule);
  const first = fixed || matches[0];
  if (first?.duration) return Number(first.duration);
  const opening = getSpecialOpeningSlotForExport(day);
  if (opening && opening.start === start) return opening.duration;
  return Number(data.settings?.slotDuration || 50);
}
function getExportCellText(day, start, schedules) {
  if (!start) return '';
  const exact = schedules.filter(item => item.day === day && item.start === start);
  const primary = exact.find(isFixedSchedule) || exact[0];
  if (primary) return getExportItemText(primary, 'section');
  return '';
}
function getExportIntervalDuration(day, starts, index) {
  const start = starts[index];
  const next = starts[index + 1];
  if (start && next && toMinutes(next) > toMinutes(start)) return toMinutes(next) - toMinutes(start);
  return getBestExportDuration(day, start, getDisplayScheduleItems());
}
function getExportTeacherLine(teacherId) {
  return isNoTeacherId(teacherId) ? '' : teacherName(teacherId);
}
function joinExportLines(lines) {
  return lines.filter(line => String(line || '').trim()).join('\n');
}
function getExportItemText(item, mode = 'section') {
  if (!item) return '';
  const room = byName(data.rooms, item.roomId);
  const roomLine = isDefaultRoom(item.roomId) ? '' : room;
  const itemTime = timeRange(item.start, item.duration);
  if (isFixedSchedule(item) && !isFixedTeachingSchedule(item)) return joinExportLines([item.title || 'Fixed Activity', itemTime]);
  const subjectTitle = isFixedTeachingSchedule(item) ? getFixedDisplayTitle(item) : byName(data.subjects, item.subjectId);
  if (mode === 'teacher') {
    if (isBatchSubjectSchedule(item)) return joinExportLines([getFixedDisplayTitle(item), getExportTeacherLine(item.teacherId), itemTime, roomLine]);
    return joinExportLines([subjectTitle, byName(data.sections, item.sectionId), itemTime, roomLine]);
  }
  if (isBatchSubjectSchedule(item)) return joinExportLines([getFixedDisplayTitle(item), getExportTeacherLine(item.teacherId), itemTime, roomLine]);
  return joinExportLines([subjectTitle, getExportTeacherLine(item.teacherId), itemTime, roomLine]);
}
const EXPORT_COLOR_PALETTE = ['D9EAF7', 'E2F0D9', 'FFF2CC', 'FCE4D6', 'E4DFEC', 'DDEBF7', 'F8CBAD', 'EADCF8', 'D9EAD3', 'F4CCCC', 'D0E0E3', 'FFF0F5', 'EAF2F8', 'F9E79F', 'D5F5E3', 'FADBD8'];
function getExportColorKey(item) {
  if (!item) return '';
  if (!isFixedSchedule(item) && item.subjectId) return `subject:${item.subjectId}`;
  if (isFixedSubjectSchedule(item) && item.subjectId) return `subject:${item.subjectId}`;
  if (isBatchSubjectSchedule(item)) return `batch:${item.displayTitle || item.title || 'Elective'}`;
  if (isNonTeachingFixedSchedule(item)) return `fixed:${String(item.title || 'Fixed Activity').toLowerCase()}`;
  return item.subjectId ? `subject:${item.subjectId}` : `item:${item.title || item.id}`;
}
function createSpreadsheetModel(sheetTitle = 'Weekly Schedules') {
  return { rows: [], styles: {}, merges: [], colors: new Map(), rowHeights: {}, sheetTitle };
}
function spreadsheetCellKey(rowIndex, colIndex) { return `${rowIndex}:${colIndex}`; }
function setSpreadsheetStyle(model, rowIndex, colIndex, styleIndex) { model.styles[spreadsheetCellKey(rowIndex, colIndex)] = styleIndex; }
function setSpreadsheetRowHeight(model, rowIndex, height) { if (height) model.rowHeights[rowIndex] = height; }
function addSpreadsheetRow(model, values, styleIndex = null, rowHeight = null) {
  const rowIndex = model.rows.length;
  model.rows.push(values);
  if (styleIndex !== null) values.forEach((_, colIndex) => setSpreadsheetStyle(model, rowIndex, colIndex, styleIndex));
  if (rowHeight) setSpreadsheetRowHeight(model, rowIndex, rowHeight);
  return rowIndex;
}
function getExportStyleForItem(model, item) {
  const key = getExportColorKey(item);
  if (!key) return 0;
  if (!model.colors.has(key)) model.colors.set(key, model.colors.size);
  return 3 + model.colors.get(key);
}
function getExportColors(model) {
  if (!model?.colors) return [];
  return [...model.colors.entries()].sort((a, b) => a[1] - b[1]).map((_, index) => EXPORT_COLOR_PALETTE[index % EXPORT_COLOR_PALETTE.length]);
}
const EXPORT_TIMELINE_INCREMENT_MINUTES = 10;
const EXPORT_TIMELINE_ROW_HEIGHT = 10;
function floorToExportIncrement(minutes) {
  return Math.floor(minutes / EXPORT_TIMELINE_INCREMENT_MINUTES) * EXPORT_TIMELINE_INCREMENT_MINUTES;
}
function ceilToExportIncrement(minutes) {
  return Math.ceil(minutes / EXPORT_TIMELINE_INCREMENT_MINUTES) * EXPORT_TIMELINE_INCREMENT_MINUTES;
}
function getExportTimelineStarts(schedules = []) {
  const startCandidates = DAYS.map(day => toMinutes(getDayTeachingStart(day))).concat(
    schedules.map(item => toMinutes(item.start)).filter(Number.isFinite)
  );
  const endCandidates = DAYS.map(day => toMinutes(getDayEnd(day))).concat(
    schedules.map(item => toMinutes(item.start) + Number(item.duration || 0)).filter(Number.isFinite)
  );
  const minStart = floorToExportIncrement(Math.min(...startCandidates.filter(Number.isFinite)));
  const maxEnd = ceilToExportIncrement(Math.max(...endCandidates.filter(Number.isFinite)));
  const starts = [];
  for (let minute = minStart; minute < maxEnd; minute += EXPORT_TIMELINE_INCREMENT_MINUTES) starts.push(fromMinutes(minute));
  return starts;
}
function findExportEndIndex(starts, endMinute) {
  const index = starts.findIndex(start => toMinutes(start) >= endMinute);
  return index >= 0 ? index : starts.length;
}
function addExportTimeColumn(model, starts, baseRowIndex) {
  const endMinutes = starts.length ? toMinutes(starts[starts.length - 1]) + EXPORT_TIMELINE_INCREMENT_MINUTES : 0;
  let index = 0;
  while (index < starts.length) {
    const startMinute = toMinutes(starts[index]);
    const nextBoundary = startMinute % 60 === 0 ? startMinute + 60 : Math.min(Math.ceil(startMinute / 60) * 60, endMinutes);
    const endIndex = Math.max(index + 1, findExportEndIndex(starts, nextBoundary));
    const rowIndex = baseRowIndex + index;
    model.rows[rowIndex][0] = formatTime(starts[index]);
    setSpreadsheetStyle(model, rowIndex, 0, 1);
    for (let r = rowIndex; r < baseRowIndex + endIndex; r += 1) setSpreadsheetStyle(model, r, 0, 1);
    if (endIndex - index > 1) model.merges.push(`A${rowIndex + 1}:A${baseRowIndex + endIndex}`);
    index = endIndex;
  }
}
function placeExportEvents(model, schedules, timelineStarts, baseRowIndex, mode = 'section') {
  const colByDay = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
  DAYS.forEach(day => {
    const dayItems = schedules.filter(item => item.day === day).sort((a,b) => toMinutes(a.start) - toMinutes(b.start) || (isFixedSchedule(a) ? -1 : 1));
    dayItems.forEach(item => {
      const startIndex = timelineStarts.findIndex(start => start === item.start);
      if (startIndex < 0) return;
      const rowIndex = baseRowIndex + startIndex;
      const colIndex = colByDay[day];
      const endMinute = toMinutes(item.start) + Number(item.duration || 0);
      const endIndex = findExportEndIndex(timelineStarts, endMinute);
      const rowSpan = Math.max(1, endIndex - startIndex);
      model.rows[rowIndex][colIndex] = getExportItemText(item, mode);
      const styleIndex = getExportStyleForItem(model, item);
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) setSpreadsheetStyle(model, r, colIndex, styleIndex);
      if (rowSpan > 1) {
        const cellColumn = columnName(colIndex + 1);
        model.merges.push(`${cellColumn}${rowIndex + 1}:${cellColumn}${rowIndex + rowSpan}`);
      }
    });
  });
}
function getTeacherSchedulesForExport(teacherId) {
  return getDisplayScheduleItems()
    .filter(item => item.teacherId === teacherId)
    .sort((a,b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || toMinutes(a.start) - toMinutes(b.start) || (isFixedSchedule(a) ? -1 : 1));
}
function buildWeeklySpreadsheetModel(entities, getSchedules, mode, title) {
  const model = createSpreadsheetModel(title);
  addSpreadsheetRow(model, [title], 2, 22);
  model.merges.push(`A1:F1`);
  addSpreadsheetRow(model, [`Generated: ${new Date().toLocaleString()}`], 0, 18);
  model.merges.push(`A2:F2`);
  addSpreadsheetRow(model, []);
  sortByName(entities).forEach(entity => {
    const schedules = getSchedules(entity.id);
    const titleRow = addSpreadsheetRow(model, [entity.name, '', '', '', '', ''], 2, 22);
    model.merges.push(`A${titleRow + 1}:F${titleRow + 1}`);
    addSpreadsheetRow(model, ['Time','Monday','Tuesday','Wednesday','Thursday','Friday'], 1, 20);
    const timelineStarts = getExportTimelineStarts(schedules);
    const baseRowIndex = model.rows.length;
    timelineStarts.forEach(() => {
      const rowIndex = addSpreadsheetRow(model, ['', '', '', '', '', ''], null, EXPORT_TIMELINE_ROW_HEIGHT);
      for (let c = 0; c < 6; c += 1) setSpreadsheetStyle(model, rowIndex, c, 0);
    });
    addExportTimeColumn(model, timelineStarts, baseRowIndex);
    placeExportEvents(model, schedules, timelineStarts, baseRowIndex, mode);
    addSpreadsheetRow(model, []);
  });
  return model;
}
function buildSectionSpreadsheetRows() {
  return buildWeeklySpreadsheetModel(data.sections, getSectionSchedulesForExport, 'section', 'All Section Weekly Schedules');
}
function buildTeacherSpreadsheetRows() {
  return buildWeeklySpreadsheetModel(data.teachers, getTeacherSchedulesForExport, 'teacher', 'All Teacher Weekly Schedules');
}
function columnName(index) {
  let name = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}
function buildWorksheetXml(input) {
  const model = Array.isArray(input) ? { rows: input, styles: {}, merges: [], colors: new Map(), rowHeights: {} } : input;
  const rows = model.rows || [];
  const skipCells = new Set();
  (model.merges || []).forEach(ref => {
    const match = String(ref).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) return;
    const startCol = columnLettersToNumber(match[1]);
    const startRow = Number(match[2]);
    const endCol = columnLettersToNumber(match[3]);
    const endRow = Number(match[4]);
    for (let r = startRow; r <= endRow; r += 1) {
      for (let c = startCol; c <= endCol; c += 1) {
        if (r === startRow && c === startCol) continue;
        skipCells.add(`${r - 1}:${c - 1}`);
      }
    }
  });
  const rowXml = rows.map((row, rIndex) => {
    const cells = (row || []).map((value, cIndex) => {
      if (skipCells.has(`${rIndex}:${cIndex}`)) return '';
      const ref = `${columnName(cIndex + 1)}${rIndex + 1}`;
      const explicitStyle = model.styles?.[spreadsheetCellKey(rIndex, cIndex)];
      const fallbackStyle = rIndex === 0 || (row.length === 1 && value) || row.includes('Time') ? 1 : 0;
      const styleIndex = explicitStyle ?? fallbackStyle;
      const style = styleIndex ? ` s="${styleIndex}"` : '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${spreadsheetXmlEscape(value)}</t></is></c>`;
    }).join('');
    const explicitHeight = model.rowHeights?.[rIndex];
    const autoHeight = (row || []).some(value => String(value || '').includes('\n')) ? 48 : null;
    const heightValue = explicitHeight || autoHeight;
    const height = heightValue ? ` ht="${heightValue}" customHeight="1"` : '';
    return `<row r="${rIndex + 1}"${height}>${cells}</row>`;
  }).join('');
  const mergeXml = (model.merges || []).length ? `<mergeCells count="${model.merges.length}">${model.merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="6" width="32" customWidth="1"/></cols>
  <sheetData>${rowXml}</sheetData>
  ${mergeXml}
</worksheet>`;
}
function columnLettersToNumber(letters) {
  return String(letters || '').split('').reduce((sum, char) => sum * 26 + (char.charCodeAt(0) - 64), 0);
}
function buildStylesXml(colors = []) {
  const fills = colors.map(color => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('');
  const colorXfs = colors.map((_, index) => `<xf numFmtId="0" fontId="0" fillId="${index + 2}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="${2 + colors.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills}</fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFD9E2EF"/></left><right style="thin"><color rgb="FFD9E2EF"/></right><top style="thin"><color rgb="FFD9E2EF"/></top><bottom style="thin"><color rgb="FFD9E2EF"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${3 + colors.length}">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf>
    ${colorXfs}
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function writeUInt32LE(arr, offset, value) { arr[offset] = value & 255; arr[offset+1] = (value >>> 8) & 255; arr[offset+2] = (value >>> 16) & 255; arr[offset+3] = (value >>> 24) & 255; }
function writeUInt16LE(arr, offset, value) { arr[offset] = value & 255; arr[offset+1] = (value >>> 8) & 255; }
function concatUint8(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => { out.set(chunk, offset); offset += chunk.length; });
  return out;
}
function createZip(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  files.forEach(file => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.length);
    writeUInt32LE(local, 0, 0x04034b50); writeUInt16LE(local, 4, 20); writeUInt16LE(local, 6, 0); writeUInt16LE(local, 8, 0);
    writeUInt16LE(local, 10, dosTime); writeUInt16LE(local, 12, dosDate); writeUInt32LE(local, 14, crc);
    writeUInt32LE(local, 18, dataBytes.length); writeUInt32LE(local, 22, dataBytes.length); writeUInt16LE(local, 26, nameBytes.length); writeUInt16LE(local, 28, 0);
    local.set(nameBytes, 30);
    localChunks.push(local, dataBytes);
    const central = new Uint8Array(46 + nameBytes.length);
    writeUInt32LE(central, 0, 0x02014b50); writeUInt16LE(central, 4, 20); writeUInt16LE(central, 6, 20); writeUInt16LE(central, 8, 0); writeUInt16LE(central, 10, 0);
    writeUInt16LE(central, 12, dosTime); writeUInt16LE(central, 14, dosDate); writeUInt32LE(central, 16, crc);
    writeUInt32LE(central, 20, dataBytes.length); writeUInt32LE(central, 24, dataBytes.length); writeUInt16LE(central, 28, nameBytes.length);
    writeUInt16LE(central, 30, 0); writeUInt16LE(central, 32, 0); writeUInt16LE(central, 34, 0); writeUInt16LE(central, 36, 0); writeUInt32LE(central, 38, 0); writeUInt32LE(central, 42, offset);
    central.set(nameBytes, 46);
    centralChunks.push(central);
    offset += local.length + dataBytes.length;
  });
  const centralDir = concatUint8(centralChunks);
  const eocd = new Uint8Array(22);
  writeUInt32LE(eocd, 0, 0x06054b50); writeUInt16LE(eocd, 4, 0); writeUInt16LE(eocd, 6, 0); writeUInt16LE(eocd, 8, files.length); writeUInt16LE(eocd, 10, files.length);
  writeUInt32LE(eocd, 12, centralDir.length); writeUInt32LE(eocd, 16, offset); writeUInt16LE(eocd, 20, 0);
  return concatUint8([...localChunks, centralDir, eocd]);
}
function createXlsxBlob(input) {
  const model = Array.isArray(input) ? { rows: input, styles: {}, merges: [], colors: new Map(), rowHeights: {}, sheetTitle: 'Weekly Schedules' } : input;
  const colors = getExportColors(model);
  const sheetName = spreadsheetXmlEscape(model.sheetTitle || 'Weekly Schedules').slice(0, 31);
  const files = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', content: buildStylesXml(colors) },
    { name: 'xl/worksheets/sheet1.xml', content: buildWorksheetXml(model) }
  ];
  return new Blob([createZip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}
function exportWeeklySpreadsheet() {
  if (!data.sections.length) return showAlert('Add sections first before exporting weekly schedules.', 'warning');
  const model = buildSectionSpreadsheetRows();
  const date = new Date().toISOString().slice(0,10);
  downloadBlob(createXlsxBlob(model), `all-section-weekly-schedules-${date}.xlsx`);
  showAlert('Weekly section spreadsheet exported with merged double/triple-period cells and subject colors.');
}
function exportTeacherSpreadsheet() {
  if (!data.teachers.length) return showAlert('Add teachers first before exporting teacher weekly schedules.', 'warning');
  const model = buildTeacherSpreadsheetRows();
  const date = new Date().toISOString().slice(0,10);
  downloadBlob(createXlsxBlob(model), `all-teacher-weekly-schedules-${date}.xlsx`);
  showAlert('Weekly teacher spreadsheet exported.');
}
window.exportTeacherSpreadsheet = exportTeacherSpreadsheet;


function normalizeCsvLookup(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function findByNameInsensitive(list, name) {
  const key = normalizeCsvLookup(name);
  return (list || []).find(item => normalizeCsvLookup(item.name) === key) || null;
}
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(value => String(value).trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(value => String(value).trim() !== '')) rows.push(row);
  return rows;
}
function normalizeCsvHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function getCsvValue(rowObject, candidates) {
  for (const candidate of candidates) {
    const key = normalizeCsvHeader(candidate);
    if (Object.prototype.hasOwnProperty.call(rowObject, key)) return rowObject[key];
  }
  return '';
}
function splitCsvSections(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  let parts = raw.split(/[;|\n]+/).map(item => item.trim()).filter(Boolean);
  if (parts.length <= 1 && raw.includes(',')) parts = raw.split(',').map(item => item.trim()).filter(Boolean);
  return [...new Set(parts)];
}
function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function buildCsv(rows) {
  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}
function downloadTeachingLoadTemplate() {
  const rows = [
    ['teacher', 'subject', 'sections', 'meetings', 'duration', 'roomMode', 'room', 'teacherStart'],
    ['Santos', 'English 1', 'Grade 7 - Diamond; Grade 7 - Jade; Grade 7 - Ruby; Grade 7 - Sapphire', '4', '50', 'default', '', '07:30'],
    ['Reyes', 'Computer Science', 'Grade 7 - Diamond; Grade 7 - Jade', '2', '100', 'manual', 'ICT Laboratory', '08:00'],
    ['Cruz', 'Science', 'Grade 8 - Pearl', '3', '50', 'auto', '', '07:30'],
    ['NT', 'SWP', 'Grade 7 - Diamond; Grade 7 - Jade; Grade 7 - Ruby; Grade 7 - Sapphire', '5', '30', 'default', '', '']
  ];
  downloadBlob(new Blob(['\uFEFF' + buildCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'teaching-load-template.csv');
}
function parseRoomModeValue(modeValue, roomName) {
  const mode = normalizeCsvLookup(modeValue).replace(/\s+/g, '');
  const room = String(roomName || '').trim();
  if (['auto', 'autolab', 'autoroom', 'autolaborroom', 'labauto'].includes(mode)) return 'auto';
  if (['manual', 'manualroom', 'manuallab', 'lab', 'room'].includes(mode)) return 'manual';
  if (['default', 'defaultclassroom', 'classroom', 'none', 'no'].includes(mode)) return 'default';
  if (room && normalizeCsvLookup(room) !== normalizeCsvLookup(DEFAULT_ROOM_NAME)) return 'manual';
  return 'default';
}
function resolveCsvNamedItem(collectionName, name, options = {}) {
  const list = data[collectionName] || [];
  const label = options.label || collectionName;
  const cleanName = String(name || '').trim();
  if (!cleanName) return { error: `Missing ${label}.` };
  const existing = findByNameInsensitive(list, cleanName);
  if (existing) return { item: existing, created: false };
  if (!options.createMissing) return { error: `${label} not found: ${cleanName}` };
  const item = { id: createId(options.prefix || label), name: cleanName };
  if (collectionName === 'teachers') item.startTime = options.startTime || data.settings.dayStart || defaultData.settings.dayStart;
  if (collectionName === 'subjects') item.duration = Number(options.duration || 50);
  if (collectionName === 'sections') item.size = 0;
  if (collectionName === 'rooms') item.capacity = 0;
  data[collectionName].push(item);
  return { item, created: true };
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read CSV file.'));
    reader.readAsText(file);
  });
}
async function importTeachingLoadsFromCsv() {
  const file = els.loadCsvFile?.files?.[0];
  if (!file) return showAlert('Choose a CSV file to import.', 'warning');
  let rows;
  try {
    rows = parseCsvText(await readFileAsText(file));
  } catch (error) {
    return showAlert(`Could not read the CSV file. ${error.message || ''}`, 'error');
  }
  if (!rows.length || rows.length < 2) return showAlert('CSV file is empty. Use the template format and try again.', 'warning');
  const headers = rows[0].map(normalizeCsvHeader);
  const records = rows.slice(1).map(row => headers.reduce((object, key, index) => ({ ...object, [key]: row[index] || '' }), {}));
  const createMissing = Boolean(els.loadCsvCreateMissing?.checked);
  const errors = [];
  const created = { teachers: 0, subjects: 0, sections: 0, rooms: 0 };
  let added = 0, updated = 0, skipped = 0;

  records.forEach((record, index) => {
    const rowNo = index + 2;
    const teacherName = getCsvValue(record, ['teacher', 'teacherName']);
    const subjectName = getCsvValue(record, ['subject', 'subjectName']);
    const sectionNames = splitCsvSections(getCsvValue(record, ['sections', 'section', 'sectionNames', 'sectionName']));
    const meetings = Number(getCsvValue(record, ['meetings', 'meetingsPerWeek', 'meetingsWeek', 'perWeek']) || 1);
    const duration = Number(getCsvValue(record, ['duration', 'durationMinutes', 'minutes']) || 50);
    const roomName = getCsvValue(record, ['room', 'roomName', 'manualRoom', 'lab', 'laboratory']);
    const roomMode = parseRoomModeValue(getCsvValue(record, ['roomMode', 'roomAssignment', 'roomType']), roomName);
    const teacherStart = getCsvValue(record, ['teacherStart', 'teacherStartTime', 'officialStart', 'officialStartTime']) || data.settings.dayStart || defaultData.settings.dayStart;

    if (!teacherName && !subjectName && !sectionNames.length) { skipped++; return; }
    if (!Number.isFinite(meetings) || meetings < 1) { errors.push(`Row ${rowNo}: meetings must be at least 1.`); return; }
    if (!Number.isFinite(duration) || duration < 10) { errors.push(`Row ${rowNo}: duration must be at least 10 minutes.`); return; }
    if (!sectionNames.length) { errors.push(`Row ${rowNo}: add at least one section.`); return; }

    const noTeacherLoad = isNoTeacherCsvValue(teacherName);
    const teacherResult = noTeacherLoad
      ? { item: { id: '' }, created: false }
      : resolveCsvNamedItem('teachers', teacherName, { label: 'teacher', prefix: 'teacher', createMissing, startTime: teacherStart });
    if (teacherResult.error) { errors.push(`Row ${rowNo}: ${teacherResult.error} Use NT for independent activities with no assigned teacher.`); return; }
    if (teacherResult.created) created.teachers++;

    const subjectResult = resolveCsvNamedItem('subjects', subjectName, { label: 'subject', prefix: 'subject', createMissing, duration });
    if (subjectResult.error) { errors.push(`Row ${rowNo}: ${subjectResult.error}`); return; }
    if (subjectResult.created) created.subjects++;

    let roomId = DEFAULT_ROOM_ID;
    if (roomMode === 'manual') {
      const roomResult = resolveCsvNamedItem('rooms', roomName, { label: 'room', prefix: 'room', createMissing });
      if (roomResult.error) { errors.push(`Row ${rowNo}: ${roomResult.error}`); return; }
      if (roomResult.created) created.rooms++;
      roomId = roomResult.item.id;
    }

    sectionNames.forEach(sectionName => {
      const sectionResult = resolveCsvNamedItem('sections', sectionName, { label: 'section', prefix: 'section', createMissing });
      if (sectionResult.error) { errors.push(`Row ${rowNo}: ${sectionResult.error}`); return; }
      if (sectionResult.created) created.sections++;
      const patch = {
        sectionId: sectionResult.item.id,
        subjectId: subjectResult.item.id,
        teacherId: teacherResult.item.id,
        meetings,
        duration,
        roomMode,
        roomId: roomMode === 'manual' ? roomId : DEFAULT_ROOM_ID
      };
      const existingIndex = data.teachingLoads.findIndex(load =>
        load.sectionId === patch.sectionId && load.subjectId === patch.subjectId && load.teacherId === patch.teacherId
      );
      if (existingIndex >= 0) {
        data.teachingLoads[existingIndex] = { ...data.teachingLoads[existingIndex], ...patch };
        updated++;
      } else {
        data.teachingLoads.push({ id: createId('load'), ...patch });
        added++;
      }
    });
  });

  if (!added && !updated && errors.length) {
    return showAlert(`No teaching loads were imported.\n\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n…and ${errors.length - 10} more issue(s).` : ''}`, 'error');
  }
  saveData();
  renderAll();
  if (els.loadCsvFile) els.loadCsvFile.value = '';
  const creationSummary = Object.entries(created).filter(([, count]) => count).map(([key, count]) => `${count} ${key}`);
  const issueSummary = errors.length ? `\n\nIssues found:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n…and ${errors.length - 8} more issue(s).` : ''}` : '';
  showAlert(`CSV import finished: ${added} added, ${updated} updated, ${skipped} skipped.${creationSummary.length ? ` Created: ${creationSummary.join(', ')}.` : ''}${issueSummary}`, errors.length ? 'warning' : 'success');
}

function validateCoreDataForScheduling() {
  if (!data.sections.length || !data.subjects.length) {
    showAlert('Add at least one section and subject first.', 'warning');
    return false;
  }
  return true;
}
function addTeachingLoad() {
  if (!validateCoreDataForScheduling()) return;
  const editingId = editState.teachingLoads;
  const roomMode = els.loadRoomMode.value || 'default';
  const duration = Number(els.loadDuration.value || 50);
  const meetings = Number(els.loadMeetings.value || 1);
  const teacherValue = els.loadTeacher.value;
  const teacherId = teacherSelectValueToId(teacherValue);
  const subjectId = els.loadSubject.value;
  const sectionIds = getSelectedLoadSections();
  if (!teacherValue) return showAlert('Choose a teacher first, or choose No Teacher (NT) for independent student activities like SWP.', 'warning');
  if (!subjectId) return showAlert('Choose a subject.', 'warning');
  if (!sectionIds.length) return showAlert('Select at least one section for this teaching load.', 'warning');
  if (roomMode !== 'default' && !data.rooms.length) return showAlert('Add at least one laboratory/special room before assigning lab rooms.', 'warning');
  const roomId = roomMode === 'manual' ? els.loadManualRoom.value : DEFAULT_ROOM_ID;
  if (roomMode === 'manual' && !roomId) return showAlert('Choose a manual lab/room for this teaching load.', 'warning');

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const createdLoads = [];

  sectionIds.forEach((sectionId, index) => {
    const targetId = editingId && index === 0 ? editingId : null;
    const load = { id: targetId || createId('load'), sectionId, subjectId, teacherId, meetings, duration, roomMode, roomId };
    const duplicate = data.teachingLoads.some(existing => existing.id !== targetId && existing.sectionId === load.sectionId && existing.subjectId === load.subjectId && existing.teacherId === load.teacherId && existing.roomMode === load.roomMode && existing.roomId === load.roomId);
    if (duplicate) { skipped++; return; }
    if (targetId) {
      const existingIndex = data.teachingLoads.findIndex(item => item.id === targetId);
      if (existingIndex >= 0) {
        data.teachingLoads[existingIndex] = load;
        updated++;
      } else {
        data.teachingLoads.push(load);
        added++;
      }
    } else {
      createdLoads.push(load);
      added++;
    }
  });

  if (createdLoads.length) data.teachingLoads.push(...createdLoads);
  if (!added && !updated) return showAlert('No teaching load was added. Similar load(s) may already exist.', 'warning');
  saveData();
  renderAll();
  resetTeachingLoadFormMode();
  const summary = [`${added} added`, `${updated} updated`];
  if (skipped) summary.push(`${skipped} skipped as duplicate`);
  showAlert(`Teaching load batch saved: ${summary.join(', ')}.`);
}
function deleteTeachingLoad(id) {
  data.teachingLoads = data.teachingLoads.filter(load => load.id !== id);
  saveData(); renderAll(); showAlert('Teaching load deleted.');
}
function resetAllTeachingLoads() {
  const loadCount = data.teachingLoads.length;
  if (!loadCount) return showAlert('There are no teaching loads to delete.', 'warning');
  const waitlistCount = (data.scheduleWaitlist || []).length;
  openConfirmModal({
    title: 'Delete All Teaching Loads?',
    message: `This will delete ${loadCount} teaching load${loadCount === 1 ? '' : 's'}${waitlistCount ? ` and clear ${waitlistCount} waitlisted item${waitlistCount === 1 ? '' : 's'}` : ''}. Sections, subjects, teachers, rooms, fixed activities, and existing weekly schedules will be preserved. Use Master Reset Weekly Schedule separately if you also want to clear generated schedules.`,
    confirmLabel: 'Delete All Loads',
    onConfirm: () => {
      data.teachingLoads = [];
      data.scheduleWaitlist = [];
      resetTeachingLoadFormMode();
      saveData();
      renderAll();
      showAlert('All teaching loads were deleted. You can now import a fresh CSV file.');
    }
  });
}

function loadFromWaitlistItem(waitlistItem) {
  if (!waitlistItem) return null;
  const sourceLoad = data.teachingLoads.find(load => load.id === waitlistItem.loadId);
  return {
    ...(sourceLoad || {}),
    id: waitlistItem.loadId || sourceLoad?.id || `waitlist_${waitlistItem.id}`,
    sectionId: waitlistItem.sectionId || sourceLoad?.sectionId,
    subjectId: waitlistItem.subjectId || sourceLoad?.subjectId,
    teacherId: waitlistItem.teacherId || sourceLoad?.teacherId,
    duration: Number(waitlistItem.duration || sourceLoad?.duration || data.settings.slotDuration || 50),
    roomMode: waitlistItem.roomMode || sourceLoad?.roomMode || 'default',
    roomId: waitlistItem.roomId || sourceLoad?.roomId || DEFAULT_ROOM_ID,
    meetingIndex: Number(waitlistItem.meetingIndex || 0)
  };
}
function createWaitlistItem(load, meetingIndex, reason = 'No available conflict-free slot was found.') {
  return {
    id: createId('wait'),
    loadId: load.id,
    sectionId: load.sectionId,
    subjectId: load.subjectId,
    teacherId: load.teacherId,
    meetingIndex: Number(meetingIndex || load.meetingIndex || 0),
    duration: Number(load.duration || data.settings.slotDuration || 50),
    roomMode: load.roomMode || 'default',
    roomId: load.roomId || DEFAULT_ROOM_ID,
    reason,
    createdAt: new Date().toISOString()
  };
}
function waitlistLabel(item) {
  return `${byName(data.sections, item.sectionId)} · ${byName(data.subjects, item.subjectId)} · ${teacherName(item.teacherId)}`;
}
function renderWaitlistList() {
  if (!els.waitlistList) return;
  const items = [...(data.scheduleWaitlist || [])].sort((a,b) => teacherName(a.teacherId).localeCompare(teacherName(b.teacherId)) || byName(data.sections,a.sectionId).localeCompare(byName(data.sections,b.sectionId)) || byName(data.subjects,a.subjectId).localeCompare(byName(data.subjects,b.subjectId)) || Number(a.meetingIndex || 0) - Number(b.meetingIndex || 0));
  if (!items.length) {
    els.waitlistList.innerHTML = '<li><div><strong>No unplaced classes.</strong><br><small>Auto-generation will place unresolved classes here instead of discarding the whole generated schedule.</small></div></li>';
    return;
  }
  els.waitlistList.innerHTML = items.map(item => `
    <li class="waitlist-item">
      <div>
        <strong>${escapeHtml(waitlistLabel(item))}</strong><br>
        <small>${escapeHtml(item.duration || 50)} mins · Meeting ${Number(item.meetingIndex || 0) + 1} · ${escapeHtml(loadRoomLabel(item))}</small><br>
        <small class="muted-note">${escapeHtml(item.reason || 'No available conflict-free slot was found.')}</small>
      </div>
      <span class="item-actions">
        <button type="button" class="secondary compact-btn" data-waitlist-load="${escapeHtml(item.id)}">Load to Form</button>
        <button type="button" class="secondary compact-btn" data-waitlist-place="${escapeHtml(item.id)}">Try Auto-Place</button>
        <button type="button" class="icon-btn compact-btn" data-waitlist-remove="${escapeHtml(item.id)}">Remove</button>
      </span>
    </li>`).join('');
}
function removeWaitlistItem(id, options = {}) {
  data.scheduleWaitlist = (data.scheduleWaitlist || []).filter(item => item.id !== id);
  if (pendingWaitlistId === id) pendingWaitlistId = null;
  if (!options.skipSave) saveData();
  renderAll();
  if (!options.silent) showAlert('Waitlist item removed.');
}
function clearWaitlist() {
  if (!(data.scheduleWaitlist || []).length) return showAlert('The waitlist is already empty.', 'warning');
  openConfirmModal({
    title: 'Clear Waitlist?',
    message: 'This will remove all unplaced classes from the waitlist. Existing weekly schedules and teaching loads will not be changed.',
    confirmLabel: 'Clear Waitlist',
    onConfirm: () => {
      data.scheduleWaitlist = [];
      pendingWaitlistId = null;
      saveData(); renderAll(); showAlert('Waitlist cleared.');
    }
  });
}
function loadWaitlistToForm(id) {
  const item = (data.scheduleWaitlist || []).find(wait => wait.id === id);
  if (!item) return showAlert('Waitlist item not found.', 'error');
  pendingWaitlistId = id;
  resetScheduleFormMode({ reset: false });
  els.scheduleSection.value = item.sectionId || '';
  els.scheduleSubject.value = item.subjectId || '';
  els.scheduleTeacher.value = teacherIdToSelectValue(item.teacherId);
  els.scheduleDay.value = 'Monday';
  renderTimeOptions();
  els.scheduleDuration.value = item.duration || 50;
  els.roomMode.value = item.roomMode || 'default';
  els.manualRoomWrap.classList.toggle('hidden', els.roomMode.value !== 'manual');
  if (els.roomMode.value === 'manual') els.manualRoom.value = item.roomId || '';
  closeControlModal();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showAlert('Unplaced class loaded. Choose a valid day/time, then click Add. It will be removed from the waitlist after saving.');
}
function placeWaitlistItem(id, options = {}) {
  const item = (data.scheduleWaitlist || []).find(wait => wait.id === id);
  if (!item) return { placed: false, reason: 'Waitlist item not found.' };
  const load = loadFromWaitlistItem(item);
  const working = [...expandFixedActivities(data), ...data.schedules.map(schedule => ({ ...schedule }))];
  const scheduled = findSlotForLoad(load, working, Number(item.meetingIndex || 0), { seed: Number(data.generatorRun || 0) + 1, reshuffle: true });
  if (!scheduled) {
    if (!options.silent) showAlert('Still no available slot for this waitlisted class.', 'warning');
    return { placed: false, reason: 'Still no available conflict-free slot.' };
  }
  data.schedules.push(scheduled);
  data.scheduleWaitlist = (data.scheduleWaitlist || []).filter(wait => wait.id !== id);
  saveData(); renderAll();
  if (!options.silent) showAlert(`Waitlisted class placed at ${scheduled.day}, ${timeRange(scheduled.start, scheduled.duration)}.`);
  return { placed: true, schedule: scheduled };
}
function tryPlaceAllWaitlisted() {
  const items = [...(data.scheduleWaitlist || [])];
  if (!items.length) return showAlert('The waitlist is empty.', 'warning');
  let placed = 0;
  items.forEach(item => {
    const result = placeWaitlistItem(item.id, { silent: true });
    if (result.placed) placed++;
  });
  saveData(); renderAll();
  showAlert(`${placed} waitlisted class${placed === 1 ? '' : 'es'} placed. ${(data.scheduleWaitlist || []).length} remain in the queue.`, placed ? 'success' : 'warning');
}
function autoSortNoise(seed, key, scale = 1) {
  if (!seed) return 0;
  const text = `${seed}:${key}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * scale;
}

function getDayScore(day, schedules, load) {
  const classItems = getClassItemsOnly(schedules);
  const sectionCount = classItems.filter(item => item.day === day && item.sectionId === load.sectionId).length;
  const totalCount = classItems.filter(item => item.day === day).length;
  if (!load.teacherId) return sectionCount * 10 + totalCount * 0.75;
  const teacherDayCount = getTeacherDayCount(schedules, load.teacherId, day);
  const teacherDayMinutes = getTeacherDayMinutes(schedules, load.teacherId, day);
  const teacherTotalMinutes = getTeacherTotalLoadMinutes(load.teacherId);
  const teacherTotalMeetings = getTeacherTotalLoadMeetings(load.teacherId);
  const targetDailyMinutes = Math.max(Number(load.duration || 50), Math.ceil((teacherTotalMinutes || Number(load.duration || 50)) / DAYS.length));
  const projectedMinutes = teacherDayMinutes + Number(load.duration || 50);
  const overTargetPenalty = Math.max(0, projectedMinutes - targetDailyMinutes) * 1.2;
  const activeDays = getTeacherActiveDayCount(schedules, load.teacherId);
  const minimumSpreadDays = Math.min(DAYS.length, Math.max(1, teacherTotalMeetings));
  const newDaySpreadBonus = teacherDayMinutes === 0 ? -35 : 0;
  const stillNeedsSpreadBonus = teacherDayMinutes === 0 && activeDays < minimumSpreadDays ? -45 : 0;
  const teacherConcentrationPenalty = teacherDayCount * 55 + teacherDayMinutes * 0.55 + overTargetPenalty;
  return sectionCount * 10 + teacherConcentrationPenalty + totalCount * 0.75 + newDaySpreadBonus + stillNeedsSpreadBonus;
}
function findSlotForLoad(load, schedules, meetingIndex, options = {}) {
  const teacherStart = load.teacherId ? toMinutes(getTeacherStartTime(load.teacherId)) : 0;
  const seed = Number(options.seed || 0);
  const sortedDays = [...DAYS].sort((a,b) => {
    const scoreA = getDayScore(a, schedules, load) + autoSortNoise(seed, `${load.id}:${load.sectionId}:${load.subjectId}:${meetingIndex}:${a}`, options.reshuffle ? 18 : 3);
    const scoreB = getDayScore(b, schedules, load) + autoSortNoise(seed, `${load.id}:${load.sectionId}:${load.subjectId}:${meetingIndex}:${b}`, options.reshuffle ? 18 : 3);
    return scoreA - scoreB || ((DAYS.indexOf(a) + meetingIndex) % DAYS.length) - ((DAYS.indexOf(b) + meetingIndex) % DAYS.length);
  });
  for (const avoidSameSubjectDay of [true, false]) {
    for (const day of sortedDays) {
      if (avoidSameSubjectDay && schedules.some(item => item.day === day && item.sectionId === load.sectionId && item.subjectId === load.subjectId)) continue;
      const daySlots = generateSlots(day, { sectionId: load.sectionId });
      const dayEnd = toMinutes(getDayEnd(day));
      const sortedSlots = [...daySlots].sort((a,b) => {
        const sectionA = schedules.filter(item => item.day === day && item.sectionId === load.sectionId && toMinutes(item.start) < toMinutes(a)).length;
        const sectionB = schedules.filter(item => item.day === day && item.sectionId === load.sectionId && toMinutes(item.start) < toMinutes(b)).length;
        const base = sectionA - sectionB || toMinutes(a) - toMinutes(b);
        if (!options.reshuffle) return base;
        return base + autoSortNoise(seed, `${load.id}:${day}:${a}:${meetingIndex}`, 12) - autoSortNoise(seed, `${load.id}:${day}:${b}:${meetingIndex}`, 12);
      });
      for (const start of sortedSlots) {
        if (toMinutes(start) < teacherStart) continue;
        if (toMinutes(start) + Number(load.duration || 50) > dayEnd) continue;
        let roomId = DEFAULT_ROOM_ID;
        if (load.roomMode === 'manual') roomId = load.roomId;
        if (load.roomMode === 'auto') {
          const room = findAutoRoomInList(load.sectionId, day, start, load.duration, schedules);
          if (!room) continue;
          roomId = room.id;
        }
        const candidate = { id: createId('sched'), sectionId: load.sectionId, subjectId: load.subjectId, teacherId: load.teacherId, day, start, duration: Number(load.duration || 50), roomId, roomMode: load.roomMode || 'default', sourceLoadId: load.id };
        if (!getConflictsInList(candidate, schedules).length) return candidate;
      }
    }
  }
  return null;
}
function buildExpandedTeachingLoadMeetings() {
  const expanded = [];
  data.teachingLoads.forEach(load => {
    for (let i = 0; i < Number(load.meetings || 1); i++) expanded.push({ ...load, meetingIndex: i });
  });
  return expanded;
}
function getLoadGenerationPriority(load) {
  const roomPriority = mode => mode === 'manual' ? 0 : mode === 'auto' ? 1 : 2;
  const hasTeacher = Boolean(load.teacherId);
  return (
    (hasTeacher ? getTeacherTotalLoadMinutes(load.teacherId) * -1 : 0) +
    (hasTeacher ? toMinutes(getTeacherStartTime(load.teacherId)) * 0.08 : 120) +
    roomPriority(load.roomMode) * 250 +
    Number(load.duration || 50) * -2 +
    Number(load.meetings || 1) * -40
  );
}
function sortExpandedLoadsForGeneration(expanded, options = {}) {
  const seed = Number(options.seed || 0);
  const randomized = options.reshuffle || options.randomize;
  const sorted = [...expanded].sort((a,b) => {
    const priorityA = getLoadGenerationPriority(a);
    const priorityB = getLoadGenerationPriority(b);
    if (!randomized) return priorityA - priorityB || String(a.id).localeCompare(String(b.id)) || Number(a.meetingIndex || 0) - Number(b.meetingIndex || 0);
    const priorityWeight = Number(options.priorityWeight ?? 0.18);
    const jitterA = autoSortNoise(seed, `${a.id}:${a.sectionId}:${a.subjectId}:${a.teacherId}:${a.meetingIndex}:load`, 1000);
    const jitterB = autoSortNoise(seed, `${b.id}:${b.sectionId}:${b.subjectId}:${b.teacherId}:${b.meetingIndex}:load`, 1000);
    return (priorityA * priorityWeight + jitterA) - (priorityB * priorityWeight + jitterB);
  });
  if (randomized && sorted.length > 1) {
    const offset = Math.floor(autoSortNoise(seed, 'start-offset', sorted.length)) % sorted.length;
    return [...sorted.slice(offset), ...sorted.slice(0, offset)];
  }
  return sorted;
}
function validateAutoGenerationInputs() {
  if (!validateCoreDataForScheduling()) return false;
  if (!data.teachingLoads.length) { showAlert('Add teaching loads first. The generator needs section, subject, teacher, meetings/week, duration, and room assignment rules.', 'warning'); return false; }
  const invalidLoads = data.teachingLoads.filter(load => !data.sections.some(s => s.id === load.sectionId) || !data.subjects.some(s => s.id === load.subjectId) || (load.teacherId && !data.teachers.some(t => t.id === load.teacherId)) || (load.roomMode === 'manual' && !data.rooms.some(r => r.id === load.roomId)));
  if (invalidLoads.length) { showAlert('Some teaching loads reference deleted sections, subjects, teachers, or rooms. Please delete and recreate those loads.', 'error'); return false; }
  if (data.teachingLoads.some(load => load.roomMode === 'auto' && !data.rooms.length)) { showAlert('At least one teaching load requires auto lab/room assignment, but no laboratory/special rooms have been added.', 'warning'); return false; }
  return true;
}
function runAutoGeneration(options = {}) {
  if (!validateAutoGenerationInputs()) return null;
  const replace = options.replace ?? (els.replaceExistingSchedule?.checked !== false);
  const fixedBase = expandFixedActivities(data);
  const working = replace ? [...fixedBase] : [...fixedBase, ...data.schedules.map(item => ({ ...item }))];
  const sortedLoads = sortExpandedLoadsForGeneration(buildExpandedTeachingLoadMeetings(), options);
  const failures = [];
  for (const load of sortedLoads) {
    const scheduled = findSlotForLoad(load, working, load.meetingIndex, options);
    if (!scheduled) {
      failures.push(createWaitlistItem(load, load.meetingIndex, 'Auto-generation could not find a conflict-free slot.'));
      continue;
    }
    working.push(scheduled);
  }
  const generatedSchedules = working.filter(item => !isFixedSchedule(item));
  return { generatedSchedules, fixedCount: fixedBase.length, failures };
}
function commitAutoGeneration(result, options = {}) {
  data.schedules = result.generatedSchedules;
  data.scheduleWaitlist = result.failures || [];
  data.generatorRun = Number(data.generatorRun || 0) + 1;
  saveData(); renderAll();
  if (result.failures.length) {
    const preview = result.failures.slice(0, 8).map(waitlistLabel).join('\n');
    const extra = result.failures.length > 8 ? `\n...and ${result.failures.length - 8} more.` : '';
    showAlert(`Auto-generation completed with a waitlist. ${result.generatedSchedules.length} class entries were saved, but ${result.failures.length} class meeting(s) still need manual placement.\n\nWaitlisted:\n${preview}${extra}\n\nOpen Waitlist / Queue to load them into the manual form or try auto-place again.`, 'warning');
  } else {
    showAlert(`${options.reshuffle ? 'Schedule reshuffled' : 'Weekly schedule generated'} successfully. ${result.generatedSchedules.length} class entries plus ${result.fixedCount} protected fixed block(s) are now in the master schedule.`);
  }
}
function autoGenerateWeek() {
  resetGenerationProgress();
  const result = runAutoGeneration({ seed: Number(data.generatorRun || 0) + 1, reshuffle: false });
  if (!result) return;
  commitAutoGeneration(result);
}
function reshuffleSchedule() {
  resetGenerationProgress();
  if (!data.teachingLoads.length) return showAlert('Add teaching loads first before generating again.', 'warning');
  const seed = Date.now() + Number(data.generatorRun || 0) + 1;
  const result = runAutoGeneration({ seed, reshuffle: true, randomize: true, replace: true, priorityWeight: 0.14 });
  if (!result) return;
  commitAutoGeneration(result, { reshuffle: true });
}
async function tryUntilPerfectSchedule(maxAttempts = 50) {
  if (!validateAutoGenerationInputs()) return;
  let bestResult = null;
  let bestSeed = null;
  setGenerationButtonsDisabled(true);
  setGenerationProgress({ attempt: 0, max: maxAttempts, currentFailures: null, bestFailures: null });
  await sleep(80);

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const seed = Date.now() + Number(data.generatorRun || 0) * 997 + attempt * 7919;
      const result = runAutoGeneration({ seed, reshuffle: true, randomize: true, replace: true, priorityWeight: attempt % 3 === 0 ? 0.08 : attempt % 3 === 1 ? 0.16 : 0.25 });
      if (!result) {
        resetGenerationProgress();
        return;
      }
      if (!bestResult || result.failures.length < bestResult.failures.length || (result.failures.length === bestResult.failures.length && result.generatedSchedules.length > bestResult.generatedSchedules.length)) {
        bestResult = result;
        bestSeed = seed;
      }

      setGenerationProgress({
        attempt,
        max: maxAttempts,
        currentFailures: result.failures.length,
        bestFailures: bestResult ? bestResult.failures.length : null,
        bestPlaced: bestResult ? bestResult.generatedSchedules.length : 0,
        seed
      });
      await sleep(25);

      if (!result.failures.length) {
        commitAutoGeneration(result, { reshuffle: true });
        setGenerationProgress({
          attempt,
          max: maxAttempts,
          currentFailures: 0,
          bestFailures: 0,
          bestPlaced: result.generatedSchedules.length,
          status: 'done',
          seed
        });
        showAlert(`Perfect schedule found after ${attempt} attempt${attempt === 1 ? '' : 's'}. All classes were allocated without conflicts.`);
        return;
      }
    }

    if (!bestResult) return;
    commitAutoGeneration(bestResult, { reshuffle: true });
    setGenerationProgress({
      attempt: maxAttempts,
      max: maxAttempts,
      currentFailures: bestResult.failures.length,
      bestFailures: bestResult.failures.length,
      bestPlaced: bestResult.generatedSchedules.length,
      status: bestResult.failures.length ? 'warning' : 'done',
      seed: bestSeed
    });
    showAlert(`No perfect schedule was found after ${maxAttempts} randomized attempts. The best attempt was saved with ${bestResult.failures.length} unplaced class meeting${bestResult.failures.length === 1 ? '' : 's'} in the waitlist. Try again, adjust loads, extend the school day, or manually place the remaining items.`, bestResult.failures.length ? 'warning' : 'success');
  } finally {
    setGenerationButtonsDisabled(false);
  }
}
function confirmTryUntilPerfectSchedule() {
  openConfirmModal({
    title: 'Try Until Perfect?',
    message: 'The system will run up to 50 randomized auto-generation attempts using different seeds and starting classes. It will save the first perfect schedule it finds. If none is found, it will keep the best attempt and place remaining classes in the waitlist.',
    confirmLabel: 'Start Attempts',
    onConfirm: () => tryUntilPerfectSchedule(50)
  });
}


function masterResetWeeklySchedule() {
  const classCount = data.schedules.filter(item => !isFixedSchedule(item)).length;
  if (!classCount) return showAlert('There are no class schedules to reset.', 'warning');
  openConfirmModal({
    title: 'Reset Weekly Class Schedule?',
    message: `This will delete ${classCount} scheduled class entr${classCount === 1 ? 'y' : 'ies'} from the weekly schedule. Sections, teachers, subjects, rooms, teaching loads, school day settings, lunch breaks, and fixed activities will be preserved.`,
    confirmLabel: 'Reset Weekly Schedule',
    onConfirm: () => {
      data.schedules = [];
      saveData();
      renderAll();
      showAlert('Weekly class schedule reset. Setup data and fixed activities were preserved.');
    }
  });
}

function openControlModal(name) {
  const modal = $(`controlModal-${name}`);
  if (!modal) return showAlert('This control panel is not available.', 'warning');
  document.querySelectorAll('.control-modal').forEach(item => item.classList.add('hidden'));
  modal.classList.remove('hidden');
  document.body.classList.add('control-modal-open');
  const firstField = modal.querySelector('input, select, button:not(.modal-close)');
  setTimeout(() => firstField?.focus(), 0);
}
function closeControlModal() {
  document.querySelectorAll('.control-modal').forEach(item => item.classList.add('hidden'));
  document.body.classList.remove('control-modal-open');
  if (pendingDeferredServerPull || pendingDeferredExternalRefresh) {
    pendingDeferredServerPull = false;
    pendingDeferredExternalRefresh = false;
    if (syncConfig.enabled) setSyncStatus('Auto-sync resumed. Use Pull if you need to load the latest server copy now.', 'good');
  }
}

document.addEventListener('submit', e => {
  if (e.target?.matches?.('form')) e.preventDefault();
}, true);

els.modalOkBtn.addEventListener('click', closeMessageModal);
els.modalCloseBtn.addEventListener('click', closeMessageModal);
els.confirmCancelBtn.addEventListener('click', closeConfirmModal);
els.confirmCloseBtn.addEventListener('click', closeConfirmModal);
els.confirmActionBtn.addEventListener('click', runConfirmAction);
if (els.syncForm) els.syncForm.addEventListener('submit', e => { e.preventDefault(); applySyncSettings(); });
if (els.syncPullBtn) els.syncPullBtn.addEventListener('click', () => pullFromServer({ silent: false }));
if (els.syncPushBtn) els.syncPushBtn.addEventListener('click', () => pushToServer({ force: true, silent: false }));
els.messageModal.addEventListener('click', e => { if (e.target.matches('[data-modal-close]')) closeMessageModal(); });
els.confirmModal.addEventListener('click', e => { if (e.target.matches('[data-confirm-close]')) closeConfirmModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMessageModal(); closeConfirmModal(); closeControlModal(); } });
els.settingsForm.addEventListener('submit', e => {
  e.preventDefault();
  const start = els.dayStart.value, end = els.dayEnd.value, duration = Number(els.slotDuration.value || 50);
  const dayStarts = {
    Monday: els.dayStartMonday?.value || start,
    Tuesday: els.dayStartTuesday?.value || start,
    Wednesday: els.dayStartWednesday?.value || start,
    Thursday: els.dayStartThursday?.value || start,
    Friday: els.dayStartFriday?.value || start
  };
  if (toMinutes(start) >= toMinutes(end)) return showAlert('Day start must be earlier than day end.', 'error');
  for (const [day, dayStart] of Object.entries(dayStarts)) {
    if (toMinutes(dayStart) < toMinutes(start)) return showAlert(`${day} teaching start cannot be earlier than the school day start.`, 'error');
    if (toMinutes(dayStart) >= toMinutes(end)) return showAlert(`${day} teaching start must be earlier than the school day end.`, 'error');
  }
  data.settings = { dayStart: start, dayEnd: end, slotDuration: duration, dayStarts };
  saveData(); renderAll(); showAlert('Time slots updated.');
});
els.sectionForm.addEventListener('submit', e => { e.preventDefault(); const name = $('sectionName').value.trim(); const size = Number($('sectionSize').value || 0); saveSimpleItem('sections', { name, size }); });
els.subjectForm.addEventListener('submit', e => { e.preventDefault(); const name = $('subjectName').value.trim(); const duration = Number($('subjectDuration').value || 50); saveSimpleItem('subjects', { name, duration }); });
els.teacherForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = $('teacherName').value.trim();
  const startTime = els.teacherStartTime?.value || data.settings.dayStart || defaultData.settings.dayStart;
  saveSimpleItem('teachers', { name, startTime });
});
els.roomForm.addEventListener('submit', e => { e.preventDefault(); const name = $('roomName').value.trim(); const capacity = Number($('roomCapacity').value || 0); saveSimpleItem('rooms', { name, capacity }); });
els.teachingLoadForm.addEventListener('submit', e => { e.preventDefault(); addTeachingLoad(); });
if (els.fixedActivityForm) els.fixedActivityForm.addEventListener('submit', e => { e.preventDefault(); addFixedActivity(); });
if (els.fixedLunchPreset) els.fixedLunchPreset.addEventListener('click', () => setFixedPreset('lunch'));
if (els.fixedSwpPreset) els.fixedSwpPreset.addEventListener('click', () => setFixedPreset('swp'));
if (els.fixedFlagCeremonyPreset) els.fixedFlagCeremonyPreset.addEventListener('click', () => setFixedPreset('flagCeremony'));
if (els.fixedFlagRetreatPreset) els.fixedFlagRetreatPreset.addEventListener('click', () => setFixedPreset('flagRetreat'));
if (els.fixedSelectAllSections) els.fixedSelectAllSections.addEventListener('click', () => setAllFixedSections(true));
if (els.fixedClearSections) els.fixedClearSections.addEventListener('click', () => setAllFixedSections(false));
if (els.fixedSelectMatchingSections) els.fixedSelectMatchingSections.addEventListener('click', selectMatchingFixedSections);
if (els.fixedTeacherSelectMatching) els.fixedTeacherSelectMatching.addEventListener('click', selectMatchingFixedTeachers);
if (els.fixedTeacherSelectAll) els.fixedTeacherSelectAll.addEventListener('click', () => setAllFixedTeachers(true));
if (els.fixedTeacherClear) els.fixedTeacherClear.addEventListener('click', () => setAllFixedTeachers(false));
if (els.fixedAddOffering) els.fixedAddOffering.addEventListener('click', () => addFixedOfferingRow({ title: els.fixedTitle?.value || 'Elective', roomMode: 'default' }));
if (els.fixedOfferingList) els.fixedOfferingList.addEventListener('click', e => { if (e.target.closest('.remove-offering-btn')) { e.target.closest('.batch-offering-row')?.remove(); if (!els.fixedOfferingList.querySelector('.batch-offering-row')) setFixedOfferings([]); } });
if (els.fixedOfferingList) els.fixedOfferingList.addEventListener('change', e => { const row = e.target.closest('.batch-offering-row'); if (row && e.target.classList.contains('fixed-offering-room-mode')) toggleOfferingRoom(row); });
if (els.fixedType) els.fixedType.addEventListener('change', toggleFixedSubjectFields);
if (els.fixedSubject) els.fixedSubject.addEventListener('change', syncFixedSubjectDefaults);
if (els.fixedRoomMode) els.fixedRoomMode.addEventListener('change', toggleFixedSubjectFields);
els.scheduleSubject.addEventListener('change', () => { const subject = data.subjects.find(s => s.id === els.scheduleSubject.value); if (subject) els.scheduleDuration.value = subject.duration || 50; });
if (els.scheduleDay) els.scheduleDay.addEventListener('change', renderTimeOptions);
if (els.mondayFlagPatternBtn) els.mondayFlagPatternBtn.addEventListener('click', setMondayFlagPattern);
els.loadSubject.addEventListener('change', () => { const subject = data.subjects.find(s => s.id === els.loadSubject.value); if (subject) els.loadDuration.value = subject.duration || 50; });
if (els.loadSelectAllSections) els.loadSelectAllSections.addEventListener('click', () => setAllLoadSections(true));
if (els.loadClearSections) els.loadClearSections.addEventListener('click', () => setAllLoadSections(false));
if (els.loadSelectMatchingSections) els.loadSelectMatchingSections.addEventListener('click', selectMatchingLoadSections);
if (els.loadCsvTemplateBtn) els.loadCsvTemplateBtn.addEventListener('click', downloadTeachingLoadTemplate);
if (els.loadCsvImportBtn) els.loadCsvImportBtn.addEventListener('click', importTeachingLoadsFromCsv);
els.roomMode.addEventListener('change', () => els.manualRoomWrap.classList.toggle('hidden', els.roomMode.value !== 'manual'));
els.loadRoomMode.addEventListener('change', () => els.loadManualRoomWrap.classList.toggle('hidden', els.loadRoomMode.value !== 'manual'));
els.scheduleForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateCoreDataForScheduling()) return;
  const editingId = editState.schedules;
  const duration = Number(els.scheduleDuration.value || 50);
  const mode = els.roomMode.value || 'default';
  if (mode !== 'default' && !data.rooms.length) return showAlert('Add at least one laboratory/special room before assigning lab rooms.', 'warning');
  const item = buildScheduleFromForm(editingId);
  if (toMinutes(item.start) + duration > toMinutes(getDayEnd(item.day))) return showAlert(`This class goes beyond the ${item.day} school day end time.`, 'error');
  if (mode === 'manual' && !item.roomId) return showAlert('Choose a manual lab/room first.', 'warning');
  if (mode === 'auto' && !item.roomId) return showAlert('No available lab/special room found for this time. Try another time or add more rooms.', 'error');
  const conflicts = getConflicts(item, editingId);
  if (conflicts.length) return showAlert(conflicts[0], 'error');
  if (editingId) {
    const index = data.schedules.findIndex(schedule => schedule.id === editingId);
    if (index < 0) return showAlert('The schedule entry you are editing could not be found.', 'error');
    data.schedules[index] = item;
  } else {
    data.schedules.push(item);
    if (pendingWaitlistId) {
      data.scheduleWaitlist = (data.scheduleWaitlist || []).filter(wait => wait.id !== pendingWaitlistId);
      pendingWaitlistId = null;
    }
  }
  saveData();
  renderAll();
  resetScheduleFormMode({ reset: false });
  showAlert(`Schedule ${editingId ? 'updated' : 'added'}. Room: ${roomName(item.roomId)}.`);
});
els.clearScheduleForm.addEventListener('click', () => resetScheduleFormMode());
els.autoGenerateBtn.addEventListener('click', autoGenerateWeek);
if (els.reshuffleScheduleBtn) els.reshuffleScheduleBtn.addEventListener('click', reshuffleSchedule);
if (els.perfectScheduleBtn) els.perfectScheduleBtn.addEventListener('click', confirmTryUntilPerfectSchedule);
els.masterResetScheduleBtn.addEventListener('click', masterResetWeeklySchedule);
if (els.tryPlaceWaitlistBtn) els.tryPlaceWaitlistBtn.addEventListener('click', tryPlaceAllWaitlisted);
if (els.clearWaitlistBtn) els.clearWaitlistBtn.addEventListener('click', clearWaitlist);
if (els.resetTeachingLoadsBtn) els.resetTeachingLoadsBtn.addEventListener('click', resetAllTeachingLoads);
if ($('sectionCancelEdit')) $('sectionCancelEdit').addEventListener('click', () => resetSimpleFormMode('sections'));
if ($('subjectCancelEdit')) $('subjectCancelEdit').addEventListener('click', () => resetSimpleFormMode('subjects'));
if ($('teacherCancelEdit')) $('teacherCancelEdit').addEventListener('click', () => resetSimpleFormMode('teachers'));
if ($('roomCancelEdit')) $('roomCancelEdit').addEventListener('click', () => resetSimpleFormMode('rooms'));
if ($('loadCancelEdit')) $('loadCancelEdit').addEventListener('click', () => resetTeachingLoadFormMode());
if ($('fixedCancelEdit')) $('fixedCancelEdit').addEventListener('click', () => resetFixedActivityFormMode());
if ($('scheduleCancelEdit')) $('scheduleCancelEdit').addEventListener('click', () => resetScheduleFormMode());
document.body.addEventListener('click', e => {
  const openControl = e.target.closest('[data-control-open]'); if (openControl) return openControlModal(openControl.dataset.controlOpen);
  if (e.target.closest('[data-control-modal-close]')) return closeControlModal();
  const waitLoad = e.target.closest('[data-waitlist-load]'); if (waitLoad) return loadWaitlistToForm(waitLoad.dataset.waitlistLoad);
  const waitPlace = e.target.closest('[data-waitlist-place]'); if (waitPlace) return placeWaitlistItem(waitPlace.dataset.waitlistPlace);
  const waitRemove = e.target.closest('[data-waitlist-remove]'); if (waitRemove) return removeWaitlistItem(waitRemove.dataset.waitlistRemove);
  const edit = e.target.closest('[data-edit]'); if (edit) return setSimpleFormEditMode(edit.dataset.collection, edit.dataset.edit);
  const loadEdit = e.target.closest('[data-edit-load]'); if (loadEdit) return setTeachingLoadEditMode(loadEdit.dataset.editLoad);
  const fixedEdit = e.target.closest('[data-edit-fixed-activity]'); if (fixedEdit) return setFixedActivityEditMode(fixedEdit.dataset.editFixedActivity);
  const scheduleEdit = e.target.closest('[data-edit-schedule]'); if (scheduleEdit) return setScheduleEditMode(scheduleEdit.dataset.editSchedule);
  const del = e.target.closest('[data-delete]'); if (del) return deleteItem(del.dataset.collection, del.dataset.delete);
  const loadDelete = e.target.closest('[data-delete-load]'); if (loadDelete) return deleteTeachingLoad(loadDelete.dataset.deleteLoad);
  const fixedDelete = e.target.closest('[data-delete-fixed-activity]'); if (fixedDelete) return deleteFixedActivity(fixedDelete.dataset.deleteFixedActivity);
  const weekly = e.target.closest('[data-open-weekly-kind][data-open-weekly-id]'); if (weekly) return openWeeklyView(weekly.dataset.openWeeklyKind, weekly.dataset.openWeeklyId);
  const scheduleDelete = e.target.closest('[data-delete-schedule]'); if (scheduleDelete) { data.schedules = data.schedules.filter(item => item.id !== scheduleDelete.dataset.deleteSchedule); saveData(); renderAll(); return showAlert('Schedule entry deleted.'); }
  const duplicate = e.target.closest('[data-duplicate]');
  if (duplicate) {
    const item = data.schedules.find(s => s.id === duplicate.dataset.duplicate); if (!item) return;
    clearEditMode('schedules'); setButtonText('scheduleSubmitBtn', 'Add'); setHidden('scheduleCancelEdit', true);
    els.scheduleSection.value = item.sectionId; els.scheduleSubject.value = item.subjectId; els.scheduleTeacher.value = teacherIdToSelectValue(item.teacherId); els.scheduleDay.value = item.day; els.scheduleStart.value = item.start; els.scheduleDuration.value = item.duration; els.roomMode.value = item.roomMode || (isDefaultRoom(item.roomId) ? 'default' : 'manual'); els.manualRoomWrap.classList.toggle('hidden', els.roomMode.value !== 'manual'); if (els.roomMode.value === 'manual') els.manualRoom.value = item.roomId;
    window.scrollTo({ top: 0, behavior: 'smooth' }); showAlert('Schedule copied to the form. Adjust the time or day, then add it.', 'warning');
  }
});
document.body.addEventListener('change', e => {
  const sel = e.target.closest('[data-room-update]'); if (!sel) return;
  const schedule = data.schedules.find(item => item.id === sel.dataset.roomUpdate); if (!schedule) return;
  const oldRoom = schedule.roomId; const oldMode = schedule.roomMode;
  schedule.roomId = sel.value || DEFAULT_ROOM_ID; schedule.roomMode = isDefaultRoom(schedule.roomId) ? 'default' : 'manual';
  const conflicts = getConflicts(schedule, schedule.id);
  if (conflicts.length) { schedule.roomId = oldRoom; schedule.roomMode = oldMode; sel.value = oldRoom; return showAlert(conflicts[0], 'error'); }
  saveData(); renderScheduleTable(); showAlert(`Room updated to ${roomName(schedule.roomId)}.`);
});
els.filterSection.addEventListener('change', renderScheduleTable); els.filterDay.addEventListener('change', renderScheduleTable); if (els.showFixedSchedules) els.showFixedSchedules.addEventListener('change', renderScheduleTable);
els.exportBtn.addEventListener('click', () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `class-schedule-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
els.importFile.addEventListener('change', e => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = normalizeData(JSON.parse(reader.result)); data = imported; saveData(); renderAll(); showAlert('Backup imported successfully.'); } catch { showAlert('Import failed. Please choose a valid scheduler backup JSON file.', 'error'); } }; reader.readAsText(file); e.target.value = ''; });
els.printBtn.addEventListener('click', () => window.print());
if (els.exportSpreadsheetBtn) els.exportSpreadsheetBtn.addEventListener('click', exportWeeklySpreadsheet);
if (els.exportSpreadsheetSideBtn) els.exportSpreadsheetSideBtn.addEventListener('click', exportWeeklySpreadsheet);
if (els.exportTeacherSpreadsheetSideBtn) els.exportTeacherSpreadsheetSideBtn.addEventListener('click', exportTeacherSpreadsheet);
if (els.browseSectionsBtn) els.browseSectionsBtn.addEventListener('click', () => openWeeklyBrowser('sections'));
if (els.browseTeachersBtn) els.browseTeachersBtn.addEventListener('click', () => openWeeklyBrowser('teachers'));
window.addEventListener('storage', e => {
  if (e.key !== STORAGE_KEY) return;
  if (isUserEditingSchedulerInput()) return noteExternalRefreshDeferred();
  data = loadData();
  renderAll();
});
window.addEventListener('message', e => {
  if (e.data?.type !== 'scheduler-data-updated') return;
  if (isUserEditingSchedulerInput()) return noteExternalRefreshDeferred();
  data = loadData();
  renderAll();
});
function initializeApp() { renderSyncSettings(); renderAll(); if (syncConfig.enabled) { pullFromServer({ silent: true }); startSyncPolling(); } }
initializeApp();
