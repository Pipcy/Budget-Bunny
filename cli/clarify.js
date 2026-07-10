const {
  getClient,
  MODEL,
  buildParseSystemPrompt,
  normalizeParsedResponse,
  sanitizeCommands_,
} = require('./llm');

/**
 * Structural gaps before hitting the sheet.
 */
function findCommandIssues(parsed) {
  const issues = [];

  parsed.commands.forEach((cmd, idx) => {
    if (cmd.intent === 'unknown') {
      issues.push({ commandIndex: idx, field: 'intent', message: cmd.payload?.reason || 'Could not understand command' });
      return;
    }

    if (cmd.intent === 'addTransaction') {
      const p = cmd.payload;
      if (p.amount == null) issues.push({ commandIndex: idx, field: 'amount', message: 'amount is missing' });
      if (!p.merchant || String(p.merchant).trim().length < 2) {
        issues.push({ commandIndex: idx, field: 'merchant', message: 'merchant / store name is missing' });
      }
      if (!p.splits || !p.splits.length) {
        issues.push({ commandIndex: idx, field: 'splits', message: 'category split is missing' });
      } else {
        p.splits.forEach((split, sIdx) => {
          if (!split.category) {
            issues.push({
              commandIndex: idx,
              field: 'category',
              message: `split ${sIdx + 1} is missing category`,
            });
          }
        });
        if (p.amount != null && p.splits.length) {
          const total = p.splits.reduce((s, x) => s + Number(x.amount || 0), 0);
          if (Math.abs(total - Number(p.amount)) > 0.01) {
            issues.push({
              commandIndex: idx,
              field: 'splits',
              message: 'split amounts do not sum to transaction total',
            });
          }
        }
      }
    }

    if (cmd.intent === 'addIncome') {
      if (cmd.payload.amount == null) {
        issues.push({ commandIndex: idx, field: 'amount', message: 'income amount is missing' });
      }
    }

    if (cmd.intent === 'markReimbursementPaid') {
      const p = cmd.payload;
      if (!p.merchant && (!p.keywords || !p.keywords.length) && p.amount == null) {
        issues.push({
          commandIndex: idx,
          field: 'merchant',
          message: 'need merchant, keywords, or amount to find the pending reimbursement',
        });
      }
    }
  });

  return issues;
}

function sheetErrorToIssue(errorMessage) {
  const msg = String(errorMessage);
  if (msg.includes('Unknown main category')) return { field: 'category', message: msg };
  if (msg.includes('Unknown subcategory')) return { field: 'subcategory', message: msg };
  if (msg.includes('Unknown category')) return { field: 'category', message: msg };
  if (msg.includes('requires amount')) return { field: 'amount', message: msg };
  if (msg.includes('Split total')) return { field: 'splits', message: msg };
  if (msg.includes('No pending reimbursement')) return { field: 'merchant', message: msg };
  return { field: 'general', message: msg };
}

async function generateClarificationQuestion({ issues, parsed, sheetError, categories }) {
  const client = getClient();
  const issueText = issues.map((i) => `- ${i.field}: ${i.message}`).join('\n');
  const categoryNames = categories.map((c) => c.name).join(', ');

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You help complete a personal budget command. Ask ONE short friendly question to get the most important missing info next.
Respond JSON: { "question": "natural language question" }
Be conversational. One sentence. No markdown.
Available categories: ${categoryNames || 'unknown'}
${sheetError ? `Sheet rejected with: ${sheetError}` : ''}`,
      },
      {
        role: 'user',
        content: `Parsed so far:\n${JSON.stringify(parsed, null, 2)}\n\nMissing:\n${issueText}`,
      },
    ],
  });

  const out = JSON.parse(res.choices[0]?.message?.content || '{}');
  return out.question || 'Can you share a bit more detail?';
}

async function continueClarification(session, userReply, categories) {
  const client = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const history = session.history || [];

  const messages = [
    {
      role: 'system',
      content:
        buildParseSystemPrompt(categories, today) +
        '\n\nYou are continuing a multi-turn conversation. Merge earlier context with the user\'s latest reply into a complete command JSON. Fill in missing merchant, category, amount, etc.',
    },
    ...history,
    { role: 'user', content: userReply },
  ];

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages,
  });

  const raw = res.choices[0]?.message?.content || '{}';
  const parsed = normalizeParsedResponse(JSON.parse(raw));
  return sanitizeCommands_(parsed);
}

function createSession({ initialInput, parsed, issues, sheetError }) {
  return {
    initialInput,
    parsed,
    issues,
    sheetError: sheetError || null,
    history: [
      { role: 'user', content: initialInput },
      { role: 'assistant', content: JSON.stringify(parsed) },
    ],
  };
}

function appendToSession(session, question, userReply) {
  session.history.push({ role: 'assistant', content: question });
  session.history.push({ role: 'user', content: userReply });
}

module.exports = {
  findCommandIssues,
  sheetErrorToIssue,
  generateClarificationQuestion,
  continueClarification,
  createSession,
  appendToSession,
};
