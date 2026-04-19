import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { StorageService } from '../services/storage.service';
import { AutomationEngineService } from '../services/automation-engine.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <aside class="w-64 bg-[#0A192F] text-white flex flex-col shrink-0 border-r border-[#0A192F]">
      <div class="h-16 flex items-center gap-3 px-6 border-b border-white/10">
        <div class="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white font-bold shadow-sm">
          <mat-icon class="text-white text-sm">business</mat-icon>
        </div>
        <h1 class="text-lg font-bold tracking-tight">AngoContacts Pro</h1>
      </div>

      <nav class="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <button 
          (click)="storageService.activeTab.set('dashboard')"
          [class.bg-white/10]="storageService.activeTab() === 'dashboard'"
          [class.bg-white/5]="storageService.activeTab() !== 'dashboard'"
          [class.text-white]="storageService.activeTab() === 'dashboard'"
          [class.text-slate-300]="storageService.activeTab() !== 'dashboard'"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-colors">
          <mat-icon class="text-[20px]">dashboard</mat-icon>
          Dashboard
        </button>

        <button 
          (click)="storageService.activeTab.set('search')"
          [class.bg-white/10]="storageService.activeTab() === 'search' || storageService.activeTab() === 'saved' || storageService.activeTab() === 'history'"
          [class.bg-white/5]="storageService.activeTab() !== 'search' && storageService.activeTab() !== 'saved' && storageService.activeTab() !== 'history'"
          [class.text-white]="storageService.activeTab() === 'search' || storageService.activeTab() === 'saved' || storageService.activeTab() === 'history'"
          [class.text-slate-300]="storageService.activeTab() !== 'search' && storageService.activeTab() !== 'saved' && storageService.activeTab() !== 'history'"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-colors">
          <mat-icon class="text-[20px]">contacts</mat-icon>
          Contactos
        </button>

        <button 
          (click)="storageService.activeTab.set('campaigns')"
          [class.bg-white/10]="storageService.activeTab() === 'campaigns'"
          [class.bg-white/5]="storageService.activeTab() !== 'campaigns'"
          [class.text-white]="storageService.activeTab() === 'campaigns'"
          [class.text-slate-300]="storageService.activeTab() !== 'campaigns'"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-colors">
          <mat-icon class="text-[20px]">mail</mat-icon>
          Campanhas
          @if (storageService.campaigns().length > 0) {
            <span class="ml-auto bg-blue-500 text-white py-0.5 px-2 rounded-full text-[10px] font-bold">
              {{ storageService.campaigns().length }}
            </span>
          }
        </button>

        <button 
          (click)="storageService.activeTab.set('automation')"
          [class.bg-white/10]="storageService.activeTab() === 'automation'"
          [class.bg-white/5]="storageService.activeTab() !== 'automation'"
          [class.text-white]="storageService.activeTab() === 'automation'"
          [class.text-slate-300]="storageService.activeTab() !== 'automation'"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-colors">
          <mat-icon class="text-[20px]">auto_mode</mat-icon>
          <span class="flex-1 text-left">Automação</span>
          @if (automationEngine.automationStats().active > 0) {
            <span class="flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          }
        </button>

        <button 
          (click)="storageService.activeTab.set('reports')"
          [class.bg-white/10]="storageService.activeTab() === 'reports'"
          [class.bg-white/5]="storageService.activeTab() !== 'reports'"
          [class.text-white]="storageService.activeTab() === 'reports'"
          [class.text-slate-300]="storageService.activeTab() !== 'reports'"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-colors">
          <mat-icon class="text-[20px]">bar_chart</mat-icon>
          Relatórios
        </button>

        <button 
          (click)="storageService.activeTab.set('templates')"
          [class.bg-white/10]="storageService.activeTab() === 'templates'"
          [class.bg-white/5]="storageService.activeTab() !== 'templates'"
          [class.text-white]="storageService.activeTab() === 'templates'"
          [class.text-slate-300]="storageService.activeTab() !== 'templates'"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-colors">
          <mat-icon class="text-[20px]">description</mat-icon>
          Modelos de Email
        </button>
      </nav>
      
      <div class="p-4 border-t border-white/10">
        <button 
          (click)="storageService.activeTab.set('settings')"
          [class.bg-white/10]="storageService.activeTab() === 'settings'"
          [class.bg-white/5]="storageService.activeTab() !== 'settings'"
          [class.text-white]="storageService.activeTab() === 'settings'"
          [class.text-slate-300]="storageService.activeTab() !== 'settings'"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-colors">
          <mat-icon class="text-[20px]">settings</mat-icon>
          Configurações
        </button>
      </div>
    </aside>
  `
})
export class Sidebar {
  public storageService = inject(StorageService);
  public automationEngine = inject(AutomationEngineService);
}
