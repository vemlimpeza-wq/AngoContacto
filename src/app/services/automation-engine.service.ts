import { Injectable, inject, PLATFORM_ID, OnDestroy, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormControl, Validators } from '@angular/forms';
import { StorageService } from './storage.service';
import { EmailService } from './email.service';
import { GeminiService } from './gemini.service';
import { AutomationWorkflow, WorkflowNode, Company, EmailCampaign, WorkflowNodeType } from '../models/company.model';

export interface WorkflowExecutionState {
  workflowId: string;
  companyId: string;
  targetEmail: string;
  currentNodeId: string;
  entryTime: number;
  lastActionTime: number;
  status: 'running' | 'completed' | 'failed' | 'paused';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables: Record<string, any>;
  path: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AutomationEngineService implements OnDestroy {
  private storageService = inject(StorageService);
  private emailService = inject(EmailService);
  private geminiService = inject(GeminiService);
  private platformId = inject(PLATFORM_ID);
  
  private readonly STATE_KEY = 'angocontacts_workflow_states';
  private statesSignal = signal<WorkflowExecutionState[]>([]);
  
  public activeStates = computed(() => this.statesSignal());
  
  // Editor State
  public isEditingWorkflow = signal<boolean>(false);
  public activeWorkflow = signal<AutomationWorkflow | null>(null);
  public workflowNameControl = new FormControl('', Validators.required);
  public selectedNodeId = signal<string | null>(null);
  public automationEditorTab = signal<'builder' | 'logs'>('builder');
  public isAddingNodeModalOpen = signal<boolean>(false);
  public nodeInsertContext = signal<{steps: WorkflowNode[], index: number} | null>(null);

  public automationStats = computed(() => {
    const automations = this.storageService.automations();
    return {
      total: automations.length,
      active: automations.filter(a => a.status === 'active').length,
      paused: automations.filter(a => a.status === 'paused').length,
      completed: automations.reduce((acc, a) => acc + (a.stats?.completed || 0), 0),
      emailsSent: automations.reduce((acc, a) => acc + (a.stats?.emailsSent || 0), 0),
      runningStates: this.statesSignal().filter(s => s.status === 'running').length
    };
  });

  public selectedNode = computed(() => {
    const wf = this.activeWorkflow();
    const nodeId = this.selectedNodeId();
    if (!wf || !nodeId) return null;
    return this.findNodeById(wf.steps, nodeId);
  });

  public openAddNodeModal(steps: WorkflowNode[], index: number) {
    this.nodeInsertContext.set({steps, index});
    this.isAddingNodeModalOpen.set(true);
  }

  public closeAddNodeModal() {
    this.isAddingNodeModalOpen.set(false);
    this.nodeInsertContext.set(null);
  }

  public addWorkflowStep(type: WorkflowNodeType) {
    const context = this.nodeInsertContext();
    if (!context) return;
    
    const newNode: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      config: type === 'delay' ? { days: 1 } : 
              type === 'condition_opened' ? { windowDays: 3 } : 
              type === 'condition_clicked' ? { windowDays: 3 } : 
              type === 'action_notify_admin' ? { title: 'Alerta', status: 'info', message: 'Um contacto atingiu este passo.' } : 
              type === 'action_webhook' ? { url: '', method: 'POST', payload: '{\n  "contactId": "{{contact.id}}",\n  "email": "{{contact.email}}"\n}' } :
              {},
      ...(type.startsWith('condition') ? { yesBranch: [], noBranch: [] } : {}),
      stats: { reached: 0, processed: 0 }
    };

    context.steps.splice(context.index, 0, newNode);
    this.activeWorkflow.update(v => v ? {...v, updatedAt: Date.now()} : v);
    this.closeAddNodeModal();
  }

  public selectNode(nodeId: string | null) {
    this.selectedNodeId.set(nodeId);
  }

