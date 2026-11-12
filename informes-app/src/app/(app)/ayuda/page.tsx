import { requireProfile } from "@/lib/auth";
import { AyudaView } from "@/components/ayuda/view";

export default async function AyudaPage() {
  const profile = await requireProfile();
  return <AyudaView rol={profile.rol} />;
}
