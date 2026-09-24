"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCrm } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { apiCall } from "../../../lib/crmApi";
import Icon from "../../../components/Icon";
import { AVATAR_OPTION_MAX_CHARS, AVATAR_OPTION_PX, type AvatarOptionDto } from "../../../lib/leaderboardProfile";

/** Fits the image into a transparent AVATAR_OPTION_PX square (keeps its
 *  aspect ratio and transparency) and returns a WebP data URL. */
function toAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(AVATAR_OPTION_PX / img.naturalWidth, AVATAR_OPTION_PX / img.naturalHeight);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OPTION_PX;
      canvas.height = AVATAR_OPTION_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, (AVATAR_OPTION_PX - w) / 2, (AVATAR_OPTION_PX - h) / 2, w, h);
      URL.revokeObjectURL(url);
      const webp = canvas.toDataURL("image/webp", 0.9);
      // Safari without WebP encoding falls back to PNG.
      resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

/** Avatar catalog members pick from in Settings → Leaderboard profile. */
export default function CrmLeaderboardAvatarsPage() {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const [options, setOptions] = useState<AvatarOptionDto[] | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ options: AvatarOptionDto[] }>("/api/crm/leaderboard-avatars/", "GET");
      setOptions(payload.options);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load avatars");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
  }, [load]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setUploading(files.length);
    let added = 0;
    for (const file of files) {
      try {
        if (!file.type.startsWith("image/")) throw new Error(t("lba.invalidImage"));
        const imageData = await toAvatarDataUrl(file);
        if (imageData.length > AVATAR_OPTION_MAX_CHARS) throw new Error(t("lba.tooLarge"));
        const label = file.name.replace(/\.[^.]+$/, "").slice(0, 96);
        const payload = await apiCall<{ option: AvatarOptionDto }>("/api/crm/leaderboard-avatars/", "POST", { label, imageData });
        setOptions((cur) => [...(cur ?? []), payload.option]);
        added += 1;
      } catch (err) {
        toast(`${file.name}: ${err instanceof Error ? err.message : t("lba.uploadFailed")}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added) toast(t("lba.added", { n: added }));
  }

  async function patch(option: AvatarOptionDto, data: Partial<Pick<AvatarOptionDto, "label" | "active">>) {
    setBusyId(option.id);
    try {
      const payload = await apiCall<{ option: AvatarOptionDto }>(`/api/crm/leaderboard-avatars/${option.id}/`, "PATCH", data);
      setOptions((cur) => (cur ?? []).map((o) => (o.id === option.id ? payload.option : o)));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("lba.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(option: AvatarOptionDto) {
    if (!window.confirm(t("lba.deleteConfirm", { label: option.label }))) return;
    setBusyId(option.id);
    try {
      await apiCall(`/api/crm/leaderboard-avatars/${option.id}/`, "DELETE");
      setOptions((cur) => (cur ?? []).filter((o) => o.id !== option.id));
      toast(t("lba.deleted"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("lba.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = options?.filter((o) => o.active).length ?? 0;

  return (
    <section className="panel is-active">
      <div className="card" style={{ padding: 22 }}>
        <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h3>{t("lba.title")}</h3>
            <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
              {t("lba.desc")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {options && <span className="status-pill published">{t("lba.count", { active: activeCount, total: options.length })}</span>}
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
              <Icon name="add_photo_alternate" />
              {uploading > 0 ? t("lba.uploading", { n: uploading }) : t("lba.add")}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void onFiles(e)} />
          </div>
        </div>

        {error ? (
          <div style={{ color: "var(--red)", fontSize: 13, marginTop: 14 }}>{error}</div>
        ) : options === null ? (
          <div className="lba-grid" aria-busy="true">
            {Array.from({ length: 16 }, (_, i) => <span key={i} className="skeleton" style={{ height: 150, borderRadius: 12 }} />)}
          </div>
        ) : options.length === 0 ? (
          <div className="table-empty" style={{ marginTop: 14 }}>{t("lba.empty")}</div>
        ) : (
          <div className="lba-grid">
            {options.map((option) => (
              <div className={`lba-item${option.active ? "" : " is-hidden"}`} key={option.id}>
                <div className="lba-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element -- small avatar served by our API / public dir */}
                  <img src={option.url} alt={option.label} loading="lazy" />
                </div>
                <input
                  className="input lba-label"
                  defaultValue={option.label}
                  aria-label={t("lba.label")}
                  maxLength={96}
                  onBlur={(e) => {
                    const label = e.target.value.trim();
                    if (label && label !== option.label) void patch(option, { label });
                  }}
                />
                <div className="lba-actions">
                  <label className="switch" title={option.active ? t("lba.visible") : t("lba.hidden")}>
                    <input type="checkbox" checked={option.active} disabled={busyId === option.id} onChange={(e) => void patch(option, { active: e.target.checked })} />
                    <span className="track"></span>
                  </label>
                  <span className="lba-state">{option.active ? t("lba.visible") : t("lba.hidden")}</span>
                  {option.builtIn ? (
                    <span className="lba-builtin" title={t("lba.builtInHint")}>{t("lba.builtIn")}</span>
                  ) : (
                    <button className="kebab" aria-label={t("lba.delete")} title={t("lba.delete")} disabled={busyId === option.id} onClick={() => void remove(option)}>
                      <Icon name="delete" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
