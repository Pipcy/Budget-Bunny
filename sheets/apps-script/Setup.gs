/**
 * Budget-Bunny — workbook setup
 * Run setupWorkbook() once from the Apps Script editor.
 *
 * Schema:
 *   Categories      — main categories only
 *   Subcategories   — optional detail under a main category
 *   BudgetGuide     — budgets on Main or Sub (monthly caps + income rules)
 */

const SHEET_NAMES = {
  CATEGORIES: 'Categories',
  SUBCATEGORIES: 'Subcategories',
  TRANSACTIONS: 'Transactions',
  SPLITS: 'Splits',
  LEDGER: 'Ledger',
  INCOME: 'Income',
  BUDGET_GUIDE: 'BudgetGuide',
  MONTHLY_SUMMARY: 'MonthlySummary',
  SUBCATEGORY_SUMMARY: 'SubcategorySummary',
  DASHBOARD: 'Dashboard',
  SETTINGS: 'Settings',
};

const FOR_TYPES = ['Main', 'Sub'];
const RULE_TYPES = ['Monthly', 'Income Fixed', 'Income Percent'];

const MAX_CATEGORY_ROWS = 30;
const MAX_SUBCATEGORY_ROWS = 50;

const CATEGORY_HEADERS = ['Category', 'Group', 'Color', 'Active'];
const SUBCATEGORY_HEADERS = ['Subcategory', 'Parent Category', 'Active'];
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
const INCOME_HEADERS = [
  'Transaction Time',
  'Log Time',
  'Amount',
  'Source',
  'Notes',
  'Apply Budget Guide',
];
const BUDGET_GUIDE_HEADERS = ['Budget For', 'For Type', 'Rule Type', 'Value', 'Priority', 'Notes'];
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
const MONTHLY_SUMMARY_HEADERS = [
  'Month',
  'Main Category',
  'Group',
  'Budget',
  'Spent',
  'Remaining',
  '% Used',
];
const SUBCATEGORY_SUMMARY_HEADERS = [
  'Month',
  'Subcategory',
  'Parent Category',
  'Budget',
  'Spent',
  'Remaining',
  '% Used',
];

const DEFAULT_CATEGORIES = [
  ['Rent', 'Needs', '#4A90D9', 'TRUE'],
  ['Groceries', 'Needs', '#50C878', 'TRUE'],
  ['Utilities', 'Needs', '#F5A623', 'TRUE'],
  ['Transport', 'Needs', '#9B59B6', 'TRUE'],
  ['Dining', 'Wants', '#E74C3C', 'TRUE'],
  ['Entertainment', 'Wants', '#E91E63', 'TRUE'],
  ['Shopping', 'Wants', '#FF9800', 'TRUE'],
  ['Emergency Fund', 'Savings', '#607D8B', 'TRUE'],
  ['Investments', 'Savings', '#795548', 'TRUE'],
];

const DEFAULT_SUBCATEGORIES = [
  ['Costco', 'Groceries', 'TRUE'],
  ['Trader Joes', 'Groceries', 'TRUE'],
  ['Restaurants', 'Dining', 'TRUE'],
  ['Coffee', 'Dining', 'TRUE'],
  ['Rideshare', 'Transport', 'TRUE'],
];

const DEFAULT_BUDGET_GUIDE = [
  ['Rent', 'Main', 'Monthly', 1500, 1, 'Monthly cap'],
  ['Groceries', 'Main', 'Monthly', 400, 2, 'Monthly cap — all grocery subs roll up here'],
  ['Costco', 'Sub', 'Monthly', 250, 3, 'Sub monthly cap'],
  ['Dining', 'Main', 'Monthly', 200, 4, ''],
  ['Coffee', 'Sub', 'Monthly', 60, 5, ''],
  ['Rent', 'Main', 'Income Fixed', 1500, 1, 'Pay first'],
  ['Groceries', 'Main', 'Income Percent', 12, 2, ''],
  ['Emergency Fund', 'Main', 'Income Percent', 10, 3, ''],
  ['Dining', 'Main', 'Income Percent', 5, 4, ''],
];

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
  setupSubcategories_(ss);
  setupTransactions_(ss);
  setupSplits_(ss);
  setupLedger_(ss);
  setupIncome_(ss);
  setupBudgetGuide_(ss);
  setupMonthlySummary_(ss);
  setupSubcategorySummary_(ss);
  setupDashboard_(ss);
  setupSettings_(ss);

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > Object.keys(SHEET_NAMES).length) {
    ss.deleteSheet(defaultSheet);
  }

  ss.setActiveSheet(ss.getSheetByName(SHEET_NAMES.DASHBOARD));
  SpreadsheetApp.getUi().alert(
    'Budget-Bunny setup complete!\n\n' +
      '1. Edit Categories (main) and Subcategories\n' +
      '2. Set budgets in BudgetGuide (Main or Sub)\n' +
      '3. Pick month on Dashboard\n' +
      '4. Optional: Add sample data'
  );
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
  sheet.getRange('B2:C').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('E2:E').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, TRANSACTION_HEADERS.length);
}