  public createNewWorkflow() {
    const newWorkflow: AutomationWorkflow = {
      id: crypto.randomUUID(),
      name: 'Novo Workflow',
      status: 'paused',
      trigger: { type: 'contact_added', config: {} },
      steps: [
        {
          id: crypto.randomUUID(),
          type: 'action_email',
          config: { subject: 'Bem-vindo!', body: '<p>Olá {{name}},</p><p>Obrigado por nos contactar.</p>' },
          stats: { reached: 0, processed: 0 }
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: { entered: 0, completed: 0, emailsSent: 0, emailsWaiting: 0 },
      logs: []
    };

    this.activeWorkflow.set(newWorkflow);
    this.workflowNameControl.setValue(newWorkflow.name);
    this.isEditingWorkflow.set(true);
    this.automationEditorTab.set('builder');
  }

  public editWorkflow(workflow: AutomationWorkflow) {
    this.activeWorkflow.set(JSON.parse(JSON.stringify(workflow)));
    this.workflowNameControl.setValue(workflow.name);
    this.isEditingWorkflow.set(true);
    this.automationEditorTab.set('builder');
    this.selectedNodeId.set(null);
  }

  public saveWorkflow() {
    const wf = this.activeWorkflow();
    if (!wf) return;

    wf.name = this.workflowNameControl.value || 'Workflow Sem Nome';
    wf.updatedAt = Date.now();

    const currentAutomations = [...this.storageService.automations()];
    const index = currentAutomations.findIndex(a => a.id === wf.id);
    
    if (index !== -1) {
      currentAutomations[index] = wf;
    } else {
      currentAutomations.unshift(wf);
    }

    this.storageService.saveAutomations(currentAutomations);
    this.isEditingWorkflow.set(false);
    this.activeWorkflow.set(null);
    this.storageService.showToast('Workflow Salvo', `O workflow "${wf.name}" foi salvo com sucesso.`, 'success');
  }

  public cancelEdit() {
    this.isEditingWorkflow.set(false);
    this.activeWorkflow.set(null);
    this.selectedNodeId.set(null);
  }

  public toggleWorkflowStatus(workflow: AutomationWorkflow, event?: Event) {
    if (event) event.stopPropagation();
    const newStatus = workflow.status === 'active' ? 'paused' : 'active';
    
    const automations = [...this.storageService.automations()];
    const idx = automations.findIndex(a => a.id === workflow.id);
    if (idx !== -1) {
      automations[idx].status = newStatus;
      this.storageService.saveAutomations(automations);
      
      if (newStatus === 'active') {
        this.handleWorkflowActivated(automations[idx]);
      }
      
      this.storageService.showToast(
        newStatus === 'active' ? 'Workflow Ativado' : 'Workflow Pausado',
        `O workflow "${workflow.name}" está agora ${newStatus === 'active' ? 'ativo' : 'pausado'}.`,
        'info'
      );
    }
  }

  public workflowToDeleteId = signal<string | null>(null);
  public isDeletingWorkflow = signal<boolean>(false);

  public deleteWorkflow(id: string, event?: Event) {
    if (event) event.stopPropagation();
    this.workflowToDeleteId.set(id);
  }

  public confirmDeleteWorkflow() {
    const id = this.workflowToDeleteId();
    if (!id) return;
    
    this.isDeletingWorkflow.set(true);
    // Simulate some delay or just perform
    setTimeout(() => {
      const automations = this.storageService.automations().filter(a => a.id !== id);
      this.storageService.saveAutomations(automations);
      this.clearStatesForWorkflow(id);
      this.storageService.showToast('Workflow Apagado', 'O workflow foi removido.', 'info');
      this.workflowToDeleteId.set(null);
      this.isDeletingWorkflow.set(false);
    }, 500);
  }

  public cancelDeleteWorkflow() {
    this.workflowToDeleteId.set(null);
  }

  public removeNode(steps: WorkflowNode[], index: number) {
    if (confirm('Deseja remover este passo e todos os elementos abaixo dele?')) {
      steps.splice(index, 1);
      this.activeWorkflow.update(v => v ? {...v, updatedAt: Date.now()} : v);
      this.selectedNodeId.set(null);
    }
  }

  public getWorkflowName(id: string): string {
    return this.storageService.automations().find(a => a.id === id)?.name || 'Workflow Desconhecido';
  }

  public getNodeTypeName(type: string): string {
    const names: Record<string, string> = {
      'action_email': 'Envio de Email',
      'action_update_contact': 'Atualizar Contacto',
      'action_add_tag': 'Adicionar Tag',
      'action_remove_tag': 'Remover Tag',
      'action_notify_admin': 'Notificação Administrativa',
      'condition_opened': 'Verificação de Abertura',
      'condition_clicked': 'Verificação de Clique',
      'condition_attribute': 'Filtro de Atributo',
      'delay': 'Atraso de Tempo',
      'wait_until': 'Aguardar Data'
    };
    return names[type] || type;
  }

  public getCurrentNodeName(workflowId: string, nodeId: string): string {
    const wf = this.storageService.automations().find(a => a.id === workflowId);
    if (!wf) return 'Etapa desconhecida';
    
    const findNode = (nodes: WorkflowNode[]): WorkflowNode | undefined => {
      for (const node of nodes) {
        if (node.id === nodeId) return node;
        if (node.yesBranch) {
          const found = findNode(node.yesBranch);
          if (found) return found;
        }
        if (node.noBranch) {
          const found = findNode(node.noBranch);
          if (found) return found;
        }
      }
      return undefined;
    };

    const node = findNode(wf.steps);
    return node ? this.getNodeTypeName(node.type) : 'Fim do fluxo';
  }

  public stateToDelete = signal<{workflowId: string, companyId: string} | null>(null);

  public deleteAutomationState(workflowId: string, companyId: string, event?: Event) {
    if (event) event.stopPropagation();
    this.stateToDelete.set({workflowId, companyId});
  }

  public confirmDeleteState() {
    const state = this.stateToDelete();
    if (!state) return;
    this.deleteState(state.workflowId, state.companyId);
    this.storageService.addNotification('Atividade Eliminada', 'A atividade foi removida do monitoramento.', 'success');
    this.stateToDelete.set(null);
  }

  public cancelDeleteState() {
    this.stateToDelete.set(null);
  }

  constructor() {
    this.loadStates();
    if (isPlatformBrowser(this.platformId)) {
      this.intervalId = setInterval(() => this.tick(), 60000); // Check every minute
    }
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private loadStates() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const data = localStorage.getItem(this.STATE_KEY);
      if (data) {
        this.statesSignal.set(JSON.parse(data));
      }
    } catch (e) {
      console.error('Failed to load workflow states', e);
    }
  }

  private saveStates() {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.STATE_KEY, JSON.stringify(this.statesSignal()));
  }

