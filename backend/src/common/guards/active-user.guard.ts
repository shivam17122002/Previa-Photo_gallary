import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }
    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException('Your account is pending administrator approval');
    }
    if (user.status === UserStatus.REJECTED) {
      throw new ForbiddenException('Your registration request was declined by administrator');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Your account has been suspended');
    }
    return true;
  }
}
