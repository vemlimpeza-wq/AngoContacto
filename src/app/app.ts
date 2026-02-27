import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GeminiService } from './services/gemini.service';
import { StorageService } from './services/storage.service';
import { ExportService } from './services/export.service';
import { Company, SavedSearch } from './models/company.model';

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

  searchResults = signal<Company[]>([]);
  isLoading = signal<boolean>(false);
  activeTab = signal<'search' | 'saved' | 'history' | 'saved-searches'>('search');
  isNotificationsOpen = signal<boolean>(false);

  savedSortColumn = signal<'name' | 'province' | 'sector' | null>(null);
  savedSortDirection = signal<'asc' | 'desc'>('asc');

  historySortColumn = signal<'name' | 'province' | 'sector' | null>(null);
  historySortDirection = signal<'asc' | 'desc'>('asc');

  ngOnInit() {
    this.checkOutdatedSearches();
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

  sortSaved(column: 'name' | 'province' | 'sector') {
    if (this.savedSortColumn() === column) {
      this.savedSortDirection.set(this.savedSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.savedSortColumn.set(column);
      this.savedSortDirection.set('asc');
    }
  }

  sortHistory(column: 'name' | 'province' | 'sector') {
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
    } catch (error) {
      console.error('Search failed', error);
      // Handle error gracefully
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
    this.activeTab.set('search');
    this.onSearch();
  }

  removeSavedSearch(id: string) {
    this.storageService.removeSavedSearch(id);
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
}
