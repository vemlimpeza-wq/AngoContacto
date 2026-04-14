import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { GeminiService } from './services/gemini.service';
import { StorageService } from './services/storage.service';
import { ExportService } from './services/export.service';
import { Company, SavedSearch, AppNotification, CompanyCampaignGroup } from './models/company.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private fb = inject(FormBuilder);
  private geminiService = inject(GeminiService);
  public storageService = inject(StorageService);
  private exportService = inject(ExportService);
  public sanitizer = inject(DomSanitizer);

  searchForm = this.fb.group({
    query: ['', Validators.required],
    email: ['', [Validators.email]],
    province: [''],
    sector: ['']
  });

  provinces = [
    'Bengo', 'Benguela', 'Bié', 'Cabinda', 'Quando Cubango', 'Cuanza Norte',
    'Cuanza Sul', 'Cunene', 'Huambo', 'Huíla', 'Luanda', 'Lunda Norte',
    'Lunda Sul', 'Malanje', 'Moxico', 'Namibe', 'Uíge', 'Zaire'
  ];

  sectors = [
    'Agricultura', 'Comércio', 'Construção', 'Educação', 'Energia',
    'Finanças', 'Indústria', 'Logística', 'Saúde', 'Tecnologia', 'Turismo'
  ];

  searchSuggestions = computed(() => {
    const saved = this.storageService.savedSearches().map(s => s.query);
    const popular = this.sectors;
    return Array.from(new Set([...saved, ...popular])).slice(0, 15);
  });

  searchResults = signal<Company[]>([]);
  isLoading = signal<boolean>(false);
  activeTab = signal<'search' | 'saved' | 'history' | 'saved-searches' | 'campaigns'>('search');
  isNotificationsOpen = signal<boolean>(false);

  // Email Composer State
  isEmailModalOpen = signal<boolean>(false);
  currentEmailCompany = signal<Company | null>(null);
  isGeneratingEmail = signal<boolean>(false);
  generatedEmailSubject = signal<string>('');
  generatedEmailBody = signal<string>('');
  
  emailForm = this.fb.group({
    objective: ['', Validators.required],
    senderName: ['', Validators.required],
    senderCompany: ['', Validators.required],
    senderWebsite: [''],
    type: ['Prospecção Fria', Validators.required],
    tone: ['Profissional e Persuasivo', Validators.required],
    primaryColor: ['#0A192F'],
    secondaryColor: ['#F8FAFC']
  });

  scheduleDatetime = signal<string>('');
  emailPreviewMode = signal<'visual' | 'code'>('visual');
  isEmailPreviewExpanded = signal<boolean>(false);
  emailGenerationMode = signal<'single' | 'sequence'>('single');
  generatedEmailSequence = signal<Array<{subject: string, body: string, delayDays: number}>>([]);
  emailsSentCount = computed(() => {
    const company = this.currentEmailCompany();
    if (!company) return 0;
    return this.storageService.campaigns().filter(c => c.companyId === company.id && c.status === 'sent').length;
  });
  safeEmailBody = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.generatedEmailBody()));

  groupedCampaigns = computed(() => {
    const campaigns = this.storageService.campaigns();
    const groups = new Map<string, CompanyCampaignGroup>();

    campaigns.forEach(c => {
      if (!groups.has(c.companyId)) {
        groups.set(c.companyId, {
          companyId: c.companyId,
          companyName: c.companyName,
          targetEmail: c.targetEmail,
          campaigns: [],
          latestActivity: 0,
          status: 'pending'
        });
      }
      const group = groups.get(c.companyId)!;
      group.campaigns.push(c);
      
      const activityDate = c.sentDate || c.scheduledDate || 0;
      if (activityDate > group.latestActivity) {
        group.latestActivity = activityDate;
      }
    });

    return Array.from(groups.values()).map(group => {
      group.campaigns.sort((a, b) => {
        if (a.sequenceIndex && b.sequenceIndex) {
          return a.sequenceIndex - b.sequenceIndex;
        }
        const dateA = a.scheduledDate || a.sentDate || 0;
        const dateB = b.scheduledDate || b.sentDate || 0;
        return dateA - dateB;
      });

      const allSent = group.campaigns.every(c => c.status === 'sent');
      const anyScheduled = group.campaigns.some(c => c.status === 'scheduled');
      group.status = allSent ? 'completed' : (anyScheduled ? 'active' : 'pending');

      return group;
    }).sort((a, b) => b.latestActivity - a.latestActivity);
  });

  savedSortColumn = signal<'name' | 'province' | 'sector' | 'category' | null>(null);
  savedSortDirection = signal<'asc' | 'desc'>('asc');

  historySortColumn = signal<'name' | 'province' | 'sector' | 'category' | null>(null);
  historySortDirection = signal<'asc' | 'desc'>('asc');

  ngOnInit() {
    this.checkOutdatedSearches();
    const profile = this.storageService.userProfile();
    if (profile) {
      this.emailForm.patchValue({
        objective: profile.objective || '',
        senderName: profile.senderName || '',
        senderCompany: profile.senderCompany || '',
        senderWebsite: profile.senderWebsite || '',
        primaryColor: profile.primaryColor || '#0A192F',
        secondaryColor: profile.secondaryColor || '#F8FAFC'
      });
    }
  }

  toggleNotifications() {
    this.isNotificationsOpen.update(v => !v);
  }

  checkOutdatedSearches() {
    const searches = this.storageService.savedSearches();
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    
    searches.forEach(search => {
      if (now - search.timestamp > SEVEN_DAYS) {
        const hasNotif = this.storageService.notifications().some(n => 
          n.message.includes(`"${search.query}"`) && n.type === 'warning'
        );
        if (!hasNotif) {
          this.storageService.addNotification(
            'Pesquisa Desatualizada', 
            `A sua pesquisa guardada "${search.query}" não é atualizada há mais de 7 dias. Considere refazê-la para obter novos resultados.`, 
            'warning'
          );
        }
      }
    });
  }

  sortedSavedCompanies = computed(() => {
    const companies = [...this.storageService.savedCompanies()];
    const col = this.savedSortColumn();
    const dir = this.savedSortDirection() === 'asc' ? 1 : -1;
    if (!col) return companies;
    return companies.sort((a, b) => {
      const valA = (a[col] || '').toLowerCase();
      const valB = (b[col] || '').toLowerCase();
      return valA.localeCompare(valB) * dir;
    });
  });

  sortedHistoryCompanies = computed(() => {
    const companies = [...this.storageService.searchHistory()];
    const col = this.historySortColumn();
    const dir = this.historySortDirection() === 'asc' ? 1 : -1;
    if (!col) return companies;
    return companies.sort((a, b) => {
      const valA = (a[col] || '').toLowerCase();
      const valB = (b[col] || '').toLowerCase();
      return valA.localeCompare(valB) * dir;
    });
  });

  sortSaved(column: 'name' | 'province' | 'sector' | 'category') {
    if (this.savedSortColumn() === column) {
      this.savedSortDirection.set(this.savedSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.savedSortColumn.set(column);
      this.savedSortDirection.set('asc');
    }
  }

  sortHistory(column: 'name' | 'province' | 'sector' | 'category') {
    if (this.historySortColumn() === column) {
      this.historySortDirection.set(this.historySortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.historySortColumn.set(column);
      this.historySortDirection.set('asc');
    }
  }

  async onSearch() {
    if (this.searchForm.invalid) return;

    this.isLoading.set(true);
    this.searchResults.set([]);

    const { query, email, province, sector } = this.searchForm.value;

    try {
      let results = await this.geminiService.searchCompanies(
        query || '',
        province || undefined,
        sector || undefined,
        email || undefined
      );

      const { cleaned: cleanedResults, removedCount: removedFromResults } = this.storageService.sanitizeContactsList(results);
      results = cleanedResults;

      this.searchResults.set(results);

      if (results.length > 0) {
        const addedCount = this.storageService.addToHistory(results);
        const removedFromHistory = this.storageService.cleanHistory();
        
        const totalRemoved = removedFromResults + removedFromHistory;

        if (addedCount > 0) {
          const searchName = query || sector || province || 'sua pesquisa';
          this.storageService.addNotification(
            'Novas Empresas Encontradas', 
            `Encontrámos ${addedCount} novas empresas para "${searchName}".`, 
            'success'
          );
        }

        if (totalRemoved > 0) {
          this.storageService.addNotification(
            'Contactos Duplicados', 
            `Foram eliminados ${totalRemoved} contactos (emails/telefones) duplicados.`, 
            'info'
          );
        }
      }
    } catch (error: unknown) {
      console.error('Search failed', error);
      
      let errorMessage = 'Ocorreu um erro ao realizar a pesquisa. Por favor, tente novamente mais tarde.';
      
      if (error instanceof Error) {
        if (error.message.includes('429') || error.message.includes('quota')) {
          errorMessage = 'Limite de pesquisas atingido. Por favor, aguarde um momento antes de tentar novamente ou verifique o seu plano.';
        }
      } else if (typeof error === 'object' && error !== null) {
        const errObj = error as Record<string, unknown>;
        if (errObj['status'] === 'RESOURCE_EXHAUSTED') {
          errorMessage = 'Limite de pesquisas atingido. Por favor, aguarde um momento antes de tentar novamente ou verifique o seu plano.';
        }
      }
      
      this.storageService.addNotification(
        'Erro na Pesquisa', 
        errorMessage, 
        'warning'
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  saveCurrentSearch() {
    if (this.searchForm.invalid) return;
    const { query, email, province, sector } = this.searchForm.value;
    this.storageService.saveSearch({
      query: query || '',
      email: email || undefined,
      province: province || undefined,
      sector: sector || undefined
    });
  }

  loadSavedSearch(search: SavedSearch) {
    this.searchForm.patchValue({
      query: search.query,
      email: search.email || '',
      province: search.province || '',
      sector: search.sector || ''
    });
    this.storageService.updateSavedSearchAccess(search.id);
    this.activeTab.set('search');
    this.onSearch();
  }

  removeSavedSearch(id: string) {
    this.storageService.removeSavedSearch(id);
  }

  redoSearchFromNotification(notif: AppNotification) {
    if (!notif.searchId) return;
    
    const search = this.storageService.savedSearches().find(s => s.id === notif.searchId);
    if (search) {
      this.storageService.markNotificationAsRead(notif.id);
      this.isNotificationsOpen.set(false);
      this.loadSavedSearch(search);
    } else {
      // If search was deleted, just remove the notification
      this.storageService.removeNotification(notif.id);
    }
  }

  saveCompany(company: Company) {
    this.storageService.addCompany(company);
    const removedCount = this.storageService.cleanSavedCompanies();
    if (removedCount > 0) {
      this.storageService.addNotification(
        'Contactos Duplicados', 
        `Foram eliminados ${removedCount} contactos duplicados ao guardar.`, 
        'info'
      );
    }
  }

  removeSavedCompany(companyId: string) {
    this.storageService.removeCompany(companyId);
  }

  isSaved(companyName: string): boolean {
    return this.storageService.isSaved(companyName);
  }

  exportCSV() {
    const { cleaned, removedCount } = this.storageService.sanitizeContactsList(this.storageService.savedCompanies());
    if (removedCount > 0) {
      this.storageService.addNotification('Exportação Limpa', `Foram eliminados ${removedCount} contactos duplicados antes da exportação.`, 'info');
    }
    this.exportService.exportToCSV(cleaned);
  }

  exportExcel() {
    const { cleaned, removedCount } = this.storageService.sanitizeContactsList(this.storageService.savedCompanies());
    if (removedCount > 0) {
      this.storageService.addNotification('Exportação Limpa', `Foram eliminados ${removedCount} contactos duplicados antes da exportação.`, 'info');
    }
    this.exportService.exportToExcel(cleaned);
  }

  exportSearchResultsExcel() {
    const { cleaned, removedCount } = this.storageService.sanitizeContactsList(this.searchResults());
    if (removedCount > 0) {
      this.storageService.addNotification('Exportação Limpa', `Foram eliminados ${removedCount} contactos duplicados antes da exportação.`, 'info');
    }
    this.exportService.exportToExcel(cleaned, 'angocontacts_pesquisa.xlsx');
  }

  exportPDF() {
    const { cleaned, removedCount } = this.storageService.sanitizeContactsList(this.storageService.savedCompanies());
    if (removedCount > 0) {
      this.storageService.addNotification('Exportação Limpa', `Foram eliminados ${removedCount} contactos duplicados antes da exportação.`, 'info');
    }
    this.exportService.exportToPDF(cleaned);
  }

  // Email Composer Logic
  openEmailModal(company: Company) {
    this.currentEmailCompany.set(company);
    this.generatedEmailSubject.set('');
    this.generatedEmailBody.set('');
    this.generatedEmailSequence.set([]);
    this.emailGenerationMode.set('single');
    this.isEmailPreviewExpanded.set(false);
    
    // Set default schedule datetime to tomorrow 09:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    // Format to YYYY-MM-DDThh:mm
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(tomorrow.getTime() - tzOffset)).toISOString().slice(0, 16);
    this.scheduleDatetime.set(localISOTime);
    
    this.isEmailModalOpen.set(true);
  }

  closeEmailModal() {
    this.isEmailModalOpen.set(false);
    this.currentEmailCompany.set(null);
  }

  async generateEmail() {
    if (this.emailForm.invalid || !this.currentEmailCompany()) return;
    
    this.isGeneratingEmail.set(true);
    const formVals = this.emailForm.value;
    
    // Save profile for future use
    this.storageService.saveUserProfile({
      objective: formVals.objective || '',
      senderName: formVals.senderName || '',
      senderCompany: formVals.senderCompany || '',
      senderWebsite: formVals.senderWebsite || '',
      primaryColor: formVals.primaryColor || '#0A192F',
      secondaryColor: formVals.secondaryColor || '#F8FAFC'
    });

    try {
      if (this.emailGenerationMode() === 'sequence') {
        const sequence = await this.geminiService.generateEmailSequence(
          this.currentEmailCompany()!,
          formVals.objective || '',
          formVals.senderName || '',
          formVals.senderCompany || '',
          formVals.senderWebsite || '',
          formVals.tone || '',
          formVals.primaryColor || '#0A192F',
          formVals.secondaryColor || '#F8FAFC'
        );
        this.generatedEmailSequence.set(sequence);
        if (sequence.length > 0) {
          this.generatedEmailSubject.set(sequence[0].subject);
          this.generatedEmailBody.set(sequence[0].body);
        }
      } else {
        const result = await this.geminiService.generateProspectingEmail(
          this.currentEmailCompany()!,
          formVals.objective || '',
          formVals.senderName || '',
          formVals.senderCompany || '',
          formVals.senderWebsite || '',
          formVals.type || '',
          formVals.tone || '',
          formVals.primaryColor || '#0A192F',
          formVals.secondaryColor || '#F8FAFC'
        );
        this.generatedEmailSubject.set(result.subject);
        this.generatedEmailBody.set(result.body);
        this.generatedEmailSequence.set([]);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.storageService.addNotification('Erro ao gerar email', msg, 'warning');
    } finally {
      this.isGeneratingEmail.set(false);
    }
  }

  updateEmailBody(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    this.generatedEmailBody.set(el.value);
  }

  updateEmailSubject(event: Event) {
    const el = event.target as HTMLInputElement;
    this.generatedEmailSubject.set(el.value);
  }

  copyHtmlToClipboard() {
    const html = this.generatedEmailBody();
    if (!html) return;
    
    navigator.clipboard.writeText(html).then(() => {
      this.storageService.addNotification('Copiado', 'O código HTML do email foi copiado para a área de transferência.', 'success');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      this.storageService.addNotification('Erro', 'Não foi possível copiar o HTML.', 'warning');
    });
  }

  sendEmailNow() {
    const company = this.currentEmailCompany();
    if (!company) return;

    const subject = this.generatedEmailSubject();
    const body = this.generatedEmailBody();
    const targetEmail = company.emails.length > 0 ? company.emails[0] : '';

    // Create a mailto link (stripping HTML tags for plain text fallback)
    const plainTextBody = body.replace(/<[^>]*>?/gm, '');
    const mailtoLink = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainTextBody)}`;
    window.open(mailtoLink, '_blank');

    // Save campaign as sent
    this.storageService.addCampaign({
      id: crypto.randomUUID(),
      companyId: company.id,
      companyName: company.name,
      targetEmail,
      subject,
      body,
      status: 'sent',
      type: this.emailForm.value.type || '',
      tone: this.emailForm.value.tone || '',
      sentDate: Date.now()
    });

    this.storageService.addNotification('Email Enviado', `Email para ${company.name} registado como enviado.`, 'success');
    this.closeEmailModal();
  }

  updateScheduleDatetime(event: Event) {
    const el = event.target as HTMLInputElement;
    this.scheduleDatetime.set(el.value);
  }

  scheduleEmail() {
    const company = this.currentEmailCompany();
    if (!company) return;

    const targetEmail = company.emails.length > 0 ? company.emails[0] : '';
    const baseScheduledDate = new Date(this.scheduleDatetime()).getTime();
    
    if (this.emailGenerationMode() === 'sequence' && this.generatedEmailSequence().length > 0) {
      const sequence = this.generatedEmailSequence();
      sequence.forEach((email, index) => {
        const scheduledDate = baseScheduledDate + (email.delayDays * 24 * 60 * 60 * 1000);
        this.storageService.addCampaign({
          id: crypto.randomUUID(),
          companyId: company.id,
          companyName: company.name,
          targetEmail,
          subject: email.subject,
          body: email.body,
          status: 'scheduled',
          type: 'Sequência de Prospecção',
          tone: this.emailForm.value.tone || '',
          scheduledDate,
          sequenceIndex: index + 1,
          sequenceTotal: sequence.length
        });
      });
      this.storageService.addNotification('Sequência Agendada', `Foram agendados ${sequence.length} emails para ${company.name}.`, 'success');
    } else {
      const subject = this.generatedEmailSubject();
      const body = this.generatedEmailBody();
      this.storageService.addCampaign({
        id: crypto.randomUUID(),
        companyId: company.id,
        companyName: company.name,
        targetEmail,
        subject,
        body,
        status: 'scheduled',
        type: this.emailForm.value.type || '',
        tone: this.emailForm.value.tone || '',
        scheduledDate: baseScheduledDate
      });
      const formattedDate = new Date(baseScheduledDate).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
      this.storageService.addNotification('Email Agendado', `Email para ${company.name} agendado para ${formattedDate}.`, 'success');
    }

    this.closeEmailModal();
  }
}
