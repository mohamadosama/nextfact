import frappe
from frappe import _
from frappe.utils import flt, now_datetime
import requests
from nextfact.api.locks import emcf_lock
from nextfact.api.mapping import resolve_mapping
from nextfact.api.gateway import DRCFactGateway, get_qr_base64
from nextfact.api.invoice_builder import build_payload
from nextfact.api.v1.errors import ProblemError

def report_sales_invoice(sales_invoice_name, explicit_mapping=None, idempotency_key=None):
    """Core orchestrator for DRC FACT+ reporting with two-checkpoint DB commit."""
    # Lock row on Sales Invoice
    existing = frappe.db.sql("""
        SELECT name, custom_drc_fiscal_invoice, docstatus, is_pos, pos_profile, company, customer
        FROM `tabSales Invoice`
        WHERE name = %s
        FOR UPDATE
    """, sales_invoice_name, as_dict=True)

    if not existing:
        raise ProblemError("gateway-validation", 404, _("Sales Invoice {0} not found").format(sales_invoice_name))

    si_row = existing[0]
    if si_row.docstatus != 1:
        raise ProblemError("invoice-not-submitted", 409, _("Sales Invoice must be submitted first."))

    if si_row.custom_drc_fiscal_invoice:
        f_status = frappe.db.get_value("DRC Fiscal Invoice", si_row.custom_drc_fiscal_invoice, "status")
        if f_status in ("Normalized", "Normalized (Test)"):
            raise ProblemError("already-reported", 409, _("Invoice already normalized as {0}").format(si_row.custom_drc_fiscal_invoice))

    si = frappe.get_doc("Sales Invoice", sales_invoice_name)
    mapping, choices = resolve_mapping(si, explicit=explicit_mapping)
    if not mapping and choices:
        return {"status": "needs_choice", "choices": choices}

    settings = frappe.get_single("DRC Fact Settings")
    if not settings.enabled:
        raise ProblemError("gateway-forbidden", 403, _("DRC FACT+ integration is disabled in settings."))

    # Acquire advisory lock per e-MCF device
    with emcf_lock(mapping.name, timeout=25):
        # Create or reuse DRC Fiscal Invoice
        if si.custom_drc_fiscal_invoice and frappe.db.exists("DRC Fiscal Invoice", si.custom_drc_fiscal_invoice):
            fiscal = frappe.get_doc("DRC Fiscal Invoice", si.custom_drc_fiscal_invoice)
        else:
            fiscal = frappe.new_doc("DRC Fiscal Invoice")
            fiscal.invoice_type = "FV"
            fiscal.status = "Draft"
            fiscal.source_sales_invoice = si.name
            fiscal.source_customer = si.customer
            fiscal.source_customer_name = si.customer_name
            fiscal.source_pos_profile = si.pos_profile
            fiscal.pos_mapping = mapping.name
            fiscal.receipt_point_name = mapping.receipt_point_name
            fiscal.display_currency = si.currency or "CDF"
            fiscal.price_mode = settings.default_price_mode or "ttc"
            fiscal.tax_group = settings.default_tax_group or "K"
            fiscal.client_type = frappe.db.get_value("Customer", si.customer, "custom_drc_client_type") or "PP"
            fiscal.payment_code = _resolve_payment_code(si, settings)
            fiscal.insert(ignore_permissions=True)

            frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_invoice", fiscal.name, update_modified=False)
            frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_status", "Draft", update_modified=False)
            frappe.db.commit()

        gw = DRCFactGateway(mapping)

        # Step 1: POST /invoices
        if not fiscal.drcfact_invoice_id or fiscal.status == "Failed":
            if fiscal.status == "Failed":
                fiscal.retry_count = (fiscal.retry_count or 0) + 1
                fiscal.drcfact_invoice_id = None
            fiscal.tax_group = settings.default_tax_group or "B"
            payload = build_payload(si.name, fiscal, mapping)
            try:
                draft_resp = gw.create_draft(payload, drc_fiscal_invoice=fiscal.name)
            except requests.exceptions.HTTPError as e:
                err_text = e.response.text if hasattr(e, "response") and e.response else str(e)
                fiscal.status = "Failed"
                fiscal.error_message = f"HTTP {e.response.status_code if hasattr(e, 'response') else 500}"
                fiscal.error_detail = err_text
                fiscal.save(ignore_permissions=True)
                frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_status", "Failed", update_modified=False)
                frappe.db.commit()
                raise ProblemError("gateway-validation", 422, f"Gateway draft creation rejected: {err_text[:300]}")

            fiscal.drcfact_invoice_id = draft_resp.get("invoice_id")
            fiscal.drcfact_number = draft_resp.get("number")
            fiscal.external_ref = fiscal.name
            fiscal.idempotent_replay = draft_resp.get("idempotent_replay", False)
            fiscal.status = "Gateway Draft Created"

            totals = draft_resp.get("totals_cdf", {})
            fiscal.amount_cdf = flt(totals.get("total"), 2)
            fiscal.vat_cdf = flt(totals.get("vat"), 2)
            fiscal.ht_cdf = flt(totals.get("ht"), 2)

            fiscal.save(ignore_permissions=True)
            frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_status", "Gateway Draft Created", update_modified=False)
            frappe.db.commit()  # <<< CHECKPOINT 1 COMMIT

        # Step 2: POST /normalize
        try:
            norm_resp = gw.normalize(fiscal.drcfact_invoice_id, drc_fiscal_invoice=fiscal.name)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            fiscal.status = "Pending Verification"
            fiscal.error_message = "Gateway timeout during normalization. Verification pending."
            fiscal.save(ignore_permissions=True)
            frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_status", "Pending Verification", update_modified=False)
            frappe.db.commit()
            return fiscal

        except requests.exceptions.HTTPError as e:
            status_c = e.response.status_code if hasattr(e, "response") else 500
            if status_c in (409, 502):
                fiscal.status = "Pending Verification"
                fiscal.error_message = f"HTTP {status_c} during normalization — queued for verification."
                fiscal.save(ignore_permissions=True)
                frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_status", "Pending Verification", update_modified=False)
                frappe.db.commit()
                return fiscal
            else:
                err_text = e.response.text if hasattr(e, "response") and e.response else str(e)
                fiscal.status = "Failed"
                fiscal.error_message = f"Normalization failed ({status_c})"
                fiscal.error_detail = err_text
                fiscal.save(ignore_permissions=True)
                frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_status", "Failed", update_modified=False)
                frappe.db.commit()
                raise ProblemError("gateway-validation", 422, f"Normalization rejected: {err_text[:300]}")

        # Parse normalize response (handles empirical TRAP 4 variations)
        sec = norm_resp.get("dgi") or norm_resp.get("securityElements") or norm_resp.get("security_elements") or {}
        fiscal.dgi_code_def = sec.get("codeDEFDGI") or sec.get("code_def_dgi") or sec.get("codeDef") or norm_resp.get("code_def_dgi")
        fiscal.dgi_nim = sec.get("nim") or norm_resp.get("nim") or mapping.emcf_nid
        fiscal.dgi_counters = sec.get("counters") or norm_resp.get("counters")
        fiscal.dgi_datetime = sec.get("dateTime") or sec.get("date_time") or norm_resp.get("date_time")
        fiscal.dgi_qr_code = sec.get("qrCode") or sec.get("qr_code") or norm_resp.get("qr_code")
        fiscal.dgi_qr_image = get_qr_base64(fiscal.dgi_qr_code)
        fiscal.dgi_uid = sec.get("uid") or norm_resp.get("dgi_uid")
        fiscal.dgi_environment = norm_resp.get("environment", mapping.environment)
        fiscal.emcf_nid = fiscal.dgi_nim

        if fiscal.dgi_environment == "production":
            fiscal.status = "Normalized"
        else:
            fiscal.status = "Normalized (Test)"

        fiscal.save(ignore_permissions=True)
        frappe.db.set_value("Sales Invoice", si.name, "custom_drc_fiscal_status", fiscal.status, update_modified=False)
        frappe.db.commit()  # <<< CHECKPOINT 2 COMMIT

        return fiscal

