import frappe
from nextfact.install import after_install as setup_fields_and_roles
from nextfact.api.v1.print import ensure_print_formats

def after_migrate():
    setup_fields_and_roles()
    ensure_print_formats()
    frappe.db.commit()
