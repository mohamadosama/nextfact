import frappe
from frappe import _
from nextfact.api.v1.errors import ProblemError

def _profile_mappings(si):
    if not si.get("pos_profile"):
        return []
    names = frappe.db.get_all(
        "DRC POS Mapping Profile",
        filters={"pos_profile": si.pos_profile, "parenttype": "DRC POS Mapping"},
        pluck="parent"
    )
    if not names:
        return []
    return frappe.db.get_all("DRC POS Mapping", filters={"name": ["in", names], "enabled": 1}, pluck="name")

def _matching_routes(si):
    routes = frappe.get_all("DRC POS Route", filters={"enabled": 1, "company": si.company}, order_by="priority asc")
    matched = []
    first_item_warehouse = (si.items[0].warehouse if getattr(si, "items", None) else None)
    si_warehouse = getattr(si, "set_warehouse", None) or first_item_warehouse

    for r_meta in routes:
        r = frappe.get_doc("DRC POS Route", r_meta.name)
        if r.pos_profile and r.pos_profile != getattr(si, "pos_profile", None):
            continue
        if r.warehouse and r.warehouse != si_warehouse:
            continue
        if r.cost_center and r.cost_center != getattr(si, "cost_center", None):
            continue
        if r.owner_user and r.owner_user != getattr(si, "owner", None):
            continue
        if r.customer_group and r.customer_group != getattr(si, "customer_group", None):
            continue
        matched.append(r)
    return matched

def _allowed_names(route):
    allowed = [route.target_mapping] if route.target_mapping else []
    for c in (route.choices or []):
        if c.mapping and c.mapping not in allowed:
            allowed.append(c.mapping)
    return allowed

def resolve_mapping(si, explicit=None):
    """Resolution algorithm (V4-3.3):
    Return (mapping_doc, needs_choice_list|None).
    """
    routes = _matching_routes(si)

    if explicit:
        allowed = _allowed_names(routes[0]) if routes else _profile_mappings(si)
        if explicit not in allowed and allowed:
            raise ProblemError("mapping-not-allowed", 422, f"Mapping {explicit} is not allowed for this route.")
        if not frappe.db.exists("DRC POS Mapping", explicit):
            raise ProblemError("mapping-missing", 422, f"Mapping {explicit} does not exist.")
        m = frappe.get_doc("DRC POS Mapping", explicit)
        if not m.enabled:
            raise ProblemError("mapping-not-allowed", 422, f"Mapping {explicit} is disabled.")
        return m, None

    if routes:
        r = routes[0]
        if r.ask_cashier:
            choice_names = _allowed_names(r)
            choices_data = []
            for m_name in choice_names:
                m_doc = frappe.get_doc("DRC POS Mapping", m_name)
                if m_doc.enabled:
                    choices_data.append({
                        "mapping": m_doc.name,
                        "title": m_doc.title,
                        "emcf_nid": m_doc.emcf_nid,
                        "receipt_point_name": m_doc.receipt_point_name
                    })
            return None, choices_data
        if r.target_mapping:
            m = frappe.get_doc("DRC POS Mapping", r.target_mapping)
            if m.enabled:
                return m, None

    by_profile = _profile_mappings(si)
    if len(by_profile) == 1:
        return frappe.get_doc("DRC POS Mapping", by_profile[0]), None

    defaults = frappe.get_all("DRC POS Mapping", filters={"enabled": 1, "is_default_for_desk": 1, "company": si.company})
    if len(defaults) == 1:
        return frappe.get_doc("DRC POS Mapping", defaults[0].name), None

    enabled_all = frappe.get_all("DRC POS Mapping", filters={"enabled": 1, "company": si.company})
    if len(enabled_all) == 1:
        return frappe.get_doc("DRC POS Mapping", enabled_all[0].name), None

    raise ProblemError(
        "mapping-missing", 422,
        _("No enabled DRC FACT+ point of sale mapping found for invoice {0}.").format(si.name)
    )
