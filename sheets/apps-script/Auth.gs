/**
 * API token for iPhone app → Apps Script web app calls.
 * Token is stored in Script Properties (not in the sheet).
 */

function generateApiToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);

  writeTokenToSettingsSheet_(token);

  SpreadsheetApp.getUi().alert(
    'API token created.\n\n' +
      'Copy this into your iPhone app Settings:\n\n' +
      token +
      '\n\nAlso saved on the Settings tab.'
  );
  return token;
}

function getApiToken_() {
  return PropertiesService.getScriptProperties().getProperty('API_TOKEN');
}

function verifyToken_(payload) {
  const expected = getApiToken_();
  if (!expected) {
    throw new Error('No API token set. Run Budget-Bunny → Generate API token first.');
  }
  if (!payload || payload.token !== expected) {
    throw new Error('Invalid API token');
  }
}

function writeTokenToSettingsSheet_(token) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return;
  sheet.getRange('B4').setValue(token);
}
