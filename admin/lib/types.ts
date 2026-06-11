// Shared API types mirroring the backend contracts (docs/03-api-contracts.md).
export type UserRole = 'SUPER_ADMIN' | 'SITE_ADMIN' | 'WATCHMAN' | 'SUPERVISOR';

export interface Me {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  organizationId: string;
  siteScopes: string[];
}

export interface Site {
  id: string;
  name: string;
  code: string;
  timezone: string;
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusM?: number | null;
}

export interface SiteSettings {
  siteId: string;
  verificationMode: 'MANUAL' | 'AUTO';
  autoLoginCountdownSeconds: number;
  duplicateTapCooldownSeconds: number;
  geoEnforcement: boolean;
  geoRadiusMeters: number;
  photoVerificationMode: 'ALWAYS' | 'NEVER' | 'RANDOM';
  photoVerificationRandomPct: number;
  defaultShiftId?: string | null;
}

export type PersonCategory = 'WORKER' | 'STAFF' | 'VISITOR';

export interface Worker {
  id: string;
  workerCode: string;
  fullName: string;
  category?: PersonCategory;
  designationId?: string | null;
  designation?: { name: string } | null;
  fatherName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  language?: string | null;
  photoUrl?: string | null;
  mobileNumber?: string | null;
  pincode?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'EXITED' | 'SUSPENDED';
  bloodGroup?: string | null;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  vendorId?: string | null;
  natureOfContractor?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  ifscCode?: string | null;
  pfNumber?: string | null;
  esiNumber?: string | null;
  govIdType?: string | null;
  aadhaarLast4?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  code: string;
  contactPerson?: string | null;
  contactNumber?: string | null;
  isActive: boolean;
}

export interface Designation {
  id: string;
  name: string;
  isActive: boolean;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  siteId?: string | null;
  data?: Record<string, unknown> | null;
  createdAt: string;
  readAt?: string | null;
}

export interface DaySummary {
  date: string;
  total: number;
  activeNow: number;
  byDesignation: { designation: string; count: number; active: number }[];
  byCategory: { category: string; count: number; active: number }[];
}

export interface Device {
  id: string;
  deviceUid: string;
  label?: string | null;
  platform?: string | null;
  status: 'PENDING' | 'AUTHORIZED' | 'REVOKED';
  siteId?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
}

export interface CorrectionRequest {
  id: string;
  workerId: string;
  siteId: string;
  workDate: string;
  type: 'LOGIN' | 'LOGOUT' | 'MISSING' | 'WRONG_SITE';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  notes?: string | null;
  items: { id: string; field: string; proposedValue: unknown; previousValue?: unknown }[];
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}
