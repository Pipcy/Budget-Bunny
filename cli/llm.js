require('dotenv').config();

const OpenAI = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in .env — see .env.example');
  }
  return new OpenAI({ apiKey });
}

function buildParseSystemPrompt(categories, today) {
  const categoryBlock = categories
    .map(
      (c) =>
        `- ${c.name} (${c.group})` +
        (c.subcategories?.length ? ` → subs: ${c.subcategories.join(', ')}` : '')
    )
    .join('\n');

  return `You are Budget-Bunny command parser. Today is ${today}.

Convert user natural language into one or more JSON commands. Use ONLY category/subcategory names from this list:
${categoryBlock || '(no categories loaded — use best guess names)'}

When the user describes MULTIPLE distinct actions in one sentence, return multiple commands.
Example: "spent 5.50 at Starbucks and 16.40 at Target" → two addTransaction commands.

Merchant naming:
- merchant = ONLY a real store/venue name (Starbucks, Costco, South Bay).
- If user only says "food", "lunch", "dining", etc. with no store → merchant: "Not specified"
- Put descriptive context in split notes and transaction notes, NOT in merchant.

Reimbursement — user paid full bill, friends owe part (split lunch):
- addTransaction: amount = total paid
  - user's portion split: normal (no reimbursementStatus)
  - friends' portion split: reimbursementStatus = "Pending payment" AND notes naming who owes + what for (e.g. "Alex — food", "food with Alex")
- paymentMethod = how user paid merchant (Card/Cash), NOT Zelle
Example: "spent $50 on food, $24 was for Alex" → merchant "Not specified", splits with notes "my portion" and "Alex — food"
Example: "lunch $120, my portion $50, friends owe the rest" → one addTransaction with $50 normal + $70 "Pending payment" with notes on pending split

If they already paid back in the same sentence ("and they zelled me the rest"):
→ addTransaction + addIncome + markReimbursementPaid (3 commands)

Friend pays back later:
- addIncome: amount reimbursed, source = Zelle/Venmo/Cash, notes = who paid + what for, applyBudgetGuide: false
- markReimbursementPaid: match pending split on Splits tab by amount + payerName + keywords in split Notes (and transaction Notes)
- Use keywords (names, "food", "lunch") — NOT generic merchant names. Omit merchant when original was "Not specified".
Example: "James paid me back for lunch yesterday via zelle" → addIncome + markReimbursementPaid ({ amount:70, payerName:"James", keywords:["lunch"] })
Example: "Alex paid me back on the 24" → markReimbursementPaid ({ amount:24, payerName:"Alex", keywords:["food","Alex"] })
If amount omitted, match by payerName/keywords; include amount when stated.

Supported intents:
- addTransaction — log an expense with splits
- addIncome — log money in
- markReimbursementPaid — set matching "Pending payment" split(s) to "Paid"
- addSubcategory — create sub under a main category
- addSubcategoryWithReclassify — create sub AND reclassify matching past transactions
- reclassifyByKeywords — keyword-only retroactive tagging (no smart match)
- getBalances — show budget vs spent
- getCategories — list categories
- unknown — cannot parse safely

Rules:
- amounts are positive numbers
- transactionTime: ISO datetime "YYYY-MM-DDTHH:mm:ss" when user mentions time of day or relative dates
- infer times: "yesterday afternoon" → previous day 15:00; "this morning" → today 09:00; "last night" → yesterday 21:00
- date (YYYY-MM-DD) still accepted; if no time given and date is today, transactionTime defaults to now at execution
- if only date given for a past day without time, use 12:00 that day
- if user gives no date or time at all, omit transactionTime and date — server uses current time when saved
- paymentMethod: Card, Cash, Zelle, Venmo, Other
- splits must sum to transaction amount
- CRITICAL: every split MUST include "category" (exact name from list). Include "subcategory" when known. Never omit category.
- Example split: { "category": "Dining", "subcategory": "Coffee", "amount": 5, "notes": "optional context" }
- cafe/coffee shop → Dining + Coffee sub; grocery store → Groceries; omit optional fields instead of null
- for addSubcategoryWithReclassify include matchDescription describing what past rows belong in the new sub
- infer category from merchant when obvious (Starbucks → Dining/Coffee sub if exists)
- respond with JSON only, no markdown

Schema (always use this shape):
{
  "summary": "one line describing all commands for user confirmation",
  "commands": [
    { "intent": "...", "summary": "short label for this step", "payload": { } }
  ]
}

Use a single item in commands[] for one action. Use multiple items for multiple actions.

Payload by intent:
addTransaction: { transactionTime?, date?, time?, merchant, amount, paymentMethod, notes?, source:"cli", splits:[{category, subcategory?, amount, reimbursementStatus?, notes?}] }
addIncome: { transactionTime?, date?, time?, amount, source, applyBudgetGuide?: false, notes? }
markReimbursementPaid: { merchant?, amount?, payerName?, date?, keywords?:[], allowMultiple?: false }
addSubcategory: { parentCategory, subcategory, monthlyBudget? }
addSubcategoryWithReclassify: { parentCategory, subcategory, monthlyBudget?, matchDescription }
reclassifyByKeywords: { parentCategory, subcategory, keywords:[], missingSubcategoryOnly?: true }
getBalances: {}
getCategories: {}
unknown: { reason }`;
}

