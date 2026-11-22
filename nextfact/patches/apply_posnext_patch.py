import os
import hashlib
import frappe

def _file_hash(content):
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

def execute():
    """Idempotently injects NextFactActions.vue into POSNext frontend tree."""
    if "pos_next" not in frappe.get_installed_apps():
        return

    app_pkg = frappe.get_app_path("pos_next")
    app_root = os.path.dirname(app_pkg)
    
    candidates = [
        os.path.join(app_root, "POS", "src"),
        os.path.join(app_pkg, "POS", "src"),
        os.path.join(app_root, "pos", "src"),
    ]
    pos_root = next((p for p in candidates if os.path.exists(p)), None)
    if not pos_root:
        frappe.log_error(f"NextFact: POSNext frontend source root not found (tried: {candidates})", "POSNext Patch")
        return

    # 1. Copy NextFactActions.vue component
    target_comp_dir = os.path.join(pos_root, "components", "nextfact")
    os.makedirs(target_comp_dir, exist_ok=True)
    target_comp_path = os.path.join(target_comp_dir, "NextFactActions.vue")

    tmpl_path = os.path.join(os.path.dirname(__file__), "templates", "NextFactActions.vue")
    with open(tmpl_path, "r", encoding="utf-8") as f:
        src_content = f.read()

    need_rebuild = False
    if not os.path.exists(target_comp_path) or _file_hash(src_content) != _file_hash(open(target_comp_path, "r", encoding="utf-8").read()):
        with open(target_comp_path, "w", encoding="utf-8") as f:
            f.write(src_content)
        need_rebuild = True

    # 2. Patch InvoiceManagement.vue (Cards & Table)
    inv_mgmt_path = os.path.join(pos_root, "components", "invoices", "InvoiceManagement.vue")
    if os.path.exists(inv_mgmt_path):
        with open(inv_mgmt_path, "r", encoding="utf-8") as f:
            content = f.read()

        import_marker = 'import NextFactActions from "@/components/nextfact/NextFactActions.vue"'
        if import_marker not in content:
            s_idx = content.find("<script setup>")
            if s_idx != -1:
                content = content[:s_idx + len("<script setup>")] + f"\n{import_marker}\n" + content[s_idx + len("<script setup>"):]

        tag_marker = '<NextFactActions mode="history" :invoice="invoice" />'
        if tag_marker not in content:
            # Inject after @click="$emit('print-invoice', invoice)" </button>
            anchor = '@click="$emit(\'print-invoice\', invoice)"'
            idx = content.find(anchor)
            while idx != -1:
                btn_end = content.find("</button>", idx)
                if btn_end != -1:
                    insert_pos = btn_end + len("</button>")
                    content = content[:insert_pos] + f"\n\t\t\t\t\t\t\t\t\t\t\t{tag_marker}" + content[insert_pos:]
                    need_rebuild = True
                idx = content.find(anchor, insert_pos if btn_end != -1 else idx + len(anchor))

        with open(inv_mgmt_path, "w", encoding="utf-8") as f:
            f.write(content)

    # 3. Patch InvoiceDetailDialog.vue
    inv_detail_path = os.path.join(pos_root, "components", "invoices", "InvoiceDetailDialog.vue")
    if os.path.exists(inv_detail_path):
        with open(inv_detail_path, "r", encoding="utf-8") as f:
            content = f.read()

        import_marker = 'import NextFactActions from "@/components/nextfact/NextFactActions.vue"'
        if import_marker not in content:
            s_idx = content.find("<script setup>")
            if s_idx != -1:
                content = content[:s_idx + len("<script setup>")] + f"\n{import_marker}\n" + content[s_idx + len("<script setup>"):]

        tag_marker = '<NextFactActions mode="history" :invoice="invoiceData" />'
        if tag_marker not in content:
            anchor = '@click="handlePrint"'
            idx = content.find(anchor)
            if idx != -1:
                btn_end = content.find("</Button>", idx)
                if btn_end != -1:
                    insert_pos = btn_end + len("</Button>")
                    content = content[:insert_pos] + f"\n\t\t\t\t{tag_marker}" + content[insert_pos:]
                    need_rebuild = True

        with open(inv_detail_path, "w", encoding="utf-8") as f:
            f.write(content)

    # 4. Patch PaymentDialog.vue (Desktop & Mobile checkout)
    payment_dialog_path = os.path.join(pos_root, "components", "sale", "PaymentDialog.vue")
    if os.path.exists(payment_dialog_path):
        with open(payment_dialog_path, "r", encoding="utf-8") as f:
            content = f.read()

        import_marker = 'import NextFactActions from "@/components/nextfact/NextFactActions.vue"'
        if import_marker not in content:
            s_idx = content.find("<script setup>")
            if s_idx != -1:
                content = content[:s_idx + len("<script setup>")] + f"\n{import_marker}\n" + content[s_idx + len("<script setup>"):]

        tag_marker = '<NextFactActions mode="cart" :submitInvoice="completePayment" :disabled="!canComplete || isSubmitting" />'
        if tag_marker not in content:
            # Target desktop complete payment button
            anchor = '<span>{{ isSubmitting ? __(\'Processing...\') : paymentButtonText }}</span>'
            idx = content.find(anchor)
            if idx != -1:
                btn_end = content.find("</button>", idx)
                if btn_end != -1:
                    insert_pos = btn_end + len("</button>")
                    content = content[:insert_pos] + f"\n\t\t\t\t\t\t{tag_marker}" + content[insert_pos:]
                    need_rebuild = True

        with open(payment_dialog_path, "w", encoding="utf-8") as f:
            f.write(content)

    frappe.logger().info("NEXTFACT_POSNEXT_PATCH_APPLIED")
    if need_rebuild:
        print("\n" + "=" * 60)
        print("NextFact: POSNext frontend patches applied successfully.")
        print(f"Target: {pos_root}")
        print("=" * 60 + "\n")
