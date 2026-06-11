import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
@RequirePermissions(Permission.VENDOR_MANAGE)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.vendors.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vendors.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVendorDto) {
    return this.vendors.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendors.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vendors.remove(user, id);
  }
}
