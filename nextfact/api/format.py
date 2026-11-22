from decimal import Decimal, ROUND_HALF_UP

def fmt_money(value, currency="CDF", decimals=2):
    """Format money with space as thousands separator and comma as decimal separator."""
    try:
        q = Decimal(str(value or 0)).quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)
        s = f"{q:,.{decimals}f}".replace(",", " ").replace(".", ",")
        suffix = "FC" if currency == "CDF" else "$"
        return f"{s} {suffix}"
    except Exception:
        return f"{value} {currency}"

def nextfact_labels(lang="en"):
    """Return labels dictionary for Jinja templates in EN or FR."""
    if lang == "fr":
        return {
            "tax_regime": "Régime fiscal",
            "point_of_sale": "Point de vente",
            "operator": "Opérateur",
            "ticket": "Ticket",
            "sales_invoice": "FACTURE DE VENTE",
            "credit_note": "NOTE DE CRÉDIT",
            "delivery_note": "BON DE LIVRAISON",
            "date": "Date",
            "item": "article",
            "items": "articles",
            "total_excl": "Total hors taxe",
            "total_vat": "Total TVA",
            "total_payable": "Total TTC à payer",
            "payment_method": "Mode de paiement",
            "fx": "Taux de change appliqué",
            "served_by": "Servi par",
            "signature_deliverer": "Signature Livreur",
            "signature_client": "Signature Client",
            "type": {"BIE": "Good", "SER": "Service", "TAX": "Tax"}
        }
    return {
        "tax_regime": "Tax regime",
        "point_of_sale": "Point of sale",
        "operator": "Operator",
        "ticket": "Ticket",
        "sales_invoice": "SALES INVOICE",
        "credit_note": "CREDIT NOTE",
        "delivery_note": "DELIVERY NOTE",
        "date": "Date",
        "item": "item",
        "items": "items",
        "total_excl": "Total excl. tax",
        "total_vat": "Total VAT",
        "total_payable": "Total incl. tax payable",
        "payment_method": "Payment method",
        "fx": "Exchange rate applied",
        "served_by": "Served by",
        "signature_deliverer": "Deliverer Signature",
        "signature_client": "Customer Signature",
        "type": {"BIE": "Good", "SER": "Service", "TAX": "Tax"}
    }