  public clearStatesForWorkflow(workflowId: string) {
    this.statesSignal.update(states => states.filter(s => s.workflowId !== workflowId));
    this.saveStates();
  }

  public deleteState(workflowId: string, companyId: string) {
    this.statesSignal.update(states => states.filter(s => !(s.workflowId === workflowId && s.companyId === companyId)));
    this.saveStates();
  }

  public triggerContactAdded(company: Company) {
    const automations = this.storageService.automations();
    const activeAutomations = automations.filter(a => a.status === 'active' && a.trigger.type === 'contact_added');
    
    this.statesSignal.update(states => {
      const newStates = [...states];
      for (const wf of activeAutomations) {
        if (!wf.steps || wf.steps.length === 0) continue;
        
        // Check if company is already in this workflow
        if (newStates.some(s => s.workflowId === wf.id && s.companyId === company.id && s.status === 'running')) {
          continue;
        }

        const email = company.emails && company.emails.length > 0 ? company.emails[0] : null;
        if (!email) continue;
        
        const firstNode = wf.steps[0];
        
        newStates.push({
          workflowId: wf.id,
          companyId: company.id,
          targetEmail: email,
          currentNodeId: firstNode.id,
          entryTime: Date.now(),
          lastActionTime: Date.now(),
          status: 'running',
          variables: {},
          path: []
        });
        
        // Update entry stats
        this.updateWorkflowStats(wf.id, 'entered');
      }
      return newStates;
    });
    
    this.saveStates();
  }