function setupSplits_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SPLITS);
  sheet.getRange(1, 1, 1, SPLIT_HEADERS.length).setValues([SPLIT_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('E2:E').setNumberFormat('$#,##0.00');
  sheet.getRange('H2:I').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('F2:F').setDataValidation(reimbursementValidation_());
  formatHeaderRow_(sheet, SPLIT_HEADERS.length);
}

function setupIncome_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.INCOME);
  sheet.getRange(1, 1, 1, INCOME_HEADERS.length).setValues([INCOME_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('A2:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('C2:C').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, INCOME_HEADERS.length);
}

function setupBudgetGuide_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.BUDGET_GUIDE);
  sheet.getRange(1, 1, 1, BUDGET_GUIDE_HEADERS.length).setValues([BUDGET_GUIDE_HEADERS]);
  sheet.getRange(2, 1, DEFAULT_BUDGET_GUIDE.length, BUDGET_GUIDE_HEADERS.length).setValues(
    DEFAULT_BUDGET_GUIDE
  );
  sheet.setFrozenRows(1);
  sheet.getRange('D2:D').setNumberFormat('#,##0.00');
  formatHeaderRow_(sheet, BUDGET_GUIDE_HEADERS.length);
  sheet.getRange('B2:B').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(FOR_TYPES, true).setAllowInvalid(false).build()
  );
  sheet.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(RULE_TYPES, true).setAllowInvalid(false).build()
  );
  sheet.setColumnWidths(1, 6, 130);
}

function setupLedger_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.LEDGER);
  sheet.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
  sheet.setFrozenRows(1);

  sheet.getRange('A2').setFormula(ledgerFormula_());

  sheet.getRange('A2:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('F2:F').setNumberFormat('$#,##0.00');
  formatHeaderRow_(sheet, LEDGER_HEADERS.length);
}

function monthlyBudgetFormula_(forType, nameRef, row) {
  return (
    `=IF(${nameRef}="","",IFERROR(SUMIFS(BudgetGuide!D:D,BudgetGuide!B:B,"${forType}",BudgetGuide!A:A,${nameRef},BudgetGuide!C:C,"Monthly"),0))`
  );
}

function countableAmountExpr_() {
  // Ledger F=Amount, G=Reimbursement Status
  return '(IF(Ledger!G$2:G$5000="Paid",0,1)*Ledger!F$2:F$5000)';
}

function monthSpentMainFormula_(catRef, row) {
  return (
    `=IF(${catRef}="","",SUMPRODUCT((TRIM(Ledger!C$2:C$5000)=TRIM(${catRef}))*(TEXT(Ledger!A$2:A$5000,"yyyy-mm")=Dashboard!$B$3)*` +
    countableAmountExpr_() +
    '))'
  );
}

function monthSpentSubFormula_(subRef, parentRef, row) {
  return (
    `=IF(${subRef}="","",SUMPRODUCT((TRIM(Ledger!D$2:D$5000)=TRIM(${subRef}))*(TRIM(Ledger!C$2:C$5000)=TRIM(${parentRef}))*(TEXT(Ledger!A$2:A$5000,"yyyy-mm")=Dashboard!$B$3)*` +
    countableAmountExpr_() +
    '))'
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

  const ledger = ss.getSheetByName(SHEET_NAMES.LEDGER);
  if (ledger) {
    ledger.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
    ledger.getRange('A2').setFormula(ledgerFormula_());
    formatHeaderRow_(ledger, LEDGER_HEADERS.length);
  }

  applyMonthlySummaryFormulas_(ss);
  applySubcategorySummaryFormulas_(ss);
  applyDashboardFormulas_(ss);

  SpreadsheetApp.getUi().alert(
    'Report formulas refreshed.\n\nCheck MonthlySummary column E (Spent) and Dashboard B6.'
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
      monthlyBudgetFormula_('Main', catRef, row),
      monthSpentMainFormula_(catRef, row),
      `=IF(${catRef}="","",D${row}-E${row})`,
      `=IF(OR(${catRef}="",D${row}=0),"",E${row}/D${row})`,
    ]);
  }

  sheet.getRange(2, 1, MAX_CATEGORY_ROWS, MONTHLY_SUMMARY_HEADERS.length).setFormulas(formulas);
}

