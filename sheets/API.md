# Budget-Flow Sheet API

The iPhone app talks to your sheet via the **Apps Script web app URL**. Every POST includes your API token.

**Base URL:** `https://script.google.com/macros/s/.../exec` (from Deploy → Web app)

**Health check (GET, no token):**

```http
GET /exec
→ { "status": "ok", "app": "Budget-Flow", "version": "1.0" }
```

All write/read operations use **POST** with JSON body.

---

## Authentication

Every POST body must include:

```json
{
  "token": "your-api-token-from-generateApiToken",
  "action": "...",
  "data": { }
}
```

`data` is only required for `addTransaction` and `addIncome`.

---

## Actions

### `getCategories`

Returns active categories for LLM parsing and validation.

**Request:**

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
      "monthlyBudget": 400,
      "color": "#50C878"
    }
  ]
}
```

---

### `getBalances`

Budget vs spent for the month selected on Dashboard (cell B3).

**Request:**

```json
{
  "token": "...",
  "action": "getBalances"
}
```

**Response:**

```json
{
  "balances": [
    {
      "category": "Groceries",
      "budget": 400,
      "spent": 127.5,
      "remaining": 272.5
    }
  ]
}
```

---

### `addTransaction`

**Request:**

```json
{
  "token": "...",
  "action": "addTransaction",
  "data": {
    "date": "2026-06-10",
    "merchant": "Whole Foods",
    "amount": 45,
    "paymentMethod": "Card",
    "notes": "",
    "receiptUrl": "",
    "source": "voice",
    "splits": [
      { "category": "Groceries", "amount": 35 },
      { "category": "Shopping", "amount": 10 }
    ]
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `date` | yes | `YYYY-MM-DD` |
| `amount` | yes | Positive number; expense total |
| `splits` | yes | Must sum to `amount`; categories must exist on Categories tab |
| `merchant` | no | |
| `paymentMethod` | no | Card, Cash, Zelle, Venmo, Other |
| `source` | no | `manual`, `voice`, `receipt` |
| `receiptUrl` | no | Google Drive link |

**Response:**

```json
{ "id": "A1B2C3D4", "success": true }
```

---

### `addIncome`

**Request:**

```json
{
  "token": "...",
  "action": "addIncome",
  "data": {
    "date": "2026-06-10",
    "amount": 3200,
    "source": "Paycheck",
    "notes": "",
    "applyBudgetGuide": true
  }
}
```

**Response:**

```json
{ "success": true }
```

When `applyBudgetGuide` is true, allocation suggestions are appended to the Income row Notes column.

---

## Errors

```json
{ "error": "Invalid API token" }
{ "error": "Unknown category \"Coffee\". Must match Categories tab exactly." }
{ "error": "Split total ($40) must equal transaction amount ($45)" }
```

---

## iPhone integration notes

1. Store **web app URL** and **token** in iOS Keychain
2. On app launch (optional): `GET` health check
3. Before parsing voice: `getCategories` → pass names to Chat API
4. After user confirms: `addTransaction` or `addIncome`
5. Use `URLSession` with redirects enabled (Google may 302 once)

Example Swift shape:

```swift
struct SheetRequest: Encodable {
    let token: String
    let action: String
    var data: TransactionData?
}
```

No always-on server — the app calls this URL only when the user is actively logging or checking balances.
