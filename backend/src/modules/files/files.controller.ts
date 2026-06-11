import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/file.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @RequirePermissions(Permission.WORKER_MANAGE)
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadFileDto) {
    return this.files.upload(user, dto);
  }

  /** Streams the image; any authenticated user in the org may view. */
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const blob = await this.files.get(user, id);
    res.setHeader('Content-Type', blob.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(blob.data));
  }
}
