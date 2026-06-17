declare module "pdfjs-dist/build/pdf.mjs" {
  export interface PDFPageProxy {
    getViewport(options: { scale: number; rotation?: number }): PDFPageViewport;
    render(options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: PDFPageViewport;
    }): { promise: Promise<void> };
    getTextContent(): Promise<PDFTextContent>;
  }

  export interface PDFPageViewport {
    width: number;
    height: number;
    scale: number;
    rotation: number;
    transform: number[];
    convertToViewportPoint(x: number, y: number): [number, number];
    convertToViewportRectangle(
      rect: [number, number, number, number],
    ): [number, number, number, number];
  }

  export interface PDFTextItem {
    str: string;
    dir: string;
    width: number;
    height: number;
    transform: number[];
    fontName: string;
  }

  export interface PDFTextContent {
    items: PDFTextItem[];
    styles: Record<string, unknown>;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
  }

  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(
    src: string | Uint8Array | { url: string; [key: string]: unknown },
  ): PDFDocumentLoadingTask;

  const pdfjs: {
    getDocument: typeof getDocument;
    GlobalWorkerOptions: typeof GlobalWorkerOptions;
  };

  export default pdfjs;
}
