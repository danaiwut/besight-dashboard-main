import { redirect } from "next/navigation";

/** Members are provisioned by the CRM sync — there is no public self-signup.
 *  A visitor can only sign in to an existing account. */
export default function SignupPage() {
  redirect("/login");
}
