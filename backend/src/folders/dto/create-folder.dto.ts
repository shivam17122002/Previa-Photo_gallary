import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @IsNotEmpty({ message: 'Folder name is required' })
  @MaxLength(100, { message: 'Folder name cannot exceed 100 characters' })
  name: string;

  @IsString()
  @IsOptional()
  parentId?: string;
}
