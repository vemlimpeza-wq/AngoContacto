import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Company } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  async searchCompanies(query: string, province?: string, sector?: string, email?: string): Promise<Company[]> {
    const fullQuery = `Realize uma pesquisa focada para encontrar empresas em Angola que correspondam a: "${query}". ${province ? `Província: ${province}.` : ''} ${sector ? `Setor: ${sector}.` : ''} ${email ? `Email de contacto: ${email}.` : ''}
    Retorne uma lista com cerca de 10 a 15 resultados de empresas reais.
    Para cada empresa, forneça: nome oficial, pelo menos 2 emails válidos (se possível), telefone fixo, telemóvel, endereço físico real e completo, link direto para localização no Google Maps, website oficial, redes sociais e uma mini-descrição.
    Use o Google Search para encontrar resultados relevantes e atualizados.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: fullQuery,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
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

      const text = response.text || '[]';
      let companies: Company[] = [];
      
      try {
        companies = JSON.parse(text);
      } catch (parseError) {
        console.warn('Incomplete JSON response, attempting to recover...', parseError);
        let recovered = false;
        // Try to fix the JSON by finding the last valid object end and closing the array
        const endingsToTry = [']', '}]', '}]}', '"}', '"]}'];
        
        for (let i = text.length - 1; i >= Math.max(0, text.length - 500); i--) {
          const substr = text.substring(0, i);
          for (const ending of endingsToTry) {
            try {
              companies = JSON.parse(substr + ending);
              recovered = true;
              console.log(`Successfully recovered ${companies.length} items from partial JSON.`);
              break;
            } catch {
              // Continue trying
            }
          }
          if (recovered) break;
        }

        if (!recovered) {
          console.error('Failed to recover partial JSON');
          throw new Error('Falha ao processar a resposta da IA. Por favor, tente novamente.');
        }
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      return companies.map((c: Company) => {
        const validEmails = (c.emails || []).filter(e => emailRegex.test(e));
        return {
          ...c,
          emails: validEmails,
          id: crypto.randomUUID(),
          category: query
        };
      });
    } catch (e: unknown) {
      console.error('Error in searchCompanies:', e);
      throw e;
    }
  }

  async generateProspectingEmail(
    company: Company,
    objective: string,
    senderName: string,
    senderCompany: string,
    senderWebsite: string,
    type: string,
    tone: string,
    primaryColor = '#0A192F',
    secondaryColor = '#F8FAFC'
  ): Promise<{ subject: string; body: string }> {
    const prompt = `
    Atue como um especialista em vendas B2B e copywriting.
    Sua tarefa é escrever um email de prospecção altamente personalizado e persuasivo.

    DADOS DO REMETENTE:
    - Nome: ${senderName || '[Seu Nome]'}
    - Empresa: ${senderCompany || '[Sua Empresa]'}
    - Website: ${senderWebsite || ''}
    - Objetivo: ${objective || 'Apresentar nossos serviços e agendar uma reunião.'}

    DADOS DO DESTINATÁRIO:
    - Empresa Alvo: ${company.name}
    - Setor: ${company.sector || 'Geral'}
    - Localização: ${company.province || 'Angola'}
    - Descrição da Empresa: ${company.description || ''}

    CONFIGURAÇÕES DO EMAIL:
    - Tipo de Email: ${type} (ex: Prospecção fria, Apresentação, Follow-up, Proposta)
    - Tom de Voz: ${tone} (ex: Formal, Direto, Amigável, Persuasivo)
    - Idioma: Português de Portugal/Angola (formal e profissional)
    - Cor Primária: ${primaryColor}
    - Cor Secundária: ${secondaryColor}

    INSTRUÇÕES:
    1. Crie um Assunto (Subject) chamativo, curto e que gere curiosidade ou valor.
    2. O corpo do email (Body) deve ser personalizado, mencionando a empresa alvo e o seu setor.
    3. Foque nos problemas comuns do setor e como o "Objetivo" do remetente resolve isso.
    4. Inclua uma Chamada para Ação (CTA) clara no final (ex: agendar uma breve chamada).
    5. O email deve ser formatado em HTML limpo, moderno e responsivo.
    6. Utilize a Cor Primária (${primaryColor}) para elementos de destaque (ex: títulos, botões de CTA, links, bordas) e a Cor Secundária (${secondaryColor}) para fundos de secções ou detalhes subtis.
    7. Inclua estilos CSS inline no HTML para garantir compatibilidade com clientes de email.
    8. Não inclua placeholders genéricos se tiver os dados, mas use [Nome do Responsável] se não souber a quem se dirigir.

    Retorne APENAS um objeto JSON válido com as propriedades "subject" e "body" (onde "body" contém o código HTML gerado).
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING, description: 'Assunto do email' },
              body: { type: Type.STRING, description: 'Corpo do email com quebras de linha' }
            },
            required: ['subject', 'body']
          }
        }
      });

      const text = response.text || '{}';
      return JSON.parse(text);
    } catch (e: unknown) {
      console.error('Error generating email:', e);
      throw new Error('Falha ao gerar o email. Verifique a sua ligação ou tente novamente.');
    }
  }

  async generateEmailSequence(
    company: Company,
    objective: string,
    senderName: string,
    senderCompany: string,
    senderWebsite: string,
    tone: string,
    primaryColor = '#0A192F',
    secondaryColor = '#F8FAFC'
  ): Promise<Array<{ subject: string; body: string; delayDays: number }>> {
    const prompt = `
    Atue como um especialista em vendas B2B e copywriting.
    Sua tarefa é escrever uma SEQUÊNCIA DE 5 EMAILS de prospecção altamente personalizados e persuasivos.

    DADOS DO REMETENTE:
    - Nome: ${senderName || '[Seu Nome]'}
    - Empresa: ${senderCompany || '[Sua Empresa]'}
    - Website: ${senderWebsite || ''}
    - Objetivo: ${objective || 'Apresentar nossos serviços e agendar uma reunião.'}

    DADOS DO DESTINATÁRIO:
    - Empresa Alvo: ${company.name}
    - Setor: ${company.sector || 'Geral'}
    - Localização: ${company.province || 'Angola'}
    - Descrição da Empresa: ${company.description || ''}

    CONFIGURAÇÕES DA SEQUÊNCIA:
    - Tom de Voz: ${tone} (ex: Formal, Direto, Amigável, Persuasivo)
    - Idioma: Português de Portugal/Angola (formal e profissional)
    - Cor Primária: ${primaryColor}
    - Cor Secundária: ${secondaryColor}

    ESTRUTURA DA SEQUÊNCIA:
    - Email 1 (Dia 0): Apresentação inicial e proposta de valor.
    - Email 2 (Dia 3): Follow-up focado num problema específico do setor.
    - Email 3 (Dia 7): Partilha de um caso de sucesso ou insight valioso.
    - Email 4 (Dia 14): Follow-up curto, perguntando se é a pessoa certa.
    - Email 5 (Dia 21): "Break-up email" (última tentativa, deixando a porta aberta).

    INSTRUÇÕES PARA CADA EMAIL:
    1. Crie um Assunto (Subject) chamativo.
    2. O corpo do email (Body) deve ser formatado em HTML limpo, moderno e responsivo.
    3. Utilize a Cor Primária (${primaryColor}) para elementos de destaque e a Cor Secundária (${secondaryColor}) para fundos.
    4. Inclua estilos CSS inline no HTML.

    Retorne APENAS um array JSON válido onde cada objeto tem as propriedades "subject", "body" (HTML) e "delayDays" (0, 3, 7, 14, 21).
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                body: { type: Type.STRING },
                delayDays: { type: Type.NUMBER }
              },
              required: ['subject', 'body', 'delayDays']
            }
          }
        }
      });

      const text = response.text || '[]';
      return JSON.parse(text);
    } catch (e: unknown) {
      console.error('Error generating email sequence:', e);
      throw new Error('Falha ao gerar a sequência de emails. Verifique a sua ligação ou tente novamente.');
    }
  }
}
