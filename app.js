const STORAGE_KEY = 'offlineClassScheduler.v1';
const API_CONFIG_KEY = 'offlineClassScheduler.apiConfig.v1';
const API_REVISION_KEY = 'offlineClassScheduler.apiRevision.v1';
const SYNC_POLL_MS = 10000;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_ROOM_ID = '__default_classroom__';
const DEFAULT_ROOM_NAME = 'Default Classroom';

const defaultData = {
  settings: { dayStart: '07:30', dayEnd: '16:30', slotDuration: 50, dayStarts: { Monday: '07:50', Tuesday: '07:30', Wednesday: '07:30', Thursday: '07:30', Friday: '07:30' } },
  sections: [],
  subjects: [],
  teachers: [],
  rooms: [],
  teachingLoads: [],
  fixedActivities: [],
  schedules: []
};

const $ = id => document.getElementById(id);
let data = loadData();
let syncConfig = loadSyncConfig();
let remoteRevision = Number(localStorage.getItem(API_REVISION_KEY) || 0);
let pushTimer = null;
let pollTimer = null;
let pendingConfirmAction = null;
const editState = { sections: null, subjects: null, teachers: null, rooms: null, teachingLoads: null, fixedActivities: null, schedules: null };

const els = {
  alert: $('alert'),
  messageModal: $('messageModal'), modalTitle: $('modalTitle'), modalMessage: $('modalMessage'), modalIcon: $('modalIcon'), modalTypeLabel: $('modalTypeLabel'), modalCloseBtn: $('modalCloseBtn'), modalOkBtn: $('modalOkBtn'),
  confirmModal: $('confirmModal'), confirmTitle: $('confirmTitle'), confirmMessage: $('confirmMessage'), confirmCloseBtn: $('confirmCloseBtn'), confirmCancelBtn: $('confirmCancelBtn'), confirmActionBtn: $('confirmActionBtn'),
  sectionForm: $('sectionForm'), subjectForm: $('subjectForm'), teacherForm: $('teacherForm'), teacherStartTime: $('teacherStartTime'), roomForm: $('roomForm'), settingsForm: $('settingsForm'), scheduleForm: $('scheduleForm'), teachingLoadForm: $('teachingLoadForm'), syncForm: $('syncForm'),
  scheduleSection: $('scheduleSection'), scheduleSubject: $('scheduleSubject'), scheduleTeacher: $('scheduleTeacher'), scheduleDay: $('scheduleDay'), scheduleStart: $('scheduleStart'), scheduleDuration: $('scheduleDuration'), roomMode: $('roomMode'), manualRoomWrap: $('manualRoomWrap'), manualRoom: $('manualRoom'),
  loadSection: $('loadSection'), loadSubject: $('loadSubject'), loadTeacher: $('loadTeacher'), loadMeetings: $('loadMeetings'), loadDuration: $('loadDuration'), loadRoomMode: $('loadRoomMode'), loadManualRoomWrap: $('loadManualRoomWrap'), loadManualRoom: $('loadManualRoom'), teachingLoadList: $('teachingLoadList'), replaceExistingSchedule: $('replaceExistingSchedule'),
  fixedActivityForm: $('fixedActivityForm'), fixedTitle: $('fixedTitle'), fixedStart: $('fixedStart'), fixedDuration: $('fixedDuration'), fixedSectionFilter: $('fixedSectionFilter'), fixedSectionChoices: $('fixedSectionChoices'), fixedActivityList: $('fixedActivityList'), fixedLunchPreset: $('fixedLunchPreset'), fixedFlagCeremonyPreset: $('fixedFlagCeremonyPreset'), fixedFlagRetreatPreset: $('fixedFlagRetreatPreset'), fixedSelectAllSections: $('fixedSelectAllSections'), fixedClearSections: $('fixedClearSections'), fixedSelectMatchingSections: $('fixedSelectMatchingSections'),
  sectionList: $('sectionList'), subjectList: $('subjectList'), teacherList: $('teacherList'), roomList: $('roomList'), scheduleTable: $('scheduleTable'), filterSection: $('filterSection'), filterDay: $('filterDay'), showFixedSchedules: $('showFixedSchedules'),
  dayStart: $('dayStart'), dayEnd: $('dayEnd'), slotDuration: $('slotDuration'), dayStartMonday: $('dayStartMonday'), dayStartTuesday: $('dayStartTuesday'), dayStartWednesday: $('dayStartWednesday'), dayStartThursday: $('dayStartThursday'), dayStartFriday: $('dayStartFriday'), mondayFlagPatternBtn: $('mondayFlagPatternBtn'), importFile: $('importFile'), exportBtn: $('exportBtn'), printBtn: $('printBtn'), exportSpreadsheetBtn: $('exportSpreadsheetBtn'), exportSpreadsheetSideBtn: $('exportSpreadsheetSideBtn'), browseSectionsBtn: $('browseSectionsBtn'), browseTeachersBtn: $('browseTeachersBtn'), clearScheduleForm: $('clearScheduleForm'), autoGenerateBtn: $('autoGenerateBtn'), masterResetScheduleBtn: $('masterResetScheduleBtn'),
  syncEnabled: $('syncEnabled'), apiBaseUrl: $('apiBaseUrl'), syncStatus: $('syncStatus'), syncPullBtn: $('syncPullBtn'), syncPushBtn: $('syncPushBtn'), serverRevision: $('serverRevision'),
  statScheduledClasses: $('statScheduledClasses'), statTeachers: $('statTeachers'), statStudents: $('statStudents'), statSubjects: $('statSubjects'), statRooms: $('statRooms'),
  sectionCount: $('sectionCount'), subjectCount: $('subjectCount'), teacherCount: $('teacherCount'), roomCount: $('roomCount'), fixedCount: $('fixedCount'), loadCount: $('loadCount'),
  sectionButtonCount: $('sectionButtonCount'), subjectButtonCount: $('subjectButtonCount'), teacherButtonCount: $('teacherButtonCount'), roomButtonCount: $('roomButtonCount'), fixedButtonCount: $('fixedButtonCount'), loadButtonCount: $('loadButtonCount'), syncButtonStatus: $('syncButtonStatus')
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
    })) : []
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
function roomName(roomId) { return isDefaultRoom(roomId) ? DEFAULT_ROOM_NAME : byName(data.rooms, roomId); }
function loadRoomLabel(load) {
  if (!load || load.roomMode === 'default' || isDefaultRoom(load.roomId)) return DEFAULT_ROOM_NAME;
  if (load.roomMode === 'auto') return 'Auto Lab/Room';
  return byName(data.rooms, load.roomId);
}

