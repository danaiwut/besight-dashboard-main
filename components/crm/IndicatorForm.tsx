"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm, type Indicator } from "./CrmContext";
import { apiCall } from "../../lib/crmApi";

export type IndicatorFormHandle = { save: () => void };

const IndicatorForm = forwardRef<IndicatorFormHandle, { indicator: Indicator | null; onDone: () => void }>(
  function IndicatorForm({ indicator, onDone }, ref) {
    const { setIndicators, toast, backendLive } = useCrm();
    const isNew = !indicator;
    const [name, setName] = useState(indicator?.name ?? "");
    const [pubId, setPubId] = useState(indicator?.pubId ?? "");
    const [status, setStatus] = useState<Indicator["status"]>(indicator?.status ?? "active");
    const [eaFile, setEaFile] = useState(indicator?.eaFile ?? "");

    useImperativeHandle(ref, () => ({
      save() {
        void saveAsync();
      },
    }));

    async function saveAsync() {
      const trimmedName = name.trim();
      if (!trimmedName) {
        toast("Indicator name is required");
        return;
      }
      const trimmedPubId = pubId.trim();
      const trimmedEa = eaFile.trim();
      if (trimmedEa && !/^https?:\/\/\S+$/i.test(trimmedEa)) {
        toast("EA download link must start with https://");
        return;
      }
      const data = { name: trimmedName, pubId: trimmedPubId, status, eaFile: trimmedEa || undefined, hasEa: Boolean(trimmedEa) };
      if (!backendLive) {
        if (isNew) {
          setIndicators((cur) => [...cur, { id: Math.max(0, ...cur.map((i) => i.id)) + 1, ...data }]);
          toast("Indicator added");
        } else {
          setIndicators((cur) => cur.map((i) => (i.id === indicator!.id ? { ...i, ...data } : i)));
          toast("Indicator updated");
        }
        onDone();
        return;
      }
      try {
        if (isNew) {
          const payload = await apiCall<{ indicator: Indicator }>("/api/crm/indicators/", "POST", { ...data, eaFileUrl: trimmedEa });
          setIndicators((cur) => [...cur, payload.indicator]);
          toast("Indicator added");
        } else {
          const payload = await apiCall<{ indicator: Indicator }>(`/api/crm/indicators/${indicator!.id}/`, "PUT", { ...data, eaFileUrl: trimmedEa });
          setIndicators((cur) => cur.map((i) => (i.id === indicator!.id ? payload.indicator : i)));
          toast("Indicator updated");
        }
        onDone();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to save indicator");
      }
    }

    return (
      <>
        <div className="field">
          <label>Indicator name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BeSight ONE" />
        </div>
        <div className="field">
          <label>Pub ID</label>
          <input className="input" value={pubId} onChange={(e) => setPubId(e.target.value)} placeholder="e.g. smart-entry-zones" />
        </div>
        <div className="field">
          <label>EA download link (Google Drive)</label>
          <input
            className="input"
            type="url"
            inputMode="url"
            value={eaFile}
            onChange={(e) => setEaFile(e.target.value)}
            placeholder="https://drive.google.com/file/d/…/view"
          />
          <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 6 }}>
            Shown as a Download EA button to members with active access, after they accept the EA policy. Set the Drive file to &quot;Anyone with the link&quot;. Leave empty to hide.
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Indicator["status"])}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </>
    );
  }
);

export default IndicatorForm;
