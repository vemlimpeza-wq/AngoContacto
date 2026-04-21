import { Injectable, signal, PLATFORM_ID, inject, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Company, SavedSearch, AppNotification, UserProfile, EmailCampaign, EmailSettings, AutomationWorkflow, EmailTemplate, ContactList } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly STORAGE_KEY = 'angocontacts_saved_companies';
  private readonly HISTORY_KEY = 'angocontacts_search_history';
  private readonly SAVED_SEARCHES_KEY = 'angocontacts_saved_searches';
  private readonly NOTIFICATIONS_KEY = 'angocontacts_notifications';
  private readonly USER_PROFILE_KEY = 'angocontacts_user_profile';
  private readonly CAMPAIGNS_KEY = 'angocontacts_email_campaigns';
  private readonly EMAIL_SETTINGS_KEY = 'angocontacts_email_settings';
  private readonly AUTOMATIONS_KEY = 'angocontacts_automations';
  private readonly TEMPLATES_KEY = 'angocontacts_email_templates';
  private readonly CONTACT_LISTS_KEY = 'angocontacts_contact_lists';
  
  savedCompanies = signal<Company[]>([]);
  searchHistory = signal<Company[]>([]);
  savedSearches = signal<SavedSearch[]>([]);
  notifications = signal<AppNotification[]>([]);
  userProfile = signal<UserProfile>({ senderName: '', senderCompany: '', objective: '' });
  campaigns = signal<EmailCampaign[]>([]);
  emailSettings = signal<EmailSettings | null>(null);
  automations = signal<AutomationWorkflow[]>([]);
  emailTemplates = signal<EmailTemplate[]>([]);
  contactLists = signal<ContactList[]>([]);
  
  activeTab = signal<'dashboard' | 'search' | 'saved' | 'history' | 'saved-searches' | 'campaigns' | 'automation' | 'reports' | 'settings' | 'templates'>('dashboard');

  unreadNotificationsCount = computed(() => this.notifications().filter(n => !n.read).length);
  
  activeToast = signal<{id: string, title: string, message: string, type: 'info' | 'success' | 'warning' | 'error'} | null>(null);

  showToast(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const id = crypto.randomUUID();
    this.activeToast.set({ id, title, message, type });
    // Duration based on message length, minimum 3.5s
    const duration = Math.max(3500, message.length * 80);
    setTimeout(() => {
      this.dismissToast(id);
    }, duration);
  }

  dismissToast(id: string) {
    const current = this.activeToast();
    if (current && current.id === id) {
      this.activeToast.set(null);
    }
  }

  private platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.load();
    }
  }

  private load() {
    if (!isPlatformBrowser(this.platformId)) return;
    
    this.loadItem<Company[]>(this.STORAGE_KEY, (data) => {
      const unique = this.removeDuplicates(data);
      const { cleaned } = this.sanitizeContactsList(unique);
      this.savedCompanies.set(cleaned);
      this.save();
    });

    this.loadItem<Company[]>(this.HISTORY_KEY, (data) => {
      const unique = this.removeDuplicates(data);
      const { cleaned } = this.sanitizeContactsList(unique);
      this.searchHistory.set(cleaned);
      this.saveHistory();
    });

    this.loadItem<SavedSearch[]>(this.SAVED_SEARCHES_KEY, (data) => this.savedSearches.set(data));
    this.loadItem<AppNotification[]>(this.NOTIFICATIONS_KEY, (data) => this.notifications.set(data));
    this.loadItem<UserProfile>(this.USER_PROFILE_KEY, (data) => this.userProfile.set(data));
    this.loadItem<EmailCampaign[]>(this.CAMPAIGNS_KEY, (data) => this.campaigns.set(data));
    this.loadItem<EmailSettings | null>(this.EMAIL_SETTINGS_KEY, (data) => this.emailSettings.set(data));
    this.loadItem<AutomationWorkflow[]>(this.AUTOMATIONS_KEY, (data) => this.automations.set(data));
    
    const templatesData = localStorage.getItem(this.TEMPLATES_KEY);
    if (templatesData) {
      try {
        this.emailTemplates.set(JSON.parse(templatesData));
      } catch (e) {
        console.error('Failed to load email templates', e);
      }
    } else {
      this.setInitialTemplates();
    }

    this.loadItem<ContactList[]>(this.CONTACT_LISTS_KEY, (data) => this.contactLists.set(data));

    this.checkOutdatedSearches();
  }

  private loadItem<T>(key: string, setter: (data: T) => void) {
    const data = localStorage.getItem(key);
    if (data) {
      try {
        setter(JSON.parse(data));
      } catch (e) {
        console.error(`Failed to load ${key}`, e);
      }
    }
  }

  private setInitialTemplates() {
    const defaults: EmailTemplate[] = [
      {
        id: 'tmpl-intro',
        name: 'Apresentação Comercial',
        subject: 'Proposta de Colaboração para {{name}}',
        body: 'Olá equipa da {{name}},\n\nTenho acompanhado o vosso crescimento no setor de {{sector}} e acredito que existe uma excelente oportunidade de sinergia entre as nossas empresas.\n\nGostaria de saber se teriam 10 minutos para uma breve chamada esta semana?\n\nMelhores cumprimentos,\n{{senderName}}',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'tmpl-followup',
        name: 'Follow-up (Lead Fria)',
        subject: 'Ainda interessados na {{senderCompany}}?',
        body: 'Olá,\n\nNotei que ainda não tivemos oportunidade de conversar sobre a proposta que enviei anteriormente.\n\nAcredito que as nossas ferramentas podem ser um diferencial para a {{name}} em {{province}}.\n\nAguardo o vosso contacto,\n{{senderName}}',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];
    this.emailTemplates.set(defaults);
    this.saveTemplates();
  }

  private checkOutdatedSearches() {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    this.savedSearches.update(searches => {
      return searches.map(search => {
        const lastAccessed = search.lastAccessed || search.timestamp;
        if (now - lastAccessed > THIRTY_DAYS_MS) {
          // Check if we already notified for this search recently to avoid spam
          const notifKey = `notified_${search.id}`;
          const lastNotified = localStorage.getItem(notifKey);
          
          if (!lastNotified || (now - parseInt(lastNotified, 10) > THIRTY_DAYS_MS)) {
            this.addNotification(
              'Pesquisa Desatualizada',
              `A sua pesquisa por "${search.query}" não é atualizada há mais de 30 dias. Sugerimos que a refaça para obter novos resultados.`,
              'warning',
              'medium',
              search.id,
              { label: 'Ver Pesquisas', tab: 'saved-searches' }
            );
            localStorage.setItem(notifKey, now.toString());
          }
        }
        return search;
      });
    });
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
        const normalizedMobile = newMobile.replace(/[\s\-()]+/g, '');
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
        const normalizedLandline = newLandline.replace(/[\s\-()]+/g, '');
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

  saveAutomations(automations: AutomationWorkflow[]) {
    this.automations.set(automations);
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.AUTOMATIONS_KEY, JSON.stringify(this.automations()));
  }

  addNotification(
    title: string, 
    message: string, 
    type: 'info' | 'warning' | 'success' | 'error' = 'info', 
    urgency: 'low' | 'medium' | 'high' = 'low',
    searchId?: string,
    action?: { label: string; tab?: 'search' | 'saved' | 'history' | 'saved-searches' | 'campaigns'; link?: string }
  ) {
    const newNotif: AppNotification = {
      id: crypto.randomUUID(),
      title,
      message,
      type,
      urgency,
      read: false,
      timestamp: Date.now(),
      searchId,
      action
    };
    this.notifications.update(list => {
      const newList = [newNotif, ...list];
      return newList.slice(0, 20); // Reduced from 50 to 20 for memory efficiency
    });
    this.saveNotifications();

    // Automatically show toast for significant notifications
    if (type !== 'info' || urgency === 'high') {
      this.showToast(title, message, type);
    }
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

  saveCompanies(companies: Company[]) {
    this.savedCompanies.set(companies);
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
           // Use lighter data: Only store essential fields in history
           const lighterCompany: Company = {
             id: company.id,
             name: company.name,
             sector: company.sector,
             province: company.province,
             emails: (company.emails || []).slice(0, 1),
             landlinePhone: company.landlinePhone,
             mobilePhone: company.mobilePhone,
             address: company.address || '',
             socialMedia: company.socialMedia || [],
             description: company.description || ''
           };
           newHistory.push(lighterCompany);
           addedCount++;
        }
      }
      return newHistory.slice(-50); // Keep only last 50 to free memory
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
      timestamp: Date.now(),
      lastAccessed: Date.now()
    };
    this.savedSearches.update(list => [newSearch, ...list]);
    this.saveSearches();
  }

  updateSavedSearchAccess(searchId: string) {
    this.savedSearches.update(list => list.map(s => 
      s.id === searchId ? { ...s, lastAccessed: Date.now() } : s
    ));
    this.saveSearches();
  }

  removeSavedSearch(searchId: string) {
    this.savedSearches.update(list => list.filter(s => s.id !== searchId));
    this.saveSearches();
  }

  saveUserProfile(profile: UserProfile) {
    this.userProfile.set(profile);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.USER_PROFILE_KEY, JSON.stringify(profile));
    }
  }

  addCampaign(campaign: EmailCampaign) {
    this.campaigns.update(list => [campaign, ...list]);
    this.saveCampaigns();
  }

  updateCampaignStatus(id: string, status: 'sent' | 'scheduled' | 'failed', dateField?: 'sentDate' | 'scheduledDate', dateValue?: number) {
    this.campaigns.update(list => list.map(c => {
      if (c.id === id) {
        const updated = { ...c, status };
        if (dateField && dateValue) {
          updated[dateField] = dateValue;
        }
        return updated;
      }
      return c;
    }));
    this.saveCampaigns();
  }

  removeCampaign(id: string) {
    this.campaigns.update(list => list.filter(c => c.id !== id));
    this.saveCampaigns();
  }

  removeCampaignGroup(companyId: string) {
    this.campaigns.update(list => list.filter(c => c.companyId !== companyId));
    this.saveCampaigns();
  }

  removeCompletedCampaigns() {
    this.campaigns.update(list => {
      // First identify which companies have ONLY 'sent' campaigns
      const groups = new Map<string, EmailCampaign[]>();
      list.forEach(c => {
        if (!groups.has(c.companyId)) groups.set(c.companyId, []);
        groups.get(c.companyId)!.push(c);
      });

      const idsToRemove = new Set<string>();
      groups.forEach((campaigns, companyId) => {
        const allSent = campaigns.every(c => c.status === 'sent');
        if (allSent) {
          idsToRemove.add(companyId);
        }
      });

      return list.filter(c => !idsToRemove.has(c.companyId));
    });
    this.saveCampaigns();
  }

  trackCampaignInteraction(id: string, type: 'opened' | 'clicked') {
    this.campaigns.update(list => list.map(c => {
      if (c.id === id) {
        if (type === 'opened') {
          return { ...c, opened: true, openCount: (c.openCount || 0) + 1 };
        } else {
          return { ...c, clicked: true, clickCount: (c.clickCount || 0) + 1 };
        }
      }
      return c;
    }));
    this.saveCampaigns();
  }

  private saveCampaigns() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.CAMPAIGNS_KEY, JSON.stringify(this.campaigns()));
    }
  }

  saveEmailSettings(settings: EmailSettings) {
    this.emailSettings.set(settings);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.EMAIL_SETTINGS_KEY, JSON.stringify(settings));
    }
  }

  saveTemplate(template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>, id?: string) {
    const now = Date.now();
    if (id) {
      this.emailTemplates.update(list => list.map(t => 
        t.id === id ? { ...t, ...template, updatedAt: now } : t
      ));
    } else {
      const newTemplate: EmailTemplate = {
        ...template,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now
      };
      this.emailTemplates.update(list => [newTemplate, ...list]);
    }
    this.saveTemplates();
  }

  deleteTemplate(id: string) {
    this.emailTemplates.update(list => list.filter(t => t.id !== id));
    this.saveTemplates();
  }

  private saveTemplates() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.TEMPLATES_KEY, JSON.stringify(this.emailTemplates()));
    }
  }

  // --- Contact Lists Management ---
  saveContactList(name: string, description: string, companyIds: string[] = []) {
    const newList: ContactList = {
      id: crypto.randomUUID(),
      name,
      description,
      companyIds,
      createdAt: Date.now()
    };
    this.contactLists.update(lists => [...lists, newList]);
    this.persistContactLists();
    return newList.id;
  }

  updateContactList(id: string, partial: Partial<ContactList>) {
    this.contactLists.update(lists => lists.map(l => l.id === id ? { ...l, ...partial } : l));
    this.persistContactLists();
  }

  deleteContactList(id: string) {
    this.contactLists.update(lists => lists.filter(l => l.id !== id));
    this.persistContactLists();
  }

  addCompanyToList(listId: string, companyId: string) {
    this.addCompaniesToList(listId, [companyId]);
  }

  addCompaniesToList(listId: string, companyIds: string[]) {
    this.contactLists.update(lists => lists.map(l => {
      if (l.id === listId) {
        const newIds = [...l.companyIds];
        let changed = false;
        companyIds.forEach(id => {
          if (!newIds.includes(id)) {
            newIds.push(id);
            changed = true;
          }
        });
        return changed ? { ...l, companyIds: newIds } : l;
      }
      return l;
    }));
    this.persistContactLists();
  }

  removeCompanyFromList(listId: string, companyId: string) {
    this.contactLists.update(lists => lists.map(l => {
      if (l.id === listId) {
        return { ...l, companyIds: l.companyIds.filter(id => id !== companyId) };
      }
      return l;
    }));
    this.persistContactLists();
  }

  private persistContactLists() {
    if (isPlatformBrowser(this.platformId)) {
      const data = JSON.stringify(this.contactLists());
      localStorage.setItem(this.CONTACT_LISTS_KEY, data);
      // Create a specific backup key as well
      localStorage.setItem('angocontacts_contact_lists_backup', data);
    }
  }

  saveContactLists(lists: ContactList[]) {
    this.contactLists.set(lists);
    this.persistContactLists();
  }

  /**
   * Performance helper: Clear old data to free memory
   * @param force - If true, performs a more aggressive cleanup
   */
  clearOldData(force = false) {
    // Keep only last N notifications
    const notifyLimit = force ? 5 : 10;
    this.notifications.update(n => n.slice(0, notifyLimit));
    this.saveNotifications();
    
    // Clear search history
    const historyLimit = force ? 5 : 20;
    this.searchHistory.update(h => h.slice(-historyLimit));
    this.saveHistory();

    // Clear old logs in automations
    const logLimit = force ? 0 : 10;
    this.automations.update(wf => wf.map(a => ({
      ...a,
      logs: (a.logs || []).slice(0, logLimit)
    })));
    this.saveAutomations(this.automations());

    if (force) {
      // Clear specific cache values if any (though currently mostly signal based)
      // This is a placeholder for future cache clearing logic
      console.log('Aggressive memory cleanup performed');
    }
  }

  /**
   * Heavy loops avoidance: Log the search query purely for diagnostic purposes
   */
  public addQueryToLog(query: string, resultsCount: number) {
    // This is a separate concept from search history which stores actual companies
    console.log(`Search performed: "${query}" returned ${resultsCount} results.`);
  }
}
