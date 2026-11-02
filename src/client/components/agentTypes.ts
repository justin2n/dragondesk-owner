// Shared shapes for the website chat agent screens.

export type FieldKey = 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'company' | 'program' | 'location' | 'message';

export interface AgentConfig {
  id: number;
  name: string;
  domains: string[];
  enabled: boolean;
  agentName: string;
  businessName: string;
  greeting: string;
  trialOffer: string;
  businessInfo: string;
  aiInstructions: string;
  accentColor: string;
  submitNativeForm: boolean;
  formPageUrl: string;
  formSelector: string;
  fieldMap: Partial<Record<FieldKey, string>>;
  autoOpen: 'off' | 'time' | 'scroll';
  autoOpenDelay: number;
  autoOpenScroll: number;
  bookingUrl: string;
  bookingLabel: string;
  followUpEnabled: boolean;
  followUpMinutes: number;
  followUpMessage: string;
  requirePhone: boolean;
  audienceId: number | null;
  purpose: 'signup' | 'support';
  formFields: {
    required: ('lastName' | 'phone' | 'company' | 'program' | 'location')[];
    options: { program?: string[]; location?: string[] };
    extras: { key: string; label: string; kind: 'select' | 'checkbox' | 'text'; options: string[] }[];
  } | null;
  formFieldsAt: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string;
  knowledgeSyncedAt: string | null;
  knowledgeError: string | null;
}

export interface AgentRow extends AgentConfig {
  audienceName: string | null;
  stats: { chats: number; signups: number; bookings: number };
}
