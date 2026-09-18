import type { Metadata } from "next";
import LoginView from "../../../components/auth/LoginView";

export const metadata: Metadata = {
  title: "Log In — BeSight",
  description: "Log in to BeSight to manage your trade accounts and indicator access.",
};

export default function LoginPage() {
  const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const facebook = Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
  const line = Boolean(process.env.LINE_CLIENT_ID && process.env.LINE_CLIENT_SECRET);
  return <LoginView google={google} facebook={facebook} line={line} />;
}