def _resolve_payment_code(si, settings):
    if getattr(si, "payments", None):
        for p in si.payments:
            if p.amount and p.mode_of_payment:
                for row in settings.payment_map:
                    if row.erpnext_mode_of_payment == p.mode_of_payment:
                        return row.drc_payment_code
    return "ESPECES"

def verify_pending_invoices():
    """Cron job verifying documents in Pending Verification (GET only)."""
    pending = frappe.get_all("DRC Fiscal Invoice", filters={"status": "Pending Verification"}, limit=50)
    for p in pending:
        doc = frappe.get_doc("DRC Fiscal Invoice", p.name)
        if not doc.drcfact_invoice_id:
            continue
        try:
            mapping = frappe.get_doc("DRC POS Mapping", doc.pos_mapping) if doc.pos_mapping else None
            gw = DRCFactGateway(mapping)
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
                frappe.db.set_value("Sales Invoice", doc.source_sales_invoice, "custom_drc_fiscal_status", doc.status, update_modified=False)
                frappe.db.commit()
            elif stat == "ecart_dgi" or stat == "error":
                doc.status = "Failed"
                doc.error_message = resp.get("error_message") or "Gateway reported DGI mismatch."
                doc.save(ignore_permissions=True)
                frappe.db.set_value("Sales Invoice", doc.source_sales_invoice, "custom_drc_fiscal_status", "Failed", update_modified=False)
                frappe.db.commit()
        except Exception as e:
            frappe.log_error(f"Verify failed for {doc.name}: {str(e)}")

