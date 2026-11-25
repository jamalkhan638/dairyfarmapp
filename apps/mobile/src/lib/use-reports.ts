import { useLocalQuery } from './hooks';
import { local } from './db';
import { loadReportData } from '../domain/reports';

export function useReportData() {
  return useLocalQuery(() => loadReportData(local().repo)).data;
}
