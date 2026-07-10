/**
 * Budget-Bunny — transaction and income API
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

function addIncome(data) {
  return addIncome_(data);
}

function addIncome_(data) {
  if (data.amount == null) {
    throw new Error('Income requires amount');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureAllSchemas_(ss);
  const sheet = ss.getSheetByName(SHEET_NAMES.INCOME);

  const logTime = now_();
  const transactionTime = resolveTransactionTime_(data, logTime);

  sheet.appendRow([
    transactionTime,
    logTime,
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

function getBalances() {
  return {
    main: readSummarySheet_(SHEET_NAMES.MONTHLY_SUMMARY, 'main'),
    sub: readSummarySheet_(SHEET_NAMES.SUBCATEGORY_SUMMARY, 'sub'),
  };
}

function readSummarySheet_(sheetName, level) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = ss.getSheetByName(sheetName);
  const lastRow = summary.getLastRow();
  if (lastRow < 2) return [];

  const values = summary.getRange(2, 2, lastRow - 1, 5).getValues();
  return values
    .filter((row) => row[0])
    .map((row) => {
      if (level === 'sub') {
        return {
          subcategory: row[0],
          parentCategory: row[1],
          budget: row[2],
          spent: row[3],
          remaining: row[4],
        };
      }
      return {
        category: row[0],
        group: row[1],
        budget: row[2],
        spent: row[3],
        remaining: row[4],
      };
    });
}

function getCategories() {
  const mains = getMainCategories_();
  const subs = getSubcategoryRows_();

  return mains.map((main) => ({
    name: main.name,
    group: main.group,
    color: main.color,
    subcategories: subs
      .filter((s) => s.parentCategory === main.name)
      .map((s) => s.name),
  }));
}

function getMainCategories_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, 4)
    .getValues()
    .filter((row) => row[0] && isActive_(row[3]))
    .map((row) => ({
      name: String(row[0]),
      group: String(row[1]),
      color: String(row[2] || ''),
    }));
}

function getSubcategoryRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SUBCATEGORIES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, 3)
    .getValues()
    .filter((row) => row[0] && isActive_(row[2]))
    .map((row) => ({
      name: String(row[0]),
      parentCategory: String(row[1]),
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

function isActive_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function showBalances() {
  const { main, sub } = getBalances();
  const mainLines = main.map(
    (b) =>
      `[Main] ${b.category}: $${b.spent.toFixed(2)} / $${b.budget.toFixed(2)} (${b.remaining >= 0 ? '+' : ''}$${b.remaining.toFixed(2)})`
  );
  const subLines = sub
    .filter((b) => b.budget > 0 || b.spent > 0)
    .map(
      (b) =>
        `[Sub] ${b.subcategory} (${b.parentCategory}): $${b.spent.toFixed(2)} / $${b.budget.toFixed(2)}`
    );
  const lines = mainLines.concat(subLines);
  SpreadsheetApp.getUi().alert(lines.join('\n') || 'No data yet.');
}

function applyBudgetGuide_(incomeAmount) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const guide = ss.getSheetByName(SHEET_NAMES.BUDGET_GUIDE);
  const lastRow = guide.getLastRow();
  if (lastRow < 2) return;

  const rules = guide.getRange(2, 1, lastRow - 1, 4).getValues();
  const recs = [];

  rules.forEach((row) => {
    const [budgetFor, forType, ruleType, value] = row;
    if (!budgetFor || !ruleType) return;
    if (ruleType !== 'Income Fixed' && ruleType !== 'Income Percent') return;

    let amount = 0;
    if (ruleType === 'Income Fixed') {
      amount = Number(value);
    } else if (ruleType === 'Income Percent') {
      amount = (Number(value) / 100) * incomeAmount;
    }
    recs.push(`${forType} · ${budgetFor}: $${amount.toFixed(2)}`);
  });

  recs.sort();

  const incomeSheet = ss.getSheetByName(SHEET_NAMES.INCOME);
  const lastIncomeRow = incomeSheet.getLastRow();
  const existing = incomeSheet.getRange(lastIncomeRow, 4).getValue();
  incomeSheet
    .getRange(lastIncomeRow, 4)
    .setValue((existing ? existing + '\n' : '') + 'Income allocation:\n' + recs.join('\n'));
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
    if (action === 'addIncome') {
      return jsonResponse_(addIncome(payload.data));
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
  return jsonResponse_({ status: 'ok', app: 'Budget-Bunny', version: '1.4' });
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
