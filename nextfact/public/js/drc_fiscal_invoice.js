frappe.ui.form.on("DRC Fiscal Invoice", {
    refresh(frm) {
        if (frm.doc.status && frm.doc.status.includes("Normalized")) {
            frm.add_custom_button(__("Reprint Thermal Receipt"), () => {
                window.open(`/api/method/nextfact.api.v1.print.receipt?sales_invoice=${encodeURIComponent(frm.doc.source_sales_invoice)}`, "_blank");
            });
        }
    }
});
