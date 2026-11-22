# DRC FACT+ / NextFact — Repository & Environment Inspection

**Date of Inspection:** 2026-11-23  
**Target Site:** `foodtown16.doktorpost.com` (Production)  
**Host Server:** `165.232.45.168` (Ubuntu 24.04 LTS, `frappe` user)  
**App Scaffold:** `nextfact`  

---

## A. Cloned Repositories Inventory

Cloned directly from the production server to ensure 100% fidelity with the live environment:

| App | Source / Remote | Branch | Head Commit SHA | Working Tree State |
|---|---|---|---|---|
| `pos_next` | `https://github.com/BrainWise-DEV/pos_next.git` | `develop` | `0847b39883a81c1c5679f86cb527950ed37b9bbf` | 17 modified files (patched by `akl_custom`) |
| `akl_custom` | `https://github.com/mohamadosama/akl_custom.git` | `v-16` | `82e78b1c0f34652979c7209d80dbc33816cca62b` | Clean |
| `frappe` | `https://github.com/frappe/frappe.git` | `version-16` | `e61c3950face7fd46fec80b1736601247e86b1c9` | Clean |
| `erpnext` | `https://github.com/frappe/erpnext.git` | `version-16` | `799d6d159c5371a148ec43e662f1df2883f852e8` | 1 patch file modified |
| `payments` | `https://github.com/frappe/payments.git` | `develop` | `3cebd9425e414e4c3419a374c616727c5d94b5ea` | Clean |

---

## B. Environment & Runtime Facts

| Parameter | Value | Impact / Validation |
|---|---|---|
| **Frappe Version** | `16.18.2` | Core framework |
| **ERPNext Version** | `16.18.3` | Standard Sales Invoice controller |
| **POSNext Version** | `1.16.0` | POS frontend and backend logic |
| **Python Runtime** | `Python 3.12.3` (Host) / `3.14.5` (Bench uv env) | Strict typing, standard library syntax |
| **Node.js** | `v18.19.1` (Server) / `v20.20.2` (Local) | Vite build compatible |
| **MariaDB** | `10.11.14-MariaDB` | Supports `GET_LOCK` advisory locks for per-e-MCF serialization |
| **Redis / Workers** | 2 workers online, scheduler active | Safe for background enqueue jobs (`frappe.enqueue`) |
| **Server Timezone** | `Africa/Kinshasa` (WAT, +0100) | Local fiscal receipts match DRC official clock |
| **Currencies** | `CDF` (primary retail), `USD` (accounting default) | Exchange rate handling via `fx_rate` required |
| **Active Companies** | `AKL`, `FTK`, `HWL`, `ACK`, `KKG`, `MARK` | Multi-company routing support |
| **Payment Modes** | `Cash CDF`, `Cash USD`, `Credit Card`, `Cheque`, `Wire Transfer`, `Bank Draft` | Mapped to DRC FACT+ payment enums (`ESPECES`, etc.) |
| **Active POS Profiles** | `FTK SHOP1`, `mosama`, `FTL SHOP 2`, `HWL SHOP3`, `HWL SHOP4` | Seed data for `DRC POS Mapping` and `DRC POS Route` |
| **Roles** | `POSNext Cashier` exists; `NextFact Cashier`, `NextFact Manager`, `NextFact Admin` to be created | Permission isolation |
| **Custom Fields** | `posa_is_printed`, `posa_pos_opening_shift` on Sales Invoice | No clash with `custom_drc_*` namespace |

---

## C. `akl_custom` Inventory & Collision Check

* `akl_custom` applies 4 patches during `after_migrate`:
  1. `fix_pos_next_payment_handling`
  2. `apply_pos_next_scanner_blocking`
  3. `fix_pos_next_fractional_item_entry`
  4. `setup_pos_next_company_receipt_profile`
* It also registers Company custom fields: `akl_pos_receipt_*`.
* **Collision Assessment:**
  * `akl_custom` modifies item selection, barcode scanning, and receipt profile metadata.
  * It does **not** alter the core checkout handler `cartStore.submitInvoice()`, nor does it mount history dialog buttons.
  * `nextfact` uses self-contained Vue component mounting (`NextFactActions.vue`), which avoids direct string replacement clashes with `akl_custom`.

---

## D. POSNext Inspection & Anchor Table

| # | Item to Locate | File Path | Found Snippet / Marker | Strategy |
|---|---|---|---|---|
| **D1** | Frontend Root & Build | `POS/package.json` | `vite build --base=/assets/pos_next/pos/` | Source is fully present in `POS/src/`. Build command: `bench build --app pos_next`. |
| **D2** | Submit / Complete Handler | `POS/src/pages/POSSale.vue` | `const result = await cartStore.submitInvoice();` (L2289) | Returns submitted Sales Invoice object with `.name`. Wrap or call prior to `fiscal.report`. |
| **D3** | Cart / Payment Screen | `POS/src/components/sale/PaymentDialog.vue` & `InvoiceCart.vue` | `@click="completePayment"` (L986 PaymentDialog) / `@click="handleProceedToPayment"` (L668 InvoiceCart) | Inject `mode="cart"` actions in payment footer and/or cart footer. |
| **D4** | Latest Invoices Dialog | `POS/src/components/sale/InvoiceHistoryDialog.vue` | `<button @click="printInvoice(invoice)" :title="__('Print')">` (L101) | Inject `mode="history"` actions in invoice row actions template. |
| **D5** | Existing Print Call | `POS/src/utils/printInvoice.js` | `window.open('/printview?${params}', '_blank')` | Follow identical popup pattern for `print_url` (`window.open`). |
| **D6** | Offline Invoices Guard | `POS/src/pages/POSSale.vue` | `uiStore.showSuccess(offlineReceiptName)` | Disable fiscal reporting buttons for unsynced offline invoices (`name` starts with `offline-` or offline badge active). |
| **D7** | Active POS Profile | `POS/src/stores/posShift.js` | `shiftStore.posProfile` | Pass `pos_profile` to API resolution methods. |
| **D8** | Request Helper & i18n | `frappe-ui` / `frappe.call` | `createResource`, `__` translation | Use standard `frappe.call` / `frappe-ui` without adding external dependencies. |
| **D9** | Role / Permissions | `POSNext Cashier` | Present in Frappe roles | Map cashiers to `NextFact Cashier`. |
| **D10** | Pre-patched State | Working tree of `pos_next` | 17 modified files preserved from live server | Base patch anchors verified on already-patched server source. |

---

## E. Print & Receipt Inspection

* **Existing Format:** Jinja Print Format `POS Next Receipt` (`custom_format = 1`).
* **Content Box:** Fixed to **62.4 mm** content width (`receipt-wrap`), DejaVu Sans font, 56% scale.
* **Target Spec for `nextfact`:**
  * Thermal format: 62.4 mm box with dashed dividers, centered QR (34 mm width for reliable scanning).
  * Delivery Note: identical visual dimensions without fiscal security tokens (`DGI`, `NID`, `ISF`, `QR`).

---

## F. Decisions & Go / No-Go

1. **POSNext Integration:** **GO**. The full frontend source is present in `POS/src`, dependencies compile via standard Vite, and clean insertion anchors exist in `InvoiceHistoryDialog.vue` and `PaymentDialog.vue` / `InvoiceCart.vue`.
2. **Anchor Strategy:** Mount the single SFC `<NextFactActions />` with `mode="cart"` and `mode="history"`.
3. **Desk Parity:** Implement standard Frappe form & list view custom scripts on `Sales Invoice` alongside the POSNext component.
