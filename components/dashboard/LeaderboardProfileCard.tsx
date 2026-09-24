"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { useCrm } from "../crm/CrmContext";
import { apiCall } from "../../lib/crmApi";
import Icon from "../Icon";
import LeaderboardAvatar from "./LeaderboardAvatar";
import {
  DEFAULT_LEADERBOARD_PROFILE,
  LEADERBOARD_NICKNAME_MAX,
  LEADERBOARD_PHOTO_MAX_CHARS,
  LEADERBOARD_PHOTO_PX,
  type AvatarOptionDto,
  type LeaderboardAvatarDto,
  type LeaderboardProfile,
} from "../../lib/leaderboardProfile";

/** Crops the picked image to a centred square and downsizes it to a small
 *  JPEG data URL, so the stored photo stays a few KB. */
function toSquareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = LEADERBOARD_PHOTO_PX;
      canvas.height = LEADERBOARD_PHOTO_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, LEADERBOARD_PHOTO_PX, LEADERBOARD_PHOTO_PX);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, LEADERBOARD_PHOTO_PX, LEADERBOARD_PHOTO_PX);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

/** Settings → how the member appears on the public leaderboard. */
export default function LeaderboardProfileCard() {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const [profile, setProfile] = useState<LeaderboardProfile>(DEFAULT_LEADERBOARD_PROFILE);
  const [saved, setSaved] = useState<LeaderboardProfile | null>(null);
  const [defaultLabel, setDefaultLabel] = useState("");
  const [code, setCode] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<AvatarOptionDto[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiCall<{ profile: LeaderboardProfile; defaultLabel: string; code: string }>("/api/me/leaderboard-profile/", "GET")
      .then((payload) => {
        if (cancelled) return;
        setProfile(payload.profile);
        setSaved(payload.profile);
        setDefaultLabel(payload.defaultLabel);
        setCode(payload.code);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : t("dash.lbProfile.loadFailed")));
    apiCall<{ options: AvatarOptionDto[] }>("/api/leaderboard/avatar-options/", "GET")
      .then((payload) => !cancelled && setOptions(payload.options))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [t]);

  /** Image for the chosen avatar: own photo, a catalog option, or initials. */
  function avatarUrlOf(p: LeaderboardProfile): LeaderboardAvatarDto {
    if (p.avatar.kind === "photo") return { url: p.avatar.dataUrl };
    if (p.avatar.kind === "preset") {
      const preset = p.avatar.preset;
      const option = options.find((o) => o.id === preset);
      return option ? { url: option.url } : null;
    }
    return null;
  }

  const set = (patch: Partial<LeaderboardProfile>) => setProfile((cur) => ({ ...cur, ...patch }));
  const dirty = saved !== null && JSON.stringify(profile) !== JSON.stringify(saved);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast(t("dash.lbProfile.photoInvalid"));
      return;
    }
    try {
      const dataUrl = await toSquareJpeg(file);
      if (dataUrl.length > LEADERBOARD_PHOTO_MAX_CHARS) {
        toast(t("dash.lbProfile.photoTooLarge"));
        return;
      }
      set({ avatar: { kind: "photo", dataUrl } });
    } catch {
      toast(t("dash.lbProfile.photoInvalid"));
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = await apiCall<{ profile: LeaderboardProfile }>("/api/me/leaderboard-profile/", "PUT", profile);
      setProfile(payload.profile);
      setSaved(payload.profile);
      toast(t("dash.lbProfile.saved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("dash.lbProfile.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const previewName = profile.anonymous ? t("dash.leaderboard.anonymous") : profile.nickname.trim() || defaultLabel;
  const previewAvatar = profile.anonymous ? null : avatarUrlOf(profile);

  return (
    <div className="card" style={{ padding: 24, marginTop: 20 }}>
      <div className="panel-section-title">{t("dash.lbProfile.title")}</div>
      <p style={{ fontSize: 12.5, color: "var(--text-sub)", margin: "-4px 0 16px" }}>{t("dash.lbProfile.desc")}</p>

      {loadError ? (
        <div style={{ color: "var(--red)", fontSize: 13 }}>{loadError}</div>
      ) : (
        <>
          <div className="lbp-preview" aria-label={t("dash.lbProfile.preview")}>
            <span className="lbp-preview-label">{t("dash.lbProfile.preview")}</span>
            <div className="lbp-preview-row">
              <span className="lbd-member-avatar">
                <LeaderboardAvatar avatar={previewAvatar} name={previewName} anonymous={profile.anonymous} />
              </span>
              <span className="lbd-member-info">
                <div className="lbd-member-name">{previewName || "…"}</div>
                {!profile.anonymous && profile.showCode && code && <div className="lbd-member-code">{code}</div>}
              </span>
            </div>
          </div>

          <div className="field">
            <label>{t("dash.lbProfile.nickname")}</label>
            <input
              className="input"
              value={profile.nickname}
              maxLength={LEADERBOARD_NICKNAME_MAX}
              disabled={profile.anonymous || saved === null}
              placeholder={defaultLabel}
              onChange={(e) => set({ nickname: e.target.value })}
            />
            <div className="field-hint">{t("dash.lbProfile.nicknameHint")}</div>
          </div>

          <div className="field">
            <label>{t("dash.lbProfile.avatar")}</label>
            <div className="lbp-avatars" role="radiogroup" aria-label={t("dash.lbProfile.avatar")}>
              <button
                type="button"
                role="radio"
                aria-checked={profile.avatar.kind === "initials"}
                className={`lbp-avatar-opt${profile.avatar.kind === "initials" ? " is-selected" : ""}`}
                disabled={profile.anonymous}
                onClick={() => set({ avatar: { kind: "initials" } })}
                title={t("dash.lbProfile.avatarInitials")}
                aria-label={t("dash.lbProfile.avatarInitials")}
              >
                <LeaderboardAvatar avatar={null} name={previewName} />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={profile.avatar.kind === "photo"}
                className={`lbp-avatar-opt${profile.avatar.kind === "photo" ? " is-selected" : ""}`}
                disabled={profile.anonymous}
                onClick={() => fileRef.current?.click()}
                title={t("dash.lbProfile.avatarUpload")}
                aria-label={t("dash.lbProfile.avatarUpload")}
              >
                {profile.avatar.kind === "photo" ? (
                  <LeaderboardAvatar avatar={avatarUrlOf(profile)} name={previewName} />
                ) : (
                  <span className="lbd-avatar-fallback lbp-upload"><Icon name="add_a_photo" /></span>
                )}
              </button>
              {options.map((option) => {
                const preset = option.id;
                const selected = profile.avatar.kind === "preset" && profile.avatar.preset === preset;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    key={preset}
                    className={`lbp-avatar-opt${selected ? " is-selected" : ""}`}
                    aria-label={option.label}
                    title={option.label}
                    disabled={profile.anonymous}
                    onClick={() => set({ avatar: { kind: "preset", preset } })}
                  >
                    <LeaderboardAvatar avatar={{ url: option.url }} name={option.label} />
                  </button>
                );
              })}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onPhoto(e)} />
          </div>

          {([
            ["showCode", "dash.lbProfile.showCode", "dash.lbProfile.showCodeHint"],
            ["showSymbols", "dash.lbProfile.showSymbols", "dash.lbProfile.showSymbolsHint"],
            ["anonymous", "dash.lbProfile.anonymous", "dash.lbProfile.anonymousHint"],
          ] as const).map(([key, labelKey, hintKey]) => (
            <div className="set-row" key={key}>
              <div>
                <div className="t">{t(labelKey)}</div>
                <div className="d">{t(hintKey)}</div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={profile[key]}
                  disabled={saved === null || (key !== "anonymous" && profile.anonymous)}
                  onChange={(e) => set({ [key]: e.target.checked } as Partial<LeaderboardProfile>)}
                />
                <span className="track"></span>
              </label>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "…" : t("dash.lbProfile.save")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
