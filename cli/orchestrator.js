const { callSheet } = require('./sheet-client');
const { classifyTransactions } = require('./llm');

async function executeIntent(parsed, { askConfirm }) {
  const { intent, payload, summary } = parsed;

  switch (intent) {
    case 'getCategories':
      return callSheet('getCategories');

    case 'getBalances':
      return callSheet('getBalances');

    case 'addTransaction':
      return callSheet('addTransaction', payload);

    case 'addIncome':
      return callSheet('addIncome', payload);

    case 'markReimbursementPaid':
      return callSheet('markReimbursementPaid', payload);

    case 'searchPendingReimbursements':
      return callSheet('searchPendingReimbursements', payload);

    case 'addSubcategory':
      return callSheet('addSubcategory', payload);

    case 'reclassifyByKeywords':
      return callSheet('reclassifyByKeywords', payload);

    case 'addSubcategoryWithReclassify':
      return runSubcategoryWithReclassify(payload, askConfirm);

    case 'unknown':
      throw new Error(payload?.reason || 'Could not parse command');

    default:
      throw new Error(`Unsupported intent: ${intent}`);
  }
}

async function runSubcategoryWithReclassify(payload, askConfirm) {
  const { parentCategory, subcategory, monthlyBudget, matchDescription } = payload;

  const createResult = await callSheet('addSubcategory', {
    parentCategory,
    subcategory,
    monthlyBudget,
  });

  if (!matchDescription) {
    return { ...createResult, reclassified: 0, note: 'Subcategory created; no reclassify description' };
  }

  const search = await callSheet('searchTransactions', {
    mainCategory: parentCategory,
    missingSubcategoryOnly: true,
  });

  const candidates = search.transactions || [];
  if (!candidates.length) {
    return { ...createResult, reclassified: 0, note: 'No past transactions to review' };
  }

  const matches = await classifyTransactions(candidates, matchDescription, subcategory);

  if (!matches.length) {
    return { ...createResult, reclassified: 0, note: 'LLM found no matching past transactions' };
  }

  console.log('\nPast transactions to move to', subcategory + ':');
  matches.forEach((t) => {
    console.log(`  • ${t.date}  ${t.merchant || '(no merchant)'}  $${t.amount}`);
  });

  const ok = await askConfirm(`Reclassify ${matches.length} transaction(s)?`);
  if (!ok) {
    return { ...createResult, reclassified: 0, note: 'Reclassify skipped by user' };
  }

  const reclassify = await callSheet('bulkReclassifySplits', {
    updates: matches.map((t) => ({
      transactionId: t.transactionId,
      mainCategory: t.mainCategory,
      subcategory,
    })),
  });

  return { ...createResult, ...reclassify };
}

async function executeCommands(commands, { askConfirm }) {
  const results = [];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    console.log(`\n[${i + 1}/${commands.length}] ${cmd.summary || cmd.intent}`);

    try {
      const result = await executeIntent(cmd, { askConfirm });
      results.push({ ok: true, intent: cmd.intent, summary: cmd.summary, result });
    } catch (err) {
      results.push({ ok: false, intent: cmd.intent, summary: cmd.summary, error: err.message });
      console.error(`  Failed: ${err.message}`);
    }
  }

  return results;
}

module.exports = { executeIntent, executeCommands };
