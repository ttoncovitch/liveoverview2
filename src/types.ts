
// Types for the application
export interface BreakSession {
  type: 'meal' | 'short' | 'wellness' | 'wc' | 'praying' | 'idle' | 'other' | 'forgot_status' | 'offline' | 'moderating' | 'non_moderating' | 'meeting' | 'training';
  rawStatus?: string;
  subType?: string;
  remarks?: string;
  originalStatus?: string;
  originalSubStatus?: string;
  originalRemark?: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
}

export interface EmployeeDayRecord {
  date: string;
  employeeName: string;
  totalWorkTimeMillis: number;
  totalOfflineTimeMillis?: number;
  breaks: BreakSession[];
  
  // Accumulated durations in minutes
  mealDuration: number;
  shortDuration: number;
  wellnessDuration: number;
  wcDuration: number;
  prayingDuration: number;
  idleDuration: number;
  nonModDuration: number;
  reviewAndAppealDuration: number;
  awaitingTasksDuration: number;
  forgotStatusDuration: number;
  
  // Overbreaks in minutes
  mealOverbreak: number;
  shortOverbreak: number;
  wellnessOverbreak: number;
  prayingOverbreak: number;
  wcOverbreak: number; // WC alert if > 10m
  idleOverbreak: number;
  
  totalOverbreak: number;

  tardinessMinutes: number;
  earlyLeaveMinutes: number;
  actualStartTime?: Date | null;
  actualEndTime?: Date | null;

  inferredShift?: string;
  scheduledShift?: string;
  lob?: string;
  hasSingleShort30m?: boolean;
  hasMealWithoutShortAnomaly?: boolean;
  isAbsence?: boolean;
  isATT?: boolean;
  isLOA?: boolean;
  isPTO?: boolean;
  isSL?: boolean;
  isSUSPP?: boolean;
  isOFF?: boolean;
}

export interface CalendarData {
  email: string;
  name: string;
  workdayId?: string;
  lob?: string;
  language?: string;
  supervisor?: string;
  role?: string;
  shift?: string; // If fixed shift, or schedule per date
  schedule?: Record<string, string>; // date -> shift mapping
  lobSchedule?: Record<string, string>; // date -> lob mapping
}

export interface EmployeeSummary {
  employeeName: string;
  email: string;
  workdayId?: string;
  department: string;
  lob?: string;
  language?: string;
  supervisor?: string;
  role?: string;
  shift?: string; // from calendar
  calendarName?: string; // overriding inferred name
  isTraining: boolean;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  totalOverbreakMinutes: number;
  wcTotalOverbreak?: number;
  totalTardinessMinutes: number;
  totalEarlyLeaveMinutes: number;
  totalNonModMinutes: number;
  totalReviewAndAppealMinutes: number;
  totalAwaitingTasksMinutes: number;
  totalForgotStatusMinutes: number;
  totalAbsences: number;
  totalShort30MinRecords?: number;
  isOffboarded?: boolean;
  isATT?: boolean;
  isLOA?: boolean;
  isPTO?: boolean;
  isSL?: boolean;
  isSUSPP?: boolean;
  isOFF?: boolean;
  isRefresher?: boolean;
  refresherDate?: string;
  refresherStartDate?: string;
  vacationStartDate?: string;
  vacationEndDate?: string;
  isNextVacations?: boolean;
  wcAlerts: number;
  idleAlerts: number;
  wcTotalMinutes?: number;
  idleTotalMinutes?: number;
  dailyRecords: EmployeeDayRecord[];
}

export interface DashboardStats {
  totalEmployees: number;
  totalOverbreakMinutes: number;
  topProblematicEmployees: { name: string; overbreak: number }[];
  wcAlertCount: number;
}
