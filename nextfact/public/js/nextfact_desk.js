frappe.provide("nextfact");

// Auto-heal Frappe v16 Desk layout if browser has stale localStorage from before NextFact was installed
$(document).on("toolbar_setup", function () {
	try {
		const user = frappe.session.user;
		if (!user || user === "Guest") return;
		const key = `${user}:desktop`;
		const stored = localStorage.getItem(key);
		if (stored && !stored.includes("NextFact")) {
			localStorage.removeItem(key);
			frappe.call({
				method: "frappe.desk.doctype.desktop_layout.desktop_layout.delete_layout",
				callback: function () {
					if (frappe.pages["desktop"]?.desktop_page) {
						frappe.pages["desktop"].desktop_page.update();
					}
				}
			});
		}
	} catch (e) {
		console.warn("NextFact desktop sync:", e);
	}
});
