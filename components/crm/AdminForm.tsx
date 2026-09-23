"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm, ROLES, ROLE_DESC, type Admin } from "./CrmContext";
import { apiCall } from "../../lib/crmApi";
import MemberCombobox from "./MemberCombobox";

export type AdminFormHandle = { save: () => void };

const AdminForm = forwardRef<AdminFormHandle, { admin: Admin | null; onDone: () => void; onSetupLinkChange?: (shown: boolean) => void }>(
  function AdminForm({ admin, onDone, onSetupLinkChange }, ref) {
    const { members, setAdmins, toast, backendLive } = useCrm();
    const isNew = !admin;
    // New admins default to picking an existing member — the common case is
    // promoting a known user, and it keeps the admin row's identity tied to
    // an account someone can actually recognize instead of a freehand
    // name/email that might typo or drift from the real member record.
    const [source, setSource] = useState<"member" | "manual">("member");
    const [memberId, setMemberId] = useState(0);
    const [name, setName] = useState(admin?.name ?? "");
    const [email, setEmail] = useState(admin?.email ?? "");
    const [role, setRole] = useState(admin?.role ?? "Support");
    const [setupLink, setSetupLink] = useState<{ url: string; emailSent: boolean } | null>(null);
    const [copied, setCopied] = useState(false);

    const selectedMember = members.find((m) => m.id === memberId) ?? null;

    useImperativeHandle(ref, () => ({
      save() {
        // Once the setup link is showing, the create step is already done —
        // the drawer's own footer button is hidden then (see
        // onSetupLinkChange below), but guard here too in case it's ever
        // reachable another way.
        if (setupLink) return;
        void saveAsync();
      },
    }));

    async function saveAsync() {
      if (isNew && source === "member") {
        if (!memberId) {
          toast("Pick a member first");
          return;
        }
      } else {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        if (!trimmedName || !trimmedEmail) {
          toast("Name and email are required");
          return;
        }
      }
      const data =
        isNew && source === "member"
          ? { memberId, role }
          : { name: name.trim(), email: email.trim(), role };

      if (!backendLive) {
        if (isNew) {
          const fallbackName = source === "member" ? selectedMember?.name ?? name : name;
          const fallbackEmail = source === "member" ? selectedMember?.email ?? email : email;
          setAdmins((cur) => [...cur, { id: Math.max(0, ...cur.map((a) => a.id)) + 1, name: fallbackName, email: fallbackEmail, role }]);
          toast("Admin added");
        } else {
          setAdmins((cur) => cur.map((a) => (a.id === admin!.id ? { ...a, name, email, role } : a)));
          toast("Admin updated");
        }
        onDone();
        return;
      }
      try {
        if (isNew) {
          const payload = await apiCall<{ admin: Admin; setupLink: string; emailSent: boolean }>("/api/crm/admins/", "POST", data);
          setAdmins((cur) => [...cur, payload.admin]);
          setSetupLink({ url: payload.setupLink, emailSent: payload.emailSent });
          onSetupLinkChange?.(true);
          toast(payload.emailSent ? "Admin added — setup email sent" : "Admin added — copy the setup link below");
          // Stay open so the setup link (and its copy button) is visible —
          // the drawer's own "Done" close happens on onDone(), skipped here.
          return;
        }
        const payload = await apiCall<{ admin: Admin }>(`/api/crm/admins/${admin!.id}/`, "PUT", data);
        setAdmins((cur) => cur.map((a) => (a.id === admin!.id ? payload.admin : a)));
        toast("Admin updated");
        onDone();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to save admin");
      }
    }

    async function copyLink() {
      if (!setupLink) return;
      try {
        await navigator.clipboard.writeText(setupLink.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast("Couldn't copy — select and copy the link manually");
      }
    }

    if (setupLink) {
      return (
        <div className="admin-setup-link">
          <p className="admin-setup-link-title">Admin added</p>
          <p className="perm-note">
            {setupLink.emailSent
              ? "A setup email was sent so they can set their password. You can also share this link directly:"
              : "Email isn't configured, so no email was sent — share this link with them so they can set their password:"}
          </p>
          <div className="admin-setup-link-row">
            <input className="input" readOnly value={setupLink.url} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-ghost" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => {
              onSetupLinkChange?.(false);
              onDone();
            }}
          >
            Done
          </button>
        </div>
      );
    }

    return (
      <>
        {isNew && (
          <div className="field">
            <label>Admin source</label>
            <div className="tabs">
              <button type="button" className={`tab${source === "member" ? " is-active" : ""}`} onClick={() => setSource("member")}>
                Existing member
              </button>
              <button type="button" className={`tab${source === "manual" ? " is-active" : ""}`} onClick={() => setSource("manual")}>
                New (manual)
              </button>
            </div>
          </div>
        )}

        {isNew && source === "member" ? (
          <div className="field">
            <label>Member</label>
            <MemberCombobox members={members} value={memberId} onChange={setMemberId} placeholder="Search name, code or email…" ariaLabel="Member" />
            {selectedMember && !selectedMember.email && (
              <p className="perm-note" style={{ color: "var(--red)" }}>This member has no email on file — pick another, or switch to manual.</p>
            )}
          </div>
        ) : (
          <>
            <div className="field">
              <label>Full name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Doe" />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@besight.com" />
            </div>
          </>
        )}

        <div className="field">
          <label>Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <p className="perm-note">{ROLE_DESC[role] ?? ""}</p>
      </>
    );
  }
);

export default AdminForm;
