export interface ContactList {
  id: string;
  name: string;
  description: string;
  companyIds: string[]; // Companies appended to this list
  createdAt: number;
}

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
  municipality?: string;
  district?: string;
  category?: string;
  tags?: string[];
  customAttributes?: Record<string, string | number | boolean | null>;
}

export interface SavedSearch {
  id: string;
  query: string;
  email?: string;
  province?: string;
  municipality?: string;
  district?: string;
  sector?: string;
  timestamp: number;
  lastAccessed?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  urgency: 'low' | 'medium' | 'high';
  read: boolean;
  timestamp: number;
  searchId?: string;
  action?: {
    label: string;
    tab?: 'search' | 'saved' | 'history' | 'saved-searches' | 'campaigns';
    link?: string;
  };
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
  status: 'sent' | 'scheduled' | 'failed' | 'draft';
  type: string;
  tone: string;
  scheduledDate?: number;
  sentDate?: number;
  sequenceIndex?: number;
  sequenceTotal?: number;
  opened?: boolean;
  openCount?: number;
  clicked?: boolean;
  clickCount?: number;
}

export interface EmailSettings {
  provider: string;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  trackOpens: boolean;
  trackClicks: boolean;
}

export interface EmailBlock {
  id: string;
  type: 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'logo' | 'title' | 'social' | 'footer' | 'html';
  content: string;
  config: {
    padding?: string;
    backgroundColor?: string;
    color?: string;
    fontSize?: string;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    borderRadius?: string;
    url?: string;
    width?: string;
    height?: string;
    marginTop?: string;
    marginBottom?: string;
    lineHeight?: string;
    letterSpacing?: string;
    socialLinks?: { platform: string; url: string }[];
    borderTop?: string;
    borderBottom?: string;
  };
}

export interface EmailTemplateSettings {
  backgroundColor: string;
  contentBackgroundColor: string;
  contentWidth: string;
  defaultFontFamily: string;
  defaultFontSize: string;
  defaultTextColor: string;
  defaultLinkColor: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  blocks?: EmailBlock[];
  settings?: EmailTemplateSettings;
  createdAt: number;
  updatedAt: number;
}

export type WorkflowTriggerType = 'contact_added' | 'list_joined' | 'email_opened' | 'link_clicked' | 'custom_date' | 'tag_added' | 'attribute_match';
export type WorkflowNodeType = 
  | 'action_email' 
  | 'action_update_contact' 
  | 'action_add_tag' 
  | 'action_remove_tag' 
  | 'action_notify_admin'
  | 'action_webhook'
  | 'condition_opened' 
  | 'condition_clicked' 
  | 'condition_attribute'
  | 'delay'
  | 'wait_until';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  yesBranch?: WorkflowNode[];
  noBranch?: WorkflowNode[];
  stats?: {
    reached: number;
    processed: number;
  };
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'draft';
  trigger: {
    type: WorkflowTriggerType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config?: any;
  };
  steps: WorkflowNode[];
  createdAt: number;
  updatedAt: number;
  logs?: {
    timestamp: number;
    companyName: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }[];
  stats: {
    entered: number;
    completed: number;
    emailsSent?: number;
    emailsWaiting?: number;
  };
}

export interface CompanyCampaignGroup {
  companyId: string;
  companyName: string;
  targetEmail: string;
  campaigns: EmailCampaign[];
  latestActivity: number;
  status: 'active' | 'completed' | 'pending';
  stats: {
    sent: number;
    opened: number;
    openRate: number;
    clickRate?: number;
  };
  companyDetails?: Company;
}
