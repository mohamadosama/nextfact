import frappe
from frappe import _
from frappe.utils import now_datetime
import json
from nextfact.api.v1.errors import api_endpoint, ProblemError
from nextfact.api.v1.schemas import serialize_fiscal_invoice
from nextfact.api.normalize import report_sales_invoice, cancel_fiscal_invoice_ran

@frappe.whitelist()
@api_endpoint
def report(sales_invoice, pos_mapping=None, idempotency_key=None):
    """POST fiscal.report: report one submitted Sales Invoice."""
    if not sales_invoice:
        raise ProblemError("gateway-validation", 422, "Missing parameter 'sales_invoice'")

    # Idempotency check
    if idempotency_key:
        cached = frappe.db.get_value("DRC Fiscal Action", idempotency_key, ["status", "response_json"], as_dict=True)
        if cached and cached.status == "Succeeded" and cached.response_json:
            return json.loads(cached.response_json)

    # Record action start
    if idempotency_key and not frappe.db.exists("DRC Fiscal Action", idempotency_key):
        act = frappe.new_doc("DRC Fiscal Action")
        act.idempotency_key = idempotency_key
        act.action = "report"
        act.sales_invoice = sales_invoice
        act.status = "Started"
        act.started_at = now_datetime()
        act.insert(ignore_permissions=True)
        frappe.db.commit()

    result = report_sales_invoice(sales_invoice, explicit_mapping=pos_mapping, idempotency_key=idempotency_key)
    if isinstance(result, dict) and result.get("status") == "needs_choice":
        return result

    resp_data = serialize_fiscal_invoice(result)
    if idempotency_key and frappe.db.exists("DRC Fiscal Action", idempotency_key):
        frappe.db.set_value("DRC Fiscal Action", idempotency_key, {
            "status": "Succeeded",
            "finished_at": now_datetime(),
            "response_json": json.dumps(resp_data)
        })
        frappe.db.commit()

    return resp_data

@frappe.whitelist()
@api_endpoint
def verify(sales_invoice):
    """POST fiscal.verify: verify status of pending fiscal invoice."""
    f_name = frappe.db.get_value("Sales Invoice", sales_invoice, "custom_drc_fiscal_invoice")
    if not f_name:
        raise ProblemError("gateway-validation", 404, _("No fiscal invoice linked to {0}").format(sales_invoice))

    doc = frappe.get_doc("DRC Fiscal Invoice", f_name)
    from nextfact.api.gateway import DRCFactGateway, get_qr_base64
    mapping = frappe.get_doc("DRC POS Mapping", doc.pos_mapping) if doc.pos_mapping else None
    gw = DRCFactGateway(mapping)

    if doc.drcfact_invoice_id:
        resp = gw.get_invoice(doc.drcfact_invoice_id, drc_fiscal_invoice=doc.name)
        stat = resp.get("status")
        if stat in ("normalisee", "normalisee_test"):
            doc.status = "Normalized" if stat == "normalisee" else "Normalized (Test)"
            sec = resp.get("security_elements") or resp.get("securityElements") or {}
            doc.dgi_code_def = sec.get("code_def") or sec.get("codeDef")
            doc.dgi_nim = sec.get("nim")
            doc.dgi_counters = sec.get("counters")
            doc.dgi_datetime = sec.get("date_time") or sec.get("dateTime")
            doc.dgi_qr_code = sec.get("qr_code") or sec.get("qrCode")
            doc.dgi_qr_image = get_qr_base64(doc.dgi_qr_code)
            doc.save(ignore_permissions=True)
            frappe.db.set_value("Sales Invoice", sales_invoice, "custom_drc_fiscal_status", doc.status, update_modified=False)
            frappe.db.commit()

    return serialize_fiscal_invoice(doc)

@frappe.whitelist()
@api_endpoint
def status(sales_invoices):
    """GET fiscal.status: batch status check for latest invoices."""
    if isinstance(sales_invoices, str):
        inv_list = [s.strip() for s in sales_invoices.split(",") if s.strip()]
    else:
        inv_list = sales_invoices or []

    if not inv_list:
        return {"items": []}

    rows = frappe.db.get_all(
        "Sales Invoice",
        filters={"name": ["in", inv_list]},
        fields=["name", "custom_drc_fiscal_invoice", "custom_drc_fiscal_status", "docstatus", "is_return"]
    )
    status_map = {r.name: r for r in rows}
    res = []
    for name in inv_list:
        row = status_map.get(name)
        if not row:
            res.append({"sales_invoice": name, "status": "not_found", "can_report": False})
            continue

        raw_stat = (row.custom_drc_fiscal_status or "none").lower().replace(" ", "_")
        can_report = (row.docstatus == 1 and raw_stat in ("none", "failed", "draft"))
        can_print_delivery = (row.docstatus == 1)
        res.append({
            "sales_invoice": name,
            "status": raw_stat,
            "fiscal_invoice": row.custom_drc_fiscal_invoice,
            "can_report": can_report,
            "can_print_delivery": can_print_delivery
        })
    return {"items": res}

@frappe.whitelist()
@api_endpoint
def cancel_ran(fiscal_invoice, reason=""):
    """POST fiscal.cancel_ran: Manager cancellation using credit note FA/RAN."""
    frappe.only_for(["NextFact Manager", "NextFact Admin", "System Manager"])
    fa = cancel_fiscal_invoice_ran(fiscal_invoice, reason=reason)
    return serialize_fiscal_invoice(fa)

@frappe.whitelist()
def purge_actions():
    """Daily cron: delete idempotent actions older than 7 days."""
    frappe.db.sql("""
        DELETE FROM `tabDRC Fiscal Action`
        WHERE started_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    """)
    frappe.db.commit()
