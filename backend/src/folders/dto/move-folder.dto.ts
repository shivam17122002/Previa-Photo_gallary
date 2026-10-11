import { IsOptional, IsString } from 'class-validator';

export class MoveFolderDto {
  @IsString()
  @IsOptional()
  targetParentId?: string | null;
}
