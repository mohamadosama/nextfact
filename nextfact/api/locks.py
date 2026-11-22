from contextlib import contextmanager
import frappe

@contextmanager
def emcf_lock(mapping_name, timeout=25):
    """Advisory lock per DRC POS Mapping (per e-MCF NID) using MariaDB GET_LOCK."""
    key = f"nextfact:{frappe.local.site}:{mapping_name}"[:60]
    got = frappe.db.sql("SELECT GET_LOCK(%s, %s)", (key, timeout))[0][0]
    if got != 1:
        from nextfact.api.v1.errors import ProblemError
        raise ProblemError(
            "emcf-busy", 409,
            "Another terminal is reporting on this e-MCF device, please wait.",
            retryable=True
        )
    try:
        yield
    finally:
        frappe.db.sql("SELECT RELEASE_LOCK(%s)", (key,))
