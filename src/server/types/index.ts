export type UserRole = 'admin' | 'staff';

export type MembershipType = 'lead' | 'trialer' | 'member';

export type AccountType = 'basic' | 'premium' | 'elite' | 'family';

export type ProgramType =
  | "Children's Martial Arts"
  | 'Adult BJJ'
  | 'Adult TKD & HKD'
  | 'DG Barbell'
  | 'Adult Muay Thai & Kickboxing'
  | 'The Ashtanga Club'
  | 'Dragon Gym Learning Center'
  | 'Kids BJJ'
  | 'Kids Muay Thai'
  | 'Young Ladies Yoga'
  | 'DG Workspace'
  | 'Dragon Launch'
  | 'Personal Training'
  | 'DGMT Private Training';

export type MembershipAge = 'Adult' | 'Kids';

export type TaekwondoRank =
  | 'White'
  | 'Yellow'
  | 'Orange'
  | 'Green'
  | 'Purple'
  | 'Blue'
  | 'Red'
  | 'Brown'
  | 'Il Dan Bo'
  | 'Black';

export type BJJRank = 'White' | 'Blue' | 'Brown' | 'Black';

export type MuayThaiRank = 'White' | 'Green' | 'Purple' | 'Blue' | 'Red';

export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accountStatus: MembershipType;
  accountType: AccountType;
  programType: ProgramType;
  membershipAge: MembershipAge;
  ranking: string;
  dateOfBirth?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
  tags?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Audience {
  id: number;
  name: string;
  description?: string;
  filters: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: number;
  name: string;
  type: 'email' | 'call' | 'website';
  audienceId: number;
  status: 'draft' | 'active' | 'paused' | 'completed';
  content?: string;
  settings?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface ABTest {
  id: number;
  name: string;
  audienceId: number;
  variantA: string;
  variantB: string;
  status: 'draft' | 'running' | 'completed';
  results?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export type LeadSource = 'web_form' | 'inbound_call' | 'manual_add' | 'referral' | 'walk_in' | 'social_media';

export type AccountStatus = 'lead' | 'trialer' | 'member' | 'cancelled';

export interface AudienceFilter {
  accountStatus?: MembershipType[];
  accountType?: AccountType[];
  programType?: ProgramType[];
  membershipAge?: MembershipAge[];
  ranking?: string[];
  tags?: string[];
  leadSource?: LeadSource[];
  locationIds?: number[];
  eventIds?: number[];
  eventAttendanceStatus?: ('registered' | 'attended' | 'no-show' | 'cancelled')[];
}
