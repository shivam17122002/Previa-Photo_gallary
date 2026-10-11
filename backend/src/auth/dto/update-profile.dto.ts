import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
