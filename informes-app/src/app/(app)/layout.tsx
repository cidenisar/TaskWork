import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  return <AppShell profile={profile}>{children}</AppShell>;
}
