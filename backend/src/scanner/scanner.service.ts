import { Injectable, Logger } from '@nestjs/common';
import { IScannerService, ScanResult } from './scanner.interface';
import * as net from 'net';
import * as crypto from 'crypto';

@Injectable()
export class ScannerService implements IScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private readonly provider: string;

  constructor() {
    this.provider = process.env.MALWARE_SCAN_PROVIDER || 'mock';
    this.logger.log(`Malware Scanner initialized with provider: ${this.provider}`);
  }

  async scanBuffer(buffer: Buffer, filename: string): Promise<ScanResult> {
    if (this.provider === 'virustotal' && process.env.VIRUSTOTAL_API_KEY) {
      return this.scanWithVirusTotal(buffer, filename);
    }

    if (this.provider === 'clamav') {
      return this.scanWithClamAV(buffer);
    }

    // Default heuristic & signature scanner
    return this.scanWithHeuristic(buffer, filename);
  }

  private async scanWithHeuristic(buffer: Buffer, filename: string): Promise<ScanResult> {
    const contentStr = buffer.toString('utf-8', 0, Math.min(buffer.length, 4096));

    // 1. EICAR Standard Antivirus Test signature check
    const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    if (contentStr.includes(EICAR)) {
      this.logger.warn(`Malware detected in ${filename}: Eicar-Test-Signature`);
      return {
        isClean: false,
        virusName: 'EICAR.TestFile.Virus',
        details: 'EICAR standard antivirus test signature matched',
        scannerName: 'Previa-Heuristic-Engine',
      };
    }

    // 2. Dangerous executable payload disguised check
    const ext = filename.split('.').pop()?.toLowerCase();
    const isImageOrDoc = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'docx'].includes(ext || '');

    // Windows PE executable header: "MZ" at offset 0
    if (isImageOrDoc && buffer.length > 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      this.logger.warn(`Suspicious executable binary disguised as ${ext}: ${filename}`);
      return {
        isClean: false,
        virusName: 'Trojan.DisguisedExecutable.Win32',
        details: 'PE Executable binary header found inside document/image format',
        scannerName: 'Previa-Heuristic-Engine',
      };
    }

    // 3. Web-shell / Remote code execution script signatures
    if (['txt', 'csv', 'svg'].includes(ext || '')) {
      const dangerousPatterns = [
        /<\?php/i,
        /eval\s*\(/i,
        /base64_decode\s*\(/i,
        /cmd\.exe/i,
        /\/bin\/sh/i,
        /<script[\s\S]*?>[\s\S]*?document\.cookie[\s\S]*?<\/script>/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(contentStr)) {
          return {
            isClean: false,
            virusName: 'Exploit.WebShell.SuspiciousPayload',
            details: 'Script injection or web-shell signature detected',
            scannerName: 'Previa-Heuristic-Engine',
          };
        }
      }
    }

    return {
      isClean: true,
      scannerName: 'Previa-Heuristic-Engine',
      details: 'Clean file. No known malicious patterns or signatures identified.',
    };
  }

  private async scanWithClamAV(buffer: Buffer): Promise<ScanResult> {
    const host = process.env.CLAMAV_HOST || 'localhost';
    const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);

    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        // Send INSTREAM command to ClamAV daemon
        socket.write('zINSTREAM\0');
        const chunkSize = 2048;
        for (let i = 0; i < buffer.length; i += chunkSize) {
          const chunk = buffer.subarray(i, i + chunkSize);
          const sizeBuffer = Buffer.alloc(4);
          sizeBuffer.writeUInt32BE(chunk.length, 0);
          socket.write(sizeBuffer);
          socket.write(chunk);
        }
        // Zero-length chunk signals end of stream
        const zeroChunk = Buffer.alloc(4);
        zeroChunk.writeUInt32BE(0, 0);
        socket.write(zeroChunk);
      });

      let response = '';
      socket.on('data', (data) => {
        response += data.toString();
      });

      socket.on('end', () => {
        if (response.includes('OK')) {
          resolve({ isClean: true, scannerName: 'ClamAV-Daemon', details: response.trim() });
        } else if (response.includes('FOUND')) {
          const match = response.match(/stream: (.+) FOUND/);
          resolve({
            isClean: false,
            virusName: match ? match[1] : 'ClamAV.Threat.Detected',
            scannerName: 'ClamAV-Daemon',
            details: response.trim(),
          });
        } else {
          resolve({ isClean: true, scannerName: 'ClamAV-Daemon', details: 'Scan completed' });
        }
      });

      socket.on('error', (err) => {
        this.logger.warn(`ClamAV connection failed (${err.message}). Falling back to heuristic scan.`);
        resolve(this.scanWithHeuristic(buffer, 'unknown'));
      });
    });
  }

  private async scanWithVirusTotal(buffer: Buffer, filename: string): Promise<ScanResult> {
    try {
      const apiKey = process.env.VIRUSTOTAL_API_KEY;
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      // Check hash report first via VirusTotal v3
      const response = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
        headers: { 'x-apikey': apiKey },
      });

      if (response.status === 200) {
        const data: any = await response.json();
        const stats = data?.data?.attributes?.last_analysis_stats;
        const malicious = stats?.malicious || 0;
        if (malicious > 0) {
          return {
            isClean: false,
            virusName: `VirusTotal.Flagged.${malicious}.Engines`,
            scannerName: 'VirusTotal-v3',
            details: `Flagged as malicious by ${malicious} security vendors.`,
          };
        }
        return { isClean: true, scannerName: 'VirusTotal-v3', details: 'VirusTotal clean report' };
      }

      // If hash not found on VT, fallback to heuristic scanner
      return this.scanWithHeuristic(buffer, filename);
    } catch (err: any) {
      this.logger.warn(`VirusTotal query failed: ${err.message}. Fallback to heuristic.`);
      return this.scanWithHeuristic(buffer, filename);
    }
  }
}
