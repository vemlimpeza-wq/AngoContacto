import { Injectable, signal, PLATFORM_ID, inject, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Company, SavedSearch, AppNotification } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly STORAGE_KEY = 'angocontacts_saved_companies';
  private readonly HISTORY_KEY = 'angocontacts_search_history';
  private readonly SAVED_SEARCHES_KEY = 'angocontacts_saved_searches';
  private readonly NOTIFICATIONS_KEY = 'angocontacts_notifications';
  
  savedCompanies = signal<Company[]>([]);
  searchHistory = signal<Company[]>([]);
  savedSearches = signal<SavedSearch[]>([]);
  notifications = signal<AppNotification[]>([]);
  
  unreadNotificationsCount = computed(() => this.notifications().filter(n => !n.read).length);

  private platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.load();
    }
  }

  private load() {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const savedData = localStorage.getItem(this.STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const uniqueCompanies = this.removeDuplicates(parsed);
        const { cleaned } = this.sanitizeContactsList(uniqueCompanies);
        this.savedCompanies.set(cleaned);
        this.save(); // Save back cleaned data
      } catch (e) {
        console.error('Failed to load saved companies', e);
      }
    }

    const historyData = localStorage.getItem(this.HISTORY_KEY);
    if (historyData) {
      try {
        const parsed = JSON.parse(historyData);
        const uniqueCompanies = this.removeDuplicates(parsed);
        const { cleaned } = this.sanitizeContactsList(uniqueCompanies);
        this.searchHistory.set(cleaned);
        this.saveHistory(); // Save back cleaned data
      } catch (e) {
        console.error('Failed to load search history', e);
      }
    }

    const savedSearchesData = localStorage.getItem(this.SAVED_SEARCHES_KEY);
    if (savedSearchesData) {
      try {
        this.savedSearches.set(JSON.parse(savedSearchesData));
      } catch (e) {
        console.error('Failed to load saved searches', e);
      }
    }

    const notifData = localStorage.getItem(this.NOTIFICATIONS_KEY);
    if (notifData) {
      try {
        this.notifications.set(JSON.parse(notifData));
      } catch (e) {
        console.error('Failed to load notifications', e);
      }
    }
  }

  private normalizeName(name: string): string {
    return (name || '').trim().toLowerCase();
  }

  private removeDuplicates(companies: Company[]): Company[] {
    const seen = new Set<string>();
    const unique: Company[] = [];
    for (const company of companies) {
      const normalized = this.normalizeName(company.name);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(company);
      }
    }
    return unique;
  }

  sanitizeContactsList(companies: Company[]): { cleaned: Company[], removedCount: number } {
    let removedCount = 0;
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    const cleaned = companies.map(company => {
      const newCompany = { ...company, emails: [] as string[] };
      
      for (const email of company.emails || []) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) continue;
        if (seenEmails.has(normalizedEmail)) {
          removedCount++;
        } else {
          seenEmails.add(normalizedEmail);
          newCompany.emails.push(email.trim());
        }
      }

      let newMobile = company.mobilePhone?.trim();
      if (newMobile) {
        const normalizedMobile = newMobile.replace(/[\s\-\(\)]+/g, '');
        if (seenPhones.has(normalizedMobile)) {
          newMobile = undefined;
          removedCount++;
        } else {
          seenPhones.add(normalizedMobile);
        }
      }
      newCompany.mobilePhone = newMobile;

      let newLandline = company.landlinePhone?.trim();
      if (newLandline) {
        const normalizedLandline = newLandline.replace(/[\s\-\(\)]+/g, '');
        if (seenPhones.has(normalizedLandline)) {
          newLandline = undefined;
          removedCount++;
        } else {
          seenPhones.add(normalizedLandline);
        }
      }
      newCompany.landlinePhone = newLandline;

      return newCompany;
    });

    return { cleaned, removedCount };
  }

  cleanSavedCompanies(): number {
    const { cleaned, removedCount } = this.sanitizeContactsList(this.savedCompanies());
    if (removedCount > 0) {
      this.savedCompanies.set(cleaned);
      this.save();
    }
    return removedCount;
  }

  cleanHistory(): number {
    const { cleaned, removedCount } = this.sanitizeContactsList(this.searchHistory());
    if (removedCount > 0) {
      this.searchHistory.set(cleaned);
      this.saveHistory();
    }
    return removedCount;
  }

  private save() {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.savedCompanies()));
  }

  private saveHistory() {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(this.searchHistory()));
  }

  private saveSearches() {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.SAVED_SEARCHES_KEY, JSON.stringify(this.savedSearches()));
  }

  private saveNotifications() {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(this.notifications()));
  }

  addNotification(title: string, message: string, type: 'info' | 'warning' | 'success' = 'info') {
    const newNotif: AppNotification = {
      id: crypto.randomUUID(),
      title,
      message,
      type,
      read: false,
      timestamp: Date.now()
    };
    this.notifications.update(list => [newNotif, ...list]);
    this.saveNotifications();
  }

  markNotificationAsRead(id: string) {
    this.notifications.update(list => list.map(n => n.id === id ? { ...n, read: true } : n));
    this.saveNotifications();
  }

  markAllNotificationsAsRead() {
    this.notifications.update(list => list.map(n => ({ ...n, read: true })));
    this.saveNotifications();
  }

  removeNotification(id: string) {
    this.notifications.update(list => list.filter(n => n.id !== id));
    this.saveNotifications();
  }

  addCompany(company: Company) {
    const current = this.savedCompanies();
    const normalizedNewName = this.normalizeName(company.name);
    if (!current.find(c => this.normalizeName(c.name) === normalizedNewName)) {
      this.savedCompanies.update(list => [...list, company]);
      this.save();
    }
  }

  removeCompany(companyId: string) {
    this.savedCompanies.update(list => list.filter(c => c.id !== companyId));
    this.save();
  }

  isSaved(companyName: string): boolean {
    const normalizedName = this.normalizeName(companyName);
    return !!this.savedCompanies().find(c => this.normalizeName(c.name) === normalizedName);
  }

  addToHistory(companies: Company[]): number {
    let addedCount = 0;
    this.searchHistory.update(current => {
      const newHistory = [...current];
      for (const company of companies) {
        const normalizedNewName = this.normalizeName(company.name);
        if (!newHistory.find(c => this.normalizeName(c.name) === normalizedNewName)) {
          newHistory.push(company);
          addedCount++;
        }
      }
      return newHistory;
    });
    this.saveHistory();
    return addedCount;
  }

  clearHistory() {
    this.searchHistory.set([]);
    this.saveHistory();
  }

  saveSearch(search: Omit<SavedSearch, 'id' | 'timestamp'>) {
    const newSearch: SavedSearch = {
      ...search,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };
    this.savedSearches.update(list => [newSearch, ...list]);
    this.saveSearches();
  }

  removeSavedSearch(searchId: string) {
    this.savedSearches.update(list => list.filter(s => s.id !== searchId));
    this.saveSearches();
  }
}
