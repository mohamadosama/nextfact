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
            
    frappe.db.commit()
