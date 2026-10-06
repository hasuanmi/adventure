import { AttendanceDto, AttendanceTodayDto } from '@huahua/shared-types';
import { request } from './client';

/** 打卡（P4）：今日状态 / 打卡 / 签退 / 月度历史 */
export const attendanceApi = {
  today: () => request<AttendanceTodayDto>('/attendance/today'),
  checkIn: () => request<AttendanceTodayDto>('/attendance/check-in', { method: 'POST' }),
  checkOut: () => request<AttendanceTodayDto>('/attendance/check-out', { method: 'POST' }),
  history: (params: { month?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.month) qs.set('month', params.month);
    const query = qs.toString();
    return request<AttendanceDto[]>(`/attendance${query ? `?${query}` : ''}`);
  },
};
