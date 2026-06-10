/**
 * Budget-Flow — Phase A workbook setup
 * Run setupWorkbook() once from the Apps Script editor.
 */

const SHEET_NAMES = {
  CATEGORIES: 'Categories',
  TRANSACTIONS: 'Transactions',
  SPLITS: 'Splits',
  LEDGER: 'Ledger',
  INCOME: 'Income',
  BUDGET_GUIDE: 'BudgetGuide',
  MONTHLY_SUMMARY: 'MonthlySummary',
  DASHBOARD: 'Dashboard',
  SETTINGS: 'Settings',
};

const MAX_CATEGORY_ROWS = 30;

const LEDGER_HEADERS = ['Date', 'Category', 'Amount', 'Merchant', 'Payment Method', 'Source'];

const CATEGORY_HEADERS = ['Category', 'Group', 'Monthly Budget', 'Color', 'Active'];
const TRANSACTION_HEADERS = [
  'ID',
  'Date',
  'Merchant',
  'Total Amount',
  'Payment Method',
  'Notes',
  'Receipt URL',
  'Source',
];
const SPLIT_HEADERS = ['Transaction ID', 'Category', 'Amount'];
const INCOME_HEADERS = ['Date', 'Amount', 'Source', 'Notes', 'Apply Budget Guide'];
const BUDGET_GUIDE_HEADERS = ['Category', 'Rule Type', 'Value', 'Priority', 'Notes'];
const MONTHLY_SUMMARY_HEADERS = [
  'Month',
  'Category',
  'Group',
  'Budget',
  'Spent',
  'Remaining',
  '% Used',
];

const DEFAULT_CATEGORIES = [
  ['Rent', 'Needs', 1500, '#4A90D9', 'TRUE'],
  ['Groceries', 'Needs', 400, '#50C878', 'TRUE'],
  ['Utilities', 'Needs', 150, '#F5A623', 'TRUE'],
  ['Transport', 'Needs', 120, '#9B59B6', 'TRUE'],
  ['Dining', 'Wants', 200, '#E74C3C', 'TRUE'],
  ['Entertainment', 'Wants', 100, '#E91E63', 'TRUE'],
  ['Shopping', 'Wants', 150, '#FF9800', 'TRUE'],
  ['Emergency Fund', 'Savings', 300, '#607D8B', 'TRUE'],
  ['Investments', 'Savings', 200, '#795548', 'TRUE'],
];

const DEFAULT_BUDGET_GUIDE = [
  ['Rent', 'Fixed', 1500, 1, 'Pay first'],
  ['Groceries', 'Percent', 12, 2, ''],
  ['Utilities', 'Fixed', 150, 3, ''],
  ['Transport', 'Percent', 5, 4, ''],
  ['Emergency Fund', 'Percent', 10, 5, ''],
  ['Dining', 'Percent', 5, 6, ''],
  ['Entertainment', 'Percent', 3, 7, ''],
  ['Investments', 'Percent', 10, 8, ''],
];

/**
 * Creates all tabs, headers, sample data, and dashboard formulas.
 */
function setupWorkbook() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.values(SHEET_NAMES).forEach((name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    } else {
      sheet.clear();
    }
  });

  setupCategories_(ss);
  setupTransactions_(ss);
  setupSplits_(ss);
  setupLedger_(ss);
  setupIncome_(ss);
  setupBudgetGuide_(ss);
  setupMonthlySummary_(ss);
  setupDashboard_(ss);
  setupSettings_(ss);

  // Remove default Sheet1 if it exists and is empty
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > Object.keys(SHEET_NAMES).length) {
    ss.deleteSheet(defaultSheet);
  }

  ss.setActiveSheet(ss.getSheetByName(SHEET_NAMES.DASHBOARD));
  SpreadsheetApp.getUi().alert(
    'Budget-Flow setup complete!\n\n' +
      '1. Review Categories and BudgetGuide tabs\n' +
      '2. Use Dashboard to pick a month\n' +
      '3. Run addSampleData() to try example rows (optional)'
  );
}

function setupCategories_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
  sheet.getRange(1, 1, 1, CATEGORY_HEADERS.length).setValues([CATEGORY_HEADERS]);
  sheet.getRange(2, 1, DEFAULT_CATEGORIES.length, CATEGORY_HEADERS.length).setValues(
    DEFAULT_CATEGORIES
  );
  sheet.setFrozenRows(1);
  sheet.getRange('C2:C').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, CATEGORY_HEADERS.length);
  sheet.setColumnWidths(1, 5, 120);
}

function setupTransactions_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  sheet.getRange(1, 1, 1, TRANSACTION_HEADERS.length).setValues([TRANSACTION_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('D2:D').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, TRANSACTION_HEADERS.length);
}

function setupSplits_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SPLITS);
  sheet.getRange(1, 1, 1, SPLIT_HEADERS.length).setValues([SPLIT_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('C2:C').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, SPLIT_HEADERS.length);
}

function setupIncome_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.INCOME);
  sheet.getRange(1, 1, 1, INCOME_HEADERS.length).setValues([INCOME_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('B2:B').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, INCOME_HEADERS.length);
}

function setupBudgetGuide_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.BUDGET_GUIDE);
  sheet.getRange(1, 1, 1, BUDGET_GUIDE_HEADERS.length).setValues([BUDGET_GUIDE_HEADERS]);
  sheet.getRange(2, 1, DEFAULT_BUDGET_GUIDE.length, BUDGET_GUIDE_HEADERS.length).setValues(
    DEFAULT_BUDGET_GUIDE
  );
  sheet.setFrozenRows(1);
  sheet.getRange('C2:C').setNumberFormat('#,##0.00');
  formatHeaderRow_(sheet, BUDGET_GUIDE_HEADERS.length);
  sheet.getRange('B2:B').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Fixed', 'Percent'], true)
      .setAllowInvalid(false)
      .build()
  );
}

