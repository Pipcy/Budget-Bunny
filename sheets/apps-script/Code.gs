/**
 * Budget-Flow — transaction and income API
 * Used by Apps Script menu, and later by mobile/backend via web app deployment.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Budget-Flow')
    .addItem('Setup workbook', 'setupWorkbook')
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
 * @param {string} data.date - YYYY-MM-DD
 * @param {string} data.merchant
 * @param {number} data.amount - positive number (expense total)
 * @param {string} data.paymentMethod
 * @param {string} [data.notes]
 * @param {string} [data.receiptUrl]
 * @param {string} [data.source] - manual | voice | receipt
 * @param {Array<{category: string, amount: number}>} data.splits
 * @returns {{id: string, success: boolean}}
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
  const splits = data.splits || [{ category: data.category || 'Uncategorized', amount: data.amount }];

  const splitTotal = splits.reduce((sum, s) => sum + Number(s.amount), 0);
  if (Math.abs(splitTotal - Number(data.amount)) > 0.01) {
    throw new Error(
      `Split total ($${splitTotal}) must equal transaction amount ($${data.amount})`
    );
  }

  txSheet.appendRow([
    id,
    data.date,
    data.merchant || '',
    Number(data.amount),
    data.paymentMethod || 'Other',
    data.notes || '',
    data.receiptUrl || '',
    data.source || 'manual',
  ]);

  splits.forEach((split) => {
    splitSheet.appendRow([id, split.category, Number(split.amount)]);
  });

  return { id, success: true };
}

/**
 * @param {Object} data
 * @param {string} data.date
 * @param {number} data.amount
 * @param {string} data.source - Paycheck | Zelle | Cash | Other
 * @param {string} [data.notes]
 * @param {boolean} [data.applyBudgetGuide]
 */
function addIncome(data) {
  return addIncome_(data);
}

function addIncome_(data) {
  if (!data.date || !data.amount) {
    throw new Error('Income requires date and amount');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.INCOME);

  sheet.appendRow([
    data.date,
    Number(data.amount),
    data.source || 'Other',
    data.notes || '',
    data.applyBudgetGuide ? 'TRUE' : 'FALSE',
  ]);

  if (data.applyBudgetGuide) {
    applyBudgetGuide_(Number(data.amount));
  }

  return { success: true };
}

/**
 * Returns per-category budget vs spent for the month in Dashboard!B3.
 * @returns {Array<{category: string, budget: number, spent: number, remaining: number}>}
 */
function getBalances() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = ss.getSheetByName(SHEET_NAMES.MONTHLY_SUMMARY);
  const lastRow = summary.getLastRow();
  if (lastRow < 2) return [];

  const values = summary.getRange(2, 2, lastRow - 1, 5).getValues();
  return values
    .filter((row) => row[0])
    .map((row) => ({
      category: row[0],
      budget: row[2],
      spent: row[3],
      remaining: row[4],
    }));
}

/**
 * Active categories for iPhone app / LLM parsing.
 * @returns {Array<{name: string, group: string, monthlyBudget: number, color: string}>}
 */
function getCategories() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  return values
    .filter((row) => row[0] && isActive_(row[4]))
    .map((row) => ({
      name: String(row[0]),
      group: String(row[1]),
      monthlyBudget: Number(row[2]) || 0,
      color: String(row[3] || ''),
    }));
}

function isActive_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function getCategoryNames_() {
  return getCategories().map((c) => c.name);
}

function showBalances() {
  const balances = getBalances();
  const lines = balances.map(
    (b) => `${b.category}: $${b.spent.toFixed(2)} / $${b.budget.toFixed(2)} (${b.remaining >= 0 ? '+' : ''}$${b.remaining.toFixed(2)})`
  );
  SpreadsheetApp.getUi().alert(lines.join('\n') || 'No data yet.');
}

function applyBudgetGuide_(incomeAmount) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const guide = ss.getSheetByName(SHEET_NAMES.BUDGET_GUIDE);
  const lastRow = guide.getLastRow();
  if (lastRow < 2) return;

  const rules = guide.getRange(2, 1, lastRow - 1, 3).getValues();
  const recs = [];

  rules.forEach((row) => {
    const [category, ruleType, value] = row;
    if (!category) return;
    let amount = 0;
    if (ruleType === 'Fixed') {
      amount = Number(value);
    } else if (ruleType === 'Percent') {
      amount = (Number(value) / 100) * incomeAmount;
    }
    recs.push(`${category}: $${amount.toFixed(2)}`);
  });

  const incomeSheet = ss.getSheetByName(SHEET_NAMES.INCOME);
  const lastIncomeRow = incomeSheet.getLastRow();
  const existing = incomeSheet.getRange(lastIncomeRow, 4).getValue();
  incomeSheet
    .getRange(lastIncomeRow, 4)
    .setValue((existing ? existing + '\n' : '') + 'Allocation guide:\n' + recs.join('\n'));
}

function validateTransaction_(data) {
  if (!data.date || data.amount == null) {
    throw new Error('Transaction requires date and amount');
  }
  if (!data.splits || data.splits.length === 0) {
    throw new Error('Transaction requires at least one category split');
  }

  const allowed = getCategoryNames_();
  data.splits.forEach((split) => {
    if (!allowed.includes(split.category)) {
      throw new Error(
        'Unknown category "' + split.category + '". Must match Categories tab exactly.'
      );
    }
  });
}

// --- Web app endpoints (iPhone app) ---

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    verifyToken_(payload);
    const action = payload.action;

    if (action === 'addTransaction') {
      const result = addTransaction(payload.data);
      return jsonResponse_(result);
    }
    if (action === 'addIncome') {
      const result = addIncome(payload.data);
      return jsonResponse_(result);
    }
    if (action === 'getBalances') {
      return jsonResponse_({ balances: getBalances() });
    }
    if (action === 'getCategories') {
      return jsonResponse_({ categories: getCategories() });
    }

    return jsonResponse_({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

function doGet(e) {
  // Health check only — no token required
  return jsonResponse_({ status: 'ok', app: 'Budget-Flow', version: '1.0' });
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
  const result = doPost(mock).getContent();
  SpreadsheetApp.getUi().alert('getCategories response:\n\n' + result);
}

function jsonResponse_(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
