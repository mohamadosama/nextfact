from decimal import Decimal

def serialize_money(amount, currency="CDF"):
    return {
        "amount": f"{Decimal(str(amount or 0)):.2f}",
        "currency": currency
    }

def serialize_fiscal_invoice(doc):
    return {
        "sales_invoice": doc.source_sales_invoice,
        "fiscal_invoice": doc.name,
        "status": doc.status.lower().replace(" ", "_"),
        "environment": doc.dgi_environment or "unknown",
        "emcf_nid": doc.emcf_nid,
        "total": serialize_money(doc.amount_cdf, "CDF"),
        "dgi": {
            "code_def": doc.dgi_code_def,
            "counters": doc.dgi_counters,
            "nim": doc.dgi_nim,
            "datetime_display": doc.dgi_datetime
        },
        "print_url": f"/api/method/nextfact.api.v1.print.receipt?sales_invoice={doc.source_sales_invoice}"
    }
