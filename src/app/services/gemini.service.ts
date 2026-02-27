import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Company } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  async searchCompanies(query: string, province?: string, sector?: string, email?: string): Promise<Company[]> {
    const fullQuery = `Realize uma pesquisa exaustiva e procure pelo máximo de empresas possíveis em Angola que correspondam a: ${query}. ${province ? `Província: ${province}.` : ''} ${sector ? `Setor: ${sector}.` : ''} ${email ? `Email de contacto: ${email}.` : ''}
    Retorne uma lista extensa (pelo menos 15 a 30 resultados, se existirem) de empresas com o nome oficial, pelo menos 2 emails válidos (se possível), telefone fixo, telemóvel, endereço físico real e completo, link direto para localização no Google Maps, website oficial, redes sociais e uma mini-descrição.
    Use o Google Search extensivamente para encontrar informações atualizadas e o maior número de resultados relevantes.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: fullQuery,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Nome oficial da empresa' },
              logoUrl: { type: Type.STRING, description: 'URL do logotipo da empresa (se encontrado)' },
              emails: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Mínimo de 2 emails válidos' },
              landlinePhone: { type: Type.STRING, description: 'Telefone fixo' },
              mobilePhone: { type: Type.STRING, description: 'Telemóvel de gestor, administrativo ou contacto corporativo' },
              address: { type: Type.STRING, description: 'Endereço físico real e completo' },
              googleMapsLink: { type: Type.STRING, description: 'Link direto para localização no Google Maps' },
              website: { type: Type.STRING, description: 'Website oficial' },
              socialMedia: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    platform: { type: Type.STRING },
                    url: { type: Type.STRING }
                  }
                },
                description: 'Redes sociais'
              },
              description: { type: Type.STRING, description: 'Mini-descrição gerada pela IA' },
              sector: { type: Type.STRING, description: 'Setor de atividade' },
              province: { type: Type.STRING, description: 'Província em Angola' }
            },
            required: ['name', 'emails', 'address', 'description', 'sector', 'province']
          }
        }
      }
    });

    try {
      const text = response.text || '[]';
      const companies = JSON.parse(text);
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      return companies.map((c: Company) => {
        const validEmails = (c.emails || []).filter(e => emailRegex.test(e));
        return {
          ...c,
          emails: validEmails,
          id: crypto.randomUUID()
        };
      });
    } catch (e) {
      console.error('Error parsing Gemini response', e);
      return [];
    }
  }
}
