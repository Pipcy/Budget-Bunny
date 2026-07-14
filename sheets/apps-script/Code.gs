/**
 * Budget-Bunny — transaction API
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Budget-Bunny')
    .addItem('Setup workbook', 'setupWorkbook')
    .addItem('Refresh report formulas', 'refreshReportFormulas')
    .addItem('Add sample data', 'addSampleData')
    .addSeparator()
    .addItem('Generate API token', 'generateApiToken')
    .addItem('Test API (getCategories)', 'testApiGetCategories')
    .addSeparator()
    .addItem('Show balances', 'showBalances')
    .addToUi();
}

/**
 * @param {Object} data
 * @param {Array<{category: string, subcategory?: string, amount: number, reimbursementStatus?: string}>} data.splits
 */
function addTransaction(data) {
  return addTransaction_(data);
}

function addTransaction_(data) {
  validateTransaction_(data);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const splitSheet = ss.getSheetByName(SHEET_NAMES.SPLITS);

  const id = Utilities.getUuid().slice(0, 8).toUpperCase();
  const splits = data.splits || [
    { category: data.category, subcategory: data.subcategory || '', amount: data.amount },
  ];

  const splitTotal = splits.reduce((sum, s) => sum + Number(s.amount), 0);
  if (Math.abs(splitTotal - Number(data.amount)) > 0.01) {
    throw new Error(
      `Split total ($${splitTotal}) must equal transaction amount ($${data.amount})`
    );
  }

  ensureAllSchemas_(ss);

  const logTime = now_();
  const transactionTime = resolveTransactionTime_(data, logTime);
  const merchant = normalizeMerchant_(data.merchant);

  txSheet.appendRow([
    id,
    transactionTime,
    logTime,
    merchant,
    Number(data.amount),
    data.paymentMethod || 'Other',
    data.notes || '',
    data.receiptUrl || '',
    data.source || 'manual',
  ]);

  splits.forEach((split) => {
    splitSheet.appendRow([
      id,
      split.category,
      split.subcategory || '',
      merchant,
      Number(split.amount),
      reimbursementStatusForSplit_(split),
      split.notes || '',
      transactionTime,
      logTime,
    ]);
  });

  return { id, success: true };
}

function getBalances() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = ss.getSheetByName(SHEET_NAMES.MONTHLY_SUMMARY);
  if (!summary) return { balances: [] };

  const lastRow = summary.getLastRow();
  if (lastRow < 2) return { balances: [] };

  // B=Main Category, C=Group, D=Spent
  const values = summary.getRange(2, 2, lastRow - 1, 3).getValues();
  const balances = values
    .filter((row) => row[0])
    .map((row) => ({
      category: String(row[0]),
      group: String(row[1] || ''),
      spent: Number(row[2]) || 0,
    }));

  return { balances };
}

function getCategories() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureCategoryContextSchemas_(ss);
  ensureOtherCategory_(ss);

  const mains = getMainCategories_();
  const subs = getSubcategoryRows_();

  return mains.map((main) => ({
    name: main.name,
    group: main.group,
    color: main.color,
    context: main.context || '',
    subcategories: subs
      .filter((s) => s.parentCategory === main.name)
      .map((s) => ({
        name: s.name,
        context: s.context || '',
      })),
  }));
}

function getMainCategories_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const headers = headerRow_(sheet);
  const nameCol = colIndex_(headers, 'Category', 0);
  const groupCol = colIndex_(headers, 'Group', 1);
  const colorCol = colIndex_(headers, 'Color', 2);
  const contextCol = colIndex_(headers, 'Context', 3);
  const activeCol = colIndex_(headers, 'Active', 4);
  const width = Math.max(nameCol, groupCol, colorCol, contextCol, activeCol) + 1;

  return sheet
    .getRange(2, 1, lastRow - 1, width)
    .getValues()
    .filter((row) => row[nameCol] && isActive_(row[activeCol]))
    .map((row) => ({
      name: String(row[nameCol]),
      group: String(row[groupCol] || ''),
      color: String(row[colorCol] || ''),
      context: String(row[contextCol] || ''),
    }));
}

function getSubcategoryRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SUBCATEGORIES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const headers = headerRow_(sheet);
  const nameCol = colIndex_(headers, 'Subcategory', 0);
  const parentCol = colIndex_(headers, 'Parent Category', 1);
  const contextCol = colIndex_(headers, 'Context', 2);
  const activeCol = colIndex_(headers, 'Active', 3);
  const width = Math.max(nameCol, parentCol, contextCol, activeCol) + 1;

  return sheet
    .getRange(2, 1, lastRow - 1, width)
    .getValues()
    .filter((row) => row[nameCol] && isActive_(row[activeCol]))
    .map((row) => ({
      name: String(row[nameCol]),
      parentCategory: String(row[parentCol] || ''),
      context: String(row[contextCol] || ''),
    }));
}

function getSubcategoryMap_() {
  const map = {};
  getSubcategoryRows_().forEach((s) => {
    if (!map[s.parentCategory]) map[s.parentCategory] = [];
    map[s.parentCategory].push(s.name);
  });
  return map;
}

function colIndex_(headers, name, fallback) {
  const idx = headers.indexOf(name);
  return idx >= 0 ? idx : fallback;
}

function isActive_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function showBalances() {
  const { balances } = getBalances();
  const lines = balances.map((b) => `${b.category}: $${Number(b.spent).toFixed(2)}`);
  SpreadsheetApp.getUi().alert(lines.join('\n') || 'No data yet.');
}

function validateTransaction_(data) {
  if (data.amount == null) {
    throw new Error('Transaction requires amount');
  }
  // date / transactionTime optional — addTransaction_ defaults to log time (now)
  if (!data.splits || data.splits.length === 0) {
    throw new Error('Transaction requires at least one split');
  }

  const mainNames = getMainCategories_().map((c) => c.name);
  const subMap = getSubcategoryMap_();

  data.splits.forEach((split) => {
    if (!mainNames.includes(split.category)) {
      throw new Error(
        'Unknown main category "' + split.category + '". Must match Categories tab exactly.'
      );
    }
    if (split.subcategory) {
      const allowedSubs = subMap[split.category] || [];
      if (!allowedSubs.includes(split.subcategory)) {
        throw new Error(
          'Unknown subcategory "' +
            split.subcategory +
            '" under "' +
            split.category +
            '". Check Subcategories tab.'
        );
      }
    }
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    verifyToken_(payload);
    const action = payload.action;

    if (action === 'addTransaction') {
      return jsonResponse_(addTransaction(payload.data));
    }
    if (action === 'getBalances') {
      return jsonResponse_(getBalances());
    }
    if (action === 'getCategories') {
      return jsonResponse_({ categories: getCategories() });
    }
    if (action === 'addSubcategory') {
      return jsonResponse_(addSubcategory(payload.data));
    }
    if (action === 'searchTransactions') {
      return jsonResponse_(searchTransactions(payload.data));
    }
    if (action === 'bulkReclassifySplits') {
      return jsonResponse_(bulkReclassifySplits(payload.data));
    }
    if (action === 'reclassifyByKeywords') {
      return jsonResponse_(reclassifyByKeywords(payload.data));
    }
    if (action === 'searchPendingReimbursements') {
      return jsonResponse_(searchPendingReimbursements(payload.data));
    }
    if (action === 'markReimbursementPaid') {
      return jsonResponse_(markReimbursementPaid(payload.data));
    }

    return jsonResponse_({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

function doGet() {
  return jsonResponse_({ status: 'ok', app: 'Budget-Bunny', version: '1.5' });
}

function testApiGetCategories() {
  const token = getApiToken_();
  if (!token) {
    SpreadsheetApp.getUi().alert('Generate an API token first.');
    return;
  }
  const mock = {
    postData: {
      contents: JSON.stringify({ token: token, action: 'getCategories' }),
    },
  };
  SpreadsheetApp.getUi().alert('getCategories response:\n\n' + doPost(mock).getContent());
}

function jsonResponse_(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