function applySubcategorySummaryFormulas_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SUBCATEGORY_SUMMARY);
  if (!sheet) return;

  const formulas = [];
  for (let i = 0; i < MAX_SUBCATEGORY_ROWS; i++) {
    const row = i + 2;
    const subRef = `Subcategories!A${row}`;
    const parentRef = `Subcategories!B${row}`;
    formulas.push([
      `=IF(${subRef}="","",Dashboard!$B$3)`,
      `=IF(${subRef}="","",${subRef})`,
      `=IF(${subRef}="","",${parentRef})`,
      monthlyBudgetFormula_('Sub', subRef, row),
      monthSpentSubFormula_(subRef, parentRef, row),
      `=IF(${subRef}="","",D${row}-E${row})`,
      `=IF(OR(${subRef}="",D${row}=0),"",E${row}/D${row})`,
    ]);
  }

  sheet.getRange(2, 1, MAX_SUBCATEGORY_ROWS, SUBCATEGORY_SUMMARY_HEADERS.length).setFormulas(formulas);
}

function applyDashboardFormulas_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) return;

  sheet.getRange('B5').setFormula(
    '=SUMPRODUCT((TEXT(Income!A$2:A$5000,"yyyy-mm")=B3)*(Income!C$2:C$5000))'
  );
  sheet.getRange('B6').setFormula(
    '=SUMPRODUCT((TEXT(Ledger!A$2:A$5000,"yyyy-mm")=B3)*' + countableAmountExpr_() + ')'
  );
  sheet.getRange('B7').setFormula('=B5-B6');
  sheet.getRange('B9').setFormula(
    '=TEXTJOIN(", ",TRUE,FILTER(MonthlySummary!B:B,MonthlySummary!F:F<0))'
  );
  sheet.getRange('B10').setFormula(
    '=TEXTJOIN(", ",TRUE,FILTER(SubcategorySummary!B:B,SubcategorySummary!F:F<0))'
  );
}

function setupMonthlySummary_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.MONTHLY_SUMMARY);
  sheet.getRange(1, 1, 1, MONTHLY_SUMMARY_HEADERS.length).setValues([MONTHLY_SUMMARY_HEADERS]);
  sheet.setFrozenRows(1);
  applyMonthlySummaryFormulas_(ss);
  sheet.getRange('D2:F' + (MAX_CATEGORY_ROWS + 1)).setNumberFormat('$#,##0.00');
  sheet.getRange('G2:G' + (MAX_CATEGORY_ROWS + 1)).setNumberFormat('0.0%');
  formatHeaderRow_(sheet, MONTHLY_SUMMARY_HEADERS.length);
}

function setupSubcategorySummary_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SUBCATEGORY_SUMMARY);
  sheet.getRange(1, 1, 1, SUBCATEGORY_SUMMARY_HEADERS.length).setValues([SUBCATEGORY_SUMMARY_HEADERS]);
  sheet.setFrozenRows(1);
  applySubcategorySummaryFormulas_(ss);
  sheet.getRange('D2:F' + (MAX_SUBCATEGORY_ROWS + 1)).setNumberFormat('$#,##0.00');
  sheet.getRange('G2:G' + (MAX_SUBCATEGORY_ROWS + 1)).setNumberFormat('0.0%');
  formatHeaderRow_(sheet, SUBCATEGORY_SUMMARY_HEADERS.length);
}

function setupDashboard_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  sheet.getRange('A1').setValue('Budget-Bunny Dashboard').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A3').setValue('Selected month (YYYY-MM):');
  sheet.getRange('B3').setValue(now);
  sheet.getRange('B3').setBackground('#FFF9C4');

  sheet.getRange('A5').setValue('Total income this month:');
  sheet.getRange('A6').setValue('Total spent this month:');
  sheet.getRange('A7').setValue('Net this month:');
  applyDashboardFormulas_(ss);

  sheet.getRange('A9').setValue('Main categories over budget:');
  sheet.getRange('A10').setValue('Subcategories over budget:');

  sheet.getRange('A12').setValue('Reports →');
  sheet.getRange('B12').setValue('MonthlySummary (main) · SubcategorySummary (detail)');

  sheet.getRange('B5:B7').setNumberFormat('$#,##0.00');
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 280);
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

  addIncome_({
    date: today,
    amount: 3200,
    source: 'Paycheck',
    notes: 'Bi-weekly',
    applyBudgetGuide: true,
  });

  SpreadsheetApp.getUi().alert('Sample data added. Check Dashboard and both Summary tabs.');
}
