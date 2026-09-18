"use client";

import { signIn } from "next-auth/react";
import { useLanguage } from "../crm/LanguageContext";

/* Only providers whose client id/secret are configured on the server are
   rendered — see app/(auth)/login/page.tsx. */
export default function AuthSocialButtons({ google, facebook, line }: { google: boolean; facebook: boolean; line: boolean }) {
  const { t } = useLanguage();

  if (!google && !facebook && !line) {
    return (
      <p className="auth-social-note">
        {t("auth.login.socialUnavailable")}
      </p>
    );
  }

  return (
    <div className="auth-social">
      {google && (
        <button type="button" className="auth-social-btn" onClick={() => void signIn("google", { callbackUrl: "/" })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.45c-.24 1.4-.96 2.6-2.05 3.4l3.3 2.56c1.93-1.78 3.04-4.4 3.04-7.51 0-.72-.06-1.42-.18-2.09H12z"
            />
            <path
              fill="#34A853"
              d="M6.6 14.28l-.74.57-2.62 2.04C4.92 19.84 8.2 22 12 22c2.7 0 4.96-.89 6.62-2.42l-3.3-2.56c-.9.6-2.04.96-3.32.96-2.55 0-4.72-1.72-5.49-4.04z"
            />
            <path
              fill="#4A90D9"
              d="M3.24 7.11A9.93 9.93 0 0 0 2 12c0 1.74.42 3.38 1.24 4.89l3.36-2.61A5.99 5.99 0 0 1 6.27 12c0-.65.11-1.28.31-1.86L3.24 7.11z"
            />
            <path
              fill="#FBBC05"
              d="M12 6.04c1.47 0 2.78.51 3.82 1.5l2.86-2.86C16.96 2.99 14.7 2 12 2 8.2 2 4.92 4.16 3.24 7.11l3.34 2.6C7.28 7.76 9.45 6.04 12 6.04z"
            />
          </svg>
          Google
        </button>
      )}
      {facebook && (
        <button type="button" className="auth-social-btn" onClick={() => void signIn("facebook", { callbackUrl: "/" })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#1877F2"
              d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
            />
          </svg>
          Facebook
        </button>
      )}
      {line && (
        <button type="button" className="auth-social-btn" onClick={() => void signIn("line", { callbackUrl: "/" })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="#06C755" />
            <path
              fill="#fff"
              d="M12 5.5c-4.14 0-7.5 2.73-7.5 6.1 0 3.02 2.67 5.55 6.28 6.03.24.05.58.16.66.37.08.19.05.5.03.7l-.11.65c-.03.19-.15.75.65.41.8-.34 4.33-2.55 5.91-4.37 1.09-1.2 1.61-2.41 1.61-3.79 0-3.37-3.36-6.1-7.53-6.1z"
            />
          </svg>
          LINE
        </button>
      )}
    </div>
  );
}
