import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class InitChunkDto {
  @IsString()
  @IsNotEmpty({ message: 'File name is required' })
  fileName: string;

  @IsNumber()
  @Min(1)
  fileSize: number;

  @IsString()
  @IsNotEmpty({ message: 'MIME type is required' })
  mimeType: string;

  @IsNumber()
  @Min(1)
  totalParts: number;

  @IsString()
  @IsOptional()
  folderId?: string;
}
