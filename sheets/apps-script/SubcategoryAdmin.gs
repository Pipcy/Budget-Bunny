/**
 * Budget-Bunny — subcategory management + retroactive reclassification
 *
 * Voice flow (iPhone + user's Chat API key):
 *   1. Parse intent → addSubcategory
 *   2. searchTransactions → candidate rows
 *   3. LLM on phone picks matches from merchant/notes
 *   4. User confirms → bulkReclassifySplits
 */

function addSubcategory(data) {
  if (!data.parentCategory || !data.subcategory) {
    throw new Error('parentCategory and subcategory are required');
  }

  const parent = String(data.parentCategory);
  const name = String(data.subcategory);
  const mainNames = getMainCategories_().map((c) => c.name);

  if (!mainNames.includes(parent)) {
    throw new Error('Unknown parent category "' + parent + '". Check Categories tab.');
  }

  const exists = getSubcategoryRows_().some(
    (s) => s.name === name && s.parentCategory === parent
  );
  if (exists) {
    return { success: true, created: false, subcategory: name, parentCategory: parent };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName(SHEET_NAMES.SUBCATEGORIES).appendRow([name, parent, 'TRUE']);

  if (data.monthlyBudget != null && Number(data.monthlyBudget) > 0) {
    ss.getSheetByName(SHEET_NAMES.BUDGET_GUIDE).appendRow([
      name,
      'Sub',
      'Monthly',
      Number(data.monthlyBudget),
      99,
      'Added via app',
    ]);
  }

  return { success: true, created: true, subcategory: name, parentCategory: parent };
}

/**
 * Find past splits that could move to a new subcategory.
 * @param {Object} data
 * @param {string} [data.mainCategory] - limit to one main category
 * @param {string[]} [data.keywords] - match merchant/notes (OR logic, case-insensitive)
 * @param {boolean} [data.missingSubcategoryOnly] - only rows with empty subcategory
 */
function searchTransactions(data) {
  data = data || {};
  const mainCategory = data.mainCategory ? String(data.mainCategory) : null;
  const keywords = (data.keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const missingSubOnly = data.missingSubcategoryOnly === true;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureAllSchemas_(ss);
  const txMap = buildTransactionMap_();
  const splitSheet = ss.getSheetByName(SHEET_NAMES.SPLITS);
  const lastRow = splitSheet.getLastRow();
  const results = [];

  for (let i = 2; i <= lastRow; i++) {
    const row = readSplitRow_(splitSheet, i);
    if (!row.transactionId) continue;

    if (mainCategory && row.mainCategory !== mainCategory) continue;
    if (missingSubOnly && row.subcategory) continue;

    const tx = txMap[row.transactionId] || {};
    const merchant = row.merchant || tx.merchant || '';
    const haystack = (merchant + ' ' + (tx.notes || '')).toLowerCase();

    if (keywords.length && !keywords.some((k) => haystack.indexOf(k) !== -1)) continue;

    results.push({
      transactionId: row.transactionId,
      splitRow: i,
      date: formatDate_(row.transactionTime || tx.transactionTime),
      merchant: merchant,
      notes: tx.notes || '',
      mainCategory: row.mainCategory,
      subcategory: row.subcategory || '',
      amount: row.amount,
    });
  }

  return { transactions: results, count: results.length };
}

/**
 * Apply subcategory to existing split rows (after user confirms on phone).
 * @param {Object} data
 * @param {Array<{transactionId: string, mainCategory: string, subcategory: string}>} data.updates
 */
function bulkReclassifySplits(data) {
  const updates = data.updates || [];
  if (!updates.length) {
    throw new Error('updates array is required');
  }

  const subMap = getSubcategoryMap_();
  const splitSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPLITS);
  let updatedCount = 0;

  updates.forEach((u) => {
    const main = String(u.mainCategory);
    const sub = String(u.subcategory);
    const txId = String(u.transactionId);

    const allowed = subMap[main] || [];
    if (!allowed.includes(sub)) {
      throw new Error(
        'Unknown subcategory "' + sub + '" under "' + main + '". Add it first with addSubcategory.'
      );
    }

    const rows = findSplitRows_(txId, main);
    if (!rows.length) {
      throw new Error('No split found for transaction ' + txId + ' under ' + main);
    }

    rows.forEach((rowNum) => {
      splitSheet.getRange(rowNum, 3).setValue(sub);
      updatedCount++;
    });
  });

  return { success: true, updatedCount: updatedCount };
}

/**
 * Convenience: keyword search + bulk update in one call (no LLM).
 * For smart matching, use searchTransactions + LLM on iPhone + bulkReclassifySplits.
 */
function reclassifyByKeywords(data) {
  if (!data.parentCategory || !data.subcategory || !data.keywords || !data.keywords.length) {
    throw new Error('parentCategory, subcategory, and keywords are required');
  }

  addSubcategory({
    parentCategory: data.parentCategory,
    subcategory: data.subcategory,
    monthlyBudget: data.monthlyBudget,
  });

  const search = searchTransactions({
    mainCategory: data.parentCategory,
    keywords: data.keywords,
    missingSubcategoryOnly: data.missingSubcategoryOnly !== false,
  });

  const updates = search.transactions.map((t) => ({
    transactionId: t.transactionId,
    mainCategory: t.mainCategory,
    subcategory: data.subcategory,
  }));

  if (!updates.length) {
    return {
      success: true,
      subcategory: data.subcategory,
      parentCategory: data.parentCategory,
      updatedCount: 0,
      matchedCount: 0,
    };
  }

  const result = bulkReclassifySplits({ updates: updates });
  return {
    success: true,
    subcategory: data.subcategory,
    parentCategory: data.parentCategory,
    matchedCount: search.count,
    updatedCount: result.updatedCount,
  };
}

function buildTransactionMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const txData = txSheet.getDataRange().getValues();
  const headers = txData[0] ? txData[0].map(String) : [];
  const map = {};

  for (let i = 1; i < txData.length; i++) {
    const row = txData[i];
    const byName = {};
    headers.forEach((h, idx) => {
      byName[h] = row[idx];
    });

    const transactionTime = byName['Transaction Time'] || byName['Date'] || row[1];
    const logTime = byName['Log Time'] || transactionTime;
    const merchant = byName['Merchant'] || row[3] || row[2];
    const notes = byName['Notes'] || row[6] || row[5];

    map[row[0]] = {
      transactionTime: transactionTime,
      logTime: logTime,
      date: transactionTime,
      merchant: merchant,
      notes: notes,
    };
  }
  return map;
}

function findSplitRows_(transactionId, mainCategory) {
  const splitSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPLITS);
  const splitData = splitSheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < splitData.length; i++) {
    if (splitData[i][0] === transactionId && splitData[i][1] === mainCategory) {
      rows.push(i + 1);
    }
  }
  return rows;
}