function getTeacherStartTime(teacherId, source = data) {
  const teacher = (source.teachers || []).find(item => item.id === teacherId || item.name === teacherId);
  return teacher?.startTime || teacher?.officialStartTime || source.settings?.dayStart || defaultData.settings.dayStart;
}
function teacherStartLabel(teacher, source = data) {
  return `Starts ${formatTime(teacher?.startTime || teacher?.officialStartTime || source.settings?.dayStart || defaultData.settings.dayStart)}`;
}
function getTeacherStartConflict(schedule, source = data) {
  if (!schedule || isFixedSchedule(schedule) || !schedule.teacherId) return '';
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
function getTeacherLunchConflict(schedule, source = data) {
  if (!schedule || isFixedSchedule(schedule) || !schedule.teacherId) return '';
  const teacher = (source.teachers || []).find(item => item.id === schedule.teacherId || item.name === schedule.teacherId);
  if (!teacher) return '';
  const overlap = getLunchBlocks(source).find(lunch => lunch.day === schedule.day && overlaps(schedule.start, schedule.duration, lunch.start, lunch.duration));
  if (!overlap) return '';
  return `${teacher.name} must keep a lunch break around ${timeRange(overlap.start, overlap.duration)}. Assign this class outside the protected lunch slot.`;
}
function getClassItemsOnly(schedules = []) {
  return schedules.filter(item => !isFixedSchedule(item));
}
function getTeacherTotalLoadMinutes(teacherId, source = data) {
  return (source.teachingLoads || [])
    .filter(load => load.teacherId === teacherId)
    .reduce((sum, load) => sum + Number(load.meetings || 1) * Number(load.duration || source.settings?.slotDuration || 50), 0);
}
function getTeacherTotalLoadMeetings(teacherId, source = data) {
  return (source.teachingLoads || [])
    .filter(load => load.teacherId === teacherId)
    .reduce((sum, load) => sum + Number(load.meetings || 1), 0);
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
  if (!schedule || isFixedSchedule(schedule) || !schedule.day) return '';
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
  setButtonText('loadSubmitBtn', 'Add Load');
  setHidden('loadCancelEdit', true);
}
function setTeachingLoadEditMode(id) {
  const load = data.teachingLoads.find(item => item.id === id);
  if (!load) return showAlert('Teaching load not found.', 'error');
  enterEditMode('teachingLoads', id);
  els.loadSection.value = load.sectionId || '';
  els.loadSubject.value = load.subjectId || '';
  els.loadTeacher.value = load.teacherId || '';
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
  if (els.fixedDuration) els.fixedDuration.value = data.settings.slotDuration || 50;
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
  renderTimeOptions();
  if ([...els.fixedStart.options].some(opt => opt.value === activity.start)) els.fixedStart.value = activity.start;
  els.fixedDuration.value = activity.duration || data.settings.slotDuration || 50;
  setFixedDays((activity.days || [activity.day]).filter(Boolean));
  setAllFixedSections(false);
  document.querySelectorAll('.fixed-section-checkbox').forEach(input => { input.checked = (activity.sectionIds || []).includes(input.value); });
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
  els.scheduleTeacher.value = item.teacherId || '';
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
    teacherId: els.scheduleTeacher.value,
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
function generateSlots(day = null) {
  const slots = [];
  const start = toMinutes(day ? getDayTeachingStart(day) : data.settings.dayStart);
  const end = toMinutes(data.settings.dayEnd);
  const step = Number(data.settings.slotDuration || 50);
  for (let t = start; t < end; t += step) slots.push(fromMinutes(t));
  return slots;
}
function generateAllSlotStarts() {
  const starts = new Set(['07:30', '07:50', '15:00']);
  generateSlots().forEach(slot => starts.add(slot));
  DAYS.forEach(day => generateSlots(day).forEach(slot => starts.add(slot)));
  (data.fixedActivities || []).forEach(activity => { if (activity.start) starts.add(activity.start); });
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
function renderTimeOptions() {
  const selectedDay = els.scheduleDay?.value || DAYS[0];
  const previousScheduleStart = els.scheduleStart?.value;
  const scheduleOptions = generateSlots(selectedDay).map(slot => `<option value="${slot}">${formatTime(slot)}</option>`).join('');
  if (els.scheduleStart) {
    els.scheduleStart.innerHTML = scheduleOptions;
    if ([...els.scheduleStart.options].some(opt => opt.value === previousScheduleStart)) els.scheduleStart.value = previousScheduleStart;
  }
  const previousFixedStart = els.fixedStart?.value;
  const fixedOptions = generateAllSlotStarts().map(slot => `<option value="${slot}">${formatTime(slot)}</option>`).join('');
  if (els.fixedStart) {
    els.fixedStart.innerHTML = fixedOptions;
    if ([...els.fixedStart.options].some(opt => opt.value === previousFixedStart)) els.fixedStart.value = previousFixedStart;
  }
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
  [...data.teachingLoads].sort((a,b) => byName(data.sections, a.sectionId).localeCompare(byName(data.sections, b.sectionId), undefined, { sensitivity: 'base' }) || byName(data.subjects, a.subjectId).localeCompare(byName(data.subjects, b.subjectId), undefined, { sensitivity: 'base' }) || byName(data.teachers, a.teacherId).localeCompare(byName(data.teachers, b.teacherId), undefined, { sensitivity: 'base' })).forEach(load => {
    const section = byName(data.sections, load.sectionId);
    const subject = byName(data.subjects, load.subjectId);
    const teacher = byName(data.teachers, load.teacherId);
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
}

function scheduledClassCount() { return data.schedules.filter(item => !isFixedSchedule(item)).length; }
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
  setText(els.loadCount, pluralize(data.teachingLoads.length, 'teaching load'));
  setText(els.sectionButtonCount, `${pluralize(data.sections.length, 'section')} · ${totalStudentCount()} students`);
  setText(els.subjectButtonCount, pluralize(data.subjects.length, 'subject'));
  setText(els.teacherButtonCount, pluralize(data.teachers.length, 'teacher'));
  setText(els.roomButtonCount, pluralize(data.rooms.length, 'room'));
  setText(els.fixedButtonCount, pluralize(data.fixedActivities.length, 'fixed activity', 'fixed activities'));
  setText(els.loadButtonCount, pluralize(data.teachingLoads.length, 'teaching load'));
  if (els.syncButtonStatus) els.syncButtonStatus.textContent = syncConfig.enabled ? `Server sync · Rev ${remoteRevision || 0}` : 'Local mode';
}

function renderLists() {
  renderItemList(els.sectionList, data.sections, 'sections', item => item.size ? `${item.size} students` : 'No size set');
  renderItemList(els.subjectList, data.subjects, 'subjects', item => `${item.duration || 50} mins`);
  renderItemList(els.teacherList, data.teachers, 'teachers', item => teacherStartLabel(item));
  renderItemList(els.roomList, data.rooms, 'rooms', item => item.capacity ? `Capacity ${item.capacity}` : 'Laboratory / special room');
  renderTeachingLoadList();
  renderFixedSectionChoices();
  renderFixedActivityList();
}
function renderSelects() {
  renderOptions(els.scheduleSection, data.sections, 'Choose section', item => item.size ? `${item.name} (${item.size})` : item.name);
  renderOptions(els.scheduleSubject, data.subjects, 'Choose subject', item => `${item.name} - ${item.duration || 50} mins`);
  renderOptions(els.scheduleTeacher, data.teachers, 'Choose teacher', item => `${item.name} · ${teacherStartLabel(item)}`);
  renderOptions(els.manualRoom, data.rooms, 'Choose lab/room', item => item.capacity ? `${item.name} (${item.capacity})` : item.name);
  renderOptions(els.loadSection, data.sections, 'Choose section', item => item.size ? `${item.name} (${item.size})` : item.name);
  renderOptions(els.loadSubject, data.subjects, 'Choose subject', item => `${item.name} - ${item.duration || 50} mins`);
  renderOptions(els.loadTeacher, data.teachers, 'Choose teacher', item => `${item.name} · ${teacherStartLabel(item)}`);
  renderOptions(els.loadManualRoom, data.rooms, 'Choose lab/room', item => item.capacity ? `${item.name} (${item.capacity})` : item.name);
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
    const days = Array.isArray(activity.days) && activity.days.length ? activity.days : (activity.day ? [activity.day] : []);
    return sectionIds.flatMap(sectionId => days.map(day => ({
      id: `fixed_${activity.id}_${sectionId}_${day}`,
      fixedActivityId: activity.id,
      type: 'fixed',
      protected: true,
      title: activity.title || 'Fixed Activity',
      category: activity.category || 'fixed',
      sectionId,
      subjectId: null,
      teacherId: null,
      roomId: DEFAULT_ROOM_ID,
      roomMode: 'default',
      day,
      start: activity.start,
      duration: Number(activity.duration || data.settings.slotDuration || 50)
    })));
  });
}
function getDisplayScheduleItems() { return [...expandFixedActivities(data), ...data.schedules]; }
function scheduleLabel(item) { return isFixedSchedule(item) ? item.title || 'Fixed Activity' : byName(data.subjects, item.subjectId); }
function conflictLabel(item) { return isFixedSchedule(item) ? `${item.title || 'Fixed Activity'} fixed block` : byName(data.subjects, item.subjectId); }
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
    els.fixedActivityList.insertAdjacentHTML('beforeend', `
      <li>
        <span>
          <strong>${escapeHtml(activity.title || 'Fixed Activity')}</strong><br>
          <small>${escapeHtml(days.join(', '))} · ${escapeHtml(timeRange(activity.start, activity.duration))} · ${escapeHtml(sectionPreview || 'No sections')}</small>
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
  const slot = Number(data.settings.slotDuration || 50);
  if (kind === 'lunch') {
    els.fixedTitle.value = 'Lunch Break';
    els.fixedDuration.value = slot;
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
  if (!data.sections.length) return showAlert('Add sections before creating lunch breaks or fixed activities.', 'warning');
  const editingId = editState.fixedActivities;
  const title = String(els.fixedTitle?.value || '').trim();
  const start = els.fixedStart?.value;
  const duration = Number(els.fixedDuration?.value || data.settings.slotDuration || 50);
  const days = getSelectedFixedDays();
  const sectionIds = getSelectedFixedSections();
  if (!title) return showAlert('Enter a fixed activity name, such as Lunch Break or Flag Ceremony.', 'warning');
  if (!days.length) return showAlert('Choose at least one day for the fixed activity.', 'warning');
  if (!sectionIds.length) return showAlert('Choose at least one section for the fixed activity.', 'warning');
  if (toMinutes(start) + duration > toMinutes(data.settings.dayEnd)) return showAlert('This fixed activity goes beyond the school day end time.', 'error');
  const activity = { id: editingId || createId('fixed'), title, start, duration, days, sectionIds, protected: true };
  const candidates = expandFixedActivities({ fixedActivities: [activity] });
  const existing = [
    ...expandFixedActivities({ fixedActivities: data.fixedActivities.filter(item => item.id !== editingId) }),
    ...data.schedules
  ];
  for (const candidate of candidates) {
    const conflicts = getConflictsInList(candidate, existing);
    if (conflicts.length) return showAlert(`Cannot ${editingId ? 'update' : 'add'} ${title}. ${conflicts[0]}`, 'error');
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
  showAlert(`${title} ${editingId ? 'updated' : 'added as a protected fixed activity'}.`);
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
    .filter(item => includeFixed || !isFixedSchedule(item))
    .filter(item => sectionFilter === 'all' || item.sectionId === sectionFilter)
    .filter(item => dayFilter === 'all' || item.day === dayFilter)
    .sort((a,b) => byName(data.sections,a.sectionId).localeCompare(byName(data.sections,b.sectionId)) || DAYS.indexOf(a.day)-DAYS.indexOf(b.day) || toMinutes(a.start)-toMinutes(b.start) || (isFixedSchedule(a) ? -1 : 1));
  els.scheduleTable.innerHTML = '';
  if (!schedules.length) { els.scheduleTable.appendChild($('emptyRowTemplate').content.cloneNode(true)); return; }
  schedules.forEach(item => {
    const fixed = isFixedSchedule(item);
    const sectionName = byName(data.sections, item.sectionId);
    const subjectName = fixed ? item.title || 'Fixed Activity' : byName(data.subjects, item.subjectId);
    const teacherName = fixed ? 'Fixed Activity' : byName(data.teachers, item.teacherId);
    const displayRoom = roomName(item.roomId);
    const roomView = fixed
      ? '<small class="muted-note">Protected slot</small>'
      : isDefaultRoom(item.roomId) ? '<small class="muted-note">No special room assigned</small>' : `<button type="button" class="text-link small-link" data-open-weekly-kind="room" data-open-weekly-id="${escapeHtml(item.roomId)}">View ${escapeHtml(displayRoom)} schedule</button>`;
    const roomCell = fixed
      ? `<span class="fixed-badge">Protected</span><span class="print-only">${escapeHtml(displayRoom)}</span>`
      : `<div class="stacked-cell no-print"><select class="room-update" data-room-update="${escapeHtml(item.id)}">${roomUpdateOptions(item.roomId)}</select>${roomView}</div><span class="print-only">${escapeHtml(displayRoom)}</span>`;
    const actions = fixed
      ? '<span class="fixed-badge">Fixed</span>'
      : `<div class="row-actions"><button type="button" class="secondary" data-edit-schedule="${escapeHtml(item.id)}">Edit</button><button type="button" class="secondary" data-duplicate="${escapeHtml(item.id)}">Duplicate</button><button type="button" class="icon-btn" data-delete-schedule="${escapeHtml(item.id)}">Delete</button></div>`;
    els.scheduleTable.insertAdjacentHTML('beforeend', `
      <tr class="${fixed ? 'fixed-row' : ''}">
        <td><button type="button" class="text-link no-print" data-open-weekly-kind="section" data-open-weekly-id="${escapeHtml(item.sectionId)}">${escapeHtml(sectionName)}</button><strong class="print-only">${escapeHtml(sectionName)}</strong></td>
        <td>${escapeHtml(item.day)}</td>
        <td>${escapeHtml(timeRange(item.start, item.duration))}</td>
        <td>${fixed ? '<span class="fixed-badge">Fixed</span> ' : ''}${escapeHtml(subjectName)}</td>
        <td>${fixed ? '<span class="muted-note">Fixed Activity</span>' : `<button type="button" class="text-link no-print" data-open-weekly-kind="teacher" data-open-weekly-id="${escapeHtml(item.teacherId)}">${escapeHtml(teacherName)}</button><span class="print-only">${escapeHtml(teacherName)}</span>`}</td>
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
  const teacherLunchConflict = getTeacherLunchConflict(newSchedule);
  if (teacherLunchConflict) conflicts.push(teacherLunchConflict);
  const newIsFixed = isFixedSchedule(newSchedule);
  schedules.forEach(existing => {
    if (existing.id === ignoreId || existing.day !== newSchedule.day) return;
    if (!overlaps(newSchedule.start, newSchedule.duration, existing.start, existing.duration)) return;
    const existingIsFixed = isFixedSchedule(existing);
    if (existing.sectionId && newSchedule.sectionId && existing.sectionId === newSchedule.sectionId) {
      conflicts.push(`Section conflict with ${conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    }
    if (!newIsFixed && !existingIsFixed && existing.teacherId && existing.teacherId === newSchedule.teacherId) {
      conflicts.push(`Teacher conflict with ${byName(data.sections, existing.sectionId)} at ${timeRange(existing.start, existing.duration)}.`);
    }
    if (!newIsFixed && !existingIsFixed && !isDefaultRoom(newSchedule.roomId) && !isDefaultRoom(existing.roomId) && existing.roomId === newSchedule.roomId) {
      conflicts.push(`Room conflict with ${byName(data.sections, existing.sectionId)} at ${timeRange(existing.start, existing.duration)}.`);
    }
  });
  return conflicts;
}
function getConflicts(newSchedule, ignoreId = null) { return getConflictsInList(newSchedule, getDisplayScheduleItems(), ignoreId); }
function roomHasConflictInList(roomId, day, start, duration, schedules, ignoreId = null) {
  if (isDefaultRoom(roomId)) return false;
  return schedules.some(existing => existing.id !== ignoreId && !isFixedSchedule(existing) && !isDefaultRoom(existing.roomId) && existing.roomId === roomId && existing.day === day && overlaps(start, duration, existing.start, existing.duration));
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
  const usedInFixed = data.fixedActivities.some(activity => Array.isArray(activity.sectionIds) && activity.sectionIds.includes(id));
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
  const starts = new Set(generateSlots(day));
  const opening = getSpecialOpeningSlotForExport(day);
  if (opening) starts.add(opening.start);
  schedules.filter(item => item.day === day).forEach(item => starts.add(item.start));
  return Array.from(starts).sort((a,b) => toMinutes(a)-toMinutes(b));
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
  if (primary) {
    if (isFixedSchedule(primary)) return `${primary.title || 'Fixed Activity'}\n${timeRange(primary.start, primary.duration)}`;
    const room = roomName(primary.roomId);
    return `${byName(data.subjects, primary.subjectId)}\n${byName(data.teachers, primary.teacherId)}${isDefaultRoom(primary.roomId) ? '' : `\n${room}`}`;
  }
  const continuing = schedules.find(item => item.day === day && toMinutes(item.start) < toMinutes(start) && toMinutes(item.start) + Number(item.duration || 0) > toMinutes(start));
  if (!continuing) return '';
  if (isFixedSchedule(continuing)) return `↳ ${continuing.title || 'Fixed Activity'} continues`;
  return `↳ ${byName(data.subjects, continuing.subjectId)} continues`;
}
function buildSectionSpreadsheetRows() {
  const rows = [];
  rows.push(['All Section Weekly Schedules']);
  rows.push([`Generated: ${new Date().toLocaleString()}`]);
  rows.push([]);
  sortByName(data.sections).forEach(section => {
    const schedules = getSectionSchedulesForExport(section.id);
    rows.push([section.name]);
    rows.push(['Monday Time','Monday','Tue-Fri Time','Tuesday','Wednesday','Thursday','Friday']);
    const rowSets = getExportStartRows(schedules);
    for (let i = 0; i < rowSets.maxRows; i += 1) {
      const mondayStart = rowSets.monday[i] || '';
      const weekdayStart = rowSets.weekdays[i] || '';
      rows.push([
        mondayStart ? timeRange(mondayStart, getBestExportDuration('Monday', mondayStart, schedules)) : '',
        getExportCellText('Monday', mondayStart, schedules),
        weekdayStart ? timeRange(weekdayStart, getBestExportDuration('Tuesday', weekdayStart, schedules)) : '',
        getExportCellText('Tuesday', weekdayStart, schedules),
        getExportCellText('Wednesday', weekdayStart, schedules),
        getExportCellText('Thursday', weekdayStart, schedules),
        getExportCellText('Friday', weekdayStart, schedules)
      ]);
    }
    rows.push([]);
  });
  return rows;
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
function buildWorksheetXml(rows) {
  const rowXml = rows.map((row, rIndex) => {
    const cells = row.map((value, cIndex) => {
      const ref = `${columnName(cIndex + 1)}${rIndex + 1}`;
      const style = rIndex === 0 || (row.length === 1 && value) || row.includes('Monday Time') ? ' s="1"' : '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${spreadsheetXmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols><col min="1" max="7" width="24" customWidth="1"/></cols>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
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
function createXlsxBlob(rows) {
  const files = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Weekly Schedules" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', content: buildWorksheetXml(rows) }
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
  const rows = buildSectionSpreadsheetRows();
  const date = new Date().toISOString().slice(0,10);
  downloadBlob(createXlsxBlob(rows), `all-section-weekly-schedules-${date}.xlsx`);
  showAlert('Weekly spreadsheet exported.');
}

function validateCoreDataForScheduling() {
  if (!data.sections.length || !data.subjects.length || !data.teachers.length) {
    showAlert('Add at least one section, subject, and teacher first.', 'warning');
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
  if (roomMode !== 'default' && !data.rooms.length) return showAlert('Add at least one laboratory/special room before assigning lab rooms.', 'warning');
  const roomId = roomMode === 'manual' ? els.loadManualRoom.value : DEFAULT_ROOM_ID;
  if (roomMode === 'manual' && !roomId) return showAlert('Choose a manual lab/room for this teaching load.', 'warning');
  const load = { id: editingId || createId('load'), sectionId: els.loadSection.value, subjectId: els.loadSubject.value, teacherId: els.loadTeacher.value, meetings, duration, roomMode, roomId };
  const duplicate = data.teachingLoads.some(existing => existing.id !== editingId && existing.sectionId === load.sectionId && existing.subjectId === load.subjectId && existing.teacherId === load.teacherId && existing.roomMode === load.roomMode && existing.roomId === load.roomId);
  if (duplicate) return showAlert('A similar teaching load already exists. Delete or adjust the existing load first.', 'warning');
  if (editingId) {
    const index = data.teachingLoads.findIndex(item => item.id === editingId);
    if (index < 0) return showAlert('The teaching load you are editing could not be found.', 'error');
    data.teachingLoads[index] = load;
  } else {
    data.teachingLoads.push(load);
  }
  saveData();
  renderAll();
  resetTeachingLoadFormMode();
  showAlert(`Teaching load ${editingId ? 'updated' : 'added'}.`);
}
function deleteTeachingLoad(id) {
  data.teachingLoads = data.teachingLoads.filter(load => load.id !== id);
  saveData(); renderAll(); showAlert('Teaching load deleted.');
}
function getDayScore(day, schedules, load) {
  const classItems = getClassItemsOnly(schedules);
  const sectionCount = classItems.filter(item => item.day === day && item.sectionId === load.sectionId).length;
  const totalCount = classItems.filter(item => item.day === day).length;
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
function findSlotForLoad(load, schedules, meetingIndex) {
  const teacherStart = toMinutes(getTeacherStartTime(load.teacherId));
  const sortedDays = [...DAYS].sort((a,b) => getDayScore(a, schedules, load) - getDayScore(b, schedules, load) || ((DAYS.indexOf(a) + meetingIndex) % DAYS.length) - ((DAYS.indexOf(b) + meetingIndex) % DAYS.length));
  for (const avoidSameSubjectDay of [true, false]) {
    for (const day of sortedDays) {
      if (avoidSameSubjectDay && schedules.some(item => item.day === day && item.sectionId === load.sectionId && item.subjectId === load.subjectId)) continue;
      const daySlots = generateSlots(day);
      const dayEnd = toMinutes(getDayEnd(day));
      const sortedSlots = [...daySlots].sort((a,b) => {
        const sectionA = schedules.filter(item => item.day === day && item.sectionId === load.sectionId && toMinutes(item.start) < toMinutes(a)).length;
        const sectionB = schedules.filter(item => item.day === day && item.sectionId === load.sectionId && toMinutes(item.start) < toMinutes(b)).length;
        return sectionA - sectionB || toMinutes(a) - toMinutes(b);
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
function autoGenerateWeek() {
  if (!validateCoreDataForScheduling()) return;
  if (!data.teachingLoads.length) return showAlert('Add teaching loads first. The generator needs section, subject, teacher, meetings/week, duration, and room assignment rules.', 'warning');
  const invalidLoads = data.teachingLoads.filter(load => !data.sections.some(s => s.id === load.sectionId) || !data.subjects.some(s => s.id === load.subjectId) || !data.teachers.some(t => t.id === load.teacherId) || (load.roomMode === 'manual' && !data.rooms.some(r => r.id === load.roomId)));
  if (invalidLoads.length) return showAlert('Some teaching loads reference deleted sections, subjects, teachers, or rooms. Please delete and recreate those loads.', 'error');
  if (data.teachingLoads.some(load => load.roomMode === 'auto' && !data.rooms.length)) return showAlert('At least one teaching load requires auto lab/room assignment, but no laboratory/special rooms have been added.', 'warning');

  const replace = els.replaceExistingSchedule?.checked !== false;
  const fixedBase = expandFixedActivities(data);
  const working = replace ? [...fixedBase] : [...fixedBase, ...data.schedules.map(item => ({ ...item }))];
  const expanded = [];
  data.teachingLoads.forEach(load => {
    for (let i = 0; i < Number(load.meetings || 1); i++) expanded.push({ ...load, meetingIndex: i });
  });
  expanded.sort((a,b) => {
    const roomPriority = mode => mode === 'manual' ? 0 : mode === 'auto' ? 1 : 2;
    const teacherLoadA = getTeacherTotalLoadMinutes(a.teacherId);
    const teacherLoadB = getTeacherTotalLoadMinutes(b.teacherId);
    const teacherStartA = toMinutes(getTeacherStartTime(a.teacherId));
    const teacherStartB = toMinutes(getTeacherStartTime(b.teacherId));
    return teacherLoadB - teacherLoadA || teacherStartA - teacherStartB || roomPriority(a.roomMode) - roomPriority(b.roomMode) || Number(b.duration || 50) - Number(a.duration || 50) || Number(b.meetings || 1) - Number(a.meetings || 1);
  });

  const failures = [];
  for (const load of expanded) {
    const scheduled = findSlotForLoad(load, working, load.meetingIndex);
    if (!scheduled) {
      failures.push(`${byName(data.sections, load.sectionId)} · ${byName(data.subjects, load.subjectId)} · ${byName(data.teachers, load.teacherId)}`);
      continue;
    }
    working.push(scheduled);
  }

  if (failures.length) {
    const preview = failures.slice(0, 8).join('\n');
    const extra = failures.length > 8 ? `\n...and ${failures.length - 8} more.` : '';
    return showAlert(`Auto-generate could not place all classes without conflicts. No schedule was changed.\n\nUnplaced:\n${preview}${extra}\n\nTry extending the school day, reducing loads, adding lab rooms, or adjusting teacher assignments.`, 'error');
  }

  const generatedSchedules = working.filter(item => !isFixedSchedule(item));
  data.schedules = generatedSchedules;
  saveData(); renderAll();
  showAlert(`Weekly schedule generated successfully. ${generatedSchedules.length} class entries plus ${fixedBase.length} protected fixed block(s) are now in the master schedule. Teacher loads were prioritized by total units and distributed across the week where slots allowed.`);
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
}

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
if (els.fixedFlagCeremonyPreset) els.fixedFlagCeremonyPreset.addEventListener('click', () => setFixedPreset('flagCeremony'));
if (els.fixedFlagRetreatPreset) els.fixedFlagRetreatPreset.addEventListener('click', () => setFixedPreset('flagRetreat'));
if (els.fixedSelectAllSections) els.fixedSelectAllSections.addEventListener('click', () => setAllFixedSections(true));
if (els.fixedClearSections) els.fixedClearSections.addEventListener('click', () => setAllFixedSections(false));
if (els.fixedSelectMatchingSections) els.fixedSelectMatchingSections.addEventListener('click', selectMatchingFixedSections);
els.scheduleSubject.addEventListener('change', () => { const subject = data.subjects.find(s => s.id === els.scheduleSubject.value); if (subject) els.scheduleDuration.value = subject.duration || 50; });
if (els.scheduleDay) els.scheduleDay.addEventListener('change', renderTimeOptions);
if (els.mondayFlagPatternBtn) els.mondayFlagPatternBtn.addEventListener('click', setMondayFlagPattern);
els.loadSubject.addEventListener('change', () => { const subject = data.subjects.find(s => s.id === els.loadSubject.value); if (subject) els.loadDuration.value = subject.duration || 50; });
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
  }
  saveData();
  renderAll();
  resetScheduleFormMode({ reset: false });
  showAlert(`Schedule ${editingId ? 'updated' : 'added'}. Room: ${roomName(item.roomId)}.`);
});
els.clearScheduleForm.addEventListener('click', () => resetScheduleFormMode());
els.autoGenerateBtn.addEventListener('click', autoGenerateWeek);
els.masterResetScheduleBtn.addEventListener('click', masterResetWeeklySchedule);
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
    els.scheduleSection.value = item.sectionId; els.scheduleSubject.value = item.subjectId; els.scheduleTeacher.value = item.teacherId; els.scheduleDay.value = item.day; els.scheduleStart.value = item.start; els.scheduleDuration.value = item.duration; els.roomMode.value = item.roomMode || (isDefaultRoom(item.roomId) ? 'default' : 'manual'); els.manualRoomWrap.classList.toggle('hidden', els.roomMode.value !== 'manual'); if (els.roomMode.value === 'manual') els.manualRoom.value = item.roomId;
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
if (els.browseSectionsBtn) els.browseSectionsBtn.addEventListener('click', () => openWeeklyBrowser('sections'));
if (els.browseTeachersBtn) els.browseTeachersBtn.addEventListener('click', () => openWeeklyBrowser('teachers'));
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) { data = loadData(); renderAll(); } });
window.addEventListener('message', e => { if (e.data?.type === 'scheduler-data-updated') { data = loadData(); renderAll(); } });
function initializeApp() { renderSyncSettings(); renderAll(); if (syncConfig.enabled) { pullFromServer({ silent: true }); startSyncPolling(); } }
initializeApp();
