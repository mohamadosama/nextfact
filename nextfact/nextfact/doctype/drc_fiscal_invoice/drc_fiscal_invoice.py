import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname

class DRCFiscalInvoice(Document):
    def autoname(self):
        year_prefix = str(frappe.utils.now_datetime().year)[-2:]
        seq = make_autoname(".#####.", "DRC Fiscal Invoice")
        self.name = f"{year_prefix}/{seq.zfill(5)}"

DrcFiscalInvoice = DRCFiscalInvoice
