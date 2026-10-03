import { LoginForm } from "@/components/auth/login-form";

/** Staff-only login door (plan 03). Same credentials, different entry:
 *  customers landing here are bounced to the customer login. */
export default function StaffLoginPage() {
  return <LoginForm staff />;
}
