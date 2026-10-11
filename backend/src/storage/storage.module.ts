import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

@Global()
@Module({
  providers: [StorageService, LocalStorageAdapter, S3StorageAdapter],
  exports: [StorageService],
})
export class StorageModule {}
