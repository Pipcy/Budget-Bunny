/**
 * Transaction time vs log time helpers
 */

function now_() {
  return new Date();
}

/**
 * Transaction time = when the expense/income happened.
 * Defaults to log time if not specified.
 */
function resolveTransactionTime_(data, logTime) {
  if (data.transactionTime) {
    return parseDateTime_(data.transactionTime);
  }
  if (data.date) {
    const base = parseSheetDate_(data.date);
    if (data.time) {
      return applyTimeToDate_(base, data.time);
    }
    const dateOnly = Utilities.formatDate(base, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const logDateOnly = Utilities.formatDate(logTime, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (dateOnly === logDateOnly) {
      return new Date(logTime.getTime());
    }
    base.setHours(12, 0, 0, 0);
    return base;
  }
  return new Date(logTime.getTime());
}

function parseDateTime_(str) {
  const s = String(str).trim();
  if (!s) return now_();
  if (s.indexOf('T') !== -1) {
    return new Date(s);
  }
  const space = s.indexOf(' ');
  if (space !== -1) {
    return applyTimeToDate_(parseSheetDate_(s.slice(0, space)), s.slice(space + 1));
  }
  return parseSheetDate_(s);
}

function parseSheetDate_(dateStr) {
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(dateStr);
}

function applyTimeToDate_(date, timeStr) {
  const d = new Date(date.getTime());
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (m) {
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  return d;
}

function formatDate_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

function formatDateTime_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(value);
}
