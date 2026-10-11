import { IsOptional, IsString } from 'class-validator';

export class MoveFileDto {
  @IsString()
  @IsOptional()
  targetFolderId?: string | null;
}
