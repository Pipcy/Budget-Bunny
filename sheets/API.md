# Budget-Bunny Sheet API

Version **1.1** — main categories + subcategories + BudgetGuide targets.

Every POST includes `"token": "your-api-token"`.

---

## getCategories

```json
{
  "token": "...",
  "action": "getCategories"
}
```

**Response:**

```json
{
  "categories": [
    {
      "name": "Groceries",
      "group": "Needs",
      "color": "#50C878",
      "subcategories": ["Costco", "Trader Joes"]
    },
    {
      "name": "Rent",
      "group": "Needs",
      "color": "#4A90D9",
      "subcategories": []
    }
  ]
}
```

Pass this structure to your Chat API so the model only uses valid main/sub names.

---

## getBalances

```json
{
  "token": "...",
  "action": "getBalances"
}
```

**Response:**

```json
{
  "main": [
    {
      "category": "Groceries",
      "group": "Needs",
      "budget": 400,
      "spent": 45,
      "remaining": 355
    }
  ],
  "sub": [
    {
      "subcategory": "Costco",
      "parentCategory": "Groceries",
      "budget": 250,
      "spent": 45,
      "remaining": 205
    }
  ]
}
```

Budget amounts come from **BudgetGuide** rows where **Rule Type** = `Monthly`.

---

## addTransaction

```json
{
  "token": "...",
  "action": "addTransaction",
  "data": {
    "date": "2026-06-10",
    "merchant": "Costco",
    "amount": 45,
    "paymentMethod": "Card",
    "source": "voice",
    "splits": [
      {
        "category": "Groceries",
        "subcategory": "Costco",
        "amount": 45
      }
    ]
  }
}
```

| Split field | Required | Notes |
|-------------|----------|-------|
| `category` | yes | Main category from **Categories** tab |
| `subcategory` | no | Must exist under that parent in **Subcategories** |
| `amount` | yes | Must sum to transaction total |
| `reimbursementStatus` | no | `Pending payment` (counts until paid back) or `Paid` (excluded from spent). Blank = normal expense. |
| `notes` | no | Per-split context for matching reimbursements (e.g. `Alex — food`). Shown on **Splits** and **Ledger**. |

**Merchant:** use a real store name only. If the user did not name a venue, send `"Not specified"` and put context in `notes` / split `notes`.

### Reimbursement flow

**1. Pay for group** — friends' portion uses `reimbursementStatus: "Pending payment"`:

```json
"splits": [
  { "category": "Dining", "amount": 50 },
  { "category": "Dining", "amount": 70, "reimbursementStatus": "Pending payment" }
]
```

**2. Friend pays back** — two commands:

```json
{ "action": "addIncome", "data": { "amount": 70, "source": "Zelle", "notes": "James — South Bay lunch" } }
```

```json
{
  "action": "markReimbursementPaid",
  "data": { "amount": 70, "payerName": "James", "keywords": ["lunch", "Alex"] }
}
```

`markReimbursementPaid` searches the **Splits** tab for rows with **Reimbursement Status = Pending payment**, then filters by amount, payer name (in split/transaction Notes), keywords (in Notes + merchant + category), and optionally merchant (ignored when generic / `Not specified`). Matching rows are set to **Paid**.

### searchPendingReimbursements

```json
{
  "action": "searchPendingReimbursements",
  "data": { "merchant": "South Bay" }
}
```

Main-only example:

```json
"splits": [{ "category": "Rent", "amount": 1500 }]
```

---

## addIncome

Unchanged. When `applyBudgetGuide: true`, only **Income Fixed** and **Income Percent** rows from BudgetGuide are used.

```json
{
  "token": "...",
  "action": "addIncome",
  "data": {
    "date": "2026-06-10",
    "amount": 3200,
    "source": "Paycheck",
    "applyBudgetGuide": true
  }
}
```

Income notes will show lines like `Main · Groceries: $384.00`.

---

## addSubcategory

Create a subcategory under a main category.

```json
{
  "token": "...",
  "action": "addSubcategory",
  "data": {
    "parentCategory": "Dining",
    "subcategory": "Coffee",
    "monthlyBudget": 60
  }
}
```

`monthlyBudget` is optional — adds a **Sub · Monthly** row in BudgetGuide.

---

## searchTransactions

Find past splits for LLM review or keyword pre-filter.

```json
{
  "token": "...",
  "action": "searchTransactions",
  "data": {
    "mainCategory": "Dining",
    "missingSubcategoryOnly": true,
    "keywords": ["coffee", "starbucks", "cafe"]
  }
}
```

Omit `keywords` to return all matching rows (e.g. every Dining split with no sub) for the LLM to classify.

**Response:**

```json
{
  "transactions": [
    {
      "transactionId": "A1B2C3D4",
      "splitRow": 5,
      "date": "2026-05-12",
      "merchant": "Starbucks",
      "notes": "",
      "mainCategory": "Dining",
      "subcategory": "",
      "amount": 6.5
    }
  ],
  "count": 1
}
```

---

## bulkReclassifySplits

After user confirms on phone, apply subcategory to existing rows.

```json
{
  "token": "...",
  "action": "bulkReclassifySplits",
  "data": {
    "updates": [
      {
        "transactionId": "A1B2C3D4",
        "mainCategory": "Dining",
        "subcategory": "Coffee"
      }
    ]
  }
}
```

---

## reclassifyByKeywords

Simple path without LLM — keyword match only.

```json
{
  "token": "...",
  "action": "reclassifyByKeywords",
  "data": {
    "parentCategory": "Dining",
    "subcategory": "Coffee",
    "keywords": ["coffee", "starbucks", "dunkin", "cafe", "latte"],
    "missingSubcategoryOnly": true
  }
}
```

Creates the sub if needed, searches, and updates all keyword matches in one step.

---

## Voice command flow (iPhone)

Example: *"Add a subcategory under Dining called Coffee, and move coffee-related past entries there."*

```mermaid
sequenceDiagram
  participant User
  participant iPhone
  participant LLM as User Chat API
  participant Sheet as Apps Script

  User->>iPhone: voice
  iPhone->>LLM: parse intent
  iPhone->>Sheet: addSubcategory
  iPhone->>Sheet: searchTransactions (Dining, no sub)
  iPhone->>LLM: which merchants are coffee?
  LLM-->>iPhone: transaction IDs
  iPhone->>User: confirm list
  User->>iPhone: yes
  iPhone->>Sheet: bulkReclassifySplits
```

The **LLM runs on the phone** (user's API key). The sheet only stores data and applies confirmed updates.

---

## Errors

```json
{ "error": "Unknown subcategory \"Costco\" under \"Groceries\". Check Subcategories tab." }
{ "error": "Unknown main category \"Food\". Must match Categories tab exactly." }
```
