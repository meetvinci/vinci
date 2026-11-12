import { createContext } from 'react';
import type { AdminNotice } from '@/types/admin.types';

export const adminNoticeContext = createContext<(notice: AdminNotice) => void>(() => undefined);
