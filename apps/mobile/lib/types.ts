// Response shapes for /api/v1, in one place. Types that already exist in @evergreen/core are re-used, not copied.
// Times are ISO instants; days are YYYY-MM-DD in the business time zone.
import type { AppointmentStatus, Role, Vocabulary } from "@evergreen/core";

export type { AppointmentStatus, Role, Vocabulary };

export type ApiErrorCode = "unauthorized" | "no_workspace" | "forbidden" | "not_found" | "conflict" | "invalid" | "unsupported_media_type" | "server_error";
/** Codes the app adds itself when no API answer came back. */
export type ClientErrorCode = "network" | "bad_response";

export type Envelope<T> = { data: T } | { error: { code: ApiErrorCode; message: string } };

export interface Me {
  user: { id: string; name: string; email: string };
  role: Role;
  membershipId: string;
  today: string;
  isPlatformAdmin: boolean;
  workspace: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    brandColor: string | null;
    vocab: Vocabulary;
    trackRestBreaks: boolean;
  };
  workspaces: BusinessRef[];
}

export interface BusinessRef {
  id: string;
  name: string;
}

export interface StaffColumn {
  membershipId: string;
  name: string;
  color: string;
  title: string | null;
}

export interface Appointment {
  id: string;
  membershipId: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  status: AppointmentStatus;
  source: string;
  clientNote: string | null;
  staffNote: string | null;
}

export type TodayScope = "mine" | "all";

export interface TodayResponse {
  day: string;
  timezone: string;
  scope: TodayScope;
  canEditAll: boolean;
  staff: StaffColumn[];
  appointments: Appointment[];
}

export type BreakKind = "meal" | "rest";

export interface ClockBreak {
  id: string;
  kind: BreakKind;
  startsAt: string;
  endsAt: string | null;
}

export interface ClockStatus {
  clockedIn: boolean;
  entry: { id: string; clockIn: string } | null;
  breaks: ClockBreak[];
  openBreak: ClockBreak | null;
}

export type TimeOffStatus = "pending" | "approved" | "denied" | "cancelled";
export type TimeOffScope = "open" | "past";

export interface TimeOffRequest {
  id: string;
  membershipId: string;
  name: string;
  color: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  startDay: string;
  endDay: string;
  reason: string | null;
  status: TimeOffStatus;
  reviewNote: string | null;
}

export interface TimeOffResponse {
  scope: TimeOffScope;
  requests: TimeOffRequest[];
}

export interface MessageResponse {
  message: string;
}

/** Clock writes return the new status, so the screen can update without another request. */
export interface ClockActionResponse {
  message: string;
  clock: ClockStatus;
}

export type TimeOffDecision = "approved" | "denied";

/** Body of POST /time-off. Days are YYYY-MM-DD, times are HH:MM in the business time zone. */
export interface TimeOffInput {
  startDay: string;
  endDay: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

export interface CreateTimeOffResponse {
  message: string;
  id: string;
}
