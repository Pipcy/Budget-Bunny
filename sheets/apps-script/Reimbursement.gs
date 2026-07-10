/**
 * Budget-Bunny — reimbursement tracking on splits
 * Status: blank (normal) | Pending payment (counts) | Paid (excluded from spent)
 */

const REIMBURSEMENT_STATUSES = ['Pending payment', 'Paid'];

function reimbursementStatusForSplit_(split) {
  if (split.reimbursementStatus) {
    return String(split.reimbursementStatus);
  }
  if (split.excludeFromSummary) {
    return 'Paid';
  }
  return '';
}

function reimbursementValidation_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(REIMBURSEMENT_STATUSES, true)
    .setAllowInvalid(false)
    .build();
}

function searchPendingReimbursements(data) {
  data = data || {};
  const rows = findPendingReimbursementRows_(data);
  return { reimbursements: rows, count: rows.length };
}

function markReimbursementPaid(data) {
  data = data || {};
  const matches = findPendingReimbursementRows_(data);

  if (!matches.length) {
    throw new Error(
      'No pending reimbursement splits found. ' +
        'Try merchant name (e.g. Home Depot), amount, or keywords from the original expense.'
    );
  }

  if (matches.length > 1 && !data.allowMultiple) {
    throw new Error(
      'Multiple pending reimbursements match (' +
        matches.length +
        '). Set allowMultiple:true or narrow merchant/amount/date.'
    );
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureAllSchemas_(ss);
  const splitSheet = ss.getSheetByName(SHEET_NAMES.SPLITS);

  matches.forEach((m) => {
    splitSheet.getRange(m.splitRow, SPLIT_COL.REIMBURSE).setValue('Paid');
  });

  return {
    success: true,
    updatedCount: matches.length,
    marked: matches.map((m) => ({
      transactionId: m.transactionId,
      merchant: m.merchant,
      amount: m.amount,
      splitRow: m.splitRow,
    })),
  };
}

function findPendingReimbursementRows_(filters) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureAllSchemas_(ss);
  const splitSheet = ss.getSheetByName(SHEET_NAMES.SPLITS);
  const txMap = buildTransactionMap_();
  const lastRow = splitSheet.getLastRow();
  const results = [];

  for (let i = 2; i <= lastRow; i++) {
    const row = readSplitRow_(splitSheet, i);
    if (row.reimbursementStatus !== 'Pending payment') continue;

    const tx = txMap[row.transactionId] || {};
    const merchant = row.merchant || tx.merchant || '';
    const splitNotes = row.notes || '';
    const haystack = (
      merchant +
      ' ' +
      splitNotes +
      ' ' +
      (tx.notes || '') +
      ' ' +
      row.mainCategory +
      ' ' +
      row.subcategory
    ).toLowerCase();

    if (filters.amount != null && Math.abs(row.amount - Number(filters.amount)) > 0.01) continue;
    if (filters.merchant && !isGenericMerchant_(filters.merchant) && !merchantMatches_(merchant, filters.merchant)) {
      continue;
    }
    if (filters.transactionId && String(row.transactionId) !== String(filters.transactionId)) continue;
    if (filters.mainCategory && row.mainCategory !== filters.mainCategory) continue;
    if (filters.date && formatDate_(row.transactionTime || tx.transactionTime) !== filters.date) continue;
    if (filters.payerName) {
      const payerHaystack = (tx.notes || '') + ' ' + splitNotes;
      if (!textMatches_(payerHaystack, filters.payerName)) continue;
    }
    if (filters.keywords && filters.keywords.length) {
      if (!filters.keywords.some((k) => haystack.indexOf(String(k).toLowerCase()) !== -1)) continue;
    }

    results.push({
      transactionId: row.transactionId,
      splitRow: i,
      date: formatDate_(row.transactionTime || tx.transactionTime),
      merchant: merchant,
      notes: splitNotes || tx.notes || '',
      mainCategory: row.mainCategory,
      subcategory: row.subcategory || '',
      amount: row.amount,
    });
  }

  return results;
}

function merchantMatches_(merchant, needle) {
  const m = String(merchant || '').toLowerCase().trim();
  const n = String(needle || '').toLowerCase().trim();
  if (!m || !n) return false;
  return m.indexOf(n) !== -1 || n.indexOf(m) !== -1;
}

function textMatches_(text, needle) {
  return String(text || '').toLowerCase().indexOf(String(needle || '').toLowerCase()) !== -1;
}