  public handleWorkflowActivated(workflow: AutomationWorkflow) {
    if (workflow.status !== 'active') return;

    let shouldTick = false;

    // If it's a list_joined trigger, we want to evaluate contacts currently in the list
    if (workflow.trigger.type === 'list_joined' && workflow.trigger.config?.listId) {
       const listId = workflow.trigger.config.listId;
       const list = this.storageService.contactLists().find(l => l.id === listId);
       
       if (list && list.companyIds && list.companyIds.length > 0) {
           const companies = this.storageService.savedCompanies().filter(c => list.companyIds.includes(c.id));
           
           this.statesSignal.update(states => {
               const newStates = [...states];
               for (const company of companies) {
                   if (!workflow.steps || workflow.steps.length === 0) break;
                   
                   // Skip if already in workflow (even if completed or paused, we don't double entry for now)
                   if (newStates.some(s => s.workflowId === workflow.id && s.companyId === company.id)) {
                       continue;
                   }

                   const email = company.emails && company.emails.length > 0 ? company.emails[0] : null;
                   if (!email) continue;
                   
                   const firstNode = workflow.steps[0];
                   
                   newStates.push({
                     workflowId: workflow.id,
                     companyId: company.id,
                     targetEmail: email,
                     currentNodeId: firstNode.id,
                     entryTime: Date.now(),
                     lastActionTime: Date.now(),
                     status: 'running',
                     variables: {},
                     path: []
                   });
                   
                   this.updateWorkflowStats(workflow.id, 'entered');
                   shouldTick = true;
               }
               return newStates;
           });
           
           this.saveStates();
       }
    }

    // Always tick when activating a workflow to immediately process newly resumed paused nodes
    if (!shouldTick) {
       // Even if no new contacts, we might need to tick for paused ones that became unpaused
       this.statesSignal.update(states => {
           const newStates = [...states];
           for (const state of newStates) {
               if (state.workflowId === workflow.id && state.status === 'paused') {
                   state.status = 'running';
                   state.lastActionTime = Date.now(); // reset timer perhaps? or leave as is.
                   shouldTick = true;
               }
           }
           return newStates;
       });
       this.saveStates();
    }
    
    // Force immediate tick asynchronously
    setTimeout(() => this.tick(), 100);
  }

  public triggerListJoined(company: Company, listId: string) {
    const automations = this.storageService.automations();
    const activeAutomations = automations.filter(a => a.status === 'active' && a.trigger.type === 'list_joined' && a.trigger.config?.listId === listId);
    
    this.statesSignal.update(states => {
      const newStates = [...states];
      for (const wf of activeAutomations) {
        if (!wf.steps || wf.steps.length === 0) continue;
        
        if (newStates.some(s => s.workflowId === wf.id && s.companyId === company.id && s.status === 'running')) {
          continue;
        }

        const email = company.emails && company.emails.length > 0 ? company.emails[0] : null;
        if (!email) continue;
        
        const firstNode = wf.steps[0];
        
        newStates.push({
          workflowId: wf.id,
          companyId: company.id,
          targetEmail: email,
          currentNodeId: firstNode.id,
          entryTime: Date.now(),
          lastActionTime: Date.now(),
          status: 'running',
          variables: {},
          path: []
        });
        
        this.updateWorkflowStats(wf.id, 'entered');
        this.logWorkflowEvent(wf.id, company.name, 'Contacto entrou no fluxo (Trigger: Adicionado à Lista)', 'info');
      }
      return newStates;
    });
    
    this.saveStates();
  }

  private logWorkflowEvent(wfId: string, companyName: string, message: string, type: 'success' | 'error' | 'info' = 'info') {
    const automations = [...this.storageService.automations()];
    const idx = automations.findIndex(a => a.id === wfId);
    if (idx !== -1) {
      const wf = JSON.parse(JSON.stringify(automations[idx]));
      if (!wf.logs) wf.logs = [];
      wf.logs.unshift({
        timestamp: Date.now(),
        companyName,
        message,
        type
      });
      // Keep only last 100 logs
      if (wf.logs.length > 100) wf.logs = wf.logs.slice(0, 100);
      automations[idx] = wf;
      this.storageService.saveAutomations(automations);
    }
  }

  private updateWorkflowStats(wfId: string, metric: 'entered' | 'completed' | 'waiting' | 'sent', value = 1) {
    const automations = [...this.storageService.automations()];
    const idx = automations.findIndex(a => a.id === wfId);
    if (idx !== -1) {
      const wf = JSON.parse(JSON.stringify(automations[idx]));
      if (!wf.stats) wf.stats = { entered: 0, completed: 0, emailsSent: 0, emailsWaiting: 0 };
      
      if (metric === 'entered') wf.stats.entered = (wf.stats.entered || 0) + value;
      if (metric === 'completed') wf.stats.completed = (wf.stats.completed || 0) + value;
      if (metric === 'waiting') wf.stats.emailsWaiting = (wf.stats.emailsWaiting || 0) + value;
      if (metric === 'sent') {
        wf.stats.emailsSent = (wf.stats.emailsSent || 0) + value;
        wf.stats.emailsWaiting = Math.max(0, (wf.stats.emailsWaiting || 0) - value);
      }
      
      automations[idx] = wf;
      this.storageService.saveAutomations(automations);
    }
  }

