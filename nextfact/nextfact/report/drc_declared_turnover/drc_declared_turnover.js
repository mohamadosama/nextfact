frappe.query_reports["DRC Declared Turnover"] = {
    "filters": [
        {"fieldname": "from_date", "label": __("From Date"), "fieldtype": "Date", "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1)},
        {"fieldname": "to_date", "label": __("To Date"), "fieldtype": "Date", "default": frappe.datetime.get_today()},
        {"fieldname": "emcf_nid", "label": __("e-MCF NID"), "fieldtype": "Data"}
    ]
};
