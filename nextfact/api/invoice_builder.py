import frappe
from frappe import _
from frappe.utils import flt
from nextfact.api.v1.errors import ProblemError

def build_payload(sales_invoice_name, drc_fiscal_invoice, mapping=None):
    """Convert Sales Invoice into DRC FACT+ POST /invoices payload according to V4 rules."""
    si = frappe.get_doc("Sales Invoice", sales_invoice_name)
    settings = frappe.get_single("DRC Fact Settings")

    if si.docstatus != 1:
        raise ProblemError("invoice-not-submitted", 409, _("Sales Invoice must be submitted (docstatus=1)"))

    # Currency handling (TRAP 1 & 2)
    is_foreign = (si.currency != "CDF")
    fx_rate = None
    fx_date = None
    fx_source = None

    if is_foreign:
        if drc_fiscal_invoice.fx_rate:
            fx_rate = flt(drc_fiscal_invoice.fx_rate, 2)
            fx_date = str(drc_fiscal_invoice.fx_date or frappe.utils.today())[:10]
            fx_source = drc_fiscal_invoice.fx_source or "DGI e-MCF / BCC"
        else:
            from nextfact.api.gateway import DRCFactGateway
            gw = DRCFactGateway(mapping)
            try:
                rate_data = gw.rate(drc_fiscal_invoice=drc_fiscal_invoice.name)
                fx_rate = flt(rate_data.get("rate"), 2)
                fx_date = str(rate_data.get("date", frappe.utils.today()))[:10]
                fx_source = rate_data.get("source", "DGI e-MCF / BCC")
            except Exception as e:
                frappe.log_error(f"Failed to fetch rate: {str(e)}")
                raise ProblemError("gateway-timeout", 202, _("Failed to fetch exchange rate from DRC FACT+."))

        if not fx_rate:
            raise ProblemError("gateway-validation", 422, _("Exchange rate is zero or unavailable for currency {0}.").format(si.currency))

    # Customer / Client handling (TRAP 9 & V4-4)
    client_type = drc_fiscal_invoice.client_type or "PP"
    client_id = drc_fiscal_invoice.client_id or None
    client_name = None
    client_nif = None

    if client_type in ("PM", "PC", "PL"):
        customer = frappe.get_doc("Customer", si.customer)
        client_nif = customer.tax_id or drc_fiscal_invoice.client_nif
        client_name = customer.customer_name or drc_fiscal_invoice.source_customer_name
        if not client_nif:
            raise ProblemError(
                "client-nif-required", 422,
                _("Customer {0} requires a Tax ID / NIF for business classification {1}.").format(si.customer, client_type),
                ui_action="ask_client_details"
            )

    if client_type == "AO" and not drc_fiscal_invoice.exemption_certificate:
        raise ProblemError("gateway-validation", 422, _("Client type AO requires an exemption certificate."))

    # Payment mapping
    payment_code = drc_fiscal_invoice.payment_code or "ESPECES"

    # Line items & Discounts (TRAP 1, 6, 7, 8)
    lines = []
    invoice_discount_pct = flt(si.additional_discount_percentage)
    invoice_discount_amt = flt(si.discount_amount)
    subtotal_before_discount = sum(flt(item.amount) for item in si.items)

    for item in si.items:
        discount_type = "percent"
        discount_value = 0

        if flt(item.discount_percentage):
            discount_type = "percent"
            discount_value = flt(item.discount_percentage, 2)
        elif flt(item.discount_amount) and flt(item.rate):
            discount_value = flt((flt(item.discount_amount) / (flt(item.rate) + flt(item.discount_amount))) * 100, 2)
            discount_type = "percent"

        if invoice_discount_pct and not discount_value:
            discount_type = "percent"
            discount_value = flt(invoice_discount_pct, 2)
        elif invoice_discount_amt and subtotal_before_discount and not discount_value:
            proportion = flt(item.amount) / subtotal_before_discount
            line_discount = flt(invoice_discount_amt * proportion, 2)
            if flt(item.rate):
                discount_value = flt((line_discount / flt(item.amount)) * 100, 2)
                discount_type = "percent"

        unit_price = flt(item.rate, 2)
        if is_foreign and fx_rate:
            unit_price = flt(unit_price * fx_rate, 2)

        # Tax group resolution chain (V4-4)
        row_tax_group = item.get("custom_drc_tax_group")
        item_tax_group = frappe.db.get_value("Item", item.item_code, "custom_drc_tax_group")
        group_tax_group = None
        if not item_tax_group and item.item_group:
            group_tax_group = frappe.db.get_value("Item Group", item.item_group, "custom_drc_tax_group")
        line_tax_group = row_tax_group or item_tax_group or group_tax_group or drc_fiscal_invoice.tax_group or settings.default_tax_group or "K"

        # Item type resolution
        item_type = frappe.db.get_value("Item", item.item_code, "custom_drc_item_type") or "BIE"

        if line_tax_group in ("L", "N") and item_type != "TAX":
            raise ProblemError("gateway-validation", 422, f"Tax groups L and N are reserved for type TAX. Item {item.item_code} uses {item_type}.")

        lines.append({
            "sku": (item.item_code or item.item_name or "ITEM")[:50],
            "name": (item.item_name or item.item_code or "Item")[:100],
            "type": item_type,
            "quantity": flt(item.qty, 3),
            "price": max(0.0, unit_price),
            "tax_group": line_tax_group,
            "discount_type": discount_type,
            "discount_value": max(0.0, min(100.0, flt(discount_value, 2))),
        })

    if not lines:
        raise ProblemError("gateway-validation", 422, _("Sales Invoice contains no line items."))

    ext_ref = str(drc_fiscal_invoice.name or si.name)
    if drc_fiscal_invoice.get("retry_count"):
        ext_ref = f"{ext_ref}-R{drc_fiscal_invoice.retry_count}"

    payload = {
        "external_ref": ext_ref[:120],
        "type": drc_fiscal_invoice.invoice_type or "FV",
        "client_id": client_id,
        "mode": drc_fiscal_invoice.price_mode or settings.default_price_mode or "ttc",
        "payment": payment_code,
        "display_currency": si.currency or "CDF",
        "lines": lines,
    }

    if client_name:
        payload["client_name"] = client_name
    if client_nif:
        payload["client_nif"] = client_nif
    if client_type:
        payload["client_type"] = client_type

    if is_foreign:
        payload["fx_rate"] = fx_rate
        payload["fx_date"] = fx_date
        payload["fx_source"] = fx_source
        drc_fiscal_invoice.fx_rate = fx_rate
        drc_fiscal_invoice.fx_date = fx_date
        drc_fiscal_invoice.fx_source = fx_source

    if drc_fiscal_invoice.invoice_type == "FA":
        payload["reference"] = drc_fiscal_invoice.reference_code_def
        payload["reference_type"] = drc_fiscal_invoice.reference_type or "RAN"
        if drc_fiscal_invoice.source_drc_invoice_id:
            payload["source_invoice_id"] = drc_fiscal_invoice.source_drc_invoice_id

    return payload
