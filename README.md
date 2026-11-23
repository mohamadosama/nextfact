# NextFact — DRC FACT+ / DGI E-Invoicing for ERPNext & POSNext

[![Frappe Framework](https://img.shields.io/badge/Frappe-v15%20%7C%20v16-blue.svg)](https://frappeframework.com/)
[![ERPNext](https://img.shields.io/badge/ERPNext-v15%20%7C%20v16-blue.svg)](https://erpnext.com/)
[![POSNext](https://img.shields.io/badge/POSNext-Integrated-emerald.svg)](https://github.com/posawesome/posawesome)
[![DRC DGI](https://img.shields.io/badge/DRC%20DGI-e--DEF%20%2F%20e--MCF-green.svg)](https://dgi.gouv.cd)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**NextFact** is the official, enterprise-grade Frappe / ERPNext integration for the Democratic Republic of Congo (**DRC**) **DRC FACT+** gateway, complying with **DGI** (Direction Générale des Impôts) e-DEF / e-MCF fiscalization mandates.

It provides turnkey fiscal compliance for retail cashiers (via **POSNext**), back-office accounting teams (via **ERPNext Desk**), and automated background reconciliation.

---

## Table of Contents
- [Key Features](#key-features)
- [System Architecture & Design Principles](#system-architecture--design-principles)
- [DocTypes & Core Concepts](#doctypes--core-concepts)
- [Prerequisites & Compatibility](#prerequisites--compatibility)
- [Installation Guide](#installation-guide)
- [Configuration & Settings Guide](#configuration--settings-guide)
  - [1. DRC Fact Settings](#1-drc-fact-settings)
  - [2. DRC POS Mapping](#2-drc-pos-mapping)
  - [3. DRC POS Route (Optional Routing Engine)](#3-drc-pos-route-optional-routing-engine)
  - [4. Item & Company Fiscal Defaults](#4-item--company-fiscal-defaults)
- [User Guide & Workflows](#user-guide--workflows)
  - [POSNext Cashier Workflow](#posnext-cashier-workflow)
  - [ERPNext Desk & Accounting Workflow](#erpnext-desk--accounting-workflow)
  - [NextFact Desk Workspace](#nextfact-desk-workspace)
- [DGI Fiscal Rules & Specifications](#dgi-fiscal-rules--specifications)
  - [Tax Groups](#tax-groups)
  - [Multi-Currency (CDF / USD) & FX Rates](#multi-currency-cdf--usd--fx-rates)
  - [Customer Classifications & NIF Requirements](#customer-classifications--nif-requirements)
  - [Credit Notes & Cancellations (FA / RAN)](#credit-notes--cancellations-fa--ran)
  - [Thermal Receipt Specifications (80mm / 62.4mm)](#thermal-receipt-specifications-80mm--624mm)
- [API Reference](#api-reference)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [License](#license)

---

## Key Features

1. **Native POSNext Cashier Integration**:
   - Single-click **Report + VAT Receipt** button directly at checkout.
   - Dual actions in Invoice History: **VAT Receipt** (official fiscal thermal receipt) and **Delivery Note** (non-fiscal logistical document).
   - Real-time cashier feedback with clear error alerts and visual state changes (e.g., transitions to **Retry VAT** upon gateway rejection).
2. **Strict Print Guard & Compliance Assurance**:
   - Un-normalized invoices **can never** print an official fiscal receipt. The backend throws an exception preventing non-fiscal or failed receipts from rendering.
   - Duplicate thermal prints automatically display an official **DUPLICATA** banner and are logged in an immutable audit trail (`DRC Print Log`).
3. **Zero Item Catalog Pre-Sync**:
   - Does not require pre-syncing ERPNext's item catalog with the gateway. Uses real-time free-line construction compliant with DRC FACT+ specification.
4. **Resilient Gateway Communication**:
   - Two-checkpoint database commit architecture ensuring no orphan records if network is lost mid-call.
   - Advisory locking per e-MCF device ID to eliminate hardware concurrency collisions (Error 63).
   - Smart retry engine: automatically applies retry suffixes (`-R1`, `-R2`) on failed normalizations so DRC FACT+ creates a clean draft instead of replaying rejected payloads.
5. **Multi-Currency & Automatic FX Conversion**:
   - Automatic live exchange rate resolution from DRC FACT+ (`/rate`) and Banque Centrale du Congo (BCC) for USD / foreign currency sales.
6. **Executive Workspace & Reporting**:
   - Dedicated Frappe v15/v16 Desktop Workspace and App icon.
   - Pre-built fiscal reports: **DRC Declared Turnover** and **DRC Fiscal Reconciliation**.

---

## System Architecture & Design Principles

```
  ┌────────────────────────────────────────────────────────┐
  │                    ERPNext / POSNext                   │
  │                                                        │
  │  POS Checkout      Desk Sales Invoice     Auto Poll    │
  │       │                     │                  │       │
  └───────┼─────────────────────┼──────────────────┼───────┘
          │                     │                  │
          ▼                     ▼                  ▼
  ┌────────────────────────────────────────────────────────┐
  │                   NextFact Orchestrator                │
  │                                                        │
  │   1. Advisory Lock (e-MCF Device Mutex)                │
  │   2. Idempotency Check (DRC Fiscal Action)             │
  │   3. Payload Builder & Tax Group Resolution            │
  │   4. Two-Checkpoint Database Commit                    │
  │   5. Print Guard & DGI QR Generator (34mm Base64)      │
  └─────────────────────────────┬──────────────────────────┘
                                │
                                ▼
  ┌────────────────────────────────────────────────────────┐
  │                 DRC FACT+ API Gateway                  │
  │                                                        │
  │   • POST /integrations/v1/invoices (Create Draft)      │
  │   • POST /integrations/v1/invoices/{id}/normalize      │
  │   • GET  /integrations/v1/invoices/{id} (Verify)       │
  │   • GET  /integrations/v1/rate (Exchange Rates)        │
  └─────────────────────────────┬──────────────────────────┘
                                │
                                ▼
  ┌────────────────────────────────────────────────────────┐
  │                 DGI e-MCF / e-DEF Hardware             │
  │   (Secured Fiscal Signing, DEF Code & Counters)        │
  └────────────────────────────────────────────────────────┘
```

- **Two-Checkpoint Commit**:
  1. *Checkpoint 1*: Draft created on gateway → `drcfact_invoice_id` and amounts recorded and committed to the database.
  2. *Checkpoint 2*: Normalization call succeeds → DEF code, counters, NIM, and QR image recorded and committed.
- **Fail-Safe Verification Loop**:
  If a network timeout occurs during normalization (HTTP 409/502/timeout), the record is transitioned to `Pending Verification`. A recurring background scheduler polls the gateway every 5 minutes until confirmed.

---

## DocTypes & Core Concepts

| DocType | Type | Description |
|---|---|---|
| **`DRC Fact Settings`** | Single | Global settings: integration toggle, default price mode (`ttc`/`ht`), default tax group, language, and receipt headers. |
| **`DRC POS Mapping`** | Master | Hardware mapping connecting a store/POS profile with an e-MCF device, API URL, and API Key. |
| **`DRC POS Route`** | Master | Rule-based routing engine determining which mapping an invoice should use based on POS profile, company, warehouse, or amount. |
| **`DRC Fiscal Invoice`** | Transaction | Fiscal record linked 1-to-1 with a Sales Invoice. Stores DGI DEF code, NIM, counters, QR code, and JSON payloads. |
| **`DRC Print Log`** | Audit Log | Read-only ledger recording every physical print (type, copy number, operator, timestamp). |
| **`DRC Fiscal Action`** | System | High-performance idempotency table ensuring concurrent requests with the same key replay cached responses. |
| **`DRC Fact Log`** | System | Raw technical logging of HTTP requests/responses for debugging and audit compliance. |

---

## Prerequisites & Compatibility

- **Frappe Framework**: Version 15 or 16
- **ERPNext**: Version 15 or 16
- **POSNext**: Optional, but recommended for physical retail environments.
- **Node.js**: Node 24 is required when building POSNext frontend assets.
- **Python**: Python 3.11, 3.12, 3.13, or 3.14.

---

## Installation Guide

### 1. Fetch App into Frappe Bench
```bash
cd /home/frappe/frappe-bench
bench get-app https://github.com/mohamadosama/nextfact.git
```

### 2. Install on Target Site
```bash
bench --site your-site.com install-app nextfact
bench --site your-site.com migrate
```

### 3. Rebuild POSNext Frontend Assets (If POSNext is installed)
POSNext frontend components are automatically patched during installation. Build the frontend assets using Node 24:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24

bench build --app pos_next
```

### 4. Restart Background & Web Workers
```bash
bench restart
# Or for supervisor setups:
sudo supervisorctl restart frappe-bench-web:
sudo supervisorctl restart frappe-bench-workers:
```

---

## Configuration & Settings Guide

### 1. DRC Fact Settings
Navigate to **Desk > NextFact > DRC Fact Settings** (or search in the Awesomebar).

1. **Integration Status**: Check **Enabled** to activate reporting.
2. **Fiscal Defaults**:
   - **Default Tax Group**: Set to `B` (16% Standard VAT) or `K` (Exempt / Non-assujetti).
     > **Important for Sandbox**: The DRC FACT+ sandbox gateway requires manual authorization on the web portal for Group K. For automated sandbox testing, **Group B** normalizes immediately.
   - **Default Price Mode**: `ttc` (Prices in ERPNext include tax) or `ht` (Prices exclude tax).
3. **Receipt Branding**:
   - **Receipt Company Name**: Enter trading name to appear on thermal receipts.
   - **Receipt Language**: Choose `French (fr)` or `English (en)`.
   - **Generated By Text**: e.g., `Certifié par DRC FACT+`.
   - **Certification / Software Text**: e.g., `Agrément DGI / e-DEF No. ...`.
   - **Receipt Footer**: Promotional or informational closing line.
   - **Show FX on Receipt**: Enable if foreign currency conversions should be displayed.

---

### 2. DRC POS Mapping
Navigate to **Desk > NextFact > DRC POS Mapping**. Create a mapping record for each physical branch or cashier device:

| Field | Description | Example |
|---|---|---|
| **Mapping Name** | Descriptive title | `Downtown Branch - Register 1` |
| **Company** | Linked ERPNext Company | `FoodTown SARL` |
| **Environment** | Gateway environment | `Sandbox` or `Production` |
| **API Base URL** | Endpoint URL | `https://app.drcfactplus.com` |
| **API Key** | Bearer authorization token | Provided by DRC FACT+ |
| **e-MCF NID** | Hardware device ID assigned by DGI | `CD01005383-1` |
| **Receipt Point Name** | Location name on fiscal receipt | `Caisse Principale` |
| **Company NIF** | Taxpayer ID Number | `A2220182M` |

Click **Test Connection** to confirm connectivity and retrieve device status.

---

### 3. DRC POS Route (Optional Routing Engine)
Navigate to **Desk > NextFact > DRC POS Route**. Use routes when:
- Multiple POS Profiles route to the same e-MCF device.
- Specific warehouses or transaction types need dynamic hardware routing.
- The cashier should be prompted with a choice between multiple billing entities.

---

### 4. Item & Company Fiscal Defaults

1. **Company Expense Accounts**:
   Ensure Company has valid default stock accounts set (**Company > Stock Settings**):
   - `Default Expense Account`
   - `Cost of Goods Sold Account`
   - `Stock Adjustment Account`
2. **Item DRC Type & Tax Group**:
   - NextFact adds custom fields to the `Item` and `Item Group` doctypes:
     - **DRC Item Type**: `BIE` (Good/Bien), `SER` (Service), or `TAX` (Specific Tax). Default is `BIE`.
     - **DRC Tax Group Override**: Optional per-item tax group (`B`, `K`, `A`, `Q`, etc.). If blank, uses the Item Group override or falls back to global settings.

---

## User Guide & Workflows

### POSNext Cashier Workflow

```
[ Cart Screen ] ──► [ Complete Payment ]
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
 [ Complete (Standard) ]           [ Report + VAT Receipt ]
 (Saves ERPNext invoice only)     (Normalizes with DGI & prints)
```

1. **Checkout**:
   - In POSNext Checkout, click the green **Report + VAT Receipt** button.
   - The invoice is submitted to ERPNext, verified against negative stock and GL rules, and sent to DRC FACT+.
   - Upon successful normalization, the 80mm thermal receipt opens in a print window with the DGI DEF code and QR code.
2. **Invoice History Actions**:
   - Open **Invoice Management** in POSNext.
   - Each card displays two NextFact action buttons:
     - **VAT Receipt**:
       - If already normalized: opens official thermal receipt.
       - If failed or pending: triggers normalization. If rejected, displays a descriptive error message and switches button state to **Retry VAT**.
     - **Delivery Note**:
       - Prints an official non-fiscal logistical Delivery Note showing item quantities and transport signatures.

---

### ERPNext Desk & Accounting Workflow

1. **Individual Sales Invoice**:
   - Open any submitted `Sales Invoice` (`docstatus = 1`).
   - A dedicated **DRC Fiscal** button group appears in the top action bar:
     - **Report to DRC FACT+**: Normalizes the invoice.
     - **Print DRC Fiscal Receipt**: Opens thermal receipt (disabled if not normalized).
     - **Print NextFact Delivery Note**: Opens non-fiscal delivery slip.
2. **Bulk Reporting**:
   - In the **Sales Invoice List**, select multiple invoices.
   - Click **Actions > Report to DRC FACT+**.
   - NextFact processes invoices sequentially with advisory locking, displaying a live progress bar.
3. **Audit Verification**:
   - Open **DRC Fiscal Invoice** to review DGI security elements (`dgi_code_def`, `dgi_counters`, `dgi_nim`, `dgi_datetime`, and raw JSON payloads).

---

### NextFact Desk Workspace

NextFact provides an official Frappe Desk Workspace accessible via the App icon on the desktop:

- **Quick Shortcuts**:
  - `Start POS` (`/pos/`)
  - `Sales Invoice`
  - `DRC Fiscal Invoice`
  - `DRC Fact Settings`
  - `DRC POS Mapping`
  - `Item`
  - `Customer`
  - `Declared Turnover Report`
- **Audit Cards**:
  - *Invoicing & Fiscalization*: Direct links to fiscal invoices and print logs.
  - *Configuration & POS Mappings*: Mappings, routes, and profile associations.
  - *Reports & Audit Logs*: Declared Turnover, Fiscal Reconciliation, and Fact Logs.

---

## DGI Fiscal Rules & Specifications

### Tax Groups

| Code | Rate | Description | Gateway Rules |
|:---:|:---:|---|---|
| **B** | 16% | Standard VAT (TVA Standard) | Supported in Sandbox & Production. |
| **K** | 0% | Exempt / Non-assujetti | Requires manual portal approval in Sandbox; fully supported in Production. |
| **A** | 0% | Export / Special Exempt | Validated according to DGI export rules. |
| **Q / R / S** | Custom | Special sectors | Admin can configure manually; sent as-is to gateway. |

---

### Multi-Currency (CDF / USD) & FX Rates

- The legal accounting currency in DRC is **CDF (Congolese Franc)**.
- For invoices created in **USD** or other currencies:
  - NextFact calls DRC FACT+ `GET /rate` to obtain the official BCC exchange rate for the posting date.
  - Line amounts and tax ventilation are converted to CDF for DGI registration.
  - The thermal receipt displays the original currency, the applied exchange rate, and the final total in CDF.

---

### Customer Classifications & NIF Requirements

NextFact adds `custom_drc_client_type` to `Customer`:

| Client Type | Label | DGI Validation Requirement |
|---|---|---|
| **PP** | Particulier (Consumer) | No NIF required. |
| **PM** | Entreprise (Company) | **NIF / Tax ID is strictly required**. NextFact enforces pre-flight validation. |
| **PC** | Société Commerciale | NIF required. |
| **PL** | Profession Libérale | NIF required. |
| **AO** | Ayant Droit / Exonéré | Exemption certificate number required. |

---

### Credit Notes & Cancellations (FA / RAN)

- DRC fiscal legislation strictly prohibits deleting or altering normalized invoices.
- When an invoice is cancelled in ERPNext, NextFact validates that a fiscal credit note (**FA - Note de Crédit**) is registered with the DGI.
- The credit note references the original **Code DEF** and original **Invoice ID** via the `RAN` (Régularisation / Annulation) reference protocol.

---

### Thermal Receipt Specifications (80mm / 62.4mm)

NextFact includes a pixel-accurate print format compliant with DGI technical criteria:

```
+------------------------------------------------+
|                   FOODTOWN                     |
|           Régime fiscal: Réel Général          |
|                 NIF: A2220182M                 |
|          Point de vente: Caisse Principale     |
|             Opérateur: Administrator           |
|------------------------------------------------|
| Ticket : FV/2026/00040                         |
| FV - FACTURE DE VENTE                          |
| Date : 2026-11-23 00:48:11                     |
|------------------------------------------------|
| Item ACK-9414 [Good][B]            3 500,00 FC |
| 1 x 3 500,00 FC                                |
|------------------------------------------------|
| (1 article)                                    |
| Total hors taxe :                  3 017,24 FC |
| Total TVA :                          482,76 FC |
|------------------------------------------------|
| VENTILATION                                    |
| GROUPE B - TVA (16.0%)                         |
| HT (Prix) :                        3 017,24 FC |
| TVA / HT :                           482,76 FC |
|------------------------------------------------|
| Mode de paiement: Cash                         |
| TOTAL TTC À PAYER                  3 500,00 FC |
|------------------------------------------------|
|              DGI FISCAL SECURITY               |
| CODE DEF : TEST-FACT-URES-TCZW-6YOY-AMBV       |
| NID : CD01005383-1                             |
| Counter: 142/213 FV                            |
|                                                |
|                   [ 34mm ]                     |
|                   [  QR  ]                     |
|                   [ CODE ]                     |
|                                                |
|          Certifié par DRC FACT+                |
|       TEST - NOT A FISCAL DOCUMENT             |
+------------------------------------------------+
```

- **Width**: `62.4mm` content width centered within `80mm` continuous paper rolls.
- **Font**: `DejaVu Sans`, size `56%` with `1.25` line height.
- **QR Code**: High-contrast `34mm x 34mm` base64 rendered PNG image.
- **Duplicate Protection**: Automatically displays `DUPLICATA` bordered banner starting from copy #2.

---

## API Reference

All endpoints conform to **RFC 7807 (Problem Details for HTTP APIs)** and require standard Frappe authentication or API tokens.

### 1. `POST /api/method/nextfact.api.v1.fiscal.report`
Reports and normalizes a submitted Sales Invoice.
- **Payload**:
  ```json
  {
    "sales_invoice": "ACC-SINV-2026-00010",
    "pos_mapping": "Optional Explicit Mapping Name",
    "idempotency_key": "unique-uuid-v4"
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "data": {
      "fiscal_invoice": "26/00005",
      "status": "Normalized (Test)",
      "dgi_code_def": "TEST-FACT-URES-6APP-YKPU-2WGX",
      "dgi_counters": "141/212 FV",
      "dgi_nim": "CD01005383-1",
      "print_url": "/api/method/nextfact.api.v1.print.receipt?sales_invoice=ACC-SINV-2026-00010"
    }
  }
  ```

### 2. `GET /api/method/nextfact.api.v1.fiscal.status`
Batch check status for multiple Sales Invoices.
- **Parameters**: `sales_invoices=ACC-SINV-2026-00001,ACC-SINV-2026-00002`

### 3. `GET /api/method/nextfact.api.v1.print.receipt`
Renders thermal HTML receipt for a Sales Invoice.
- **Query Parameter**: `sales_invoice=ACC-SINV-2026-00010`
- **Security**: Throws 417/ValidationError if invoice is not normalized.

### 4. `GET /api/method/nextfact.api.v1.print.delivery_note`
Renders non-fiscal logistical Delivery Note.
- **Query Parameter**: `sales_invoice=ACC-SINV-2026-00010`

---

## Troubleshooting & FAQ

### 1. Normalization Rejected with HTTP 422: `Groupe fiscal particulier : validation manuelle nécessaire`
- **Cause**: The DRC FACT+ sandbox environment requires manual approval via the sandbox web portal before automated normalization is allowed for Group `K` (0% Exonéré).
- **Resolution**:
  1. Set **Default Tax Group** in `DRC Fact Settings` to `B`.
  2. If testing a specific item, set its **DRC Tax Group Override** to `B`.

### 2. Fiscal Receipt Refuses to Print with Error: `Invoice is in status 'Failed'`
- **Cause**: NextFact's print guard blocks printing for any invoice that has not been certified by the DGI.
- **Resolution**:
  1. Open the linked **DRC Fiscal Invoice** to review `error_message` and `error_detail`.
  2. In POSNext Invoice History, click **Retry VAT**. NextFact will apply a retry counter, generate a fresh draft on the gateway, and normalize.

### 3. Error: `Row #1: Expense Account not set for the Item ...` during POS checkout
- **Cause**: ERPNext requires a stock variation account for automated stock updates.
- **Resolution**:
  1. Open **Company > FoodTown** and configure `Default Expense Account` and `Cost of Goods Sold Account`.
  2. Ensure the item master has default warehouse and expense accounts populated in `Item Default`.

### 4. NextFact Icon Missing from Desktop
- **Resolution**:
  1. The included `nextfact_desk.js` auto-syncs stale browser `localStorage` on page reload.
  2. You can also run: `bench --site your-site.com execute nextfact.install.ensure_desktop_icon_and_workspace`.

---

## License
NextFact is distributed under the [MIT License](LICENSE). Copyright © 2026 Mohamad Osama.
All rights reserved.
