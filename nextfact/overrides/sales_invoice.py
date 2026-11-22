import frappe
from frappe import _

def before_cancel(doc, method=None):
    """Rule 3: Reported invoices cannot be cancelled. Create a credit note (FA) instead."""
    if doc.custom_drc_fiscal_invoice:
        status = doc.custom_drc_fiscal_status or ""
        if status in ("Normalized", "Normalized (Test)", "Gateway Draft Created", "Pending Verification"):
            frappe.throw(
                _("Reported sales invoices cannot be cancelled directly. "
                  "Please create a Credit Note (FA - RAN/COR) via DRC Fiscal Invoice {0}.").format(
                    doc.custom_drc_fiscal_invoice
                )
            )
