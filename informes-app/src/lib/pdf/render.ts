import { renderToBuffer } from "@react-pdf/renderer";
import { InformeTecnicoPdf, type InformePdfProps } from "./informe-tecnico";

export async function renderInformeTecnicoPdf(props: InformePdfProps): Promise<Buffer> {
  return renderToBuffer(InformeTecnicoPdf(props));
}
