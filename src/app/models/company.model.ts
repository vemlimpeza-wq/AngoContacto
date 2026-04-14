export interface Company {
  id: string;
  name: string;
  logoUrl?: string;
  emails: string[];
  landlinePhone?: string;
  mobilePhone?: string;
  address: string;
  googleMapsLink?: string;
  website?: string;
  socialMedia: { platform: string; url: string }[];
  description: string;
  sector: string;
  province: string;
  category?: string;
}

export interface SavedSearch {
  id: string;
  query: string;
  email?: string;
  province?: string;
  sector?: string;
  timestamp: number;
  lastAccessed?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  read: boolean;
  timestamp: number;
  searchId?: string;
}

export interface UserProfile {
  senderName: string;
  senderCompany: string;
  senderWebsite?: string;
  objective: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface EmailCampaign {
  id: string;
  companyId: string;
  companyName: string;
  targetEmail: string;
  subject: string;
  body: string;
  status: 'sent' | 'scheduled' | 'failed';
  type: string;
  tone: string;
  scheduledDate?: number;
  sentDate?: number;
  sequenceIndex?: number;
  sequenceTotal?: number;
  opened?: boolean;
  openCount?: number;
}

export interface CompanyCampaignGroup {
  companyId: string;
  companyName: string;
  targetEmail: string;
  campaigns: EmailCampaign[];
  latestActivity: number;
  status: 'active' | 'completed' | 'pending';
}
