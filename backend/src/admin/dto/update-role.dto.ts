import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateRoleDto {
  @IsEnum(Role, { message: 'Role must be either USER or ADMIN' })
  @IsNotEmpty()
  role: Role;
}
