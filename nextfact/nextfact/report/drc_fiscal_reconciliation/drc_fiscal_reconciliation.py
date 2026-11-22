import frappe

def execute(filters=None):
    columns = [
        {"label": "Point of Sale", "fieldname": "point_name", "fieldtype": "Data", "width": 160},
        {"label": "e-MCF NID", "fieldname": "emcf_nid", "fieldtype": "Data", "width": 150},
        {"label": "Normalized Invoices (ERP)", "fieldname": "erp_count", "fieldtype": "Int", "width": 180},
        {"label": "Total Normalized CDF", "fieldname": "total_amount", "fieldtype": "Currency", "width": 180}
    ]
    data = frappe.db.sql("""
        SELECT 
            COALESCE(receipt_point_name, pos_mapping) as point_name,
            emcf_nid,
            COUNT(name) as erp_count,
            SUM(amount_cdf) as total_amount
        FROM `tabDRC Fiscal Invoice`
        WHERE status in ('Normalized', 'Normalized (Test)')
        GROUP BY point_name, emcf_nid
    """, as_dict=True)
    return columns, data
