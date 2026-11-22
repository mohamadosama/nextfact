import os
import hashlib
import frappe

def _file_hash(content):
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

def execute():
    """Idempotently injects NextFactActions.vue into POSNext frontend tree."""
    if "pos_next" not in frappe.get_installed_apps():
        return

    app_path = frappe.get_app_path("pos_next")
    bench_apps = os.path.dirname(app_path)
    pos_root = os.path.join(bench_apps, "pos_next", "POS", "src")
    if not os.path.exists(pos_root):
        pos_root = os.path.join(bench_apps, "pos_next", "pos", "src")
    if not os.path.exists(pos_root):
        frappe.log_error("NextFact: POSNext frontend source root not found", "POSNext Patch")
        return

    # 1. Copy NextFactActions.vue
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

    # 2. Patch InvoiceHistoryDialog.vue
    history_dialog_path = os.path.join(pos_root, "components", "sale", "InvoiceHistoryDialog.vue")
    if os.path.exists(history_dialog_path):
        with open(history_dialog_path, "r", encoding="utf-8") as f:
            h_content = f.read()

        import_marker = 'import NextFactActions from "@/components/nextfact/NextFactActions.vue"'
        if import_marker not in h_content:
            script_idx = h_content.find("<script setup>")
            if script_idx != -1:
                h_content = h_content[:script_idx + len("<script setup>")] + f"\n{import_marker}\n" + h_content[script_idx + len("<script setup>"):]

        tag_marker = '<NextFactActions mode="history" :invoice="invoice" />'
        if tag_marker not in h_content:
            anchor = '@click="printInvoice(invoice)"'
            btn_end_anchor = '</button>'
            idx = h_content.find(anchor)
            if idx != -1:
                end_idx = h_content.find(btn_end_anchor, idx)
                if end_idx != -1:
                    insert_pos = end_idx + len(btn_end_anchor)
                    h_content = h_content[:insert_pos] + f"\n\t\t\t\t\t\t\t\t\t{tag_marker}" + h_content[insert_pos:]
                    need_rebuild = True

        with open(history_dialog_path, "w", encoding="utf-8") as f:
            f.write(h_content)

    # 3. Patch PaymentDialog.vue
    payment_dialog_path = os.path.join(pos_root, "components", "sale", "PaymentDialog.vue")
    if os.path.exists(payment_dialog_path):
        with open(payment_dialog_path, "r", encoding="utf-8") as f:
            p_content = f.read()

        import_marker = 'import NextFactActions from "@/components/nextfact/NextFactActions.vue"'
        if import_marker not in p_content:
            script_idx = p_content.find("<script setup>")
            if script_idx != -1:
                p_content = p_content[:script_idx + len("<script setup>")] + f"\n{import_marker}\n" + p_content[script_idx + len("<script setup>"):]

        tag_marker = '<NextFactActions mode="cart" :submitInvoice="completePayment" :disabled="isSubmitting || !canComplete" />'
        if tag_marker not in p_content:
            anchor = '@click="completePayment"'
            btn_end_anchor = '</button>'
            idx = p_content.find(anchor)
            if idx != -1:
                end_idx = p_content.find(btn_end_anchor, idx)
                if end_idx != -1:
                    insert_pos = end_idx + len(btn_end_anchor)
                    p_content = p_content[:insert_pos] + f"\n\t\t\t\t\t\t{tag_marker}" + p_content[insert_pos:]
                    need_rebuild = True

        with open(payment_dialog_path, "w", encoding="utf-8") as f:
            f.write(p_content)

    frappe.logger().info("NEXTFACT_POSNEXT_PATCH_OK")
    if need_rebuild:
        print("\n" + "=" * 60)
        print("NextFact: POSNext frontend patches applied.")
        print("Please run: bench build --app pos_next")
        print("=" * 60 + "\n")
