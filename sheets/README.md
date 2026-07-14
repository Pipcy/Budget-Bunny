# Budget-Bunny — Google Sheet setup

## Sync script from this repo (recommended)

Use **[clasp](https://github.com/google/clasp)** — Google's CLI — to push local files to your sheet's Apps Script instead of copy-pasting.

### One-time setup

1. **Install Node.js** if you don't have it, then from the project root:

```powershell
cd c:\Projects\Budget-Flow
npm install
npm run sheet:login
```

Browser opens → sign in with the Google account that owns your sheet.

2. **Get your Script ID** from Apps Script (Extensions → Apps Script in your sheet).  
   URL looks like: `https://script.google.com/home/projects/SCRIPT_ID_HERE/edit`

3. **Link the repo:**

```powershell
copy sheets\.clasp.json.example sheets\.clasp.json
```

Edit `sheets/.clasp.json` and replace `PASTE_YOUR_SCRIPT_ID_HERE` with your Script ID.

4. **Push code to Google:**

```powershell
npm run sheet:push
```

5. In Apps Script (or reload the sheet), run **`setupWorkbook`** once if this is a fresh sheet.

### Day-to-day workflow

| You edit… | Then run… |
|-----------|-----------|
| Files in `sheets/apps-script/` | `npm run sheet:push` |
| Want to pull changes made in Google's editor | `npm run sheet:pull` |
| Open Apps Script in browser | `npm run sheet:open-script` |

After `sheet:push`, create a **new deployment version** if you already deployed the web app (Deploy → Manage deployments → Edit → New version).

**Important:** `sheet:push` updates the script editor only. Your `/exec` URL is tied to a **deployment version**. If the CLI returns `Unknown action` after a push, your `.env` URL is probably on an old version.

```powershell
npm run sheet:deployments
```

Look for `@3` (or highest number). Either:
- Update `APPS_SCRIPT_URL` in `.env` to that deployment's URL, **or**
- Apps Script → Deploy → Manage deployments → Edit → Version → pick latest → Deploy (keeps same URL)

Check which version is live: open `/exec` in browser — should show `"version":"1.5"` (or newer).

> `sheets/.clasp.json` is gitignored — each person/sheet has its own Script ID.

### New sheet from scratch (alternative)

If you haven't created Apps Script yet:

```powershell
cd sheets
clasp create --type sheets --title "Budget-Bunny" --parentId YOUR_SPREADSHEET_ID --rootDir apps-script
```

Spreadsheet ID is in the sheet URL:  
`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

Then `npm run sheet:push` from the project root.

---

## Manual setup (without clasp)

1. Create a Google Sheet → **Extensions → Apps Script**
2. Paste files from `sheets/apps-script/` by hand
3. Run **`setupWorkbook`**

---

## Data model
| Tab | Purpose |
|-----|---------|
| **Categories** | Main categories (+ **Context** for LLM) |
| **Subcategories** | Optional detail under a main category (+ **Context**) |
| **Transactions / Splits** | Payments; splits use main + optional sub |
| **Ledger** | Auto-generated flat view |
| **MonthlySummary** | Spent per main category (SUM from **Splits**) |
| **Dashboard** | Month picker + total spent |

---

## Setup steps

See previous steps 1–8 in this file. After pasting Apps Script, run **`setupWorkbook`**.

> **Already customized your sheet?** Updating Apps Script and re-running `setupWorkbook` **clears all tabs**. Export or copy your categories first, then paste back after setup.
>
> Running **Setup workbook** or **Refresh report formulas** also deletes obsolete tabs **Income**, **BudgetGuide**, and **SubcategorySummary** if they still exist.

### Customize

1. **Categories** — main categories + Context (helps the LLM)
2. **Subcategories** — Parent Category must match Categories exactly
3. **Dashboard B3** — current month (`YYYY-MM`)

### Log a split with subcategory

```javascript
addTransaction({
  date: '2026-06-10',
  merchant: 'Costco',
  amount: 45,
  paymentMethod: 'Card',
  source: 'manual',
  splits: [{ category: 'Groceries', subcategory: 'Costco', amount: 45 }],
});
```

Main-only split (no sub):

```javascript
splits: [{ category: 'Rent', amount: 1500 }]
```

Full API: [API.md](./API.md)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Sub rejected | Subcategory must exist under that parent on **Subcategories** |
| MonthlySummary Spent is 0 | Menu → **Refresh report formulas**; confirm Splits have Transaction Time and Dashboard B3 month |
| Main spent includes subs | By design — all splits under that Main Category sum together |
