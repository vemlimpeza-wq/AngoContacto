import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DomSanitizer } from '@angular/platform-browser';
import { GeminiService } from './services/gemini.service';
import { StorageService } from './services/storage.service';
import { ExportService } from './services/export.service';
import { EmailService } from './services/email.service';
import { AutomationEngineService } from './services/automation-engine.service';
import { Company, SavedSearch, AppNotification, CompanyCampaignGroup, EmailSettings, AutomationWorkflow, EmailTemplate, EmailBlock, EmailTemplateSettings } from './models/company.model';
import { AutomationChart } from './automation-chart';
import { ToastContainer } from './components/toast-container';
import { Sidebar } from './components/sidebar';

import { AutomationPanel } from './components/automation-panel';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, DragDropModule, AutomationChart, ToastContainer, Sidebar, AutomationPanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private fb = inject(FormBuilder);
  private geminiService = inject(GeminiService);
  public storageService = inject(StorageService);
  private exportService = inject(ExportService);
  private emailService = inject(EmailService);
  public sanitizer = inject(DomSanitizer);
  public automationEngine = inject(AutomationEngineService);

  templateForm = this.fb.group({
    name: ['', Validators.required],
    subject: ['', Validators.required]
  });
  editingTemplateId = signal<string | null>(null);
  templateToDeleteId = signal<string | null>(null);
  isTemplateModalOpen = signal(false);
  builderSidebarTab = signal<'blocks' | 'settings'>('blocks');
  previewDevice = signal<'desktop' | 'mobile'>('desktop');
  
  templateSearchQuery = signal<string>('');
  filteredTemplates = computed(() => {
    const query = this.templateSearchQuery().toLowerCase().trim();
    const templates = this.storageService.emailTemplates();
    if (!query) return templates;
    return templates.filter(t => 
      t.name.toLowerCase().includes(query) || 
      t.subject.toLowerCase().includes(query)
    );
  });

  emailBlocks = signal<EmailBlock[]>([]);
  templateSettings = signal<EmailTemplateSettings>({
    backgroundColor: '#F8FAFC',
    contentBackgroundColor: '#FFFFFF',
    contentWidth: '600px',
    defaultFontFamily: 'Arial, sans-serif',
    defaultFontSize: '16px',
    defaultTextColor: '#334155',
    defaultLinkColor: '#6366f1'
  });

  selectedBlockId = signal<string | null>(null);
  selectedBlock = computed(() => this.emailBlocks().find(b => b.id === this.selectedBlockId()));

  aiPrompt = signal('');
  isGeneratingAI = signal(false);
  isRefiningTemplateAI = signal(false);
  templateRefineInstruction = signal('');
  aiContextCompanyId = signal<string | null>(null);
  aiContextCompany = computed(() => this.storageService.savedCompanies().find(c => c.id === this.aiContextCompanyId()));

  // Contact Lists state
  selectedContactListId = signal<string | null>(null);
  selectedContactList = computed(() => this.storageService.contactLists().find(l => l.id === this.selectedContactListId()) || null);
  isCreatingList = signal(false);
  newListForm = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });
  isManualContactModalOpen = signal(false);

  manualContactForm = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: ['', [Validators.required, Validators.email]],
    address: [''],
    listId: [''] // To pre-select or allow choosing a list
  });

  // --- Operational Utilities ---
  async performAction<T>(action: () => Promise<T>, options: { 
    loadingSignal?: { set: (v: boolean) => void }, 
    successMsg?: string, 
    errorMsg?: string 
  }): Promise<T | undefined> {
    if (options.loadingSignal) options.loadingSignal.set(true);
    try {
      const result = await action();
      if (options.successMsg) {
        this.storageService.showToast('Sucesso', options.successMsg, 'success');
      }
      return result;
    } catch (error: unknown) {
      const err = error as Error;
      const msg = err?.message || options.errorMsg || 'Ocorreu um erro inesperado';
      this.storageService.showToast('Erro', msg, 'error');
      console.error('[Operation Failed]', error);
      return undefined;
    } finally {
      if (options.loadingSignal) options.loadingSignal.set(false);
    }
  }

  saveNewContactList() {
    if (this.newListForm.invalid) return;
    const vals = this.newListForm.value;
    
    this.storageService.saveContactList(vals.name || '', vals.description || '');
    this.storageService.addNotification('📁 Lista Criada', `A lista "${vals.name}" foi criada com sucesso.`, 'success');
    
    this.newListForm.reset();
    this.isCreatingList.set(false);
  }

  openManualContactModal(listId: string | null = null) {
    this.manualContactForm.reset({
      name: '',
      phone: '',
      email: '',
      address: '',
      listId: '' // Explicitly set to empty string to match placeholder option
    });
    
    if (listId) {
      this.manualContactForm.patchValue({ listId });
    } else if (this.selectedContactListId()) {
      this.manualContactForm.patchValue({ listId: this.selectedContactListId() || '' });
    }
    this.isManualContactModalOpen.set(true);
  }

  saveManualContact() {
    if (this.manualContactForm.invalid) return;
    const form = this.manualContactForm.value;
    
    const newCompany: Company = {
      id: crypto.randomUUID(),
      name: form.name!,
      emails: [form.email!],
      address: form.address || '',
      landlinePhone: form.phone || '',
      sector: 'Manual',
      province: 'LDC',
      description: 'Contacto adicionado manualmente.',
      socialMedia: []
    };

    // 1. Save company to saved companies
    const currentSaved = [...this.storageService.savedCompanies(), newCompany];
    this.storageService.saveCompanies(currentSaved);

    // 2. Add to list if specified
    if (form.listId) {
      this.storageService.addCompanyToList(form.listId, newCompany.id);
      this.automationEngine.triggerListJoined(newCompany, form.listId);
    }

    this.isManualContactModalOpen.set(false);
    this.storageService.addNotification('👤 Contacto Adicionado', `${newCompany.name} foi guardado na sua lista de contactos.`, 'success');
  }

  // Edit Contact Modal
  isEditContactModalOpen = signal(false);
  editingContact = signal<Company | null>(null);
  editContactForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.email]],
    mobilePhone: [''],
    landlinePhone: ['']
  });

  openEditContactModal(company: Company) {
    this.editingContact.set(company);
    this.editContactForm.patchValue({
      name: company.name || '',
      email: company.emails && company.emails.length > 0 ? company.emails[0] : '',
      mobilePhone: company.mobilePhone || '',
      landlinePhone: company.landlinePhone || ''
    });
    this.isEditContactModalOpen.set(true);
  }

  closeEditContactModal() {
    this.isEditContactModalOpen.set(false);
    this.editingContact.set(null);
    this.editContactForm.reset();
  }

  saveContactChanges() {
    if (this.editContactForm.invalid || !this.editingContact()) return;
    
    const contact = this.editingContact()!;
    const formVals = this.editContactForm.value;
    
    const updatedCompany: Company = {
      ...contact,
      name: formVals.name || contact.name,
      emails: formVals.email ? [formVals.email] : contact.emails, 
      mobilePhone: formVals.mobilePhone || undefined,
      landlinePhone: formVals.landlinePhone || undefined
    };

    const companies = this.storageService.savedCompanies();
    this.storageService.saveCompanies(companies.map(c => c.id === contact.id ? updatedCompany : c));
    
    this.storageService.addNotification('✅ Alterações Guardadas', `As informações de ${updatedCompany.name} foram atualizadas com sucesso.`, 'success');
    this.closeEditContactModal();
  }

  // Quick Add Modal
  isQuickAddModalOpen = signal(false);
  quickAddCompany = signal<Company | null>(null);
  quickAddForm = this.fb.group({
    listId: ['', Validators.required]
  });

  openQuickAddToListModal(company: Company) {
    this.quickAddCompany.set(company);
    this.quickAddForm.patchValue({ listId: this.selectedContactListId() || '' });
    this.isQuickAddModalOpen.set(true);
  }

  saveQuickAdd() {
    if (this.quickAddForm.invalid || !this.quickAddCompany()) return;
    const company = this.quickAddCompany()!;
    const listId = this.quickAddForm.value.listId!;
    
    // Save company if not saved
    if (!this.isSaved(company.name)) {
      this.saveCompany(company);
    }
    
    this.storageService.addCompanyToList(listId, company.id);
    this.automationEngine.triggerListJoined(company, listId);
    
    this.isQuickAddModalOpen.set(false);
    this.storageService.addNotification('🚀 Adicionado à Lista', `A empresa foi vinculada à lista com sucesso.`, 'success');
  }

  // Data Recovery logic
  recoverDeletedLists() {
    const backupKey = 'angocontacts_contact_lists_backup';
    const backupData = localStorage.getItem(backupKey) || localStorage.getItem('angocontacts_contact_lists');
    
    if (backupData) {
      try {
        const parsed = JSON.parse(backupData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.storageService.contactLists.set(parsed);
          this.storageService.saveContactLists(parsed);
          this.storageService.addNotification('Recuperação', `${parsed.length} listas foram recuperadas com sucesso!`, 'success');
          return;
        }
      } catch (e) {
        console.error('Recovery failed', e);
      }
    }
    this.storageService.addNotification('Recuperação', 'Não foram encontradas listas para recuperar no armazenamento local.', 'info');
  }

  addSelectedToList(listId: string) {
    const selected = this.selectedSavedCompanies();
    if (selected.length === 0) return;

    this.isMovingToList.set(true);
    
    const processBatch = async (index: number) => {
      const batchSize = 25;
      const end = Math.min(index + batchSize, selected.length);
      const batchIds = selected.slice(index, end);
      
      this.storageService.addCompaniesToList(listId, batchIds);
      
      // Trigger automations for the batch
      batchIds.forEach(companyId => {
        const comp = this.storageService.savedCompanies().find(c => c.id === companyId);
        if (comp) {
          this.automationEngine.triggerListJoined(comp, listId);
        }
      });

      if (end < selected.length) {
        // Continue with next batch
        setTimeout(() => processBatch(end), 10);
      } else {
        const listName = this.storageService.contactLists().find(l => l.id === listId)?.name || 'Lista';
        this.clearBulkSelection();
        this.isMovingToList.set(false);
        this.isMoveToListMenuOpen.set(false);
        this.storageService.addNotification('📦 Movimentação Concluída', `${selected.length} contactos foram movidos para a lista "${listName}".`, 'success');
      }
    };

    // Small delay before starting for UX
    setTimeout(() => processBatch(0), 300);
  }

  isMovingToList = signal(false);
  isMoveToListMenuOpen = signal(false);
  listSearchQuery = signal('');

  filteredLists = computed(() => {
    const query = this.listSearchQuery().toLowerCase().trim();
    const lists = this.storageService.contactLists();
    if (!query) return lists;
    return lists.filter(l => l.name.toLowerCase().includes(query));
  });

  quickCreateListAndMove() {
    const name = this.listSearchQuery().trim();
    if (!name) return;
    
    const newListId = this.storageService.saveContactList(name, 'Criada via menu de bulk');
    if (newListId) {
      this.addSelectedToList(newListId);
      this.listSearchQuery.set('');
    }
  }

  deleteContactList(id: string, event?: Event) {
    if (event) event.stopPropagation();
    if (confirm('Tem a certeza que deseja apagar esta lista? Os contactos não serão apagados da plataforma, apenas desta lista.')) {
      this.storageService.deleteContactList(id);
      if (this.selectedContactListId() === id) {
        this.selectedContactListId.set(null);
      }
    }
  }

  async generateWithAI() {
    const promptValue = this.aiPrompt().trim();
    if (!promptValue) return;

    await this.performAction(async () => {
      const result = await this.geminiService.generateEmailTemplateBlocks(promptValue, this.aiContextCompany());
      if (result) {
        this.templateForm.patchValue({ subject: result.subject });
        this.emailBlocks.set(result.blocks);
        this.selectedBlockId.set(null);
        this.storageService.addNotification('Sucesso', 'Conteúdo gerado com IA!', 'success');
      }
    }, {
      loadingSignal: this.isGeneratingAI,
      errorMsg: 'Falha ao gerar conteúdo com IA'
    });
  }

  async refineTemplateWithAI() {
    const instruction = this.templateRefineInstruction().trim();
    if (!instruction) return;

    await this.performAction(async () => {
      const currentSubject = this.templateForm.get('subject')?.value || '';
      const currentBlocks = this.emailBlocks();
      
      const result = await this.geminiService.refineEmailTemplateBlocks(
        currentSubject,
        currentBlocks,
        instruction,
        this.aiContextCompany()
      );

      if (result) {
        this.templateForm.patchValue({ subject: result.subject });
        this.emailBlocks.set(result.blocks);
        this.selectedBlockId.set(null);
        this.templateRefineInstruction.set('');
        this.storageService.addNotification('Sucesso', 'Modelo refinado com IA!', 'success');
      }
    }, {
      loadingSignal: this.isRefiningTemplateAI,
      errorMsg: 'Falha ao refinar modelo com IA'
    });
  }

  onBlockImageUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      this.updateBlockConfig('content', base64);
    };
    reader.readAsDataURL(file);
  }

  addEmailBlock(type: EmailBlock['type']) {
    const newBlock: EmailBlock = {
      id: crypto.randomUUID(),
      type,
      content: '',
      config: {
        padding: '20px',
        textAlign: 'left',
        fontSize: '16px',
        color: '#334155',
        backgroundColor: 'transparent',
        marginTop: '0px',
        marginBottom: '0px'
      }
    };

    switch (type) {
      case 'title':
        newBlock.content = 'Título do Email';
        newBlock.config.fontSize = '24px';
        newBlock.config.fontWeight = 'bold';
        break;
      case 'text':
        newBlock.content = 'Comece a escrever o seu conteúdo aqui...';
        break;
      case 'button':
        newBlock.content = 'Clique Aqui';
        newBlock.config.backgroundColor = '#6366f1';
        newBlock.config.color = '#ffffff';
        newBlock.config.borderRadius = '8px';
        newBlock.config.textAlign = 'center';
        newBlock.config.url = 'https://';
        break;
      case 'image':
      case 'logo':
        newBlock.content = 'https://picsum.photos/seed/email/600/300';
        if (type === 'logo') {
          newBlock.config.width = '120px';
          newBlock.config.textAlign = 'center';
        }
        break;
      case 'divider':
        newBlock.config.backgroundColor = '#e2e8f0';
        newBlock.config.height = '1px';
        newBlock.config.padding = '20px';
        break;
      case 'spacer':
        newBlock.config.height = '30px';
        break;
      case 'social':
        newBlock.config.textAlign = 'center';
        newBlock.config.socialLinks = [
          { platform: 'facebook', url: '#' },
          { platform: 'instagram', url: '#' },
          { platform: 'linkedin', url: '#' }
        ];
        break;
      case 'footer':
        newBlock.content = '© 2026 Sua Empresa. Todos os direitos reservados. <br> <a href="{{unsubscribe}}">Cancelar subscrição</a>';
        newBlock.config.fontSize = '12px';
        newBlock.config.color = '#64748b';
        newBlock.config.textAlign = 'center';
        break;
      case 'html':
        newBlock.content = '<div style="background: #f1f5f9; padding: 20px; text-align: center;">Bloco HTML Personalizado</div>';
        break;
    }

    this.emailBlocks.update(blocks => [...blocks, newBlock]);
    this.selectedBlockId.set(newBlock.id);
  }

  updateGlobalSettings(key: keyof EmailTemplateSettings, value: string) {
    this.templateSettings.update(s => ({ ...s, [key]: value }));
  }

  removeEmailBlock(id: string) {
    this.emailBlocks.update(blocks => blocks.filter(b => b.id !== id));
    if (this.selectedBlockId() === id) this.selectedBlockId.set(null);
  }

  updateBlockConfig(key: string, value: unknown) {
    const blockId = this.selectedBlockId();
    if (!blockId) return;

    this.emailBlocks.update(blocks => blocks.map(b => {
      if (b.id === blockId) {
        if (key === 'content') {
           return { ...b, content: value as string };
        }
        return { ...b, config: { ...b.config, [key as keyof EmailBlock['config']]: value } };
      }
      return b;
    }));
  }

  moveEmailBlock(index: number, direction: 'up' | 'down') {
    const blocks = [...this.emailBlocks()];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;

    [blocks[index], blocks[newIndex]] = [blocks[newIndex], blocks[index]];
    this.emailBlocks.set(blocks);
  }

  onDropBlock(event: CdkDragDrop<EmailBlock[]>) {
    const blocks = [...this.emailBlocks()];
    moveItemInArray(blocks, event.previousIndex, event.currentIndex);
    this.emailBlocks.set(blocks);
  }

  generateHtmlFromBlocks(): string {
    const blocks = this.emailBlocks();
    const settings = this.templateSettings();
    if (blocks.length === 0) return '';
    
    const blockHtml = blocks.map(block => {
      const config = block.config;
      const blockStyles = [
        `padding: ${config.padding || '0'}`,
        `margin-top: ${config.marginTop || '0'}`,
        `margin-bottom: ${config.marginBottom || '0'}`,
        `text-align: ${config.textAlign || 'left'}`,
        `background-color: ${config.backgroundColor || 'transparent'}`
      ].join('; ');

      const fontStyles = [
        `color: ${config.color || settings.defaultTextColor}`,
        `font-size: ${config.fontSize || settings.defaultFontSize}`,
        `line-height: ${config.lineHeight || '1.5'}`,
        `font-family: ${settings.defaultFontFamily}`
      ].join('; ');

      switch (block.type) {
        case 'title':
          return `<div style="${blockStyles}; ${fontStyles}; font-weight: ${config.fontWeight || 'bold'}; font-size: ${config.fontSize || '24px'}">${block.content}</div>`;
        case 'text':
          return `<div style="${blockStyles}; ${fontStyles}">${block.content.replace(/\n/g, '<br>')}</div>`;
        case 'image':
        case 'logo':
          return `
            <div style="${blockStyles}">
              <img src="${block.content}" style="max-width: ${config.width || '100%'}; height: auto; border-radius: ${config.borderRadius || '0'}; display: ${config.textAlign === 'center' ? 'block' : 'inline-block'}; margin: ${config.textAlign === 'center' ? '0 auto' : '0'}; border: 0;" referrerpolicy="no-referrer">
            </div>`;
        case 'button':
          return `
            <div style="${blockStyles}">
              <a href="${config.url || '#'}" style="display: inline-block; padding: 12px 24px; background-color: ${config.backgroundColor}; color: ${config.color}; text-decoration: none; border-radius: ${config.borderRadius || '4px'}; font-weight: bold; font-family: ${settings.defaultFontFamily}; font-size: ${config.fontSize || '14px'};">
                ${block.content}
              </a>
            </div>`;
        case 'divider':
          return `<div style="${blockStyles}"><div style="border-top: ${config.height || '1px'} solid ${config.backgroundColor || '#eee'}; width: 100%;"></div></div>`;
        case 'spacer':
          return `<div style="height: ${config.height || '20px'}; background-color: ${config.backgroundColor || 'transparent'};"></div>`;
        case 'social': {
          const socialLinks = (config.socialLinks || []).map(link => `
            <a href="${link.url}" style="display: inline-block; margin: 0 8px; text-decoration: none; color: ${settings.defaultTextColor};">
              ${link.platform}
            </a>
          `).join('');
          return `<div style="${blockStyles}">${socialLinks}</div>`;
        }
        case 'footer':
          return `<div style="${blockStyles}; ${fontStyles}; font-size: ${config.fontSize || '12px'}; color: ${config.color || '#94a3b8'}">${block.content}</div>`;
        case 'html':
          return `<div style="${blockStyles}">${block.content}</div>`;
        default:
          return '';
      }
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${this.templateForm.value.subject}</title>
          <style>
            body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
            table { border-collapse: collapse !important; }
          </style>
        </head>
        <body style="margin: 0; padding: 0; width: 100% !important; background-color: ${settings.backgroundColor};">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
            <tr>
              <td align="center" style="padding: 20px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="${settings.contentWidth}" style="background-color: ${settings.contentBackgroundColor}; border-radius: 8px; overflow: hidden; margin: 0 auto;">
                  <tr>
                    <td style="padding: 0;">
                      ${blockHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  searchForm = this.fb.group({
    query: ['', Validators.required],
    email: ['', [Validators.email]],
    province: [''],
    municipality: [''],
    district: [''],
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
  activeTab = this.storageService.activeTab;
  isNotificationsOpen = signal<boolean>(false);
  
  // Feedback signals
  recentlySavedSearch = signal<boolean>(false);
  recentlySavedCompanyIds = signal<Set<string>>(new Set());

  // Dashboard Stats
  dashboardStats = computed(() => {
    const totalContacts = this.storageService.savedCompanies().length;
    const campaigns = this.storageService.campaigns();
    const emailsSent = campaigns.filter(c => c.status === 'sent').length;
    const opened = campaigns.filter(c => c.opened).length;
    const clicked = campaigns.filter(c => c.clicked).length;
    
    return {
      totalContacts,
      emailsSent,
      opened,
      clicked,
      openRate: emailsSent > 0 ? Math.round((opened / emailsSent) * 100) : 0,
      clickRate: emailsSent > 0 ? Math.round((clicked / emailsSent) * 100) : 0,
    };
  });

  companyPerformanceStats = computed(() => {
    return this.groupedCampaigns().sort((a, b) => {
      const aScore = (a.stats.openRate * 0.7) + (a.stats.sent * 0.3);
      const bScore = (b.stats.openRate * 0.7) + (b.stats.sent * 0.3);
      return bScore - aScore;
    });
  });

  automationChartData = computed(() => {
    const automations = this.storageService.automations();
    return automations.map((w: AutomationWorkflow) => ({
      name: w.name,
      entered: w.stats.entered,
      completed: w.stats.completed,
      emailsSent: w.stats.emailsSent || 0
    }));
  });

  // Pagination
  resultsPerPage = signal<number>(10);
  resultsPerPageOptions = [5, 10, 20, 50];
  currentPage = signal<number>(1);
  
  totalPages = computed(() => {
    return Math.max(1, Math.ceil(this.searchResults().length / this.resultsPerPage()));
  });

  paginatedResults = computed(() => {
    const start = (this.currentPage() - 1) * this.resultsPerPage();
    return this.searchResults().slice(start, start + this.resultsPerPage());
  });

  getPaginatedStart(): number {
    if (this.searchResults().length === 0) return 0;
    return (this.currentPage() - 1) * this.resultsPerPage() + 1;
  }

  getPaginatedEnd(): number {
    return Math.min(this.currentPage() * this.resultsPerPage(), this.searchResults().length);
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  onResultsPerPageChange(event: Event) {
    const value = parseInt((event.target as HTMLSelectElement).value, 10);
    this.resultsPerPage.set(value);
    this.currentPage.set(1); // Reset to first page
  }

  // Email Infrastructure Settings
  isSavingSettings = signal<boolean>(false);
  isSettingsSaved = signal<boolean>(false);
  settingsForm = this.fb.group({
    provider: ['sendgrid', Validators.required],
    apiKey: [''],
    smtpHost: [''],
    smtpPort: ['587'],
    smtpUser: [''],
    smtpPass: [''],
    fromEmail: ['', [Validators.required, Validators.email]],
    fromName: ['', Validators.required],
    replyTo: ['', Validators.email],
    trackOpens: [true],
    trackClicks: [true]
  });

  // Email Composer State
  isEmailModalOpen = signal<boolean>(false);
  isEmailModalMinimized = signal<boolean>(false);
  isBulkEmailMode = signal<boolean>(false);
  currentEmailCompany = signal<Company | null>(null);
  isGeneratingEmail = signal<boolean>(false);
  generatedEmailSubject = signal<string>('');
  generatedEmailBody = signal<string>('');
  
  emailForm = this.fb.group({
    objective: ['', Validators.required],
    senderName: ['', Validators.required],
    senderCompany: ['', Validators.required],
    senderWebsite: [''],
    customSubject: ['Assunto Padrão'],
    type: ['Prospecção Fria', Validators.required],
    tone: ['Profissional e Persuasivo', Validators.required],
    primaryColor: ['#0A192F'],
    secondaryColor: ['#F8FAFC'],
    hyperPersonalize: [false]
  });

  scheduleDatetime = signal<string>('');
  emailPreviewMode = signal<'visual' | 'code'>('visual');
  isEmailPreviewExpanded = signal<boolean>(false);
  emailGenerationMode = signal<'single' | 'sequence'>('single');
  generatedEmailSequence = signal<{subject: string, body: string, delayDays: number}[]>([]);
  expandedCompanyId = signal<string | null>(null);
  refinePrompt = signal<string>('');
  isRefiningEmail = signal<boolean>(false);
  isSchedulingMode = signal<boolean>(false);
  emailsSentCount = computed(() => {
    const company = this.currentEmailCompany();
    if (!company) return 0;
    return this.storageService.campaigns().filter(c => c.companyId === company.id && c.status === 'sent').length;
  });
  safeEmailBody = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.generatedEmailBody()));

  campaignStats = computed(() => {
    const campaigns = this.storageService.campaigns();
    const sent = campaigns.filter(c => c.status === 'sent').length;
    const scheduled = campaigns.filter(c => c.status === 'scheduled').length;
    const failed = campaigns.filter(c => c.status === 'failed').length;
    const opened = campaigns.filter(c => c.opened).length;
    const total = campaigns.length;
    
    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
    
    return { sent, scheduled, failed, opened, openRate, total };
  });

  allContactLists = computed(() => this.storageService.contactLists());

  groupedCampaigns = computed(() => {
    const campaigns = this.storageService.campaigns();
    const groups = new Map<string, CompanyCampaignGroup>();

    campaigns.forEach(c => {
      if (!groups.has(c.companyId)) {
        // Try to find company details in saved or history
        const companyDetails = this.storageService.savedCompanies().find(comp => comp.id === c.companyId) || 
                               this.storageService.searchHistory().find(comp => comp.id === c.companyId);

        groups.set(c.companyId, {
          companyId: c.companyId,
          companyName: c.companyName,
          targetEmail: c.targetEmail,
          campaigns: [],
          latestActivity: 0,
          status: 'pending',
          stats: { sent: 0, opened: 0, openRate: 0 },
          companyDetails
        });
      }
      const group = groups.get(c.companyId)!;
      group.campaigns.push(c);
      
      if (c.status === 'sent') {
        group.stats.sent++;
        if (c.opened) group.stats.opened++;
      }
      
      const activityDate = c.sentDate || c.scheduledDate || 0;
      if (activityDate > group.latestActivity) {
        group.latestActivity = activityDate;
      }
    });

    return Array.from(groups.values()).map(group => {
      group.stats.openRate = group.stats.sent > 0 ? Math.round((group.stats.opened / group.stats.sent) * 100) : 0;
      
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

  openTemplateModal(template?: EmailTemplate) {
    if (template) {
      this.editingTemplateId.set(template.id);
      this.templateForm.patchValue({
        name: template.name,
        subject: template.subject,
        body: template.body
      });
      this.emailBlocks.set(template.blocks || []);
    } else {
      this.editingTemplateId.set(null);
      this.templateForm.reset();
      this.emailBlocks.set([]);
    }
    this.isTemplateModalOpen.set(true);
  }

  saveTemplate() {
    if (this.templateForm.valid) {
      const formValue = this.templateForm.value;
      const generatedHtml = this.generateHtmlFromBlocks();
      
      this.storageService.saveTemplate({
        name: formValue.name!,
        subject: formValue.subject!,
        body: generatedHtml || formValue.body || '',
        blocks: this.emailBlocks()
      }, this.editingTemplateId() || undefined);
      
      this.isTemplateModalOpen.set(false);
      this.templateForm.reset();
      this.emailBlocks.set([]);
      this.selectedBlockId.set(null);
    }
  }

  deleteTemplate(id: string) {
    this.templateToDeleteId.set(id);
  }

  confirmDeleteTemplate() {
    const id = this.templateToDeleteId();
    if (id) {
      this.storageService.deleteTemplate(id);
      this.storageService.addNotification('Modelo Apagado', 'O modelo de email foi removido com sucesso.', 'success');
      this.templateToDeleteId.set(null);
    }
  }

  cancelDeleteTemplate() {
    this.templateToDeleteId.set(null);
  }

  savedSortColumn = signal<'name' | 'province' | 'sector' | 'category' | null>(null);
  savedSortDirection = signal<'asc' | 'desc'>('asc');

  historySortColumn = signal<'name' | 'province' | 'sector' | 'category' | null>(null);
  historySortDirection = signal<'asc' | 'desc'>('asc');

  selectedSavedCompanies = signal<string[]>([]);

  toggleSavedCompanySelection(companyId: string) {
    this.selectedSavedCompanies.update(selected => {
      if (selected.includes(companyId)) {
        return selected.filter(id => id !== companyId);
      } else {
        return [...selected, companyId];
      }
    });
  }

  toggleAllSavedCompanies(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (isChecked) {
      this.selectedSavedCompanies.set(this.storageService.savedCompanies().map(c => c.id));
    } else {
      this.selectedSavedCompanies.set([]);
    }
  }

  clearBulkSelection() {
    this.selectedSavedCompanies.set([]);
  }

  openBulkEmailModal() {
    if (this.selectedSavedCompanies().length === 0) return;
    
    // For bulk mode, we use the first company as a template for generation,
    // but we set the bulk flag so the UI and sending logic know it's for multiple.
    const firstCompanyId = this.selectedSavedCompanies()[0];
    const company = this.storageService.savedCompanies().find(c => c.id === firstCompanyId);
    if (company) {
      this.isBulkEmailMode.set(true);
      this.openEmailModal(company);
    }
  }

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

    const emailSettings = this.storageService.emailSettings();
    if (emailSettings) {
      this.settingsForm.patchValue(emailSettings);
    }

    // Performance optimization: Cleanup old data on startup after 5s
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        this.storageService.clearOldData();
      }, 5000);
    }
  }

  // Settings Diagnostics
  isTestingSettings = signal(false);
  
  async testEmailConfig() {
    if (this.settingsForm.invalid) {
      this.storageService.showToast('Campos em Falta', 'Preencha as configurações antes de testar.', 'warning');
      return;
    }

    const settings = this.settingsForm.value as EmailSettings;
    
    await this.performAction(async () => {
      this.storageService.addNotification('Contacto com API...', `A testar ligação com ${settings.provider}...`, 'info');
      
      await this.emailService.sendEmail(settings, {
        to: settings.fromEmail, // Send to self
        subject: 'Teste de Configuração AngoContacts',
        body: '<h1>Sucesso!</h1><p>Se está a ler isto, a sua configuração de email está a funcionar corretamente.</p>'
      });
      
      this.storageService.addNotification('Teste Bem Sucedido', 'Email de teste enviado com sucesso para ' + settings.fromEmail, 'success', 'high');
    }, {
      loadingSignal: this.isTestingSettings,
      errorMsg: 'Falha no Teste. Verifique as suas credenciais e tente novamente.'
    });
  }

  async saveSettings() {
    if (this.settingsForm.invalid) {
      this.storageService.showToast('Erro', 'Por favor, preencha todos os campos obrigatórios.', 'error');
      return;
    }

    await this.performAction(async () => {
      // Simulate network request for effect
      await new Promise(resolve => setTimeout(resolve, 600));

      const settings = this.settingsForm.value as EmailSettings;
      this.storageService.saveEmailSettings(settings);
      
      this.isSettingsSaved.set(true);
      this.storageService.addNotification('Configurações Guardadas', 'As suas configurações de email foram guardadas com sucesso.', 'success');
      
      // Reset the saved state after 3 seconds
      setTimeout(() => {
        this.isSettingsSaved.set(false);
      }, 3000);
    }, {
      loadingSignal: this.isSavingSettings
    });
  }

  toggleNotifications() {
    this.isNotificationsOpen.update(v => !v);
  }

  toggleEmailPreviewMode() {
    this.emailPreviewMode.update(mode => mode === 'visual' ? 'code' : 'visual');
  }

  toggleSchedulingMode() {
    this.isSchedulingMode.update(v => !v);
    if (this.isSchedulingMode() && !this.scheduleDatetime()) {
      // Set default to tomorrow at 9 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      // Format to YYYY-MM-DDThh:mm
      const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
      const localISOTime = (new Date(tomorrow.getTime() - tzoffset)).toISOString().slice(0, 16);
      this.scheduleDatetime.set(localISOTime);
    }
  }

  toggleCompanyExpansion(companyId: string) {
    this.expandedCompanyId.update(current => current === companyId ? null : companyId);
  }

  getSocialIcon(platform: string): string {
    const p = platform.toLowerCase();
    if (p.includes('facebook')) return 'facebook';
    if (p.includes('linkedin')) return 'business';
    if (p.includes('instagram')) return 'camera_alt';
    if (p.includes('twitter') || p.includes('x')) return 'close';
    return 'link';
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
    let companies = [...this.storageService.savedCompanies()];
    const selectedList = this.selectedContactListId();
    if (selectedList && selectedList !== 'all') {
      const listObj = this.storageService.contactLists().find(l => l.id === selectedList);
      if (listObj) {
        companies = companies.filter(c => listObj.companyIds.includes(c.id));
      }
    }
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

    this.searchResults.set([]);
    this.currentPage.set(1);

    const { query, email, province, municipality, district, sector } = this.searchForm.value;

    await this.performAction(async () => {
      let results = await this.geminiService.searchCompanies(
        query || '',
        province || undefined,
        municipality || undefined,
        district || undefined,
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
    }, {
      loadingSignal: this.isLoading,
      errorMsg: 'Ocorreu um erro ao realizar a pesquisa. Por favor, tente novamente mais tarde.'
    });
  }

  saveCurrentSearch() {
    if (this.searchForm.invalid) return;
    const { query, email, province, municipality, district, sector } = this.searchForm.value;
    this.storageService.saveSearch({
      query: query || '',
      email: email || undefined,
      province: province || undefined,
      municipality: municipality || undefined,
      district: district || undefined,
      sector: sector || undefined
    });
    
    // Feedback
    this.recentlySavedSearch.set(true);
    this.storageService.addNotification('Pesquisa Guardada', `A sua pesquisa em "${query || sector || province || 'Angola'}" foi guardada com sucesso.`, 'success');
    setTimeout(() => this.recentlySavedSearch.set(false), 2000);
  }

  clearSearch() {
    this.searchForm.reset({
      query: '',
      email: '',
      province: '',
      municipality: '',
      district: '',
      sector: ''
    });
    this.searchResults.set([]);
    this.storageService.addNotification('Filtros Limpos', 'A pesquisa foi reiniciada.', 'info');
  }

  loadSavedSearch(search: SavedSearch) {
    this.searchForm.patchValue({
      query: search.query,
      email: search.email || '',
      province: search.province || '',
      municipality: search.municipality || '',
      district: search.district || '',
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

  handleNotificationAction(notif: AppNotification) {
    this.storageService.markNotificationAsRead(notif.id);
    if (notif.action) {
      if (notif.action.tab) {
        this.activeTab.set(notif.action.tab);
      }
      if (notif.action.link) {
        window.open(notif.action.link, '_blank');
      }
    }
    this.isNotificationsOpen.set(false);
  }

  saveCompany(company: Company) {
    this.storageService.addCompany(company);
    this.storageService.addNotification('⭐ Empresa Guardada', `${company.name} foi adicionada aos seus contactos ativos.`, 'success');
    
    // Feedback
    this.recentlySavedCompanyIds.update(set => {
      const newSet = new Set(set);
      newSet.add(company.id);
      return newSet;
    });
    
    setTimeout(() => {
      this.recentlySavedCompanyIds.update(set => {
        const newSet = new Set(set);
        newSet.delete(company.id);
        return newSet;
      });
    }, 2000);

    const removedCount = this.storageService.cleanSavedCompanies();
    if (removedCount > 0) {
      this.storageService.addNotification(
        'Contactos Duplicados', 
        `Foram eliminados ${removedCount} contactos duplicados ao guardar.`, 
        'info'
      );
    }
    this.automationEngine.triggerContactAdded(company);
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

  async exportPDF() {
    const { cleaned, removedCount } = this.storageService.sanitizeContactsList(this.storageService.savedCompanies());
    if (removedCount > 0) {
      this.storageService.addNotification('Exportação Limpa', `Foram eliminados ${removedCount} contactos duplicados antes da exportação.`, 'info');
    }
    await this.exportService.exportToPDF(cleaned);
  }

  // Email Composer Logic
  sendDirectEmail(company: Company) {
    if (company.emails && company.emails.length > 0) {
      window.location.href = `mailto:${company.emails[0]}`;
      this.storageService.addNotification('🚀 Email em Preparação', `A abrir o seu cliente de email padrão para contactar ${company.name}.`, 'success');
    } else {
      this.storageService.addNotification('⚠️ Email não encontrado', `${company.name} não possui um endereço de email associado no sistema.`, 'warning');
    }
  }

  openEmailModal(company: Company) {
    this.currentEmailCompany.set(company);
    this.generatedEmailSubject.set('');
    this.generatedEmailBody.set('');
    this.generatedEmailSequence.set([]);
    this.emailGenerationMode.set('single');
    this.isEmailPreviewExpanded.set(false);
    
    // Pre-fill form from storage or defaults
    const profile = this.storageService.userProfile();
    const companyName = company.name;
    const companySector = company.sector || 'seu setor';
    
    // Create a contextual default objective if none is set globally
    const dynamicObjective = profile?.objective || `Apresentar soluções personalizadas para a ${companyName} no setor de ${companySector} e explorar potenciais colaborações estratégicas.`;

    this.emailForm.patchValue({
      objective: dynamicObjective,
      senderName: profile?.senderName || 'Consultor Comercial',
      senderCompany: profile?.senderCompany || 'Sua Empresa LDA',
      senderWebsite: profile?.senderWebsite || 'www.suaempresa.ao',
      primaryColor: profile?.primaryColor || '#0A192F',
      secondaryColor: profile?.secondaryColor || '#F8FAFC',
      type: 'Prospecção Fria',
      tone: 'Profissional e Persuasivo'
    });
    
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
    this.isEmailModalMinimized.set(false);
    this.isBulkEmailMode.set(false);
    this.currentEmailCompany.set(null);
  }

  toggleEmailModalMinimize() {
    this.isEmailModalMinimized.update(v => !v);
  }

  async generateEmail() {
    if (this.emailForm.invalid || !this.currentEmailCompany()) return;
    
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

    await this.performAction(async () => {
      if (this.emailGenerationMode() === 'sequence') {
        const sequence = await this.geminiService.generateEmailSequence(
          this.currentEmailCompany()!,
          formVals.objective || '',
          formVals.senderName || '',
          formVals.senderCompany || '',
          formVals.senderWebsite || '',
          formVals.tone || '',
          formVals.primaryColor || '#0A192F',
          formVals.secondaryColor || '#F8FAFC',
          formVals.customSubject || ''
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
          formVals.secondaryColor || '#F8FAFC',
          formVals.customSubject || ''
        );
        this.generatedEmailSubject.set(result.subject);
        this.generatedEmailBody.set(result.body);
        this.generatedEmailSequence.set([]);
      }
    }, {
      loadingSignal: this.isGeneratingEmail,
      errorMsg: 'Falha ao gerar o email. Verifique a sua ligação ou tente novamente.'
    });
  }

  updateEmailBody(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    this.generatedEmailBody.set(el.value);
  }

  updateEmailSubject(event: Event) {
    const el = event.target as HTMLInputElement;
    this.generatedEmailSubject.set(el.value);
  }

  copyHtmlToClipboard(content?: string) {
    const html = content || (this.emailGenerationMode() === 'single' ? this.generatedEmailBody() : this.generatedEmailSequence().map(e => `<!-- ${e.subject} -->\n${e.body}`).join('\n\n---\n\n'));
    if (!html) return;
    
    navigator.clipboard.writeText(html).then(() => {
      this.storageService.addNotification('📄 Código Copiado', 'O código HTML foi copiado para a área de transferência. Pode colá-lo no seu editor de email.', 'success');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      this.storageService.addNotification('❌ Erro ao Copiar', 'Não foi possível copiar o código para a área de transferência.', 'error', 'high');
    });
  }

  openInEditor(content: string) {
    // This is a simple implementation to "edit" - it switches to code mode and focuses the textarea
    // For sequences, we'd need a more complex state, but for single emails it's straightforward.
    this.emailPreviewMode.set('code');
    if (this.emailGenerationMode() === 'single') {
      this.generatedEmailBody.set(content);
      // Focus handled by template binding
    }
    this.storageService.addNotification('Editor Aberto', 'Pode agora editar o código HTML diretamente.', 'info');
  }

  async refineEmailWithAI() {
    const instruction = this.refinePrompt().trim();
    if (!instruction) return;

    await this.performAction(async () => {
      const formVals = this.emailForm.value;
      const primeColor = formVals.primaryColor || '#0A192F';
      const secColor = formVals.secondaryColor || '#F8FAFC';

      if (this.emailGenerationMode() === 'sequence') {
        const result = await this.geminiService.refineSequenceEmail(
          this.generatedEmailSequence(),
          instruction,
          primeColor,
          secColor
        );
        this.generatedEmailSequence.set(result);
      } else {
        const result = await this.geminiService.refineEmail(
          this.generatedEmailSubject(),
          this.generatedEmailBody(),
          instruction,
          primeColor,
          secColor
        );
        this.generatedEmailSubject.set(result.subject);
        this.generatedEmailBody.set(result.body);
      }
      
      this.refinePrompt.set('');
      this.storageService.addNotification('Email Refinado', 'As alterações foram geradas com base na sua instrução.', 'success');
    }, {
      loadingSignal: this.isRefiningEmail,
      errorMsg: 'Falha ao refinar o email. Tente novamente com uma instrução diferente.'
    });
  }

  insertVariable(variable: string) {
    const textarea = document.getElementById('emailBody') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    
    const newValue = before + variable + after;
    this.generatedEmailBody.set(newValue);
    
    // Set focus back and move cursor
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    }, 0);
  }

  async sendEmailNow() {
    const templateCompany = this.currentEmailCompany();
    if (!templateCompany) return;

    const subject = this.generatedEmailSubject();
    const body = this.generatedEmailBody();
    const settings = this.storageService.emailSettings();

    if (this.isBulkEmailMode()) {
      const companies = this.storageService.savedCompanies().filter(c => this.selectedSavedCompanies().includes(c.id));
      
      if (!settings) {
        this.storageService.addNotification('Configuração em Falta', 'Configure um provedor de email nas Configurações para enviar campanhas em massa.', 'error', 'high');
        this.activeTab.set('settings');
        this.closeEmailModal();
        return;
      }

      let successCount = 0;
      let failCount = 0;

      this.storageService.addNotification('A Enviar', `A enviar campanha para ${companies.length} empresas...`, 'info');

      for (const company of companies) {
        const targetEmail = company.emails.length > 0 ? company.emails[0] : '';
        if (!targetEmail) {
          failCount++;
          continue;
        }
        
        let personalizedSubject = subject.replace(/\{\{nome_empresa\}\}/g, company.name);
        let personalizedBody = body.replace(/\{\{nome_empresa\}\}/g, company.name);

        if (this.emailForm.value.hyperPersonalize) {
          try {
            const instruction = `Reescreva este email para ser hiper-personalizado para a empresa "${company.name}", que atua no setor "${company.sector || 'Geral'}" em ${company.province || 'Angola'}. O foco da empresa é: "${company.description || 'Desconhecido'}". Adapte os argumentos do email para combinar perfeitamente com a realidade deles, mantendo o tom e as cores originais. O email não deve parecer um template.`;
            
            const refined = await this.geminiService.refineEmail(
              personalizedSubject,
              personalizedBody,
              instruction,
              this.emailForm.value.primaryColor || '#0A192F',
              this.emailForm.value.secondaryColor || '#F8FAFC'
            );
            personalizedSubject = refined.subject;
            personalizedBody = refined.body;
          } catch (e) {
            console.warn(`Hiper-personalização falhou para ${company.name}, caindo para template padrão.`, e);
          }
        }

        try {
          await this.emailService.sendEmail(settings, {
            to: targetEmail,
            subject: personalizedSubject,
            body: personalizedBody
          });

          this.storageService.addCampaign({
            id: crypto.randomUUID(),
            companyId: company.id,
            companyName: company.name,
            targetEmail,
            subject: personalizedSubject,
            body: personalizedBody,
            status: 'sent',
            type: this.emailForm.value.type || '',
            tone: this.emailForm.value.tone || '',
            sentDate: Date.now()
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to send to ${company.name}:`, error);
          this.storageService.addCampaign({
            id: crypto.randomUUID(),
            companyId: company.id,
            companyName: company.name,
            targetEmail,
            subject: personalizedSubject,
            body: personalizedBody,
            status: 'failed',
            type: this.emailForm.value.type || '',
            tone: this.emailForm.value.tone || '',
            sentDate: Date.now()
          });
          failCount++;
        }
      }

      if (failCount === 0) {
        this.storageService.addNotification('Campanha em Massa Enviada', `Foram enviados ${successCount} emails com sucesso.`, 'success', 'high', undefined, { label: 'Ver Campanhas', tab: 'campaigns' });
      } else {
        this.storageService.addNotification('Campanha Concluída com Erros', `${successCount} enviados, ${failCount} falharam. Verifique as configurações.`, 'warning', 'high', undefined, { label: 'Ver Campanhas', tab: 'campaigns' });
      }
      
      this.clearBulkSelection();
    } else {
      const targetEmail = templateCompany.emails.length > 0 ? templateCompany.emails[0] : '';

      if (settings && targetEmail) {
        try {
          this.storageService.addNotification('A Enviar', `A enviar email para ${templateCompany.name}...`, 'info');
          await this.emailService.sendEmail(settings, {
            to: targetEmail,
            subject,
            body
          });
          
          this.storageService.addCampaign({
            id: crypto.randomUUID(),
            companyId: templateCompany.id,
            companyName: templateCompany.name,
            targetEmail,
            subject,
            body,
            status: 'sent',
            type: this.emailForm.value.type || '',
            tone: this.emailForm.value.tone || '',
            sentDate: Date.now()
          });

          this.storageService.addNotification('Email Enviado', `Email para ${templateCompany.name} enviado com sucesso via ${settings.provider}.`, 'success', 'low', undefined, { label: 'Ver Campanhas', tab: 'campaigns' });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Erro desconhecido';
          this.storageService.addNotification('Erro ao Enviar', `Falha ao enviar via API: ${msg}`, 'error', 'high');
        }
      } else {
        // Fallback to mailto if no settings configured
        const plainTextBody = body.replace(/<[^>]*>?/gm, '');
        const mailtoLink = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainTextBody)}`;
        window.open(mailtoLink, '_blank');

        this.storageService.addCampaign({
          id: crypto.randomUUID(),
          companyId: templateCompany.id,
          companyName: templateCompany.name,
          targetEmail,
          subject,
          body,
          status: 'sent',
          type: this.emailForm.value.type || '',
          tone: this.emailForm.value.tone || '',
          sentDate: Date.now()
        });

        this.storageService.addNotification('Email Aberto', `Email para ${templateCompany.name} aberto no seu cliente de email padrão.`, 'success', 'low', undefined, { label: 'Ver Campanhas', tab: 'campaigns' });
      }
    }

    this.closeEmailModal();
  }

  updateScheduleDatetime(event: Event) {
    const el = event.target as HTMLInputElement;
    this.scheduleDatetime.set(el.value);
  }

  scheduleEmail() {
    const templateCompany = this.currentEmailCompany();
    if (!templateCompany) return;

    const baseScheduledDate = new Date(this.scheduleDatetime()).getTime();
    
    let companiesBase = [templateCompany];
    if (this.isBulkEmailMode()) {
      companiesBase = this.storageService.savedCompanies().filter(c => this.selectedSavedCompanies().includes(c.id));
    }

    const processBatch = async (index: number) => {
      const batchSize = 20;
      const end = Math.min(index + batchSize, companiesBase.length);
      const batch = companiesBase.slice(index, end);

      if (this.emailGenerationMode() === 'sequence' && this.generatedEmailSequence().length > 0) {
        const sequence = this.generatedEmailSequence();
        batch.forEach(company => {
          const targetEmail = company.emails.length > 0 ? company.emails[0] : '';
          sequence.forEach((email, sIdx) => {
            const scheduledDate = baseScheduledDate + (email.delayDays * 24 * 60 * 60 * 1000);
            const personalizedSubject = email.subject.replace(/\{\{nome_empresa\}\}/g, company.name);
            const personalizedBody = email.body.replace(/\{\{nome_empresa\}\}/g, company.name);

            this.storageService.addCampaign({
              id: crypto.randomUUID(),
              companyId: company.id,
              companyName: company.name,
              targetEmail,
              subject: personalizedSubject,
              body: personalizedBody,
              status: 'scheduled',
              type: 'Sequência de Prospecção',
              tone: this.emailForm.value.tone || '',
              scheduledDate,
              sequenceIndex: sIdx + 1,
              sequenceTotal: sequence.length
            });
          });
        });
      } else {
        const subject = this.generatedEmailSubject();
        const body = this.generatedEmailBody();
        batch.forEach(company => {
          const targetEmail = company.emails.length > 0 ? company.emails[0] : '';
          const personalizedSubject = subject.replace(/\{\{nome_empresa\}\}/g, company.name);
          const personalizedBody = body.replace(/\{\{nome_empresa\}\}/g, company.name);

          this.storageService.addCampaign({
            id: crypto.randomUUID(),
            companyId: company.id,
            companyName: company.name,
            targetEmail,
            subject: personalizedSubject,
            body: personalizedBody,
            status: 'scheduled',
            type: this.emailForm.value.type || '',
            tone: this.emailForm.value.tone || '',
            scheduledDate: baseScheduledDate
          });
        });
      }

      if (end < companiesBase.length) {
        setTimeout(() => processBatch(end), 10);
      } else {
        const formattedDate = new Date(baseScheduledDate).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
        if (this.isBulkEmailMode()) {
          this.storageService.addNotification('Campanha Agendada', `Emails processados para ${companiesBase.length} empresas.`, 'success', 'medium', undefined, { label: 'Ver Campanhas', tab: 'campaigns' });
          this.clearBulkSelection();
        } else {
          this.storageService.addNotification('Email Agendado', `Email para ${templateCompany.name} agendado para ${formattedDate}.`, 'success');
        }
        this.isSchedulingMode.set(false);
        this.closeEmailModal();
      }
    };

    processBatch(0);
  }

  // Performance helpers
  clearAllMemory() {
    if (confirm('Deseja libertar memória eliminando registos antigos? Isto manterá as suas empresas e modelos, mas libertará espaço no historial e logs.')) {
      this.storageService.clearOldData();
      this.storageService.showToast('Memória Libertada', 'Os dados antigos foram removidos com sucesso.', 'success');
    }
  }
}
