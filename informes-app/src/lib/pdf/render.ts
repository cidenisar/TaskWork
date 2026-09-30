import { renderToBuffer } from "@react-pdf/renderer";
import { InformeTecnicoPdf, type InformePdfProps } from "./informe-tecnico";
import { RendicionGastosPdf, type RendicionPdfProps } from "./rendicion-gastos";
import { TableroPdf, type TableroPdfProps } from "./tablero";
import { RackPdf, type RackPdfProps } from "./rack";

export async function renderInformeTecnicoPdf(props: InformePdfProps): Promise<Buffer> {
  return renderToBuffer(InformeTecnicoPdf(props));
}

export async function renderRendicionGastosPdf(props: RendicionPdfProps): Promise<Buffer> {
  return renderToBuffer(RendicionGastosPdf(props));
}

export async function renderTableroPdf(props: TableroPdfProps): Promise<Buffer> {
  return renderToBuffer(TableroPdf(props));
}

export async function renderRackPdf(props: RackPdfProps): Promise<Buffer> {
  return renderToBuffer(RackPdf(props));
}
