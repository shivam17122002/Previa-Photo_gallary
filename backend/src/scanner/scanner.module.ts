import { Global, Module } from '@nestjs/common';
import { ScannerService } from './scanner.service';

@Global()
@Module({
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}
