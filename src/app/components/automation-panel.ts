import { Component, inject, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { StorageService } from '../services/storage.service';
import { AutomationEngineService } from '../services/automation-engine.service';
import { WorkflowNode } from '../models/company.model';

@Component({
  selector: 'app-automation-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatIconModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out h-full w-full">
      @if (!automationEngine.isEditingWorkflow()) {
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-xl font-bold text-[#0A192F]">Workflows de Automação</h2>
            <p class="text-sm text-slate-500 mt-1">Automatize interações e crie jornadas baseadas no comportamento.</p>
          </div>
          <div class="flex items-center gap-3">
            <div class="hidden md:flex items-center gap-4 mr-4">
              <div class="flex flex-col items-end">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Workflows Ativos</span>
                <div class="flex items-center gap-2">
                  <span class="text-lg font-bold text-emerald-600">{{ automationEngine.automationStats().active }}</span>
                  @if (automationEngine.automationStats().active > 0) {
                    <span class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  }
                </div>
              </div>
              <div class="h-8 w-px bg-slate-200"></div>
              <div class="flex flex-col items-end">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Em Execução</span>
                <span class="text-lg font-bold text-blue-600">{{ automationEngine.automationStats().runningStates }}</span>
              </div>
            </div>
            <button (click)="automationEngine.createNewWorkflow()" class="bg-[#0A192F] hover:bg-black text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/10">
              <mat-icon class="text-[18px]">add</mat-icon>
              Novo Workflow
            </button>
          </div>
        </div>

        @if (storageService.automations().length === 0) {
          <div class="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center max-w-2xl mx-auto mt-10">
            <div class="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 transform transition-transform hover:scale-110">
              <mat-icon class="text-4xl text-slate-300">smart_toy</mat-icon>
            </div>
            <h3 class="text-xl font-bold text-[#0A192F] mb-3">Nenhum workflow de automação ainda</h3>
            <p class="text-slate-500 leading-relaxed mb-8">
              Crie a sua primeira jornada automatizada. Configure gatilhos como 
              "Contacto Adicionado" e ações automáticas de email, delays e condições.
            </p>
            <button (click)="automationEngine.createNewWorkflow()" class="inline-flex items-center gap-2 bg-[#0A192F] hover:bg-black text-white px-8 py-3.5 rounded-2xl font-bold transition-all shadow-xl shadow-blue-900/10">
              <mat-icon>bolt</mat-icon>
              Criar Primeiro Workflow
            </button>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            @for (wf of storageService.automations(); track wf.id) {
              <div class="group bg-white border border-slate-100 rounded-3xl p-6 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 cursor-pointer flex flex-col relative overflow-hidden" 
                   (click)="automationEngine.editWorkflow(wf)"
                   (keydown.enter)="automationEngine.editWorkflow(wf)"
                   tabindex="0"
                   role="button"
                   [attr.aria-label]="'Editar workflow ' + wf.name">
                @if (wf.status === 'active') {
                  <div class="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-emerald-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700"></div>
                }

                <div class="flex items-center justify-between mb-6 relative z-10">
                  <div [class]="wf.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'" class="w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-300">
                    <mat-icon class="text-[24px]">{{ wf.status === 'active' ? 'bolt' : 'pause_circle' }}</mat-icon>
                  </div>
                  <div class="flex items-center gap-1">
                    <button (click)="automationEngine.toggleWorkflowStatus(wf, $event)" class="p-2 hover:bg-slate-50 rounded-xl transition-colors" [title]="wf.status === 'active' ? 'Pausar' : 'Ativar'">
                      <mat-icon class="text-[20px] text-slate-400 hover:text-[#0A192F]">{{ wf.status === 'active' ? 'pause' : 'play_arrow' }}</mat-icon>
                    </button>
                    <button (click)="automationEngine.deleteWorkflow(wf.id, $event)" class="p-2 hover:bg-rose-50 rounded-xl transition-colors group/del" title="Eliminar">
                      <mat-icon class="text-[20px] text-slate-300 group-hover/del:text-rose-500">delete_outline</mat-icon>
                    </button>
                  </div>
                </div>

                <div class="mb-6 relative z-10">
                  <h3 class="font-bold text-[#0A192F] text-lg group-hover:text-blue-900 transition-colors">{{ wf.name }}</h3>
                  <div class="flex items-center gap-2 mt-2">
                    <span [class]="wf.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'" class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                      {{ wf.status === 'active' ? 'Ativo' : 'Pausado' }}
                    </span>
                    <span class="text-[10px] text-slate-400 font-medium tracking-tight">Atualizado {{ wf.updatedAt | date:'shortDate' }}</span>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4 mt-auto border-t border-slate-50 pt-6 relative z-10">
                  <div class="flex flex-col">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Passos</span>
                    <span class="text-sm font-bold text-[#0A192F] flex items-center gap-1">
                      <mat-icon class="text-[14px]">account_tree</mat-icon>
                      {{ wf.steps.length }}
                    </span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Convertidos</span>
                    <span class="text-sm font-bold text-[#0A192F] flex items-center gap-1">
                      <mat-icon class="text-[14px] text-emerald-500">check_circle</mat-icon>
                      {{ wf.stats?.completed || 0 }}
                    </span>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        @if (!automationEngine.isEditingWorkflow() && storageService.automations().length > 0) {
          <div class="mt-12 bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h3 class="text-lg font-bold text-[#0A192F] flex items-center gap-2">
                  <mat-icon class="text-blue-600">sync</mat-icon>
                  Atividade em Tempo Real
                </h3>
                <p class="text-xs text-slate-500 mt-1">Monitoramento das jornadas ativas e conclusões recentes.</p>
              </div>
              @if (automationEngine.automationStats().runningStates > 0) {
                <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-100">
                  <span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <span class="text-[10px] font-bold text-blue-700 uppercase tracking-widest leading-none">Motor Ativo</span>
                </div>
              }
            </div>
            
            @if (automationEngine.activeStates().length > 0) {
              <div class="space-y-4">
                @for (state of automationEngine.activeStates(); track state.companyId + state.workflowId) {
                  <div class="group bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex items-center justify-between transition-all hover:bg-white hover:shadow-md hover:border-blue-100">
                    <div class="flex items-center gap-4">
                      <div class="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm transition-colors group-hover:text-blue-600">
                         <mat-icon>person</mat-icon>
                      </div>
                      <div>
                        <div class="flex items-center gap-2 mb-1">
                           <span class="font-bold text-slate-800 text-sm">{{ state.targetEmail }}</span>
                           <span class="px-2 py-0.5 text-[10px] font-bold rounded-lg uppercase tracking-wide border shadow-sm"
                             [class.bg-emerald-100]="state.status === 'running'" [class.text-emerald-800]="state.status === 'running'" [class.border-emerald-200]="state.status === 'running'"
                             [class.bg-amber-100]="state.status === 'paused'" [class.text-amber-800]="state.status === 'paused'" [class.border-amber-200]="state.status === 'paused'"
                             [class.bg-blue-100]="state.status === 'completed'" [class.text-blue-800]="state.status === 'completed'" [class.border-blue-200]="state.status === 'completed'">
                             {{ state.status === 'running' ? 'Em curso' : state.status === 'paused' ? 'Em pausa' : 'Concluído' }}
                           </span>
                        </div>
                        <div class="text-[11px] text-slate-500">
                           Fluxo: <span class="font-bold text-slate-700">{{ automationEngine.getWorkflowName(state.workflowId) }}</span>
                           <span class="mx-1 text-slate-300">•</span>
                           Etapa Atual: <span class="font-bold text-blue-600">{{ automationEngine.getCurrentNodeName(state.workflowId, state.currentNodeId) }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-8">
                      <div class="text-right">
                         <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Última Ação</div>
                         <div class="text-xs text-slate-700 font-bold font-mono">{{ state.lastActionTime | date:'HH:mm:ss' }}</div>
                      </div>
                      @if (state.status === 'completed' || state.status === 'failed') {
                        <button (click)="automationEngine.deleteAutomationState(state.workflowId, state.companyId, $event)" class="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all border border-transparent hover:border-rose-100" title="Limpar Registo">
                          <mat-icon class="text-[20px]">delete_sweep</mat-icon>
                        </button>
                      } @else {
                        <div class="w-10"></div>
                      }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                <mat-icon class="text-4xl text-slate-200 mb-2">sensors_off</mat-icon>
                <p class="text-sm text-slate-500 font-medium">Nenhuma atividade detectada recentemente.</p>
                <p class="text-[11px] text-slate-400 mt-1">Os estados aparecerão aqui assim que as automações forem despoletadas.</p>
              </div>
            }
          </div>
        }
      } @else if (automationEngine.isEditingWorkflow() && automationEngine.activeWorkflow(); as wf) {
        <!-- Workflow Editor -->
        <div class="flex flex-col h-full bg-[#f8fafc] -m-6 rounded-t-3xl overflow-hidden shadow-2xl border border-slate-200/50">
          <!-- Header Builder -->
          <div class="bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between sticky top-0 z-40">
            <div class="flex items-center gap-6">
              <button (click)="automationEngine.cancelEdit()" class="w-10 h-10 rounded-2xl bg-slate-100/50 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all group">
                <mat-icon class="text-[20px] group-hover:-translate-x-0.5 transition-transform">arrow_back</mat-icon>
              </button>
              <div class="flex flex-col">
                <div class="flex items-center gap-2 mb-1">
                  <input [formControl]="automationEngine.workflowNameControl" class="text-lg font-bold text-[#0A192F] focus:outline-none border-b-2 border-transparent focus:border-[#0A192F] bg-transparent pb-0.5 min-w-[200px]" placeholder="Nome do Workflow">
                  @if (automationEngine.workflowNameControl.invalid && automationEngine.workflowNameControl.touched) {
                    <mat-icon class="text-rose-500 text-sm" title="Nome obrigatório">error</mat-icon>
                  }
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest">
                    <mat-icon class="text-[12px]">schedule</mat-icon>
                    Gatilho:
                  </span>
                  <span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {{ wf.trigger.type === 'contact_added' ? 'Contacto Adicionado' : 'Entrada em Lista' }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4 bg-slate-50/50 p-1.5 rounded-2xl border border-slate-100">
               <button (click)="automationEngine.automationEditorTab.set('builder')" [class.bg-white]="automationEngine.automationEditorTab() === 'builder'" [class.shadow-lg]="automationEngine.automationEditorTab() === 'builder'" [class.text-[#0A192F]]="automationEngine.automationEditorTab() === 'builder'" class="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 text-slate-500">
                 <mat-icon class="text-[18px]">design_services</mat-icon>
                 Construtor
               </button>
               <button (click)="automationEngine.automationEditorTab.set('logs')" [class.bg-white]="automationEngine.automationEditorTab() === 'logs'" [class.shadow-lg]="automationEngine.automationEditorTab() === 'logs'" [class.text-[#0A192F]]="automationEngine.automationEditorTab() === 'logs'" class="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 text-slate-500">
                 <mat-icon class="text-[18px]">history</mat-icon>
                 Registos de Eventos
               </button>
            </div>

            <div class="flex items-center gap-3">
              <button (click)="automationEngine.saveWorkflow()" class="bg-[#0A192F] hover:bg-black text-white px-8 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 shadow-xl shadow-blue-900/10">
                <mat-icon class="text-[18px]">check</mat-icon>
                Guardar Workflow
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-hidden relative">
            @if (automationEngine.automationEditorTab() === 'builder') {
              <!-- Canvas do Builder -->
              <div class="h-full w-full overflow-auto bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] p-12">
                <div class="max-w-2xl mx-auto flex flex-col items-center gap-12">
                  
                  <!-- Trigger Node -->
                  <div class="relative w-full max-w-sm">
                    <div class="bg-blue-600 text-white rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                      <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                      <div class="flex items-center gap-4 relative z-10">
                        <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                          <mat-icon class="text-2xl">bolt</mat-icon>
                        </div>
                        <div>
                          <span class="text-[10px] font-bold text-blue-100 uppercase tracking-widest block mb-0.5">Ponto de Entrada</span>
                          <h4 class="font-bold text-lg leading-tight uppercase tracking-tight">
                            @if (wf.trigger.type === 'contact_added') {
                              Novo Contacto
                            } @else {
                              Entrou na Lista
                            }
                          </h4>
                        </div>
                      </div>
                      
                      <div class="mt-4 pt-4 border-t border-white/10">
                          <select [ngModel]="wf.trigger.type" (ngModelChange)="wf.trigger.type = $event; wf.updatedAt = Date.now()" class="w-full bg-white/10 border-0 text-xs font-bold rounded-lg px-3 py-2 outline-none appearance-none hover:bg-white/20 transition-colors">
                            <option value="contact_added">Ao adicionar qualquer contacto</option>
                            <option value="list_joined">Ao entrar numa lista específica</option>
                          </select>
                          @if (wf.trigger.type === 'list_joined') {
                            <div class="mt-2">
                               <select [ngModel]="wf.trigger.config?.listId" (ngModelChange)="wf.trigger.config = {listId: $event}; wf.updatedAt = Date.now()" class="w-full bg-white/20 border-0 text-xs font-bold rounded-lg px-3 py-2 outline-none">
                                  <option value="">Selecione uma lista...</option>
                                  @for (list of storageService.contactLists(); track list.id) {
                                    <option [value]="list.id">{{ list.name }}</option>
                                  }
                               </select>
                            </div>
                          }
                      </div>
                    </div>
                    
                    <!-- Linha Conectora -->
                    <div class="absolute top-full left-1/2 -translate-x-1/2 w-0.5 h-12 bg-blue-200">
                      <div class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
                        <button (click)="automationEngine.openAddNodeModal(wf.steps, 0)" class="w-8 h-8 rounded-full bg-white border-2 border-blue-100 flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-lg hover:scale-110">
                          <mat-icon class="text-[18px]">add</mat-icon>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Workflow Steps -->
                  <div class="flex flex-col items-center gap-12 w-full">
                    <ng-container *ngTemplateOutlet="stepsTmpl; context: {steps: wf.steps}"></ng-container>
                  </div>

                  <!-- End Node -->
                  <div class="flex flex-col items-center mt-4">
                    <div class="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                      <mat-icon>flag</mat-icon>
                    </div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Fim do Fluxo</span>
                  </div>
                </div>
              </div>
            } @else {
              <!-- Logs do Workflow -->
              <div class="h-full w-full bg-white p-8 overflow-y-auto">
                 <div class="max-w-4xl mx-auto">
                   <div class="flex items-center justify-between mb-8">
                     <div>
                       <h3 class="text-xl font-bold text-[#0A192F]">Registo de Atividade</h3>
                       <p class="text-sm text-slate-500">Últimos eventos processados por este workflow.</p>
                     </div>
                     <div class="flex items-center gap-3">
                        <div class="flex flex-col items-end mr-4">
                           <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Processados</span>
                           <span class="text-xl font-bold text-blue-600">{{ wf.stats?.entered || 0 }}</span>
                        </div>
                        <div class="h-8 w-px bg-slate-200 mr-2"></div>
                        <div class="flex flex-col items-end">
                           <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sucessos</span>
                           <span class="text-xl font-bold text-emerald-500 text-right">{{ wf.stats?.completed || 0 }}</span>
                        </div>
                     </div>
                   </div>

                   @if (!wf.logs || wf.logs.length === 0) {
                     <div class="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <mat-icon class="text-4xl text-slate-300 mb-2">history</mat-icon>
                        <p class="text-slate-500 font-medium">Nenhuma atividade registada ainda.</p>
                     </div>
                   } @else {
                     <div class="space-y-3">
                       @for (log of wf.logs; track log.timestamp) {
                         <div class="flex items-start gap-4 p-4 rounded-2xl border border-slate-50 hover:bg-slate-50/50 transition-colors">
                           <div [class]="log.type === 'error' ? 'bg-rose-100 text-rose-600' : (log.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600')" class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                              <mat-icon class="text-[18px]">
                                @if (log.type === 'error') { priority_high }
                                @else if (log.type === 'success') { check_circle }
                                @else { info }
                              </mat-icon>
                           </div>
                           <div class="flex-1 min-w-0">
                             <div class="flex items-center justify-between gap-2 mb-1">
                               <span class="font-bold text-sm text-[#0A192F] truncate">{{ log.companyName }}</span>
                               <span class="text-[10px] text-slate-400 shrink-0 font-medium tracking-tight">{{ log.timestamp | date:'short' }}</span>
                             </div>
                             <p class="text-xs text-slate-600 leading-relaxed">{{ log.message }}</p>
                           </div>
                         </div>
                       }
                     </div>
                   }
                 </div>
              </div>
            }
          </div>

          <!-- Sidebar de Configuração -->
          @if (automationEngine.selectedNode(); as node) {
            <div class="absolute top-[81px] right-0 bottom-0 w-80 bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 z-50">
              <div class="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                <div class="flex items-center gap-3">
                   <div [class]="(node.type.startsWith('action') ? 'bg-blue-100 text-blue-600' : (node.type.startsWith('condition') ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'))" class="w-10 h-10 rounded-xl flex items-center justify-center">
                     <mat-icon>
                        @if (node.type === 'action_email') { email }
                        @else if (node.type === 'delay') { schedule }
                        @else if (node.type === 'condition_opened') { drafts }
                        @else if (node.type === 'condition_clicked') { ads_click }
                        @else { settings }
                     </mat-icon>
                   </div>
                   <h4 class="font-bold text-[#0A192F] text-sm uppercase tracking-wider">Passo: {{ node.type }}</h4>
                </div>
                <button (click)="automationEngine.selectNode(null)" class="text-slate-400 hover:text-slate-600">
                  <mat-icon>close</mat-icon>
                </button>
              </div>

              <div class="flex-1 overflow-y-auto p-6 space-y-6">
                 @if (node.type === 'action_email') {
                   <div class="space-y-4">
                     <div>
                       <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Assunto do Email</label>
                       <input [(ngModel)]="node.config.subject" (ngModelChange)="wf.updatedAt = Date.now()" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] focus:border-[#0A192F] outline-none text-sm font-medium" placeholder="Assunto...">
                     </div>
                     <div>
                       <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Conteúdo (HTML)</label>
                       <textarea [(ngModel)]="node.config.body" (ngModelChange)="wf.updatedAt = Date.now()" rows="12" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] focus:border-[#0A192F] outline-none text-xs font-mono leading-relaxed" placeholder="HTML aqui..."></textarea>
                       <p class="text-[10px] text-slate-400 mt-2 italic">Dica: Use {{ '{{name}}' }} para personalizar.</p>
                     </div>
                   </div>
                 }

                 @if (node.type === 'delay') {
                   <div class="space-y-4">
                     <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col gap-2">
                           <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dias</label>
                           <input type="number" [(ngModel)]="node.config.days" (ngModelChange)="wf.updatedAt = Date.now()" class="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] outline-none text-sm font-bold">
                        </div>
                        <div class="flex flex-col gap-2">
                           <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horas</label>
                           <input type="number" [(ngModel)]="node.config.hours" (ngModelChange)="wf.updatedAt = Date.now()" class="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] outline-none text-sm font-bold">
                        </div>
                     </div>
                     <p class="text-[10px] text-slate-500 bg-blue-50 p-3 rounded-xl border border-blue-100 leading-relaxed italic">
                        O contacto aguardará este tempo após o passo anterior antes de prosseguir para o próximo bloco.
                     </p>
                   </div>
                 }

                 @if (node.type.startsWith('condition')) {
                   <div class="space-y-4">
                      <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Janela de Espera (Dias)</label>
                        <input type="number" [(ngModel)]="node.config.windowDays" (ngModelChange)="wf.updatedAt = Date.now()" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] outline-none text-sm font-bold">
                      </div>
                      <p class="text-[10px] text-slate-500 leading-relaxed p-4 bg-amber-50 rounded-2xl border border-amber-100 italic">
                         O fluxo aguardará a ação por este período. Se ocorrer, segue caminho "SIM" imediatamente. Se não ocorrer, se                       </p>
                    </div>
                  }

                  @if (node.type === 'action_webhook') {
                    <div class="space-y-4">
                      <div>
                        <label for="webhookUrl" class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">URL Endpoint</label>
                        <input id="webhookUrl" [(ngModel)]="node.config.url" (ngModelChange)="wf.updatedAt = Date.now()" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] outline-none text-sm" placeholder="https://api.myapp.com/webhook...">
                      </div>
                      <div>
                        <label for="webhookMethod" class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Método</label>
                        <select id="webhookMethod" [(ngModel)]="node.config.method" (ngModelChange)="wf.updatedAt = Date.now()" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] outline-none text-sm font-bold bg-white appearance-none">
                           <option value="POST">POST</option>
                           <option value="GET">GET</option>
                           <option value="PUT">PUT</option>
                        </select>
                      </div>
                      <div>
                        <label for="webhookPayload" class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Custom Payload (JSON)</label>
                        <textarea id="webhookPayload" [(ngModel)]="node.config.payload" (ngModelChange)="wf.updatedAt = Date.now()" rows="6" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0A192F] outline-none text-xs font-mono" placeholder='{"id": "contact_id_here"}'></textarea>
                      </div>
                    </div>
                  }
               </div>
                 }              </div>
                 }
              </div>

               <div class="p-4 border-t border-slate-50 bg-slate-50/50">
                 <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col">
                       <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Alcançados</span>
                       <span class="text-sm font-bold text-[#0A192F]">{{ node.stats?.reached || 0 }}</span>
                    </div>
                    <div class="flex flex-col">
                       <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Processados</span>
                       <span class="text-sm font-bold text-emerald-600">{{ node.stats?.processed || 0 }}</span>
                    </div>
                 </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Templates Recursivos para Blocos -->
      <ng-template #stepsTmpl let-steps="steps">
        @for (step of steps; track step.id; let i = $index) {
          <div class="flex flex-col items-center w-full max-w-sm relative">
             @if (step.type.startsWith('condition')) {
                <!-- Nó de Condição -->
                <div [class]="automationEngine.selectedNodeId() === step.id ? 'ring-4 ring-amber-100 border-amber-600' : 'border-slate-100 hover:border-amber-300'" class="bg-white border text-center rounded-3xl p-6 shadow-xl w-full transition-all group relative cursor-pointer" (click)="automationEngine.selectNode(step.id)">
                   <div class="absolute -top-3 -right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button (click)="automationEngine.removeNode(steps, i); $event.stopPropagation()" class="w-7 h-7 rounded-xl bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 shadow-lg shadow-rose-200">
                        <mat-icon class="text-[16px]">delete</mat-icon>
                      </button>
                   </div>
                   
                   <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                      <mat-icon class="text-[24px]">
                        {{ step.type === 'condition_opened' ? 'drafts' : 'ads_click' }}
                      </mat-icon>
                   </div>
                   <h5 class="text-xs font-bold text-[#0A192F] uppercase tracking-wider mb-1">
                      {{ step.type === 'condition_opened' ? 'Abriu Email?' : 'Clicou Link?' }}
                   </h5>
                   <p class="text-[10px] text-slate-400 font-medium">Prazo: {{ step.config?.windowDays || 3 }} dias</p>
                </div>

                <!-- Bifurcação -->
                <div class="w-full flex justify-between mt-12 mb-12 relative h-12">
                   <!-- RAMO SIM (Esquerda) -->
                   <div class="flex-1 flex flex-col items-center">
                     <div class="absolute top-[-48px] left-[50%] w-px h-12 bg-amber-200 transform origin-top -rotate-45"></div>
                     <div class="w-px h-full bg-emerald-200"></div>
                     <span class="absolute top-[-10px] left-[15%] text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full border border-emerald-50">Sim</span>
                     <div class="flex flex-col items-center w-full mt-2">
                        <button (click)="automationEngine.openAddNodeModal(step.yesBranch!, 0)" class="w-6 h-6 rounded-full bg-white border border-emerald-100 flex items-center justify-center text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-sm">
                          <mat-icon class="text-[14px]">add</mat-icon>
                        </button>
                        <div class="flex flex-col items-center gap-12 mt-8 w-full">
                           <ng-container *ngTemplateOutlet="stepsTmpl; context: {steps: step.yesBranch}"></ng-container>
                        </div>
                     </div>
                   </div>

                   <!-- RAMO NÃO (Direita) -->
                   <div class="flex-1 flex flex-col items-center border-l-2 border-slate-50">
                     <div class="absolute top-[-48px] right-[50%] w-px h-12 bg-amber-200 transform origin-top rotate-45"></div>
                     <div class="w-px h-full bg-rose-200"></div>
                     <span class="absolute top-[-10px] right-[15%] text-[9px] font-bold text-rose-600 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full border border-rose-50">Não</span>
                     <div class="flex flex-col items-center w-full mt-2">
                        <button (click)="automationEngine.openAddNodeModal(step.noBranch!, 0)" class="w-6 h-6 rounded-full bg-white border border-rose-100 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                          <mat-icon class="text-[14px]">add</mat-icon>
                        </button>
                        <div class="flex flex-col items-center gap-12 mt-8 w-full">
                           <ng-container *ngTemplateOutlet="stepsTmpl; context: {steps: step.noBranch}"></ng-container>
                        </div>
                     </div>
                   </div>
                </div>
             } @else {
                <!-- Nó de Ação Normal -->
                <div [class]="automationEngine.selectedNodeId() === step.id ? 'ring-4 ring-blue-100 border-blue-600' : 'border-slate-100 hover:border-blue-300'" class="bg-white border rounded-3xl p-6 shadow-xl w-full relative transition-all group cursor-pointer" (click)="automationEngine.selectNode(step.id)">
                   <div class="absolute -top-3 -right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button (click)="automationEngine.removeNode(steps, i); $event.stopPropagation()" class="w-7 h-7 rounded-xl bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 shadow-lg shadow-rose-200">
                        <mat-icon class="text-[16px]">delete</mat-icon>
                      </button>
                   </div>
                   
                   <div class="flex items-center gap-4">
                      <div [class]="step.type === 'delay' ? 'bg-slate-100 text-slate-500' : (step.type === 'action_webhook' ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600')" class="w-12 h-12 rounded-2xl flex items-center justify-center">
                        <mat-icon class="text-[24px]">
                          @if (step.type === 'action_email') { email }
                          @else if (step.type === 'delay') { timer }
                          @else if (step.type === 'action_webhook') { webhook }
                          @else { extension }
                        </mat-icon>
                      </div>
                      <div class="flex-1 min-w-0">
                         <h5 class="text-xs font-bold text-[#0A192F] uppercase tracking-wider mb-0.5">
                            @if (step.type === 'action_email') { Enviar Email }
                            @else if (step.type === 'delay') { Aguardar Prazo }
                            @else if (step.type === 'action_webhook') { Enviar Webhook }
                         </h5>
                         <p class="text-[10px] text-slate-400 font-medium truncate">
                            @if (step.type === 'action_email') { {{ step.config?.subject || 'Sem Assunto' }} }
                            @else if (step.type === 'delay') { {{ step.config?.days || 0 }}d {{ step.config?.hours || 0 }}h }
                            @else if (step.type === 'action_webhook') { {{ step.config?.method || 'POST' }}: {{ step.config?.url || 'Sem URL' }} }
                         </p>
                      </div>
                   </div>
                </div>

                <!-- Próximo Nó ou Botão de Adição -->
                @if (i < steps.length - 1) {
                  <div class="w-px h-12 bg-blue-100"></div>
                }
                
                <div class="absolute top-[calc(100%-8px)] left-1/2 -translate-x-1/2 z-10">
                   <button (click)="automationEngine.openAddNodeModal(steps, i + 1)" class="w-6 h-6 rounded-full bg-white border border-blue-100 flex items-center justify-center text-blue-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm">
                     <mat-icon class="text-[14px]">add</mat-icon>
                   </button>
                </div>
             }
          </div>
        }
      </ng-template>

      <!-- Modal de Adição de Passo -->
      @if (automationEngine.isAddingNodeModalOpen()) {
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" (click)="automationEngine.closeAddNodeModal()">
           <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" (click)="$event.stopPropagation()">
              <div class="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                 <div>
                    <h3 class="text-xl font-bold text-[#0A192F]">Adicionar Novo Passo</h3>
                    <p class="text-sm text-slate-500">Escolha o tipo de operação para inserir.</p>
                 </div>
                 <button (click)="automationEngine.closeAddNodeModal()" class="w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all">
                    <mat-icon>close</mat-icon>
                 </button>
              </div>

              <div class="p-8 grid grid-cols-1 gap-4">
                 <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ações</div>
                 <button (click)="automationEngine.addWorkflowStep('action_email')" class="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-all text-left group">
                    <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                       <mat-icon>email</mat-icon>
                    </div>
                    <div>
                       <h5 class="text-sm font-bold text-[#0A192F]">Enviar Email Personalizado</h5>
                       <p class="text-[11px] text-slate-500">Envia uma mensagem automática p/ o contacto.</p>
                    </div>
                 </button>

                 <button (click)="automationEngine.addWorkflowStep('delay')" class="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 hover:border-slate-300 transition-all text-left group">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                       <mat-icon>timer</mat-icon>
                    </div>
                    <div>
                       <h5 class="text-sm font-bold text-[#0A192F]">Aguardar Prazo (Delay)</h5>
                       <p class="text-[11px] text-slate-500">Espera um tempo definido antes de prosseguir.</p>
                    </div>
                 </button>

                 <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1">Condições</div>
                 <button (click)="automationEngine.addWorkflowStep('condition_opened')" class="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:bg-amber-50 hover:border-amber-200 transition-all text-left group">
                    <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                       <mat-icon>drafts</mat-icon>
                    </div>
                    <div>
                       <h5 class="text-sm font-bold text-[#0A192F]">Verificar Abertura de Email</h5>
                       <p class="text-[11px] text-slate-500">Bifurca o fluxo se o email for aberto ou não.</p>
                    </div>
                 </button>

                 <button (click)="automationEngine.addWorkflowStep('action_webhook')" class="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition-all text-left group">
                    <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                       <mat-icon>webhook</mat-icon>
                    </div>
                    <div>
                       <h5 class="text-sm font-bold text-[#0A192F]">Enviar Webhook (Avançado)</h5>
                       <p class="text-[11px] text-slate-500">Notifica um sistema externo via URL.</p>
                    </div>
                 </button>
              </div>
           </div>
        </div>
      }

      <!-- Delete Workflow Modal -->
      @if (automationEngine.workflowToDeleteId()) {
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200" (click)="automationEngine.cancelDeleteWorkflow()">
          <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20 relative z-10" (click)="$event.stopPropagation()">
            <div class="px-8 pt-8 pb-4 flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-100 flex-shrink-0">
                  <mat-icon class="text-2xl">warning</mat-icon>
                </div>
                <div>
                  <h3 class="text-xl font-black text-[#0A192F] tracking-tighter leading-none mb-1">Eliminar Automação</h3>
                  <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">Ação Irreversível</p>
                </div>
              </div>
            </div>

            <div class="px-8 pb-8 space-y-6">
              <div class="p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-4">
                <div class="flex-1">
                  <p class="text-xs text-rose-900 font-bold mb-1">Tem a certeza que deseja eliminar esta automação?</p>
                  <p class="text-[11px] text-rose-700 leading-relaxed">Todos os passos, configurações e estados de execução ativos de {{ automationEngine.getWorkflowName(automationEngine.workflowToDeleteId() || '') }} serão removidos permanentemente.</p>
                </div>
              </div>

              <div class="flex items-center gap-4">
                <button type="button" (click)="automationEngine.cancelDeleteWorkflow()" [disabled]="automationEngine.isDeletingWorkflow()" class="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-600 font-bold uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50">
                  Cancelar
                </button>
                <button type="button" (click)="automationEngine.confirmDeleteWorkflow()" [disabled]="automationEngine.isDeletingWorkflow()"
                        class="flex-[2] px-6 py-4 bg-rose-600 text-white font-bold uppercase tracking-widest text-[10px] rounded-2xl hover:bg-rose-700 shadow-xl shadow-rose-100 transition-all transform active:scale-95 disabled:opacity-75 disabled:active:scale-100 flex items-center justify-center gap-2">
                  @if (automationEngine.isDeletingWorkflow()) {
                    <mat-icon class="animate-spin text-[16px]">autorenew</mat-icon>
                    A Eliminar...
                  } @else {
                    Confirmar Eliminação
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Delete Activity State Modal -->
      @if (automationEngine.stateToDelete(); as state) {
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200" (click)="automationEngine.cancelDeleteState()">
          <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20 relative z-10" (click)="$event.stopPropagation()">
            <div class="px-8 pt-8 pb-4 flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 flex-shrink-0">
                  <mat-icon class="text-2xl">delete_sweep</mat-icon>
                </div>
                <div>
                  <h3 class="text-xl font-black text-[#0A192F] tracking-tighter leading-none mb-1">Limpar Atividade</h3>
                  <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">Historial do Monitor</p>
                </div>
              </div>
            </div>

            <div class="px-8 pb-8 space-y-6">
              <div class="p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                <p class="text-xs text-blue-900 font-bold mb-1">Deseja remover este registo?</p>
                <p class="text-[11px] text-blue-700 leading-relaxed">O estado de <b>{{ state.companyId }}</b> será removido do painel de monitoramento. Isto é apenas visual e não afeta o contacto ou o fluxo.</p>
              </div>

              <div class="flex items-center gap-4">
                <button type="button" (click)="automationEngine.cancelDeleteState()" class="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-600 font-bold uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-50 transition-all">
                  Voltar
                </button>
                <button type="button" (click)="automationEngine.confirmDeleteState()" 
                        class="flex-[2] px-6 py-4 bg-blue-600 text-white font-bold uppercase tracking-widest text-[10px] rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all transform active:scale-95">
                  Sim, Limpar
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; width: 100%; }
  `]
})
export class AutomationPanel {
  public storageService = inject(StorageService);
  public automationEngine = inject(AutomationEngineService);
  public Date = Date;

  onTemplateSelectChange(event: Event, node: WorkflowNode) {
    const select = event.target as HTMLSelectElement;
    const templateId = select.value;
    if (!templateId) return;

    const template = this.storageService.emailTemplates().find(t => t.id === templateId);
    if (template && node.config) {
      node.config.templateId = templateId;
      node.config.subject = template.subject;
      node.config.body = template.body || ''; 
      
      const wf = this.automationEngine.activeWorkflow();
      if (wf) wf.updatedAt = Date.now();
    }
  }
}
