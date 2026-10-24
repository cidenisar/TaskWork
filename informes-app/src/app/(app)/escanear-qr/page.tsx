import { requireProfile } from "@/lib/auth";
import { EscanearQr } from "@/components/qr/escanear-qr";

export default async function EscanearQrPage() {
  await requireProfile();
  return <EscanearQr />;
}
