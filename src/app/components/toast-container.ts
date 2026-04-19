import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { StorageService } from '../services/storage.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      @if (storageService.activeToast(); as toast) {
        <div 
          class="flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border pointer-events-auto animate-in slide-in-from-right duration-300 min-w-[300px]"
          [ngClass]="{
            'bg-emerald-50 border-emerald-200 text-emerald-800': toast.type === 'success',
            'bg-rose-50 border-rose-200 text-rose-800': toast.type === 'error',
            'bg-blue-50 border-blue-200 text-blue-800': toast.type === 'info'
          }"
        >
          <div class="flex-shrink-0">
            @if (toast.type === 'success') {
              <mat-icon class="text-emerald-500">check_circle</mat-icon>
            } @else if (toast.type === 'error') {
              <mat-icon class="text-rose-500">error</mat-icon>
            } @else {
              <mat-icon class="text-blue-500">info</mat-icon>
            }
          </div>
          <p class="text-sm font-medium pr-8">{{ toast.message }}</p>
          <button 
            (click)="storageService.dismissToast(toast.id)"
            class="ml-auto hover:opacity-70 transition-opacity p-1"
          >
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>
      }
    </div>
  `
})
export class ToastContainer {
  public storageService = inject(StorageService);
}
