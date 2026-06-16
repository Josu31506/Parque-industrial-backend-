import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: { sub: string; role: string }) {
    return this.usersService.findOne(user.sub, user);
  }

  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.usersService.findOne(id, user);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.usersService.remove(id, user);
  }
}
