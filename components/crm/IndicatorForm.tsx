"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm, type Indicator } from "./CrmContext";

export type IndicatorFormHandle = { save: () => void };

const IndicatorForm = forwardRef<IndicatorFormHandle, { indicator: Indicator | null; onDone: () => void }>(
  function IndicatorForm({ indicator, onDone }, ref) {
    const { setIndicators, toast } = useCrm();
    const isNew = !indicator;
    const [name, setName] = useState(indicator?.name ?? "");
    const [pubId, setPubId] = useState(indicator?.pubId ?? "");
    const [status, setStatus] = useState<Indicator["status"]>(indicator?.status ?? "active");

    useImperativeHandle(ref, () => ({
      save() {
        const trimmedName = name.trim();
        if (!trimmedName) {
          toast("Indicator name is required");
          return;
        }
        const trimmedPubId = pubId.trim();
        if (isNew) {
          setIndicators((cur) => [...cur, { id: Math.max(0, ...cur.map((i) => i.id)) + 1, name: trimmedName, pubId: trimmedPubId, status }]);
          toast("Indicator added");
        } else {
          setIndicators((cur) => cur.map((i) => (i.id === indicator!.id ? { ...i, name: trimmedName, pubId: trimmedPubId, status } : i)));
          toast("Indicator updated");
        }
        onDone();
      },
    }));

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
