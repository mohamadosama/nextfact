frappe.listview_settings["DRC Fiscal Invoice"] = {
    add_fields: ["status", "dgi_environment", "invoice_type"],
    get_indicator: function(doc) {
        if (doc.status === "Normalized") {
            return [__("Normalized"), "green", "status,=,Normalized"];
        } else if (doc.status === "Normalized (Test)") {
            return [__("Normalized (Test)"), "blue", "status,=,Normalized (Test)"];
        } else if (doc.status === "Pending Verification") {
            return [__("Pending Verification"), "orange", "status,=,Pending Verification"];
        } else if (doc.status === "Failed") {
            return [__("Failed"), "red", "status,=,Failed"];
        } else if (doc.status === "Cancelled by RAN") {
            return [__("Cancelled by RAN"), "darkgrey", "status,=,Cancelled by RAN"];
        } else {
            return [__("Draft"), "grey", "status,=,Draft"];
        }
    }
};
