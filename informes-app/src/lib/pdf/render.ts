import { renderToBuffer } from "@react-pdf/renderer";
import { InformeTecnicoPdf, type InformePdfProps } from "./informe-tecnico";
import { RendicionGastosPdf, type RendicionPdfProps } from "./rendicion-gastos";

export async function renderInformeTecnicoPdf(props: InformePdfProps): Promise<Buffer> {
  return renderToBuffer(InformeTecnicoPdf(props));
}

export async function renderRendicionGastosPdf(props: RendicionPdfProps): Promise<Buffer> {
  return renderToBuffer(RendicionGastosPdf(props));
}
