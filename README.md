# NextFact — DRC FACT+ E-Invoicing Integration

Official Frappe / ERPNext integration with DRC FACT+ / DGI (e-DEF / e-MCF) E-Invoicing.

## Features
- **Cashier Workflow Parity**: Native button in POSNext checkout (`Report + Print VAT Receipt`), `Complete` (without reporting), and `Print Delivery Note`.
- **Desk Parity**: Direct reporting and reprint from Sales Invoice form and list view (with asynchronous bulk support).
- **Flexible POS Routing**: Many-to-many, 1-to-1, and conditional routing via `DRC POS Route`.
- **Zero Item Catalog Sync**: Free-line reporting using ERPNext item masters.
- **Client Receipt Spec**: 62.4 mm thermal receipt box, DejaVu Sans 56%, dynamic Tax Group ventilation, and offline-verified DGI QR codes.
- **Fail-safe Concurrency**: Advisory locking per e-MCF NID preventing error 63 collisions.

## License
MIT
