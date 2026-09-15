import type { Metadata } from "next";
import SignupView from "../../../components/auth/SignupView";

export const metadata: Metadata = {
  title: "Sign Up — BeSight",
  description:
    "Create your BeSight account to link trade accounts and unlock indicator access.",
};

export default function SignupPage() {
  return <SignupView />;
}
