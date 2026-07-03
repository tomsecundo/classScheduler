const STORAGE_KEY = 'offlineClassScheduler.v1';
const API_CONFIG_KEY = 'offlineClassScheduler.apiConfig.v1';
const API_REVISION_KEY = 'offlineClassScheduler.apiRevision.v1';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_ROOM_ID = '__default_classroom__';
const DEFAULT_ROOM_NAME = 'Default Classroom';
const defaultData = { settings: { dayStart: '07:30', dayEnd: '16:30', slotDuration: 50, dayStarts: { Monday: '07:50', Tuesday: '07:30', Wednesday: '07:30', Thursday: '07:30', Friday: '07:30' } }, sections: [], subjects: [], teachers: [], rooms: [], teachingLoads: [], fixedActivities: [], schedules: [] };

let schedulerData = loadData();
let syncConfig = loadSyncConfig();
let remoteRevision = Number(localStorage.getItem(API_REVISION_KEY) || 0);
let pushTimer = null;
let editing = false;
let currentKind = null;
let currentId = null;
let currentEntity = null;
let browserMode = null;

const els = {
  viewEyebrow: document.getElementById('viewEyebrow'), viewTitle: document.getElementById('viewTitle'), viewSubtitle: document.getElementById('viewSubtitle'), printBtn: document.getElementById('printBtn'), closeBtn: document.getElementById('closeBtn'), refreshBtn: document.getElementById('refreshBtn'), editToggle: document.getElementById('editToggle'),
  totalClasses: document.getElementById('totalClasses'), totalMinutes: document.getElementById('totalMinutes'), dailySummary: document.getElementById('dailySummary'), generatedAt: document.getElementById('generatedAt'), calendarBody: document.getElementById('calendarBody'), statusLine: document.getElementById('statusLine'), navigatorCard: document.getElementById('navigatorCard'), navigatorSelect: document.getElementById('navigatorSelect'), navigatorLabel: document.getElementById('navigatorLabel'), navigatorHint: document.getElementById('navigatorHint'), exportIcsBtn: document.getElementById('exportIcsBtn'),
  messageModal: document.getElementById('messageModal'), modalMessage: document.getElementById('modalMessage'), modalOkBtn: document.getElementById('modalOkBtn'), modalCloseBtn: document.getElementById('modalCloseBtn')
};

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
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function toMinutes(time) { const [h,m] = String(time || '00:00').split(':').map(Number); return h * 60 + m; }
function fromMinutes(total) { const h = Math.floor(total / 60) % 24; const m = total % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
function formatTime(time) { const [h,m] = String(time || '00:00').split(':').map(Number); const suffix = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${suffix}`; }
function getEndTime(start, duration) { return fromMinutes(toMinutes(start) + Number(duration || 0)); }
function timeRange(start, duration) { return `${formatTime(start)} - ${formatTime(getEndTime(start, duration))}`; }
function overlaps(aStart, aDuration, bStart, bDuration) { const aEnd = toMinutes(aStart) + Number(aDuration || 0); const bEnd = toMinutes(bStart) + Number(bDuration || 0); return toMinutes(aStart) < bEnd && toMinutes(bStart) < aEnd; }
function isDefaultRoom(roomId) { return !roomId || roomId === DEFAULT_ROOM_ID; }
function byName(list, id) { if (isDefaultRoom(id)) return DEFAULT_ROOM_NAME; const match = list.find(item => item.id === id); if (match) return match.name; const nameMatch = list.find(item => item.name === id); return nameMatch ? nameMatch.name : 'Deleted Item'; }
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
function getTeacherLunchConflict(schedule, source = schedulerData) { if (!schedule || isNonTeachingFixedSchedule(schedule) || !schedule.teacherId) return ''; const teacher = (source.teachers || []).find(item => item.id === schedule.teacherId || item.name === schedule.teacherId); if (!teacher) return ''; const overlap = getLunchBlocks(source).find(lunch => lunch.day === schedule.day && overlaps(schedule.start, schedule.duration, lunch.start, lunch.duration)); if (!overlap) return ''; return `${teacher.name} must keep a lunch break around ${timeRange(overlap.start, overlap.duration)}. Assign this class outside the protected lunch slot.`; }
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
        return [`<strong>${escapeHtml(subjectTitle)}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, `<span>${escapeHtml(byName(schedulerData.teachers, item.teacherId))}${isFixedSubjectSchedule(item) ? ' · Fixed Subject' : ''}</span>`, `<span>${escapeHtml(byName(schedulerData.rooms, item.roomId))}</span>`].join('');
      }
    },
    teacher: { collectionName: 'teachers', scheduleField: 'teacherId', legacyField: 'teacher', eyebrow: 'Teacher Weekly Calendar', subtitle: 'Monday to Friday teaching load view. Use this to check teacher assignments and print individual schedules.', printLabel: 'Print Teacher Schedule', emptyMessage: 'No weekly schedule has been created for this teacher yet.', missingMessage: 'Teacher not found. Open this view from the main scheduler again.', block(item) { if (isBatchSubjectSchedule(item)) return [`<strong>${escapeHtml(fixedDisplayTitle(item))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, '<span>Batch-wide elective/research block</span>', '<span>Protected teacher load</span>'].join(''); return [`<strong>${escapeHtml(byName(schedulerData.sections, item.sectionId))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, `<span>${escapeHtml(isFixedTeachingSchedule(item) ? fixedDisplayTitle(item) : byName(schedulerData.subjects, item.subjectId))}</span>`, `<span>${escapeHtml(byName(schedulerData.rooms, item.roomId))}</span>`].join(''); } },
    room: { collectionName: 'rooms', scheduleField: 'roomId', legacyField: 'room', eyebrow: 'Room Weekly Calendar', subtitle: 'Monday to Friday laboratory/special room usage view. Print this schedule for room posting or room monitoring.', printLabel: 'Print Room Schedule', emptyMessage: 'No weekly schedule has been created for this room yet.', missingMessage: 'Room not found. Open this view from the main scheduler again.', block(item) { if (isBatchSubjectSchedule(item)) return [`<strong>${escapeHtml(fixedDisplayTitle(item))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, '<span>Batch-wide elective/research offering</span>', `<span>${escapeHtml(byName(schedulerData.teachers, item.teacherId))}</span>`].join(''); return [`<strong>${escapeHtml(byName(schedulerData.sections, item.sectionId))}</strong>`, `<span class="class-time">${escapeHtml(timeRange(item.start, item.duration))}</span>`, `<span>${escapeHtml(isFixedTeachingSchedule(item) ? fixedDisplayTitle(item) : byName(schedulerData.subjects, item.subjectId))}</span>`, `<span>${escapeHtml(byName(schedulerData.teachers, item.teacherId))}</span>`].join(''); } }
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
function getStartsForDay(day, schedules = filteredSchedules()) {
  const starts = new Set(generateSlots(day));
  const openingSlot = getSpecialOpeningSlot(day);
  if (openingSlot) starts.add(openingSlot.start);
  schedules.filter(item => item.day === day).forEach(item => starts.add(item.start));
  return Array.from(starts).sort((a,b) => toMinutes(a)-toMinutes(b));
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
  const validSlot = isValidTeachingSlot(day, start, schedulerData.settings?.slotDuration || 50) || matches.length > 0;
  const rowSpan = matches.length ? getCellRowSpan(day, start, schedules, rowStarts) : 1;
  if (rowSpan > 1) spanState[day] = rowSpan - 1;
  const rowSpanAttr = rowSpan > 1 ? ` rowspan="${rowSpan}"` : '';
  const durationClass = rowSpan > 1 ? ' multi-slot-cell' : '';
  const blocks = matches.map(match => `<div class="class-block ${isFixedSchedule(match) ? 'fixed-block' : ''} ${rowSpan > 1 ? 'multi-slot-block' : ''}" draggable="${editing && !isFixedSchedule(match) ? 'true' : 'false'}" data-schedule-id="${escapeHtml(match.id)}">${config.block(match)}</div>`).join('');
  return `<td class="drop-cell${durationClass} ${matches.length ? 'has-class' : ''} ${validSlot ? '' : 'inactive-slot'}"${rowSpanAttr} data-day="${escapeHtml(day)}" data-start="${escapeHtml(start)}" data-drop-label="Drop here">${blocks}</td>`;
}
function getConflicts(newSchedule, ignoreId = null) {
  const conflicts = [];
  const dayWindowConflict = getDayWindowConflict(newSchedule);
  if (dayWindowConflict) conflicts.push(dayWindowConflict);
  const teacherStartConflict = getTeacherStartConflict(newSchedule);
  if (teacherStartConflict) conflicts.push(teacherStartConflict);
  const teacherLunchConflict = getTeacherLunchConflict(newSchedule);
  if (teacherLunchConflict) conflicts.push(teacherLunchConflict);
  const newIsClassLike = isClassLikeSchedule(newSchedule);
  allScheduleItems().forEach(existing => {
    if (existing.id === ignoreId || existing.day !== newSchedule.day) return;
    if (newSchedule.fixedActivityId && existing.fixedActivityId && newSchedule.fixedActivityId === existing.fixedActivityId) {
      if (isFixedSubjectSchedule(newSchedule) && isFixedSubjectSchedule(existing)) return;
      if (isBatchSubjectSchedule(newSchedule) && isBatchSubjectSchedule(existing) && (newSchedule.category === 'batchSubjectSection' || existing.category === 'batchSubjectSection')) return;
    }
    if (!overlaps(newSchedule.start, newSchedule.duration, existing.start, existing.duration)) return;
    const existingIsClassLike = isClassLikeSchedule(existing);
    if (existing.sectionId && newSchedule.sectionId && existing.sectionId === newSchedule.sectionId) conflicts.push(`Section conflict with ${conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    if (newIsClassLike && existingIsClassLike && existing.teacherId && newSchedule.teacherId && existing.teacherId === newSchedule.teacherId) conflicts.push(`Teacher conflict with ${existing.sectionId ? byName(schedulerData.sections, existing.sectionId) : conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
    if (newIsClassLike && existingIsClassLike && !isDefaultRoom(newSchedule.roomId) && !isDefaultRoom(existing.roomId) && existing.roomId === newSchedule.roomId) conflicts.push(`Room conflict with ${existing.sectionId ? byName(schedulerData.sections, existing.sectionId) : conflictLabel(existing)} at ${timeRange(existing.start, existing.duration)}.`);
  });
  return conflicts;
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
    return;
  }
  const kind = browserKindFromMode(browserMode);
  const config = getViewConfig(kind);
  const label = browserMode === 'sections' ? 'Choose Section' : 'Choose Teacher';
  const hint = browserMode === 'sections' ? 'Select any section to display its weekly schedule.' : 'Select any teacher to check their weekly teaching load.';
  els.navigatorLabel.textContent = label;
  els.navigatorHint.textContent = hint;
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
    `Teacher: ${byName(schedulerData.teachers, item.teacherId)}`,
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
function renderHeader() { renderNavigator(); const config = getViewConfig(); if (!config || !currentEntity) { els.viewEyebrow.textContent = 'Weekly Calendar'; els.viewTitle.textContent = 'Schedule Not Found'; els.viewSubtitle.textContent = config?.missingMessage || 'Open this view from the main scheduler again.'; els.printBtn.textContent = 'Print Schedule'; return; } document.title = `${currentEntity.name} Weekly Schedule`; els.viewEyebrow.textContent = browserMode ? (browserMode === 'sections' ? 'Section Schedule Browser' : 'Teacher Schedule Browser') : config.eyebrow; els.viewTitle.textContent = currentEntity.name; els.viewSubtitle.textContent = browserMode ? 'Use the dropdown below to switch calendars quickly. This view remains printable and exportable.' : config.subtitle; els.printBtn.textContent = config.printLabel; }
function renderSummary() { const schedules = filteredSchedules().filter(isClassLikeSchedule); els.totalClasses.textContent = schedules.length; els.totalMinutes.textContent = schedules.reduce((sum,item) => sum + Number(item.duration || 0), 0); els.dailySummary.innerHTML = DAYS.map(day => `<span><strong>${day.slice(0,3)}</strong> ${schedules.filter(item => item.day === day).length}</span>`).join(''); els.generatedAt.textContent = new Date().toLocaleString(); }
function renderCalendar() {
  const config = getViewConfig();
  renderHeader();
  renderSummary();
  if (!config || !currentEntity) {
    els.calendarBody.innerHTML = '<tr><td colspan="7" class="empty-state">Unable to load this weekly view. Please open it again from the main scheduler.</td></tr>';
    return;
  }
  const schedules = filteredSchedules();
  const rowSets = generateStartRows();
  if (!schedules.length) {
    els.calendarBody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(config.emptyMessage)}</td></tr>`;
    return;
  }
  const weekdayDays = ['Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const spanState = DAYS.reduce((state, day) => ({ ...state, [day]: 0 }), {});
  els.calendarBody.innerHTML = Array.from({ length: rowSets.maxRows }, (_, index) => {
    const mondayStart = rowSets.monday[index] || '';
    const weekdayStart = rowSets.weekdays[index] || '';
    return `<tr>${renderTimeHeaderCell('Monday', mondayStart, rowSets.monday)}${renderScheduleCell(config, 'Monday', mondayStart, schedules, rowSets.monday, spanState)}${renderTimeHeaderCell('Tuesday', weekdayStart, rowSets.weekdays)}${weekdayDays.map(day => renderScheduleCell(config, day, weekdayStart, schedules, rowSets.weekdays, spanState)).join('')}</tr>`;
  }).join('');
}
function setEditingMode(value) { editing = Boolean(value); document.body.classList.toggle('editing', editing); els.editToggle.textContent = editing ? 'Edit Mode: On' : 'Edit Mode: Off'; els.editToggle.className = editing ? 'danger' : 'success'; renderCalendar(); }
function showStatus(message) { els.statusLine.textContent = message; els.statusLine.className = 'good'; clearTimeout(showStatus.timer); showStatus.timer = setTimeout(() => { els.statusLine.innerHTML = `Generated: <span id="generatedAt">${new Date().toLocaleString()}</span>`; els.generatedAt = document.getElementById('generatedAt'); els.statusLine.className = ''; }, 4500); }
function showModal(message) { els.modalMessage.textContent = message; els.messageModal.classList.remove('hidden'); document.body.classList.add('modal-open'); setTimeout(() => els.modalOkBtn.focus(), 0); }
function closeModal() { els.messageModal.classList.add('hidden'); document.body.classList.remove('modal-open'); }
function moveSchedule(scheduleId, targetDay, targetStart) { const schedule = schedulerData.schedules.find(item => item.id === scheduleId); if (!schedule) { showModal('Fixed activities are protected and cannot be moved. Edit them from the main scheduler if needed.'); renderCalendar(); return; } const candidate = { ...schedule, day: targetDay, start: targetStart }; const conflicts = getConflicts(candidate, schedule.id); if (conflicts.length) { showModal(conflicts.join('\n')); renderCalendar(); return; } schedule.day = targetDay; schedule.start = targetStart; saveData(); renderCalendar(); showStatus(`Schedule moved to ${targetDay} at ${formatTime(targetStart)}. Changes saved offline.`); }
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

els.editToggle.addEventListener('click', () => setEditingMode(!editing));
els.printBtn.addEventListener('click', () => window.print());
if (els.exportIcsBtn) els.exportIcsBtn.addEventListener('click', exportCurrentIcs);
if (els.navigatorSelect) els.navigatorSelect.addEventListener('change', event => selectBrowserEntity(event.target.value));
els.closeBtn.addEventListener('click', () => window.close());
els.refreshBtn.addEventListener('click', refreshFromStorage);
els.calendarBody.addEventListener('dragstart', event => { const block = event.target.closest('.class-block'); if (!editing || !block) { event.preventDefault(); return; } block.classList.add('dragging'); event.dataTransfer.setData('text/plain', block.dataset.scheduleId); event.dataTransfer.effectAllowed = 'move'; });
els.calendarBody.addEventListener('dragend', event => { const block = event.target.closest('.class-block'); if (block) block.classList.remove('dragging'); document.querySelectorAll('.drop-cell.drag-over').forEach(cell => cell.classList.remove('drag-over')); });
els.calendarBody.addEventListener('dragover', event => { const cell = event.target.closest('.drop-cell'); if (!editing || !cell || !cell.dataset.day || !cell.dataset.start) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; cell.classList.add('drag-over'); });
els.calendarBody.addEventListener('dragleave', event => { const cell = event.target.closest('.drop-cell'); if (cell && !cell.contains(event.relatedTarget)) cell.classList.remove('drag-over'); });
els.calendarBody.addEventListener('drop', event => { const cell = event.target.closest('.drop-cell'); if (!editing || !cell || !cell.dataset.day || !cell.dataset.start) return; event.preventDefault(); cell.classList.remove('drag-over'); const scheduleId = event.dataTransfer.getData('text/plain'); if (scheduleId) moveSchedule(scheduleId, cell.dataset.day, cell.dataset.start); });
els.modalOkBtn.addEventListener('click', closeModal); els.modalCloseBtn.addEventListener('click', closeModal); els.messageModal.addEventListener('click', event => { if (event.target.matches('[data-modal-close]')) closeModal(); }); document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) refreshFromStorage(); });
initializeView();
