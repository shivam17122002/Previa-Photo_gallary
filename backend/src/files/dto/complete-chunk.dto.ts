import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ChunkPartItem {
  @IsNumber()
  partNumber: number;

  @IsString()
  etag: string;
}

export class CompleteChunkDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChunkPartItem)
  parts: ChunkPartItem[];
}