def cancel_fiscal_invoice_ran(fiscal_invoice_name, reason=""):
    """Manager action: Cancel fiscal invoice via FA credit note (reference_type=RAN)."""
    orig = frappe.get_doc("DRC Fiscal Invoice", fiscal_invoice_name)
    if orig.status not in ("Normalized", "Normalized (Test)"):
        raise ProblemError("gateway-validation", 400, _("Only normalized invoices can be cancelled via RAN."))

    # Create Credit Note document
    fa = frappe.new_doc("DRC Fiscal Invoice")
    fa.invoice_type = "FA"
    fa.reference_type = "RAN"
    fa.reference_code_def = orig.dgi_code_def
    fa.source_drc_invoice_id = orig.drcfact_invoice_id
    fa.credit_note_reason = reason
    fa.source_sales_invoice = orig.source_sales_invoice
    fa.source_customer = orig.source_customer
    fa.source_customer_name = orig.source_customer_name
    fa.source_pos_profile = orig.source_pos_profile
    fa.pos_mapping = orig.pos_mapping
    fa.receipt_point_name = orig.receipt_point_name
    fa.display_currency = orig.display_currency
    fa.price_mode = orig.price_mode
    fa.tax_group = orig.tax_group
    fa.client_type = orig.client_type
    fa.payment_code = orig.payment_code
    fa.amount_cdf = orig.amount_cdf
    fa.vat_cdf = orig.vat_cdf
    fa.ht_cdf = orig.ht_cdf
    fa.insert(ignore_permissions=True)

    mapping = frappe.get_doc("DRC POS Mapping", orig.pos_mapping)
    with emcf_lock(mapping.name, timeout=25):
        payload = build_payload(orig.source_sales_invoice, fa, mapping)
        gw = DRCFactGateway(mapping)
        draft = gw.create_draft(payload, drc_fiscal_invoice=fa.name)
        fa.drcfact_invoice_id = draft.get("invoice_id")
        fa.drcfact_number = draft.get("number")
        fa.status = "Gateway Draft Created"
        fa.save(ignore_permissions=True)
        frappe.db.commit()

        norm = gw.normalize(fa.drcfact_invoice_id, drc_fiscal_invoice=fa.name)
        sec = norm.get("securityElements", {})
        fa.dgi_code_def = sec.get("codeDef")
        fa.dgi_nim = sec.get("nim")
        fa.dgi_counters = sec.get("counters")
        fa.dgi_datetime = sec.get("dateTime")
        fa.dgi_qr_code = sec.get("qrCode")
        fa.dgi_qr_image = get_qr_base64(sec.get("qrCode"))
        fa.status = "Normalized" if norm.get("environment") == "production" else "Normalized (Test)"
        fa.save(ignore_permissions=True)

        orig.status = "Cancelled by RAN"
        orig.save(ignore_permissions=True)
        frappe.db.set_value("Sales Invoice", orig.source_sales_invoice, "custom_drc_fiscal_status", "Cancelled by RAN", update_modified=False)
        frappe.db.commit()

    return fa
