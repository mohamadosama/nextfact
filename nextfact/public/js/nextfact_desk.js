frappe.provide("nextfact");

(function () {
	const NF_ICON = {
		name: "NextFact",
		label: "NextFact",
		link_type: "External",
		link: "/desk/nextfact",
		app: "nextfact",
		logo_url: "/assets/nextfact/images/nextfact-logo.svg",
		icon: "receipt",
		hidden: 0,
		icon_type: "App",
		standard: 1
	};

	function syncNextFactDesktop() {
		try {
			const user = frappe.session?.user;
			if (!user || user === "Guest") return;

			// 1. Ensure frappe.boot.desktop_icons has NextFact
			if (frappe.boot?.desktop_icons && Array.isArray(frappe.boot.desktop_icons)) {
				if (!frappe.boot.desktop_icons.some(i => i.label === "NextFact" || i.name === "NextFact")) {
					frappe.boot.desktop_icons.push(NF_ICON);
				}
			}

			// 2. Ensure localStorage has NextFact
			const key = `${user}:desktop`;
			const stored = localStorage.getItem(key);
			let needsUpdate = false;
			if (stored) {
				try {
					let parsed = JSON.parse(stored);
					if (Array.isArray(parsed) && !parsed.some(i => i.label === "NextFact" || i.name === "NextFact")) {
						parsed.push(NF_ICON);
						localStorage.setItem(key, JSON.stringify(parsed));
						needsUpdate = true;
					}
				} catch (e) {
					localStorage.removeItem(key);
					needsUpdate = true;
				}
			}

			// 3. Ensure live frappe.desktop_icons has NextFact
			if (frappe.desktop_icons && Array.isArray(frappe.desktop_icons)) {
				if (!frappe.desktop_icons.some(i => i.label === "NextFact" || i.name === "NextFact")) {
					frappe.desktop_icons.push(NF_ICON);
					needsUpdate = true;
				}
			}

			// 4. Update desktop page if currently rendered
			if (needsUpdate && frappe.pages["desktop"]?.desktop_page) {
				frappe.pages["desktop"].desktop_page.update();
			}
		} catch (err) {
			console.warn("NextFact desktop sync:", err);
		}
	}

	// Run on initial load and navigation
	$(document).ready(syncNextFactDesktop);
	$(document).on("toolbar_setup desktop_screen page-change", syncNextFactDesktop);

	if (window.frappe && frappe.router) {
		frappe.router.on("change", function () {
			const r = frappe.get_route_str();
			if (r === "desktop" || r === "desk" || r === "") {
				syncNextFactDesktop();
			}
		});
	}
})();