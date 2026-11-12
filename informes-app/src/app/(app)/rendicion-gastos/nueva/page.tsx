import { requireProfile } from "@/lib/auth";
import { NuevaRendicionForm } from "@/components/rendicion-gastos/nueva-rendicion-form";

export default async function NuevaRendicionPage() {
  await requireProfile();
  return <NuevaRendicionForm />;
}