async function parseCommand(userText, categories) {
  const client = getClient();
  const today = new Date().toISOString().slice(0, 10);

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildParseSystemPrompt(categories, today) },
      { role: 'user', content: userText },
    ],
  });

  const raw = res.choices[0]?.message?.content || '{}';
  const parsed = normalizeParsedResponse(JSON.parse(raw));
  return sanitizeCommands_(parsed);
}

/**
 * Accepts new multi-command shape or legacy single { intent, payload }.
 */
function normalizeParsedResponse(parsed) {
  if (parsed.commands && Array.isArray(parsed.commands)) {
    const commands = parsed.commands.map((cmd) => ({
      intent: cmd.intent || 'unknown',
      summary: cmd.summary || '',
      payload: cmd.payload || {},
    }));
    return {
      summary: parsed.summary || commands.map((c) => c.summary).filter(Boolean).join('; '),
      commands,
    };
  }

  if (parsed.intent) {
    return {
      summary: parsed.summary || '',
      commands: [
        {
          intent: parsed.intent,
          summary: parsed.summary || '',
          payload: parsed.payload || {},
        },
      ],
    };
  }

  return {
    summary: parsed.summary || 'Could not parse',
    commands: [{ intent: 'unknown', summary: parsed.summary || '', payload: parsed.payload || parsed }],
  };
}

function sanitizeCommands_(parsed) {
  parsed.commands.forEach((cmd) => {
    if (cmd.intent === 'addTransaction' || cmd.intent === 'addIncome') {
      if (!cmd.payload.transactionTime && !cmd.payload.date) {
        cmd.payload._transactionTimeDefault = 'now';
      }
    }

    if (cmd.intent !== 'addTransaction' || !cmd.payload.splits) return;

    cmd.payload.splits = cmd.payload.splits.map((split) => {
      const cleaned = { ...split };
      if (cleaned.reimbursementStatus == null) delete cleaned.reimbursementStatus;
      return cleaned;
    });

    if (!cmd.payload.splits.length && cmd.payload.amount != null && cmd.payload.category) {
      cmd.payload.splits = [
        {
          category: cmd.payload.category,
          subcategory: cmd.payload.subcategory,
          amount: cmd.payload.amount,
        },
      ];
    }
  });
  return parsed;
}

async function classifyTransactions(transactions, matchDescription, subcategory) {
  if (!transactions.length) return [];

  const client = getClient();
  const list = transactions
    .map(
      (t, i) =>
        `[${i}] id=${t.transactionId} date=${t.date} merchant="${t.merchant}" notes="${t.notes}" amount=${t.amount} main=${t.mainCategory} currentSub="${t.subcategory}"`
    )
    .join('\n');

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Pick transaction indices that should be tagged subcategory "${subcategory}".
Match criteria: ${matchDescription}
Return JSON: { "indices": [0, 2], "reasoning": "brief" }
Only include clear matches. When unsure, exclude.`,
      },
      { role: 'user', content: list },
    ],
  });

  const parsed = JSON.parse(res.choices[0]?.message?.content || '{"indices":[]}');
  const indices = Array.isArray(parsed.indices) ? parsed.indices : [];
  return indices
    .filter((i) => i >= 0 && i < transactions.length)
    .map((i) => transactions[i]);
}

module.exports = {
  parseCommand,
  classifyTransactions,
  normalizeParsedResponse,
  sanitizeCommands_,
  buildParseSystemPrompt,
  getClient,
  MODEL,
};
