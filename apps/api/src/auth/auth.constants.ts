export const REFRESH_COOKIE_NAME = 'rt';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS ?? 30);
export const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
