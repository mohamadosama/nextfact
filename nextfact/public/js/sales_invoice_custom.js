frappe.ui.form.on("Sales Invoice", {
    refresh(frm) {
        if (frm.doc.docstatus !== 1) return;

        const fiscalDoc = frm.doc.custom_drc_fiscal_invoice;
        const status = (frm.doc.custom_drc_fiscal_status || "").toLowerCase();

        // Indicator in dashboard
        let color = "grey";
        if (status.includes("normalized")) color = "green";
        else if (status.includes("pending")) color = "orange";
        else if (status.includes("failed")) color = "red";

        frm.dashboard.set_headline_alert(
            `<span class="indicator-pill ${color}">DRC Fiscal: ${frm.doc.custom_drc_fiscal_status || "Not Reported"}</span>`
        );

        // NextFact Action Button Group
        const group = "NextFact";

        if (!fiscalDoc || status === "draft") {
            frm.add_custom_button(__("Report + Print VAT Receipt"), () => {
                frm.call({
                    method: "nextfact.api.v1.fiscal.report",
                    args: { sales_invoice: frm.doc.name },
                    freeze: true,
                    freeze_message: __("Reporting invoice to DRC FACT+ / DGI..."),
                    callback(r) {
                        if (r.message && r.message.ok) {
                            frappe.show_alert({ message: __("Invoice normalized successfully!"), indicator: "green" });
                            frm.reload_doc();
                            if (r.message.data && r.message.data.print_url) {
                                window.open(r.message.data.print_url, "_blank");
                            }
                        } else if (r.message && r.message.status === "needs_choice") {
                            show_mapping_picker(frm, r.message.choices);
                        }
                    }
                });
            }, group);
        } else if (status === "pending verification") {
            frm.add_custom_button(__("Check Status (Verify)"), () => {
                frm.call({
                    method: "nextfact.api.v1.fiscal.verify",
                    args: { sales_invoice: frm.doc.name },
                    freeze: true,
                    callback(r) {
                        frm.reload_doc();
                    }
                });
            }, group);
        } else if (status === "failed") {
            frm.add_custom_button(__("Retry Report"), () => {
                frm.call({
                    method: "nextfact.api.v1.fiscal.report",
                    args: { sales_invoice: frm.doc.name },
                    freeze: true,
                    callback(r) {
                        frm.reload_doc();
                    }
                });
            }, group);
        } else if (status.includes("normalized")) {
            frm.add_custom_button(__("Reprint VAT Receipt"), () => {
                window.open(`/api/method/nextfact.api.v1.print.receipt?sales_invoice=${encodeURIComponent(frm.doc.name)}`, "_blank");
            }, group);

            if (frappe.user.has_role("NextFact Manager") || frappe.user.has_role("System Manager")) {
                frm.add_custom_button(__("Cancel Fiscal Invoice (RAN)"), () => {
                    frappe.prompt([
                        { fieldname: "reason", fieldtype: "Small Text", label: __("Reason for cancellation"), reqd: 1 }
                    ], (vals) => {
                        frm.call({
                            method: "nextfact.api.v1.fiscal.cancel_ran",
                            args: { fiscal_invoice: frm.doc.custom_drc_fiscal_invoice, reason: vals.reason },
                            freeze: true,
                            freeze_message: __("Transmitting cancellation to DGI..."),
                            callback(r) {
                                frappe.show_alert({ message: __("Invoice cancelled via credit note (RAN)"), indicator: "orange" });
                                frm.reload_doc();
                            }
                        });
                    }, __("Cancel Fiscal Invoice"), __("Submit Cancellation"));
                }, group);
            }
        }

        // Always available for submitted invoices
        frm.add_custom_button(__("Print Delivery Note"), () => {
            window.open(`/api/method/nextfact.api.v1.print.delivery_note?sales_invoice=${encodeURIComponent(frm.doc.name)}`, "_blank");
        }, group);
    }
});

function show_mapping_picker(frm, choices) {
    const d = new frappe.ui.Dialog({
        title: __("Select DRC Point of Sale"),
        fields: [
            {
                fieldname: "pos_mapping",
                fieldtype: "Select",
                label: __("Point of Sale"),
                options: choices.map(c => `${c.mapping}: ${c.title} (${c.emcf_nid || ""})`),
                reqd: 1
            }
        ],
        primary_action_label: __("Report"),
        primary_action(vals) {
            const chosen = vals.pos_mapping.split(":")[0].trim();
            d.hide();
            frm.call({
                method: "nextfact.api.v1.fiscal.report",
                args: { sales_invoice: frm.doc.name, pos_mapping: chosen },
                freeze: true,
                callback(r) {
                    frm.reload_doc();
                    if (r.message && r.message.data && r.message.data.print_url) {
                        window.open(r.message.data.print_url, "_blank");
                    }
                }
            });
        }
    });
    d.show();
}
