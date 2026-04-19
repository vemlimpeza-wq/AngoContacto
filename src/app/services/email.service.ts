import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EmailSettings } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class EmailService {
  private http = inject(HttpClient);

  async sendEmail(settings: EmailSettings, email: { to: string; subject: string; body: string }): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; error?: string }>('/api/send-email', { settings, email })
      );
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to send email');
      }
    } catch (error: unknown) {
      console.error('Email sending error:', error);
      const msg = error instanceof Error ? error.message : (error as { error?: { error?: string } })?.error?.error || 'Failed to send email via API';
      throw new Error(msg);
    }
  }
}
