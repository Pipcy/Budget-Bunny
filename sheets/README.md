# Budget-Flow — Google Sheet setup

Follow these steps in order. Total time: ~15 minutes.

## Step 1: Create the spreadsheet

1. Open [Google Sheets](https://sheets.google.com)
2. **Blank spreadsheet**
3. Rename it **Budget-Flow**

## Step 2: Paste Apps Script

1. In the sheet: **Extensions → Apps Script**
2. Rename the project **Budget-Flow**
3. Remove the default `Code.gs` contents
4. Create **four** script files and paste from this repo:

| Apps Script file | Copy from |
|------------------|-----------|
| `Code.gs` | `sheets/apps-script/Code.gs` |
| `Setup.gs` | `sheets/apps-script/Setup.gs` |
| `Auth.gs` | `sheets/apps-script/Auth.gs` |
| `appsscript.json` | Project settings → paste `sheets/apps-script/appsscript.json` |

5. **Save** (Ctrl+S)

## Step 3: Run setup

1. In the function dropdown, select **`setupWorkbook`**
2. Click **Run**
3. **Review permissions** → choose your Google account → Advanced → Allow
4. When prompted, click OK on “Setup complete”
5. Switch back to the spreadsheet — you should see 9 tabs including **Dashboard** and **Settings**

## Step 4: Customize your budget

1. **Categories** — edit names, monthly budgets, groups (Needs / Wants / Savings)
2. **BudgetGuide** — how to split income after payday (% or Fixed)
3. **Dashboard** — cell **B3** = current month (`2026-06`)

## Step 5: Try sample data (optional)

1. Reload the spreadsheet
2. Menu: **Budget-Flow → Add sample data**
3. Check **Dashboard** and **MonthlySummary**

## Step 6: Deploy web app (for iPhone later)

1. Apps Script editor → **Deploy → New deployment**
2. Type: **Web app**
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. **Deploy** → copy the **Web app URL** (ends in `/exec`)
5. Paste URL into **Settings** tab cell **B3** in your sheet

## Step 7: Generate API token

1. Reload spreadsheet
2. Menu: **Budget-Flow → Generate API token**
3. Copy the token — save for your iPhone app
4. Token is also stored on **Settings** tab cell **B4**

## Step 8: Test the API

1. Menu: **Budget-Flow → Test API (getCategories)**
2. You should see JSON with your categories

Or test from PowerShell (replace URL and token):

```powershell
$body = @{
  token  = "YOUR_TOKEN_HERE"
  action = "getCategories"
} | ConvertTo-Json

Invoke-RestMethod -Uri "YOUR_WEB_APP_URL" -Method Post -Body $body -ContentType "application/json"
```

---

## Tabs reference

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Month picker, income/spent/net, over-budget list |
| **Categories** | Budget categories and monthly limits |
| **Transactions** | One row per payment |
| **Splits** | Category breakdown per payment |
| **Ledger** | Auto-generated (do not edit) |
| **Income** | Paychecks, Zelle in, etc. |
| **BudgetGuide** | Post-income allocation rules |
| **MonthlySummary** | Budget vs spent per category |
| **Settings** | Web app URL + API token reference |

## Manual logging (until iPhone app exists)

In Apps Script, run from the editor:

```javascript
addTransaction({
  date: '2026-06-10',
  merchant: 'Coffee Shop',
  amount: 12,
  paymentMethod: 'Cash',
  source: 'manual',
  splits: [{ category: 'Dining', amount: 12 }],
});
```

Full API contract: see [API.md](./API.md).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `setupWorkbook` not in dropdown | Save all `.gs` files; refresh Apps Script page |
| Permission denied | Re-run and complete Google authorization |
| Ledger shows `#N/A` | Transaction ID in Splits must exist in Transactions |
| Category rejected | Name must match **Categories** tab exactly (case-sensitive) |
| API returns `Invalid API token` | Regenerate token; include `"token"` in every POST body |
| POST returns HTML login page | Deploy as **Anyone**; use `/exec` URL not `/dev` |
