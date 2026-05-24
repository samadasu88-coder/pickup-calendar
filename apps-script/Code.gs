// お迎え予定表 → Googleカレンダー同期
// HTMLアプリ（お迎え予定表アプリ.html）からPOSTを受け、
// 指定月のイベントを3カレンダーから一旦削除して再登録する。

const CALENDAR_IDS = {
  papa: 'fa41ddc0faaf73e0a5eada89d706f64cb2472186477e337c668ff3849871523b@group.calendar.google.com',
  mama: '0bc444caa792e29626e012dc6811e98555cef529fc6914f5662ac9500050fc6f@group.calendar.google.com',
  tsuu: '1e93543e644db22ac163df084fe4d00af489feebf01c69b8567e2d10dd48ec3a@group.calendar.google.com'
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // スクリプトプロパティで SHARED_TOKEN を設定していれば照合する
    const expected = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
    if (expected && body.token !== expected) {
      return json({ ok: false, error: 'token mismatch' });
    }

    const year  = Number(body.year);
    const month = Number(body.month);
    const events = Array.isArray(body.events) ? body.events : [];

    if (!year || !month) return json({ ok: false, error: 'year/month required' });

    // 対象月の範囲 [start, end)
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    // 既存イベント削除（3カレンダー）
    let deleted = 0;
    for (const calId of Object.values(CALENDAR_IDS)) {
      const cal = CalendarApp.getCalendarById(calId);
      if (!cal) continue;
      const existing = cal.getEvents(start, end);
      for (const ev of existing) {
        ev.deleteEvent();
        deleted++;
      }
    }

    // 新規イベント登録
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

    return json({ ok: true, deleted, added });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService
    .createTextOutput('pickup-calendar-sync OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
