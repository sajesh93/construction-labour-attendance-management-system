import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SosService } from './sos.service';
import { TriggerSosDto } from './dto/sos.dto';
import { Public } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('sos')
@Controller('sos')
export class SosController {
  constructor(private readonly sos: SosService) {}

  /** Public on purpose: SOS must work from the login screen, before sign-in. */
  @Post()
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  trigger(@Body() dto: TriggerSosDto) {
    return this.sos.trigger(dto);
  }

  @Get()
  @ApiBearerAuth()
  list(@CurrentUser() user: AuthUser) {
    return this.sos.list(user);
  }

  @Post(':id/ack')
  @ApiBearerAuth()
  acknowledge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sos.acknowledge(user, id);
  }
}
