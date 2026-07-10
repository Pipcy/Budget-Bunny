#!/usr/bin/env node
/**
 * Budget-Bunny CLI — test natural language → Chat API → Sheet commands
 */

require('dotenv').config();

const readline = require('readline');
const { callSheet, healthCheck } = require('./sheet-client');
const { parseCommand, MODEL } = require('./llm');
const { executeCommands } = require('./orchestrator');
const {
  findCommandIssues,
  sheetErrorToIssue,
  generateClarificationQuestion,
  continueClarification,
  createSession,
  appendToSession,
} = require('./clarify');

let dryRun = process.env.CLI_DRY_RUN === 'true';
let categories = [];
let pendingSession = null;

function makePrompt(rl) {
  return (question) =>
    new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
}

function makeAskConfirm(prompt) {
  return async (message) => {
    const answer = (await prompt(`${message} [y/N] `)).toLowerCase();
    return answer === 'y' || answer === 'yes';
  };
}

async function refreshCategories() {
  try {
    const res = await callSheet('getCategories');
    categories = res.categories || [];
    return categories;
  } catch (err) {
    console.warn('Could not load categories:', err.message);
    categories = [];
    return [];
  }
}

function printHelp() {
  console.log(`
Commands:
  /help          show this help
  /dry           toggle dry-run (currently ${dryRun ? 'ON' : 'OFF'})
  /categories    reload categories from sheet
  /cancel        abandon in-progress clarification
  /quit          exit

Examples:
  spent 5 dollars          → may ask "Where did you spend it?"
  spent 45 at Costco, groceries
  received 3200 paycheck
`);
}

function clearPending() {
  pendingSession = null;
}

async function showClarificationQuestion(session) {
  const question = await generateClarificationQuestion({
    issues: session.issues,
    parsed: session.parsed,
    sheetError: session.sheetError,
    categories,
  });
  session.lastQuestion = question;
  console.log(`\nBudget-Bunny: ${question}`);
}

async function parseUserInput(trimmed) {
  if (pendingSession?.awaitingReply) {
    appendToSession(pendingSession, pendingSession.lastQuestion, trimmed);
    console.log(`\nParsing with ${MODEL}...`);
    const parsed = await continueClarification(pendingSession, trimmed, categories);
    pendingSession.parsed = parsed;
    pendingSession.issues = findCommandIssues(parsed);
    pendingSession.sheetError = null;
    pendingSession.awaitingReply = false;
    return parsed;
  }

  console.log(`\nParsing with ${MODEL}...`);
  const parsed = await parseCommand(trimmed, categories);
  const issues = findCommandIssues(parsed);

  if (issues.length) {
    pendingSession = createSession({ initialInput: trimmed, parsed, issues });
    pendingSession.awaitingReply = true;
    await showClarificationQuestion(pendingSession);
    return null;
  }

  return parsed;
}

async function tryExecute(parsed, { askConfirm }) {
  const { summary, commands } = parsed;

  console.log('\n--- Parsed ---');
  console.log(JSON.stringify({ summary, commands }, null, 2));

  if (!commands.length || commands.every((c) => c.intent === 'unknown')) {
    const reason = commands[0]?.payload?.reason || summary;
    console.log('\nCould not parse:', reason);
    clearPending();
    return;
  }

  const issues = findCommandIssues(parsed);
  if (issues.length) {
    pendingSession = createSession({
      initialInput: pendingSession?.initialInput || summary,
      parsed,
      issues,
    });
    pendingSession.awaitingReply = true;
    await showClarificationQuestion(pendingSession);
    return;
  }

  if (dryRun) {
    console.log(`\n(dry-run — ${commands.length} command(s), not executing)`);
    clearPending();
    return;
  }

  const countLabel = commands.length === 1 ? '1 command' : `${commands.length} commands`;
  const proceed = await askConfirm(`\n${summary}\nExecute ${countLabel}?`);
  if (!proceed) {
    console.log('Cancelled.');
    clearPending();
    return;
  }

  console.log('\nExecuting...');
  const results = await executeCommands(commands, { askConfirm });
  const failed = results.filter((r) => !r.ok);

  if (failed.length) {
    const firstErr = failed[0].error;
    const issue = sheetErrorToIssue(firstErr);
    pendingSession = createSession({
      initialInput: pendingSession?.initialInput || summary,
      parsed,
      issues: [issue],
      sheetError: firstErr,
    });
    pendingSession.awaitingReply = true;
    console.log(`\n--- Results (${results.length - failed.length}/${results.length} succeeded) ---`);
    console.log(JSON.stringify(results, null, 2));
    await showClarificationQuestion(pendingSession);
    return;
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n--- Results (${ok}/${results.length} succeeded) ---`);
  console.log(JSON.stringify(results, null, 2));
  clearPending();
}

async function handleInput(line, ctx) {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed.startsWith('/')) {
    const cmd = trimmed.toLowerCase();
    if (cmd === '/quit' || cmd === '/exit') process.exit(0);
    if (cmd === '/help') return printHelp();
    if (cmd === '/cancel') {
      clearPending();
      console.log('Clarification cancelled.');
      return;
    }
    if (cmd === '/dry') {
      dryRun = !dryRun;
      console.log(`Dry-run: ${dryRun ? 'ON (parse only)' : 'OFF (will execute)'}`);
      return;
    }
    if (cmd === '/categories') {
      const cats = await refreshCategories();
      console.log(JSON.stringify(cats, null, 2));
      return;
    }
    console.log('Unknown command. /help for list.');
    return;
  }

  const parsed = await parseUserInput(trimmed);
  if (!parsed) return;

  const issues = findCommandIssues(parsed);
  if (issues.length) {
    pendingSession.parsed = parsed;
    pendingSession.issues = issues;
    pendingSession.awaitingReply = true;
    await showClarificationQuestion(pendingSession);
    return;
  }

  await tryExecute(parsed, ctx);
}

async function runRepl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = makePrompt(rl);
  const ctx = { askConfirm: makeAskConfirm(prompt), prompt };

  console.log('Type natural language (or /help):\n');

  while (true) {
    const line = await prompt('> ');
    try {
      await handleInput(line, ctx);
    } catch (err) {
      console.error('\nError:', err.message);
    }
    console.log('');
  }
}

async function main() {
  console.log('Budget-Bunny CLI — natural language → Chat API → Google Sheet\n');

  if (process.env.OPENAI_API_KEY) {
    console.log(`OpenAI model: ${MODEL}`);
  } else {
    console.error('Warning: OPENAI_API_KEY not set');
  }

  if (process.env.APPS_SCRIPT_URL) {
    try {
      const health = await healthCheck();
      console.log('Sheet API:', health?.status === 'ok' ? 'connected' : health);
    } catch (e) {
      console.warn('Sheet health check failed:', e.message);
    }
    await refreshCategories();
    console.log(`Loaded ${categories.length} main categories`);
  } else {
    console.warn('APPS_SCRIPT_URL not set — parse-only mode until configured');
    dryRun = true;
  }

  console.log(`Dry-run: ${dryRun ? 'ON' : 'OFF'}  (/dry to toggle)\n`);
  printHelp();

  const oneShot = process.argv.slice(2).join(' ').trim();
  if (oneShot) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ctx = { askConfirm: makeAskConfirm(makePrompt(rl)), prompt: makePrompt(rl) };
    await handleInput(oneShot, ctx);
    while (pendingSession) {
      const line = await ctx.prompt('> ');
      await handleInput(line, ctx);
    }
    rl.close();
    return;
  }

  await runRepl();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
