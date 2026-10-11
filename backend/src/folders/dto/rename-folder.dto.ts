import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameFolderDto {
  @IsString()
  @IsNotEmpty({ message: 'New folder name is required' })
  @MaxLength(100, { message: 'Folder name cannot exceed 100 characters' })
  name: string;
}
