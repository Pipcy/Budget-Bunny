/**
 * Budget-Bunny — workbook setup
 * Run setupWorkbook() once from the Apps Script editor.
 *
 * Schema:
 *   Categories / Subcategories — taxonomy (+ Context for LLM)
 *   Transactions / Splits      — payments and category splits
 *   Ledger                     — auto flat view from Splits
 *   MonthlySummary             — spent per main category from Splits
 *   Dashboard / Settings
 */

const SHEET_NAMES = {
  CATEGORIES: 'Categories',
  SUBCATEGORIES: 'Subcategories',
  TRANSACTIONS: 'Transactions',
  SPLITS: 'Splits',
  LEDGER: 'Ledger',
  MONTHLY_SUMMARY: 'MonthlySummary',
  DASHBOARD: 'Dashboard',
  SETTINGS: 'Settings',
};

/** Removed tabs — deleted on setup / refresh if still present. */
const OBSOLETE_SHEET_NAMES = ['Income', 'BudgetGuide', 'SubcategorySummary'];

const MAX_CATEGORY_ROWS = 30;

const CATEGORY_HEADERS = ['Category', 'Group', 'Color', 'Context', 'Active'];
const SUBCATEGORY_HEADERS = ['Subcategory', 'Parent Category', 'Context', 'Active'];
const TRANSACTION_HEADERS = [
  'ID',
  'Transaction Time',
  'Log Time',
  'Merchant',
  'Total Amount',
  'Payment Method',
  'Notes',
  'Receipt URL',
  'Source',
];
const SPLIT_HEADERS = [
  'Transaction ID',
  'Main Category',
  'Subcategory',
  'Merchant',
  'Amount',
  'Reimbursement Status',
  'Notes',
  'Transaction Time',
  'Log Time',
];
const LEDGER_HEADERS = [
  'Transaction Time',
  'Log Time',
  'Main Category',
  'Subcategory',
  'Merchant',
  'Amount',
  'Reimbursement Status',
  'Notes',
  'Payment Method',
  'Source',
];
const MONTHLY_SUMMARY_HEADERS = ['Month', 'Main Category', 'Group', 'Spent'];

const DEFAULT_CATEGORIES = [
  ['Rent', 'Needs', '#4A90D9', 'Housing / rent payments', 'TRUE'],
  ['Groceries', 'Needs', '#50C878', 'Food bought to cook at home', 'TRUE'],
  ['Utilities', 'Needs', '#F5A623', 'Bills and household appliances / tools (vacuum, lightbulbs, etc.)', 'TRUE'],
  ['Transport', 'Needs', '#9B59B6', 'Getting around: gas, transit, rideshare, parking', 'TRUE'],
  ['Dining', 'Wants', '#E74C3C', 'Eating out, coffee shops, takeout', 'TRUE'],
  ['Entertainment', 'Wants', '#E91E63', 'Movies, games, hobbies, streaming', 'TRUE'],
  ['Shopping', 'Wants', '#FF9800', 'Clothes, gadgets, non-grocery retail', 'TRUE'],
  ['Emergency Fund', 'Savings', '#607D8B', 'Transfers into emergency savings', 'TRUE'],
  ['Investments', 'Savings', '#795548', 'Brokerage / long-term investing', 'TRUE'],
  ['Other', 'Needs', '#9E9E9E', 'Catch-all when category is unclear', 'TRUE'],
];

const DEFAULT_SUBCATEGORIES = [
  ['Costco', 'Groceries', 'Costco / warehouse club grocery runs', 'TRUE'],
  ['Trader Joes', 'Groceries', 'Trader Joes grocery runs', 'TRUE'],
  ['Restaurants', 'Dining', 'Sit-down or takeout meals', 'TRUE'],
  ['Coffee', 'Dining', 'Coffee shops and cafe drinks', 'TRUE'],
  ['Rideshare', 'Transport', 'Uber, Lyft, taxis', 'TRUE'],
];

function setupWorkbook() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  deleteObsoleteSheets_(ss);
  recreateNamedSheets_(ss);

  setupCategories_(ss);
  setupSubcategories_(ss);
  setupTransactions_(ss);
  setupSplits_(ss);
  setupLedger_(ss);
  setupMonthlySummary_(ss);
  setupDashboard_(ss);
  setupSettings_(ss);

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > Object.keys(SHEET_NAMES).length) {
    ss.deleteSheet(defaultSheet);
  }

  ss.setActiveSheet(ss.getSheetByName(SHEET_NAMES.DASHBOARD));
  SpreadsheetApp.getUi().alert(
    'Budget-Bunny setup complete!\n\n' +
      '1. Edit Categories and Subcategories (Context helps the LLM)\n' +
      '2. Pick month on Dashboard\n' +
      '3. Optional: Add sample data'
  );
}

