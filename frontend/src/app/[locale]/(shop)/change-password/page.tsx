import { ChangePasswordView } from "@/components/auth/change-password-view";

/**
 * Change password (plan 03). Also the forced gate after an admin-set
 * temporary password (MustChangePassword).
 */
export default function ChangePasswordPage() {
  return <ChangePasswordView />;
}
