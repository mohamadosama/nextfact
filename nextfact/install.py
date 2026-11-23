import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

CUSTOM_FIELDS = {
    "Sales Invoice": [
        {
            "fieldname": "custom_drc_fiscal_invoice",
            "label": "DRC Fiscal Invoice",
            "fieldtype": "Link",
            "options": "DRC Fiscal Invoice",
            "insert_after": "amended_from",
            "read_only": 1,
            "no_copy": 1,
            "print_hide": 1,
            "unique": 1,
        },
        {
            "fieldname": "custom_drc_fiscal_status",
            "label": "DRC Fiscal Status",
            "fieldtype": "Data",
            "insert_after": "custom_drc_fiscal_invoice",
            "read_only": 1,
            "no_copy": 1,
            "print_hide": 1,
        },
    ],
    "Customer": [
        {
            "fieldname": "custom_drc_client_type",
            "label": "DRC Client Type",
            "fieldtype": "Select",
            "options": "\nPP\nPM\nPC\nPL\nAO",
            "default": "PP",
            "insert_after": "tax_id",
            "description": "DRC FACT+ client classification (PP: Particulier, PM: Entreprise, etc.)",
        },
    ],
    "Item": [
        {
            "fieldname": "custom_drc_item_type",
            "label": "DRC Item Type",
            "fieldtype": "Select",
            "options": "\nBIE\nSER\nTAX",
            "default": "BIE",
            "insert_after": "item_group",
            "description": "BIE (Good), SER (Service), TAX (Specific Tax)",
        },
        {
            "fieldname": "custom_drc_tax_group",
            "label": "DRC Tax Group Override",
            "fieldtype": "Data",
            "insert_after": "custom_drc_item_type",
            "description": "Specific tax group code (e.g. K, B, A, Q, R, S)",
        },
    ],
    "Item Group": [
        {
            "fieldname": "custom_drc_tax_group",
            "label": "DRC Tax Group Override",
            "fieldtype": "Data",
            "insert_after": "parent_item_group",
            "description": "Default tax group code for items in this group",
        },
    ],
}

ROLES = [
    {"role_name": "NextFact Cashier", "desk_access": 1},
    {"role_name": "NextFact Manager", "desk_access": 1},
    {"role_name": "NextFact Admin", "desk_access": 1},
]

def ensure_desktop_icon_and_workspace():
    # 1. Desktop Icon
    icon_vals = {
        "label": "NextFact",
        "icon_type": "App",
        "link_type": "External",
        "link": "/desk/nextfact",
        "icon": "receipt",
        "logo_url": "/assets/nextfact/images/nextfact-logo.svg",
        "bg_color": "blue",
        "standard": 1,
        "app": "nextfact",
        "hidden": 0,
        "parent_icon": None
    }
    if not frappe.db.exists("Desktop Icon", "NextFact"):
        icon = frappe.new_doc("Desktop Icon")
        icon.name = "NextFact"
        icon.update(icon_vals)
        icon.insert(ignore_permissions=True)
    else:
        frappe.db.set_value("Desktop Icon", "NextFact", icon_vals)

    # 2. Workspace Sidebar
    if not frappe.db.exists("Workspace Sidebar", "NextFact"):
        sb = frappe.new_doc("Workspace Sidebar")
        sb.name = "NextFact"
        sb.title = "NextFact"
        sb.app = "nextfact"
        sb.header_icon = "receipt"
        sb.standard = 1
        items = [
            {"label": "NextFact Overview", "link_to": "NextFact", "link_type": "Workspace", "icon": "receipt"},
            {"label": "DRC Fiscal Invoice", "link_to": "DRC Fiscal Invoice", "link_type": "DocType", "icon": "file-text"},
            {"label": "DRC Fact Settings", "link_to": "DRC Fact Settings", "link_type": "DocType", "icon": "settings"},
            {"label": "DRC POS Mapping", "link_to": "DRC POS Mapping", "link_type": "DocType", "icon": "map-pin"},
            {"label": "DRC Declared Turnover", "link_to": "DRC Declared Turnover", "link_type": "Report", "icon": "table"},
            {"label": "DRC Fiscal Reconciliation", "link_to": "DRC Fiscal Reconciliation", "link_type": "Report", "icon": "table"},
            {"label": "DRC Fact Log", "link_to": "DRC Fact Log", "link_type": "DocType", "icon": "list"},
            {"label": "DRC Print Log", "link_to": "DRC Print Log", "link_type": "DocType", "icon": "printer"},
        ]
        for it in items:
            sb.append("items", it)
        sb.insert(ignore_permissions=True)

    # 3. Synchronize existing Desktop Layout records
    import json
    for user_row in frappe.get_all("Desktop Layout", fields=["name", "user", "layout"]):
        if user_row.layout:
            try:
                layout = json.loads(user_row.layout)
                if isinstance(layout, list) and not any(i.get("label") == "NextFact" for i in layout):
                    layout.append(icon_vals)
                    frappe.db.set_value("Desktop Layout", user_row.name, "layout", json.dumps(layout))
            except Exception:
                pass

def after_install():
    # 1. Custom fields
    create_custom_fields(CUSTOM_FIELDS, update=True)
    
    # 2. Roles
    for r in ROLES:
        if not frappe.db.exists("Role", r["role_name"]):
            role = frappe.new_doc("Role")
            role.role_name = r["role_name"]
            role.desk_access = r["desk_access"]
            role.insert(ignore_permissions=True)

    # 3. Workspace and Desktop Icon
    ensure_desktop_icon_and_workspace()
            
    frappe.db.commit()
