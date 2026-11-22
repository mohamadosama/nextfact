import frappe

def execute(filters=None):
    columns = [
        {"label": "Fiscal Invoice", "fieldname": "name", "fieldtype": "Link", "options": "DRC Fiscal Invoice", "width": 140},
        {"label": "Sales Invoice", "fieldname": "source_sales_invoice", "fieldtype": "Link", "options": "Sales Invoice", "width": 140},
        {"label": "Date", "fieldname": "creation", "fieldtype": "Date", "width": 110},
        {"label": "POS Point", "fieldname": "receipt_point_name", "fieldtype": "Data", "width": 150},
        {"label": "e-MCF NID", "fieldname": "emcf_nid", "fieldtype": "Data", "width": 140},
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 120},
        {"label": "Total CDF", "fieldname": "amount_cdf", "fieldtype": "Currency", "width": 140},
        {"label": "VAT CDF", "fieldname": "vat_cdf", "fieldtype": "Currency", "width": 120}
    ]
    cond = ["status in ('Normalized', 'Normalized (Test)')"]
    if filters and filters.get("from_date"):
        cond.append(f"creation >= '{filters.get('from_date')}'")
    if filters and filters.get("to_date"):
        cond.append(f"creation <= '{filters.get('to_date')} 23:59:59'")
    if filters and filters.get("emcf_nid"):
        cond.append(f"emcf_nid = '{filters.get('emcf_nid')}'")

    where_clause = " WHERE " + " AND ".join(cond) if cond else ""
    data = frappe.db.sql(f"""
        SELECT name, source_sales_invoice, DATE(creation) as creation, receipt_point_name, emcf_nid, status, amount_cdf, vat_cdf
        FROM `tabDRC Fiscal Invoice`
        {where_clause}
        ORDER BY creation desc
    """, as_dict=True)

    return columns, data
