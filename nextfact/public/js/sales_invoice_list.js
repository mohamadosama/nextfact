frappe.listview_settings["Sales Invoice"] = frappe.listview_settings["Sales Invoice"] || {};

frappe.listview_settings["Sales Invoice"].add_fields = frappe.listview_settings["Sales Invoice"].add_fields || [];
frappe.listview_settings["Sales Invoice"].add_fields.push("custom_drc_fiscal_status", "custom_drc_fiscal_invoice");

frappe.listview_settings["Sales Invoice"].onload = function(listview) {
    listview.page.add_action_item(__("NextFact: Print Delivery Notes"), function() {
        const checked = listview.get_checked_items();
        if (!checked.length) {
            frappe.msgprint(__("Please select invoices first."));
            return;
        }
        for (const item of checked) {
            window.open(`/api/method/nextfact.api.v1.print.delivery_note?sales_invoice=${encodeURIComponent(item.name)}`, "_blank");
        }
    });
};