function setupLedger_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.LEDGER);
  sheet.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
  sheet.setFrozenRows(1);

  // Flat view: one row per split, joined with transaction metadata
  sheet.getRange('A2').setFormula(
    '=ARRAYFORMULA(IF(LEN(Splits!A2:A)=0,,{' +
      'VLOOKUP(Splits!A2:A,Transactions!A:B,2,FALSE),' +
      'Splits!B2:B,' +
      'Splits!C2:C,' +
      'VLOOKUP(Splits!A2:A,Transactions!A:C,3,FALSE),' +
      'VLOOKUP(Splits!A2:A,Transactions!A:E,5,FALSE),' +
      'VLOOKUP(Splits!A2:A,Transactions!A:H,8,FALSE)' +
      '}))'
  );

  sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('C2:C').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, LEDGER_HEADERS.length);
}

function setupMonthlySummary_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.MONTHLY_SUMMARY);
  sheet.getRange(1, 1, 1, MONTHLY_SUMMARY_HEADERS.length).setValues([MONTHLY_SUMMARY_HEADERS]);
  sheet.setFrozenRows(1);

  const formulas = [];
  for (let i = 0; i < MAX_CATEGORY_ROWS; i++) {
    const row = i + 2;
    const catRef = `Categories!A${row}`;
    formulas.push([
      '=IF(' + catRef + '="","",Dashboard!$B$3)',
      `=IF(${catRef}="","",${catRef})`,
      `=IF(${catRef}="","",IFERROR(VLOOKUP(${catRef},Categories!A:B,2,FALSE),""))`,
      `=IF(${catRef}="","",IFERROR(VLOOKUP(${catRef},Categories!A:C,3,FALSE),0))`,
      `=IF(${catRef}="","",SUMIFS(Ledger!C:C,Ledger!B:B,${catRef},Ledger!A:A,">="&DATEVALUE(Dashboard!$B$3&"-01"),Ledger!A:A,"<="&EOMONTH(DATEVALUE(Dashboard!$B$3&"-01"),0)))`,
      `=IF(${catRef}="","",D${row}-E${row})`,
      `=IF(OR(${catRef}="",D${row}=0),"",E${row}/D${row})`,
    ]);
  }

  sheet.getRange(2, 1, MAX_CATEGORY_ROWS, MONTHLY_SUMMARY_HEADERS.length).setFormulas(formulas);
  sheet.getRange('D2:F' + (MAX_CATEGORY_ROWS + 1)).setNumberFormat('$#,##0.00');
  sheet.getRange('G2:G' + (MAX_CATEGORY_ROWS + 1)).setNumberFormat('0.0%');
  formatHeaderRow_(sheet, MONTHLY_SUMMARY_HEADERS.length);
}

function setupDashboard_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  sheet.getRange('A1').setValue('Budget-Flow Dashboard').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A3').setValue('Selected month (YYYY-MM):');
  sheet.getRange('B3').setValue(now);
  sheet.getRange('B3').setBackground('#FFF9C4');

  sheet.getRange('A5').setValue('Total income this month:');
  sheet.getRange('B5').setFormula(
    '=SUMIFS(Income!B:B,Income!A:A,">="&DATEVALUE(B3&"-01"),Income!A:A,"<="&EOMONTH(DATEVALUE(B3&"-01"),0))'
  );
  sheet.getRange('A6').setValue('Total spent this month:');
  sheet.getRange('B6').setFormula(
    '=SUMIFS(Ledger!C:C,Ledger!A:A,">="&DATEVALUE(B3&"-01"),Ledger!A:A,"<="&EOMONTH(DATEVALUE(B3&"-01"),0))'
  );
  sheet.getRange('A7').setValue('Net this month:');
  sheet.getRange('B7').setFormula('=B5-B6');

  sheet.getRange('A9').setValue('Categories over budget:');
  sheet.getRange('B9').setFormula(
    '=TEXTJOIN(", ",TRUE,FILTER(MonthlySummary!B:B,MonthlySummary!F:F<0))'
  );

  sheet.getRange('A11').setValue('Quick links →');
  sheet.getRange('B11').setValue('See MonthlySummary tab for full breakdown');

  sheet.getRange('B5:B7').setNumberFormat('$#,##0.00');
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 200);
}

function setupSettings_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  sheet.getRange('A1').setValue('Budget-Flow Settings').setFontSize(14).setFontWeight('bold');
  sheet.getRange('A3').setValue('Web app URL (paste after deploy):');
  sheet.getRange('A4').setValue('API token (from menu → Generate API token):');
  sheet.getRange('A6').setValue('Deploy steps:');
  sheet.getRange('A7').setValue('1. Apps Script → Deploy → New deployment → Web app');
  sheet.getRange('A8').setValue('2. Execute as: Me | Who has access: Anyone');
  sheet.getRange('A9').setValue('3. Paste /exec URL into B3 above');
  sheet.getRange('A10').setValue('4. Budget-Flow menu → Generate API token → paste in iPhone app');
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

/**
 * Optional: adds sample transactions to verify formulas.
 */
function addSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  addTransaction_({
    date: today,
    merchant: 'Whole Foods',
    amount: 45.0,
    paymentMethod: 'Card',
    notes: 'Weekly groceries',
    source: 'manual',
    splits: [
      { category: 'Groceries', amount: 35 },
      { category: 'Shopping', amount: 10 },
    ],
  });

  addIncome_({
    date: today,
    amount: 3200,
    source: 'Paycheck',
    notes: 'Bi-weekly',
    applyBudgetGuide: true,
  });

  SpreadsheetApp.getUi().alert('Sample transaction and income added. Check Dashboard.');
}
