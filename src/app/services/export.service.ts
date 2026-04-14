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
    return [...companies].sort((a, b) => {
      const provA = (a.province || 'Desconhecida').toLowerCase();
      const provB = (b.province || 'Desconhecida').toLowerCase();
      if (provA !== provB) return provA.localeCompare(provB);

      const catA = (a.category || 'Geral').toLowerCase();
      const catB = (b.category || 'Geral').toLowerCase();
      if (catA !== catB) return catA.localeCompare(catB);

      return (a.name || '').localeCompare(b.name || '');
    });
  }

  private generateExtId(index: number): string {
    return String(index + 1).padStart(4, '0');
  }

  exportToCSV(companies: Company[], filename = 'angocontacts_export.csv') {
    const sortedCompanies = this.sortCompanies(companies);
    const csvRows = [];
    const maxEmails = Math.max(...sortedCompanies.map(c => c.emails?.length || 0), 1);
    const emailHeaders = this.getEmailHeaders(maxEmails);
    
    const headers = ['EXT_ID', 'Tipo de Pesquisa', 'Nome', ...emailHeaders, 'Telefone Fixo', 'Telemóvel', 'Endereço', 'Google Maps', 'Website', 'Setor', 'Província', 'Descrição'];
    csvRows.push(headers.join(','));

    sortedCompanies.forEach((company, index) => {
      const emailValues = [];
      for (let i = 0; i < maxEmails; i++) {
        emailValues.push(this.escapeCSV(company.emails?.[i] || ''));
      }

      const row = [
        this.escapeCSV(this.generateExtId(index)),
        this.escapeCSV(company.category || 'Geral'),
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
      const row: Record<string, string> = {
        EXT_ID: this.generateExtId(index),
        'Tipo de Pesquisa': c.category || 'Geral',
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
    const doc = new jsPDF('l'); // Landscape orientation
    
    doc.setFontSize(18);
    doc.text('AngoContacts Pro - Exportação de Contactos', 14, 22);
    
    const groupedByProvince = sortedCompanies.reduce((acc, company, index) => {
      const prov = company.province || 'Desconhecida';
      if (!acc[prov]) acc[prov] = [];
      acc[prov].push({ company, extId: this.generateExtId(index) });
      return acc;
    }, {} as Record<string, { company: Company, extId: string }[]>);

    let currentY = 30;
    const pageHeight = doc.internal.pageSize.height || 210;

    Object.keys(groupedByProvince).forEach((province) => {
      if (currentY > pageHeight - 30) {
        doc.addPage();
        currentY = 20;
      }

      const provData = groupedByProvince[province];

      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(`Província: ${province}`, 14, currentY);
      currentY += 6;

      const tableData = provData.map(({ company: c, extId }) => {
        const phones = [c.landlinePhone, c.mobilePhone].filter(p => !!p).join('\n');
        const emails = (c.emails || []).filter(e => !!e).join('\n');
        return [
          extId,
          c.category || 'Geral',
          c.name,
          emails,
          phones,
          c.address,
          c.sector,
          c.description || ''
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['ID', 'Pesquisa', 'Nome', 'Emails', 'Telefones', 'Endereço', 'Setor', 'Descrição']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 22 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 25 },
          5: { cellWidth: 35 },
          6: { cellWidth: 22 },
          7: { cellWidth: 'auto' }
        },
        headStyles: { fillColor: [15, 23, 42] }
      });

      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
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
