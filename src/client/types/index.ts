export type UserRole = 'super_admin' | 'admin' | 'staff' | 'instructor';

export interface Location {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country: string;
  phone?: string;
  email?: string;
  timezone: string;
  isActive: boolean;
  isPrimary: boolean;
  settings?: any;
  createdAt: string;
  updatedAt: string;
}

export type AccountStatus = 'lead' | 'trialer' | 'member' | 'cancelled';

export type AccountType = 'basic' | 'premium' | 'elite' | 'family';

export type ProgramType = 'BJJ' | 'Muay Thai' | 'Taekwondo';

export type MembershipAge = 'Adult' | 'Kids';

export type LeadSource = 'web_form' | 'inbound_call' | 'manual_add' | 'referral' | 'walk_in' | 'social_media';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  isInstructor?: boolean;
  certifications?: string;
  specialties?: string;
  locationId?: number;
}

export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accountStatus: AccountStatus;
  accountType: AccountType;
  programType: ProgramType;
  membershipAge: MembershipAge;
  ranking: string;
  leadSource?: LeadSource;
  dateOfBirth?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
  tags?: string;
  locationId?: number;
  trialStartDate?: string;
  memberStartDate?: string;
  pricingPlanId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Audience {
  id: number;
  name: string;
  description?: string;
  filters: AudienceFilter;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceFilter {
  accountStatus?: AccountStatus[];
  accountType?: AccountType[];
  programType?: ProgramType[];
  membershipAge?: MembershipAge[];
  ranking?: string[];
  leadSource?: LeadSource[];
  tags?: string[];
  eventIds?: number[];
  eventAttendanceStatus?: ('registered' | 'attended' | 'no-show' | 'cancelled')[];
}

export interface ChurnMetric {
  id: number;
  memberId: number;
  firstName: string;
  lastName: string;
  email: string;
  accountType: AccountType;
  programType: ProgramType;
  membershipAge: MembershipAge;
  cancelledBy?: number;
  cancellationReason?: string;
  cancelledAt: string;
}

export interface Campaign {
  id: number;
  name: string;
  type: 'email' | 'call' | 'website';
  audienceId: number;
  status: 'draft' | 'active' | 'paused' | 'completed';
  content?: any;
  settings?: any;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  // Analytics fields
  sent?: number;
  delivered?: number;
  opens?: number;
  clicks?: number;
  openRate?: number;
  clickThroughRate?: number;
  leads?: number;
  trialers?: number;
  members?: number;
}

export interface ABTest {
  id: number;
  name: string;
  audienceId: number;
  variantA: any;
  variantB: any;
  status: 'draft' | 'running' | 'completed';
  results?: any;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export type EventType = 'class' | 'seminar' | 'workshop' | 'tournament' | 'testing' | 'social' | 'other';

export type EventStatus = 'scheduled' | 'cancelled' | 'completed';

export interface Event {
  id: number;
  myStudioId?: string;
  name: string;
  description?: string;
  eventType: EventType;
  programType?: ProgramType | 'All';
  startDateTime: string;
  endDateTime: string;
  location?: string;
  locationId?: number;
  maxAttendees?: number;
  currentAttendees: number;
  price: number;
  requiresRegistration: boolean;
  isRecurring: boolean;
  recurrencePattern?: string;
  instructor?: string;
  instructorId?: number;
  tags?: string;
  imageUrl?: string;
  status: EventStatus;
  syncedFromMyStudio: boolean;
  lastSyncedAt?: string;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleType = 'instructor' | 'front_desk';

export interface WorkSchedule {
  id: number;
  instructorId: number;
  locationId?: number;
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  specificDate?: string;
  scheduleType: ScheduleType;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  instructor?: User;
}

export interface MyStudioSyncLog {
  id: number;
  syncType: 'events' | 'members' | 'schedule';
  status: 'success' | 'failed' | 'partial';
  recordsImported: number;
  errorMessage?: string;
  syncedAt: string;
  syncedBy?: number;
}

export interface EmailTemplate {
  id: number;
  name: string;
  description?: string;
  subject?: string;
  body: string;
  thumbnail?: string;
  isDefault: boolean;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailImage {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy?: number;
  uploadedAt: string;
}

export interface SocialPost {
  id: number;
  campaignId?: number;
  accountId: number;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  platformPostId: string;
  postContent: string;
  mediaUrls?: string[];
  postUrl?: string;
  likes: number;
  shares: number;
  comments: number;
  impressions: number;
  engagement: number;
  publishedAt?: string;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialComment {
  id: number;
  postId: number;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  platformCommentId: string;
  authorName: string;
  authorId: string;
  authorProfileUrl?: string;
  authorImageUrl?: string;
  commentText: string;
  likes: number;
  replyCount: number;
  parentCommentId?: number;
  sentiment?: 'positive' | 'negative' | 'neutral';
  isHidden: boolean;
  isReplied: boolean;
  commentedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialCommentReply {
  id: number;
  commentId: number;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  platformReplyId?: string;
  replyText: string;
  status: 'draft' | 'sent' | 'failed';
  sentAt?: string;
  sentBy?: number;
  createdAt: string;
  updatedAt: string;
}

// Billing Types
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid' | 'paused';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export type PaymentMethodType = 'card' | 'bank_account' | 'us_bank_account';

export type BillingInterval = 'month' | 'year' | 'week';

export interface BillingSettings {
  id: number;
  locationId?: number;
  stripePublishableKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  currency: string;
  defaultTaxRate: number;
  trialDays: number;
  gracePeriodDays: number;
  autoRetryFailedPayments: boolean;
  sendPaymentReceipts: boolean;
  sendFailedPaymentAlerts: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PricingPlan {
  id: number;
  name: string;
  description?: string;
  stripePriceId?: string;
  stripeProductId?: string;
  accountType: AccountType;
  programType?: ProgramType | 'All';
  membershipAge?: MembershipAge | 'All';
  amount: number;
  currency: string;
  billingInterval: BillingInterval;
  intervalCount: number;
  trialDays: number;
  locationId?: number;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface StripeCustomer {
  id: number;
  memberId: number;
  stripeCustomerId: string;
  defaultPaymentMethodId?: string;
  email?: string;
  name?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: number;
  memberId: number;
  pricingPlanId: number;
  stripeSubscriptionId?: string;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialStart?: string;
  trialEnd?: string;
  canceledAt?: string;
  cancelReason?: string;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  memberName?: string;
  memberEmail?: string;
  planName?: string;
  planAmount?: number;
  planInterval?: BillingInterval;
}

export interface PaymentMethod {
  id: number;
  memberId: number;
  stripePaymentMethodId: string;
  stripeCustomerId: string;
  type: PaymentMethodType;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  billingName?: string;
  billingEmail?: string;
  billingAddress?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: number;
  memberId: number;
  subscriptionId?: number;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  invoiceNumber?: string;
  status: InvoiceStatus;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  subtotal?: number;
  tax: number;
  total?: number;
  currency: string;
  description?: string;
  invoiceUrl?: string;
  invoicePdfUrl?: string;
  dueDate?: string;
  paidAt?: string;
  periodStart?: string;
  periodEnd?: string;
  attemptCount: number;
  nextPaymentAttempt?: string;
  lastPaymentError?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  memberName?: string;
  memberEmail?: string;
  planName?: string;
}

export interface BillingEvent {
  id: number;
  stripeEventId: string;
  eventType: string;
  memberId?: number;
  subscriptionId?: number;
  invoiceId?: number;
  data: Record<string, any>;
  processed: boolean;
  processedAt?: string;
  error?: string;
  createdAt: string;
}

// Check-in and Attendance Types
export type CheckInMethod = 'qr_scan' | 'manual' | 'name_search' | 'phone_lookup';

export type ProficiencyLevel = 'introduced' | 'practiced' | 'proficient';

export interface MemberQRCode {
  id: number;
  memberId: number;
  qrCode: string;
  qrCodeData?: string;
  applePassSerialNumber?: string;
  googlePassId?: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckIn {
  id: number;
  memberId: number;
  locationId: number;
  checkInTime: string;
  checkInMethod: CheckInMethod;
  eventId?: number;
  notes?: string;
  createdAt: string;
  // Joined fields
  memberName?: string;
  memberEmail?: string;
  memberProgram?: ProgramType;
  memberRanking?: string;
  locationName?: string;
  eventName?: string;
}

export interface ClassSkill {
  id: number;
  name: string;
  category?: string;
  programType: ProgramType;
  beltLevel?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberSkillLearned {
  id: number;
  memberId: number;
  skillId: number;
  eventId?: number;
  learnedAt: string;
  proficiencyLevel: ProficiencyLevel;
  instructorNotes?: string;
  // Joined fields
  skillName?: string;
  skillCategory?: string;
  eventName?: string;
}

export interface BeltRequirement {
  id: number;
  programType: ProgramType;
  fromRanking: string;
  toRanking: string;
  minClassAttendance: number;
  minTimeInRankDays: number;
  requiredSkillCategories?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BeltProgress {
  currentBelt: string;
  nextBelt: string;
  classesAttended: number;
  classesRequired: number;
  daysInRank: number;
  daysRequired: number;
  classProgress: number;
  timeProgress: number;
  overallProgress: number;
  isReadyForPromotion: boolean;
  lastPromotionDate?: string;
}

export type WalletPassType = 'apple' | 'google';
export type WalletPassAction = 'generated' | 'sent' | 'downloaded' | 'updated' | 'revoked';

export interface WalletPassLog {
  id: number;
  memberId: number;
  passType: WalletPassType;
  action: WalletPassAction;
  recipientEmail?: string;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface KioskActivityLog {
  id: number;
  locationId: number;
  action: string;
  memberId?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AttendanceStats {
  totalCheckIns: number;
  uniqueMembers: number;
  checkInsByMethod: Record<CheckInMethod, number>;
  checkInsByProgram: Record<ProgramType, number>;
  peakHour?: number;
  averagePerDay: number;
}
