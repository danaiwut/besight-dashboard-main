import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import LINE from "next-auth/providers/line";
import { resolveMemberIdentityByEmail, resolveOrCreateMemberIdentityByEmail, verifyCredentials } from "@/lib/server/authIdentity";

/* ── Auth.js (NextAuth v5) ──
   Identity lives in the existing Member/Admin tables — signing in only claims
   an existing row, it never creates one (members are provisioned by the CRM
   sync). Sessions are stateless JWTs, so no Session/Account tables are needed.

   Google + Facebook are registered only when their client id/secret are
   present, so the app still works with email/password until OAuth credentials
   are added to the environment. */

const providers: NextAuthConfig["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.push(
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    }),
  );
}

if (process.env.LINE_CLIENT_ID && process.env.LINE_CLIENT_SECRET) {
  providers.push(
    LINE({
      clientId: process.env.LINE_CLIENT_ID,
      clientSecret: process.env.LINE_CLIENT_SECRET,
    }),
  );
}

providers.push(
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email || "").trim();
      const password = String(credentials?.password || "");
      if (!email || !password) return null;
      const identity = await verifyCredentials(email, password);
      if (!identity) return null;
      return {
        id: `${identity.role}:${identity.role === "admin" ? identity.adminId : identity.memberId}`,
        email: identity.email,
        name: identity.name,
        role: identity.role,
        memberId: identity.role === "member" ? identity.memberId : undefined,
        adminId: identity.role === "admin" ? identity.adminId : undefined,
        tokenVersion: identity.tokenVersion,
      };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return true;
      if (!user?.email) return false;

      /* The provider must positively assert the address is verified. Google
         sends `email_verified`; Facebook and LINE send no such claim, so they
         fail closed here — enabling either one is a deliberate decision that
         has to deal with unverified addresses first, because an unverified
         email would otherwise let anyone claim a member's account. */
      if (profile?.email_verified !== true) return false;

      // Verified-email providers may also self-register: claim an existing
      // MEMBER row by email, or mint a new one if none exists yet — never
      // an admin, and never for a provider that didn't independently verify
      // the address (the check above already screens those out).
      return Boolean(await resolveOrCreateMemberIdentityByEmail(user.email, user.name ?? ""));
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as { role?: "admin" | "member"; memberId?: number; adminId?: number; tokenVersion?: number; email?: string | null; name?: string | null };
        if (u.role) {
          token.role = u.role;
          token.memberId = u.memberId;
          token.adminId = u.adminId;
          token.tokenVersion = u.tokenVersion;
        } else if (u.email) {
          /* Social path. Member-only, mirroring the signIn callback — belt and
             braces, so a token can never be minted with an admin role from an
             identity provider. */
          const identity = await resolveMemberIdentityByEmail(u.email);
          if (identity) {
            token.role = identity.role;
            token.memberId = identity.memberId;
            token.adminId = undefined;
            token.tokenVersion = identity.tokenVersion;
          }
        }
        if (u.name) token.name = u.name;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as { role?: "admin" | "member"; memberId?: number; adminId?: number; tokenVersion?: number };
      session.user.role = t.role;
      session.user.memberId = t.memberId;
      session.user.adminId = t.adminId;
      session.user.tokenVersion = t.tokenVersion;
      return session;
    },
  },
});