  private async tick() {
    const timeNow = Date.now();
    let hasChanges = false;
    
    const currentStates = this.statesSignal();
    const nextStates = [...currentStates];

    for (const state of nextStates) {
      if (state.status !== 'running') continue;
      
      const wf = this.storageService.automations().find(a => a.id === state.workflowId);
      if (!wf || wf.status !== 'active') {
        state.status = 'paused';
        hasChanges = true;
        continue;
      }
      
      const node = this.findNodeById(wf.steps, state.currentNodeId);
      if (!node) {
        this.completeExecution(state, wf);
        hasChanges = true;
        continue;
      }
      
      const canAdvance = await this.evaluateNode(state, node, wf, timeNow);
      
      // Update Node Stats
      this.incrementNodeStat(wf.id, node.id, 'reached');

      if (canAdvance.advance) {
        this.incrementNodeStat(wf.id, node.id, 'processed');
        if (canAdvance.nextNodeId) {
          state.path.push(state.currentNodeId);
          state.currentNodeId = canAdvance.nextNodeId;
          state.lastActionTime = timeNow;
        } else {
          this.completeExecution(state, wf);
        }
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.statesSignal.set(nextStates);
      this.saveStates();
    }
  }
  
  private completeExecution(state: WorkflowExecutionState, wf: AutomationWorkflow) {
     state.status = 'completed';
     const updatedWf = { ...wf, stats: { ...wf.stats, completed: (wf.stats.completed || 0) + 1} };
     const allWfs = [...this.storageService.automations()];
     const idx = allWfs.findIndex(a => a.id === wf.id);
     if (idx !== -1) {
       allWfs[idx] = updatedWf;
       this.storageService.saveAutomations(allWfs);
     }
  }

  private findNodeById(nodes: WorkflowNode[], id: string): WorkflowNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.yesBranch) {
        const found = this.findNodeById(node.yesBranch, id);
        if (found) return found;
      }
      if (node.noBranch) {
        const found = this.findNodeById(node.noBranch, id);
        if (found) return found;
      }
    }
    return null;
  }
  
  private findNextSiblingInList(nodes: WorkflowNode[], currentId: string): string | null {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === currentId) {
            if (i < nodes.length - 1) {
                return nodes[i+1].id;
            } else {
                return null;
            }
        }
        if (nodes[i].yesBranch) {
            const nextInYes = this.findNextSiblingInList(nodes[i].yesBranch!, currentId);
            if (nextInYes !== undefined) return nextInYes; // could be string or null
        }
        if (nodes[i].noBranch) {
            const nextInNo = this.findNextSiblingInList(nodes[i].noBranch!, currentId);
            if (nextInNo !== undefined) return nextInNo;
        }
    }
    return undefined as unknown as string; // Not found in this branch
  }

  private incrementNodeStat(wfId: string, nodeId: string, metric: 'reached' | 'processed') {
    const automations = [...this.storageService.automations()];
    const wfIdx = automations.findIndex(a => a.id === wfId);
    if (wfIdx === -1) return;

    const wf = { ...automations[wfIdx], steps: this.cloneSteps(automations[wfIdx].steps) };
    const node = this.findNodeById(wf.steps, nodeId);
    
    if (node) {
      if (!node.stats) node.stats = { reached: 0, processed: 0 };
      if (metric === 'reached') node.stats.reached++;
      if (metric === 'processed') node.stats.processed++;
      
      automations[wfIdx] = wf;
      this.storageService.saveAutomations(automations);
    }
  }

  private cloneSteps(steps: WorkflowNode[]): WorkflowNode[] {
    return JSON.parse(JSON.stringify(steps));
  }

  private async evaluateNode(
    state: WorkflowExecutionState, 
    node: WorkflowNode, 
    wf: AutomationWorkflow,
    timeNow: number
  ): Promise<{advance: boolean, nextNodeId?: string}> {
    
    const nextNodeId = this.findNextSiblingInList(wf.steps, node.id) || undefined;
    
    if (node.type === 'delay') {
      const days = node.config?.days || 0;
      const hours = node.config?.hours || 0;
      const minutes = node.config?.minutes || 1; // Default to 1m for testing
      const msDelay = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
      
      if (timeNow >= state.lastActionTime + msDelay) {
        return { advance: true, nextNodeId };
      }
      return { advance: false };
    }
    
       if (node.type === 'action_email') {
       // Send Email
       const company = this.storageService.savedCompanies().find(c => c.id === state.companyId);
       if (!company) {
         state.status = 'failed';
         return { advance: false };
       }
       
       const subject = node.config?.subject || 'AngoContacts Automation';
       const body = node.config?.body || 'Conteúdo do email';
       
       const finalBody = this.replaceVariables(body, company);
       const finalSubject = this.replaceVariables(subject, company);
       
       // Update waiting stats
       this.updateWorkflowStats(wf.id, 'waiting', 1);
       
       try {
         await this.executeActionEmail(company, state.targetEmail, finalSubject, finalBody, wf.id);
         return { advance: true, nextNodeId };
       } catch (e) {
         console.error('Automation Email execution failed:', e);
         return { advance: false }; // Try again next tick
       }
    }

    if (node.type === 'action_webhook') {
      const company = this.storageService.savedCompanies().find(c => c.id === state.companyId);
      if (company) {
        let payloadString = node.config?.payload || '';
        payloadString = this.replaceVariables(payloadString, company);
        const url = this.replaceVariables(node.config?.url || '', company);
        const method = node.config?.method || 'POST';

        // Fake network call for the prototype
        console.log(`[Webhook Executed] ${method} ${url}`, payloadString);
        
        // Em um cenário real adicionaríamos "await fetch(url, { ... })" e try/catch
      }
      return { advance: true, nextNodeId };
    }

    if (node.type === 'condition_opened') {
        const windowDays = node.config?.windowDays || 3;
        const msWindow = windowDays * 24 * 60 * 60 * 1000;
        
        // Find if any campaign for this company that was sent since entryTime was opened
        const hasOpened = this.storageService.campaigns().some(c => 
            c.companyId === state.companyId && c.opened && c.sentDate && c.sentDate >= state.entryTime
        );
        
        if (hasOpened) {
            // Evaluated to YES
            const next = node.yesBranch && node.yesBranch.length > 0 ? node.yesBranch[0].id : nextNodeId;
            return { advance: true, nextNodeId: next };
        } else if (timeNow >= state.lastActionTime + msWindow) {
            // Window expired, evaluate to NO
            const next = node.noBranch && node.noBranch.length > 0 ? node.noBranch[0].id : nextNodeId;
            return { advance: true, nextNodeId: next };
        } else {
            // Still waiting
            return { advance: false };
        }
    }

    if (node.type === 'condition_clicked') {
        const windowDays = node.config?.windowDays || 3;
        const msWindow = windowDays * 24 * 60 * 60 * 1000;
        
        const hasClicked = this.storageService.campaigns().some(c => 
            c.companyId === state.companyId && c.clicked && c.sentDate && c.sentDate >= state.entryTime
        );
        
        if (hasClicked) {
            // Evaluated to YES
            const next = node.yesBranch && node.yesBranch.length > 0 ? node.yesBranch[0].id : nextNodeId;
            return { advance: true, nextNodeId: next };
        } else if (timeNow >= state.lastActionTime + msWindow) {
            // Window expired, evaluate to NO
            const next = node.noBranch && node.noBranch.length > 0 ? node.noBranch[0].id : nextNodeId;
            return { advance: true, nextNodeId: next };
        } else {
            // Still waiting
            return { advance: false };
        }
    }

    if (node.type === 'action_update_contact') {
        const company = this.storageService.savedCompanies().find(c => c.id === state.companyId);
        if (company) {
            const updated = { ...company, ...node.config?.fields };
            this.storageService.saveCompanies(this.storageService.savedCompanies().map(c => c.id === company.id ? updated : c));
        }
        return { advance: true, nextNodeId };
    }

    if (node.type === 'action_add_tag') {
        const company = this.storageService.savedCompanies().find(c => c.id === state.companyId);
        if (company) {
            const tags = Array.from(new Set([...(company.tags || []), node.config?.tag]));
            const updated = { ...company, tags };
            this.storageService.saveCompanies(this.storageService.savedCompanies().map(c => c.id === company.id ? updated : c));
        }
        return { advance: true, nextNodeId };
    }

    if (node.type === 'action_remove_tag') {
        const company = this.storageService.savedCompanies().find(c => c.id === state.companyId);
        if (company) {
            const tags = (company.tags || []).filter(t => t !== node.config?.tag);
            const updated = { ...company, tags };
            this.storageService.saveCompanies(this.storageService.savedCompanies().map(c => c.id === company.id ? updated : c));
        }
        return { advance: true, nextNodeId };
    }

    if (node.type === 'action_notify_admin') {
        this.storageService.addNotification(
            node.config?.title || 'Alerta de Automação',
            this.replaceVariables(node.config?.message || 'O contacto atingiu este passo.', 
            this.storageService.savedCompanies().find(c => c.id === state.companyId)!),
            node.config?.status || 'info', 
            'medium'
        );
        return { advance: true, nextNodeId };
    }

    if (node.type === 'condition_attribute') {
        const company = this.storageService.savedCompanies().find(c => c.id === state.companyId);
        if (!company) return { advance: true, nextNodeId };

        const field = node.config?.field as keyof Company;
        const operator = node.config?.operator || 'equals';
        const expected = node.config?.value;
        const actual = company[field];

        let matches = false;
        if (operator === 'equals') matches = actual == expected;
        if (operator === 'contains') matches = String(actual).toLowerCase().includes(String(expected).toLowerCase());
        if (operator === 'not_equals') matches = actual != expected;

        const next = matches ? 
            (node.yesBranch && node.yesBranch.length > 0 ? node.yesBranch[0].id : nextNodeId) :
            (node.noBranch && node.noBranch.length > 0 ? node.noBranch[0].id : nextNodeId);
        
        return { advance: true, nextNodeId: next };
    }
    
    // Fallback pass-through
    return { advance: true, nextNodeId };
  }
  
  private replaceVariables(text: string, company: Company): string {
      let result = text;
      // Support multiple formats: {{name}}, {{companyName}}, {{sector}}, {{province}}, {{address}}, {{email}}
      const vars = {
        name: company.name || '',
        companyName: company.name || '',
        sector: company.sector || '',
        province: company.province || '',
        address: company.address || '',
        email: (company.emails && company.emails.length > 0) ? company.emails[0] : ''
      };

      for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        result = result.replace(regex, value);
      }
      
      // Legacy support for nome_empresa (used in some parts of the app)
      result = result.replace(/\{\{\s*nome_empresa\s*\}\}/gi, company.name || '');
      
      return result;
  }
  
  private async executeActionEmail(company: Company, targetEmail: string, subject: string, body: string, wfId: string) {
    const emailSettings = this.storageService.emailSettings();
    
    // Handle missing settings explicitly
    if (!emailSettings || !emailSettings.fromEmail || !emailSettings.provider) {
        this.updateWorkflowStats(wfId, 'waiting', -1);
        this.storageService.addNotification(
          'Falha na Automação', 
          `O fluxo tentou enviar um email para ${company.name}, mas as configurações de envio não estão completas.`, 
          'error'
        );
        return;
    }
    
    // Anti-spam best practices
    const antiSpamFooter = `\n\n--\nPara não receber mais emails, cancele aqui: https://app.angocontacts.com/unsubscribe?hash=${crypto.randomUUID()}`;
    const finalBody = body + (body.includes('unsubscribe') ? '' : antiSpamFooter);

    const campaign: EmailCampaign = {
        id: crypto.randomUUID(),
        companyId: company.id,
        companyName: company.name,
        targetEmail: targetEmail,
        subject: subject,
        body: finalBody,
        status: 'draft',
        type: 'automated',
        tone: 'Profissional'
    };
    this.storageService.addCampaign(campaign);
    
    try {
        // Rate limiting simulator
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
        
        await this.emailService.sendEmail(emailSettings, {
            to: targetEmail,
            subject: subject,
            body: finalBody
        });
        
        this.storageService.updateCampaignStatus(campaign.id, 'sent', 'sentDate', Date.now());
        this.updateWorkflowStats(wfId, 'sent');
        this.logWorkflowEvent(wfId, company.name, 'Email enviado com sucesso (Assunto: ' + subject + ')', 'success');
        
    } catch (err: unknown) {
        this.storageService.updateCampaignStatus(campaign.id, 'failed');
        this.updateWorkflowStats(wfId, 'waiting', -1);
        const errorMsg = (err as Error).message || JSON.stringify(err);
        this.logWorkflowEvent(wfId, company.name, 'Falha no envio de email: ' + errorMsg, 'error');
        this.storageService.addNotification('Erro de API', `Falha ao enviar para ${targetEmail}. Verifique as suas chaves de API.`, 'error');
        console.error('Action Email failed:', err);
        throw err; // Re-throw to evaluateNode
    }
  }

  private decrementEmailsWaiting(wfId: string) {
       this.updateWorkflowStats(wfId, 'waiting', -1);
  }
}
