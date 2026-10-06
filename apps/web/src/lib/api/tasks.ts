import {
  CreateTaskRequest,
  SubmitCompletionRequest,
  TaskCompletionDto,
  TaskDto,
  TaskStatus,
  TaskStatusActionRequest,
  UpdateTaskRequest,
} from '@huahua/shared-types';
import { request } from './client';

export const tasksApi = {
  list: (status?: TaskStatus) => request<TaskDto[]>(`/tasks${status ? `?status=${status}` : ''}`),
  get: (id: string) => request<TaskDto>(`/tasks/${id}`),
  create: (body: CreateTaskRequest) =>
    request<TaskDto>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  update: (id: string, body: UpdateTaskRequest) =>
    request<TaskDto>(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  remove: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  changeStatus: (id: string, body: TaskStatusActionRequest) =>
    request<TaskDto>(`/tasks/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  submitComplete: (id: string, body: SubmitCompletionRequest) =>
    request<TaskCompletionDto[]>(`/tasks/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  completions: (id: string) => request<TaskCompletionDto[]>(`/tasks/${id}/completions`),
};