function deleteObsoleteSheets_(ss) {
  OBSOLETE_SHEET_NAMES.forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (sheet && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });
}

/**
 * Delete + recreate tabs so Google "typed column" / Table metadata does not block setup.
 */
function recreateNamedSheets_(ss) {
  const placeholder = ss.insertSheet('_bb_setup_tmp');

  Object.values(SHEET_NAMES).forEach((name) => {
    const existing = ss.getSheetByName(name);
    if (existing) ss.deleteSheet(existing);
    ss.insertSheet(name);
  });

  ss.deleteSheet(placeholder);
}

function setupCategories_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
  sheet.getRange(1, 1, 1, CATEGORY_HEADERS.length).setValues([CATEGORY_HEADERS]);
  sheet.getRange(2, 1, DEFAULT_CATEGORIES.length, CATEGORY_HEADERS.length).setValues(
    DEFAULT_CATEGORIES
  );
  sheet.setFrozenRows(1);
  formatHeaderRow_(sheet, CATEGORY_HEADERS.length);
  sheet.setColumnWidths(1, 4, 120);
}

function setupSubcategories_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SUBCATEGORIES);
  sheet.getRange(1, 1, 1, SUBCATEGORY_HEADERS.length).setValues([SUBCATEGORY_HEADERS]);
  sheet.getRange(2, 1, DEFAULT_SUBCATEGORIES.length, SUBCATEGORY_HEADERS.length).setValues(
    DEFAULT_SUBCATEGORIES
  );
  sheet.setFrozenRows(1);
  formatHeaderRow_(sheet, SUBCATEGORY_HEADERS.length);
  sheet.setColumnWidths(1, 3, 140);
}

function setupTransactions_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  sheet.getRange(1, 1, 1, TRANSACTION_HEADERS.length).setValues([TRANSACTION_HEADERS]);
  sheet.setFrozenRows(1);
  setNumberFormatSafe_(sheet.getRange('B2:C'), 'yyyy-mm-dd hh:mm:ss');
  setNumberFormatSafe_(sheet.getRange('E2:E'), '$#,##0.00');
  formatHeaderRow_(sheet, TRANSACTION_HEADERS.length);
}

function setupSplits_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SPLITS);
  sheet.getRange(1, 1, 1, SPLIT_HEADERS.length).setValues([SPLIT_HEADERS]);
  sheet.setFrozenRows(1);
  setNumberFormatSafe_(sheet.getRange('E2:E'), '$#,##0.00');
  setNumberFormatSafe_(sheet.getRange('H2:I'), 'yyyy-mm-dd hh:mm:ss');
  sheet.getRange('F2:F').setDataValidation(reimbursementValidation_());
  formatHeaderRow_(sheet, SPLIT_HEADERS.length);
}

function setupLedger_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.LEDGER);
  sheet.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
  sheet.setFrozenRows(1);

  sheet.getRange('A2').setFormula(ledgerFormula_());

  setNumberFormatSafe_(sheet.getRange('A2:B'), 'yyyy-mm-dd hh:mm:ss');
  setNumberFormatSafe_(sheet.getRange('F2:F'), '$#,##0.00');
  formatHeaderRow_(sheet, LEDGER_HEADERS.length);
}

/** Splits amount: E=Amount, H=Transaction Time, B=Main Category */
function monthSpentFromSplitsFormula_(catRef) {
  return (
    `=IF(${catRef}="","",SUMPRODUCT((TRIM(Splits!B$2:B$5000)=TRIM(${catRef}))*(TEXT(Splits!H$2:H$5000,"yyyy-mm")=TEXT(Dashboard!$B$3,"yyyy-mm"))*(Splits!E$2:E$5000)))`
  );
}

function ledgerFormula_() {
  return (
    '=ARRAYFORMULA(IF(LEN(Splits!A2:A)=0,,{' +
    'Splits!H2:H,' +
    'Splits!I2:I,' +
    'Splits!B2:B,' +
    'Splits!C2:C,' +
    'Splits!D2:D,' +
    'Splits!E2:E,' +
    'IF(LEN(Splits!F2:F)=0,"",Splits!F2:F),' +
    'Splits!G2:G,' +
    'VLOOKUP(Splits!A2:A,Transactions!A:F,6,FALSE),' +
    'VLOOKUP(Splits!A2:A,Transactions!A:I,9,FALSE)' +
    '}))'
  );
}

/**
 * Refreshes report formulas without clearing transaction data.
 * Run from Budget-Bunny menu if MonthlySummary Spent stays 0.
 */
