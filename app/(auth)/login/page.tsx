import type { Metadata } from "next";
import LoginView from "../../../components/auth/LoginView";

export const metadata: Metadata = {
  title: "Log In — BeSight",
  description: "Log in to BeSight to manage your trade accounts and indicator access.",
};

export default function LoginPage() {
  return <LoginView />;
}
