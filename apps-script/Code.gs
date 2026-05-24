// お迎え予定表 → Googleカレンダー同期 + 端末間データ同期
//
// HTMLアプリから受けるアクション:
//   action: 'register'   月の予定をカレンダー登録（既定）
//   action: 'sync-save'  localStorageペイロードをScript Propertiesに保存
//   action: 'sync-load'  Script Propertiesから取得

const CALENDAR_IDS = {
  papa: 'fa41ddc0faaf73e0a5eada89d706f64cb2472186477e337c668ff3849871523b@group.calendar.google.com',
  mama: '0bc444caa792e29626e012dc6811e98555cef529fc6914f5662ac9500050fc6f@group.calendar.google.com',
  tsuu: '1e93543e644db22ac163df084fe4d00af489feebf01c69b8567e2d10dd48ec3a@group.calendar.google.com'
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    const expected = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
    if (expected && body.token !== expected) {
      return json({ ok: false, error: 'token mismatch' });
    }

    const action = body.action || 'register';

    if (action === 'sync-save') return handleSyncSave(body);
    if (action === 'sync-load') return handleSyncLoad(body);
    return handleRegister(body);
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService
    .createTextOutput('pickup-calendar-sync OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function handleRegister(body) {
  const year  = Number(body.year);
  const month = Number(body.month);
  const events = Array.isArray(body.events) ? body.events : [];
  if (!year || !month) return json({ ok: false, error: 'year/month required' });

  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 1);

  let deleted = 0;
  for (const calId of Object.values(CALENDAR_IDS)) {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) continue;
    const existing = cal.getEvents(start, end);
    for (const ev of existing) { ev.deleteEvent(); deleted++; }
  }

  let added = 0;
  for (const ev of events) {
    const calId = CALENDAR_IDS[ev.cal];
    if (!calId) continue;
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) continue;
    const date = new Date(ev.date + 'T00:00:00+09:00');
    cal.createAllDayEvent(ev.title, date);
    added++;
  }
  return json({ ok: true, action: 'register', deleted, added });
}

function handleSyncSave(body) {
  const ym = body.ym;
  if (!ym) return json({ ok: false, error: 'ym required' });
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SYNC_' + ym, body.payload || '');
  const now = new Date().toISOString();
  props.setProperty('SYNC_UPDATED_' + ym, now);
  return json({ ok: true, action: 'sync-save', ym, updated: now });
}

function handleSyncLoad(body) {
  const ym = body && body.ym;
  if (!ym) return json({ ok: false, error: 'ym required' });
  const props = PropertiesService.getScriptProperties();
  return json({
    ok: true,
    action: 'sync-load',
    ym,
    payload: props.getProperty('SYNC_' + ym) || '',
    updated: props.getProperty('SYNC_UPDATED_' + ym) || ''
  });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
