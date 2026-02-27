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
}

export interface SavedSearch {
  id: string;
  query: string;
  email?: string;
  province?: string;
  sector?: string;
  timestamp: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  read: boolean;
  timestamp: number;
}
