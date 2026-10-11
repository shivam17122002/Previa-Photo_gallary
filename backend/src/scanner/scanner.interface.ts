export interface ScanResult {
  isClean: boolean;
  virusName?: string;
  details?: string;
  scannerName: string;
}

export interface IScannerService {
  scanBuffer(buffer: Buffer, filename: string): Promise<ScanResult>;
}
