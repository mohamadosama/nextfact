app_name = "nextfact"
app_title = "NextFact"
app_publisher = "Mohamad Osama"
app_description = "DRC FACT+ E-Invoicing for ERPNext (DRC DGI)"
app_email = "mohamad.osama@outlook.com"
app_license = "MIT"
required_apps = ["frappe", "erpnext"]

after_install = "nextfact.install.after_install"

after_migrate = [
    "nextfact.migrate.after_migrate",
    "nextfact.patches.apply_posnext_patch.execute",
]

doctype_js = {
    "Sales Invoice": "public/js/sales_invoice_custom.js",
    "DRC Fiscal Invoice": "public/js/drc_fiscal_invoice.js"
}

doctype_list_js = {
    "Sales Invoice": "public/js/sales_invoice_list.js",
    "DRC Fiscal Invoice": "public/js/drc_fiscal_invoice_list.js"
}

doc_events = {
    "Sales Invoice": {
        "before_cancel": "nextfact.overrides.sales_invoice.before_cancel"
    }
}

scheduler_events = {
    "cron": {
        "*/5 * * * *": [
            "nextfact.api.normalize.verify_pending_invoices"
        ]
    },
    "daily": [
        "nextfact.api.v1.fiscal.purge_actions"
    ]
}

jinja = {
    "methods": [
        "nextfact.api.gateway.get_qr_base64",
        "nextfact.api.format.fmt_money",
        "nextfact.api.format.nextfact_labels"
    ]
}
