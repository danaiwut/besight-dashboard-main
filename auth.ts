import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import LINE from "next-auth/providers/line";
import { resolveIdentityByEmail, verifyCredentials } from "@/lib/server/authIdentity";

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
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.push(
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.LINE_CLIENT_ID && process.env.LINE_CLIENT_SECRET) {
  providers.push(
    LINE({
      clientId: process.env.LINE_CLIENT_ID,
      clientSecret: process.env.LINE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
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
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;
      // Social sign-in must match an existing Member/Admin row.
      if (!user?.email) return false;
      return Boolean(await resolveIdentityByEmail(user.email));
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as { role?: "admin" | "member"; memberId?: number; adminId?: number; email?: string | null; name?: string | null };
        if (u.role) {
          token.role = u.role;
          token.memberId = u.memberId;
          token.adminId = u.adminId;
        } else if (u.email) {
          const identity = await resolveIdentityByEmail(u.email);
          if (identity) {
            token.role = identity.role;
            token.memberId = identity.role === "member" ? identity.memberId : undefined;
            token.adminId = identity.role === "admin" ? identity.adminId : undefined;
          }
        }
        if (u.name) token.name = u.name;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as { role?: "admin" | "member"; memberId?: number; adminId?: number };
      session.user.role = t.role;
      session.user.memberId = t.memberId;
      session.user.adminId = t.adminId;
      return session;
    },
  },
});
