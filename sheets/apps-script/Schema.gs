/**
 * Column layout + safe migration for existing workbooks
 */

const TX_COL = { ID: 1, TX_TIME: 2, LOG_TIME: 3, MERCHANT: 4, AMOUNT: 5, PAYMENT: 6, NOTES: 7, RECEIPT: 8, SOURCE: 9 };
const SPLIT_COL = { TX_ID: 1, MAIN: 2, SUB: 3, MERCHANT: 4, AMOUNT: 5, REIMBURSE: 6, NOTES: 7, TX_TIME: 8, LOG_TIME: 9 };
const NOT_SPECIFIED_MERCHANT = 'Not specified';

function ensureAllSchemas_(ss) {
  ensureTransactionsSchema_(ss);
  ensureSplitsSchema_(ss);
  ensureCategoryContextSchemas_(ss);
  ensureOtherCategory_(ss);
}

/** Adds Context columns on Categories / Subcategories if missing. */
function ensureCategoryContextSchemas_(ss) {
  const catSheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
  if (catSheet) {
    const headers = headerRow_(catSheet);
    if (headers.indexOf('Context') === -1) {
      // Prefer before Active: Category | Group | Color | Context | Active
      const activeIdx = headers.indexOf('Active');
      if (activeIdx >= 0) {
        catSheet.insertColumnBefore(activeIdx + 1);
        catSheet.getRange(1, activeIdx + 1).setValue('Context');
      } else {
        const col = Math.max(headers.length, 1) + 1;
        catSheet.getRange(1, col).setValue('Context');
      }
    }
  }

  const subSheet = ss.getSheetByName(SHEET_NAMES.SUBCATEGORIES);
  if (subSheet) {
    const headers = headerRow_(subSheet);
    if (headers.indexOf('Context') === -1) {
      // Prefer before Active: Subcategory | Parent Category | Context | Active
      const activeIdx = headers.indexOf('Active');
      if (activeIdx >= 0) {
        subSheet.insertColumnBefore(activeIdx + 1);
        subSheet.getRange(1, activeIdx + 1).setValue('Context');
      } else {
        const col = Math.max(headers.length, 1) + 1;
        subSheet.getRange(1, col).setValue('Context');
      }
    }
  }
}

/** Ensures an "Other" catch-all main category exists (for LLM fallback). */
function ensureOtherCategory_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
  if (!sheet) return;

  ensureCategoryContextSchemas_(ss);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow(['Other', 'Needs', '#9E9E9E', 'Catch-all when category is unclear', 'TRUE']);
    return;
  }

  const names = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map((row) => String(row[0] || '').trim());
  if (names.includes('Other')) return;

  sheet.appendRow(['Other', 'Needs', '#9E9E9E', 'Catch-all when category is unclear', 'TRUE']);
}

function headerRow_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h || '').trim());
}

function ensureTransactionsSchema_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  if (!sheet) return;

  const headers = headerRow_(sheet);
  if (headers[1] === 'Transaction Time') return;

  if (headers[1] === 'Date') {
    sheet.getRange(1, 2).setValue('Transaction Time');
    sheet.insertColumnAfter(2);
    sheet.getRange(1, 3).setValue('Log Time');
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      for (let r = 2; r <= lastRow; r++) {
        const txTime = sheet.getRange(r, 2).getValue();
        sheet.getRange(r, 3).setValue(txTime || now_());
      }
    }
    return;
  }

  sheet.getRange(1, 1, 1, TRANSACTION_HEADERS.length).setValues([TRANSACTION_HEADERS]);
}