function refreshReportFormulas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureAllSchemas_(ss);
  deleteObsoleteSheets_(ss);

  const ledger = ss.getSheetByName(SHEET_NAMES.LEDGER);
  if (ledger) {
    ledger.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
    ledger.getRange('A2').setFormula(ledgerFormula_());
    formatHeaderRow_(ledger, LEDGER_HEADERS.length);
  }

  setupMonthlySummary_(ss);
  applyDashboardFormulas_(ss);

  SpreadsheetApp.getUi().alert(
    'Report formulas refreshed.\n\nCheck MonthlySummary column D (Spent) and Dashboard B5.'
  );
}

function applyMonthlySummaryFormulas_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.MONTHLY_SUMMARY);
  if (!sheet) return;

  const formulas = [];
  for (let i = 0; i < MAX_CATEGORY_ROWS; i++) {
    const row = i + 2;
    const catRef = `Categories!A${row}`;
    formulas.push([
      `=IF(${catRef}="","",Dashboard!$B$3)`,
      `=IF(${catRef}="","",${catRef})`,
      `=IF(${catRef}="","",IFERROR(VLOOKUP(${catRef},Categories!A:B,2,FALSE),""))`,
      monthSpentFromSplitsFormula_(catRef),
    ]);
  }

  sheet.getRange(2, 1, MAX_CATEGORY_ROWS, MONTHLY_SUMMARY_HEADERS.length).setFormulas(formulas);
}

function applyDashboardFormulas_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) return;

  sheet.getRange('B5').setFormula(
    '=SUMPRODUCT((TEXT(Splits!H$2:H$5000,"yyyy-mm")=TEXT(B3,"yyyy-mm"))*(Splits!E$2:E$5000))'
  );
}

function setupMonthlySummary_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.MONTHLY_SUMMARY);
  sheet.clear();
  sheet.getRange(1, 1, 1, MONTHLY_SUMMARY_HEADERS.length).setValues([MONTHLY_SUMMARY_HEADERS]);
  sheet.setFrozenRows(1);
  applyMonthlySummaryFormulas_(ss);
  setNumberFormatSafe_(sheet.getRange('D2:D' + (MAX_CATEGORY_ROWS + 1)), '$#,##0.00');
  formatHeaderRow_(sheet, MONTHLY_SUMMARY_HEADERS.length);
  sheet.setColumnWidths(1, 4, 140);
}

function setupDashboard_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  sheet.clear();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  sheet.getRange('A1').setValue('Budget-Bunny Dashboard').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A3').setValue('Selected month (YYYY-MM):');
  sheet.getRange('B3').setValue(now);
  sheet.getRange('B3').setBackground('#FFF9C4');

  sheet.getRange('A5').setValue('Total spent this month:');
  applyDashboardFormulas_(ss);

  sheet.getRange('A7').setValue('Reports →');
  sheet.getRange('B7').setValue('MonthlySummary (spent by main category from Splits)');

  setNumberFormatSafe_(sheet.getRange('B5'), '$#,##0.00');
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 360);
}

function setupSettings_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  sheet.getRange('A1').setValue('Budget-Bunny Settings').setFontSize(14).setFontWeight('bold');
  sheet.getRange('A3').setValue('Web app URL (paste after deploy):');
  sheet.getRange('A4').setValue('API token (from menu → Generate API token):');
  sheet.getRange('A6').setValue('Deploy steps:');
  sheet.getRange('A7').setValue('1. Apps Script → Deploy → New deployment → Web app');
  sheet.getRange('A8').setValue('2. Execute as: Me | Who has access: Anyone');
  sheet.getRange('A9').setValue('3. Paste /exec URL into B3 above');
  sheet.getRange('A10').setValue('4. Budget-Bunny menu → Generate API token → paste in iPhone app');
  sheet.setColumnWidth(1, 320);
  sheet.setColumnWidth(2, 480);
}

function formatHeaderRow_(sheet, colCount) {
  sheet
    .getRange(1, 1, 1, colCount)
    .setBackground('#1a73e8')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
}

/** Typed/table columns reject setNumberFormat — skip instead of failing setup. */
function setNumberFormatSafe_(range, format) {
  try {
    range.setNumberFormat(format);
  } catch (err) {
    // ignore
  }
}

function addSampleData() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  addTransaction_({
    date: today,
    merchant: 'Costco',
    amount: 45.0,
    paymentMethod: 'Card',
    notes: 'Weekly groceries',
    source: 'manual',
    splits: [{ category: 'Groceries', subcategory: 'Costco', amount: 45 }],
  });

  addTransaction_({
    date: today,
    merchant: 'Coffee shop',
    amount: 6.5,
    paymentMethod: 'Cash',
    source: 'manual',
    splits: [{ category: 'Dining', subcategory: 'Coffee', amount: 6.5 }],
  });

  SpreadsheetApp.getUi().alert('Sample data added. Check Dashboard and MonthlySummary.');
}
