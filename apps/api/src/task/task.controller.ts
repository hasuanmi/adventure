import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TaskDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { CreateTaskDto, TaskStatusActionDto, UpdateTaskDto } from './dto';
import { TaskService } from './task.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly task: TaskService) {}

  @Post()
  async create(@CurrentUser() actor: RequestActor, @Body() dto: CreateTaskDto): Promise<TaskDto> {
    return this.task.create(actor, dto);
  }

  @Get()
  async list(@CurrentUser() actor: RequestActor, @Query('status') status?: string): Promise<TaskDto[]> {
    return this.task.list(actor, status);
  }

  @Get(':id')
  async get(@CurrentUser() actor: RequestActor, @Param('id') id: string): Promise<TaskDto> {
    return this.task.getById(actor, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskDto> {
    return this.task.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: RequestActor, @Param('id') id: string): Promise<void> {
    await this.task.remove(actor, id);
  }

  @Post(':id/status')
  async changeStatus(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: TaskStatusActionDto,
  ): Promise<TaskDto> {
    return this.task.changeStatus(actor, id, dto.action);
  }
}