function ensureSplitsSchema_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SPLITS);
  if (!sheet) return;

  let headers = headerRow_(sheet);
  const txSheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const txMap = buildTransactionMap_();

  if (headers[3] === 'Merchant' && headers[6] === 'Notes' && headers[7] === 'Transaction Time') {
    const rows = Math.max(sheet.getLastRow() - 1, 1);
    sheet.getRange(2, SPLIT_COL.REIMBURSE, rows, 1).setDataValidation(reimbursementValidation_());
    return;
  }

  if (headers[3] === 'Merchant' && headers[6] === 'Transaction Time' && headers.indexOf('Notes') === -1) {
    sheet.insertColumnAfter(6);
    sheet.getRange(1, 7).setValue('Notes');
    headers = headerRow_(sheet);
  }

  if (headers[3] === 'Amount' && headers.indexOf('Merchant') === -1) {
    sheet.insertColumnAfter(3);
    sheet.getRange(1, 4).setValue('Merchant');
    headers = headerRow_(sheet);
  }

  if (headers[4] === 'Exclude From Summary') {
    sheet.getRange(1, 5).setValue('Reimbursement Status');
    migrateExcludeColumn_(sheet);
    headers = headerRow_(sheet);
  } else if (headers[4] !== 'Reimbursement Status' && headers[3] === 'Merchant') {
    sheet.getRange(1, 6).setValue('Reimbursement Status');
  }

  headers = headerRow_(sheet);
  if (headers.indexOf('Transaction Time') === -1) {
    sheet.insertColumnAfter(6);
    sheet.getRange(1, 7).setValue('Transaction Time');
    sheet.insertColumnAfter(7);
    sheet.getRange(1, 8).setValue('Log Time');
  }

  sheet.getRange(1, 1, 1, SPLIT_HEADERS.length).setValues([SPLIT_HEADERS]);

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    for (let r = 2; r <= lastRow; r++) {
      const txId = sheet.getRange(r, SPLIT_COL.TX_ID).getValue();
      const tx = txMap[txId] || {};
      if (!sheet.getRange(r, SPLIT_COL.MERCHANT).getValue() && tx.merchant) {
        sheet.getRange(r, SPLIT_COL.MERCHANT).setValue(tx.merchant);
      }
      if (!sheet.getRange(r, SPLIT_COL.TX_TIME).getValue() && tx.transactionTime) {
        sheet.getRange(r, SPLIT_COL.TX_TIME).setValue(tx.transactionTime);
      }
      if (!sheet.getRange(r, SPLIT_COL.LOG_TIME).getValue()) {
        sheet.getRange(r, SPLIT_COL.LOG_TIME).setValue(tx.logTime || tx.transactionTime || now_());
      }
      if (!sheet.getRange(r, SPLIT_COL.NOTES).getValue() && tx.notes) {
        sheet.getRange(r, SPLIT_COL.NOTES).setValue(tx.notes);
      }
    }
  }

  const rows = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, SPLIT_COL.REIMBURSE, rows, 1).setDataValidation(reimbursementValidation_());
}

function migrateExcludeColumn_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (let r = 2; r <= lastRow; r++) {
    const v = sheet.getRange(r, 5).getValue();
    if (v === true || String(v).toUpperCase() === 'TRUE') {
      sheet.getRange(r, 5).setValue('Paid');
    } else {
      sheet.getRange(r, 5).setValue('');
    }
  }
}

function readSplitRow_(sheet, row) {
  return {
    transactionId: sheet.getRange(row, SPLIT_COL.TX_ID).getValue(),
    mainCategory: sheet.getRange(row, SPLIT_COL.MAIN).getValue(),
    subcategory: sheet.getRange(row, SPLIT_COL.SUB).getValue(),
    merchant: sheet.getRange(row, SPLIT_COL.MERCHANT).getValue(),
    amount: Number(sheet.getRange(row, SPLIT_COL.AMOUNT).getValue()) || 0,
    reimbursementStatus: String(sheet.getRange(row, SPLIT_COL.REIMBURSE).getValue() || ''),
    notes: String(sheet.getRange(row, SPLIT_COL.NOTES).getValue() || ''),
    transactionTime: sheet.getRange(row, SPLIT_COL.TX_TIME).getValue(),
    logTime: sheet.getRange(row, SPLIT_COL.LOG_TIME).getValue(),
    splitRow: row,
  };
}

function normalizeMerchant_(merchant) {
  const m = String(merchant || '').trim();
  if (!m || isGenericMerchant_(m)) {
    return NOT_SPECIFIED_MERCHANT;
  }
  return m;
}

function isGenericMerchant_(merchant) {
  const m = String(merchant || '').toLowerCase().trim();
  if (!m || m === 'not specified' || m === 'unspecified' || m === 'unknown') return true;
  const generic = [
    'food',
    'meal',
    'meals',
    'lunch',
    'dinner',
    'breakfast',
    'dining',
    'groceries',
    'grocery',
    'shopping',
    'transport',
    'gas',
    'coffee',
    'cafe',
    'restaurant',
    'drinks',
    'snacks',
    'entertainment',
    'utilities',
    'other',
  ];
  return generic.indexOf(m) !== -1;
}
