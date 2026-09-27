import { RegisterForm } from "@/components/auth/register-form";

/** Customer self-service registration (plan 03). No email verification in
 *  release 1 — the account is active immediately. */
export default function RegisterPage() {
  return <RegisterForm />;
}
