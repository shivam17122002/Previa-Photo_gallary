import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class UpdateQuotaDto {
  @IsNumber()
  @Min(1048576, { message: 'Quota must be at least 1MB (1048576 bytes)' })
  @IsNotEmpty()
  quotaBytes: number;
}
