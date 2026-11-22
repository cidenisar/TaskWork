import { requireAdminOrSupervisor } from "@/lib/auth";
import { GuardiaSubnav } from "@/components/panel/guardia-subnav";

/**
 * A diferencia del resto del Panel (que un técnico también puede entrar,
 * limitado — ver PanelLayout), estas pantallas son siempre de oficina:
 * admin + supervisor + superusuario, nunca un técnico, aunque sea la
 * guardia general (decisión de Ivan 9/11 + HANDOFF §4).
 */
export default async function GuardiaOficinaLayout({ children }: LayoutProps<"/panel/guardia">) {
  await requireAdminOrSupervisor();
  return (
    <div>
      <GuardiaSubnav />
      {children}
    </div>
  );
}
