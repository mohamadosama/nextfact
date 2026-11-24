frappe.pages["nextfact-setup-wizard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "NextFact Setup Wizard",
		single_column: true,
	});
	wrapper.wizard = new NextFactSetupWizard(page);
};

frappe.pages["nextfact-setup-wizard"].on_page_show = function (wrapper) {
	if (wrapper.wizard) {
		wrapper.wizard.refresh();
	}
};

class NextFactSetupWizard {
	constructor(page) {
		this.page = page;
		this.lang = (frappe.boot.user && frappe.boot.user.language === "fr") ? "fr" : "en";
		this.state = null;
		this.step = 1;
		this.editingMapping = null;
		this.tokenVerifiedInfo = null;
		this.$root = $('<div class="nf-wiz-wrap"></div>').appendTo(this.page.body);
		this.setupPageActions();
		this.refresh();
	}

	t(en, fr) {
		return this.lang === "fr" ? fr : en;
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	setupPageActions() {
		this.page.set_primary_action(this.t("Refresh", "Actualiser"), () => this.refresh(), "refresh");
		this.page.add_inner_button(
			this.lang === "fr" ? "English" : "Français",
			() => {
				this.lang = this.lang === "fr" ? "en" : "fr";
				this.page.set_title(this.t("NextFact Setup Wizard", "Assistant de configuration NextFact"));
				this.render();
			}
		);
	}

	async callApi(method, args = {}) {
		const r = await frappe.call({
			method: `nextfact.api.v1.wizard.${method}`,
			args,
		});
		const msg = r.message || {};
		if (msg.ok === false) {
			const err = msg.error || {};
			frappe.msgprint({
				title: err.title || this.t("Error", "Erreur"),
				message: this.esc(err.detail || "Unexpected error"),
				indicator: "red",
			});
			throw new Error(err.detail || "API Error");
		}
		return msg.data || msg;
	}

	async refresh() {
		this.$root.html(`<div class="text-center text-muted" style="padding:48px;">${this.t("Loading NextFact Setup Wizard...", "Chargement de l'assistant NextFact...")}</div>`);
		try {
			this.state = await this.callApi("get_state");
			if (this.state.active_session) {
				this.step = this.state.active_session.current_step || 1;
			}
			this.render();
		} catch (e) {
			this.$root.html(`<div class="nf-card text-danger">${this.esc(e.message)}</div>`);
		}
	}

	async ensureSession(env = "test", forceNew = 0) {
		const res = await this.callApi("start_or_resume", {
			target_environment: env,
			force_new: forceNew,
		});
		this.state = await this.callApi("get_state");
		if (res.session) {
			this.step = res.session.current_step || 1;
		}
		this.render();
	}

	openLightbox(imgUrl, caption) {
		const d = new frappe.ui.Dialog({
			title: caption,
			size: "extra-large",
		});
		d.$body.html(`
			<div style="text-align:center; background:#0f172a; padding:12px; border-radius:8px;">
				<img src="${imgUrl}" style="max-width:100%; max-height:78vh; border-radius:6px;" />
			</div>
		`);
		d.show();
	}

	showAuditModal(session) {
		if (!session) return;
		const rows = (session.activity_log || []).map((l) => `
			<tr>
				<td style="white-space:nowrap; font-size:11px;">${this.esc(l.timestamp.slice(0, 19))}</td>
				<td><span class="nf-badge nf-badge-blue">Step ${l.step_no}</span></td>
				<td><b>${this.esc(l.action)}</b><div class="text-muted" style="font-size:11px;">${this.esc(l.details)}</div></td>
				<td><span class="nf-badge ${l.result === "Success" ? "nf-badge-green" : l.result === "Error" ? "nf-badge-red" : "nf-badge-amber"}">${this.esc(l.result)}</span></td>
				<td>${l.ref_docname ? `<a href="/desk/${frappe.router.slug(l.ref_doctype)}/${encodeURIComponent(l.ref_docname)}" target="_blank">${this.esc(l.ref_docname)}</a>` : "-"}</td>
			</tr>
		`).join("");
		const d = new frappe.ui.Dialog({
			title: `${this.t("Audit Log", "Journal d'audit")} — ${session.name}`,
			size: "large",
		});
		d.$body.html(`
			<div class="mb-3 flex justify-between items-center">
				<span class="text-muted">${this.t("Started by", "Démarré par")}: <b>${this.esc(session.started_by)}</b> • ${this.esc(session.started_at)}</span>
				<a class="btn btn-xs btn-default" href="/desk/drc-setup-session/${encodeURIComponent(session.name)}" target="_blank">${this.t("Open Audit Doc", "Ouvrir le document d'audit")} ↗</a>
			</div>
			<div style="max-height:55vh; overflow:auto;">
				<table class="table table-bordered table-sm">
					<thead><tr><th>${this.t("Time", "Heure")}</th><th>${this.t("Step", "Étape")}</th><th>${this.t("Action", "Action")}</th><th>${this.t("Result", "Résultat")}</th><th>${this.t("Doc", "Document")}</th></tr></thead>
					<tbody>${rows || `<tr><td colspan="5" class="text-center text-muted">${this.t("No entries yet", "Aucune entrée")}</td></tr>`}</tbody>
				</table>
			</div>
		`);
		d.show();
	}

	promptReset(session) {
		const d = new frappe.ui.Dialog({
			title: this.t("Reset Setup Wizard Session", "Réinitialiser la session de configuration"),
			fields: [
				{
					fieldtype: "HTML",
					options: `<p class="text-muted">${this.t(
						"Archiving the current session preserves full audit history and does NOT turn off your active ERPNext configuration unless you disable it in DRC Fact Settings.",
						"L'archivage de la session conserve tout l'historique d'audit et ne désactive PAS votre configuration active sauf si vous le faites dans DRC Fact Settings."
					)}</p>`,
				},
				{
					fieldname: "reason",
					fieldtype: "Small Text",
					label: this.t("Reason for Reset", "Motif de la réinitialisation"),
					default: "Re-running onboarding steps",
					reqd: 1,
				},
			],
			primary_action_label: this.t("Archive & Start Fresh", "Archiver et recommencer"),
			primary_action: async (vals) => {
				d.hide();
				await this.callApi("reset_session", {
					session_name: session.name,
					reason: vals.reason,
				});
				frappe.show_alert({ message: this.t("Session archived", "Session archivée"), indicator: "orange" });
				await this.ensureSession("test", 1);
			},
		});
		d.show();
	}

	renderShot(imgName, caption) {
		const url = `/assets/nextfact/images/wizard/${imgName}`;
		return `
			<div class="nf-guide-shot" data-zoom-img="${url}" data-zoom-cap="${this.esc(caption)}">
				<img src="${url}" alt="${this.esc(caption)}" />
				<div class="nf-guide-caption">
					<span>${this.esc(caption)}</span>
					<span style="font-size:11px; color:#2563eb;">🔍 ${this.t("Click to zoom", "Agrandir")}</span>
				</div>
			</div>
		`;
	}

	render() {
		const s = this.state;
		if (!s) return;
		const session = s.active_session;
		const lastCompleted = s.last_completed_session;

		let html = "";

		// Top Links Strip (always visible so admin can jump to real documents before or after)
		html += `
			<div class="nf-wiz-links-strip">
				<span style="font-size:12px; font-weight:700; color:var(--text-muted);">${this.t("Underlying Live Documents:", "Documents réels liés :")}</span>
				<a class="btn btn-xs btn-default" href="/desk/drc-fact-settings" target="_blank">⚙ DRC Fact Settings ↗</a>
				<a class="btn btn-xs btn-default" href="/desk/drc-pos-mapping" target="_blank">📍 DRC POS Mapping (${s.mappings.length}) ↗</a>
				<a class="btn btn-xs btn-default" href="/desk/drc-pos-route" target="_blank">🔀 DRC POS Route (${s.routes.length}) ↗</a>
				<a class="btn btn-xs btn-default" href="/desk/drc-fiscal-invoice" target="_blank">🧾 DRC Fiscal Invoice (${s.preflight.fiscal_invoices_total}) ↗</a>
				<a class="btn btn-xs btn-default" href="/desk/drc-setup-session" target="_blank">📋 Setup Sessions ↗</a>
				<span class="ml-auto">
					<span class="nf-badge ${s.settings.enabled ? "nf-badge-green" : "nf-badge-amber"}">
						${s.settings.enabled ? this.t("Integration: ENABLED", "Intégration : ACTIVÉE") : this.t("Integration: DISABLED", "Intégration : DÉSACTIVÉE")}
					</span>
				</span>
			</div>
		`;

		// If no active session, show landing/promotion card
		if (!session) {
			html += this.renderLandingScreen(lastCompleted);
			this.$root.html(html);
			this.bindCommonEvents();
			return;
		}

		const envBadge = session.target_environment === "production"
			? `<span class="nf-badge nf-badge-green">PRODUCTION (LIVE DGI)</span>`
			: `<span class="nf-badge nf-badge-amber">SANDBOX (TEST)</span>`;

		html += `
			<div class="nf-wiz-banner">
				<div>
					<div style="font-size:15px; font-weight:700;">
						${this.t("Setup Session", "Session")} <a href="/desk/drc-setup-session/${encodeURIComponent(session.name)}" target="_blank">${this.esc(session.name)}</a>
						&nbsp;${envBadge}
					</div>
					<div class="text-muted" style="font-size:12px; margin-top:2px;">
						${this.t("Started by", "Par")} <b>${this.esc(session.started_by)}</b> • ${this.esc(session.started_at)}
						• ${(session.activity_log || []).length} ${this.t("audited actions", "actions auditées")}
					</div>
				</div>
				<div class="flex gap-2">
					<button class="btn btn-sm btn-default" id="nf-btn-audit">📜 ${this.t("Audit Log", "Journal d'audit")}</button>
					<button class="btn btn-sm btn-warning" id="nf-btn-reset">↺ ${this.t("Reset Wizard", "Réinitialiser")}</button>
				</div>
			</div>
		`;

		// Stepper
		const stepsMeta = [
			[1, this.t("Mode & Check", "Mode & Vérif.")],
			[2, this.t("API & Shops", "API & Boutiques")],
			[3, this.t("Tax Groups", "Groupes TVA")],
			[4, this.t("Payments", "Paiements")],
			[5, this.t("Receipt", "Ticket 80mm")],
			[6, this.t("POS Routing", "Routage PDV")],
			[7, this.t("Activate", "Activer")],
		];
		const completedSet = new Set(session.completed_steps || []);
		html += `<div class="nf-wiz-stepper">`;
		for (const [num, label] of stepsMeta) {
			const cls = num === this.step ? "active" : (completedSet.has(num) ? "done" : "");
			html += `
				<div class="nf-step-pill ${cls}" data-goto-step="${num}">
					<span class="nf-step-num">${completedSet.has(num) && num !== this.step ? "✓" : num}</span>
					<span>${this.esc(label)}</span>
				</div>
			`;
		}
		html += `</div>`;

		// Step Body
		html += `<div id="nf-step-body">${this.renderCurrentStep(session)}</div>`;
		this.$root.html(html);
		this.bindCommonEvents(session);
		this.bindStepEvents(session);
	}

	renderLandingScreen(lastCompleted) {
		const s = this.state;
		const recentRows = (s.recent_sessions || []).map((r) => `
			<tr>
				<td><a href="/desk/drc-setup-session/${encodeURIComponent(r.name)}" target="_blank">${this.esc(r.name)}</a></td>
				<td><span class="nf-badge ${r.status === "Completed" ? "nf-badge-green" : r.status === "In Progress" ? "nf-badge-blue" : "nf-badge-amber"}">${this.esc(r.status)}</span></td>
				<td>${this.esc(r.target_environment)}</td>
				<td>${this.esc(r.started_by)}</td>
				<td>${this.esc(r.started_at || "")}</td>
				<td>${r.duration_seconds ? `${r.duration_seconds}s` : "-"}</td>
			</tr>
		`).join("");

		const completedCard = lastCompleted ? `
			<div class="nf-card" style="border-left:4px solid #10b981;">
				<div class="nf-card-title">✅ ${this.t("Previous Setup Completed", "Configuration précédente terminée")} (${this.esc(lastCompleted.target_environment).toUpperCase()})</div>
				<div class="nf-card-sub">
					${this.t("Completed by", "Terminé par")} <b>${this.esc(lastCompleted.completed_by)}</b> • ${this.esc(lastCompleted.completed_at)}
					(${lastCompleted.duration_seconds || 0}s) — <a href="/desk/drc-setup-session/${encodeURIComponent(lastCompleted.name)}" target="_blank">${this.esc(lastCompleted.name)} ↗</a>
				</div>
				<div class="flex flex-wrap gap-2">
					${lastCompleted.target_environment === "test" ? `
						<button class="btn btn-primary" id="nf-btn-promote-prod">🚀 ${this.t("Promote to Production (Go-Live)", "Passer en Production (Mise en service)")}</button>
					` : ""}
					<button class="btn btn-default" id="nf-btn-start-sandbox">🧪 ${this.t("Run Sandbox Setup", "Lancer config. Sandbox")}</button>
					<button class="btn btn-default" id="nf-btn-start-prod">🏭 ${this.t("Review / Update Production", "Revoir / MAJ Production")}</button>
				</div>
			</div>
		` : `
			<div class="nf-card">
				<div class="nf-card-title">👋 ${this.t("Welcome to NextFact Onboarding", "Bienvenue dans l'assistant NextFact")}</div>
				<div class="nf-card-sub">
					${this.t(
						"Connect this ERPNext site safely to DRC FACT+ (DGI e-DEF / e-MCF). All entries save directly into standard NextFact settings so you can adjust or toggle integration anytime.",
						"Connectez ce site ERPNext en toute sécurité à DRC FACT+ (DGI e-DEF / e-MCF). Chaque saisie est enregistrée directement dans les paramètres standards NextFact."
					)}
				</div>
				<div class="flex flex-wrap gap-2">
					<button class="btn btn-primary" id="nf-btn-start-sandbox">🧪 ${this.t("Start Sandbox Setup (Recommended First)", "Démarrer en Sandbox (Recommandé)")}</button>
					<button class="btn btn-default" id="nf-btn-start-prod">🏭 ${this.t("Start Production Setup (Live DGI)", "Démarrer en Production (DGI Réelle)")}</button>
				</div>
			</div>
		`;

		return `
			${completedCard}
			<div class="nf-card">
				<div class="nf-card-title">📋 ${this.t("Past Setup Sessions (Audit History)", "Historique des sessions de configuration")}</div>
				<table class="table table-bordered table-sm mt-2">
					<thead><tr><th>${this.t("Session", "Session")}</th><th>${this.t("Status", "Statut")}</th><th>${this.t("Mode", "Mode")}</th><th>${this.t("Admin", "Admin")}</th><th>${this.t("Started", "Début")}</th><th>${this.t("Duration", "Durée")}</th></tr></thead>
					<tbody>${recentRows || `<tr><td colspan="6" class="text-center text-muted">${this.t("No setup sessions yet", "Aucune session pour le moment")}</td></tr>`}</tbody>
				</table>
			</div>
		`;
	}

	renderCurrentStep(session) {
		switch (this.step) {
			case 1: return this.renderStep1(session);
			case 2: return this.renderStep2(session);
			case 3: return this.renderStep3(session);
			case 4: return this.renderStep4(session);
			case 5: return this.renderStep5(session);
			case 6: return this.renderStep6(session);
			case 7: return this.renderStep7(session);
			default: return this.renderStep1(session);
		}
	}

	renderStep1(session) {
		const pf = this.state.preflight;
		const env = session.target_environment;
		const compRows = (pf.companies || []).map((c) => `
			<tr>
				<td><a href="/desk/company/${encodeURIComponent(c.name)}" target="_blank">${this.esc(c.name)}</a></td>
				<td>${this.esc(c.default_currency)}</td>
				<td>${c.default_expense_account ? `<span class="nf-badge nf-badge-green">✓ ${this.esc(c.default_expense_account)}</span>` : `<span class="nf-badge nf-badge-red">Missing Expense Account</span>`}</td>
			</tr>
		`).join("");
		const posRows = (pf.pos_profiles || []).map((p) => `
			<span class="nf-badge nf-badge-blue" style="margin:2px;">
				<a href="/desk/pos-profile/${encodeURIComponent(p.name)}" target="_blank" style="color:inherit;">${this.esc(p.name)} (${this.esc(p.warehouse || "-")})</a>
			</span>
		`).join("");

		return `
			<div class="nf-wiz-grid">
				<div class="nf-card">
					<div class="nf-card-title">1. ${this.t("Choose Mode & Check Site Readiness", "Choisir le mode & Vérifier le site")}</div>
					<div class="nf-card-sub">${this.t("Always start with Sandbox if this is a first-time setup, then promote to Production once a test receipt prints cleanly.", "Commencez toujours en Sandbox lors d'une première installation, puis passez en Production après un test concluant.")}</div>

					<div class="nf-env-cards">
						<div class="nf-env-option ${env === "test" ? "selected-test" : ""}" data-select-env="test">
							<div style="font-weight:700;">🧪 ${this.t("Sandbox (Test Mode)", "Sandbox (Mode Test)")}</div>
							<div class="text-muted" style="font-size:12px; margin-top:4px;">
								${this.t("Safe testing against test DGI e-MCF. Receipts show 'TEST - NOT A FISCAL DOCUMENT'. Zero legal tax liability.", "Tests sans risque. Les tickets affichent 'TEST - NOT A FISCAL DOCUMENT'. Aucune déclaration fiscale réelle.")}
							</div>
						</div>
						<div class="nf-env-option ${env === "production" ? "selected-prod" : ""}" data-select-env="production">
							<div style="font-weight:700;">🏭 ${this.t("Production (Live DGI)", "Production (DGI Réelle)")}</div>
							<div class="text-muted" style="font-size:12px; margin-top:4px;">
								${this.t("Every normalized sale issues a real DGI DEF code and books turnover to your official NIF.", "Chaque facture normalisée génère un code DEF officiel déclaré sous votre NIF.")}
							</div>
						</div>
					</div>

					<h5 style="font-weight:700; margin-top:16px;">${this.t("ERPNext Pre-Flight Audit", "Audit préalable ERPNext")}</h5>
					<table class="table table-bordered table-sm mt-2">
						<thead><tr><th>${this.t("Company", "Société")}</th><th>${this.t("Currency", "Devise")}</th><th>${this.t("Default Expense Account", "Compte de charge par défaut")}</th></tr></thead>
						<tbody>${compRows}</tbody>
					</table>

					<div class="mt-2 mb-2">
						<b>${this.t("Active POS Profiles", "Profils PDV actifs")} (${pf.pos_profiles.length}):</b><br/>
						${posRows || `<span class="text-warning">${this.t("No active POS Profiles found", "Aucun profil PDV actif")}</span>`}
					</div>

					<div class="mt-3 flex flex-wrap gap-3" style="font-size:12px;">
						<span>${pf.pos_next_installed ? "✅ POSNext installed" : "ℹ️ Desk-only mode (POSNext not installed)"}</span>
						<span>${pf.items_missing_expense === 0 ? `✅ ${pf.items_total} items have expense accounts` : `⚠️ <a href="/desk/item" target="_blank">${pf.items_missing_expense} stock items missing default expense account</a>`}</span>
					</div>

					<div class="nf-wiz-footer">
						<span></span>
						<button class="btn btn-primary" id="nf-step1-next">${this.t("Save Mode & Next →", "Enregistrer & Suivant →")}</button>
					</div>
				</div>

				<div class="nf-card">
					<div class="nf-card-title">📖 ${this.t("How Sandbox vs Production Works", "Sandbox vs Production")}</div>
					<div class="nf-card-sub">${this.t("DRC FACT+ maintains a 5-step readiness checklist inside its Settings before Production invoices can flow.", "DRC FACT+ maintient une checklist en 5 étapes avant d'émettre en Production.")}</div>
					${this.renderShot("drcfact_checklist.jpg", this.t("DRC FACT+ Settings → Mise en service fiscale", "DRC FACT+ Paramètres → Mise en service fiscale"))}
					${this.renderShot("drcfact_dashboard.jpg", this.t("DRC FACT+ Dashboard — Active Shop & NIF Header", "Tableau de bord DRC FACT+ — PDV & NIF"))}
				</div>
			</div>
		`;
	}

	renderStep2(session) {
		const s = this.state;
		const edit = this.editingMapping || {
			name: "",
			title: "",
			enabled: 1,
			environment: session.target_environment,
			api_key: "",
			company: (s.preflight.companies[0] || {}).name || "",
			company_nif: "",
			emcf_nid: "",
			receipt_point_name: "",
			receipt_paper: "80mm",
			is_default_for_desk: 0,
			max_parallel_requests: 1,
			pos_profiles: [],
			has_api_key: false,
		};

		const mappingRows = (s.mappings || []).map((m) => `
			<tr>
				<td>
					<a href="/desk/drc-pos-mapping/${encodeURIComponent(m.name)}" target="_blank"><b>${this.esc(m.title)}</b></a>
					<div class="text-muted" style="font-size:11px;">${this.esc(m.receipt_point_name)}</div>
				</td>
				<td><span class="nf-badge ${m.environment === "production" ? "nf-badge-green" : "nf-badge-amber"}">${this.esc(m.environment)}</span> ${m.enabled ? "" : '<span class="nf-badge nf-badge-red">Off</span>'}</td>
				<td style="font-size:12px;"><code>${this.esc(m.company_nif)}</code><br/><code>${this.esc(m.emcf_nid || "-")}</code></td>
				<td style="font-size:11px;">${(m.pos_profiles || []).map((p) => `<span class="nf-badge nf-badge-blue">${this.esc(p)}</span>`).join(" ") || (m.is_default_for_desk ? "Desk Default" : "-")}</td>
				<td><span class="nf-badge ${m.connection_status === "OK" ? "nf-badge-green" : m.connection_status === "Failed" ? "nf-badge-red" : "nf-badge-amber"}">${this.esc(m.connection_status)}</span></td>
				<td style="white-space:nowrap;">
					<button class="btn btn-xs btn-default" data-edit-mapping="${this.esc(m.name)}">${this.t("Edit", "Modifier")}</button>
					<button class="btn btn-xs btn-primary" data-test-mapping="${this.esc(m.name)}">${this.t("Test", "Tester")}</button>
				</td>
			</tr>
		`).join("");

		const companyOpts = (s.preflight.companies || []).map((c) => `<option value="${this.esc(c.name)}" ${edit.company === c.name ? "selected" : ""}>${this.esc(c.name)}</option>`).join("");
		const profileChecks = (s.preflight.pos_profiles || []).map((p) => `
			<label style="font-size:12px; margin:0; display:flex; align-items:center; gap:5px; cursor:pointer;">
				<input type="checkbox" class="nf-map-profile-cb" value="${this.esc(p.name)}" ${(edit.pos_profiles || []).includes(p.name) ? "checked" : ""} />
				<span>${this.esc(p.name)}</span>
			</label>
		`).join("");

		return `
			<div class="nf-wiz-grid">
				<div>
					<div class="nf-card">
						<div class="nf-card-title">2. ${this.t("Gateway URL & Shop Mappings", "URL Passerelle & Points de Vente")}</div>
						<div class="nf-card-sub">${this.t("Connect each branch / e-MCF device. One mapping can serve multiple POS registers in the same shop.", "Connectez chaque boutique / dispositif e-MCF. Un mapping peut couvrir plusieurs caisses d'un même magasin.")}</div>

						<div class="form-group">
							<label>${this.t("DRC FACT+ Gateway Base URL", "URL de base DRC FACT+")}</label>
							<input type="text" class="form-control" id="nf-api-base-url" value="${this.esc(s.settings.api_base_url)}" />
						</div>

						<div class="flex justify-between items-center mt-3 mb-2">
							<h5 style="font-weight:700; margin:0;">${this.t("Configured Shop Mappings", "Mappings PDV configurés")}</h5>
							<button class="btn btn-xs btn-default" id="nf-new-mapping-btn">+ ${this.t("New Mapping", "Nouveau Mapping")}</button>
						</div>
						<table class="table table-bordered table-sm">
							<thead><tr><th>${this.t("Shop", "Boutique")}</th><th>${this.t("Env", "Env")}</th><th>NIF / NID</th><th>${this.t("POS Profiles", "Profils PDV")}</th><th>${this.t("Conn.", "Conn.")}</th><th></th></tr></thead>
							<tbody>${mappingRows || `<tr><td colspan="6" class="text-center text-muted">${this.t("No mappings yet — create one below", "Aucun mapping — créez-en un ci-dessous")}</td></tr>`}</tbody>
						</table>
					</div>

					<div class="nf-card">
						<div class="nf-card-title">${edit.name ? `${this.t("Edit Mapping:", "Modifier :")} ${this.esc(edit.title)}` : this.t("Add / Configure Shop Mapping", "Ajouter / Configurer un Point de Vente")}</div>

						<div class="nf-token-box">
							<div style="font-weight:700; font-size:12px; color:#065f46; margin-bottom:4px;">
								🔑 ${this.t("Optional: Verify & Auto-Fill NIF + NID from DGI e-DEF Token (Recommended)", "Optionnel : Vérifier & Remplir NIF + NID via Jeton DGI e-DEF (Recommandé)")}
							</div>
							<div class="text-muted" style="font-size:11px; margin-bottom:6px;">
								${this.t("Paste your e-DEF JWT (eyJ...) to extract official NIF & NID and prevent typing errors. You can still edit the fields below afterward.", "Collez votre jeton JWT e-DEF (eyJ...) pour extraire le NIF et le NID officiels sans faute de frappe. Les champs restent modifiables.")}
							</div>
							<div class="flex gap-2">
								<input type="text" class="form-control input-sm" id="nf-dgi-jwt-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." />
								<button class="btn btn-sm btn-success" id="nf-decode-jwt-btn">${this.t("Decode Token", "Décoder")}</button>
							</div>
							<div id="nf-jwt-result" style="font-size:11px; margin-top:6px;">${this.tokenVerifiedInfo ? this.esc(this.tokenVerifiedInfo) : ""}</div>
						</div>

						<div class="row">
							<div class="col-sm-6 form-group">
								<label>${this.t("Mapping Title *", "Nom du Mapping *")}</label>
								<input type="text" class="form-control" id="nf-m-title" value="${this.esc(edit.title)}" placeholder="e.g. LA VISION GOMBE (SANDBOX)" ${edit.name ? "readonly" : ""} />
							</div>
							<div class="col-sm-3 form-group">
								<label>${this.t("Environment", "Environnement")}</label>
								<select class="form-control" id="nf-m-env">
									<option value="test" ${edit.environment === "test" ? "selected" : ""}>test (Sandbox)</option>
									<option value="production" ${edit.environment === "production" ? "selected" : ""}>production (Live)</option>
								</select>
							</div>
							<div class="col-sm-3 form-group">
								<label>${this.t("Enabled", "Activé")}</label><br/>
								<label style="font-weight:normal; margin-top:6px;"><input type="checkbox" id="nf-m-enabled" ${edit.enabled ? "checked" : ""} /> ${this.t("Active", "Actif")}</label>
							</div>
						</div>

						<div class="row">
							<div class="col-sm-6 form-group">
								<label>${this.t("DRC FACT+ API Key (dfp_...)", "Clé API DRC FACT+ (dfp_...)")}</label>
								<input type="password" class="form-control" id="nf-m-apikey" placeholder="${edit.has_api_key ? "•••••••• (leave blank to keep current)" : "dfp_..."}" />
							</div>
							<div class="col-sm-6 form-group">
								<label>${this.t("Company", "Société")}</label>
								<select class="form-control" id="nf-m-company">${companyOpts}</select>
							</div>
						</div>

						<div class="row">
							<div class="col-sm-4 form-group">
								<label>${this.t("Taxpayer NIF *", "NIF Contribuable *")}</label>
								<input type="text" class="form-control" id="nf-m-nif" value="${this.esc(edit.company_nif)}" placeholder="A2220182M" />
							</div>
							<div class="col-sm-4 form-group">
								<label>${this.t("e-MCF NID", "NID e-MCF")}</label>
								<input type="text" class="form-control" id="nf-m-nid" value="${this.esc(edit.emcf_nid)}" placeholder="CD01003343-1" />
							</div>
							<div class="col-sm-4 form-group">
								<label>${this.t("Receipt POS Name *", "Nom PDV sur Ticket *")}</label>
								<input type="text" class="form-control" id="nf-m-posname" value="${this.esc(edit.receipt_point_name)}" placeholder="LA VISION GOMBE" />
							</div>
						</div>

						<div class="form-group">
							<label>${this.t("Assign POS Profiles (Terminals) to this Mapping", "Associer les Profils PDV (Caisses) à ce Mapping")}</label>
							<div class="nf-profile-checks">${profileChecks}</div>
						</div>

						<div class="flex justify-between items-center">
							<label style="font-size:12px; margin:0;"><input type="checkbox" id="nf-m-deskdefault" ${edit.is_default_for_desk ? "checked" : ""} /> ${this.t("Default for Desk Sales Invoices (without POS Profile)", "Par défaut pour les factures Desk (sans Profil PDV)")}</label>
							<div class="flex gap-2">
								<button class="btn btn-default" id="nf-save-mapping-btn">${this.t("Save Mapping", "Enregistrer Mapping")}</button>
								<button class="btn btn-success" id="nf-save-test-mapping-btn">✓ ${this.t("Save & Test Connection", "Enregistrer & Tester")}</button>
							</div>
						</div>

						<div class="nf-wiz-footer">
							<button class="btn btn-default" data-goto-step="1">← ${this.t("Back", "Retour")}</button>
							<button class="btn btn-primary" id="nf-step2-next">${this.t("Save URL & Next →", "Continuer →")}</button>
						</div>
					</div>
				</div>

				<div class="nf-card">
					<div class="nf-card-title">📸 ${this.t("Where to Find Keys, NIF & NID", "Où trouver Clés, NIF & NID")}</div>
					<div class="nf-card-sub">${this.t("Note: Your Government e-DEF JWT lives inside DRC FACT+ → Points de vente. ERPNext connects to DRC FACT+ using the dfp_... API Key.", "Note : Le jeton DGI e-DEF est saisi dans DRC FACT+ → Points de vente. ERPNext utilise la clé API dfp_...")}</div>
					${this.renderShot("guide_drcfact_apikey.svg", this.t("DRC FACT+ Control Panel — API Key & Env Guide", "Panneau DRC FACT+ — Clé API & Environnement"))}
					${this.renderShot("guide_edef_token_nid.svg", this.t("e-DEF Portal (edef.dgirdc.cd) — Token, NIF & NID", "Portail e-DEF — Jeton, NIF & NID"))}
					${this.renderShot("drcfact_pos_admin.jpg", this.t("DRC FACT+ Settings → Administration → Points de vente", "DRC FACT+ Paramètres → Points de vente"))}
				</div>
			</div>
		`;
	}

	renderStep3(session) {
		const st = this.state.settings;
		const tgRows = (st.tax_groups || []).map((g) => `
			<tr>
				<td><b>${this.esc(g.code)}</b></td>
				<td>${this.esc(g.description)}</td>
				<td>${this.esc(g.rate)}%</td>
				<td>${g.active ? '<span class="nf-badge nf-badge-green">Active</span>' : '<span class="nf-badge nf-badge-red">Inactive</span>'}</td>
			</tr>
		`).join("");

		return `
			<div class="nf-wiz-grid">
				<div class="nf-card">
					<div class="nf-card-title">3. ${this.t("Tax Groups & Fiscal Defaults", "Groupes de TVA & Paramètres fiscaux")}</div>
					<div class="nf-card-sub">${this.t("Sync authorized DGI tax groups directly from DRC FACT+ and set site-wide defaults.", "Synchronisez les groupes de taxation DGI autorisés depuis DRC FACT+ et définissez les défauts.")}</div>

					<div class="mb-3 flex justify-between items-center" style="background:var(--subtle-fg); padding:10px 12px; border-radius:8px; border:1px solid var(--border-color);">
						<div>
							<b>${this.t("Synced Tax Groups", "Groupes synchronisés")}: ${(st.tax_groups || []).length}</b>
							<div class="text-muted" style="font-size:11px;">${this.t("Last sync", "Dernière synchro")}: ${this.esc(st.last_reference_sync || this.t("Never", "Jamais"))}</div>
						</div>
						<button class="btn btn-sm btn-success" id="nf-sync-tg-btn">🔄 ${this.t("Sync from DRC FACT+", "Synchroniser depuis DRC FACT+")}</button>
					</div>

					${session.target_environment === "test" ? `
						<div class="alert alert-warning" style="font-size:12px;">
							<b>🧪 ${this.t("Sandbox Tip:", "Astuce Sandbox :")}</b>
							${this.t("Group B (16% VAT) auto-normalizes immediately in Sandbox. Group K (Exempt) requires manual validation inside the DRC FACT+ web portal.", "Le Groupe B (TVA 16%) normalise automatiquement en Sandbox. Le Groupe K exige une validation manuelle sur le portail.")}
						</div>
					` : ""}

					<div class="row">
						<div class="col-sm-3 form-group">
							<label>${this.t("Default Tax Group", "Groupe TVA défaut")}</label>
							<input type="text" class="form-control" id="nf-s3-tg" value="${this.esc(st.default_tax_group)}" />
						</div>
						<div class="col-sm-3 form-group">
							<label>${this.t("Price Mode", "Mode prix")}</label>
							<select class="form-control" id="nf-s3-pm">
								<option value="ttc" ${st.default_price_mode === "ttc" ? "selected" : ""}>TTC (Tax Incl.)</option>
								<option value="ht" ${st.default_price_mode === "ht" ? "selected" : ""}>HT (Tax Excl.)</option>
							</select>
						</div>
						<div class="col-sm-3 form-group">
							<label>${this.t("Default Item Type", "Type d'article")}</label>
							<select class="form-control" id="nf-s3-it">
								<option value="BIE" ${st.default_item_type === "BIE" ? "selected" : ""}>BIE (Good)</option>
								<option value="SER" ${st.default_item_type === "SER" ? "selected" : ""}>SER (Service)</option>
								<option value="TAX" ${st.default_item_type === "TAX" ? "selected" : ""}>TAX (Specific)</option>
							</select>
						</div>
						<div class="col-sm-3 form-group">
							<label>${this.t("UI Timeout (sec)", "Délai UI (sec)")}</label>
							<input type="number" class="form-control" id="nf-s3-wait" value="${st.ui_wait_seconds}" />
						</div>
					</div>

					<div style="max-height:240px; overflow:auto; margin-top:8px;">
						<table class="table table-bordered table-sm">
							<thead><tr><th>${this.t("Code", "Code")}</th><th>${this.t("Description", "Description")}</th><th>${this.t("Rate", "Taux")}</th><th>${this.t("Status", "Statut")}</th></tr></thead>
							<tbody>${tgRows || `<tr><td colspan="4" class="text-center text-muted">${this.t("Click Sync above to load DGI tax groups", "Cliquez sur Synchroniser ci-dessus")}</td></tr>`}</tbody>
						</table>
					</div>

					<div class="mt-2" style="font-size:12px;">
						${this.t("Per-item overrides can also be set on", "Des exceptions par article peuvent être définies sur")}
						<a href="/desk/item" target="_blank">Item ↗</a> ${this.t("or", "ou")} <a href="/desk/item-group" target="_blank">Item Group ↗</a>.
					</div>

					<div class="nf-wiz-footer">
						<button class="btn btn-default" data-goto-step="2">← ${this.t("Back", "Retour")}</button>
						<button class="btn btn-primary" id="nf-step3-next">${this.t("Save Defaults & Next →", "Enregistrer & Suivant →")}</button>
					</div>
				</div>

				<div class="nf-card">
					<div class="nf-card-title">📸 ${this.t("DRC FACT+ Tax Groups & Live FX Rate", "Groupes fiscaux & Taux de change")}</div>
					${this.renderShot("drcfact_tax_groups.jpg", this.t("DRC FACT+ Authorized Tax Groups (A–S)", "Groupes de taxation autorisés (A–S)"))}
					${this.renderShot("drcfact_fx_rate.jpg", this.t("Automatic DGI USD→CDF Exchange Rate Sync", "Taux de change automatique DGI USD→CDF"))}
				</div>
			</div>
		`;
	}

	renderStep4() {
		const st = this.state.settings;
		const existing = {};
		for (const r of st.payment_map || []) {
			existing[r.erpnext_mode_of_payment] = r.drc_payment_code;
		}
		const codes = ["ESPECES", "VIREMENT", "CARTEBANCAIRE", "MOBILEMONEY", "CHEQUES", "CREDIT", "AUTRE"];

		const rows = (this.state.preflight.modes_of_payment || []).map((m) => {
			const val = existing[m.name] || m.suggested_drc_code || "ESPECES";
			const opts = codes.map((c) => `<option value="${c}" ${val === c ? "selected" : ""}>${c}</option>`).join("");
			return `
				<tr data-mop="${this.esc(m.name)}">
					<td><a href="/desk/mode-of-payment/${encodeURIComponent(m.name)}" target="_blank"><b>${this.esc(m.name)}</b></a></td>
					<td>${this.esc(m.type)}</td>
					<td><select class="form-control input-sm nf-pm-select">${opts}</select></td>
				</tr>
			`;
		}).join("");

		return `
			<div class="nf-wiz-grid">
				<div class="nf-card">
					<div class="nf-card-title">4. ${this.t("Payment Method Mapping", "Correspondance des modes de paiement")}</div>
					<div class="nf-card-sub">${this.t("Map ERPNext Modes of Payment to official DGI codes. Values below are smartly pre-filled.", "Associez chaque mode de paiement ERPNext aux codes officiels DGI.")}</div>

					<table class="table table-bordered table-sm">
						<thead><tr><th>ERPNext Mode of Payment</th><th>Type</th><th>DGI / DRC FACT+ Code</th></tr></thead>
						<tbody>${rows}</tbody>
					</table>

					<div class="nf-wiz-footer">
						<button class="btn btn-default" data-goto-step="3">← ${this.t("Back", "Retour")}</button>
						<button class="btn btn-primary" id="nf-step4-next">${this.t("Save Payments & Next →", "Enregistrer & Suivant →")}</button>
					</div>
				</div>

				<div class="nf-card">
					<div class="nf-card-title">💡 ${this.t("DGI Payment Codes Reference", "Codes de paiement DGI")}</div>
					<ul style="font-size:13px; padding-left:18px; line-height:1.7;">
						<li><code>ESPECES</code> — ${this.t("Cash payments", "Paiement en espèces")}</li>
						<li><code>MOBILEMONEY</code> — M-Pesa, Airtel Money, Orange Money</li>
						<li><code>CARTEBANCAIRE</code> — ${this.t("Debit / Credit Card (POS terminal)", "Carte bancaire")}</li>
						<li><code>VIREMENT</code> — ${this.t("Bank Wire Transfer", "Virement bancaire")}</li>
						<li><code>CHEQUES</code> — ${this.t("Cheque", "Chèque")}</li>
						<li><code>CREDIT</code> — ${this.t("On credit / unpaid invoice", "À crédit")}</li>
						<li><code>AUTRE</code> — ${this.t("Other methods", "Autre moyen")}</li>
					</ul>
					<a class="btn btn-sm btn-default mt-2" href="/desk/mode-of-payment" target="_blank">${this.t("Manage ERPNext Modes of Payment", "Gérer les modes ERPNext")} ↗</a>
				</div>
			</div>
		`;
	}

	renderStep5(session) {
		const st = this.state.settings;
		const compName = st.receipt_company_name || ((this.state.preflight.companies[0] || {}).name || "FoodTown");
		return `
			<div class="nf-wiz-grid">
				<div class="nf-card">
					<div class="nf-card-title">5. ${this.t("Thermal Receipt Branding (80mm)", "Personnalisation du Ticket (80mm)")}</div>
					<div class="nf-card-sub">${this.t("Customize the legal header & footer printed on your DGI thermal receipts. Watch the live preview update.", "Personnalisez l'en-tête et le pied de ticket thermique DGI avec aperçu en direct.")}</div>

					<div class="row">
						<div class="col-sm-6 form-group">
							<label>${this.t("Receipt Company Legal Name", "Nom légal sur le ticket")}</label>
							<input type="text" class="form-control nf-brand-live" id="nf-s5-comp" value="${this.esc(compName)}" />
						</div>
						<div class="col-sm-3 form-group">
							<label>${this.t("Receipt Language", "Langue du ticket")}</label>
							<select class="form-control nf-brand-live" id="nf-s5-lang">
								<option value="fr" ${st.receipt_language === "fr" ? "selected" : ""}>Français (fr)</option>
								<option value="en" ${st.receipt_language === "en" ? "selected" : ""}>English (en)</option>
							</select>
						</div>
						<div class="col-sm-3 form-group">
							<label>${this.t("ISF Identifier", "Identifiant ISF")}</label>
							<input type="text" class="form-control nf-brand-live" id="nf-s5-isf" value="${this.esc(st.sfe_isf)}" />
						</div>
					</div>

					<div class="row">
						<div class="col-sm-6 form-group">
							<label>${this.t("Tax Regime Label", "Régime fiscal")}</label>
							<input type="text" class="form-control nf-brand-live" id="nf-s5-regime" value="${this.esc(st.tax_regime_label)}" />
						</div>
						<div class="col-sm-6 form-group">
							<label>${this.t("Generated By Text", "Mention 'Généré par'")}</label>
							<input type="text" class="form-control nf-brand-live" id="nf-s5-genby" value="${this.esc(st.generated_by_text)}" />
						</div>
					</div>

					<div class="form-group">
						<label>${this.t("DGI Certification Text", "Texte de certification DGI")}</label>
						<input type="text" class="form-control nf-brand-live" id="nf-s5-cert" value="${this.esc(st.certification_text)}" />
					</div>
					<div class="form-group">
						<label>${this.t("Certified Software Text (Optional)", "Mention logiciel certifié (Optionnel)")}</label>
						<input type="text" class="form-control nf-brand-live" id="nf-s5-soft" value="${this.esc(st.certified_software_text)}" />
					</div>
					<div class="form-group">
						<label>${this.t("Receipt Footer", "Pied de page du ticket")}</label>
						<input type="text" class="form-control nf-brand-live" id="nf-s5-footer" value="${this.esc(st.receipt_footer)}" />
					</div>

					<div class="flex gap-4">
						<label><input type="checkbox" id="nf-s5-fx" ${st.show_fx_on_receipt ? "checked" : ""} /> ${this.t("Show USD/CDF FX Rate", "Afficher taux USD/CDF")}</label>
						<label><input type="checkbox" id="nf-s5-dnprice" ${st.delivery_note_show_prices ? "checked" : ""} /> ${this.t("Show Prices on Delivery Note", "Prix sur Bon de Livraison")}</label>
					</div>

					<div class="nf-wiz-footer">
						<button class="btn btn-default" data-goto-step="4">← ${this.t("Back", "Retour")}</button>
						<button class="btn btn-primary" id="nf-step5-next">${this.t("Save Branding & Next →", "Enregistrer & Suivant →")}</button>
					</div>
				</div>

				<div class="nf-card">
					<div class="nf-card-title text-center">🧾 ${this.t("Live 80mm Receipt Preview", "Aperçu Ticket 80mm")}</div>
					<div id="nf-live-receipt-box">${this.buildReceiptPreviewHtml(session)}</div>
				</div>
			</div>
		`;
	}

	buildReceiptPreviewHtml(session) {
		const st = this.state.settings;
		const m = (this.state.mappings || [])[0] || { company_nif: "A2220182M", emcf_nid: "CD01003343-1", receipt_point_name: "LA VISION GOMBE" };
		const comp = ($("#nf-s5-comp").val() !== undefined ? $("#nf-s5-comp").val() : st.receipt_company_name) || "FoodTown";
		const lang = ($("#nf-s5-lang").val() !== undefined ? $("#nf-s5-lang").val() : st.receipt_language) || "fr";
		const regime = ($("#nf-s5-regime").val() !== undefined ? $("#nf-s5-regime").val() : st.tax_regime_label) || "Régime Normal";
		const isf = ($("#nf-s5-isf").val() !== undefined ? $("#nf-s5-isf").val() : st.sfe_isf) || "MIN-LOG-01";
		const genby = ($("#nf-s5-genby").val() !== undefined ? $("#nf-s5-genby").val() : st.generated_by_text) || "Generated by DRCFACT";
		const cert = ($("#nf-s5-cert").val() !== undefined ? $("#nf-s5-cert").val() : st.certification_text) || "";
		const footer = ($("#nf-s5-footer").val() !== undefined ? $("#nf-s5-footer").val() : st.receipt_footer) || "";
		const isFr = lang === "fr";

		return `
			<div class="nf-receipt-preview">
				<div style="text-align:center; font-weight:700; font-size:14px;">${this.esc(comp)}</div>
				<div style="text-align:center;">${isFr ? "Régime fiscal" : "Tax regime"}: ${this.esc(regime)}</div>
				<div style="text-align:center;">NIF: ${this.esc(m.company_nif)}</div>
				<div style="text-align:center;">${isFr ? "Point de vente" : "Point of sale"}: ${this.esc(m.receipt_point_name)}</div>
				<div class="nf-receipt-sep"></div>
				<div style="font-weight:700;">Ticket : FV/2026/00001</div>
				<div>FV - ${isFr ? "FACTURE DE VENTE" : "SALES INVOICE"}</div>
				<div class="nf-receipt-sep"></div>
				<div class="nf-receipt-row" style="font-weight:700;"><span>Sample Item [B]</span><span>1 000,00 FC</span></div>
				<div>1 x 1 000,00 FC</div>
				<div class="nf-receipt-sep"></div>
				<div class="nf-receipt-row"><span>${isFr ? "Total hors taxe" : "Total excl. tax"}:</span><span>862,07 FC</span></div>
				<div class="nf-receipt-row"><span>${isFr ? "Total TVA" : "Total VAT"}:</span><span>137,93 FC</span></div>
				<div class="nf-receipt-row" style="font-weight:700; font-size:13px; margin-top:4px;"><span>${isFr ? "Total TTC à payer" : "Total payable"}</span><span>1 000,00 FC</span></div>
				<div class="nf-receipt-sep"></div>
				<div style="text-align:center; font-weight:700;">DGI FISCAL SECURITY</div>
				<div style="text-align:center;">CODE DEF : ${session.target_environment === "test" ? "TEST-FACT-URES-XXXX" : "DGI-DEF-CERTIFIED"}</div>
				<div style="text-align:center;">${this.esc(genby)} • NID: ${this.esc(m.emcf_nid || "CD01003343-1")}</div>
				<div style="text-align:center;">ISF: ${this.esc(isf)}</div>
				${cert ? `<div style="text-align:center; font-size:10px; margin-top:2px;">${this.esc(cert)}</div>` : ""}
				<div style="text-align:center; margin:8px 0;">
					<div style="width:74px; height:74px; margin:0 auto; border:2px solid #000; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:10px;">QR 34mm</div>
				</div>
				${footer ? `<div style="text-align:center; font-size:10px;">${this.esc(footer)}</div>` : ""}
				${session.target_environment === "test" ? `<div style="text-align:center; font-weight:700; margin-top:4px;">TEST - NOT A FISCAL DOCUMENT</div>` : ""}
			</div>
		`;
	}

	renderStep6() {
		const s = this.state;
		const profileMappingMap = {};
		for (const m of s.mappings || []) {
			if (!m.enabled) continue;
			for (const p of m.pos_profiles || []) {
				profileMappingMap[p] = profileMappingMap[p] || [];
				profileMappingMap[p].push(`${m.title} (${m.environment})`);
			}
		}

		const coverageRows = (s.preflight.pos_profiles || []).map((p) => {
			const mapped = profileMappingMap[p.name] || [];
			return `
				<tr>
					<td><a href="/desk/pos-profile/${encodeURIComponent(p.name)}" target="_blank"><b>${this.esc(p.name)}</b></a></td>
					<td>${this.esc(p.warehouse || "-")}</td>
					<td>${mapped.length ? `<span class="nf-badge nf-badge-green">✓ ${this.esc(mapped.join(", "))}</span>` : `<span class="nf-badge nf-badge-amber">${this.t("Not directly linked (falls back to Desk Default / Route)", "Non lié directement")}</span>`}</td>
				</tr>
			`;
		}).join("");

		const mappingOpts = (s.mappings || []).map((m) => `<option value="${this.esc(m.name)}">${this.esc(m.title)} (${this.esc(m.environment)})</option>`).join("");
		const profileOpts = `<option value="">(${this.t("Any POS Profile", "Tout Profil PDV")})</option>` + (s.preflight.pos_profiles || []).map((p) => `<option value="${this.esc(p.name)}">${this.esc(p.name)}</option>`).join("");
		const compOpts = (s.preflight.companies || []).map((c) => `<option value="${this.esc(c.name)}">${this.esc(c.name)}</option>`).join("");

		return `
			<div class="nf-wiz-grid">
				<div class="nf-card">
					<div class="nf-card-title">6. ${this.t("Multi-POS Routing & Cashier Access", "Routage Multi-PDV & Accès Caissiers")}</div>
					<div class="nf-card-sub">${this.t("Verify every shop terminal resolves to its branch e-MCF mapping. Add conditional routes only if needed.", "Vérifiez que chaque caisse pointe vers le mapping e-MCF de sa succursale.")}</div>

					<table class="table table-bordered table-sm">
						<thead><tr><th>POS Profile</th><th>Warehouse</th><th>${this.t("Resolved DRC Mapping", "Mapping résolu")}</th></tr></thead>
						<tbody>${coverageRows}</tbody>
					</table>

					<div style="background:var(--subtle-fg); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-top:12px;">
						<div style="font-weight:700; font-size:12px; margin-bottom:8px;">+ ${this.t("Optional: Add Conditional DRC POS Route", "Optionnel : Ajouter une règle de routage")} (${s.routes.length} existing)</div>
						<div class="row">
							<div class="col-sm-3 form-group"><label>Company</label><select class="form-control input-sm" id="nf-r-comp">${compOpts}</select></div>
							<div class="col-sm-3 form-group"><label>POS Profile</label><select class="form-control input-sm" id="nf-r-prof">${profileOpts}</select></div>
							<div class="col-sm-4 form-group"><label>Target Mapping</label><select class="form-control input-sm" id="nf-r-map">${mappingOpts}</select></div>
							<div class="col-sm-2 form-group"><label>Priority</label><input type="number" class="form-control input-sm" id="nf-r-prio" value="10" /></div>
						</div>
						<label style="font-size:12px;"><input type="checkbox" id="nf-r-ask" /> ${this.t("Ask Cashier at Checkout", "Demander au caissier")}</label>
					</div>

					<div class="mt-3 flex gap-2">
						<a class="btn btn-xs btn-default" href="/desk/drc-pos-route" target="_blank">🔀 DRC POS Route ↗</a>
						<a class="btn btn-xs btn-default" href="/desk/user" target="_blank">👥 ${this.t("Assign NextFact Cashier/Admin Roles", "Attribuer rôles NextFact")} ↗</a>
					</div>

					<div class="nf-wiz-footer">
						<button class="btn btn-default" data-goto-step="5">← ${this.t("Back", "Retour")}</button>
						<button class="btn btn-primary" id="nf-step6-next">${this.t("Save Routing & Next →", "Enregistrer & Suivant →")}</button>
					</div>
				</div>

				<div class="nf-card">
					<div class="nf-card-title">🏗️ ${this.t("Multi-Shop Terminal Architecture", "Architecture Multi-Boutiques")}</div>
					${this.renderShot("guide_multi_pos_routing.svg", this.t("2 Branches × 2 Cash Registers sharing e-MCF safely", "2 Succursales × 2 Caisses partageant les e-MCF sans conflit"))}
				</div>
			</div>
		`;
	}

	renderStep7(session) {
		const s = this.state;
		const matchingEnabled = (s.mappings || []).filter((m) => m.enabled && m.environment === session.target_environment);
		const testedOk = matchingEnabled.some((m) => m.connection_status === "OK");
		const hasTestMappingsToDisable = session.target_environment === "production" && (s.mappings || []).some((m) => m.enabled && m.environment === "test");

		const checks = [
			[matchingEnabled.length > 0, `${matchingEnabled.length} ${this.t("enabled mapping(s) for", "mapping(s) actif(s) pour")} ${session.target_environment}`],
			[testedOk, this.t("At least one mapping passed Gateway Connection Test (OK)", "Au moins un test de connexion passerelle réussi (OK)")],
			[(s.settings.tax_groups || []).length > 0, `${(s.settings.tax_groups || []).length} ${this.t("DGI tax groups synced", "groupes de taxation DGI synchronisés")}`],
			[(s.settings.payment_map || []).length > 0, `${(s.settings.payment_map || []).length} ${this.t("payment methods mapped", "modes de paiement mappés")}`],
		];

		const checkHtml = checks.map(([ok, text]) => `
			<div style="padding:8px 10px; border-radius:6px; margin-bottom:6px; background:${ok ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.1)"};">
				${ok ? "✅" : "⚠️"} <b>${this.esc(text)}</b>
			</div>
		`).join("");

		return `
			<div class="nf-wiz-grid">
				<div class="nf-card">
					<div class="nf-card-title">7. ${this.t("Final Review, Activate & Ready!", "Vérification finale & Activation")}</div>
					<div class="nf-card-sub">${this.t("Confirm readiness below and enable DRC FACT+ integration. You can still toggle or edit anything later in DRC Fact Settings.", "Confirmez la liste ci-dessous et activez l'intégration.")}</div>

					${checkHtml}

					<div class="mt-3" style="padding:12px; border:1px solid var(--border-color); border-radius:8px;">
						<label style="font-weight:700; margin:0; display:flex; align-items:center; gap:8px;">
							<input type="checkbox" id="nf-s7-enable" checked />
							<span>${this.t("Enable DRC FACT+ Integration in DRC Fact Settings", "Activer l'intégration DRC FACT+ dans DRC Fact Settings")}</span>
						</label>
						${hasTestMappingsToDisable ? `
							<label style="margin:8px 0 0; display:flex; align-items:center; gap:8px; color:#92400e;">
								<input type="checkbox" id="nf-s7-disable-test" checked />
								<span>${this.t("Automatically disable old Sandbox ('test') mappings so Production never sends test calls", "Désactiver automatiquement les anciens mappings Sandbox ('test')")}</span>
							</label>
						` : ""}
						${session.target_environment === "production" ? `
							<label style="margin:8px 0 0; display:flex; align-items:center; gap:8px; color:#065f46; font-weight:600;">
								<input type="checkbox" id="nf-s7-confirm-prod" />
								<span>${this.t("I confirm Production mode emits legally binding DGI fiscal invoices.", "Je confirme que le mode Production émet des factures fiscales réelles DGI.")}</span>
							</label>
						` : ""}
					</div>

					<div class="nf-wiz-footer">
						<button class="btn btn-default" data-goto-step="6">← ${this.t("Back", "Retour")}</button>
						<button class="btn btn-lg btn-success" id="nf-finish-btn">🚀 ${this.t("Complete Setup & Ready!", "Terminer & Activer !")}</button>
					</div>
				</div>

				<div class="nf-card">
					<div class="nf-card-title">🔗 ${this.t("Direct Verification Links", "Liens de vérification directe")}</div>
					<div class="nf-card-sub">${this.t("Test a live checkout or inspect your saved documents immediately after completing:", "Testez une vente PDV ou inspectez les documents enregistrés :")}</div>
					<div class="flex flex-col gap-2">
						<a class="btn btn-default btn-sm" href="/pos/" target="_blank">🛒 ${this.t("Open POSNext Register (/pos/)", "Ouvrir la caisse POSNext (/pos/)")} ↗</a>
						<a class="btn btn-default btn-sm" href="/desk/drc-fact-settings" target="_blank">⚙ DRC Fact Settings ↗</a>
						<a class="btn btn-default btn-sm" href="/desk/drc-pos-mapping" target="_blank">📍 DRC POS Mapping ↗</a>
						<a class="btn btn-default btn-sm" href="/desk/sales-invoice" target="_blank">🧾 Sales Invoice List ↗</a>
						<a class="btn btn-default btn-sm" href="/desk/drc-setup-session/${encodeURIComponent(session.name)}" target="_blank">📜 ${this.t("Session Audit Record", "Document d'audit")} (${this.esc(session.name)}) ↗</a>
					</div>
				</div>
			</div>
		`;
	}

	bindCommonEvents(session) {
		this.$root.find("[data-zoom-img]").on("click", (e) => {
			const el = $(e.currentTarget);
			this.openLightbox(el.data("zoom-img"), el.data("zoom-cap"));
		});
		this.$root.find("#nf-btn-start-sandbox").on("click", () => this.ensureSession("test", 1));
		this.$root.find("#nf-btn-start-prod, #nf-btn-promote-prod").on("click", () => this.ensureSession("production", 1));
		this.$root.find("#nf-btn-audit").on("click", () => this.showAuditModal(session));
		this.$root.find("#nf-btn-reset").on("click", () => this.promptReset(session));
		this.$root.find("[data-goto-step]").on("click", (e) => {
			this.step = Number($(e.currentTarget).data("goto-step"));
			this.render();
		});
	}

	bindStepEvents(session) {
		// Step 1
		this.$root.find("[data-select-env]").on("click", async (e) => {
			const env = $(e.currentTarget).data("select-env");
			session.target_environment = env;
			this.render();
		});
		this.$root.find("#nf-step1-next").on("click", async () => {
			const res = await this.callApi("save_step", {
				session_name: session.name,
				step_no: 1,
				data: { target_environment: session.target_environment },
			});
			this.state.active_session = res.session;
			this.step = 2;
			this.render();
		});

		// Step 2
		this.$root.find("#nf-new-mapping-btn").on("click", () => {
			this.editingMapping = null;
			this.tokenVerifiedInfo = null;
			this.render();
		});
		this.$root.find("[data-edit-mapping]").on("click", (e) => {
			const name = $(e.currentTarget).data("edit-mapping");
			this.editingMapping = (this.state.mappings || []).find((m) => m.name === name) || null;
			this.tokenVerifiedInfo = null;
			this.render();
		});
		this.$root.find("[data-test-mapping]").on("click", async (e) => {
			const name = $(e.currentTarget).data("test-mapping");
			await this.runMappingTest(session, name);
		});
		this.$root.find("#nf-decode-jwt-btn").on("click", async () => {
			const tok = $("#nf-dgi-jwt-input").val();
			const res = await this.callApi("decode_dgi_token", { token: tok, session_name: session.name });
			if (res.company_nif) $("#nf-m-nif").val(res.company_nif);
			if (res.emcf_nid) $("#nf-m-nid").val(res.emcf_nid);
			const info = `✓ Verified from token (${res.issuer || "DGI"}): NIF=${res.company_nif || "-"}, NID=${res.emcf_nid || "-"}, expires=${res.expires_on || "-"} (editable above)`;
			this.tokenVerifiedInfo = info;
			$("#nf-jwt-result").html(`<span class="text-success font-weight-bold">${this.esc(info)}</span>`);
		});

		const collectAndSaveMapping = async (andTest) => {
			const profiles = [];
			this.$root.find(".nf-map-profile-cb:checked").each((_, cb) => profiles.push($(cb).val()));
			const payload = {
				name: (this.editingMapping && this.editingMapping.name) || "",
				title: $("#nf-m-title").val(),
				environment: $("#nf-m-env").val(),
				enabled: $("#nf-m-enabled").is(":checked") ? 1 : 0,
				api_key: $("#nf-m-apikey").val(),
				company: $("#nf-m-company").val(),
				company_nif: $("#nf-m-nif").val(),
				emcf_nid: $("#nf-m-nid").val(),
				receipt_point_name: $("#nf-m-posname").val(),
				is_default_for_desk: $("#nf-m-deskdefault").is(":checked") ? 1 : 0,
				pos_profiles: profiles,
			};
			const res = await this.callApi("save_mapping", { session_name: session.name, data: payload });
			this.state.mappings = res.mappings;
			this.editingMapping = res.mapping;
			frappe.show_alert({ message: this.t("Mapping saved", "Mapping enregistré"), indicator: "green" });
			if (andTest && res.mapping) {
				await this.runMappingTest(session, res.mapping.name);
			} else {
				this.state = await this.callApi("get_state");
				this.render();
			}
		};
		this.$root.find("#nf-save-mapping-btn").on("click", () => collectAndSaveMapping(false));
		this.$root.find("#nf-save-test-mapping-btn").on("click", () => collectAndSaveMapping(true));

		this.$root.find("#nf-step2-next").on("click", async () => {
			const res = await this.callApi("save_step", {
				session_name: session.name,
				step_no: 2,
				data: { api_base_url: $("#nf-api-base-url").val() },
			});
			this.state.active_session = res.session;
			this.state.settings = res.settings;
			this.step = 3;
			this.render();
		});

		// Step 3
		this.$root.find("#nf-sync-tg-btn").on("click", async () => {
			const enabledMap = (this.state.mappings || []).find((m) => m.enabled);
			const res = await this.callApi("sync_tax_groups", {
				session_name: session.name,
				mapping_name: enabledMap ? enabledMap.name : null,
			});
			this.state.settings = res.settings;
			frappe.show_alert({ message: `${this.t("Synced", "Synchronisé")}: ${res.synced_count} tax groups`, indicator: "green" });
			this.render();
		});
		this.$root.find("#nf-step3-next").on("click", async () => {
			const res = await this.callApi("save_step", {
				session_name: session.name,
				step_no: 3,
				data: {
					default_tax_group: $("#nf-s3-tg").val(),
					default_price_mode: $("#nf-s3-pm").val(),
					default_item_type: $("#nf-s3-it").val(),
					ui_wait_seconds: $("#nf-s3-wait").val(),
				},
			});
			this.state.active_session = res.session;
			this.state.settings = res.settings;
			this.step = 4;
			this.render();
		});

		// Step 4
		this.$root.find("#nf-step4-next").on("click", async () => {
			const pmRows = [];
			this.$root.find("tr[data-mop]").each((_, tr) => {
				pmRows.push({
					erpnext_mode_of_payment: $(tr).data("mop"),
					drc_payment_code: $(tr).find(".nf-pm-select").val(),
				});
			});
			const res = await this.callApi("save_step", {
				session_name: session.name,
				step_no: 4,
				data: { payment_map: pmRows },
			});
			this.state.active_session = res.session;
			this.state.settings = res.settings;
			this.step = 5;
			this.render();
		});

		// Step 5
		this.$root.find(".nf-brand-live").on("input change", () => {
			$("#nf-live-receipt-box").html(this.buildReceiptPreviewHtml(session));
		});
		this.$root.find("#nf-step5-next").on("click", async () => {
			const res = await this.callApi("save_step", {
				session_name: session.name,
				step_no: 5,
				data: {
					receipt_company_name: $("#nf-s5-comp").val(),
					receipt_language: $("#nf-s5-lang").val(),
					sfe_isf: $("#nf-s5-isf").val(),
					tax_regime_label: $("#nf-s5-regime").val(),
					generated_by_text: $("#nf-s5-genby").val(),
					certification_text: $("#nf-s5-cert").val(),
					certified_software_text: $("#nf-s5-soft").val(),
					receipt_footer: $("#nf-s5-footer").val(),
					show_fx_on_receipt: $("#nf-s5-fx").is(":checked") ? 1 : 0,
					delivery_note_show_prices: $("#nf-s5-dnprice").is(":checked") ? 1 : 0,
				},
			});
			this.state.active_session = res.session;
			this.state.settings = res.settings;
			this.step = 6;
			this.render();
		});

		// Step 6
		this.$root.find("#nf-step6-next").on("click", async () => {
			const prof = $("#nf-r-prof").val();
			const map = $("#nf-r-map").val();
			const newRoute = (prof && map) ? {
				company: $("#nf-r-comp").val(),
				pos_profile: prof,
				target_mapping: map,
				priority: $("#nf-r-prio").val(),
				ask_cashier: $("#nf-r-ask").is(":checked") ? 1 : 0,
			} : null;
			const res = await this.callApi("save_step", {
				session_name: session.name,
				step_no: 6,
				data: { new_route: newRoute },
			});
			this.state.active_session = res.session;
			this.state.routes = res.routes;
			this.step = 7;
			this.render();
		});

		// Step 7
		this.$root.find("#nf-finish-btn").on("click", async () => {
			if (session.target_environment === "production" && !$("#nf-s7-confirm-prod").is(":checked")) {
				frappe.msgprint(this.t("Please check the Production confirmation box first.", "Veuillez cocher la confirmation Production."));
				return;
			}
			await this.callApi("complete_session", {
				session_name: session.name,
				enable_integration: $("#nf-s7-enable").is(":checked") ? 1 : 0,
				disable_sandbox_mappings: $("#nf-s7-disable-test").is(":checked") ? 1 : 0,
			});
			frappe.show_alert({ message: this.t("NextFact Setup Complete & Active!", "Configuration NextFact terminée et activée !"), indicator: "green" });
			await this.refresh();
		});
	}

	async runMappingTest(session, mappingName) {
		const res = await this.callApi("verify_mapping", {
			mapping_name: mappingName,
			session_name: session.name,
		});
		if (res.connected) {
			frappe.show_alert({
				message: `${this.esc(mappingName)}: Connection OK (${res.tax_groups_count} tax groups)`,
				indicator: "green",
			});
		} else {
			frappe.msgprint({
				title: `${mappingName} — Connection Failed`,
				message: this.esc(res.error || "Gateway rejected connection"),
				indicator: "red",
			});
		}
		this.state = await this.callApi("get_state");
		this.render();
	}
}
