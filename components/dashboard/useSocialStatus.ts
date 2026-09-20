"use client";

import { useCallback, useEffect, useState } from "react";
import { apiCall } from "../../lib/crmApi";

export type SocialLinkState = { linked: boolean; username: string | null; verifiedAt: string | null };

export type SocialStatus = {
  status: Record<"telegram" | "discord" | "line", SocialLinkState>;
  telegramBotUsername: string | null;
  inviteLinks: Record<"telegram" | "discord" | "line", string | null>;
};

/** Verified social links for the signed-in member (real OAuth/Login flows —
 *  never hand-typed). */
export function useSocialStatus() {
  const [data, setData] = useState<SocialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const payload = await apiCall<SocialStatus & { ok: boolean }>("/api/me/social/", "GET");
      setData(payload);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load social links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const unlink = useCallback(async (provider: "telegram" | "discord" | "line") => {
    await apiCall(`/api/me/social/${provider}/`, "DELETE");
    await reload();
  }, [reload]);

  return { data, loading, error, reload, unlink };
}
