import frappe
from frappe import _
from frappe.utils import now_datetime
from nextfact.api.v1.errors import api_endpoint, ProblemError
from nextfact.api.gateway import DRCFactGateway

@frappe.whitelist()
@api_endpoint
def test_connection(mapping_name):
    """POST settings.test_connection: health and reference check on mapping."""
    frappe.only_for(["NextFact Admin", "System Manager"])
    if not frappe.db.exists("DRC POS Mapping", mapping_name):
        raise ProblemError("mapping-missing", 404, _("Mapping {0} not found").format(mapping_name))

    m = frappe.get_doc("DRC POS Mapping", mapping_name)
    gw = DRCFactGateway(m)

    try:
        h = gw.health()
        r = gw.reference()
    except Exception as e:
        m.connection_status = "Failed"
        m.last_connection_test = now_datetime()
        m.save(ignore_permissions=True)
        frappe.db.commit()
        raise ProblemError("gateway-forbidden", 403, f"Connection failed: {str(e)}")

    m.connection_status = "OK"
    m.last_connection_test = now_datetime()
    m.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "status": "OK",
        "health": h,
        "tax_groups_count": len(r.get("tax_groups", []))
    }

@frappe.whitelist()
@api_endpoint
def sync_reference(mapping_name=None):
    """POST settings.sync_reference: sync tax groups from gateway."""
    frappe.only_for(["NextFact Admin", "System Manager"])
    if mapping_name:
        m = frappe.get_doc("DRC POS Mapping", mapping_name)
    else:
        m = frappe.get_all("DRC POS Mapping", filters={"enabled": 1}, limit=1)
        if not m:
            raise ProblemError("mapping-missing", 422, "No enabled mapping found to sync reference data.")
        m = frappe.get_doc("DRC POS Mapping", m[0].name)

    gw = DRCFactGateway(m)
    ref = gw.reference()
    tax_groups = ref.get("tax_groups", [])

    st = frappe.get_single("DRC Fact Settings")
    existing = {row.code: row for row in st.tax_groups}

    for tg in tax_groups:
        code = tg.get("code")
        rate = tg.get("rate", 0)
        desc = tg.get("description", "")
        if code in existing:
            existing[code].rate = rate
            existing[code].description = desc
            existing[code].active = 1
        else:
            st.append("tax_groups", {
                "code": code,
                "rate": rate,
                "description": desc,
                "active": 1,
                "manual": 0
            })

    st.last_reference_sync = now_datetime()
    st.save(ignore_permissions=True)
    frappe.db.commit()

    return {"synced_count": len(tax_groups)}
