# Budget-Bunny CLI

Test natural language → **OpenAI** → **Google Sheet** before building the iPhone app.

Same flow the phone will use: your Chat API key parses commands; Apps Script writes to the sheet.

## Setup

1. Install [Node.js](https://nodejs.org)

2. Install dependencies:

```powershell
cd c:\Projects\Budget-Flow
npm install
```

3. Copy config:

```powershell
copy .env.example .env
```

4. Fill in `.env`:

| Variable | Where to get it |
|----------|-----------------|
| `OPENAI_API_KEY` | [OpenAI API keys](https://platform.openai.com/api-keys) |
| `APPS_SCRIPT_URL` | Sheet → Settings tab → web app `/exec` URL |
| `APPS_SCRIPT_TOKEN` | Sheet → Budget-Bunny menu → Generate API token |

5. Push latest script if you haven't:

```powershell
npm run sheet:push
```

## Run

**Interactive mode** (REPL):

```powershell
npm run cli
```

**One-shot**:

```powershell
npm run cli -- "spent 12 on coffee, dining, cash"
npm run cli -- "spent 5.50 at Starbucks and 16.40 at Target"
npm run cli -- "add subcategory Coffee under Dining and move past coffee shops there"
npm run cli -- "show my balances"
```

## REPL commands

| Command | Action |
|---------|--------|
| `/dry` | Toggle dry-run (parse only, no sheet writes) |
| `/categories` | Reload categories from sheet |
| `/cancel` | Abandon an in-progress clarification |
| `/help` | Help |
| `/quit` | Exit |

## Example session

**Clarification when info is missing:**
```
> spent 5 dollars

Budget-Bunny: Where did you spend it?
> starbucks

--- Parsed ---
{ "summary": "Log $5 at Starbucks, Dining/Coffee", ... }
Execute 1 command? [y/N] y
```

If the sheet rejects a command (unknown category, etc.), the CLI asks a follow-up question and retries with your answer. Use `/cancel` to drop the in-progress command.

**Single command:**
```
> spent 45 at Costco, groceries
Execute 1 command? [y/N] y
--- Results (1/1 succeeded) ---
```

**Multiple commands in one phrase:**
```
> spent 5.50 at Starbucks and 16.40 at Target
--- Parsed ---
{
  "summary": "Log $5.50 at Starbucks and $16.40 at Target",
  "commands": [
    { "intent": "addTransaction", "summary": "Starbucks $5.50", "payload": { ... } },
    { "intent": "addTransaction", "summary": "Target $16.40", "payload": { ... } }
  ]
}
Execute 2 commands? [y/N] y
```

## Subcategory + retroactive reclassify

For: *"add subcategory Coffee under Dining and move coffee-related past entries"*

1. CLI parses → `addSubcategoryWithReclassify`
2. Creates sub on sheet
3. Fetches past Dining rows with no sub
4. **Second LLM call** picks coffee-related merchants
5. Shows list → you confirm → `bulkReclassifySplits`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `OPENAI_API_KEY` missing | Add to `.env` |
| Sheet returns HTML | Use `/exec` URL; deploy web app as **Anyone** |
| Wrong category names | Run `/categories`; edit Categories tab |
| `npm` not found | Install Node.js, restart terminal |

This CLI is the reference implementation for the iPhone app parser and orchestrator.
