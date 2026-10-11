import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameFileDto {
  @IsString()
  @IsNotEmpty({ message: 'File name cannot be empty' })
  @MaxLength(255)
  name: string;
}
