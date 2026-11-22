import frappe
from frappe import _
from frappe.utils import now_datetime, flt
from werkzeug.wrappers import Response
from nextfact.api.v1.errors import api_endpoint, ProblemError
from nextfact.api.format import fmt_money, nextfact_labels

def build_receipt_context(fiscal_doc, copy_no=1):
    """Build immutable context for receipt rendering without template database queries."""
    settings = frappe.get_single("DRC Fact Settings")
    mapping = frappe.get_doc("DRC POS Mapping", fiscal_doc.pos_mapping) if fiscal_doc.pos_mapping else None
    si = frappe.get_doc("Sales Invoice", fiscal_doc.source_sales_invoice) if fiscal_doc.source_sales_invoice else None

    # Group breakdown computation
    group_breakdown = []
    groups = {}
    for it in fiscal_doc.items:
        g = it.tax_group or "K"
        if g not in groups:
            groups[g] = {"code": g, "ht": 0.0, "vat": 0.0, "rate": 0.0, "description": ""}
        line_total = flt(it.line_total_cdf or (it.price_cdf * it.quantity))
        groups[g]["ht"] += line_total

    for g_code, g_data in groups.items():
        rate_val = 0.0
        desc_val = "EXEMPT / NON-ASSUJETTI"
        for st_g in settings.tax_groups:
            if st_g.code == g_code:
                rate_val = flt(st_g.rate)
                desc_val = st_g.description or desc_val
                break
        g_data["rate"] = rate_val
        g_data["description"] = desc_val
        if rate_val > 0:
            g_data["vat"] = round(g_data["ht"] * (rate_val / 100.0), 2)
        group_breakdown.append(g_data)

    company_name = settings.receipt_company_name or (mapping.company if mapping else "") or (si.company if si else "")
    operator_name = si.owner if si else frappe.session.user

    return {
        "doc": fiscal_doc,
        "settings": settings,
        "mapping": mapping,
        "company_name": company_name,
        "mapping_nif": mapping.company_nif if mapping else "",
        "operator": operator_name,
        "date_iso": fiscal_doc.dgi_datetime or str(fiscal_doc.creation)[:19],
        "group_breakdown": group_breakdown,
        "payment_label": fiscal_doc.payment_code or "Cash",
        "qr_base64": fiscal_doc.dgi_qr_image or "",
        "copy_no": copy_no
    }

@frappe.whitelist(allow_guest=True)
def receipt(sales_invoice):
    """HTML Print View for DRC Fiscal Receipt."""
    f_name = frappe.db.get_value("Sales Invoice", sales_invoice, "custom_drc_fiscal_invoice")
    if not f_name:
        frappe.throw(_("No fiscal invoice has been generated for {0}").format(sales_invoice))

    doc = frappe.get_doc("DRC Fiscal Invoice", f_name)
    doc.copy_count = (doc.copy_count or 0) + 1
    doc.last_printed_at = now_datetime()
    doc.save(ignore_permissions=True)

    # Log to DRC Print Log
    pl = frappe.new_doc("DRC Print Log")
    pl.print_type = "Fiscal Receipt"
    pl.sales_invoice = sales_invoice
    pl.drc_fiscal_invoice = doc.name
    pl.copy_no = doc.copy_count
    pl.printed_by = frappe.session.user
    pl.printed_at = now_datetime()
    pl.pos_profile = doc.source_pos_profile
    pl.source = "POSNext" if doc.source_pos_profile else "Desk"
    pl.format = "DRC Fiscal Receipt"
    pl.insert(ignore_permissions=True)
    frappe.db.commit()

    ctx = build_receipt_context(doc, copy_no=doc.copy_count)
    html = frappe.render_template("nextfact/print_format/drc_fiscal_receipt/drc_fiscal_receipt.html", ctx)
    return Response(html, mimetype="text/html")

@frappe.whitelist(allow_guest=True)
def delivery_note(sales_invoice):
    """HTML Print View for NextFact Delivery Note."""
    si = frappe.get_doc("Sales Invoice", sales_invoice)
    settings = frappe.get_single("DRC Fact Settings")

    pl = frappe.new_doc("DRC Print Log")
    pl.print_type = "Delivery Note"
    pl.sales_invoice = sales_invoice
    pl.copy_no = 1
    pl.printed_by = frappe.session.user
    pl.printed_at = now_datetime()
    pl.pos_profile = si.pos_profile
    pl.source = "POSNext" if si.pos_profile else "Desk"
    pl.format = "NextFact Delivery Note"
    pl.insert(ignore_permissions=True)
    frappe.db.commit()

    ctx = {
        "si": si,
        "settings": settings,
        "company_name": settings.receipt_company_name or si.company,
        "operator": si.owner,
        "date_iso": str(si.posting_date),
        "items": si.items,
        "show_prices": settings.delivery_note_show_prices
    }
    html = frappe.render_template("nextfact/print_format/nextfact_delivery_note/nextfact_delivery_note.html", ctx)
    return Response(html, mimetype="text/html")

def ensure_print_formats():
    """Register or update standard print formats in database."""
    receipt_fmt = frappe.db.exists("Print Format", "DRC Fiscal Receipt")
    if not receipt_fmt:
        doc = frappe.new_doc("Print Format")
        doc.name = "DRC Fiscal Receipt"
        doc.doc_type = "DRC Fiscal Invoice"
        doc.module = "NextFact"
        doc.custom_format = 1
        doc.print_format_type = "Jinja"
        doc.standard = "No"
        doc.html = "{% include 'nextfact/print_format/drc_fiscal_receipt/drc_fiscal_receipt.html' %}"
        doc.insert(ignore_permissions=True)

    deliv_fmt = frappe.db.exists("Print Format", "NextFact Delivery Note")
    if not deliv_fmt:
        doc = frappe.new_doc("Print Format")
        doc.name = "NextFact Delivery Note"
        doc.doc_type = "Sales Invoice"
        doc.module = "NextFact"
        doc.custom_format = 1
        doc.print_format_type = "Jinja"
        doc.standard = "No"
        doc.html = "{% include 'nextfact/print_format/nextfact_delivery_note/nextfact_delivery_note.html' %}"
        doc.insert(ignore_permissions=True)
