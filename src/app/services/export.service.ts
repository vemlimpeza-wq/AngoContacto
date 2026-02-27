import { Injectable } from '@angular/core';
import { Company } from '../models/company.model';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private getEmailHeaders(maxEmails: number): string[] {
    const count = Math.max(1, maxEmails);
    const headers = [];
    for (let i = 0; i < count; i++) {
      if (i === 0) headers.push('EMAIL');
      else headers.push(`EMAIL_${String.fromCharCode(64 + i)}`);
    }
    return headers;
  }

  private sortCompanies(companies: Company[]): Company[] {
    return [...companies].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  private generateExtId(index: number): string {
    return String(index + 1).padStart(4, '0');
  }

  exportToCSV(companies: Company[], filename = 'angocontacts_export.csv') {
    const sortedCompanies = this.sortCompanies(companies);
    const csvRows = [];
    const maxEmails = Math.max(...sortedCompanies.map(c => c.emails?.length || 0), 1);
    const emailHeaders = this.getEmailHeaders(maxEmails);
    
    const headers = ['EXT_ID', 'Nome', ...emailHeaders, 'Telefone Fixo', 'Telemóvel', 'Endereço', 'Google Maps', 'Website', 'Setor', 'Província', 'Descrição'];
    csvRows.push(headers.join(','));

    sortedCompanies.forEach((company, index) => {
      const emailValues = [];
      for (let i = 0; i < maxEmails; i++) {
        emailValues.push(this.escapeCSV(company.emails?.[i] || ''));
      }

      const row = [
        this.escapeCSV(this.generateExtId(index)),
        this.escapeCSV(company.name),
        ...emailValues,
        this.escapeCSV(company.landlinePhone || ''),
        this.escapeCSV(company.mobilePhone || ''),
        this.escapeCSV(company.address),
        this.escapeCSV(company.googleMapsLink || ''),
        this.escapeCSV(company.website || ''),
        this.escapeCSV(company.sector),
        this.escapeCSV(company.province),
        this.escapeCSV(company.description)
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportToExcel(companies: Company[], filename = 'angocontacts_export.xlsx') {
    const sortedCompanies = this.sortCompanies(companies);
    const maxEmails = Math.max(...sortedCompanies.map(c => c.emails?.length || 0), 1);
    const emailHeaders = this.getEmailHeaders(maxEmails);

    const data = sortedCompanies.map((c, index) => {
      const row: any = {
        EXT_ID: this.generateExtId(index),
        Nome: c.name,
      };
      
      for (let i = 0; i < maxEmails; i++) {
        row[emailHeaders[i]] = c.emails?.[i] || '';
      }

      row['Telefone Fixo'] = c.landlinePhone || '';
      row['Telemóvel'] = c.mobilePhone || '';
      row['Endereço'] = c.address;
      row['Google Maps'] = c.googleMapsLink || '';
      row['Website'] = c.website || '';
      row['Setor'] = c.sector;
      row['Província'] = c.province;
      row['Descrição'] = c.description;

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contactos');
    XLSX.writeFile(workbook, filename);
  }

  exportToPDF(companies: Company[], filename = 'angocontacts_export.pdf') {
    const sortedCompanies = this.sortCompanies(companies);
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('AngoContacts Pro - Exportação de Contactos', 14, 22);
    
    const tableData = sortedCompanies.map((c, index) => [
      this.generateExtId(index),
      c.name,
      c.emails.join('\n'),
      `${c.landlinePhone || ''}\n${c.mobilePhone || ''}`.trim(),
      c.address,
      c.sector
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['EXT_ID', 'Nome', 'Emails', 'Telefones', 'Endereço', 'Setor']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] } // Slate 900
    });

    doc.save(filename);
  }

  private escapeCSV(value: string): string {
    if (!value) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }
}
