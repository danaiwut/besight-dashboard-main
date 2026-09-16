"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm, ROLES, ROLE_DESC, type Admin } from "./CrmContext";
import { apiCall } from "../../lib/crmApi";

export type AdminFormHandle = { save: () => void };

const AdminForm = forwardRef<AdminFormHandle, { admin: Admin | null; onDone: () => void }>(
  function AdminForm({ admin, onDone }, ref) {
    const { setAdmins, toast, backendLive } = useCrm();
    const isNew = !admin;
    const [name, setName] = useState(admin?.name ?? "");
    const [email, setEmail] = useState(admin?.email ?? "");
    const [role, setRole] = useState(admin?.role ?? "Support");

    useImperativeHandle(ref, () => ({
      save() {
        void saveAsync();
      },
    }));

    async function saveAsync() {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      if (!trimmedName || !trimmedEmail) {
        toast("Name and email are required");
        return;
      }
      const data = { name: trimmedName, email: trimmedEmail, role };
      if (!backendLive) {
        if (isNew) {
          setAdmins((cur) => [...cur, { id: Math.max(0, ...cur.map((a) => a.id)) + 1, ...data }]);
          toast("Admin added");
        } else {
          setAdmins((cur) => cur.map((a) => (a.id === admin!.id ? { ...a, ...data } : a)));
          toast("Admin updated");
        }
        onDone();
        return;
      }
      try {
        if (isNew) {
          const payload = await apiCall<{ admin: Admin }>("/api/crm/admins/", "POST", data);
          setAdmins((cur) => [...cur, payload.admin]);
          toast("Admin added");
        } else {
          const payload = await apiCall<{ admin: Admin }>(`/api/crm/admins/${admin!.id}/`, "PUT", data);
          setAdmins((cur) => cur.map((a) => (a.id === admin!.id ? payload.admin : a)));
          toast("Admin updated");
        }
        onDone();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to save admin");
      }
    }

    return (
      <>
        <div className="field">
          <label>Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Doe" />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@besight.com" />
        </div>
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
